import { PessoaData } from "../../../shared/types";

export function parseCaepfData(payload: any): Partial<PessoaData> | null {
  try {
    // A resposta do CAEPF costuma vir em um array "content" de uma pesquisa
    const content = payload.content;
    if (!content || !Array.isArray(content) || content.length === 0) return null;

    const item = content[0]; // Pegamos o primeiro resultado ativo

    return {
      nome: item.nome,
      cpf: item.numeroInscricao,
      dataDeNascimento: item.dataNascimento,
      cep: item.cep,
      endereco: item.logradouro,
      bairro: item.bairro,
      cidade: item.municipio?.nome,
      uf: item.uf,
      nit: item.numeroCaepf, // CAEPF as NIT if PIS is missing
      caepf: item.numeroCaepf,
      cnae: item.cnaePreponderante,
      atividadeEconomica: item.tipoAtividadeEconomica,
      situacaoCaepf: item.situacao,
    };
  } catch (e) {
    console.error("SIGESS: Erro ao parsear dados do CAEPF", e);
    return null;
  }
}
