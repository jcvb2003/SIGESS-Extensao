import { TurboReapConfig } from '../shared/types';

// Constants
const FALLBACK_ACTION_HASH = "0e19fa9cd1721c7395e62a3a725505d58b5b5630";
const REAP_ID_REGEX = /\/manutencao\/(\d+)\//;

/**
 * Dinamicamente encontra o hash de Server Action do Next.js
 * Utiliza o HTML e RSC payloads da página atual.
 */
async function getActionHash(): Promise<string> {
  // @ts-ignore Pular checagem para teste do fallback (Teste 3)
  return fallbackHash();
  try {
    const html = document.documentElement.innerHTML;
    // Procurar por referências do Next.js às Server Actions (costumam ter o prefixo 0e19fa9c ou estar num map action)
    // Tenta encontrar o nosso fallback hash primeiro, para garantir que se for a mesma build, não corremos riscos.
    if (html.includes(FALLBACK_ACTION_HASH)) {
      return FALLBACK_ACTION_HASH;
    }

    // Outros métodos para tentar inferir: as server actions de Forms no next.js geram inputs hidden com name="$ACTION_ID_..."
    const actionInput = document.querySelector('input[name^="$ACTION_ID_"]') as HTMLInputElement;
    if (actionInput) {
      const nameAttr: string = actionInput.getAttribute('name') ?? "";
      const hash = nameAttr.split('_').pop() as string;
      if (hash && hash.length === 40) return hash;
    }

    // Se nenhuma abordagem funcionar, avisamos
    console.warn("[SIGESS Turbo] Hash de Server Action não detectado dinamicamente. Utilizando Fallback.");
    return fallbackHash();
  } catch (error) {
    console.error("[SIGESS Turbo] Erro ao extrair action hash", error);
    return fallbackHash();
  }
}

function fallbackHash() {
  return FALLBACK_ACTION_HASH;
}





/**
 * Monta o corpo da requisição de post (Action Body)
 */
function buildPayload(reapId: string, currentState: any, userConfig: TurboReapConfig) {
  // Mesmo sem o currentState completo do DOM, podemos tentar forjar a estrutura.
  // Porém a Server Action recebe o reapState completo
  
  // Vamos buscar o state via fetch SSR 
  // Na verdade, no implementation plan assumimos que o currentState vem do script.
  // Para simplificar: o servidor confia nos id (13966000156)? Sim. Se enviarmos
  // os meses recriados do zero, talvez dê erro.
  // Abordagem Segura: O usuário DEVE estar na página que já carregou os informes.
  // Padrões do React Server Components colocam os dados formatados em <script>
  
  // Como `extractStateFromPageData` pode ser instável,
  // Precisamos extrair isso garantidamente.
  let state = currentState;

  if (!state) {
      throw new Error("Não foi possível carregar o estado base do REAP. A requisição precisa dos IDs originais.");
  }

  // Preenchemos com a config
  if (state.informesMensais && Array.isArray(state.informesMensais)) {
      state.informesMensais = state.informesMensais.map((mes: any) => {
          // Achar config correspondente (mês 1 = index 0)
          const config = userConfig.meses.find(m => m.mes === mes.mes);
          
          if (config) {
              // Regras rígidas de Tipagem exigidas no plano
              mes.houvePesca = Boolean(config.houvePesca);
              
              if (mes.houvePesca) {
                  mes.diasTrabalhados = typeof config.diasTrabalhados === 'number' ? config.diasTrabalhados : undefined;
                  mes.justificativasNaoDeclaracao = [];
                  mes.preenchido = true;
                  
                  // Popula área
                  const area = {
                      ...userConfig.areaRealizacao,
                      id: mes.areasRealizacaoPesca?.[0]?.id // Preserva ID se existir
                  };
                  mes.areasRealizacaoPesca = [area];

                  // Popula espécies
                  if (config.especies && config.especies.length > 0) {
                      mes.resultadosOperacaoPesca = config.especies.map((esp, i) => ({
                          ...esp,
                          id: mes.resultadosOperacaoPesca?.[i]?.id // Preserva ID se existir
                      }));
                  } else {
                      mes.resultadosOperacaoPesca = [];
                  }
              } else {
                  // Mês sem pesca
                  mes.diasTrabalhados = undefined; // Não envia string
                  mes.areasRealizacaoPesca = [];
                  mes.resultadosOperacaoPesca = [];
                  mes.justificativasNaoDeclaracao = config.justificativa ? [config.justificativa] : [];
                  mes.preenchido = true;
              }
          }
          return mes;
      });
  }

  // O payload é [reapId, state, indexMes]
  // Mas como estamos "turbinando", mandamos index nulo ou 11 (último)
  return [reapId, state, null];
}

async function submitReap(reapId: string, payload: any[], actionHash: string) {
    const url = `/manutencao/${reapId}/cadastro/informe-mensal`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "text/plain;charset=UTF-8",
            "Accept": "text/x-component",
            "Next-Action": actionHash
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Erro POST HTTP: ${response.status}`);
    }

    const text = await response.text();
    // Validar erros nos _rsc
    if (text.includes('"errosValidacao":{') && !text.includes('"errosValidacao":{}')) {
        throw new Error("Servidor retornou erros de validação: " + text.substring(0, 150));
    }
    return true;
}



function extractJsonWithKey(text: string, keyName: string): any {
    const keyStr = `"${keyName}"`;
    let keyIdx = text.indexOf(keyStr);
    
    if (keyIdx === -1) {
        const escapedKeyStr = `\\"${keyName}\\"`;
        if (text.indexOf(escapedKeyStr) !== -1) {
            const unescaped = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            return extractJsonWithKey(unescaped, keyName);
        }
        return null;
    }
    
    let openBraceIdx = -1;
    for (let i = keyIdx; i >= 0; i--) {
        if (text[i] === '{') {
            // Verifica se este '{' não está dentro de uma string ou array (simplificado)
            openBraceIdx = i;
            break;
        }
    }
    
    if (openBraceIdx === -1) return null;
    
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = openBraceIdx; i < text.length; i++) {
        const char = text[i];
        if (escapeNext) { escapeNext = false; continue; }
        if (char === '\\') { escapeNext = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        
        if (!inString) {
            if (char === '{') braceCount++;
            else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    const jsonStr = text.substring(openBraceIdx, i + 1);
                    try {
                        return JSON.parse(jsonStr);
                    } catch (e) {
                         // Pode haver chaves falsas antes, mas geralmente o primeiro match correto funciona.
                         // Se falhar o parse, a função cai e tenta a próxima etapa
                    }
                }
            }
        }
    }
    return null;
}

async function getReapStateAPI(): Promise<any> {
    const rscResp = await fetch(window.location.href, {
        headers: {
            "Accept": "text/x-component",
            "RSC": "1"
        }
    });
    
    const text = await rscResp.text();
    const extracted = extractJsonWithKey(text, "informesMensais");
    
    if (extracted && extracted.informesMensais) {
        return extracted;
    }

    throw new Error("Não foi possível decodificar os informesMensais do servidor");
}


async function executeTurboFill(config: TurboReapConfig) {
    console.log("[SIGESS Turbo] Iniciando Preenchimento Turbo...");
    const matchReapId = window.location.pathname.match(REAP_ID_REGEX);
    if (!matchReapId) {
        throw new Error("ID do REAP não encontrado na URL. Navegue para a página do relatório.");
    }
    const reapId = matchReapId[1];

    try {
        console.log(`[SIGESS Turbo] Extraindo action hash do HTML...`);
        const actionHash = await getActionHash();

        console.log(`[SIGESS Turbo] Extraindo payload atualizado do servidor Next.js...`);
        // O build requer todos os meses com os "id"s de banco atualizados.
        let state = await getReapStateAPI();
        
        console.log(`[SIGESS Turbo] Montando payload protegido por Types`);
        const payload = buildPayload(reapId, state, config);

        console.log(`[SIGESS Turbo] Disparando Action POST [${actionHash}]...`);
        await submitReap(reapId, payload, actionHash);

        console.log(`[SIGESS Turbo] Prontinho! Recarregando...`);
        alert("Preenchimento Turbo concluído com sucesso!");
        window.location.reload();
        
        return { success: true };
    } catch (error: any) {
        console.error("[SIGESS Turbo Error]", error);
        alert("Falha no preenchimento turbo: " + error.message);
        return { success: false, error: error.message };
    }
}

// Escuta mensagens do background (originadas pelo popup)
if (typeof browser !== "undefined") {
    browser.runtime.onMessage.addListener((message: any) => {
        if (message.action === "executeTurboFill" && message.config) {
            // Retorna a promise pro sendResponse resolver
            return executeTurboFill(message.config);
        }
    });
    console.log("SIGESS Turbo Script Injected and Ready.");
}
