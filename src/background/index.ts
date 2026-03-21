import { TabManager } from "./services/TabManager";
import { StorageService } from "./utils/storage";
import { MessageRequest, MessageResponse } from "../shared/types";
import { LicenseService } from "../shared/services/license";
const tabManager = new TabManager();
tabManager.init();
(async () => {
  try {
    await LicenseService.checkLicense(true);
  } catch (e) {
    console.error("License pre-check failed:", e);
  }
})();
console.log("SIGESS Background Service Initialized");
browser.runtime.onMessage.addListener(
  (
    message: MessageRequest,
    _sender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    const handleMessage = async () => {
      try {
        const action = message.action || (message as any).type;
        switch (action) {
          case "checkLicense": {
            const lic = await LicenseService.checkLicense();
            return { success: true, ...lic };
          }
          case "updateESocialSettings":
            return await handleUpdateSettings(message);
          case "startBatchLogin":
            return await handleStartBatchLogin(message);
          case "abrirAbaContainer":
            return await handleAbrirAbaContainer(message);
          default:
            return {
              success: false,
              error: `Unknown action: ${message.action || (message as any).type}`,
            };
        }
      } catch (error: any) {
        console.error("Background Message Handler Error:", error);
        return { success: false, error: error.message };
      }
    };
    handleMessage().then(sendResponse);
    return true;
  },
);
async function handleUpdateSettings(message: MessageRequest) {
  if (!message.settings)
    return { success: false, error: "Settings not provided" };
  const current = await StorageService.getSettings();
  const newSettings = { ...current, ...message.settings };
  if (message.settings.consultarGuias && message.settings.gerarGps) {
    if (message.settings.consultarGuias) newSettings.gerarGps = false;
    else if (message.settings.gerarGps) newSettings.consultarGuias = false;
  }
  await StorageService.saveSettings(newSettings);
  return { success: true, settings: newSettings };
}
async function handleStartBatchLogin(message: MessageRequest) {
  const license = await LicenseService.checkLicense(true, true);
  if (!license.ok) {
    return {
      success: false,
      error: `Licença Inválida ou Trial Expirado: ${license.reason}. Entre em contato: (91) 99319-3461`,
    };
  }
  const { type, credentials } = message;
  if (!credentials || !Array.isArray(credentials) || credentials.length === 0) {
    return { success: false, error: "Lista de credenciais vazia" };
  }
  const urlMap = {
    pesqbrasil: "https://pesqbrasil-pescadorprofissional.agro.gov.br/",
    esocial: "https://login.esocial.gov.br/",
  };
  const targetUrl = urlMap[type as keyof typeof urlMap];
  if (!targetUrl) return { success: false, error: "Tipo de login inválido" };
  const results = await Promise.allSettled(
    credentials.map((cred, index) =>
      tabManager.createSession(targetUrl, cred.cpf, cred.senha, index + 1),
    ),
  );
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  return { success: true, count: succeeded, failed };
}
async function handleAbrirAbaContainer(message: MessageRequest) {
  const license = await LicenseService.checkLicense(true, true);
  if (!license.ok) {
    return {
      success: false,
      error: `Licença Inválida ou Trial Expirado: ${license.reason}. Entre em contato: (91) 99319-3461`,
    };
  }
  const { url, cpf, senha } = message;
  if (!url?.startsWith("http")) {
    return { success: false, error: "URL inválida" };
  }
  const randIndex = Math.floor(Math.random() * 1000);
  await tabManager.createSession(url, cpf, senha, randIndex);
  return { success: true };
}
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const currentUrl = changeInfo.url || tab.url;
  if (!currentUrl || !currentUrl.includes("#")) return;
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
