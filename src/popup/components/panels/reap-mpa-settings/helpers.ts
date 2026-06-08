import { MUNICIPIOS_LIST } from "../../../../shared/data/municipios";
import { REAP_STATE_OPTIONS } from "./constants";

const stateLabelById = new Map<number, string>(
  REAP_STATE_OPTIONS.map((option) => [option.value, option.label]),
);

export function formatBRL(raw: string) {
  const n = parseFloat(raw);
  if (isNaN(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function getMunicipiosByUf(ufCode?: number) {
  const ufLabel = ufCode ? stateLabelById.get(ufCode) : undefined;
  const ufSigla = ufLabel === "PARA" ? "PA" : ufLabel === "MARANHAO" ? "MA" : "";
  return MUNICIPIOS_LIST.filter((municipio) => municipio.camposAdicionais.siglaUf === ufSigla);
}
