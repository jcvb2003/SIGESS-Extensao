import { PessoaData } from "../../../shared/types";
import { MUNICIPIOS_LIST } from "../../../shared/data/municipios";

/**
 * Extrai dados do PesqBrasil a partir de um payload RSC (React Server Components).
 * O formato RSC não é JSON válido, consistindo em linhas numeradas como "0:[...]", "1:[...]".
 */
export function parsePesqBrasilRSC(rscText: string): Partial<PessoaData> | null {
  const defaultValues = findDefaultValuesInRSC(rscText);
  if (!defaultValues) {
    console.warn("[SIGESS] PesqBrasil: nenhum defaultValues encontrado no RSC");
    return null;
  }

  return mapDefaultValuesToPessoaData(defaultValues);
}

/**
 * Localiza o objeto "defaultValues" dentro do payload RSC.
 */
function findDefaultValuesInRSC(rscText: string): any {
  const lines = rscText.split('\n');
  for (const line of lines) {
    if (!line.includes('"defaultValues"') || !line.includes('"dadosPessoais"')) continue;
    
    const obj = extractFirstJsonObject(line);
    if (obj?.defaultValues?.dadosPessoais) {
      return obj.defaultValues;
    }
    
    // Fallback caso a estrutura mude levemente
    if (obj?.dadosPessoais) return obj;
  }
  return null;
}

/**
 * Extrai o primeiro objeto JSON completo de uma string, lidando com o formato RSC.
 */
function extractFirstJsonObject(str: string): any {
  // Se a string contiver JSON escapado (ex: {\"key\":\"val\"}), normaliza os escapes
  const cleanStr = str.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  
  const start = cleanStr.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < cleanStr.length; i++) {
    if (cleanStr[i] === '{') depth++;
    else if (cleanStr[i] === '}') depth--;
    
    if (depth === 0) {
      try {
        return JSON.parse(cleanStr.substring(start, i + 1));
      } catch (e) {
        console.warn("[SIGESS] Erro ao processar fragmento JSON no RSC do PesqBrasil:", e);
        return null;
      }
    }
  }
  return null;
}

/**
 * Mapeia os dados do PesqBrasil para a interface padrão PessoaData.
 */
function mapDefaultValuesToPessoaData(dv: any): Partial<PessoaData> {
  const dp = dv.dadosPessoais || {};
  const reg = dv.pescador?.registro || {};

  const data: Partial<PessoaData> = {
    // Identidade
    nome: dp.nomeCompleto?.trim() || dp.nome?.trim(),
    cpf: dp.cpf,
    dataDeNascimento: dp.dataNascimento?.split('T')[0],
    sexo: mapSexo(dp.sexo),
    mae: dp.nomeMae || dp.mae || dp.nomeMaePessoa || undefined,
    pai: dp.possuiNomePai ? (dp.nomePai || dp.pai || dp.nomePaiPessoa || undefined) : undefined,
    escolaridade: mapEscolaridade(dp.escolaridade),
    alfabetizado: mapAlfabetizado(dp.escolaridade),
    estadoCivil: mapEstadoCivil(dp.estadoCivil),
    nacionalidade: mapNacionalidade(dp.nacionalidade),
    naturalidade: dp.naturalidade || undefined,
    ufNaturalidade: resolveUF(dp.ufNaturalidade),

    // Documentos
    rg: dp.numeroDocumento || undefined,
    dataExpedicaoRg: dp.dataEmissao?.split('T')[0],
    ufRg: resolveUF(dp.ufEmissao),
    nit: dp.numeroCtps || undefined, // O MPA usa numeroCtps para o NIS/PIS
    ctps: undefined, // Limpa caso tenha vindo de outra fonte e queiramos priorizar a correção

    // RGP (Dados do registro principal)
    rgp: reg.codigoRGP?.trim() || dv.numeroAtualRgp?.trim() || undefined,
    tipoRgp: mapTipoRgp(dv.tipoSolicitacaoNome, dv.registroComProtocolo ?? reg.registroComProtocolo),
    // Priorizamos a data do 1º RGP para o campo que o SIGESS preenche
    emissaoRgp: dv.dataPrimeiroRgp?.split('T')[0] || reg.dataPrimeiroRGP?.split('T')[0] || reg.dataEmissao?.split('T')[0] || undefined,
    dataPrimeiroRegistro: dv.dataPrimeiroRgp?.split('T')[0] || reg.dataPrimeiroRGP?.split('T')[0] || undefined,

    // Endereço (Campos planos no MPA)
    endereco: dp.endereco || undefined,
    numero: dp.numero || undefined,
    bairro: dp.bairro || undefined,
    cep: dp.cep || undefined,
    cidade: resolveMunicipio(dp.municipio),
    uf: resolveUF(dp.uf),
    ufRgp: resolveUF(reg.uf || dp.uf),

    // Contato
    email: dp.email || undefined,
    telefone: dp.telefone || undefined,
  };

  console.log("SIGESS: Dados extraídos do PesqBrasil:", data.nome);
  return data;
}

// ── Resolvers e Helpers ──────────────────────────────────────────────────

/**
 * No PesqBrasil, 1 = FEMININO e 2 = MASCULINO (Inverso do padrão comum).
 */
function mapSexo(sexo: any): "MASCULINO" | "FEMININO" | undefined {
  if (sexo === 1) return "FEMININO";
  if (sexo === 2) return "MASCULINO";
  if (String(sexo).toUpperCase().includes("MASC")) return "MASCULINO";
  if (String(sexo).toUpperCase().includes("FEM")) return "FEMININO";
  return undefined;
}

function mapTipoRgp(
  nome: string | undefined,
  registroComProtocolo?: boolean,
): "INICIAL" | "PROTOCOLO" | "RECADASTRAMENTO" | undefined {
  if (!nome) return undefined;
  const n = nome.toUpperCase();
  if (n.includes("RECADASTRAMENTO")) return "RECADASTRAMENTO";
  if (registroComProtocolo) return "PROTOCOLO";
  if (n.includes("PROTOCOLO")) return "PROTOCOLO";
  if (n.includes("INICIAL") || n.includes("PRIMEIRA")) return "INICIAL";
  return undefined;
}

const UF_CODES: Record<number, string> = {
  1: "AC", 2: "AL", 3: "AP", 4: "AM", 5: "PA",
  6: "MA", 7: "MT", 8: "MS", 9: "MG", 10: "PR",
  11: "RJ", 12: "RN", 13: "RS", 14: "RO", 15: "RR",
  16: "SC", 17: "SE", 18: "SP", 19: "TO", 20: "DF",
  21: "ES", 22: "GO", 23: "BA", 24: "CE", 25: "PI",
  26: "PE", 27: "PB",
};

function resolveUF(code: any): string | undefined {
  if (!code) return undefined;
  if (typeof code === 'string' && code.length === 2) return code.toUpperCase();
  return UF_CODES[Number(code)] ?? undefined;
}

function resolveMunicipio(id: any): string | undefined {
  if (!id) return undefined;
  const numId = Number(id);
  return MUNICIPIOS_LIST.find(m => m.id === numId)?.nome ?? undefined;
}

// TipoEscolaridade do PesqBrasil → valores reais do select do SIGESS
function mapEscolaridade(code: any): string | undefined {
  if (code === null || code === undefined || code === '') return undefined;
  const map: Record<number, string> = {
    1:  "FUNDAMENTAL I COMPLETO",    // 1ª a 4ª Série completa
    2:  "FUNDAMENTAL I INCOMPLETO",  // 1ª a 4ª Série incompleta
    3:  "MÉDIO COMPLETO",            // 2º Grau completo
    4:  "MÉDIO INCOMPLETO",          // 2º Grau incompleto
    5:  "FUNDAMENTAL II COMPLETO",   // 5ª a 9ª Série completa
    6:  "FUNDAMENTAL II INCOMPLETO", // 5ª a 9ª Série incompleta
    7:  "SUPERIOR COMPLETO",         // Ensino superior completo
    8:  "SUPERIOR INCOMPLETO",       // Ensino superior incompleto
    9:  "OUTRO",                     // Ensino técnico completo
    10: "OUTRO",                     // Ensino técnico incompleto
    // 11 = Sem escolaridade → alfabetizado=NÃO, escolaridade não mapeada (A ROGO ou SOMENTE ASSINA são distintos)
  };
  const n = Number(code);
  if (n === 11 || n === 12 || n === -1) return undefined;
  return (n in map) ? map[n] : (typeof code === 'string' ? code : undefined);
}

function mapAlfabetizado(code: any): "SIM" | "NÃO" | undefined {
  if (code === null || code === undefined || code === '') return undefined;
  const n = Number(code);
  if (n === 11) return "NÃO";            // Sem escolaridade
  if (n === 12 || n === -1) return undefined; // Não informado
  if (n >= 1 && n <= 10) return "SIM";
  return undefined;
}

function mapNacionalidade(code: any): string | undefined {
  if (!code) return undefined;
  const map: Record<number, string> = {
    1: "BRASILEIRO(A)",
    2: "ESTRANGEIRO(A)",
    3: "NATURALIZADO(A)",
  };
  return map[Number(code)] ?? (typeof code === 'string' ? code : undefined);
}

function mapEstadoCivil(code: any): string | undefined {
  if (!code) return undefined;
  const map: Record<number, string> = {
    1: "SOLTEIRO(A)",
    2: "CASADO(A)",
    3: "DIVORCIADO(A)",
    4: "VIÚVO(A)",
    5: "UNIÃO ESTÁVEL",
    6: "SEPARADO(A)",
  };
  return map[Number(code)] ?? (typeof code === 'string' ? code : undefined);
}
