import { Utils } from "../../shared/utils/dom-helpers";
import { AppSettings } from "../../shared/types";
import {
  hydrateEsocialProgressOverlay,
  clearEsocialProgressOverlay,
  reportBatchStatus,
} from "./automation/overlay-ui";
import { observarBotaoEmitirGuia, baixarGuiaPdfDirecto } from "./automation/guide-download";
import {
  executarFluxoDiretoGps,
  acquireGpsFlowLock,
  releaseGpsFlowLock,
  consultarGuiaExistente,
  buildCompetenciaFromSettings,
} from "./automation/gps-flow";
import {
  extractCompetenciaFromUrl,
  extractCompetenciaFromDom,
} from "./utils/esocial-extractors";
import { formatCompetencia } from "./utils/file-naming";
import { MANUAL_GUIDE_DOWNLOAD_KEY } from "./utils/esocial-constants";

const browserAPI =
  typeof browser !== "undefined" ? browser : (window as any).chrome;

function isHomePage(): boolean {
  return (
    window.location.href.includes("Home/Inicial") ||
    window.location.href.includes("tipoEmpregador=EMPREGADOR_DOMESTICO")
  );
}

function processarConfiguracoes(settings: AppSettings, force = false) {
  const canRedirect = (key: string, value: string) => {
    if (force) return true;
    return sessionStorage.getItem(key) !== value;
  };

  if (!isHomePage()) return;

  if (settings.consultarGuias) {
    const yearStr = settings.selectedYear || "current";
    if (canRedirect("sigess_last_redir_guias", yearStr)) {
      reportBatchStatus(
        "processando",
        "Redirecionando para competencias",
        "O eSocial foi carregado e a extensao esta abrindo a listagem de competencias para consultar as guias.",
      );
      sessionStorage.setItem("sigess_last_redir_guias", yearStr);
      window.location.href =
        "https://www.esocial.gov.br/portal/FolhaPagamento/Listagem/Competencias";
    }
  }
}

async function automatizarCompetencias(settings: AppSettings) {
  if (!window.location.href.includes("FolhaPagamento/Listagem/Competencias")) {
    return;
  }

  reportBatchStatus(
    "processando",
    "Pagina de competencias carregada",
    "A listagem de competencias do eSocial foi aberta e a extensao esta verificando o filtro de ano.",
  );

  if (!settings.consultarGuias || settings.selectedYear === "current") {
    return;
  }

  const select = (await Utils.waitForElement(
    "#AnoFiltrado",
    15000,
    document,
    false,
  )) as HTMLSelectElement;

  if (select && select.value !== settings.selectedYear) {
    reportBatchStatus(
      "processando",
      "Aplicando filtro de ano",
      `A extensao esta ajustando o ano da competencia para ${settings.selectedYear}.`,
    );
    select.value = settings.selectedYear;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const btn = await Utils.waitForElement("#btnFiltro", 5000, document, false);
    if (btn) {
      Utils.simulateClick(btn as HTMLElement);
    }
  }
}

async function automatizarGPS(settings: AppSettings) {
  if (!settings.gerarGps) {
    clearEsocialProgressOverlay();
    return;
  }

  if (isManualGuideDownloadInProgress()) {
    return;
  }

  const competencia =
    extractCompetenciaFromUrl(window.location.href) ||
    extractCompetenciaFromDom() ||
    buildCompetenciaFromSettings(settings);

  if (!competencia) {
    return;
  }

  const guiaExistente = await consultarGuiaExistente(competencia);
  if (guiaExistente.paga) {
    sessionStorage.setItem(`sigess_gps_flow_done_${competencia}`, "true");
    reportBatchStatus(
      "ignorado",
      "Guia ja existente",
      `A competencia ${formatCompetencia(competencia)} ja possui guia/boleto com valor maior que zero. A extensao nao vai gerar novamente.`,
      { overlayState: null },
    );
    return;
  }

  if (guiaExistente.emissaoUrl) {
    sessionStorage.setItem(`sigess_gps_flow_done_${competencia}`, "true");
    reportBatchStatus(
      "processando",
      "Guia ja emitida",
      `A competencia ${formatCompetencia(competencia)} ja possui guia emitida. A extensao vai baixar o boleto existente sem fechar a folha novamente.`,
      { overlayState: null },
    );
    await baixarGuiaPdfDirecto(guiaExistente.emissaoUrl, competencia);
    return;
  }

  if (!acquireGpsFlowLock(competencia)) {
    return;
  }

  try {
    reportBatchStatus(
      "processando",
      "Iniciando geracao da guia",
      `A extensao esta executando o fluxo direto da competencia ${formatCompetencia(competencia)} sem depender da navegacao manual do portal.`,
      {
        progressStep: 2,
        progressTotal: 3,
        overlayState: {
          step: 2,
          total: 3,
          title: "Executando script no eSocial",
          description: `Gerando a guia da competencia ${formatCompetencia(competencia)}.`,
        },
      },
    );

    await executarFluxoDiretoGps(settings, competencia);
    sessionStorage.setItem(`sigess_gps_flow_done_${competencia}`, "true");
  } catch (error) {
    console.error("[SIGESS] Falha no fluxo direto da guia:", error);
    reportBatchStatus(
      "erro",
      "Falha no fluxo direto da guia",
      "A extensao nao conseguiu concluir a geracao automatica da guia pelo fluxo direto.",
      {
        lastError: error instanceof Error ? error.message : String(error),
        overlayState: null,
      },
    );
  } finally {
    releaseGpsFlowLock();
  }
}

function isManualGuideDownloadInProgress(): boolean {
  const expiresAt = Number(sessionStorage.getItem(MANUAL_GUIDE_DOWNLOAD_KEY) || 0);
  if (!expiresAt) return false;

  if (expiresAt <= Date.now()) {
    sessionStorage.removeItem(MANUAL_GUIDE_DOWNLOAD_KEY);
    return false;
  }

  return true;
}

function start(settings: AppSettings, force = false) {
  if (settings.gerarGps) {
    hydrateEsocialProgressOverlay();
  } else {
    clearEsocialProgressOverlay();
  }
  processarConfiguracoes(settings, force);
  observarBotaoEmitirGuia();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      automatizarCompetencias(settings);
      automatizarGPS(settings);
    });
  } else {
    automatizarCompetencias(settings);
    automatizarGPS(settings);
  }
}

browserAPI.storage.local.get(["sigessSettings"], (result: any) => {
  const settings = result.sigessSettings as AppSettings;
  if (settings) {
    start(settings, false);
  }
});

browserAPI.runtime.onMessage.addListener((message: any) => {
  if (message.action === "updateESocialSettings") {
    const settings = message.settings as AppSettings;
    start(settings, true);
  }
});
