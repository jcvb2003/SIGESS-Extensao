import { AppSettings } from "../../shared/types";

const REAP_STATE_LABELS: Record<number, string> = {
  1: "RONDONIA",
  2: "ACRE",
  3: "AMAZONAS",
  4: "RORAIMA",
  5: "PARA",
  6: "AMAPA",
  7: "TOCANTINS",
  8: "MARANHAO",
  9: "PIAUI",
  10: "CEARA",
  11: "RIO GRANDE DO NORTE",
  12: "PARAIBA",
  13: "PERNAMBUCO",
  14: "ALAGOAS",
  15: "SERGIPE",
  16: "BAHIA",
  17: "MINAS GERAIS",
  18: "ESPIRITO SANTO",
  19: "RIO DE JANEIRO",
  20: "SAO PAULO",
  21: "PARANA",
  22: "SANTA CATARINA",
  23: "RIO GRANDE DO SUL",
  24: "MATO GROSSO DO SUL",
  25: "MATO GROSSO",
  26: "GOIAS",
  27: "DISTRITO FEDERAL",
  28: "EX",
};

const REAP_FISHING_LOCATION_LABELS: Record<number, string> = {
  1: "Acude",
  2: "Estuario",
  3: "Mar",
  4: "Lago",
  5: "Lagoa",
  6: "Rio",
  7: "Represa",
  8: "Reservatorio",
  9: "Laguna",
};

const REAP_FISHING_METHOD_LABELS: Record<number, string> = {
  1: "Arrasto",
  2: "Cerco",
  3: "Covos",
  4: "Emalhe",
  5: "Espinhel",
  6: "Linha de Mao",
  7: "Linha e Anzol",
  8: "Mariscagem",
  9: "Matapi",
  10: "Pesca Subaquatica",
  11: "Tarrafa",
  12: "Vara",
  13: "Outro",
};

export function getReapStateLabel(stateCode?: number) {
  if (!stateCode) return "";
  return REAP_STATE_LABELS[stateCode] || "";
}

export function getReapFishingLocationLabel(locationCode?: number) {
  if (!locationCode) return "";
  return REAP_FISHING_LOCATION_LABELS[locationCode] || "";
}

export function getReapFishingMethodLabel(methodCode?: number) {
  if (!methodCode) return "";
  return REAP_FISHING_METHOD_LABELS[methodCode] || "";
}

export function getEffectiveFishingMethod(settings: Partial<AppSettings>) {
  return settings.mpaMetodoPesca ?? settings.mpaPetrecho ?? 4;
}

export function normalizeReapSettings(settings: AppSettings): AppSettings {
  const residenceUF = settings.mpaResidenceUF ?? settings.mpaUF ?? 5;
  const residenceMunicipio = settings.mpaResidenceMunicipio ?? settings.mpaMunicipio;
  const commercializationStates =
    settings.mpaCommercializationStates && settings.mpaCommercializationStates.length > 0
      ? settings.mpaCommercializationStates
      : [residenceUF];

  return {
    ...settings,
    mpaResidenceUF: residenceUF,
    mpaResidenceMunicipio: residenceMunicipio,
    mpaCommercializationStates: commercializationStates,
    mpaMetodoPesca: getEffectiveFishingMethod(settings),
  };
}
