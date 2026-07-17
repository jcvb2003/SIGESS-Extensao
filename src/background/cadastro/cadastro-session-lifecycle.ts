import type { CadastroSession, MessageRequest, MessageResponse } from "../../shared/types";
import { StorageService } from "../services/storage";
import {
  getActiveCadastroSession,
  removeCadastroSession,
  saveCadastroSession,
} from "./cadastro-session-store";

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

export async function cancelCadastroAutomatico(): Promise<MessageResponse> {
  const session = await getActiveCadastroSession();
  if (!session) return { success: true };
  await clearStaleCadastroSession(session);
  return { success: true };
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
      "https://cadunico.dataprev.gov.br/#/home",
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
