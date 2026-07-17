import { CADUNICO_HOST } from "../cadunico/routes";
import { INSS_HOST } from "../inss/routes";

export function resolvePortalBridge(hostname: string): string | null {
  if (hostname.includes("pesqbrasil-pescadorprofissional")) return "assets/pesqbrasil_bridge.js";
  if (hostname.includes("caepf.receita.fazenda.gov.br") || hostname.includes("cav.receita.fazenda.gov.br")) return "assets/caepf_bridge.js";
  if (hostname.includes(CADUNICO_HOST)) return "assets/cadunico_bridge.js";
  if (hostname.includes("tse.jus.br")) return "assets/tse_bridge.js";
  if (hostname.includes(INSS_HOST)) return "assets/inss_bridge.js";
  return null;
}
