import type { CadastroPortalDefinition, CadastroPortalId, CadastroSourceId } from "./contracts";
import { CADUNICO_HOME_URL } from "../cadunico/routes";
import { INSS_DATA_URL, INSS_LOGIN_URL } from "../inss/routes";
import { ESOCIAL_CAEPF_COLLECTION_URL, ESOCIAL_LOGIN_URL } from "../esocial/routes";
import { PESQBRASIL_MPA_URL } from "../pesqbrasil/routes";
import { TSE_QUERY_URL } from "../tse/routes";

export const CADASTRO_PORTAL_REGISTRY: Record<CadastroPortalId, CadastroPortalDefinition> = {
  cadunico: { id: "cadunico", sources: ["cadunico", "cadunico_adv"], entryUrl: CADUNICO_HOME_URL },
  pesqbrasil: { id: "pesqbrasil", sources: ["pesqbrasil", "pesqbrasil_mpa"], entryUrl: PESQBRASIL_MPA_URL },
  // A coleta continua sendo a mesma API CAEPF. O identificador da fonte é
  // preservado para não duplicar snapshots ou projeções; a entrada é eSocial.
  esocial: { id: "esocial", sources: ["ecac_caepf"], entryUrl: ESOCIAL_LOGIN_URL, collectionUrl: ESOCIAL_CAEPF_COLLECTION_URL },
  tse: { id: "tse", sources: ["tse"], entryUrl: TSE_QUERY_URL, collectionUrl: TSE_QUERY_URL },
  inss: { id: "inss", sources: ["inss"], entryUrl: INSS_LOGIN_URL, collectionUrl: INSS_DATA_URL },
};

const SOURCE_TO_PORTAL: Record<CadastroSourceId, CadastroPortalId> = {
  cadunico: "cadunico",
  cadunico_adv: "cadunico",
  pesqbrasil: "pesqbrasil",
  pesqbrasil_mpa: "pesqbrasil",
  ecac_caepf: "esocial",
  tse: "tse",
  inss: "inss",
};

export function resolveCadastroPortalBySource(source: string): CadastroPortalId | null {
  return SOURCE_TO_PORTAL[source as CadastroSourceId] ?? null;
}
