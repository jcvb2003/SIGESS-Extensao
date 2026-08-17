import type { EsocialConsultaCompetencia } from "../../../shared/types";
import { Utils } from "../../../shared/utils/dom-helpers";
import { extractCompetenciaFromUrl, extractMoneyValues } from "../utils/esocial-extractors";

function normalizeText(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function extractDeclaredValue(text: string): number | null {
  return extractMoneyValues(text)[0] ?? null;
}

function extractPaidValue(text: string): number {
  return extractMoneyValues(text)[0] ?? 0;
}

export function extrairCompetenciasDaPagina(ano?: string): EsocialConsultaCompetencia[] {
  const rows = Array.from(document.querySelectorAll("table tbody tr"));
  const competencias = new Map<string, EsocialConsultaCompetencia>();

  for (const row of rows) {
    const link = row.querySelector("a[href*='competencia=']") as HTMLAnchorElement | null;
    const competencia = extractCompetenciaFromUrl(link?.href || null);
    if (!competencia || (ano && !competencia.startsWith(ano))) continue;

    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 5) continue;

    competencias.set(competencia, {
      competencia,
      situacao: normalizeText(cells[2]?.textContent) || null,
      valorDeclarado: extractDeclaredValue(cells[3]?.textContent || ""),
      valorPago: extractPaidValue(cells[4]?.textContent || ""),
    });
  }

  return Array.from(competencias.values()).sort((left, right) =>
    right.competencia.localeCompare(left.competencia),
  );
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
