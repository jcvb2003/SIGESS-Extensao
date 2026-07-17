import { logger } from "../shared/services/logger";
import { StorageService } from "./services/storage";
import { LicenseService } from "../shared/services/license";
import { RealtimeLicenseService } from "./services/realtime-license";
import {
  CadastroSession,
  GovBatchQueueItem,
  MessageRequest,
  MessageResponse,
  MultiLoginItem,
  PessoaData,
} from "../shared/types";
import { BadgeManager } from "./services/badge-manager";
import { resolveTseQueryProfile } from "../modules/automation/cadastro/tse-query-profile";
import { resolveCadastroPortalBySource } from "../modules/automation/cadastro/portal-registry";
import { isCadastroPortalTerminal } from "../modules/automation/cadastro/session-status";
import {
  getActiveCadastroSession,
  removeCadastroSession,
  saveCadastroSession,
} from "./cadastro/cadastro-session-store";
import {
  createCadastroPortalTab,
  getCadastroLaunchCredentials,
} from "./cadastro/cadastro-portal-launcher";


const UPDATE_ALLOWED_ACTIONS = new Set([
  "checkLicense",
  "getGovBatchStatuses",
  "getESocialAutomationSettings",
  "getAutoRegistrationSnapshot",
]);

function formatCpf(cpf: string): string {
  const digits = String(cpf).replace(/\D/g, "").padStart(11, "0");
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

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
    const updateInfo = await getUpdateAvailable();
    if (updateInfo && !UPDATE_ALLOWED_ACTIONS.has(action)) {
      return {
        success: false,
        error: "Nova versão detectada. Atualize a extensão para continuar.",
        updateRequired: true,
        updateAvailable: updateInfo,
      };
    }

    switch (action) {
      case "checkLicense": {
        void RealtimeLicenseService.init();
        const lic = await LicenseService.checkLicense();
        logger.info("Licença", "Validação de licença concluída");
        return { success: true, ...lic };
      }
      case "consumeLicense": {
        const usageType = message.usageType || "manual";
        const lic = await LicenseService.checkLicense(true);
        logger.info("Licença", `Uso consumido: ${usageType}`);
        return { success: lic.ok, ...lic };
      }
      case "updateESocialSettings":
      case "updateSettings":
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
      case "getESocialAutomationContext":
        return await handleGetESocialAutomationContext(sender);
      case "getAutoRegistrationSnapshot":
        return await handleGetAutoRegistrationSnapshot();
      case "updateGovBatchStatus":
        return await handleUpdateGovBatchStatus(message, sender);
      case "turboFillReap":
        return await handleTurboFillReap(message);
      case "iniciarCadastroAutomatico":
        return await handleIniciarCadastroAutomatico(message, getTabManager);
      case "cancelarCadastroAutomatico":
        return await handleCancelarCadastroAutomatico();
      case "SAVE_PESSOA_DATA":
        return await handleSavePessoaData(message, getTabManager, sender);
      case "REPORT_CADASTRO_PORTAL_OUTCOME":
        return await handleCadastroPortalOutcome(message, getTabManager, sender);
      case "canSubmitCadastroTse":
        return await handleCanSubmitCadastroTse(sender);
      case "govBrContactConfirmationDetected":
        return await handleGovBrContactConfirmationDetected(sender);
      case "inssAuthenticated":
        return await handleCadastroInssAuthenticated(sender);
      case "downloadESocialGuide":
        return await handleDownloadESocialGuide(message);
      case "checkReloginEligible":
        return await handleCheckReloginEligible(sender);
      case "triggerRelogin":
        return await handleTriggerRelogin(sender, getTabManager);
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

async function getUpdateAvailable(): Promise<{ version?: string; url?: string } | null> {
  const result = await StorageService.get<any>("updateAvailable");
  return result?.updateAvailable || null;
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
      gerarGps: Boolean(settings.gerarGps),
      consultarGuias: Boolean(settings.consultarGuias),
      selectedYear: settings.selectedYear || "current",
      selectedMonth: month,
    },
  };
}

async function handleGetESocialAutomationContext(
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const tabId = sender?.tab?.id;
  const credentials = typeof tabId === "number"
    ? await StorageService.getCredentials(tabId)
    : null;

  if (!credentials || (!credentials.gerarGps && !credentials.consultarGuias)) {
    return { success: true, data: { isBatchTab: false } };
  }

  const selectedYear = (credentials.selectedYear || "current").trim();
  const selectedMonth = (credentials.selectedMonth || "").padStart(2, "0");
  const year = selectedYear === "current" ? String(new Date().getFullYear()) : selectedYear;
  const competencia = year && selectedMonth && /^\d{4}$/.test(year) && /^\d{2}$/.test(selectedMonth)
    ? `${year}${selectedMonth}`
    : "";

  return {
    success: true,
    data: {
      isBatchTab: true,
      gerarGps: Boolean(credentials.gerarGps),
      consultarGuias: Boolean(credentials.consultarGuias),
      selectedYear,
      selectedMonth,
      competencia,
      valorComercializado: credentials.valorComercializado || "",
    },
  };
}

async function handleGetAutoRegistrationSnapshot(): Promise<MessageResponse> {
  const settings = await StorageService.getSettings();
  const pessoaData = settings.pessoaData
    ? {
      ...settings.pessoaData,
      ...(settings.pessoaData_sensitive?.senhaGovInss
        ? { senhaGovInss: settings.pessoaData_sensitive.senhaGovInss }
        : {}),
    }
    : null;

  return {
    success: true,
    data: {
      enabled: Boolean(settings.autoRegistrationEnabled),
      hasData: Boolean(pessoaData?.nome && pessoaData?.cpf),
      data: pessoaData,
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
  const license = await LicenseService.checkLicense();
  if (!license.ok) {
    return {
      success: false,
      error: `Licença inválida: ${license.reason}. Entre em contato: (91) 99319-3461`,
    };
  }
  const { type, credentials } = message;
  if (!credentials || !Array.isArray(credentials) || credentials.length === 0) {
    return { success: false, error: "Lista de credenciais vazia" };
  }
  const urlMap: Record<string, string> = {
    pesqbrasil_agro: "https://pesqbrasil-pescadorprofissional.agro.gov.br/",
    pesqbrasil_mpa: "https://pesqbrasil-pescadorprofissional.mpa.gov.br/",
    esocial: "https://login.esocial.gov.br/",
    inss: "https://meu.inss.gov.br/#/login",
  };
  const targetUrl = urlMap[type as string];
  if (!targetUrl) return { success: false, error: "Tipo de login inválido" };

  const capturedSettings = await StorageService.getSettings();
  const capturedCpf = capturedSettings.pessoaData?.cpf?.replace(/\D/g, "");
  if (capturedCpf) {
    const match = (credentials as any[]).find(
      (cred) => String(cred.cpf).replace(/\D/g, "") === capturedCpf && cred.senha,
    );
    if (match) {
      try {
        await StorageService.mergePessoaData({ senhaGovInss: match.senha }, "SIGESS_WEB");
      } catch {
        // silencioso
      }
    }
  }

  const results = await Promise.allSettled(
    credentials.map((cred: any, index: number) =>
      getTabManager().createSession(
        targetUrl,
        cred.cpf,
        cred.senha,
        index + 1,
        cred.nome || formatCpf(cred.cpf),
        type as "pesqbrasil_agro" | "pesqbrasil_mpa" | "esocial" | "inss",
        cred.valorComercializado,
        cred.gerarGps,
        cred.consultarGuias,
        cred.selectedYear,
        cred.selectedMonth,
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
  const license = await LicenseService.checkLicense();
  if (!license.ok) {
    return {
      success: false,
      error: `Licença inválida: ${license.reason}. Entre em contato: (91) 99319-3461`,
    };
  }
  const { url, cpf, senha, nome, valorComercializado } = message;

  try {
    if (!isUrlAllowed(url || "")) {
      return { success: false, error: "Este host não está autorizado para login via container SIGESS." };
    }
  } catch (error) {
    console.warn("Falha ao validar host de destino:", error);
    return { success: false, error: "URL de destino inválida." };
  }

  const settings = await StorageService.getSettings();

  if (message.auditoriaData) {
    try {
      const dataWithCpf = {
        ...message.auditoriaData,
        cpf: message.cpf || message.auditoriaData.cpf,
      };
      await StorageService.mergePessoaData(dataWithCpf, "SIGESS_WEB");
      console.log("[SIGESS] Dados de auditoria (SDPA) persistidos com sucesso.");
    } catch (error) {
      console.warn("[SIGESS] Falha ao persistir dados de auditoria:", error);
    }
  }

  if (settings.multiLoginEnabled) {
    const now = Date.now();
    const queue = (settings.multiLoginQueue || []).filter((item) => {
      const age = now - item.timestamp;
      return age < 30 * 60 * 1000;
    });

    if (queue.length >= 5) {
      return { success: false, error: "Fila de login múltiplo cheia (máx 5). Abra o lote ou remova itens." };
    }

    const newItem: MultiLoginItem = {
      id: Math.random().toString(36).substring(2, 11),
      nome: nome || cpf,
      cpf,
      senha,
      url,
      valorComercializado,
      type: url.includes("esocial") ? "esocial"
        : url.includes("meu.inss.gov.br") ? "inss"
        : url.includes("mpa.gov.br") ? "pesqbrasil_mpa"
        : "pesqbrasil_agro",
      timestamp: Date.now(),
    };

    const newQueue = [...queue, newItem];
    await StorageService.saveSettings({ ...settings, multiLoginQueue: newQueue });
    BadgeManager.setQueueCount(newQueue.length);

    return { success: true, queued: true, nome: newItem.nome };
  }

  const randIndex = Math.floor(Math.random() * 1000);
  await getTabManager().createSession(
    url,
    cpf,
    senha,
    randIndex,
    nome,
    url.includes("esocial") ? "esocial"
      : url.includes("meu.inss.gov.br") ? "inss"
      : url.includes("mpa.gov.br") ? "pesqbrasil_mpa"
      : "pesqbrasil_agro",
    valorComercializado,
  );
  return { success: true };
}

async function handleEnqueueGovBatchSessions(
  message: MessageRequest,
  getTabManager: () => any,
) {
  const license = await LicenseService.checkLicense();
  if (!license.ok) {
    return {
      success: false,
      error: `Licença inválida: ${license.reason}. Entre em contato: (91) 99319-3461`,
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
      error: "Fila da extensão cheia (máx 5). Abra o lote atual antes de enviar novos itens.",
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
      valorComercializado: item.valorComercializado,
      gerarGps: item.gerarGps,
      consultarGuias: item.consultarGuias,
      selectedYear: item.selectedYear,
      selectedMonth: item.selectedMonth,
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
    valorComercializado: item.valorComercializado,
    gerarGps: item.gerarGps,
    consultarGuias: item.consultarGuias,
    selectedYear: item.selectedYear,
    selectedMonth: item.selectedMonth,
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

  const {
    status,
    statusTitle,
    statusDescription,
    lastError,
    loginConcluido,
    progressStep,
    progressTotal,
    boletoInfo,
    boletoGerado,
  } = msg;

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
  const license = await LicenseService.getStatus();

  if (!license.ok) {
    return {
      success: false,
      error: `Licença inválida: ${license.reason}. Entre em contato: (91) 99319-3461`,
    };
  }

  const { config } = message;
  if (!config) return { success: false, error: "Configuração do Turbo não fornecida" };

  if (config.documentoMode === "url") {
    try {
      const IBAMA_PDF_URL = "https://www.ibama.gov.br/sophia/cnia/legislacao/IBAMA/PT0048-051107.PDF";
      const pdfResp = await fetch(IBAMA_PDF_URL);
      if (!pdfResp.ok) throw new Error(`HTTP ${pdfResp.status}`);
      const buffer = await pdfResp.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let b64 = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        b64 += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      config.documentoPdfB64 = btoa(b64);
      config.documentoPdfFilename = "PT0048-051107.PDF";
    } catch (e: any) {
      return { success: false, error: `Falha ao baixar PDF do IBAMA: ${e.message}` };
    }
  }

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) return { success: false, error: "Nenhuma aba ativa encontrada" };

    const response = await browser.tabs.sendMessage(tabs[0].id, {
      action: "executeTurboFill",
      config,
    });
    return response || { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "A aba atual do REAP não pôde receber a ação de Turbo. Certifique-se de estar na página correta do formulário e recarregue-a.",
    };
  }
}

async function handleSavePessoaData(
  message: MessageRequest,
  getTabManager?: () => any,
  _sender?: browser.runtime.MessageSender,
) {
  const { data, fonte } = message;
  if (!data || !fonte) {
    return { success: false, error: "Dados ou fonte não fornecidos" };
  }

  try {
    const newSettings = await StorageService.mergePessoaData(data, fonte, message.snapshot);

    // Enfileira a atualização de sessão em série para evitar race condition
    // quando pesqbrasil_mpa e ecac_caepf chegam simultaneamente.
    enqueueCadastroDataArrival(fonte, data, getTabManager);

    return { success: true, settings: newSettings };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ── Cadastro Automático ───────────────────────────────────────────────────

// Garante que atualizações de portais sejam aplicadas em série —
// pesqbrasil_mpa e ecac_caepf chegam simultaneamente e causam race condition
// se cada um ler/escrever a sessão de forma concorrente.
let _cadastroUpdateQueue: Promise<void> = Promise.resolve();

function enqueueCadastroDataArrival(
  fonte: string,
  data: Partial<PessoaData>,
  getTabManager?: () => any,
): void {
  _cadastroUpdateQueue = _cadastroUpdateQueue
    .then(() => handleCadastroDataArrival(fonte, data, getTabManager))
    .catch(() => {});
}

function fonteToPortal(fonte: string): keyof CadastroSession["portais"] | null {
  return resolveCadastroPortalBySource(fonte);
}

const getActiveSession = getActiveCadastroSession;
const saveSession = saveCadastroSession;

/** Verifica se a sessão ativa não tem mais nenhuma tab aberta (background reiniciou e perdeu o timeout). */
async function isCadastroSessionStale(session: CadastroSession): Promise<boolean> {
  const tabIds = [
    session.portais.cadunico.tabId,
    session.portais.pesqbrasil?.tabId,
    session.portais.ecac?.tabId,
    session.portais.tse?.tabId,
  ].filter((id): id is number => typeof id === "number");

  if (tabIds.length === 0) return true; // sem tabs conhecidas → stale

  for (const tabId of tabIds) {
    try {
      await browser.tabs.get(tabId);
      return false; // pelo menos uma tab ainda existe → sessão válida
    } catch {
      // tab não existe, testa a próxima
    }
  }
  return true; // nenhuma tab sobreviveu
}

async function clearStaleSession(session: CadastroSession): Promise<void> {
  try {
    await (browser as any).contextualIdentities.remove(session.cookieStoreId);
  } catch { /* container pode já ter sido removido */ }
  await removeCadastroSession();
}

async function handleCancelarCadastroAutomatico(): Promise<MessageResponse> {
  const session = await getActiveSession();
  if (!session) return { success: true }; // nada a cancelar
  await clearStaleSession(session);
  return { success: true };
}

async function handleIniciarCadastroAutomatico(
  message: MessageRequest,
  getTabManager: () => any,
): Promise<MessageResponse> {
  const { cpf, senha, nome } = message;
  if (!cpf || !senha) {
    return { success: false, error: "CPF e senha são obrigatórios." };
  }

  // Idempotência: bloqueia sessão duplicada — mas auto-limpa sessões stale
  // (o timeout de 120s fica só em memória; se o background reiniciar, o timeout
  // se perde e a sessão fica presa em "active" no storage para sempre).
  const existing = await getActiveSession();
  if (existing) {
    const isStale = await isCadastroSessionStale(existing);
    if (!isStale) {
      return { success: false, error: "sessao_ja_ativa" };
    }
    // Sessão stale: limpa silenciosamente e prossegue
    await clearStaleSession(existing);
  }

  if (!(browser as any).contextualIdentities) {
    return { success: false, error: "Containers Firefox não disponíveis. Ative a extensão Multi-Account Containers." };
  }

  await StorageService.saveCadastroSenhaGovInss(senha);

  const sessionId = `cadastro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const container = await (browser as any).contextualIdentities.create({
      name: `Cadastro-${String(cpf).slice(-4)}`,
      color: "green",
      icon: "briefcase",
    });
    const cookieStoreId: string = container.cookieStoreId;

    const session: CadastroSession = {
      sessionId,
      cookieStoreId,
      sessionState: "active",
      startedAt: Date.now(),
      portais: {
        cadunico: { status: "abrindo" },
        pesqbrasil: { status: "aguardando" },
        ecac: { status: "aguardando" },
      },
    };
    await saveSession(session);

    // Abre CadÚnico diretamente na rota onde está o botão Gov.br
    const cadUnicoTabId = await getTabManager().createSessionInContainer(
      "https://cadunico.dataprev.gov.br/#/home",
      cpf, senha, cookieStoreId, nome, "cadunico", sessionId,
    );
    if (cadUnicoTabId) {
      session.portais.cadunico.tabId = cadUnicoTabId;
      await saveSession(session);
    }

    // Timeout global da sessão
    return { success: true, sessionId };
  } catch (error: any) {
    await removeCadastroSession();
    return { success: false, error: error.message };
  }
}

async function handleCadastroPortalOutcome(
  message: MessageRequest,
  getTabManager: () => any,
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const portalKey = message.portal as keyof CadastroSession["portais"] | undefined;
  const outcome = message.outcome as "not_found" | "unavailable" | "failed" | undefined;
  if (!portalKey || !outcome) {
    return { success: false, error: "Resultado do portal inválido." };
  }

  const session = await getActiveSession();
  const portal = session?.portais[portalKey];
  if (!session || !portal) return { success: true };
  if (!isRegisteredCadastroPortalSender(session, portalKey, sender)) {
    return { success: false, error: "aba_do_portal_nao_autorizada" };
  }

  portal.status = outcome === "not_found"
    ? "nao_encontrado"
    : outcome === "unavailable"
      ? "indisponivel"
      : "erro";
  portal.evidence = String(message.reason || outcome);
  portal.updatedAt = Date.now();
  await saveSession(session);

  if (portalKey === "cadunico" && outcome === "not_found") {
    await openCadastroInss(session, getTabManager);
  }

  await evaluateTseRequirement(session, getTabManager);
  await finalizeIfReady(session, getTabManager);
  return { success: true };
}

/** O clique automático no TSE é permitido somente na aba criada para a sessão. */
async function handleCanSubmitCadastroTse(
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const session = await getActiveSession();
  if (!session || !isRegisteredCadastroPortalSender(session, "tse", sender)) {
    return { success: true, allowed: false };
  }

  const tabId = sender?.tab?.id;
  const creds = typeof tabId === "number" ? await StorageService.getCredentials(tabId) : null;
  const allowed = Boolean(
    creds?.isCadastroAutomatico &&
    creds.portalType === "tse" &&
    creds.cadastroSessionId === session.sessionId &&
    sender?.tab?.url?.includes("www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral"),
  );
  return { success: true, allowed };
}

async function handleGovBrContactConfirmationDetected(
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") return { success: true, interactionUpdated: false };

  const creds = await StorageService.getCredentials(tabId);
  if (!creds?.isCadastroAutomatico || !creds.cadastroSessionId) {
    return { success: true, interactionUpdated: false };
  }

  await StorageService.updateCadastroInteraction(creds.cadastroSessionId, {
    type: "govbr_contact_confirmation",
    message: "Confirmação de contato necessária. Aguardando atualização...",
    tabId,
  });
  return { success: true, interactionUpdated: true };
}

async function handleCadastroInssAuthenticated(
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") return { success: true, navigated: false };

  const session = await getActiveSession();
  const credentials = await StorageService.getCredentials(tabId);
  if (
    !session ||
    session.portais.inss?.tabId !== tabId ||
    !credentials?.isCadastroAutomatico ||
    credentials.portalType !== "inss" ||
    credentials.cadastroSessionId !== session.sessionId
  ) {
    return { success: true, navigated: false };
  }

  const tab = await browser.tabs.get(tabId);
  if (!tab.url?.includes("meu.inss.gov.br") || tab.url.includes("dados-cadastrais")) {
    return { success: true, navigated: false };
  }

  await StorageService.updateCredentials(tabId, {
    loginConcluido: true,
    status: "redirecionando",
    statusTitle: "Login concluído",
    statusDescription: "Acessando dados cadastrais do Meu INSS...",
  });
  await browser.tabs.update(tabId, {
    url: "https://meu.inss.gov.br/#/dados-cadastrais?tk-categoria=Por%20Menu",
  });
  return { success: true, navigated: true };
}

function isRegisteredCadastroPortalSender(
  session: CadastroSession,
  portal: keyof CadastroSession["portais"],
  sender?: browser.runtime.MessageSender,
): boolean {
  const tabId = sender?.tab?.id;
  return typeof tabId === "number" && session.portais[portal]?.tabId === tabId;
}

async function openCadastroInss(session: CadastroSession, getTabManager: () => any): Promise<void> {
  if (session.portais.inss) return;

  const creds = await getCadastroLaunchCredentials(session);
  if (!creds?.cpf || !creds.senha) {
    session.portais.inss = {
      status: "erro",
      evidence: "credenciais_indisponiveis",
      updatedAt: Date.now(),
    };
    await saveSession(session);
    return;
  }

  session.portais.inss = { status: "abrindo", updatedAt: Date.now() };
  await saveSession(session);
  const tabId = await createCadastroPortalTab(
    session,
    getTabManager(),
    creds,
    "inss",
    "https://meu.inss.gov.br/#/login",
  );
  if (tabId) {
    session.portais.inss.tabId = tabId;
  } else {
    session.portais.inss.status = "indisponivel";
    session.portais.inss.evidence = "falha_ao_abrir_aba";
  }
  session.portais.inss.updatedAt = Date.now();
  await saveSession(session);
}

async function evaluateTseRequirement(session: CadastroSession, getTabManager?: () => any): Promise<void> {
  if (session.portais.tse) return;

  // Uma falha técnica do CadÚnico não equivale a ausência de dados eleitorais.
  // Nesse caso, não abre TSE nem cria uma decisão baseada em dados incompletos.
  const cadUnicoStatus = session.portais.cadunico.status;
  if (!["concluido", "nao_encontrado"].includes(cadUnicoStatus)) return;

  const settings = await StorageService.getSettings();
  const pessoa = settings.pessoaData || {};
  if (pessoa.fontes?.tse?.capturado) {
    session.portais.tse = {
      status: "dispensado",
      evidence: "dados_eleitorais_cadunico",
      updatedAt: Date.now(),
    };
    await saveSession(session);
    return;
  }

  const pesqBrasilStatus = session.portais.pesqbrasil.status;
  const pesqBrasilFinalizado = ["concluido", "erro", "indisponivel"].includes(pesqBrasilStatus);
  const inssPendente = session.portais.inss && !isCadastroPortalTerminal(session.portais.inss);
  if (!pesqBrasilFinalizado || inssPendente) return;

  const profile = resolveTseQueryProfile(settings);
  if (!profile.isSufficient || !getTabManager) {
    session.portais.tse = {
      status: "erro",
      evidence: "dados_insuficientes_para_consulta",
      updatedAt: Date.now(),
    };
    await saveSession(session);
    return;
  }

  const creds = await getCadastroLaunchCredentials(session);
  if (!creds?.cpf || !creds.senha) return;

  session.portais.tse = { status: "abrindo", updatedAt: Date.now() };
  await saveSession(session);
  const tabId = await createCadastroPortalTab(
    session,
    getTabManager(),
    creds,
    "tse",
    "https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/consultar-numero-titulo-eleitor",
  );
  if (tabId) session.portais.tse.tabId = tabId;
  else {
    session.portais.tse.status = "erro";
    session.portais.tse.evidence = "falha_ao_abrir_aba";
  }
  session.portais.tse.updatedAt = Date.now();
  await saveSession(session);
}

async function finalizeIfReady(session: CadastroSession, getTabManager?: () => any): Promise<void> {
  const expected: (keyof CadastroSession["portais"])[] = ["cadunico", "pesqbrasil", "ecac"];
  if (session.portais.inss) expected.push("inss");
  if (session.portais.tse) expected.push("tse");
  if (expected.every((key) => isCadastroPortalTerminal(session.portais[key]))) {
    await finalizeCadastroSession(session, getTabManager);
  }
}

async function handleCadastroDataArrival(
  fonte: string,
  _data: Partial<PessoaData>,
  getTabManager?: () => any,
): Promise<void> {
  const session = await getActiveSession();
  if (!session) return;

  const portalKey = fonteToPortal(fonte);
  if (!portalKey) return;

  const portal = session.portais[portalKey];
  if (!portal) return;

  // Atualiza status do portal
  if (fonte === "cadunico") {
    // Primeira chegada do CadÚnico (JWT básico) — marca como coletando
    if (portal.status === "abrindo" || portal.status === "aguardando") {
      portal.status = "coletando";
    }
  } else {
    // cadunico_adv, ecac_cpf, pesqbrasil*, tse → concluído
    portal.status = "concluido";
  }

  await saveSession(session);

  // Verificação condicional do TSE após cadunico_adv
  // Verifica se todos os portais esperados estão concluídos/erro/timeout
  await evaluateTseRequirement(session, getTabManager);

  const cadunicoDependenciesOpened =
    typeof session.portais.pesqbrasil.tabId === "number" &&
    typeof session.portais.ecac.tabId === "number";
  const canCloseCapturedTab =
    portalKey !== "cadunico" ||
    (cadunicoDependenciesOpened && Boolean(session.portais.tse));
  if (
    portal.status === "concluido" &&
    canCloseCapturedTab &&
    typeof portal.tabId === "number"
  ) {
    try {
      await browser.tabs.remove(portal.tabId);
    } catch {
      // A aba pode ter sido fechada pela conclusao concorrente de outro portal.
    }
  }

  await finalizeIfReady(session, getTabManager);
}

async function finalizeCadastroSession(
  session: CadastroSession,
  _getTabManager?: () => any,
): Promise<void> {
  // Cancela timeout global
  // Busca dados brutos coletados para o mergeRequest
  const settings = await StorageService.getSettings();
  const raw: Record<string, Partial<PessoaData>> = (settings.pessoaData_projections as any) || {};

  session.sessionState = "complete";
  // O inspetor preserva pessoaData_raw completo. A revisão recebe apenas as
  // projeções por fonte; para TSE, isso limita estruturalmente a título, zona e seção.
  session.mergeRequest = { raw };
  await saveSession(session);

  // Fecha tabs dos portais
  const tabIds = [
    session.portais.cadunico.tabId,
    session.portais.pesqbrasil.tabId,
    session.portais.ecac.tabId,
    session.portais.tse?.tabId,
    session.portais.inss?.tabId,
  ].filter((id): id is number => typeof id === "number");

  if (tabIds.length > 0) {
    try {
      await browser.tabs.remove(tabIds);
    } catch (e) {
      // Tabs podem já ter sido fechadas
    }
  }

  // Remove container com pequeno delay (tabs precisam fechar primeiro)
  setTimeout(async () => {
    try {
      await (browser as any).contextualIdentities.remove(session.cookieStoreId);
    } catch (e) {}
  }, 2000);
}

async function handleCheckReloginEligible(
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const tabId = sender?.tab?.id;
  if (!tabId) return { success: true, eligible: false };
  const creds = await StorageService.getCredentials(tabId);
  return { success: true, eligible: Boolean(creds?.cpf && creds?.senha) };
}

async function handleTriggerRelogin(
  sender?: browser.runtime.MessageSender,
  getTabManager?: () => any,
): Promise<MessageResponse> {
  const tabId = sender?.tab?.id;
  if (!tabId || !getTabManager) return { success: false, error: "Sem contexto de aba." };
  await getTabManager().triggerReloginForTab(tabId);
  return { success: true };
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
