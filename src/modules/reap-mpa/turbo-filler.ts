import { TurboReapConfig } from '../../shared/types';
import { State } from './session-state';
import { DebugLogger } from '../debug/DebugLogger';

if (!(globalThis as any).__sigessTurboLogSilenced) {
    (globalThis as any).__sigessTurboLogSilenced = true;
    console.log('[SIGESS Turbo] Module Loaded');
}

class ReapTurbo {
    private readonly debugLogger: DebugLogger;
    private lastActionHash: string = "1de3f791ab9ce1ca497934828395f2c7cc2291e8";
    private uploadActionHash: string = "ee4120ba1ef508ab9c7b100f438c4a9bf9b7b2bf";

    constructor() { 
        this.debugLogger = new DebugLogger("REAP-TURBO"); 
    }

    private getMonthState(state: any, monthNum: number): any {
        return state?.informesMensais?.find((mes: any) => mes.mes === monthNum) ?? null;
    }

    private buildMonthDiagnostics(monthState: any): any {
        if (!monthState) return null;
        return {
            mes: monthState.mes,
            houvePesca: monthState.houvePesca,
            diasTrabalhados: monthState.diasTrabalhados ?? null,
            justificativasNaoDeclaracao: monthState.justificativasNaoDeclaracao ?? [],
            areasRealizacaoPesca: monthState.areasRealizacaoPesca ?? [],
            resultadosOperacaoPesca: monthState.resultadosOperacaoPesca ?? [],
            preenchido: monthState.preenchido,
            enviado: monthState.enviado,
            invalido: monthState.invalido,
            observacao: monthState.observacao ?? ""
        };
    }

    private extractActionHashCandidates(html: string): string[] {
        const candidates = new Set<string>();
        const actionRegex = /\$ACTION_ID_\w*([a-f0-9]{40})/g;
        const nextActionRegex = /next-action["':\s=]+([a-f0-9]{40})/gi;
        let m;
        while ((m = actionRegex.exec(html)) !== null) { if (m[1]) candidates.add(m[1]); }
        while ((m = nextActionRegex.exec(html)) !== null) { if (m[1]) candidates.add(m[1].toLowerCase()); }
        return Array.from(candidates);
    }

    private findReapStateInObject(o: any): any {
        if (!o || typeof o !== 'object') return null;
        if (o.id && o.pescador && o.informesMensais && o.dataAtualizacao) return o;
        if (Array.isArray(o)) {
            for (const item of o) {
                const res = this.findReapStateInObject(item);
                if (res) return res;
            }
            return null;
        }
        for (const k of Object.keys(o)) {
            const res = this.findReapStateInObject(o[k]);
            if (res) return res;
        }
        return null;
    }

    private async decodeNextFPayload(payload: string): Promise<any> {
        const colonIdx = payload.indexOf(':');
        if (colonIdx === -1) return null;
        const jsonStr = payload.substring(colonIdx + 1);
        if (!jsonStr.includes("informesMensais")) return null;
        return this.findReapStateInObject(JSON.parse(jsonStr));
    }

    private async getReapState(): Promise<any> {
        const url = new URL(globalThis.location.href);
        url.searchParams.set('_v', Date.now().toString());
        const response = await fetch(url.toString(), { cache: 'no-store' });
        const html = await response.text();
        const freshHashes = this.extractActionHashCandidates(html);
        this.debugLogger.diag("Hashes encontrados na página:", freshHashes);
        if (freshHashes.length > 0) {
            this.lastActionHash = freshHashes[freshHashes.length - 1];
            const otherHash = freshHashes.find(h => h !== this.lastActionHash);
            if (otherHash) {
                this.uploadActionHash = otherHash;
            } else {
                this.debugLogger.diag("Apenas um hash encontrado — uploadActionHash não atualizado. Usando: " + this.uploadActionHash);
            }
        } else {
            this.debugLogger.diag("Nenhum hash de ação encontrado na página — usando fallbacks hardcoded.");
        }
        const regex = /self\.__next_f\.push\((\[[\s\S]*?\])\)/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            try {
                const arr = JSON.parse(match[1]);
                if (arr[0] === 1 && typeof arr[1] === 'string') {
                    const state = await this.decodeNextFPayload(arr[1]);
                    if (state) return state;
                }
            } catch (e) {
                console.debug("[SIGESS Turbo] Failed to parse payload chunk:", e);
            }
        }
        return null;
    }

    private getNextRouterStateTree(): string {
        const pathParts = globalThis.location.pathname.split('/').filter(Boolean);
        const id = pathParts[1] || "";
        const versao = pathParts[2] || "v2";
        const tipoVisualizacao = pathParts[3] || "cadastro";
        const tree = [
            "",
            {
                "children": [
                    "manutencao",
                    {
                        "children": [
                            ["id", id, "d"],
                            {
                                "children": [
                                    ["versao", versao, "d"],
                                    {
                                        "children": [
                                            ["tipoVisualizacao", tipoVisualizacao, "d"],
                                            {
                                                "children": [
                                                    "informe-mensal",
                                                    {
                                                        "children": [
                                                            "__PAGE__",
                                                            {},
                                                            globalThis.location.pathname,
                                                            "refresh"
                                                        ]
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            null,
            null,
            true
        ];
        return encodeURIComponent(JSON.stringify(tree));
    }

    private updateStateWithMonth(state: any, mesNumber: number, userConfig: TurboReapConfig): any {
        const newState = structuredClone(state);
        const mesConfig = userConfig.meses.find(m => m.mes === mesNumber);

        // Localiza um documento de justificativa já existente em qualquer mês (para reutilizar em meses sem documento)
        const existingDoc = newState.informesMensais.find(
            (mes: any) => mes.documentoJustificativaNaoDeclaracao
        )?.documentoJustificativaNaoDeclaracao ?? null;

        newState.informesMensais = newState.informesMensais.map((oldMes: any) => {
            if (oldMes.mes !== mesNumber) {
                // Propaga documento existente para outros meses sem pesca que ainda não têm doc.
                // O servidor valida o estado completo e rejeita se qualquer mês sem pesca estiver sem doc.
                if (!oldMes.houvePesca && !oldMes.documentoJustificativaNaoDeclaracao && existingDoc) {
                    return { ...oldMes, documentoJustificativaNaoDeclaracao: existingDoc };
                }
                return { ...oldMes };
            }

            const m = { ...oldMes };
            m.observacao = m.observacao || "";

            const houvePesca = Boolean(mesConfig?.houvePesca);

            m.houvePesca = houvePesca;
            m.preenchido = true;
            m.invalido = false;

            if (houvePesca) {
                m.diasTrabalhados = Number(mesConfig?.diasTrabalhados ?? 15);
                m.justificativasNaoDeclaracao = [];
                delete m.documentoJustificativaNaoDeclaracao;
                m.areasRealizacaoPesca = [{
                    ...userConfig.areaRealizacao,
                    ambientePesca: [Number(userConfig.areaRealizacao.ambientePesca)]
                }];
                const existingRows = Array.isArray(oldMes.resultadosOperacaoPesca) ? oldMes.resultadosOperacaoPesca : [];
                const speciesToSend = (mesConfig?.especies || [])
                    .filter(Boolean)
                    .slice(0, existingRows.length > 0 ? existingRows.length : (mesConfig?.especies?.length ?? 2));
                m.resultadosOperacaoPesca = speciesToSend.map((esp: any, i: number) => {
                    const existingRow = existingRows[i];
                    const preserveId = existingRow?.id && existingRow?.especiePescado === esp.especiePescado;
                    return {
                        ...esp,
                        ...(preserveId ? { id: existingRow.id } : {})
                    };
                });
            } else {
                m.houvePesca = false;
                delete m.diasTrabalhados;
                m.justificativasNaoDeclaracao = [Number(mesConfig?.justificativa ?? 1)];
                m.areasRealizacaoPesca = [];
                m.resultadosOperacaoPesca = [];
                // Reutiliza documento de justificativa de outro mês se este não tiver um
                if (!m.documentoJustificativaNaoDeclaracao && existingDoc) {
                    m.documentoJustificativaNaoDeclaracao = existingDoc;
                }
            }
            return m;
        });

        newState.concordaComDeclaracaoResponsabilidade = true;
        delete newState.errosValidacao;
        if (newState.configuracoes) newState.configuracoes.podeEnviar = "true";

        const docSummary = newState.informesMensais.map((m: any) => `m${m.mes}:${m.houvePesca ? 'pesca' : m.documentoJustificativaNaoDeclaracao ? '✅doc' : '❌sem-doc'}`).join(' ');
        this.debugLogger.diag(`Payload docs ao salvar mês ${mesNumber}: ${docSummary}`);

        return newState;
    }

    private async uploadDocument(pdfB64: string, filename: string, mesNumber?: number, informeMensalId?: number): Promise<any | null> {
        this.debugLogger.diag(`Upload: b64.length=${pdfB64?.length ?? 0}, filename=${filename}, mes=${mesNumber ?? '?'}, informeMensalId=${informeMensalId ?? '?'}`);
        if (!pdfB64 || pdfB64.length < 100) {
            this.debugLogger.diag("Upload cancelado: pdfB64 vazio ou inválido.");
            return null;
        }

        const hash = this.uploadActionHash;

        return new Promise<any | null>((resolve) => {
            const eid = `__sigessUpload_${Date.now()}`;
            const tree = this.getNextRouterStateTree();

            const handler = (e: Event) => {
                const text: string = (e as CustomEvent).detail ?? "";
                this.debugLogger.diag(`Upload resposta: ${text.substring(0, 300)}`);
                for (const line of text.split("\n")) {
                    if (!line.startsWith("1:")) continue;
                    if (line.startsWith("1:E")) { this.debugLogger.diag("Upload: erro do servidor: " + line); break; }
                    try { resolve(JSON.parse(line.slice(2))); return; } catch { /* continua */ }
                }
                resolve(null);
            };
            window.addEventListener(eid, handler, { once: true });

            const script = document.createElement("script");
            script.textContent = `(function(){
  try {
    const b64=${JSON.stringify(pdfB64)};
    const fn=${JSON.stringify(filename)};
    const imId=${JSON.stringify(informeMensalId != null ? String(informeMensalId) : null)};
    const reapId=(location.pathname.match(/\\/manutencao\\/(\\d+)\\//)||[])[1]||'';
    const bytes=new Uint8Array(atob(b64).split('').map(c=>c.charCodeAt(0)));
    const blob=new Blob([bytes],{type:'application/pdf'});
    const fd=new FormData();
    fd.append('1_tipoDocumentoPessoal','22');
    fd.append('1_nome',fn);
    fd.append('1_arquivo',blob,fn);
    if(imId) fd.append('1_informeMensal',imId);
    fd.append('0',JSON.stringify(['$K1',reapId]));
    const xhr=new XMLHttpRequest();
    xhr.open('POST',location.href,true);
    xhr.setRequestHeader('next-action',${JSON.stringify(hash)});
    xhr.setRequestHeader('accept','text/x-component');
    xhr.setRequestHeader('next-router-state-tree',${JSON.stringify(tree)});
    xhr.withCredentials=true;
    xhr.onload=function(){window.dispatchEvent(new CustomEvent(${JSON.stringify(eid)},{detail:xhr.responseText}));};
    xhr.onerror=function(){window.dispatchEvent(new CustomEvent(${JSON.stringify(eid)},{detail:'ERROR:xhr network error'}));};
    xhr.send(fd);
  } catch(e){
    window.dispatchEvent(new CustomEvent(${JSON.stringify(eid)},{detail:'ERROR:'+e.message}));
  }
})();`;
            document.head.appendChild(script);

            setTimeout(() => { window.removeEventListener(eid, handler); resolve(null); }, 30000);
        });
    }

    private async applyDocumentToNonFishingMonths(config: any, pdfB64: string, filename: string): Promise<void> {
        const activeMeses = config.mesesFiltro
            ? config.meses.filter((m: any) => config.mesesFiltro.includes(m.mes))
            : config.meses;
        const nonFishingFromConfig = activeMeses
            .filter((m: any) => !m.houvePesca)
            .map((m: any) => m.mes as number);

        if (nonFishingFromConfig.length === 0) {
            this.debugLogger.log("Nenhum mês sem pesca para anexar documento.");
            return;
        }

        // Verifica estado atual do servidor para pular meses já preenchidos
        this.debugLogger.log("Verificando estado atual antes de aplicar documentos...");
        const freshState = await this.getReapState();
        const nonFishingMonths = nonFishingFromConfig.filter((mesNum: number) => {
            const serverMonth = freshState?.informesMensais?.find((m: any) => m.mes === mesNum);
            return !serverMonth?.preenchido;
        });

        if (nonFishingMonths.length === 0) {
            this.debugLogger.log("Todos os meses sem pesca já estão preenchidos! Nada a fazer.");
            return;
        }

        this.debugLogger.log(`Upload do documento para ${nonFishingMonths.length} mês(es) pendente(s): [${nonFishingMonths.join(", ")}] (${nonFishingFromConfig.length - nonFishingMonths.length} já preenchidos)`);

        // Tenta upload único (usando o ID do primeiro mês pendente) e reutiliza o objeto nos demais
        const firstMesNum = nonFishingMonths[0];
        const firstInformeMensalId = freshState?.informesMensais?.find((m: any) => m.mes === firstMesNum)?.id;
        const docObj = await this.uploadDocument(pdfB64, filename, firstMesNum, firstInformeMensalId);
        if (!docObj?.id) {
            this.debugLogger.log("Upload do documento falhou — meses sem pesca ficam pendentes.", "error");
            return;
        }
        this.debugLogger.log(`Documento enviado: id=${docObj.id} — re-salvando meses ${nonFishingMonths.join(", ")}...`);

        let currentState = freshState;
        if (!currentState) {
            this.debugLogger.log("Falha ao obter estado fresco para aplicar documentos.", "error");
            return;
        }

        for (const mesNum of nonFishingMonths) {
            if (State.stopRequested) break;

            currentState = this.updateStateWithMonth(currentState, mesNum, config);
            // Injeta o documento no mês alvo dentro do estado
            const mesRef = currentState.informesMensais.find((m: any) => m.mes === mesNum);
            if (mesRef) mesRef.documentoJustificativaNaoDeclaracao = docObj;

            const payload = [String(currentState.id), { informesMensais: currentState.informesMensais, concordaComDeclaracaoResponsabilidade: true }, 3];
            const updatedState = await this.submitMonth(mesNum, payload);
            if (!updatedState) {
                this.debugLogger.log(`Falha ao re-salvar mês ${mesNum} com documento.`, "error");
                continue;
            }

            const persisted = this.getMonthState(updatedState, mesNum);
            if (persisted?.preenchido) {
                this.debugLogger.log(`✅ Mês ${mesNum} concluído com documento.`, "success");
                State.monthlyProgress[mesNum - 1] = "done";
            } else {
                // Fallback: tenta upload individual para este mês
                this.debugLogger.log(`Mês ${mesNum}: upload único não funcionou, tentando upload individual...`, "warn");
                const individualInformeMensalId = freshState?.informesMensais?.find((m: any) => m.mes === mesNum)?.id;
                const docObjIndividual = await this.uploadDocument(pdfB64, filename, mesNum, individualInformeMensalId);
                if (docObjIndividual?.id) {
                    const mesRef2 = updatedState.informesMensais.find((m: any) => m.mes === mesNum);
                    if (mesRef2) mesRef2.documentoJustificativaNaoDeclaracao = docObjIndividual;
                    const payload2 = [String(updatedState.id), { informesMensais: updatedState.informesMensais, concordaComDeclaracaoResponsabilidade: true }, 3];
                    const updatedState2 = await this.submitMonth(mesNum, payload2);
                    const persisted2 = updatedState2 ? this.getMonthState(updatedState2, mesNum) : null;
                    if (persisted2?.preenchido) {
                        this.debugLogger.log(`✅ Mês ${mesNum} concluído com upload individual.`, "success");
                        State.monthlyProgress[mesNum - 1] = "done";
                        currentState = updatedState2;
                        continue;
                    }
                }
                this.debugLogger.log(`Mês ${mesNum}: documento não persistiu após fallback.`, "error");
            }

            currentState = updatedState;
            if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
        }
    }

    private async submitMonth(monthNum: number, payload: any): Promise<any | null> {
        this.debugLogger.log(`Enviando Mês ${monthNum}...`);

        this.debugLogger.diag(`Payload mês ${monthNum}:`, this.buildMonthDiagnostics(payload?.[1]?.informesMensais?.find((mes: any) => mes.mes === monthNum)));
        try {
            const resp = await fetch(globalThis.location.href, {
                method: 'POST',
                headers: { 
                    'next-action': this.lastActionHash, 
                    'content-type': 'text/plain;charset=UTF-8', 
                    'accept': 'text/x-component',
                    'next-router-state-tree': this.getNextRouterStateTree()
                },
                body: JSON.stringify(payload)
            });
            
            const responseText = await resp.text();
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}. Body: ${responseText}`);
            }

            this.debugLogger.diag(`Resposta raw mês ${monthNum}: ${responseText.substring(0, 500)}`);
            this.debugLogger.log(`Mês ${monthNum} enviado com sucesso.`, 'success');
            const refreshedState = await this.getReapState();
            this.debugLogger.diag(`Retorno mês ${monthNum}:`, this.buildMonthDiagnostics(this.getMonthState(refreshedState, monthNum)));
            return refreshedState;
        } catch (e: any) {
            this.debugLogger.log(`Erro Mês ${monthNum}: ${e.message}`, 'error');
            return null;
        }
    }

    private async processMonths(startMonth: number, config: any, initialState: any): Promise<boolean> {
        let currentState = structuredClone(initialState);
        const mesesFiltro: number[] | undefined = config.mesesFiltro;
        if (mesesFiltro?.length) {
            this.debugLogger.log(`Filtro de meses ativo: [${mesesFiltro.join(", ")}]`);
        }

        for (let m = startMonth; m <= 12; m++) {
            if (State.stopRequested) {
                this.debugLogger.log("Interrupção solicitada pelo usuário.", "warn");
                return false;
            }

            if (mesesFiltro && !mesesFiltro.includes(m)) continue;

            // Pula meses que o servidor não retornou (não disponíveis para preenchimento)
            const exists = currentState.informesMensais.some((mesObj: any) => mesObj.mes === m);
            if (!exists) {
                this.debugLogger.log(`Mês ${m} indisponível no servidor. Pulando...`, 'warn');
                State.monthlyProgress[m - 1] = "skipped";
                if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
                continue;
            }

            this.debugLogger.log(`--- MÊS ${m} ---`, 'success');
            
            // 1. Atualizar o estado CUMULATIVO local (passando o número do mês, não o índice)
            currentState = this.updateStateWithMonth(currentState, m, config);

            // Salvaguarda: garantir invalido=false para o mês atual (o servidor ignora dados de meses invalido:true)
            const curMesRef = currentState.informesMensais.find((mes: any) => mes.mes === m);
            if (curMesRef) curMesRef.invalido = false;

            // 2. Construir payload final com o estado completo
            const payload = [String(currentState.id), { informesMensais: currentState.informesMensais, concordaComDeclaracaoResponsabilidade: true }, 3];

            // 3. Enviar
            const updatedState = await this.submitMonth(m, payload);
            if (!updatedState) return false;
            const persistedMonth = this.getMonthState(updatedState, m);
            if (!persistedMonth?.preenchido) {
                this.debugLogger.diag(`Mês ${m} voltou do servidor sem persistir como preenchido.`, this.buildMonthDiagnostics(persistedMonth));
                State.monthlyProgress[m-1] = "skipped";
            } else {
                State.monthlyProgress[m-1] = "done";
            }
            currentState = updatedState;

            if (m < 12) State.currentMonthIndex = m;
            if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
        }

        return true;
    }

    public async run(config: any) {
        if ((globalThis as any).__sigessTurboRunning) return;
        (globalThis as any).__sigessTurboRunning = true;
        State.stopRequested = false;
        
        if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
        if ((globalThis as any).showTurboOverlay) (globalThis as any).showTurboOverlay();
        
        const startMonth = config.startMonth || 1;
        this.debugLogger.log(`REAP TURBO ULTRA-FAST (Início: Mês ${startMonth})`);

        try {
            this.debugLogger.log("Obtendo estado inicial...");
            const initialState = await this.getReapState();
            if (!initialState) throw new Error("Não foi possível carregar o estado atual do SIGESS.");

            if (initialState.informesMensais?.[0]) {
                this.debugLogger.diag("Estrutura do primeiro mês:", initialState.informesMensais[0]);
            }

            const completed = await this.processMonths(startMonth, config, initialState);

            if (!State.stopRequested && completed) {
                if (config.documentoMode !== "manual") {
                    if (config.documentoPdfB64) {
                        this.debugLogger.log("Aplicando documentos comprobatórios...");
                        await this.applyDocumentToNonFishingMonths(config, config.documentoPdfB64, config.documentoPdfFilename || "documento.pdf");
                    } else {
                        this.debugLogger.log(`Modo documento '${config.documentoMode}' ativo mas documentoPdfB64 está vazio — segundo pass pulado.`, "warn");
                    }
                }
                alert("Turbo Fill Concluído!");
                globalThis.location.reload();
            } else if (!State.stopRequested && !completed) {
                throw new Error("O preenchimento Turbo falhou durante o envio.");
            }
        } finally { 
            (globalThis as any).__sigessTurboRunning = false;
            if ((globalThis as any).hideTurboOverlay) (globalThis as any).hideTurboOverlay();
            if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
        }
    }
}

if (globalThis.window !== undefined && !(globalThis as any).__sigessTurboLoaded) {
    const turbo = new ReapTurbo();
    (globalThis as any).__sigessTurboLoaded = true;

    // Interceptor de diagnóstico de fetch — ativo apenas quando __SIGESS_DIAGNOSTICS=true
    if (!(globalThis as any).__sigessTurboFetchIntercepted) {
        (globalThis as any).__sigessTurboFetchIntercepted = true;
        const origFetch = globalThis.fetch;
        globalThis.fetch = async function(...args) {
            const [url, options] = args;
            const urlText = typeof url === 'string' ? url : url instanceof URL ? url.toString() : String(url);
            if ((globalThis as any).__SIGESS_DIAGNOSTICS && options?.method === 'POST' && urlText.includes('informe-mensal')) {
                const headersList: any = {};
                const headers = options.headers;
                if (headers instanceof Headers) {
                    headers.forEach((v, k) => { headersList[k] = v; });
                } else {
                    Object.assign(headersList, headers || {});
                }
                console.log("%c=== [SIGESS DIAG] POST CAPTURED ===", "color: #a78bfa; font-weight: bold;");
                console.log("URL:", urlText, "| Headers:", headersList);
                if (typeof options.body === 'string') {
                    try { console.log("Body:", JSON.parse(options.body)); } catch { console.log("Body:", options.body); }
                } else {
                    console.log("Body:", options.body);
                }
            }
            return origFetch.apply(this, args);
        };
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
            if (msg.action === "executeTurboFill") {
                turbo.run(msg.config)
                    .then(res => sendResponse({ success: true, result: res }))
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true; 
            }
        });
    }
    
    globalThis.addEventListener('message', async (e) => {
        if (e.origin !== globalThis.location.origin) return;
        if (e.data?.type === 'SIGESS_TURBO_START') await turbo.run(e.data.config);
    });
    
    if (!(globalThis as any).__sigessTurboLogSilencedOnce) {
        (globalThis as any).__sigessTurboLogSilencedOnce = true;
        console.log('[SIGESS Turbo] Ready v2.8.0');
    }
}
