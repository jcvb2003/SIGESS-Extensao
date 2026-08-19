import { AppSettings, EsocialCompetenciaPlanejada, GovBatchCompetenciaResult } from "../../shared/types";
import { logger } from "../../shared/services/logger";
import { Utils } from "../../shared/utils/dom-helpers";
import { directConsultationNavigation, isEsocialHomePage, isListarPagamentosPage } from "./automation/navigation-director";
import {
  hydrateEsocialProgressOverlay,
  clearEsocialProgressOverlay,
  reportBatchStatus,
} from "./automation/overlay-ui";
import { observarBotaoEmitirGuia } from "./automation/guide-download";
import {
  executarFluxoDirectoFromHome,
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
  competenciasResultados?: GovBatchCompetenciaResult[];
};


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

  if (!settings.gerarGps || (!isEsocialHomePage() && !isListarPagamentosPage())) {
    clearEsocialProgressOverlay();
    return;
  }

  const effectiveSettings = await resolveESocialSettingsForCurrentTab(settings);

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
      competenciasResultados: context.competenciasResultados ?? settings.competenciasResultados,
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
  if (await directConsultationNavigation(settings)) return;

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
    competenciasResultados: ctx.competenciasResultados,
  } as AppSettings;
  await start(settings);
}

void init();
