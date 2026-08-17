import { AppSettings, EsocialCompetenciaPlanejada } from "../../shared/types";
import { logger } from "../../shared/services/logger";
import { Utils } from "../../shared/utils/dom-helpers";
import {
  hydrateEsocialProgressOverlay,
  clearEsocialProgressOverlay,
  reportBatchStatus,
} from "./automation/overlay-ui";
import { observarBotaoEmitirGuia } from "./automation/guide-download";
import {
  executarFluxoDirectoFromHome,
  buildCompetenciaFromSettings,
  acquireGpsFlowLock,
  releaseGpsFlowLock,
  resumePendingGpsFlow,
} from "./automation/gps-flow";
import { consultarCompetenciasDaPagina } from "./automation/consulta-flow";
import { esocialMessages } from "./utils/status-messages";

const browserAPI =
  typeof browser !== "undefined" ? browser : (window as any).chrome;

type ESocialAutomationContext = {
  isBatchTab?: boolean;
  gerarGps?: boolean;
  consultarGuias?: boolean;
  selectedYear?: string;
  selectedMonth?: string;
  competencia?: string;
  valorComercializado?: string;
  competencias?: EsocialCompetenciaPlanejada[];
};

const CONSULTAR_REDIR_KEY = "sigess_last_redir_guias";
const LISTAR_PAGAMENTOS_URL = "https://www.esocial.gov.br/portal/FolhaPagamento/Listagem/ListarPagamentos";
const COMPETENCIAS_URL = "https://www.esocial.gov.br/portal/FolhaPagamento/Listagem/Competencias";

function isHomePage(): boolean {
  return (
    window.location.href.includes("Home/Inicial") ||
    window.location.href.includes("tipoEmpregador=EMPREGADOR_DOMESTICO")
  );
}

function isListarPagamentosPage(): boolean {
  return window.location.href.includes("FolhaPagamento/Listagem/ListarPagamentos");
}

async function waitForListarPagamentosReady(): Promise<void> {
  if (document.readyState === "loading") {
    await new Promise<void>((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
  }

  await Utils.waitForElement("body", 15000, document, false);
  // The route establishes server-side page context during its normal render.
  // Give that lifecycle a short settling window before opening Competencias.
  await new Promise((resolve) => window.setTimeout(resolve, 750));
}

async function redirecionarParaConsulta(settings: AppSettings): Promise<boolean> {
  if (!settings.consultarGuias) return false;
  const yearStr = settings.selectedYear || "current";

  if (isHomePage()) {
    if (sessionStorage.getItem(CONSULTAR_REDIR_KEY) === `${yearStr}:competencias`) return false;
    sessionStorage.setItem(CONSULTAR_REDIR_KEY, `${yearStr}:listar`);
    console.debug("[SIGESS] Abrindo ListarPagamentos antes da consulta de competências");
    window.location.href = LISTAR_PAGAMENTOS_URL;
    return true;
  }

  if (!isListarPagamentosPage()) return false;
  if (sessionStorage.getItem(CONSULTAR_REDIR_KEY) !== `${yearStr}:listar`) return false;

  await waitForListarPagamentosReady();
  sessionStorage.setItem(CONSULTAR_REDIR_KEY, `${yearStr}:competencias`);
  console.debug("[SIGESS] ListarPagamentos pronto; abrindo consulta de competências");
  window.location.href = COMPETENCIAS_URL;
  return true;
}

async function automatizarCompetencias(settings: AppSettings) {
  if (!window.location.href.includes("FolhaPagamento/Listagem/Competencias")) return;
  if (!settings.consultarGuias) return;

  const yearStr = settings.selectedYear || "current";
  const select = await Utils.waitForElement("#AnoFiltrado", 15000, document, false) as HTMLSelectElement | null;
  if (!select) return;

  const targetYear = /^\d{4}$/.test(yearStr) ? yearStr : select.value;
  if (targetYear && select.value !== targetYear) {
    const filterMsg = esocialMessages.applyingYearFilter(targetYear);
    reportBatchStatus(filterMsg.status, filterMsg.title, filterMsg.description);

    select.value = targetYear;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const btn = await Utils.waitForElement("#btnFiltro", 5000, document, false);
    if (btn) {
      Utils.simulateClick(btn as HTMLElement);
    }
    return;
  }

  try {
    const consultas = await consultarCompetenciasDaPagina(targetYear);
    reportBatchStatus(
      "concluido",
      "Competências consultadas",
      `${consultas.length} competência(s) retornada(s) para ${targetYear}.`,
      {
        consultas,
        loginConcluido: true,
      },
    );
  } catch (error) {
    const lastError = error instanceof Error ? error.message : String(error);
    reportBatchStatus(
      "erro",
      "Falha na consulta de competências",
      "Não foi possível extrair os dados da tabela do eSocial.",
      { lastError },
    );
  }
}

async function executarFluxoGpsSeNecessario(settings: AppSettings) {
  if (await resumePendingGpsFlow(settings)) {
    return;
  }

  if (!settings.gerarGps || !isHomePage()) {
    clearEsocialProgressOverlay();
    return;
  }

  const effectiveSettings = await resolveESocialSettingsForCurrentTab(settings);

  const competencia = buildCompetenciaFromSettings(effectiveSettings);
  if (!competencia || !acquireGpsFlowLock(competencia)) {
    clearEsocialProgressOverlay();
    return;
  }

  try {
    await executarFluxoDirectoFromHome(effectiveSettings);
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

async function resolveESocialSettingsForCurrentTab(settings: AppSettings): Promise<AppSettings> {
  try {
    const response = await browserAPI.runtime.sendMessage({
      action: "getESocialAutomationContext",
    });

    if (!response?.success || !response.data) {
      return settings;
    }

    const context = response.data as ESocialAutomationContext;
    return {
      ...settings,
      gerarGps: context.gerarGps ?? settings.gerarGps,
      selectedYear: context.selectedYear || settings.selectedYear,
      selectedMonth: context.selectedMonth || settings.selectedMonth,
      valorComercializado: context.valorComercializado ?? settings.valorComercializado,
      competencias: context.competencias ?? settings.competencias,
    };
  } catch (error) {
    console.debug("[SIGESS] Falha ao obter contexto da automacao do eSocial para a aba atual:", error);
    return settings;
  }
}

async function start(settings: AppSettings) {
  if (settings.gerarGps) {
    hydrateEsocialProgressOverlay();
  } else {
    clearEsocialProgressOverlay();
  }

  if (await resumePendingGpsFlow(settings)) {
    return;
  }

  observarBotaoEmitirGuia();
  if (await redirecionarParaConsulta(settings)) return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      automatizarCompetencias(settings);
      executarFluxoGpsSeNecessario(settings);
    });
  } else {
    automatizarCompetencias(settings);
    executarFluxoGpsSeNecessario(settings);
  }
}

async function init() {
  const response = await browserAPI.runtime.sendMessage({
    action: "getESocialAutomationContext",
  });

  if (!response?.success || !response.data?.isBatchTab) {
    return;
  }

  const ctx = response.data as ESocialAutomationContext;
  const settings = {
    gerarGps: ctx.gerarGps ?? false,
    consultarGuias: ctx.consultarGuias ?? false,
    selectedYear: ctx.selectedYear ?? "current",
    selectedMonth: ctx.selectedMonth ?? "",
    valorComercializado: ctx.valorComercializado ?? "",
    competencias: ctx.competencias,
  } as AppSettings;
  await start(settings);
}

void init();
