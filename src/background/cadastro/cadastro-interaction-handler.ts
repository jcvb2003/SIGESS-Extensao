import type { MessageResponse } from "../../shared/types";
import { StorageService } from "../services/storage";
import { getActiveCadastroSession } from "./cadastro-session-store";
import { INSS_DATA_URL, isInssDataUrl, isInssUrl } from "../../modules/automation/inss/routes";
import { ESOCIAL_CAEPF_COLLECTION_URL, isEsocialHomeUrl } from "../../modules/automation/esocial/routes";
import { isTseAutoatendimentoUrl } from "../../modules/automation/tse/routes";
import { finalizeCadastroSession, openCadastroInss } from "./cadastro-orchestrator";
import { saveCadastroSession } from "./cadastro-session-store";
import { isCadastroPortalTerminal } from "../../modules/automation/cadastro/session-status";

export async function canSubmitCadastroTse(
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const session = await getActiveCadastroSession();
  const tabId = sender?.tab?.id;
  if (!session || typeof tabId !== "number") {
    return { success: true, allowed: false };
  }

  const creds = await StorageService.getCredentials(tabId);
  const belongsToActiveTseSession = Boolean(
    creds?.isCadastroAutomatico &&
    creds.portalType === "tse" &&
    creds.cadastroSessionId === session.sessionId,
  );

  // A aba pode iniciar o content script antes de o orquestrador persistir
  // session.portais.tse.tabId. A identidade da sessão gravada nas credenciais
  // da própria aba é a fonte segura durante essa janela de criação.
  const tsePortal = session.portais.tse;
  const tabIsRegistered = tsePortal?.tabId === tabId;
  const tabRegistrationPending = Boolean(
    tsePortal && typeof tsePortal.tabId !== "number",
  );
  return {
    success: true,
    allowed: Boolean(
      belongsToActiveTseSession &&
      (tabIsRegistered || tabRegistrationPending) &&
      isTseAutoatendimentoUrl(sender?.tab?.url || ""),
    ),
  };
}

export async function reportGovBrContactConfirmation(
  sender?: browser.runtime.MessageSender,
  getTabManager?: () => any,
): Promise<MessageResponse> {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") return { success: true, interactionUpdated: false };
  const creds = await StorageService.getCredentials(tabId);
  if (!creds?.isCadastroAutomatico || !creds.cadastroSessionId) {
    return { success: true, interactionUpdated: false };
  }
  const session = await getActiveCadastroSession();
  if (!session || session.sessionId !== creds.cadastroSessionId || session.portais.cadunico.tabId !== tabId) {
    return { success: true, interactionUpdated: false };
  }

  session.interactionRequired = {
    type: "govbr_contact_confirmation",
    message: "Confirmação de contato necessária no CadÚnico. Coleta pelo Meu INSS em andamento...",
    tabId,
  };

  if (!session.cadunicoDismissalRequired) {
    const cadunico = session.portais.cadunico;
    if (!isCadastroPortalTerminal(cadunico)) {
      cadunico.status = "indisponivel";
      cadunico.evidence = "confirmacao_contato_pendente";
      cadunico.updatedAt = Date.now();
    }
    session.cadunicoDismissalRequired = true;
    session.cadunicoDismissalReady = false;
    await saveCadastroSession(session);
    if (getTabManager) await openCadastroInss(session, getTabManager);
    return { success: true, interactionUpdated: true };
  }

  await saveCadastroSession(session);
  return { success: true, interactionUpdated: true };
}

export async function dismissCadunicoAndFinalizeCadastro(): Promise<MessageResponse> {
  const session = await getActiveCadastroSession();
  if (!session?.cadunicoDismissalRequired || !session.cadunicoDismissalReady) {
    return { success: true, dismissed: false };
  }

  session.cadunicoDismissalRequired = false;
  session.cadunicoDismissalReady = false;
  session.interactionRequired = undefined;
  await saveCadastroSession(session);
  await finalizeCadastroSession(session);
  return { success: true, dismissed: true };
}

export async function navigateAuthenticatedCadastroInss(
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") return { success: true, navigated: false };
  const session = await getActiveCadastroSession();
  const credentials = await StorageService.getCredentials(tabId);
  if (!session || session.portais.inss?.tabId !== tabId || !credentials?.isCadastroAutomatico || credentials.portalType !== "inss" || credentials.cadastroSessionId !== session.sessionId) {
    return { success: true, navigated: false };
  }
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !isInssUrl(tab.url) || isInssDataUrl(tab.url)) {
    return { success: true, navigated: false };
  }
  await StorageService.updateCredentials(tabId, {
    loginConcluido: true,
    status: "redirecionando",
    statusTitle: "Login concluído",
    statusDescription: "Acessando dados cadastrais do Meu INSS...",
  });
  await browser.tabs.update(tabId, { url: INSS_DATA_URL });
  return { success: true, navigated: true };
}

export async function navigateAuthenticatedCadastroEsocial(
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") return { success: true, navigated: false };
  const session = await getActiveCadastroSession();
  const credentials = await StorageService.getCredentials(tabId);
  if (!session || session.portais.esocial.tabId !== tabId || !credentials?.isCadastroAutomatico || credentials.portalType !== "esocial" || credentials.cadastroSessionId !== session.sessionId) {
    return { success: true, navigated: false };
  }
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !isEsocialHomeUrl(tab.url) || session.portais.esocial.postLoginNavigationIssued) {
    return { success: true, navigated: false };
  }

  session.portais.esocial.postLoginNavigationIssued = true;
  session.portais.esocial.updatedAt = Date.now();
  await saveCadastroSession(session);
  await StorageService.updateCredentials(tabId, {
    loginConcluido: true,
    status: "redirecionando",
    statusTitle: "Login concluído",
    statusDescription: "Acessando a integração CAEPF do eSocial...",
  });
  await browser.tabs.update(tabId, { url: ESOCIAL_CAEPF_COLLECTION_URL });
  return { success: true, navigated: true };
}
