import { parseHtml } from "./document-parser";
import { extractCompetenciaTableRows, extractMoneyValues } from "../utils/esocial-extractors";
import { buildEsocialUrl } from "./esocial-api";

export interface BoletoData {
  valorDeclarado: number;
  valorPago: number;
  situacao: string;
  emissaoUrl: string | null;
}

export interface ComercializacaoData {
  valorComercializado: number;
}

export type DataFetchResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_found" }
  | { status: "error"; error: string };

/**
 * Trigger server-side synchronization by fetching ListarPagamentos page.
 * This forces the eSocial server to sync internal state before we fetch actual data.
 * eSocial has a known delay where Declarado value isn't available until server syncs.
 */
async function syncServerState(competencia: string): Promise<void> {
  const syncUrl = buildEsocialUrl(
    `/FolhaPagamento/Listagem/ListarPagamentos?competencia=${competencia}`
  );

  const response = await fetch(syncUrl, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Falha ao sincronizar ListarPagamentos (HTTP ${response.status})`);
  }

  // Small delay to allow server to complete internal sync
  await new Promise(resolve => setTimeout(resolve, 500));

  console.debug("[SIGESS] Server state synchronized via ListarPagamentos");
}

/**
 * Fetch boleto data (Declarado, Pago values) from Competências page
 * Using HTTP fetch instead of DOM parsing
 */
export async function fetchBoletoData(competencia: string): Promise<DataFetchResult<BoletoData>> {
  try {
    // First, trigger server synchronization
    await syncServerState(competencia);

    const url = buildEsocialUrl(
      `/FolhaPagamento/Listagem/Competencias?ano=${competencia.slice(0, 4)}`
    );

    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const doc = parseHtml(html);

    const data = extractBoletoDataFromDocument(doc, competencia);
    if (data) return { status: "ok", data };

    console.warn("[SIGESS] Competência não encontrada na página");
    return { status: "not_found" };
  } catch (error) {
    console.error("[SIGESS] Erro ao buscar dados de boleto:", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractBoletoDataFromParsedRow(row: ReturnType<typeof extractCompetenciaTableRows>[number]): BoletoData {
  let emissaoUrl: string | null = null;
  if (row.emissaoHref) {
    const href = row.emissaoHref;
    const extracted = href.split("javascript:")[1]?.match(/['"]([^'"]+)['"]/)?.[1];
    if (extracted) emissaoUrl = buildEsocialUrl(extracted);
  }

  console.debug("[SIGESS] Boleto data fetched:", {
    competencia: row.competencia,
    situacao: row.situacao || "",
    valorDeclarado: row.valorDeclarado ?? 0,
    valorPago: row.valorPago,
    emissaoUrl,
    hasEmissaoUrl: !!emissaoUrl,
  });

  return {
    valorDeclarado: row.valorDeclarado ?? 0,
    valorPago: row.valorPago,
    situacao: row.situacao || "",
    emissaoUrl,
  };
}

function extractBoletoDataFromDocument(doc: Document, competencia: string): BoletoData | null {
  const row = extractCompetenciaTableRows(doc).find((candidate) => candidate.competencia === competencia);
  return row ? extractBoletoDataFromParsedRow(row) : null;
}

/** Reads the complete Competencias table for the generation preflight. */
export async function fetchBoletosDoAno(
  ano: string,
  contextoCompetencia?: string,
): Promise<Record<string, BoletoData>> {
  if (contextoCompetencia) await syncServerState(contextoCompetencia);

  const response = await fetch(
    buildEsocialUrl(`/FolhaPagamento/Listagem/Competencias?ano=${ano}`),
    { method: "GET", credentials: "include" },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const doc = parseHtml(await response.text());
  const result: Record<string, BoletoData> = {};
  for (const row of extractCompetenciaTableRows(doc, ano)) {
    result[row.competencia] = extractBoletoDataFromParsedRow(row);
  }

  console.debug("[SIGESS] Diagnóstico completo de competências concluído:", {
    ano,
    total: Object.keys(result).length,
    competencias: Object.keys(result),
  });
  return result;
}

/**
 * Fetch comercialização data (Valor Comercializado) from ComercializacaoProducao page
 * Using HTTP fetch instead of DOM parsing
 */
export async function fetchComercializacaoData(
  competencia: string,
): Promise<DataFetchResult<ComercializacaoData>> {
  try {
    const url = buildEsocialUrl(
      `/FolhaPagamento/SeguradoEspecial/ComercializacaoProducao?competencia=${competencia}`
    );

    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const doc = parseHtml(html);

    // Look for the valor-comercializado span in the page
    const valorSpan = doc.querySelector(".valor-comercializado");
    if (!valorSpan) {
      console.warn("[SIGESS] valor-comercializado não encontrado");
      return { status: "not_found" };
    }

    const valorText = valorSpan.textContent?.trim() || "0";
    const values = extractMoneyValues(valorText);
    const valorComercializado = values[0] ?? 0;

    console.debug("[SIGESS] Comercialização data fetched:", {
      competencia,
      valorComercializado,
    });

    return { status: "ok", data: { valorComercializado } };
  } catch (error) {
    console.error("[SIGESS] Erro ao buscar dados de comercialização:", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
