import { parseHtml } from "./document-parser";
import { extractMoneyValues } from "../utils/esocial-extractors";
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

/**
 * Trigger server-side synchronization by fetching ListarPagamentos page.
 * This forces the eSocial server to sync internal state before we fetch actual data.
 * eSocial has a known delay where Declarado value isn't available until server syncs.
 */
async function syncServerState(competencia: string): Promise<void> {
  try {
    const syncUrl = buildEsocialUrl(
      `/FolhaPagamento/Listagem/ListarPagamentos?competencia=${competencia}`
    );

    await fetch(syncUrl, {
      method: "GET",
      credentials: "include",
    });

    // Small delay to allow server to complete internal sync
    await new Promise(resolve => setTimeout(resolve, 500));

    console.debug("[SIGESS] Server state synchronized via ListarPagamentos");
  } catch (error) {
    console.debug("[SIGESS] Falha ao sincronizar estado do servidor:", error);
    // Continue anyway - the sync is a best-effort optimization
  }
}

/**
 * Fetch boleto data (Declarado, Pago values) from Competências page
 * Using HTTP fetch instead of DOM parsing
 */
export async function fetchBoletoData(competencia: string): Promise<BoletoData> {
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

    // Find the table row for this competencia
    const rows = Array.from(doc.querySelectorAll("table tbody tr"));
    for (const row of rows) {
      const link = row.querySelector(`a[href*="competencia=${competencia}"]`);
      if (!link) continue;

      const cells = Array.from(row.querySelectorAll("td"));

      // Table structure:
      // [0]=Competência | [1]=Vencimento | [2]=Situação | [3]=Declarado | [4]=Pago | [5]=Detalhar | [6]=Ações

      const situacao = cells[2]?.textContent?.trim() || "";

      // Extract Declarado (column 3)
      const declaredText = cells[3]?.textContent?.trim() || "-";
      const declaredValues = extractMoneyValues(declaredText);
      let valorDeclarado = declaredValues[0] ?? 0;

      // Extract Pago (column 4)
      const paidText = cells[4]?.textContent?.trim() || "-";
      const paidValues = extractMoneyValues(paidText);
      const valorPago = paidValues[0] ?? 0;

      // Try to find "Emitir Guia" link
      const emitirGuiaLink = Array.from(row.querySelectorAll("a")).find(
        (a) =>
          (a.textContent || "").toLowerCase().includes("emitir") &&
          (a.getAttribute("href") || "").includes("EmitirGuia")
      );
      let emissaoUrl: string | null = null;
      if (emitirGuiaLink) {
        const href = emitirGuiaLink.getAttribute("href") || "";
        const extracted = href.split("javascript:")[1]?.match(/['"]([^'"]+)['"]/)?.[1];
        if (extracted) {
          emissaoUrl = buildEsocialUrl(extracted);
        }
      }

      console.debug("[SIGESS] Boleto data fetched:", {
        competencia,
        situacao,
        declaredText: cells[3]?.textContent?.trim(),
        declaredValues,
        paidText: cells[4]?.textContent?.trim(),
        paidValues,
        valorDeclarado,
        valorPago,
        hasEmissaoUrl: !!emissaoUrl,
        emissaoUrl,
      });

      return { valorDeclarado, valorPago, situacao, emissaoUrl };
    }

    console.warn("[SIGESS] Competência não encontrada na página");
    return { valorDeclarado: 0, valorPago: 0, situacao: "", emissaoUrl: null };
  } catch (error) {
    console.error("[SIGESS] Erro ao buscar dados de boleto:", error);
    return { valorDeclarado: 0, valorPago: 0, situacao: "", emissaoUrl: null };
  }
}

/**
 * Fetch comercialização data (Valor Comercializado) from ComercializacaoProducao page
 * Using HTTP fetch instead of DOM parsing
 */
export async function fetchComercializacaoData(competencia: string): Promise<ComercializacaoData> {
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
      return { valorComercializado: 0 };
    }

    const valorText = valorSpan.textContent?.trim() || "0";
    const values = extractMoneyValues(valorText);
    const valorComercializado = values[0] ?? 0;

    console.debug("[SIGESS] Comercialização data fetched:", {
      competencia,
      valorComercializado,
    });

    return { valorComercializado };
  } catch (error) {
    console.error("[SIGESS] Erro ao buscar dados de comercialização:", error);
    return { valorComercializado: 0 };
  }
}
