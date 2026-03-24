import { TurboReapConfig } from '../shared/types';

// Constants
const FALLBACK_ACTION_HASH = "0e19fa9cd1721c7395e62a3a725505d58b5b5630";
const REAP_ID_REGEX = /\/manutencao\/(\d+)\//;

/**
 * Dinamicamente encontra o hash de Server Action do Next.js
 * Utiliza o HTML e RSC payloads da página atual.
 */
async function getActionHash(): Promise<string> {
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






async function getReapState(): Promise<any> {
    console.log("[SIGESS Turbo] Buscando estado via HTML puro (bypass DOM mutation e Next.js Cache)...");
    
    // Obter HTML original do servidor adicionando um timestamp para fazer BYPASS no cache agressivo do Next.js App Router
    // Se não fizermos isso, o Next.js retorna o RSC salvo em CDN e o dataAtualizacao acaba sendo antigo, gerando 500 (Optimistic Lock)
    const urlCorrente = new URL(window.location.href);
    urlCorrente.searchParams.set('_t', Date.now().toString());

    const response = await fetch(urlCorrente.toString(), { 
        headers: { 
            "Accept": "text/html",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
        },
        cache: 'no-store' 
    });
    if (!response.ok) {
        throw new Error("Falha ao carregar os dados da página (status " + response.status + ").");
    }
    const html = await response.text();

    console.log("[SIGESS Turbo] HTML obtido. Buscando blocos RSC...");

    const regex = /self\.__next_f\.push\((\[[\s\S]*?\])\)/g;
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(html)) !== null) {
        try {
            const arr = JSON.parse(match[1]);
            if (arr[0] === 1 && typeof arr[1] === 'string') {
                const str = arr[1]; // Exemplo de string: "1c:[\"$\",\"$L2f\",...]"
                const colonIdx = str.indexOf(':');
                if (colonIdx !== -1) {
                    const jsonStr = str.substring(colonIdx + 1);
                    
                    // Só tenta o parse caro se a string conter nossas chaves
                    if (jsonStr.includes("informesMensais") && jsonStr.includes("pescador")) {
                        try {
                            const obj = JSON.parse(jsonStr);
                            
                            const check = (o: any): any => {
                                 if (!o || typeof o !== 'object') return null;
                                 if (o.pescador && o.informesMensais) return o;
                                 if (o.defaultValues?.pescador && o.defaultValues?.informesMensais) return o.defaultValues;
                                 if (Array.isArray(o)) {
                                     for (const item of o) {
                                         const res = check(item);
                                         if (res) return res;
                                     }
                                 }
                                 // Navega fundo nas chaves do objeto
                                 for (const k in o) {
                                     if (o[k] && typeof o[k] === 'object') {
                                         const res = check(o[k]);
                                         if (res) return res;
                                     }
                                 }
                                 return null;
                             };
                             
                             const foundObj = check(obj);
                             if (foundObj) {
                                 console.log("[SIGESS Turbo] Estado RSC capturado perfeitamente via Fetch HTML.");
                                 return foundObj;
                             }
                        } catch (e) {
                            console.warn("[SIGESS Turbo DEBUG] Falha no parse do chunk JSON:", e);
                        }
                    }
                }
            }
        } catch (e) {
            // Ignora falhas de parse de chunks individuais
        }
    }

    throw new Error("Não foi possível encontrar o estado 'pescador' e 'informesMensais' no payload da página. Verifique se o formulário carregou completamente.");
}

function buildPayload(reapId: string, stateOriginal: any, mesIndex: number, userConfig: TurboReapConfig) {
    if (!stateOriginal) throw new Error("Estado nulo");

    // Deep clone para evitar que a modificação de um mês afete os dados do próximo mes iterado.
    const state = JSON.parse(JSON.stringify(stateOriginal));

    // Limpa erros residuais
    state.errosValidacao = {};

    // Força o form a aceitar nosso envio
    if (state.configuracoes) {
        state.configuracoes.podeEnviar = "true";
    }

    if (state.informesMensais && Array.isArray(state.informesMensais)) {
        state.informesMensais = state.informesMensais.map((oldMes: any, idx: number) => {
            const mes = { ...oldMes };
            
            // Só alteramos os dados do mês corrente que estamos salvando (simulando a aba ativa real do usuário)
            // Os outros 11 meses vão intocados, exatamente como o servidor os retornou no fetch.
            if (idx !== mesIndex) {
                 return mes;
            }

            const config = userConfig.meses.find((m: any) => m.mes === mes.mes);

            // Determina houvePesca
            const temEspecies = config?.especies && config.especies.length > 0;
            const houvePesca = config && temEspecies 
                ? Boolean(config.houvePesca) 
                : false;

            // Organiza as chaves para garantir que houvePesca venha antes de preenchido/áreas
            // Isso ajuda alguns parsers rígidos de servidor
            const newMes: any = {
                configuracoes: mes.configuracoes || { diasAtivo: "30" },
                id: mes.id,
                mes: mes.mes,
                houvePesca: houvePesca
            };

            if (houvePesca) {
                newMes.diasTrabalhados = typeof config!.diasTrabalhados === 'number'
                    ? config!.diasTrabalhados
                    : 15;
                newMes.justificativasNaoDeclaracao = [];
                newMes.areasRealizacaoPesca = [{
                    ...userConfig.areaRealizacao,
                    id: mes.areasRealizacaoPesca?.[0]?.id ?? null
                }];
                newMes.resultadosOperacaoPesca = config!.especies!.map(
                    (esp: any, i: number) => ({
                        ...esp,
                        id: mes.resultadosOperacaoPesca?.[i]?.id ?? null
                    })
                );
            } else {
                delete newMes.diasTrabalhados; // O backend não aceita null explícito
                newMes.areasRealizacaoPesca = [];
                newMes.resultadosOperacaoPesca = [];
                newMes.justificativasNaoDeclaracao = [1];
            }

            newMes.preenchido = true;
            return newMes;
        });
    }

    return [reapId.toString(), state, mesIndex];
}

async function submitMonth(url: string, payload: any[], actionHash: string): Promise<boolean> {
    try {
        console.log(`[SIGESS Turbo] Action Hash Mês ${payload[2] + 1}:`, actionHash);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'accept': 'text/x-component',
                'content-type': 'text/plain;charset=UTF-8',
                'next-action': actionHash,
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[SIGESS Turbo] Falha requisição: Status ${response.status}`, errText);
            console.error(`[SIGESS Turbo] PAYLOAD QUE FALHOU NO MÊS ${payload[2] + 1}:`, JSON.stringify(payload));
            throw new Error(`Erro HTTP ${response.status} no mês ${payload[2] + 1}`);
        }

        const data = await response.text();
        if (data.includes("errosValidacao") && data.includes("não deve ser nulo")) {
            console.error("[SIGESS Turbo] Resposta com erro de validação do servidor:", data);
            throw new Error(`Erro de validação no servidor para o mês ${payload[2] + 1}. Verifique se todos os campos obrigatórios estão presentes.`);
        }
        
        return true;
    } catch (e) {
        throw e;
    }
}

function isDeepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 == null || obj2 == null) return false;
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) return false;
        for (let idx = 0; idx < obj1.length; idx++) {
            if (!isDeepEqual(obj1[idx], obj2[idx])) return false;
        }
        return true;
    }
    if (Array.isArray(obj1) || Array.isArray(obj2)) return false;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;

    for (let key of keys1) {
        if (!keys2.includes(key) || !isDeepEqual(obj1[key], obj2[key])) return false;
    }
    return true;
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

        console.log(`[SIGESS Turbo] Disparando Sequência de POSTs (12 meses)...`);
        for (let i = 0; i < 12; i++) {
            console.log(`[SIGESS Turbo] Obtendo estado fresco para o mês ${i + 1}/12...`);
            // O build requer todos os meses com os "id"s de banco atualizados a cada iteração.
            let state = await getReapState();

            console.log(`[SIGESS Turbo] Construindo e salvando mês ${i + 1}/12...`);
            // Construir payload limpo
            const payload = buildPayload(reapId, state, i, config);
            
            // Bypass Inteligente: se as edições computadas forem identicas ao que já está no banco, não enviamos a request.
            // O servidor backend SIGESS aparenta apresentar uma falha 500 digest se uma aba inalterada sequencial sofre update hard.
            const originalMes = state.informesMensais[i];
            const modificadoMes = payload[1].informesMensais[i];
            
            if (isDeepEqual(originalMes, modificadoMes)) {
                console.log(`[SIGESS PAYLOAD MÊS ${i + 1}] Burlado! Estado Idêntico ao DB. (${originalMes.preenchido ? 'Preenchido' : 'Limpo'})`);
                continue; 
            }

            console.log(`[SIGESS PAYLOAD MÊS ${i + 1}] DADOS NOVOS GERADOS:`, JSON.stringify(payload));
            
            await submitMonth(`${window.location.origin}/manutencao/${reapId}/cadastro/informe-mensal`, payload, actionHash);
            console.log(`[SIGESS Turbo] Mês ${i + 1} salvo com sucesso.`);
            
            // Aumentando delay significativamente para evitar DB Pool Exhaustion / Rate Limiting (500)
            await new Promise(resolve => setTimeout(resolve, 2500));
        }

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
