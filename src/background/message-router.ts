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
import { INSS_LOGIN_URL, isInssUrl } from "../modules/automation/inss/routes";
import {
  PESQBRASIL_MPA_URL,
  isPesqBrasilMpaUrl,
} from "../modules/automation/pesqbrasil/routes";
import { MTE_URL } from "../modules/automation/mte/routes";
import {
  getActiveCadastroSession,
} from "./cadastro/cadastro-session-store";
import {
  type CadastroReportedOutcome,
} from "./cadastro/cadastro-session-controller";
import {
  cancelCadastroAutomatico,
  iniciarCadastroAutomatico,
} from "./cadastro/cadastro-session-lifecycle";
import {
  canSubmitCadastroTse,
  navigateAuthenticatedCadastroInss,
  reportGovBrContactConfirmation,
  useInssAsCadastroAlternative,
} from "./cadastro/cadastro-interaction-handler";
import {
  processCadastroDataArrival,
  processCadastroPortalOutcome,
} from "./cadastro/cadastro-orchestrator";
import { XPI_INSTALL_URL } from "../shared/services/update-block";
import { clearStaticCacheRuntime } from "./services/static-cache-runtime";
import { clearStaticCache } from "./services/static-cache-policy";


const UPDATE_ALLOWED_ACTIONS = new Set([
  "checkLicense",
  "getGovBatchStatuses",
  "getESocialAutomationSettings",
  "getAutoRegistrationSnapshot",
  "openExtensionUpdate",
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
      case "getESocialDownloadIdentity":
        return await handleGetESocialDownloadIdentity(sender);
      case "getAutoRegistrationSnapshot":
        return await handleGetAutoRegistrationSnapshot();
      case "updateGovBatchStatus":
        return await handleUpdateGovBatchStatus(message, sender);
      case "turboFillReap":
        return await handleTurboFillReap(message);
      case "iniciarCadastroAutomatico":
        return await iniciarCadastroAutomatico(message, getTabManager);
      case "cancelarCadastroAutomatico":
        return await cancelCadastroAutomatico();
      case "SAVE_PESSOA_DATA":
        return await handleSavePessoaData(message, getTabManager, sender);
      case "REPORT_CADASTRO_PORTAL_OUTCOME":
        return await handleCadastroPortalOutcome(message, getTabManager, sender);
      case "canSubmitCadastroTse":
        return await canSubmitCadastroTse(sender);
      case "govBrContactConfirmationDetected":
        return await reportGovBrContactConfirmation(sender);
      case "govBrLoginDomReady": {
        const tabId = sender?.tab?.id;
        if (typeof tabId !== "number" || sender?.tab?.url?.includes("sso.acesso.gov.br") !== true) {
          return { success: false, error: "Sinal GOV.BR sem aba válida." };
        }
        await getTabManager().handleGovBrLoginDomReady(tabId);
        return { success: true };
      }
      case "usarInssComoAlternativa":
        return await useInssAsCadastroAlternative(sender, getTabManager);
      case "limparDadosCapturados": {
        const settings = await StorageService.clearCapturedPessoaData();
        return { success: true, settings };
      }
      case "clearStaticCache":
        await Promise.all([clearStaticCacheRuntime(), clearStaticCache()]);
        return { success: true };
      case "abrirDataInspector":
        return await openDataInspector();
      case "openExtensionUpdate":
        return await handleOpenExtensionUpdate();
      case "inssAuthenticated":
        return await navigateAuthenticatedCadastroInss(sender);
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
      raw: settings.pessoaData_projections || {},
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
    if (message.settings.autoRegistrationEnabled === false && current.autoRegistrationEnabled) {
      await cancelCadastroAutomatico();
      const disabledSettings = await StorageService.disableAutomaticCapture();
      return { success: true, settings: disabledSettings };
    }
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
    mte: MTE_URL,
    pesqbrasil_mpa: PESQBRASIL_MPA_URL,
    esocial: "https://login.esocial.gov.br/",
    inss: INSS_LOGIN_URL,
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
        type as "mte" | "pesqbrasil_mpa" | "esocial" | "inss",
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

    const normalizedCpf = normalizeQueueCpf(cpf);
    if (normalizedCpf && queue.some((item) => normalizeQueueCpf(item.cpf) === normalizedCpf)) {
      return {
        success: false,
        error: "Este CPF já está na fila de login múltiplo.",
      };
    }

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
        : isInssUrl(url) ? "inss"
        : isPesqBrasilMpaUrl(url) ? "pesqbrasil_mpa"
        : "mte",
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
      : isInssUrl(url) ? "inss"
      : isPesqBrasilMpaUrl(url) ? "pesqbrasil_mpa"
      : "mte",
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

  const existingCpfs = new Set(queue.map((item) => normalizeQueueCpf(item.cpf)));
  const newQueueItems: MultiLoginItem[] = [];

  for (const item of rawItems) {
    if (!item?.cpf || !item?.senha || !item?.url) {
      continue;
    }

    if (newQueueItems.length >= availableSlots) {
      break;
    }

    const normalizedCpf = normalizeQueueCpf(item.cpf);
    if (!normalizedCpf || existingCpfs.has(normalizedCpf)) {
      continue;
    }

    existingCpfs.add(normalizedCpf);
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
  _data: Partial<PessoaData>,
  getTabManager?: () => any,
): void {
  _cadastroUpdateQueue = _cadastroUpdateQueue
    .then(() => processCadastroDataArrival(fonte, getTabManager))
    .catch(() => {});
}

function normalizeQueueCpf(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 11 ? digits.padStart(11, "0") : digits;
}

const getActiveSession = getActiveCadastroSession;
async function handleCadastroPortalOutcome(
  message: MessageRequest,
  getTabManager: () => any,
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const portalKey = message.portal as keyof CadastroSession["portais"] | undefined;
  const outcome = message.outcome as CadastroReportedOutcome | undefined;
  if (!portalKey || !outcome) {
    return { success: false, error: "Resultado do portal inválido." };
  }

  const session = await getActiveSession();
  const portal = session?.portais[portalKey];
  if (!session || !portal) return { success: true };
  if (!isRegisteredCadastroPortalSender(session, portalKey, sender)) {
    return { success: false, error: "aba_do_portal_nao_autorizada" };
  }

  await processCadastroPortalOutcome(session, portalKey, outcome, String(message.reason || outcome), getTabManager);
  return { success: true };
}

async function openDataInspector(): Promise<MessageResponse> {
  const url = browser.runtime.getURL("data_inspector.html");
  const existing = await browser.tabs.query({ url });
  const tab = existing[0];
  if (tab?.id !== undefined) {
    await browser.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) await browser.windows.update(tab.windowId, { focused: true });
    return { success: true, tabId: tab.id, reused: true };
  }
  const created = await browser.tabs.create({ url });
  return { success: true, tabId: created.id, reused: false };
}

async function handleOpenExtensionUpdate(): Promise<MessageResponse> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (activeTab?.id === undefined) {
    return {
      success: false,
      error: "Não foi possível localizar a aba ativa para instalar a atualização.",
    };
  }

  await browser.tabs.update(activeTab.id, { url: XPI_INSTALL_URL });
  return { success: true, tabId: activeTab.id };
}

async function handleGetESocialDownloadIdentity(
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const tabId = sender?.tab?.id;
  const credentials = typeof tabId === "number"
    ? await StorageService.getCredentials(tabId)
    : null;

  if (!credentials || credentials.portalType !== "esocial") {
    return { success: false, error: "NÃ£o foi possÃ­vel identificar a aba do eSocial." };
  }

  return {
    success: true,
    data: {
      cpf: String(credentials.cpf || "").replace(/\D/g, ""),
      nome: credentials.nome || credentials.cpf,
    },
  };
}

function isRegisteredCadastroPortalSender(
  session: CadastroSession,
  portal: keyof CadastroSession["portais"],
  sender?: browser.runtime.MessageSender,
): boolean {
  const tabId = sender?.tab?.id;
  return typeof tabId === "number" && session.portais[portal]?.tabId === tabId;
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

export async function handleDownloadESocialGuide(message: MessageRequest) {
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
