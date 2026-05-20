import {
  FORM_INDEX_REGEX,
  TIPOS_COMERCIALIZACAO_REGEX,
} from "../utils/esocial-constants";
import type {
  ComercializacaoPayload,
  ComercializacaoTipoPayload,
} from "../types";

export function buildComercializacaoPayload(
  doc: Document,
  competencia: string,
  valorComercializado: string,
): ComercializacaoPayload {
  console.debug("[SIGESS] buildComercializacaoPayload - valorComercializado param:", valorComercializado);
  const grouped = new Map<string, Record<string, string>>();
  const hiddenInputs = Array.from(
    doc.querySelectorAll('input[type="hidden"][name]'),
  ) as HTMLInputElement[];

  for (const input of hiddenInputs) {
    const match = FORM_INDEX_REGEX.exec(input.name);
    if (!match) continue;

    const [, index, fieldName] = match;
    const current = grouped.get(index) || {};
    current[fieldName] = input.value;
    grouped.set(index, current);
  }

  const payload = Array.from(grouped.entries())
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, fields]) => ({
      IdComercializacao: fields.IdComercializacao || "0",
      TipoInscricaoEstabelecimento: fields.TipoInscricaoEstabelecimento || "",
      InscricaoEstabelecimento: fields.InscricaoEstabelecimento || "",
      DescricaoEstabelecimento: fields.DescricaoEstabelecimento || "",
      Excluido: fields.Excluido || "False",
      Competencia: fields.Competencia || competencia,
      TiposComercializacao: extractTiposComercializacao(fields, valorComercializado),
    }));

  console.debug("[SIGESS] Payload final:", JSON.stringify(payload, null, 2));
  return payload;
}

function extractTiposComercializacao(
  fields: Record<string, string>,
  valorComercializado: string,
): ComercializacaoTipoPayload[] {
  const tipos = new Map<string, Partial<ComercializacaoTipoPayload>>();

  for (const [fieldName, value] of Object.entries(fields)) {
    const match = TIPOS_COMERCIALIZACAO_REGEX.exec(fieldName);
    if (!match) continue;

    const [, index, tipoField] = match;
    const current = tipos.get(index) || {};
    (current as Record<string, string>)[tipoField] = value;
    tipos.set(index, current);
  }

  return Array.from(tipos.entries())
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([index, tipo]) => ({
      CodigoTipo: tipo.CodigoTipo || "",
      RequerAdquirente: tipo.RequerAdquirente || "False",
      ValorComercializado:
        index === "0" ? valorComercializado : tipo.ValorComercializado || "0",
      Excluido: tipo.Excluido || "False",
      Adquirentes: [],
    }));
}
