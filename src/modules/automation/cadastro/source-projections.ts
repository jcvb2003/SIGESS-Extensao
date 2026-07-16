import { PessoaData } from "../../../shared/types";

function pick(data: Partial<PessoaData>, keys: Array<keyof PessoaData>): Partial<PessoaData> {
  return Object.fromEntries(
    keys
      .filter((key) => data[key] !== undefined)
      .map((key) => [key, data[key]]),
  ) as Partial<PessoaData>;
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
