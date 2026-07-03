import { AppSettings } from "../../shared/types";
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
};

const CONSULTAR_REDIR_KEY = "sigess_last_redir_guias";
const COMPETENCIAS_URL = "https://www.esocial.gov.br/portal/FolhaPagamento/Listagem/Competencias";

function isHomePage(): boolean {
  return (
    window.location.href.includes("Home/Inicial") ||
    window.location.href.includes("tipoEmpregador=EMPREGADOR_DOMESTICO")
  );
}

function redirecionarParaConsulta(settings: AppSettings) {
  if (!settings.consultarGuias || !isHomePage()) return;
  const yearStr = settings.selectedYear || "current";
  if (sessionStorage.getItem(CONSULTAR_REDIR_KEY) === yearStr) return;
  sessionStorage.setItem(CONSULTAR_REDIR_KEY, yearStr);
  window.location.href = COMPETENCIAS_URL;
}

async function automatizarCompetencias(settings: AppSettings) {
  if (!window.location.href.includes("FolhaPagamento/Listagem/Competencias")) return;
  if (!settings.consultarGuias) return;

  const yearStr = settings.selectedYear || "current";
  if (yearStr === "current") return;

  const select = await Utils.waitForElement("#AnoFiltrado", 15000, document, false) as HTMLSelectElement | null;
  if (!select || select.value === yearStr) return;

  select.value = yearStr;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  const btn = await Utils.waitForElement("#btnFiltro", 5000, document, false);
  if (btn) Utils.simulateClick(btn as HTMLElement);
}

async function executarFluxoGpsSeNecessario(settings: AppSettings) {
  if (await resumePendingGpsFlow()) {
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
    };
  } catch (error) {
    console.debug("[SIGESS] Falha ao obter contexto da automacao do eSocial para a aba atual:", error);
    return settings;
  }
}

function start(settings: AppSettings) {
  if (settings.gerarGps) {
    hydrateEsocialProgressOverlay();
  } else {
    clearEsocialProgressOverlay();
  }

  observarBotaoEmitirGuia();
  redirecionarParaConsulta(settings);

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
  } as AppSettings;
  start(settings);
}

void init();
