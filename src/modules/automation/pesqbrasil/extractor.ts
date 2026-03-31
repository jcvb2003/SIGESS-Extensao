import { PessoaData } from "../../../shared/types";

export function parsePesqBrasilRSC(text: string): Partial<PessoaData> | null {
  try {
    // Procura o início do objeto JSON que contém os dados (no formato Next.js RSC)
    // Geralmente começa com um ID e um objeto logo após
    const startIdx = text.indexOf('{"configuracoes"');
    if (startIdx === -1) {
      // Tenta outra variação de payload
      const altStart = text.indexOf('{"id":');
      if (altStart === -1) return null;
      
      // Se encontrou dados soltos, tenta parsear
      const parts = text.substring(altStart).split('\n');
      for (const part of parts) {
        if (part.includes('defaultValues') || part.includes('dadosPessoais')) {
          try {
            const cleanPart = part.replace(/^[0-9]+:/, ''); // Remove prefixo de RSC tipo "1:"
            const json = JSON.parse(cleanPart);
            return mapToPessoaData(json.defaultValues || json);
          } catch(e) {}
        }
      }
      return null;
    }
    
    // Pega a linha que contém o JSON
    const bodyStr = text.substring(startIdx);
    const firstLine = bodyStr.split('\n')[0];
    
    const data = JSON.parse(firstLine);
    const dv = data.defaultValues || data;
    
    return mapToPessoaData(dv);
  } catch (e) {
    console.error("SIGESS: Erro ao parsear RSC do PesqBrasil", e);
    return null;
  }
}

function mapToPessoaData(dv: any): Partial<PessoaData> | null {
  if (!dv.dadosPessoais) return null;
  
  const dp = dv.dadosPessoais;
  const pesq = dv.pescador || {};

  return {
    nome: dp.nomeCompleto || pesq.nome,
    cpf: dp.cpf || pesq.cpf,
    dataDeNascimento: dp.dataNascimento ? dp.dataNascimento.split('T')[0] : undefined,
    sexo: dp.sexo === 2 ? "MASCULINO" : (dp.sexo === 1 ? "FEMININO" : undefined),
    mae: dp.nomeMae,
    pai: dp.nomePai,
    escolaridade: mapEscolaridade(dp.escolaridade),
    cep: dp.cep,
    endereco: dp.endereco,
    numero: dp.numero,
    bairro: dp.bairro,
    uf: mapUF(dp.uf),
    telefone: dp.telefone,
    email: dp.email,
    rg: dp.numeroDocumento,
    dataExpedicaoRg: dp.dataEmissao ? dp.dataEmissao.split('T')[0] : undefined,
    ufRg: mapUF(dp.ufEmissao),
    nit: dp.numeroCtps || dp.numeroPisPasepNis,
    rgp: pesq.registro?.codigoRGP,
    tipoRgp: pesq.registro?.tipoSolicitacaoId === 2 ? "RECADASTRAMENTO" : "INICIAL",
    emissaoRgp: pesq.registro?.dataEmissao ? pesq.registro.dataEmissao.split('T')[0] : undefined,
  };
}

function mapEscolaridade(id: number): string {
  const map: Record<number, string> = {
    1: "ANALFABETO",
    2: "LÊ E ESCREVE",
    3: "ENSINO FUNDAMENTAL INCOMPLETO",
    4: "ENSINO FUNDAMENTAL COMPLETO",
    5: "ENSINO MÉDIO INCOMPLETO",
    6: "ENSINO MÉDIO COMPLETO",
    7: "ENSINO SUPERIOR INCOMPLETO",
    8: "ENSINO SUPERIOR COMPLETO",
  };
  return map[id] || "NÃO INFORMADO";
}

function mapUF(id: number): string {
  const map: Record<number, string> = {
    1: "RO", 2: "AC", 3: "AM", 4: "RR", 5: "PA", 6: "AP", 7: "TO",
    8: "MA", 9: "PI", 10: "CE", 11: "RN", 12: "PB", 13: "PE", 14: "AL", 15: "SE", 16: "BA",
    17: "MG", 18: "ES", 19: "RJ", 20: "SP", 21: "PR", 22: "SC", 23: "RS",
    24: "MS", 25: "MT", 26: "GO", 27: "DF"
  };
  return map[id] || "";
}
