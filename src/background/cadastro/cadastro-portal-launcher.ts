import type { CadastroPortalId } from "../../modules/automation/cadastro/contracts";
import type { CadastroSession, UserCredentials } from "../../shared/types";
import { StorageService } from "../services/storage";

type CadastroLaunchPortal = Extract<CadastroPortalId, "inss" | "tse">;

export async function getCadastroLaunchCredentials(
  session: CadastroSession,
): Promise<UserCredentials | null> {
  const cadUnicoTabId = session.portais.cadunico.tabId;
  return cadUnicoTabId ? StorageService.getCredentials(cadUnicoTabId) : null;
}

export async function createCadastroPortalTab(
  session: CadastroSession,
  tabManager: any,
  credentials: UserCredentials,
  portal: CadastroLaunchPortal,
  url: string,
): Promise<number | null> {
  return tabManager.createSessionInContainer(
    url,
    credentials.cpf,
    credentials.senha,
    session.cookieStoreId,
    credentials.nome,
    portal,
    session.sessionId,
  );
}
