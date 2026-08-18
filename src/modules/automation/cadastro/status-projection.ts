import type { CadastroPortalEntry, CadastroSession, PessoaData } from "../../../shared/types";
import { hasMeaningfulSourceData } from "./source-projections";

export type CaptureStatus = "collected" | "skipped" | "not_found" | "waiting" | "failed" | "idle";
export type CaptureStatusId = "cadunico" | "tse" | "pesqbrasil" | "caepf";

export type CaptureStatusProjection = Record<CaptureStatusId, CaptureStatus>;

function projectPortal(entry?: CadastroPortalEntry): CaptureStatus {
  if (!entry) return "idle";
  if (entry.status === "concluido") return "idle";
  if (entry.status === "dispensado") return "skipped";
  if (entry.status === "nao_encontrado") return "not_found";
  if (entry.status === "erro" || entry.status === "indisponivel") return "failed";
  return "waiting";
}

export function projectCaptureStatuses(
  data?: PessoaData,
  session?: CadastroSession,
  rawSources?: Record<string, Partial<PessoaData>>,
): CaptureStatusProjection {
  const sources = data?.fontes || {};
  const sourceCollected = (ids: string[]) => {
    const marked = ids.some((id) => sources[id]?.capturado);
    if (!marked || rawSources === undefined) return marked;
    return ids.some((id) => hasMeaningfulSourceData(rawSources[id]));
  };
  const hasElectoralData = [data?.tituloEleitor, data?.zonaEleitoral, data?.secaoEleitoral]
    .every((value) => {
      const digits = String(value ?? "").replace(/\D/g, "");
      return Boolean(digits) && !/^0+$/.test(digits);
    });
  const cadUnicoCollected = sourceCollected(["cadunico", "cadunico_adv"]);
  const inssCollected = sourceCollected(["inss"]);
  const tseCollected = sourceCollected(["tse"]) || Boolean(sources.tse?.capturado && hasElectoralData);
  const pesqBrasilCollected = sourceCollected(["pesqbrasil", "pesq_brasil"]);
  const caepfCollected = sourceCollected(["ecac_caepf", "caepf", "esocial"]);

  return {
    cadunico: cadUnicoCollected || inssCollected ? "collected" : projectPortal(session?.portais.cadunico),
    tse: tseCollected
      ? "collected"
      : session?.portais.tse?.status === "dispensado" && hasElectoralData
        ? "skipped"
        : session?.portais.tse?.status === "dispensado"
          ? "idle"
        : projectPortal(session?.portais.tse),
    pesqbrasil: pesqBrasilCollected ? "collected" : projectPortal(session?.portais.pesqbrasil),
    caepf: caepfCollected ? "collected" : projectPortal(session?.portais.esocial),
  };
}

export function isCaptureStatusSatisfied(status: CaptureStatus): boolean {
  return status === "collected" || status === "skipped";
}
