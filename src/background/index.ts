import "../shared/utils/browser-shim";
import { TabManager } from "./services/tab-manager";
import { StorageService } from "./services/storage";
import { MessageRequest, MessageResponse } from "../shared/types";
import { routeMessage } from "./message-router";
import { BadgeManager } from "./services/badge-manager";
import { VersionChecker } from "./services/version-checker";
import { LicenseService } from "../shared/services/license";
import { RealtimeLicenseService } from "./services/realtime-license";
import { initializeCadastroPerformance } from "./services/cadastro-performance";

let tabManager: TabManager | null = null;

function getTabManager() {
  tabManager ??= new TabManager();
  return tabManager;
}

console.log("SIGESS Background Service Initialized");
initializeCadastroPerformance();
browser.runtime.onMessage.addListener(
  (
    message: MessageRequest,
    sender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    routeMessage(message, getTabManager, sender)
      .then((response) => {
        console.log("[SIGESS] Background: Enviando resposta", {
          action: message.action || (message as any).type,
          response,
        });
        sendResponse(response);
      })
      .catch((error) => {
        console.error("[SIGESS] Background: Erro em routeMessage", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  },
);

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    await getTabManager().handleTabUpdate(tabId, changeInfo, tab);
  } catch (e) {
    console.error("TabManager onUpdated error:", e);
  }

  const currentUrl = changeInfo.url || tab.url;
  if (!currentUrl?.includes("#")) return;
  try {
    const url = new URL(currentUrl);
    if (url.hash && url.hash.includes("cpf=") && url.hash.includes("senha=")) {
      const isProcessing = await StorageService.get(`processing_${tabId}`);
      if (isProcessing[`processing_${tabId}`]) return;
      await StorageService.set({ [`processing_${tabId}`]: true });
      const hashParams = url.hash.substring(1);
      const cpfMatch = /cpf=([^&]+)/.exec(hashParams);
      const senhaMatch = /senha=([^&]+)/.exec(hashParams);
      const cpf = cpfMatch ? cpfMatch[1] : null;
      const senha = senhaMatch ? decodeURIComponent(senhaMatch[1]) : null;
      if (cpf && senha) {
        const existingCreds = await StorageService.getCredentials(tabId);
        await StorageService.saveCredentials(tabId, {
          cpf,
          senha,
          nome: existingCreds?.nome,
          valorComercializado: existingCreds?.valorComercializado,
          portalType: existingCreds?.portalType,
          loginConcluido: existingCreds?.loginConcluido,
          govBrCpfSubmitted: existingCreds?.govBrCpfSubmitted,
          govBrPasswordSubmitted: existingCreds?.govBrPasswordSubmitted,
        });
        const cleanUrl = currentUrl.split("#")[0];
        await browser.tabs.update(tabId, { url: cleanUrl });
      }
    }
  } catch (e) {
    console.error("Hash Auto Error:", e);
  } finally {
    await StorageService.remove(`processing_${tabId}`);
  }
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    await getTabManager().handleTabActivated(activeInfo.tabId);
  } catch (e) {
    console.error("TabManager onActivated error:", e);
  }
});

browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    await getTabManager().handleTabRemoval(tabId, removeInfo);
  } catch (e) {
    console.error("TabManager onRemoved error:", e);
  }
});

// Recarrega automaticamente tabs do eCAC com sessão de cadastro ativa quando
// ocorre erro de rede (ex: timeout, falha de conexão).
const ECAC_HOSTS = ["cav.receita.fazenda.gov.br", "www3.cav.receita.fazenda.gov.br"];
const ecacReloadAttempts = new Map<number, number>();

(browser as any).webNavigation?.onErrorOccurred?.addListener(async (details: any) => {
  try {
    if (details.frameId !== 0) return; // só frame principal
    const url: string = details.url ?? "";
    const isEcac = ECAC_HOSTS.some(h => url.includes(h));
    if (!isEcac) return;
    const creds = await StorageService.getCredentials(details.tabId);
    if (!creds?.isCadastroAutomatico) return;
    const attempts = ecacReloadAttempts.get(details.tabId) ?? 0;
    if (attempts >= 3) return;
    ecacReloadAttempts.set(details.tabId, attempts + 1);
    await new Promise(r => setTimeout(r, 2000));
    await browser.tabs.reload(details.tabId);
  } catch (e) {
    console.error("eCAC network error reload:", e);
  }
});

setInterval(() => {
  void getTabManager().recheckPendingTabs().catch((error) => {
    console.error("TabManager watchdog error:", error);
  });
}, 10000);

export async function handleEsocialFilename(downloadItem: any, suggest: any): Promise<void> {
  const ESOCIAL_PENDING_DOWNLOAD_HINT_KEY = "sigess_esocial_pending_download_hint";
  try {
    const sourceUrl = downloadItem.finalUrl || downloadItem.url || "";
    const currentFilename = downloadItem.filename || "";
    const pendingHintResult = await StorageService.get<any>(ESOCIAL_PENDING_DOWNLOAD_HINT_KEY);
    const pendingHint = pendingHintResult?.[ESOCIAL_PENDING_DOWNLOAD_HINT_KEY];
    const hasPendingHint = !!pendingHint?.filename && Number(pendingHint?.expiresAt || 0) > Date.now();
    const isEsocialGuide =
      hasPendingHint ||
      sourceUrl.includes("esocial.gov.br") ||
      currentFilename.includes("GuiaPagamento_");

    if (!isEsocialGuide) {
      if (pendingHint?.expiresAt && pendingHint.expiresAt <= Date.now()) {
        await StorageService.remove(ESOCIAL_PENDING_DOWNLOAD_HINT_KEY);
      }
      suggest();
      return;
    }

    const tabCreds =
      typeof downloadItem.tabId === "number" && downloadItem.tabId >= 0
        ? await StorageService.getCredentials(downloadItem.tabId)
        : null;

    const fallbackCreds = await StorageService.getLastEsocialCredentials();
    const creds = tabCreds ?? fallbackCreds;

    const nome = normalizeFilePart(creds?.nome || "SEM_NOME");
    const cpf = onlyDigits(creds?.cpf) || extractCpfFromFilename(currentFilename) || "SEM_CPF";
    const periodo =
      formatCompetenciaFromUrl(sourceUrl) ||
      formatCompetenciaFromFilename(currentFilename) ||
      "SEM_PERIODO";
    const extension = getFileExtension(currentFilename || sourceUrl) || "pdf";
    const filename = hasPendingHint
      ? pendingHint.filename
      : `${nome}_${cpf}_${periodo}.${extension}`;

    console.log("[SIGESS] Renomeando download do eSocial para:", filename);
    if (hasPendingHint) {
      await StorageService.remove(ESOCIAL_PENDING_DOWNLOAD_HINT_KEY);
    }
    suggest({
      filename,
      conflictAction: "uniquify",
    });
  } catch (error) {
    console.error("[SIGESS] Erro ao renomear download do eSocial:", error);
    suggest();
  }
}

function onlyDigits(value?: string | null): string {
  return (value || "").replace(/\D/g, "");
}

function normalizeFilePart(value: string): string {
  const withoutAccents = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return withoutAccents
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "SEM_NOME";
}

function formatCompetenciaFromUrl(url: string): string | null {
  const parsedUrl = safeParseUrl(url);
  const competencia = parsedUrl?.searchParams.get("competencia");
  if (!competencia || !/^\d{6}$/.test(competencia)) return null;
  return `${competencia.slice(0, 4)}-${competencia.slice(4, 6)}`;
}

function getFileExtension(value: string): string | null {
  const match = /\.([a-z0-9]+)(?:$|\?)/i.exec(value);
  return match?.[1]?.toLowerCase() || null;
}

function extractCpfFromFilename(value: string): string | null {
  const match = /GuiaPagamento_(\d{11})_/i.exec(value);
  return match?.[1] || null;
}

function formatCompetenciaFromFilename(_value: string): string | null {
  return null;
}

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// Inicializa o Badge no startup
StorageService.getSettings().then(settings => {
  BadgeManager.setQueueCount(settings.multiLoginQueue?.length || 0);
});

// Inicializa o alerta de atualização usando a API do GitHub
VersionChecker.start();

// Inicializa o Realtime para invalidação de cache instatânea
RealtimeLicenseService.init().catch(err => console.error("Realtime Init Error:", err));

// Warmup da Licença: Valida e aquece o memoryCache no startup.
// Graças ao Version Check (REST) no isCacheValid, isso garante que se houver desvínculo, 
// o cache será invalidado já no primeiro milissegundo de ativação do background.
LicenseService.beginStartupValidation().catch(err => console.error("Background License Warmup Error:", err));
