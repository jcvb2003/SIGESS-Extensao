import { PessoaData } from "../../../shared/types";

/** Converte a resposta de Dados Cadastrais do Meu INSS em campos canônicos. */
export function parseInssData(payload: unknown): Partial<PessoaData> | null {
  const root = payload as { filiadoTO?: Record<string, unknown> } | null;
  const data = root?.filiadoTO;
  if (!data) return null;

  const firstIdentity = Array.isArray(data.listaIdentidadeTO)
    ? data.listaIdentidadeTO[0] as Record<string, unknown> | undefined
    : undefined;
  const address = data.enderecoPrincipalTO as Record<string, unknown> | undefined;

  return {
    cpf: asString(data.cpf),
    nome: asString(data.nome),
    dataDeNascimento: toIsoDate(asString(data.dataNascimento)),
    mae: asString(data.nomeMae),
    pai: asString(data.nomePai),
    nit: asString(data.nit),
    sexo: asString(data.sexo) as PessoaData["sexo"],
    nacionalidade: asString(data.nacionalidade),
    naturalidade: asString(data.municipioOrigem),
    ufNaturalidade: asString(data.ufOrigem),
    tituloEleitor: asString(data.numeroTitulo),
    rg: asString(firstIdentity?.numero),
    dataExpedicaoRg: toIsoDate(asString(firstIdentity?.dataEmissao)),
    ufRg: asString(firstIdentity?.uf),
    orgaoEmissorRg: asString(firstIdentity?.orgaoEmissorIdentidade),
    endereco: joinAddress(address),
    numero: asString(address?.numero),
    bairro: asString(address?.bairro),
    cidade: asString(address?.municipio),
    uf: asString(address?.siglaUf ?? address?.uf),
    cep: asString(address?.cep),
  };
}

function asString(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function toIsoDate(value?: string): string | undefined {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || value;
}

function joinAddress(address?: Record<string, unknown>): string | undefined {
  if (!address) return undefined;
  return [address.tipoLogradouro, address.logradouro]
    .map(asString)
    .filter(Boolean)
    .join(" ") || undefined;
}
