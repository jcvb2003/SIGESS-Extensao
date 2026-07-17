import type { PessoaData } from "../../../shared/types";

export type CadastroPortalId = "cadunico" | "pesqbrasil" | "ecac" | "tse" | "inss";

export type CadastroSourceId =
  | "cadunico"
  | "cadunico_adv"
  | "pesqbrasil"
  | "pesqbrasil_mpa"
  | "ecac_cpf"
  | "ecac_caepf"
  | "tse"
  | "inss";

export interface CadastroPortalDefinition {
  id: CadastroPortalId;
  sources: readonly CadastroSourceId[];
  entryUrl?: string;
  collectionUrl?: string;
}

export interface CadastroPortalRuntimeContext {
  sessionActive: boolean;
}

export interface CadastroPortalRuntimeAdapter {
  readonly id: CadastroPortalId;
  run(context: CadastroPortalRuntimeContext): void;
}

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
