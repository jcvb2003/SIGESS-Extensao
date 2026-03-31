import { PessoaData } from "../../../shared/types";

export function parseTseData(payload: any): Partial<PessoaData> | null {
  try {
    const eleitor = payload.eleitor;
    const domicilio = payload.domicilioEleitoral;

    if (!eleitor) return null;

    return {
      nome: eleitor.nomeCivil || eleitor.nome,
      cpf: eleitor.cpf,
      dataDeNascimento: eleitor.dataNascimento,
      tituloEleitor: eleitor.inscricao,
      zonaEleitoral: domicilio?.zona,
      secaoEleitoral: domicilio?.secao,
    };
  } catch (e) {
    console.error("SIGESS: Erro ao parsear dados do TSE", e);
    return null;
  }
}
