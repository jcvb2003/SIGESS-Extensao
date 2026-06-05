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

    private logMonthDiagnostics(label: string, monthNum: number, monthState: any) {
        console.log(`[SIGESS TURBO DIAGNOSTICS] ${label} Mês ${monthNum}:`, this.buildMonthDiagnostics(monthState));
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
        if (freshHashes.length > 0) this.lastActionHash = freshHashes[freshHashes.length - 1];
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
            if (oldMes.mes !== mesNumber) return { ...oldMes };

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
        return newState;
    }

    private async submitMonth(monthNum: number, payload: any): Promise<any | null> {
        this.debugLogger.log(`Enviando Mês ${monthNum}...`);

        this.logMonthDiagnostics("Payload", monthNum, payload?.[1]?.informesMensais?.find((mes: any) => mes.mes === monthNum));
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

            console.log(`[SIGESS TURBO] Resposta raw mês ${monthNum}:`, responseText.substring(0, 500));
            this.debugLogger.log(`Mês ${monthNum} enviado com sucesso.`, 'success');
            const refreshedState = await this.getReapState();
            this.logMonthDiagnostics("Retorno", monthNum, this.getMonthState(refreshedState, monthNum));
            return refreshedState;
        } catch (e: any) {
            this.debugLogger.log(`Erro Mês ${monthNum}: ${e.message}`, 'error');
            return null;
        }
    }

    private async processMonths(startMonth: number, config: any, initialState: any): Promise<boolean> {
        let currentState = structuredClone(initialState);
        
        for (let m = startMonth; m <= 12; m++) {
            if (State.stopRequested) {
                this.debugLogger.log("Interrupção solicitada pelo usuário.", "warn");
                return false;
            }

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
                console.warn(`[SIGESS TURBO DIAGNOSTICS] Mês ${m} voltou do servidor sem persistir como preenchido.`, this.buildMonthDiagnostics(persistedMonth));
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

            // Diagnóstico para confirmar o nome do campo de mês
            if ((globalThis as any).__SIGESS_DEBUG && initialState.informesMensais?.[0]) {
                const first = initialState.informesMensais[0];
                this.debugLogger.log(`[DEBUG] Estrutura do mês detectada: ${JSON.stringify(first)}`);
                if (first.mes === undefined) {
                    this.debugLogger.log("[AVISO] Campo 'mes' não encontrado no objeto. Verifique o console.", 'error');
                }
            }

            const completed = await this.processMonths(startMonth, config, initialState);

            if (!State.stopRequested && completed) {
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

    // --- DIAGNOSTIC INTERCEPTOR ---
    if (!(globalThis as any).__sigessTurboFetchIntercepted) {
        (globalThis as any).__sigessTurboFetchIntercepted = true;
        const origFetch = globalThis.fetch;
        globalThis.fetch = async function(...args) {
            const [url, options] = args;
            const urlText = typeof url === 'string' ? url : url instanceof URL ? url.toString() : String(url);
            if (options?.method === 'POST' && urlText.includes('informe-mensal')) {
                console.log("%c=== [SIGESS TURBO DIAGNOSTICS] POST CAPTURED ===", "color: #ff00ff; font-weight: bold; font-size: 14px;");
                
                const headersList: any = {};
                const headers = options.headers;
                if (headers instanceof Headers) {
                    headers.forEach((v, k) => { headersList[k] = v; });
                } else {
                    Object.assign(headersList, headers || {});
                }
                
                console.log("URL:", urlText);
                console.log("Headers:", JSON.stringify(headersList, null, 2));
                if (typeof options.body === 'string') {
                    try {
                        console.log("Body JSON:", JSON.stringify(JSON.parse(options.body), null, 2));
                    } catch {
                        console.log("Body Raw:", options.body);
                    }
                } else {
                    console.log("Body (Raw):", options.body);
                }
                console.log("%c=====================================================", "color: #ff00ff; font-weight: bold;");
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
        console.log('[SIGESS Turbo] Ready v2.7.2-FLEX');
    }
}
