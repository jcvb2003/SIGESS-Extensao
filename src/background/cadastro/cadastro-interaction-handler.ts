import type { MessageResponse } from "../../shared/types";
import { StorageService } from "../services/storage";
import { getActiveCadastroSession } from "./cadastro-session-store";
import { INSS_DATA_URL, isInssDataUrl, isInssUrl } from "../../modules/automation/inss/routes";
import { isTseAutoatendimentoUrl } from "../../modules/automation/tse/routes";
import { evaluateTseRequirement, openCadastroInss } from "./cadastro-orchestrator";
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

export async function useInssAsCadastroAlternative(
  _sender: browser.runtime.MessageSender | undefined,
  getTabManager: () => any,
): Promise<MessageResponse> {
  const session = await getActiveCadastroSession();
  const tabId = session?.interactionRequired?.tabId;
  if (typeof tabId !== "number" || !session || session.interactionRequired?.type !== "govbr_contact_confirmation") {
    return { success: true, switched: false };
  }

  const cadunico = session.portais.cadunico;
  if (cadunico.tabId === tabId && !isCadastroPortalTerminal(cadunico)) {
    cadunico.status = "indisponivel";
    cadunico.evidence = "confirmacao_contato_pendente";
    cadunico.updatedAt = Date.now();
  }
  session.interactionRequired = undefined;
  await saveCadastroSession(session);
  await openCadastroInss(session, getTabManager);
  await evaluateTseRequirement(session, getTabManager);
  // A aba do CadÚnico permanece aberta: o TSE usa suas credenciais para criar
  // a própria sessão. Ela será encerrada na finalização do cadastro.
  return { success: true, switched: true };
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
