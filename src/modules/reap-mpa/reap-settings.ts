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

export function getReapStateLabel(stateCode?: number) {
  if (!stateCode) return "";
  return REAP_STATE_LABELS[stateCode] || "";
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
