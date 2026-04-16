import "../shared/utils/browser-shim";
import { TabManager } from "./services/tab-manager";
import { StorageService } from "./services/storage";
import { MessageRequest, MessageResponse } from "../shared/types";
import { routeMessage } from "./message-router";
import { BadgeManager } from "./services/badge-manager";
import { VersionChecker } from "./services/version-checker";
import { LicenseService } from "../shared/services/license";
import { RealtimeLicenseService } from "./services/realtime-license";

let tabManager: TabManager | null = null;

function getTabManager() {
  tabManager ??= new TabManager();
  return tabManager;
}

console.log("SIGESS Background Service Initialized");
browser.runtime.onMessage.addListener(
  (
    message: MessageRequest,
    _sender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    routeMessage(message, getTabManager).then(sendResponse);
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
        await StorageService.saveCredentials(tabId, { cpf, senha });
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

browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    await getTabManager().handleTabRemoval(tabId, removeInfo);
  } catch (e) {
    console.error("TabManager onRemoved error:", e);
  }
});

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
LicenseService.getStatus().catch(err => console.error("Background License Warmup Error:", err));
