import type { CadastroPortalId } from "../../modules/automation/cadastro/contracts";
import { isCadastroPortalTerminal } from "../../modules/automation/cadastro/session-status";
import type { CadastroSession } from "../../shared/types";

export interface CadastroPortalTab {
  portalId: CadastroPortalId;
  tabId: number;
}

export function getCompletedCadastroPortalTabsExceptCadunico(
  session: CadastroSession,
): CadastroPortalTab[] {
  const portalIds: CadastroPortalId[] = ["pesqbrasil", "esocial", "inss", "tse"];
  return portalIds.flatMap((portalId) => {
    const portal = session.portais[portalId];
    if (!portal || !isCadastroPortalTerminal(portal) || typeof portal.tabId !== "number") return [];
    return [{ portalId, tabId: portal.tabId }];
  });
}

export async function closeCadastroPortalTab(tabId: number, portalId: CadastroPortalId): Promise<void> {
  try {
    await browser.tabs.get(tabId);
  } catch {
    // A reconciliação pode alcançar uma aba já encerrada por outro evento.
    return;
  }

  let confirmRemoval: (() => void) | undefined;
  const removed = new Promise<void>((resolve) => {
    confirmRemoval = resolve;
  });
  const onRemoved = (removedTabId: number) => {
    if (removedTabId !== tabId) return;
    browser.tabs.onRemoved.removeListener(onRemoved);
    confirmRemoval?.();
  };

  browser.tabs.onRemoved.addListener(onRemoved);
  try {
    await browser.tabs.remove(tabId);
    await removed;
  } catch (error) {
    browser.tabs.onRemoved.removeListener(onRemoved);
    console.warn(`[SIGESS] Não foi possível fechar a aba ${portalId} (${tabId}).`, error);
  }
}

export async function closeCompletedCadastroTabsExceptCadunico(session: CadastroSession): Promise<void> {
  await Promise.all(getCompletedCadastroPortalTabsExceptCadunico(session).map(({ portalId, tabId }) =>
    closeCadastroPortalTab(tabId, portalId),
  ));
}
