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
} from "./automation/gps-flow";
import { esocialMessages } from "./utils/status-messages";

const browserAPI =
  typeof browser !== "undefined" ? browser : (window as any).chrome;

function isHomePage(): boolean {
  return (
    window.location.href.includes("Home/Inicial") ||
    window.location.href.includes("tipoEmpregador=EMPREGADOR_DOMESTICO")
  );
}

async function executarFluxoGpsSeNecessario(settings: AppSettings) {
  if (!settings.gerarGps || !isHomePage()) {
    clearEsocialProgressOverlay();
    return;
  }

  const competencia = buildCompetenciaFromSettings(settings);
  if (!competencia || !acquireGpsFlowLock(competencia)) {
    clearEsocialProgressOverlay();
    return;
  }

  try {
    await executarFluxoDirectoFromHome(settings);
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
