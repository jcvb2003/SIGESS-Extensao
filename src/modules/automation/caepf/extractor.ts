import { PessoaData } from "../../../shared/types";

/**
 * Realiza o parse dos dados brutos interceptados das APIs do CAEPF/e-CAC.
 * A resposta costuma ser um array JSON direto na raiz.
 */
export function parseCaepfData(payload: any): Partial<PessoaData> | null {
  try {
    // Resposta é array direto — sem wrapper "content"
    const arr = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.content)
        ? payload.content
        : payload && typeof payload === "object"
          ? [payload]
          : undefined;
    if (!arr || !Array.isArray(arr) || arr.length === 0) return null;

    const item = arr[0];
    const ceiRaw = item.matriculaCei?.id?.matriculaCei;

    return {
      nome:              item.nomeContribuinte || undefined,
      cpf:               item.numeroCpf || undefined,
      caepf:             item.numeroCaepf || undefined,
      cei:               ceiRaw ? String(ceiRaw) : undefined,
      situacaoCaepf:     item.matriculaCei?.situacao?.descricao || undefined,
      cnae:              item.matriculaCei?.cnaePreponderante?.descricao || undefined,
      cidade:            item.nomeMunicipio || undefined,
      uf:                item.uf || undefined,
      cep:               item.numeroCep ? String(item.numeroCep) : undefined,
    };
  } catch (e) {
    console.error("[SIGESS] Erro ao parsear dados do CAEPF", e);
    return null;
  }
}

