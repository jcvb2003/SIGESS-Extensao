import { PessoaData } from "../../../shared/types";

export function parseTseData(payload: any): Partial<PessoaData> | null {
  try {
    const eleitor = payload.eleitor;
    const domicilio = payload.domicilioEleitoral;
    if (!eleitor) return null;

    return {
      nome:            eleitor.nomeCivil || eleitor.nomeSocial,
      cpf:             eleitor.cpf,
      dataDeNascimento: eleitor.dataNascimento, // já vem ISO YYYY-MM-DD
      tituloEleitor:   eleitor.inscricao?.replace(/\D/g, ''),
      zonaEleitoral:   domicilio?.zona,
      secaoEleitoral:  domicilio?.secao,
      cidade:          domicilio?.municipio,
      uf:              domicilio?.uf,
      bairro:          domicilio?.bairro,
      endereco:        domicilio?.endereco,
    };
  } catch (e) {
    console.error('[SIGESS] Erro ao parsear dados TSE', e);
    return null;
  }
}
