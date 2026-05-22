import { AppSettings } from "../../shared/types";
import { logger } from "../../shared/services/logger";
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
  gerarGps?: boolean;
  selectedYear?: string;
  selectedMonth?: string;
  competencia?: string;
  valorComercializado?: string;
};

function isHomePage(): boolean {
  return (
    window.location.href.includes("Home/Inicial") ||
    window.location.href.includes("tipoEmpregador=EMPREGADOR_DOMESTICO")
  );
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      executarFluxoGpsSeNecessario(settings);
    });
  } else {
    executarFluxoGpsSeNecessario(settings);
  }
}

browserAPI.storage.local.get(["sigessSettings"], (result: any) => {
  const settings = result.sigessSettings as AppSettings;
  if (settings) {
    start(settings);
  }
});

browserAPI.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
  if (message.action === "updateESocialSettings") {
    const settings = message.settings as AppSettings;
    start(settings);
    sendResponse({ success: true });
    return;
  }
  // Don't interfere with other messages
  return false;
});
