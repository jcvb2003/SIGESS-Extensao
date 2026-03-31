import { PessoaData } from "../../../shared/types";

/**
 * Extrai dados do PesqBrasil a partir de um payload RSC (React Server Components).
 * O formato RSC não é JSON válido, consistindo em linhas numeradas como "0:[...]", "1:[...]".
 */
export function parsePesqBrasilRSC(rscText: string): Partial<PessoaData> | null {
  try {
    let rawData: any = null;

    // Tenta encontrar o objeto de "dadosPessoais" ou payload de Dashboard dentro do RSC
    const lines = rscText.split('\n');
    
    for (const line of lines) {
      // Padrão 1: Detalhes completos (dadosPessoais/defaultValues)
      if (line.includes('"defaultValues"') || line.includes('"dadosPessoais"')) {
        const jsonStr = extractJsonObject(line);
        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            // Pode estar aninhado em defaultValues ou ser o objeto direto
            rawData = parsed.defaultValues || parsed.dadosPessoais || parsed;
            if (rawData.dadosPessoais) rawData = rawData.dadosPessoais;
            if (rawData) break;
          } catch (e) {
            console.warn("SIGESS: Falha ao parsear objeto JSON extraído do RSC", e);
          }
        }
      }
      
      // Padrão 2: Dashboard/Lista (id, nome, cpf, status)
      // Usamos uma verificação combinada para garantir que é a linha correta
      if (line.includes('"cpf"') && line.includes('"nome"') && (line.includes('"status"') || line.includes('"sobrenome"'))) {
        const jsonStr = extractJsonObject(line);
        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            // No dashboard, os campos costumam estar na raiz do objeto da linha ou no segundo elemento do array RSC
            if (parsed.cpf && parsed.nome) {
              rawData = parsed;
              console.log("SIGESS: Dados parciais detectados via Dashboard RSC");
              break;
            }
          } catch (e) {
            // Silencioso para não poluir logs se fallhar em linhas irrelevantes
          }
        }
      }
    }

    if (!rawData) {
      console.warn("SIGESS: Nenhum objeto de dados reconhecido no RSC");
      return null;
    }

    // Mapeamento PesqBrasil -> PessoaData
    // Importante: 1 = Masculino, 2 = Feminino no PesqBrasil (Confirmado)
    const data: Partial<PessoaData> = {
      nome: rawData.nome ? `${rawData.nome} ${rawData.sobrenome || ''}`.trim() : undefined,
      cpf: rawData.cpf || undefined,
      dataDeNascimento: rawData.dataNascimento || rawData.data_nascimento || undefined,
      sexo: rawData.sexo === 1 ? 'MASCULINO' : (rawData.sexo === 2 ? 'FEMININO' : undefined),
      mae: rawData.nomeMae || rawData.mae || undefined,
      pai: rawData.nomePai || rawData.pai || undefined,
      naturalidade: rawData.naturalidade || undefined,
      estadoCivil: rawData.estadoCivil?.descricao || rawData.estadoCivil?.nome || rawData.estadoCivil || undefined,
      escolaridade: rawData.escolaridade?.descricao || rawData.escolaridade?.nome || rawData.escolaridade || undefined,
      email: rawData.email || undefined,
      telefone: rawData.celular || rawData.telefone || undefined,
    };

    // Endereço (se disponível) - PessoaData.endereco é string
    if (rawData.endereco) {
        const e = rawData.endereco;
        const municipio = e.municipio?.nome || e.cidade || '';
        const uf = e.municipio?.uf?.sigla || e.uf || '';
        
        data.endereco = `${e.logradouro || ''}, ${e.numero || 'S/N'}${e.complemento ? ' - ' + e.complemento : ''}, ${e.bairro || ''}`.trim();
        data.cidade = municipio;
        data.uf = uf;
        data.cep = e.cep || '';
    }

    console.log("SIGESS: Dados extraídos do PesqBrasil:", data.nome);
    return data;

  } catch (error) {
    console.error("SIGESS: Erro crítico ao extrair RSC do PesqBrasil", error);
    return null;
  }
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
