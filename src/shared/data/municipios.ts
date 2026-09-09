import { MUNICIPIOS_RO } from "./municipios_ro";
import { MUNICIPIOS_AC } from "./municipios_ac";
import { MUNICIPIOS_AM } from "./municipios_am";
import { MUNICIPIOS_RR } from "./municipios_rr";
import { MUNICIPIOS_PA } from "./municipios_pa";
import { MUNICIPIOS_AP } from "./municipios_ap";
import { MUNICIPIOS_TO } from "./municipios_to";
import { MUNICIPIOS_MA } from "./municipios_ma";
import { MUNICIPIOS_PI } from "./municipios_pi";
import { MUNICIPIOS_CE } from "./municipios_ce";
import { MUNICIPIOS_RN } from "./municipios_rn";
import { MUNICIPIOS_PB } from "./municipios_pb";
import { MUNICIPIOS_PE } from "./municipios_pe";
import { MUNICIPIOS_AL } from "./municipios_al";
import { MUNICIPIOS_SE } from "./municipios_se";
import { MUNICIPIOS_BA } from "./municipios_ba";
import { MUNICIPIOS_MG } from "./municipios_mg";
import { MUNICIPIOS_ES } from "./municipios_es";
import { MUNICIPIOS_RJ } from "./municipios_rj";
import { MUNICIPIOS_SP } from "./municipios_sp";
import { MUNICIPIOS_PR } from "./municipios_pr";
import { MUNICIPIOS_SC } from "./municipios_sc";
import { MUNICIPIOS_RS } from "./municipios_rs";
import { MUNICIPIOS_MS } from "./municipios_ms";
import { MUNICIPIOS_MT } from "./municipios_mt";
import { MUNICIPIOS_GO } from "./municipios_go";
import { MUNICIPIOS_DF } from "./municipios_df";

export type Municipio = {
  id: number;
  nome: string;
  camposAdicionais: {
    siglaUf: string;
    situacao: boolean | null;
    codigoSiape: number | null;
  };
};

const combineMunicipios = (...lists: ReadonlyArray<ReadonlyArray<Municipio>>): Municipio[] =>
  lists.flatMap((list) => list);

export const MUNICIPIOS_LIST = combineMunicipios(
  MUNICIPIOS_RO,
  MUNICIPIOS_AC,
  MUNICIPIOS_AM,
  MUNICIPIOS_RR,
  MUNICIPIOS_PA,
  MUNICIPIOS_AP,
  MUNICIPIOS_TO,
  MUNICIPIOS_MA,
  MUNICIPIOS_PI,
  MUNICIPIOS_CE,
  MUNICIPIOS_RN,
  MUNICIPIOS_PB,
  MUNICIPIOS_PE,
  MUNICIPIOS_AL,
  MUNICIPIOS_SE,
  MUNICIPIOS_BA,
  MUNICIPIOS_MG,
  MUNICIPIOS_ES,
  MUNICIPIOS_RJ,
  MUNICIPIOS_SP,
  MUNICIPIOS_PR,
  MUNICIPIOS_SC,
  MUNICIPIOS_RS,
  MUNICIPIOS_MS,
  MUNICIPIOS_MT,
  MUNICIPIOS_GO,
  MUNICIPIOS_DF
);
