import type { CadastroPortalOutcomeKind, CadastroPortalId } from "../../modules/automation/cadastro/contracts";
import { resolveCadastroPortalBySource } from "../../modules/automation/cadastro/portal-registry";
import { isCadastroPortalTerminal } from "../../modules/automation/cadastro/session-status";
import type { CadastroSession } from "../../shared/types";

export type CadastroReportedOutcome = Extract<
  CadastroPortalOutcomeKind,
  "not_found" | "unavailable" | "failed"
>;

const PORTAL_STATUS_MESSAGES: Record<string, string> = {
  usuario_sem_selo_confiabilidade:
    "Conta Gov.br em nível bronze. Aumente para o nível ouro para acessar este portal.",
};

export type CadastroFinalizationPhase =
  | "collecting"
  | "awaiting_cadunico_dismissal"
  | "ready_to_finalize"
  | "complete"
  | "error";

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
  portal.statusMessage = PORTAL_STATUS_MESSAGES[evidence];
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
  return getCadastroFinalizationPhase(session) === "ready_to_finalize";
}

export function isCadastroCollectionComplete(session: CadastroSession): boolean {
  const expected: CadastroPortalId[] = ["cadunico", "pesqbrasil", "esocial"];
  if (session.portais.inss) expected.push("inss");
  if (session.portais.tse) expected.push("tse");
  return expected.every((portalId) => isCadastroPortalTerminal(session.portais[portalId]));
}

/**
 * A sessão persistida mantém os flags legados consumidos pela interface. Esta
 * projeção concentra a decisão de finalização em fases mutuamente exclusivas.
 */
export function getCadastroFinalizationPhase(session: CadastroSession): CadastroFinalizationPhase {
  if (session.sessionState === "error") return "error";
  if (session.sessionState === "complete") return "complete";
  if (!isCadastroCollectionComplete(session)) return "collecting";
  if (session.cadunicoDismissalRequired) return "awaiting_cadunico_dismissal";
  return "ready_to_finalize";
}
