import type { CadastroPortalId } from "../../modules/automation/cadastro/contracts";
import { resolveCadastroPortalBySource } from "../../modules/automation/cadastro/portal-registry";
import type { CadastroSession, UserCredentials } from "../../shared/types";

export interface CadastroCollectionEvent {
  kind: "data_collected";
  sessionId: string;
  portalId: CadastroPortalId;
  source: string;
  sourceTabId: number;
}

const PORTAL_BY_TAB_TYPE: Partial<Record<NonNullable<UserCredentials["portalType"]>, CadastroPortalId>> = {
  cadunico: "cadunico",
  pesqbrasil_mpa: "pesqbrasil",
  esocial: "esocial",
  tse: "tse",
  inss: "inss",
};

export function createCadastroCollectionEvent(
  session: CadastroSession,
  source: string,
  tabId: number | undefined,
  credentials: UserCredentials | null,
): CadastroCollectionEvent | null {
  const portalId = resolveCadastroPortalBySource(source);
  if (
    !portalId ||
    typeof tabId !== "number" ||
    !credentials?.isCadastroAutomatico ||
    credentials.cadastroSessionId !== session.sessionId ||
    !credentials.portalType ||
    PORTAL_BY_TAB_TYPE[credentials.portalType] !== portalId
  ) {
    return null;
  }

  return {
    kind: "data_collected",
    sessionId: session.sessionId,
    portalId,
    source,
    sourceTabId: tabId,
  };
}
