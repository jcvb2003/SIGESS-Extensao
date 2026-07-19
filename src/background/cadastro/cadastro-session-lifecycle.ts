import type { CadastroSession, MessageRequest, MessageResponse } from "../../shared/types";
import { StorageService } from "../services/storage";
import {
  getActiveCadastroSession,
  removeCadastroSession,
  saveCadastroSession,
} from "./cadastro-session-store";
import { CADUNICO_HOME_URL } from "../../modules/automation/cadunico/routes";

async function isCadastroSessionStale(session: CadastroSession): Promise<boolean> {
  const tabIds = [
    session.portais.cadunico.tabId,
    session.portais.pesqbrasil?.tabId,
    session.portais.ecac?.tabId,
    session.portais.tse?.tabId,
  ].filter((id): id is number => typeof id === "number");

  if (tabIds.length === 0) return true;

  for (const tabId of tabIds) {
    try {
      await browser.tabs.get(tabId);
      return false;
    } catch {
      // Testa a próxima aba conhecida da sessão.
    }
  }
  return true;
}

async function clearStaleCadastroSession(session: CadastroSession): Promise<void> {
  try {
    await (browser as any).contextualIdentities.remove(session.cookieStoreId);
  } catch {
    // O container pode já ter sido removido.
  }
  await removeCadastroSession();
}

async function closeCadastroSessionTabs(session: CadastroSession): Promise<void> {
  const tabIds = [
    session.portais.cadunico.tabId,
    session.portais.pesqbrasil?.tabId,
    session.portais.ecac?.tabId,
    session.portais.tse?.tabId,
    session.portais.inss?.tabId,
  ].filter((id): id is number => typeof id === "number");

  for (const tabId of [...new Set(tabIds)]) {
    try {
      await browser.tabs.remove(tabId);
    } catch {
      // A aba pode já ter sido fechada pelo próprio portal ou pelo Firefox.
    }
  }
}

export async function cancelCadastroAutomatico(): Promise<MessageResponse> {
  const session = await getActiveCadastroSession();
  if (!session) return { success: true };

  const settings = await StorageService.getSettings();
  const raw = (settings.pessoaData_projections || {}) as Record<string, Record<string, unknown>>;
  const hasCapturedData = Object.values(raw).some((source) =>
    Object.entries(source || {}).some(([key, value]) =>
      key !== "fontes" && value !== undefined && value !== null && value !== "",
    ),
  );

  // Publica a conclusão parcial antes de fechar as abas para impedir que
  // eventos atrasados dos portais reativem a sessão durante o cancelamento.
  session.sessionState = "complete";
  if (hasCapturedData) session.mergeRequest = { raw: raw as any };
  await saveCadastroSession(session);

  await closeCadastroSessionTabs(session);
  try {
    await (browser as any).contextualIdentities.remove(session.cookieStoreId);
  } catch {
    // O container pode já ter sido removido por uma aba encerrada.
  }

  if (!hasCapturedData) await removeCadastroSession();
  return { success: true, hasCapturedData };
}

export async function iniciarCadastroAutomatico(
  message: MessageRequest,
  getTabManager: () => any,
): Promise<MessageResponse> {
  const { cpf, senha, nome } = message;
  if (!cpf || !senha) return { success: false, error: "CPF e senha são obrigatórios." };

  const existing = await getActiveCadastroSession();
  if (existing) {
    if (!await isCadastroSessionStale(existing)) {
      return { success: false, error: "sessao_ja_ativa" };
    }
    await clearStaleCadastroSession(existing);
  }

  if (!(browser as any).contextualIdentities) {
    return { success: false, error: "Containers Firefox não disponíveis. Ative a extensão Multi-Account Containers." };
  }

  // Cada execução inicia um novo ciclo de coleta. Remove projeções,
  // snapshots, fontes e dados sensíveis da pessoa anterior antes de abrir
  // qualquer portal.
  await StorageService.clearCapturedPessoaData();
  await StorageService.saveCadastroSenhaGovInss(senha);
  const sessionId = `cadastro-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const container = await (browser as any).contextualIdentities.create({
      name: `Cadastro-${String(cpf).slice(-4)}`,
      color: "green",
      icon: "briefcase",
    });
    const session: CadastroSession = {
      sessionId,
      cookieStoreId: container.cookieStoreId,
      sessionState: "active",
      startedAt: Date.now(),
      portais: {
        cadunico: { status: "abrindo" },
        pesqbrasil: { status: "aguardando" },
        ecac: { status: "aguardando" },
      },
    };
    await saveCadastroSession(session);

    const cadUnicoTabId = await getTabManager().createSessionInContainer(
      CADUNICO_HOME_URL,
      cpf, senha, session.cookieStoreId, nome, "cadunico", sessionId,
    );
    if (cadUnicoTabId) {
      session.portais.cadunico.tabId = cadUnicoTabId;
      await saveCadastroSession(session);
    }
    return { success: true, sessionId };
  } catch (error: any) {
    await removeCadastroSession();
    return { success: false, error: error.message };
  }
}
