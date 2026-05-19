export type ComercializacaoTipoPayload = {
  CodigoTipo: string;
  RequerAdquirente: string;
  ValorComercializado: string;
  Excluido: string;
  Adquirentes: Array<Record<string, string>>;
};

export type ComercializacaoPayload = Array<{
  IdComercializacao: string;
  TipoInscricaoEstabelecimento: string;
  InscricaoEstabelecimento: string;
  DescricaoEstabelecimento: string;
  Excluido: string;
  Competencia: string;
  TiposComercializacao: ComercializacaoTipoPayload[];
}>;

export type EsocialOverlayState = {
  step: number;
  total: number;
  title: string;
  description: string;
  complete?: boolean;
  hideAt?: number;
};
