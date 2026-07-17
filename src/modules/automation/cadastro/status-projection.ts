import type { CadastroPortalEntry, CadastroSession, PessoaData } from "../../../shared/types";

export type CaptureStatus = "collected" | "skipped" | "not_found" | "waiting" | "failed" | "idle";
export type CaptureStatusId = "cadunico" | "tse" | "pesqbrasil" | "caepf" | "ecac";

export type CaptureStatusProjection = Record<CaptureStatusId, CaptureStatus>;

function projectPortal(entry?: CadastroPortalEntry): CaptureStatus {
  if (!entry) return "idle";
  if (entry.status === "concluido") return "collected";
  if (entry.status === "dispensado") return "skipped";
  if (entry.status === "nao_encontrado") return "not_found";
  if (entry.status === "erro" || entry.status === "indisponivel") return "failed";
  return "waiting";
}

export function projectCaptureStatuses(
  data?: PessoaData,
  session?: CadastroSession,
): CaptureStatusProjection {
  const sources = data?.fontes || {};
  const cadUnicoCollected = Boolean(sources.cadunico?.capturado || sources.cadunico_adv?.capturado);
  const inssCollected = Boolean(sources.inss?.capturado);
  const tseCollected = Boolean(sources.tse?.capturado);
  const pesqBrasilCollected = Boolean(sources.pesqbrasil?.capturado || sources.pesq_brasil?.capturado);
  const caepfCollected = Boolean(sources.ecac_caepf?.capturado || sources.caepf?.capturado || sources.esocial?.capturado);
  const ecacCollected = Boolean(sources.ecac_cpf?.capturado || sources.ecac_caepf?.capturado);

  return {
    cadunico: cadUnicoCollected || inssCollected ? "collected" : projectPortal(session?.portais.cadunico),
    tse: tseCollected ? "collected" : projectPortal(session?.portais.tse),
    pesqbrasil: pesqBrasilCollected ? "collected" : projectPortal(session?.portais.pesqbrasil),
    caepf: caepfCollected ? "collected" : projectPortal(session?.portais.ecac),
    ecac: ecacCollected ? "collected" : projectPortal(session?.portais.ecac),
  };
}

export function isCaptureStatusSatisfied(status: CaptureStatus): boolean {
  return status === "collected" || status === "skipped" || status === "not_found";
}
