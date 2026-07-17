import type { CadastroPortalId, CadastroPortalOutcomeKind } from "./contracts";

type ReportablePortal = Extract<CadastroPortalId, "cadunico" | "tse" | "inss">;
type ReportableOutcome = Extract<CadastroPortalOutcomeKind, "not_found" | "failed" | "unavailable">;

export function reportCadastroPortalOutcome(
  portal: ReportablePortal,
  outcome: ReportableOutcome,
  reason: string,
): void {
  const api = (globalThis.browser || globalThis.chrome) as any;
  api?.runtime?.sendMessage?.({
    action: "REPORT_CADASTRO_PORTAL_OUTCOME",
    portal,
    outcome,
    reason,
  });
}
