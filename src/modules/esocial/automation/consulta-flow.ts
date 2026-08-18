import type { EsocialConsultaCompetencia } from "../../../shared/types";
import { Utils } from "../../../shared/utils/dom-helpers";
import { extractCompetenciaTableRows } from "../utils/esocial-extractors";

export function extrairCompetenciasDaPagina(ano?: string): EsocialConsultaCompetencia[] {
  return extractCompetenciaTableRows(document, ano).map((row) => ({
    competencia: row.competencia,
    situacao: row.situacao,
    valorDeclarado: row.valorDeclarado,
    valorPago: row.valorPago,
  }));
}

export async function consultarCompetenciasDaPagina(ano: string): Promise<EsocialConsultaCompetencia[]> {
  const tableBody = await Utils.waitForElement(
    "table tbody",
    15000,
    document,
    false,
  );

  if (!tableBody) {
    throw new Error("Não foi possível localizar a tabela de competências do eSocial.");
  }

  return extrairCompetenciasDaPagina(ano);
}
