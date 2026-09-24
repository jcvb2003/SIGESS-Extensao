import { PessoaData } from "../../../shared/types";

function pick(data: Partial<PessoaData>, keys: Array<keyof PessoaData>): Partial<PessoaData> {
  return Object.fromEntries(
    keys
      .filter((key) => data[key] !== undefined)
      .map((key) => [key, data[key]]),
  ) as Partial<PessoaData>;
}

// INSS e PesqBrasil são fontes de fallback: seus valores entram no
// consolidado somente antes da projeção prioritária do CadÚnico. Não inclua
// aqui senhaGovInss ou qualquer outro dado sensível.
const INSS_FALLBACK_FIELDS: Array<keyof PessoaData> = [
  "cpf",
  "nome",
  "apelido",
  "dataDeNascimento",
  "sexo",
  "estadoCivil",
  "pai",
  "mae",
  "nacionalidade",
  "naturalidade",
  "ufNaturalidade",
  "alfabetizado",
  "escolaridade",
  "endereco",
  "numero",
  "bairro",
  "cidade",
  "uf",
  "cep",
  "telefone",
  "email",
  "rg",
  "dataExpedicaoRg",
  "ufRg",
  "orgaoEmissorRg",
  "nit",
  "ctps",
  "ctpsUf",
  "cei",
  "caepf",
  "cnae",
  "atividadeEconomica",
  "situacaoCaepf",
  "rgp",
  "tipoRgp",
  "emissaoRgp",
  "ufRgp",
  "dataPrimeiroRegistro",
];

/**
 * Ordem de consolidação: as fontes são aplicadas da menos prioritária para a
 * mais prioritária. Assim o CadÚnico continua vencendo valores coincidentes,
 * enquanto INSS/PesqBrasil só completam campos ausentes.
 */
export const CADASTRO_SOURCE_PRIORITY = [
  "cadunico_adv",
  "cadunico",
  "ecac_caepf",
  "caepf",
  "pesqbrasil_mpa",
  "pesqbrasil",
  "pesq_brasil",
  "tse",
  "inss",
] as const;

export function hasMeaningfulSourceData(data: Partial<PessoaData> | undefined): boolean {
  if (!data) return false;
  return Object.entries(data).some(([key, value]) => {
    if (key === "fontes" || value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });
}

export function consolidatePessoaProjections(
  projections: Record<string, Partial<PessoaData>>,
): PessoaData {
  let consolidated: PessoaData = { nome: "", cpf: "" };

  Object.entries(projections).forEach(([source, data]) => {
    if (!CADASTRO_SOURCE_PRIORITY.includes(source as (typeof CADASTRO_SOURCE_PRIORITY)[number])) {
      const { fontes: _fontes, ...safeData } = data;
      consolidated = { ...consolidated, ...safeData };
    }
  });

  [...CADASTRO_SOURCE_PRIORITY].reverse().forEach((source) => {
    const data = projections[source];
    if (!data) return;
    const { fontes: _fontes, ...safeData } = data;
    consolidated = { ...consolidated, ...safeData };
  });

  return consolidated;
}

/** Campos que cada fonte pode atualizar no cadastro consolidado. */
export function projectSourceFields(
  source: string,
  data: Partial<PessoaData>,
): Partial<PessoaData> {
  if (source === "tse") {
    return pick(data, ["tituloEleitor", "zonaEleitoral", "secaoEleitoral"]);
  }

  if (source === "inss") {
    return pick(data, INSS_FALLBACK_FIELDS);
  }

  return data;
}
