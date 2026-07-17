import { CADUNICO_HOST } from "../cadunico/routes";
import { INSS_HOST } from "../inss/routes";
import { CAEPF_HOST, ECAC_HOST } from "../ecac/routes";
import { PESQBRASIL_AGRO_HOST, PESQBRASIL_MPA_HOST } from "../pesqbrasil/routes";
import { TSE_HOST } from "../tse/routes";

export function resolvePortalBridge(hostname: string): string | null {
  if (hostname.includes(PESQBRASIL_MPA_HOST) || hostname.includes(PESQBRASIL_AGRO_HOST)) return "assets/pesqbrasil_bridge.js";
  if (hostname.includes(CAEPF_HOST) || hostname.includes(ECAC_HOST)) return "assets/caepf_bridge.js";
  if (hostname.includes(CADUNICO_HOST)) return "assets/cadunico_bridge.js";
  if (hostname.includes(TSE_HOST)) return "assets/tse_bridge.js";
  if (hostname.includes(INSS_HOST)) return "assets/inss_bridge.js";
  return null;
}
