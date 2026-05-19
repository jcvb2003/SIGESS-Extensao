import { Utils } from "../../shared/utils/dom-helpers";
import { AppSettings } from "../../shared/types";
import { logger } from "../../shared/services/logger";
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
import { esocialMessages } from "./utils/status-messages";

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
      const msg = esocialMessages.redirectingToCompetencies();
      logger.info("eSocial", msg.title);
      reportBatchStatus(msg.status, msg.title, msg.description);
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

  const competenciesLoadedMsg = esocialMessages.competenciesLoaded();
  logger.info("eSocial", competenciesLoadedMsg.title);
  reportBatchStatus(competenciesLoadedMsg.status, competenciesLoadedMsg.title, competenciesLoadedMsg.description);

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
    const filterMsg = esocialMessages.applyingYearFilter(settings.selectedYear);
    logger.info("eSocial", filterMsg.title);
    reportBatchStatus(filterMsg.status, filterMsg.title, filterMsg.description);
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

  if (sessionStorage.getItem(`sigess_gps_flow_done_${competencia}`) === "true") {
    return;
  }

  const guiaExistente = await consultarGuiaExistente(competencia);
  if (guiaExistente.paga) {
    sessionStorage.setItem(`sigess_gps_flow_done_${competencia}`, "true");
    const existsMsg = esocialMessages.guideAlreadyExists(formatCompetencia(competencia));
    logger.info("eSocial", existsMsg.title);
    reportBatchStatus(existsMsg.status, existsMsg.title, existsMsg.description, { overlayState: null });
    return;
  }

  if (guiaExistente.emissaoUrl) {
    sessionStorage.setItem(`sigess_gps_flow_done_${competencia}`, "true");
    const issuedMsg = esocialMessages.guideAlreadyIssued(formatCompetencia(competencia));
    logger.info("eSocial", issuedMsg.title);
    reportBatchStatus(issuedMsg.status, issuedMsg.title, issuedMsg.description, { overlayState: null });
    await baixarGuiaPdfDirecto(guiaExistente.emissaoUrl, competencia);
    window.location.href = "https://www.esocial.gov.br/portal/FolhaPagamento/Listagem/Competencias";
    return;
  }

  if (!acquireGpsFlowLock(competencia)) {
    return;
  }

  try {
    const initMsg = esocialMessages.initializingGuideGeneration(formatCompetencia(competencia));
    logger.info("eSocial", initMsg.title);
    reportBatchStatus(initMsg.status, initMsg.title, initMsg.description, {
      progressStep: 2,
      progressTotal: 3,
      overlayState: {
        step: 2,
        total: 3,
        title: "Executando script no eSocial",
        description: `Gerando boleto de ${formatCompetencia(competencia)}...`,
      },
    });

    await executarFluxoDiretoGps(settings, competencia);
    sessionStorage.setItem(`sigess_gps_flow_done_${competencia}`, "true");
  } catch (error) {
    const failMsg = esocialMessages.failedToGenerateGuide();
    logger.error("eSocial", failMsg.title, { error: error instanceof Error ? error.message : String(error) });
    reportBatchStatus(failMsg.status, failMsg.title, failMsg.description, {
      lastError: error instanceof Error ? error.message : String(error),
      overlayState: null,
    });
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
