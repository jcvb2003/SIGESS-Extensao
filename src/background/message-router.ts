import { StorageService } from "./services/storage";
import { LicenseService } from "../shared/services/license";
import { MessageRequest, MessageResponse } from "../shared/types";

export async function routeMessage(
  message: MessageRequest,
  getTabManager: () => any,
): Promise<MessageResponse> {
  const action = message.action || (message as any).type;
  try {
    switch (action) {
      case "checkLicense": {
        const lic = await LicenseService.checkLicense();
        return { success: true, ...lic };
      }
      case "consumeLicense": {
        const lic = await LicenseService.checkLicense(true, true);
        return { success: lic.ok, ...lic };
      }
      case "updateESocialSettings":
        return await handleUpdateSettings(message);
      case "startBatchLogin":
        return await handleStartBatchLogin(message, getTabManager);
      case "abrirAbaContainer":
        return await handleAbrirAbaContainer(message, getTabManager);
      case "turboFillReap":
        return await handleTurboFillReap(message);
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
}

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

async function handleStartBatchLogin(
  message: MessageRequest,
  getTabManager: () => any,
) {
  const license = await LicenseService.checkLicense(true, false);
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
    credentials.map((cred: any, index: number) =>
      getTabManager().createSession(targetUrl, cred.cpf, cred.senha, index + 1),
    ),
  );
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  return { success: true, count: succeeded, failed };
}

async function handleAbrirAbaContainer(
  message: MessageRequest,
  getTabManager: () => any,
) {
  const license = await LicenseService.checkLicense(true, false);
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
  await getTabManager().createSession(url, cpf, senha, randIndex);
  return { success: true };
}

async function handleTurboFillReap(message: MessageRequest) {
  const license = await LicenseService.checkLicense(true, true);
  if (!license.ok) {
    return {
      success: false,
      error: `Licença Inválida ou Trial Expirado: ${license.reason}. Entre em contato: (91) 99319-3461`,
    };
  }

  const { config } = message;
  if (!config) return { success: false, error: "Configuração do Turbo não fornecida" };

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) return { success: false, error: "Nenhuma aba ativa encontrada" };

    const response = await browser.tabs.sendMessage(tabs[0].id, {
      action: "executeTurboFill",
      config
    });
    return response || { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "A aba atual do REAP não pôde receber a ação de Turbo. Certifique-se de estar na página correta do formulário e recarregue-a." };
  }
}
