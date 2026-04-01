import { PessoaData } from "../../../shared/types";

/**
 * Extrai dados do PesqBrasil a partir de um payload RSC (React Server Components).
 * O formato RSC não é JSON válido, consistindo em linhas numeradas como "0:[...]", "1:[...]".
 */
export function parsePesqBrasilRSC(rscText: string): Partial<PessoaData> | null {
  const rawData = findRawDataInRSC(rscText);
  if (!rawData) {
    console.warn("SIGESS: Nenhum objeto de dados reconhecido no RSC");
    return null;
  }

  return mapPesqBrasilToPessoaData(rawData);
}

function findRawDataInRSC(rscText: string): any {
  const lines = rscText.split('\n');
  
  for (const line of lines) {
    // Padrão 1: Detalhes completos
    if (line.includes('"defaultValues"') || line.includes('"dadosPessoais"')) {
      const data = parseLineObject(line);
      if (data) {
        const found = data.defaultValues || data.dadosPessoais || data;
        return found.dadosPessoais || found;
      }
    }
    
    // Padrão 2: Dashboard/Lista
    if (line.includes('"cpf"') && line.includes('"nome"') && (line.includes('"status"') || line.includes('"sobrenome"'))) {
      const data = parseLineObject(line);
      if (data?.cpf && data.nome) {
        console.log("SIGESS: Dados parciais detectados via Dashboard RSC");
        return data;
      }
    }
  }
  return null;
}

function parseLineObject(line: string): any {
  const jsonStr = extractJsonObject(line);
  if (!jsonStr) return null;
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn("SIGESS: Falha ao parsear objeto JSON extraído do RSC", e);
    return null;
  }
}

function mapPesqBrasilToPessoaData(rawData: any): Partial<PessoaData> {
  const data: Partial<PessoaData> = {
    nome: rawData.nome ? `${rawData.nome} ${rawData.sobrenome || ''}`.trim() : undefined,
    cpf: rawData.cpf || undefined,
    dataDeNascimento: rawData.dataNascimento || rawData.data_nascimento || undefined,
    sexo: mapGender(rawData.sexo),
    mae: rawData.nomeMae || rawData.mae || undefined,
    pai: rawData.nomePai || rawData.pai || undefined,
    naturalidade: rawData.naturalidade || undefined,
    estadoCivil: rawData.estadoCivil?.descricao || rawData.estadoCivil?.nome || rawData.estadoCivil || undefined,
    escolaridade: rawData.escolaridade?.descricao || rawData.escolaridade?.nome || rawData.escolaridade || undefined,
    email: rawData.email || undefined,
    telefone: rawData.celular || rawData.telefone || undefined,
  };

  if (rawData.endereco) {
    Object.assign(data, mapAddress(rawData.endereco));
  }

  console.log("SIGESS: Dados extraídos do PesqBrasil:", data.nome);
  return data;
}

function mapGender(sexo: number): "MASCULINO" | "FEMININO" | undefined {
  if (sexo === 1) return 'MASCULINO';
  if (sexo === 2) return 'FEMININO';
  return undefined;
}

function mapAddress(e: any): Partial<PessoaData> {
  const municipio = e.municipio?.nome || e.cidade || '';
  const uf = e.municipio?.uf?.sigla || e.uf || '';
  
  return {
    endereco: `${e.logradouro || ''}, ${e.numero || 'S/N'}${e.complemento ? ' - ' + e.complemento : ''}, ${e.bairro || ''}`.trim(),
    cidade: municipio,
    uf: uf,
    cep: e.cep || ''
  };
}

/**
 * Extrai o primeiro objeto JSON completo de uma string, 
 * lidando com o formato RSC do Next.js e caracteres de escape.
 */
function extractJsonObject(str: string): string | null {
  // Se a string contiver JSON escapado (ex: {\"key\":\"val\"}), normaliza os escapes
  const cleanStr = str.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  
  let firstBrace = cleanStr.indexOf('{');
  if (firstBrace === -1) return null;

  let stack = 0;
  for (let i = firstBrace; i < cleanStr.length; i++) {
    if (cleanStr[i] === '{') stack++;
    if (cleanStr[i] === '}') stack--;
    if (stack === 0) {
      return cleanStr.substring(firstBrace, i + 1);
    }
  }
  return null;
}
