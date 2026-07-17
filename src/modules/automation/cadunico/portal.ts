import { fetchCadUnicoAdvanced } from "./fetcher";
import type { PessoaData } from "../../../shared/types";

export interface CadUnicoAdvancedPayload {
  cpf: string;
  bearer: string;
  xsrf: string;
  cnas: string;
  profile?: { identificador: number; numeroFamiliar: number } | null;
  profileNotFound?: boolean;
}

export async function processCadUnicoAdvancedCollection(
  payload: CadUnicoAdvancedPayload,
  save: (data: Partial<PessoaData>, source: string, snapshot?: unknown) => void,
  report: (outcome: "not_found" | "failed" | "unavailable", reason: string) => void,
): Promise<void> {
  const result = await fetchCadUnicoAdvanced(payload);
  if (result.kind === "collected") save(result.data, "cadunico_adv", result.data);
  else report(result.kind, result.reason);
}
