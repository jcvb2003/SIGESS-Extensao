import type { CadastroPortalOutcomeKind, CadastroPortalId } from "../../modules/automation/cadastro/contracts";
import { resolveCadastroPortalBySource } from "../../modules/automation/cadastro/portal-registry";
import { isCadastroPortalTerminal } from "../../modules/automation/cadastro/session-status";
import type { CadastroSession } from "../../shared/types";

export type CadastroReportedOutcome = Extract<
  CadastroPortalOutcomeKind,
  "not_found" | "unavailable" | "failed"
>;

export function applyCadastroPortalOutcome(
  session: CadastroSession,
  portalId: CadastroPortalId,
  outcome: CadastroReportedOutcome,
  evidence: string,
): boolean {
  const portal = session.portais[portalId];
  if (!portal) return false;

  portal.status = outcome === "not_found"
    ? "nao_encontrado"
    : outcome === "unavailable"
      ? "indisponivel"
      : "erro";
  portal.evidence = evidence;
  portal.updatedAt = Date.now();
  return true;
}

export function getCadastroPortalForDataSource(
  session: CadastroSession,
  source: string,
): CadastroPortalId | null {
  const portalId = resolveCadastroPortalBySource(source);
  if (!portalId) return null;
  return session.portais[portalId] ? portalId : null;
}

export function isCadastroSessionReadyToFinalize(session: CadastroSession): boolean {
  const expected: CadastroPortalId[] = ["cadunico", "pesqbrasil", "ecac"];
  if (session.portais.inss) expected.push("inss");
  if (session.portais.tse) expected.push("tse");
  return expected.every((portalId) => isCadastroPortalTerminal(session.portais[portalId]));
}
