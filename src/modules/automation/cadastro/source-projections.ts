import { PessoaData } from "../../../shared/types";

function pick(data: Partial<PessoaData>, keys: Array<keyof PessoaData>): Partial<PessoaData> {
  return Object.fromEntries(
    keys
      .filter((key) => data[key] !== undefined)
      .map((key) => [key, data[key]]),
  ) as Partial<PessoaData>;
}

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

/** Campos que cada fonte pode atualizar no cadastro consolidado. */
export function projectSourceFields(
  source: string,
  data: Partial<PessoaData>,
): Partial<PessoaData> {
  if (source === "tse") {
    return pick(data, ["tituloEleitor", "zonaEleitoral", "secaoEleitoral"]);
  }

  if (source === "inss") {
    return pick(data, ["nit", "nome", "dataDeNascimento"]);
  }

  return data;
}
