import { MUNICIPIOS_LIST } from "../../../../shared/data/municipios";
import { REAP_STATE_UF_BY_CODE } from "./constants";

export function formatBRL(raw: string) {
  const n = parseFloat(raw);
  if (isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function getMunicipiosByUf(ufCode?: number) {
  const ufSigla = ufCode ? REAP_STATE_UF_BY_CODE[ufCode] : undefined;
  return (ufSigla ? MUNICIPIOS_LIST
    .filter((municipio) => municipio.camposAdicionais.siglaUf === ufSigla) : [])
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}
