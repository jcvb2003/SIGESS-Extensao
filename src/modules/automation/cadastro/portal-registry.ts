import type { CadastroPortalDefinition, CadastroPortalId, CadastroSourceId } from "./contracts";
import { CADUNICO_HOME_URL } from "../cadunico/routes";
import { INSS_DATA_URL, INSS_LOGIN_URL } from "../inss/routes";
import { ECAC_COLLECTION_URL } from "../ecac/routes";
import { PESQBRASIL_MPA_URL } from "../pesqbrasil/routes";
import { TSE_QUERY_URL } from "../tse/routes";

export const CADASTRO_PORTAL_REGISTRY: Record<CadastroPortalId, CadastroPortalDefinition> = {
  cadunico: { id: "cadunico", sources: ["cadunico", "cadunico_adv"], entryUrl: CADUNICO_HOME_URL },
  pesqbrasil: { id: "pesqbrasil", sources: ["pesqbrasil", "pesqbrasil_mpa"], entryUrl: PESQBRASIL_MPA_URL },
  ecac: { id: "ecac", sources: ["ecac_cpf", "ecac_caepf"], collectionUrl: ECAC_COLLECTION_URL },
  tse: { id: "tse", sources: ["tse"], entryUrl: TSE_QUERY_URL, collectionUrl: TSE_QUERY_URL },
  inss: { id: "inss", sources: ["inss"], entryUrl: INSS_LOGIN_URL, collectionUrl: INSS_DATA_URL },
};

const SOURCE_TO_PORTAL: Record<CadastroSourceId, CadastroPortalId> = {
  cadunico: "cadunico",
  cadunico_adv: "cadunico",
  pesqbrasil: "pesqbrasil",
  pesqbrasil_mpa: "pesqbrasil",
  ecac_cpf: "ecac",
  ecac_caepf: "ecac",
  tse: "tse",
  inss: "inss",
};

export function resolveCadastroPortalBySource(source: string): CadastroPortalId | null {
  return SOURCE_TO_PORTAL[source as CadastroSourceId] ?? null;
}
