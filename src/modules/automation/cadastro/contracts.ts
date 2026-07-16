import { PessoaData } from "../../../shared/types";

export type CadastroPortalId = "cadunico" | "pesqbrasil" | "ecac" | "tse" | "inss";

export type CadastroPortalOutcomeKind =
  | "collected"
  | "not_found"
  | "skipped"
  | "unavailable"
  | "failed";

export interface CadastroPortalOutcome {
  kind: CadastroPortalOutcomeKind;
  reason: string;
  data?: Partial<PessoaData>;
  snapshot?: unknown;
}

export interface CadastroSourceSnapshot {
  portal: CadastroPortalId;
  outcome: CadastroPortalOutcomeKind;
  evidence: string;
  collectedAt: number;
  data: unknown;
}
