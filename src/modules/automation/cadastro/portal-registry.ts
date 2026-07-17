import type { CadastroPortalDefinition, CadastroPortalId, CadastroSourceId } from "./contracts";

export const CADASTRO_PORTAL_REGISTRY: Record<CadastroPortalId, CadastroPortalDefinition> = {
  cadunico: { id: "cadunico", sources: ["cadunico", "cadunico_adv"] },
  pesqbrasil: { id: "pesqbrasil", sources: ["pesqbrasil", "pesqbrasil_mpa"] },
  ecac: { id: "ecac", sources: ["ecac_cpf", "ecac_caepf"] },
  tse: { id: "tse", sources: ["tse"] },
  inss: { id: "inss", sources: ["inss"] },
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
