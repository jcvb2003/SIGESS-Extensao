import type { MessageResponse } from "../../shared/types";
import { StorageService } from "../services/storage";
import { getActiveCadastroSession } from "./cadastro-session-store";
import { INSS_DATA_URL, isInssDataUrl, isInssUrl } from "../../modules/automation/inss/routes";
import { isTseAutoatendimentoUrl } from "../../modules/automation/tse/routes";

export async function canSubmitCadastroTse(
  sender?: browser.runtime.MessageSender,
): Promise<MessageResponse> {
  const session = await getActiveCadastroSession();
  const tabId = sender?.tab?.id;
  if (!session || typeof tabId !== "number" || session.portais.tse?.tabId !== tabId) {
    return { success: true, allowed: false };
  }

  const creds = await StorageService.getCredentials(tabId);
  return {
    success: true,
    allowed: Boolean(
      creds?.isCadastroAutomatico &&
      creds.portalType === "tse" &&
      creds.cadastroSessionId === session.sessionId &&
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
