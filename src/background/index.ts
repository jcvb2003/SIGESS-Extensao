import "../shared/utils/browser-shim";
import { TabManager } from "./services/tab-manager";
import { StorageService } from "./services/storage";
import { MessageRequest, MessageResponse } from "../shared/types";
import { routeMessage } from "./message-router";
import { BadgeService } from "./services/badge-service";
import { VersionChecker } from "./services/version-checker";

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
  BadgeService.updateQueueBadge(settings.multiLoginQueue?.length || 0);
});

// Inicializa o alerta de atualização usando a API do GitHub
VersionChecker.start();
