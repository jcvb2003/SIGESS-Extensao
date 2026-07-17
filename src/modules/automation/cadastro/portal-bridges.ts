export function resolvePortalBridge(hostname: string): string | null {
  if (hostname.includes("pesqbrasil-pescadorprofissional")) return "assets/pesqbrasil_bridge.js";
  if (hostname.includes("caepf.receita.fazenda.gov.br") || hostname.includes("cav.receita.fazenda.gov.br")) return "assets/caepf_bridge.js";
  if (hostname.includes("cadunico.dataprev.gov.br")) return "assets/cadunico_bridge.js";
  if (hostname.includes("tse.jus.br")) return "assets/tse_bridge.js";
  if (hostname.includes("meu.inss.gov.br")) return "assets/inss_bridge.js";
  return null;
}
