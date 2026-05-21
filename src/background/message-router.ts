import { logger } from "../shared/services/logger";
import { StorageService } from "./services/storage";
import { LicenseService } from "../shared/services/license";
import {
  GovBatchQueueItem,
  MessageRequest,
  MessageResponse,
  MultiLoginItem,
} from "../shared/types";
import { BadgeManager } from "./services/badge-manager";

function isUrlAllowed(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (!protocol.startsWith("https")) return false;
    return (
      hostname.endsWith(".gov.br") ||
      hostname.endsWith(".jus.br") ||
      hostname.endsWith(".sigess.com.br") ||
      hostname === "sigess.com.br" ||
      hostname.endsWith(".vercel.app")
    );
  } catch {
    return false;
  }
}

export async function routeMessage(
  message: MessageRequest,
  getTabManager: () => any,
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const action = message.action || (message as any).type;
  logger.info("Extension", `Requisição recebida: ${action}`);

  try {
    switch (action) {
      case "checkLicense": {
        const lic = await LicenseService.checkLicense();
        logger.info("Licença", "Validação de licença concluída");
        return { success: true, ...lic };
      }
      case "consumeLicense": {
        const usageType = message.usageType || "manual";
        const lic = await LicenseService.checkLicense(true, true, usageType);
        logger.info("Licença", `Uso consumido: ${usageType}`);
        return { success: lic.ok, ...lic };
      }
      case "updateESocialSettings":
        return await handleUpdateSettings(message);
      case "startBatchLogin":
        return await handleStartBatchLogin(message, getTabManager);
      case "abrirAbaContainer":
        return await handleAbrirAbaContainer(message, getTabManager);
      case "enqueueGovBatchSessions":
        return await handleEnqueueGovBatchSessions(message, getTabManager);
      case "getGovBatchStatuses":
        return await handleGetGovBatchStatuses(message);
      case "getESocialAutomationSettings":
        return await handleGetESocialAutomationSettings();
      case "updateGovBatchStatus":
        return await handleUpdateGovBatchStatus(message, sender);
      case "turboFillReap":
        return await handleTurboFillReap(message);
      case "SAVE_PESSOA_DATA":
        return await handleSavePessoaData(message);
      case "downloadESocialGuide":
        return await handleDownloadESocialGuide(message);
      default:
        logger.error("Extension", `Ação desconhecida: ${action}`);
        return {
          success: false,
          error: `Ação desconhecida: ${action}`,
        };
    }
  } catch (error: any) {
    logger.error("Extension", "Erro ao processar requisição", { action, error: error.message });
    return { success: false, error: error.message };
  }
}

async function handleGetESocialAutomationSettings(): Promise<MessageResponse> {
  const settings = await StorageService.getSettings();
  const rawYear = (settings.selectedYear || "").trim();
  const month = (settings.selectedMonth || "").padStart(2, "0");
  const year = rawYear === "current" ? String(new Date().getFullYear()) : rawYear;
  const competencia = year && month && /^\d{4}$/.test(year) && /^\d{2}$/.test(month)
    ? `${year}-${month}`
    : "";

  return {
    success: true,
    data: {
      competencia,
      valorComercializado: settings.valorComercializado || "",
      gerarGps: Boolean(settings.gerarGps),
    },
  };
}

async function handleUpdateSettings(message: MessageRequest) {
  if (!message.settings) {
    logger.error("Configurações", "Configurações não fornecidas");
    return { success: false, error: "Configurações não fornecidas" };
  }

  try {
    const current = await StorageService.getSettings();
    const newSettings = { ...current, ...message.settings };
    if (message.settings.consultarGuias && message.settings.gerarGps) {
      if (message.settings.consultarGuias) newSettings.gerarGps = false;
      else if (message.settings.gerarGps) newSettings.consultarGuias = false;
    }
    await StorageService.saveSettings(newSettings);

    if (message.settings.multiLoginQueue) {
      BadgeManager.setQueueCount(newSettings.multiLoginQueue?.length || 0);
    }

    logger.info("Configurações", "Configurações atualizadas com sucesso");
    return { success: true, settings: newSettings };
  } catch (error: any) {
    logger.error("Configurações", "Erro ao atualizar", { error: error.message });
    throw error;
  }
}

async function handleStartBatchLogin(
  message: MessageRequest,
  getTabManager: () => any,
) {
  // Otimizado: Permite o uso de cache (8h) para abrir o lote
  const license = await LicenseService.checkLicense(false, false);
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
      getTabManager().createSession(
        targetUrl,
        cred.cpf,
        cred.senha,
        index + 1,
        cred.nome,
        type as "pesqbrasil" | "esocial",
      ),
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
  // Otimizado: Permite o uso de cache (8h) para enfileirar/abrir abas
  const license = await LicenseService.checkLicense(false, false);
  if (!license.ok) {
    return {
      success: false,
      error: `Licença Inválida ou Trial Expirado: ${license.reason}. Entre em contato: (91) 99319-3461`,
    };
  }
  const { url, cpf, senha, nome } = message;
  
  // Whitelist de Segurança
  try {
    if (!isUrlAllowed(url || '')) {
      return { success: false, error: "Este host não está autorizado para login via container SIGESS." };
    }
  } catch (error) {
    console.warn("Falha ao validar host de destino:", error);
    return { success: false, error: "URL de destino inválida." };
  }

  const settings = await StorageService.getSettings();
  
  // Se houver dados de auditoria (SDPA), salva no storage local associado a este sócio
  if (message.auditoriaData) {
    try {
      // Garante que o CPF vindo da mensagem principal seja incluído nos dados de auditoria
      const dataWithCpf = { 
        ...message.auditoriaData, 
        cpf: message.cpf || message.auditoriaData.cpf 
      };
      await StorageService.mergePessoaData(dataWithCpf, "SIGESS_WEB");
      console.log("[SIGESS] Dados de auditoria (SDPA) persistidos com sucesso.");
    } catch (error) {
      console.warn("[SIGESS] Falha ao persistir dados de auditoria:", error);
    }
  }

  // Se o login múltiplo estiver ATIVADO, enfileira
  if (settings.multiLoginEnabled) {
    // Limpeza de itens expirados (30 minutos)
    const now = Date.now();
    const queue = (settings.multiLoginQueue || []).filter(item => {
      const age = now - item.timestamp;
      return age < 30 * 60 * 1000;
    });
    
    // Limite de 5 itens conforme solicitado
    if (queue.length >= 5) {
      return { success: false, error: "Fila de login múltiplo cheia (máx 5). Abra o lote ou remova itens." };
    }

    const newItem: MultiLoginItem = {
      id: Math.random().toString(36).substring(2, 11),
      nome: nome || cpf, // Usa nome se existir, senão CPF
      cpf,
      senha,
      url,
      type: url.includes("esocial") ? "esocial" : "pesqbrasil",
      timestamp: Date.now()
    };

    const newQueue = [...queue, newItem];
    await StorageService.saveSettings({ ...settings, multiLoginQueue: newQueue });
    BadgeManager.setQueueCount(newQueue.length);
    
    return { success: true, queued: true, nome: newItem.nome };
  }

  // Se estiver DESATIVADO, abre a aba imediatamente (comportamento original)
  const randIndex = Math.floor(Math.random() * 1000);
  await getTabManager().createSession(
    url,
    cpf,
    senha,
    randIndex,
    nome,
    url.includes("esocial") ? "esocial" : "pesqbrasil",
  );
  return { success: true };
}

async function handleEnqueueGovBatchSessions(
  message: MessageRequest,
  getTabManager: () => any,
) {
  const license = await LicenseService.checkLicense(false, false);
  if (!license.ok) {
    return {
      success: false,
      error: `LicenÃ§a InvÃ¡lida ou Trial Expirado: ${license.reason}. Entre em contato: (91) 99319-3461`,
    };
  }

  const rawItems = Array.isArray((message as any).items)
    ? ((message as any).items as GovBatchQueueItem[])
    : [];

  if (rawItems.length === 0) {
    return { success: false, error: "Nenhum item GOV foi informado para a fila." };
  }

  const settings = await StorageService.getSettings();
  const now = Date.now();
  const queue = (settings.multiLoginQueue || []).filter((item) => {
    const age = now - item.timestamp;
    return age < 30 * 60 * 1000;
  });

  const availableSlots = Math.max(0, 5 - queue.length);
  if (availableSlots === 0) {
    return {
      success: false,
      error: "Fila da extensÃ£o cheia (mÃ¡x 5). Abra o lote atual antes de enviar novos itens.",
    };
  }

  const existingCpfs = new Set(queue.map((item) => item.cpf));
  const newQueueItems: MultiLoginItem[] = [];

  for (const item of rawItems) {
    if (!item?.cpf || !item?.senha || !item?.url) {
      continue;
    }

    if (newQueueItems.length >= availableSlots) {
      break;
    }

    if (existingCpfs.has(item.cpf)) {
      continue;
    }

    existingCpfs.add(item.cpf);
    newQueueItems.push({
      id: Math.random().toString(36).substring(2, 11),
      nome: item.nome || item.cpf,
      cpf: item.cpf,
      senha: item.senha,
      url: item.url,
      type: "esocial",
      timestamp: Date.now(),
    });
  }

  if (newQueueItems.length === 0) {
    return {
      success: false,
      error: "Nenhum item GOV novo e valido foi aceito para a fila.",
    };
  }

  const nextQueue = [...queue, ...newQueueItems];
  await StorageService.saveSettings({ ...settings, multiLoginQueue: nextQueue });
  BadgeManager.setQueueCount(nextQueue.length);

  const credentials = newQueueItems.map((item) => ({
    cpf: item.cpf,
    senha: item.senha,
    nome: item.nome,
  }));

  const openResult = await handleStartBatchLogin(
    {
      action: "startBatchLogin",
      type: "esocial",
      credentials,
    } as MessageRequest,
    getTabManager,
  );

  const remainingQueue = nextQueue.filter(
    (queuedItem) => !newQueueItems.some((newItem) => newItem.id === queuedItem.id),
  );
  await StorageService.saveSettings({ ...settings, multiLoginQueue: remainingQueue });
  BadgeManager.setQueueCount(remainingQueue.length);

  return {
    success: true,
    queued: true,
    count: newQueueItems.length,
    total: remainingQueue.length,
    opened: openResult.success ? openResult.count || 0 : 0,
    failed: openResult.success ? openResult.failed || 0 : newQueueItems.length,
  };
}

async function handleGetGovBatchStatuses(message: MessageRequest) {
  const requestedCpfs = Array.isArray((message as any).cpfs)
    ? ((message as any).cpfs as string[])
    : [];

  const normalizedCpfs = new Set(
    requestedCpfs
      .map((cpf) => String(cpf || "").replace(/\D/g, ""))
      .filter(Boolean),
  );

  const allCredentials = await StorageService.getAllCredentials();
  const rawItems = Object.entries(allCredentials)
    .map(([key, credentials]) => ({
      tabId: Number(key.replace("credenciais_", "")),
      cpf: String(credentials.cpf || "").replace(/\D/g, ""),
      nome: credentials.nome,
      status: credentials.status || (credentials.loginConcluido ? "concluido" : "aguardando_pagina"),
      statusTitle: credentials.statusTitle,
      statusDescription: credentials.statusDescription,
      progressStep: credentials.progressStep,
      progressTotal: credentials.progressTotal,
      loginConcluido: !!credentials.loginConcluido,
      boletoInfo: credentials.boletoInfo,
      boletoGerado: credentials.boletoGerado,
      lastError: credentials.lastError,
      lastUpdatedAt: credentials.lastUpdatedAt,
    }))
    .filter((item) => item.cpf && (normalizedCpfs.size === 0 || normalizedCpfs.has(item.cpf)));

  const latestByCpf = new Map<string, (typeof rawItems)[number]>();
  for (const item of rawItems) {
    const current = latestByCpf.get(item.cpf);
    if (!current || (item.lastUpdatedAt || 0) >= (current.lastUpdatedAt || 0)) {
      latestByCpf.set(item.cpf, item);
    }
  }

  const items = Array.from(latestByCpf.values());

  return {
    success: true,
    items,
  };
}

async function handleUpdateGovBatchStatus(
  message: MessageRequest,
  sender?: browser.runtime.MessageSender,
) {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") {
    return { success: false, error: "Nao foi possivel identificar a aba da automacao." };
  }

  const msg = message as MessageRequest & {
    status?: any;
    statusTitle?: string;
    statusDescription?: string;
    lastError?: string;
    loginConcluido?: boolean;
    progressStep?: number;
    progressTotal?: number;
    boletoInfo?: any;
    boletoGerado?: boolean;
  };

  const { status, statusTitle, statusDescription, lastError, loginConcluido, progressStep, progressTotal, boletoInfo, boletoGerado } = msg;

  if (!status || !statusTitle || !statusDescription) {
    return { success: false, error: "Payload de status incompleto." };
  }

  await StorageService.updateBatchStatus(
    tabId,
    status,
    statusTitle,
    statusDescription,
    {
      lastError,
      loginConcluido,
      progressStep,
      progressTotal,
      boletoInfo,
      boletoGerado,
    },
  );

  return { success: true };
}

async function handleTurboFillReap(message: MessageRequest) {
  // Lógica Decisória: Plano Pago usa cache (0ms). Plano Teste faz verificação live e consome cota.
  const current = await LicenseService.getStatus();
  const isPaid = current.ok && current.plan === 'paid';
  
  const forceLive = !isPaid;
  const forceConsume = !isPaid;

  const license = await LicenseService.checkLicense(forceLive, forceConsume, 'turbo');
  
  if (!license.ok) {
    return {
      success: false,
      error: license.reason === 'limit_reached_turbo' 
        ? `Limite de Preenchimento Turbo atingido (${license.usage_turbo}/${license.max_turbo}). Evolua para o Plano Pro para uso ilimitado.`
        : `Licença Inválida ou Trial Expirado: ${license.reason}. Entre em contato: (91) 99319-3461`,
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

async function handleSavePessoaData(message: MessageRequest) {
  const { data, fonte } = message;
  if (!data || !fonte) {
    return { success: false, error: "Dados ou fonte não fornecidos" };
  }

  try {
    const newSettings = await StorageService.mergePessoaData(data, fonte);
    return { success: true, settings: newSettings };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function handleDownloadESocialGuide(message: MessageRequest) {
  const { dataUrl, filename } = message;
  if (!dataUrl || !filename) {
    return { success: false, error: "Dados do download não fornecidos." };
  }

  console.log("[SIGESS] Background: Iniciando download com filename:", filename);
  try {
    const downloadId = await (browser as any).downloads.download({
      url: dataUrl,
      filename,
      saveAs: false,
      conflictAction: "uniquify",
    });
    console.log("[SIGESS] Background: Download iniciado com ID:", downloadId);

    return { success: true, downloadId };
  } catch (error: any) {
    return { success: false, error: error.message || "Falha ao baixar guia do eSocial." };
  }
}
