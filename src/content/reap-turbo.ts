import { TurboReapConfig } from '../shared/types';
import { State } from './state';

if (!(globalThis as any).__sigessTurboLogSilenced) {
    (globalThis as any).__sigessTurboLogSilenced = true;
    console.log('[SIGESS Turbo] Module Loaded');
}

/**
 * 🛠️ SIGESS Turbo Debug Module
 */
class TurboLogger {
    private readonly overlay: HTMLDivElement | null = null;
    constructor() { if (globalThis.document !== undefined) this.createOverlay(); }
    private createOverlay() {
        console.log("[SIGESS Turbo] Overlay disabled by request.");
    }
    log(msg: string, type: 'info' | 'warn' | 'error' | 'success' | 'payload' = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const colors: Record<string, string> = { info: '#00ff00', warn: '#ffaa00', error: '#ff3333', success: '#00ffff', payload: '#ff00ff' };
        const color = colors[type] || '#fff';
        console.log(`%c[SIGESS Turbo] ${msg}`, `color: ${color}`);
        if (this.overlay) {
            const entry = document.createElement('div');
            entry.style.marginBottom = '6px';
            entry.style.borderLeft = `3px solid ${color}`;
            entry.style.paddingLeft = '6px';
            entry.innerHTML = `<span style="color:#888;font-size:9px">[${timestamp}]</span> <span style="color:${color}">${msg}</span>`;
            this.overlay.appendChild(entry);
            this.overlay.scrollTop = this.overlay.scrollHeight;
        }
    }
    show() { if (this.overlay) this.overlay.style.display = 'block'; }
}

class ReapTurbo {
    private readonly turboLogger: TurboLogger;
    private lastActionHash: string = "0e19fa9cd1721c7395e62a3a725505d58b5b5630";

    constructor() { this.turboLogger = new TurboLogger(); }

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
        if (freshHashes.length > 0) this.lastActionHash = freshHashes[0];
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
        const tipoVisualizacao = pathParts[2] || "cadastro";
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
            },
            null,
            null,
            true
        ];
        return encodeURIComponent(JSON.stringify(tree));
    }

    private buildPayload(state: any, mesIndex: number, userConfig: TurboReapConfig): any {
        const newState = structuredClone(state);
        const mesConfig = userConfig.meses.find(m => m.mes === (mesIndex + 1));
        
        newState.informesMensais = newState.informesMensais.map((oldMes: any, idx: number) => {
            const m = { ...oldMes };
            m.observacao = m.observacao || "";

            // FIX: Next.js Zod expects ambientePesca as string everywhere.
            // Additionally, the Native form explicitly strips out `id` from `areasRealizacaoPesca`.
            if (m.areasRealizacaoPesca && Array.isArray(m.areasRealizacaoPesca)) {
                m.areasRealizacaoPesca = m.areasRealizacaoPesca.map((a: any) => {
                    const cloned = { ...a };
                    delete cloned.id;
                    cloned.ambientePesca = cloned.ambientePesca === undefined ? cloned.ambientePesca : String(cloned.ambientePesca);
                    return cloned;
                });
            }

            if (idx === mesIndex) {
                const houvePesca = mesConfig ? Boolean(mesConfig.houvePesca) : false;
                
                m.houvePesca = houvePesca;
                m.preenchido = true;
                
                if (houvePesca) {
                    m.diasTrabalhados = mesConfig?.diasTrabalhados || 15;
                    m.justificativasNaoDeclaracao = [];
                    m.areasRealizacaoPesca = [{
                        ...userConfig.areaRealizacao,
                        ambientePesca: String(userConfig.areaRealizacao.ambientePesca)
                    }];
                    m.resultadosOperacaoPesca = mesConfig?.especies?.map((esp, i) => {
                        const existingId = oldMes.resultadosOperacaoPesca?.[i]?.id;
                        return {
                            ...esp,
                            ...(existingId ? { id: existingId } : {})
                        };
                    }) || [];
                } else {
                    delete m.diasTrabalhados;
                    m.justificativasNaoDeclaracao = [mesConfig?.justificativa || 1];
                    m.areasRealizacaoPesca = [];
                    m.resultadosOperacaoPesca = [];
                }
                return m;
            }
            return m;
        });

        if (newState.configuracoes) newState.configuracoes.podeEnviar = "true";
        return [String(newState.id), newState, 3];
    }

    private async submitMonth(monthNum: number, userConfig: TurboReapConfig): Promise<boolean> {
        const mesIndex = monthNum - 1;
        const mesConfig = userConfig.meses.find(mc => mc.mes === monthNum);
        const desiredHouvePesca = mesConfig ? Boolean(mesConfig.houvePesca) : false;

        this.turboLogger.log(`--- MÊS ${monthNum} ---`, 'success');
        this.turboLogger.log(`Config: Houve Pesca = ${desiredHouvePesca}`, 'info');

        const state = await this.getReapState();
        if (!state) return false;

        // Versão 2.7.1-FORCE: Não pula mais meses "verdes" para permitir correção de dados.
        const payload = this.buildPayload(state, mesIndex, userConfig);
        this.turboLogger.log(`Enviando Mês ${monthNum}...`);

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
            if (!resp.ok) {
                const errorBody = await resp.text();
                throw new Error(`HTTP ${resp.status}. Body: ${errorBody}`);
            }
            
            this.turboLogger.log(`Sincronizando...`);
            await new Promise(r => setTimeout(r, 2000));
            const freshState = await this.getReapState();
            
            if (freshState?.informesMensais[mesIndex]?.preenchido) {
                const actuallyHouvePesca = freshState.informesMensais[mesIndex]?.houvePesca;
                this.turboLogger.log(`Mês ${monthNum} OK! (Houve Pesca no Server: ${actuallyHouvePesca})`, 'success');
                return true;
            }
            this.turboLogger.log(`Mês ${monthNum} falhou na persistência.`, 'warn');
            return false;
        } catch (e: any) {
            this.turboLogger.log(`Erro Mês ${monthNum}: ${e.message}`, 'error');
            return false;
        }
    }

    public async run(config: any) {
        if ((globalThis as any).__sigessTurboRunning) return;
        (globalThis as any).__sigessTurboRunning = true;
        State.stopRequested = false;
        if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
        if ((globalThis as any).showTurboOverlay) (globalThis as any).showTurboOverlay();
        
        const startMonth = config.startMonth || 1;
        this.turboLogger.log(`REAP TURBO v2.7.2-FLEX (Início: Mês ${startMonth})`);
        try {
            for (let m = startMonth; m <= 12; m++) {
                if (State.stopRequested) {
                    this.turboLogger.log("Interrupção solicitada pelo usuário.", "warn");
                    break;
                }
                if (!(await this.submitMonth(m, config))) break;
                await new Promise(r => setTimeout(r, 1000));
            }
            if (!State.stopRequested) {
                alert("Turbo Fill Concluído!");
                globalThis.location.reload();
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
    const origFetch = globalThis.fetch;
    globalThis.fetch = async function(...args) {
        const [url, options] = args;
        if (options?.method === 'POST' && typeof url === 'string' && url.includes('informe-mensal')) {
            console.log("%c=== [SIGESS TURBO DIAGNOSTICS] NATIVE POST CAPTURED ===", "color: #ff00ff; font-weight: bold; font-size: 14px;");
            
            const headersList: any = {};
            const headers = options.headers;
            if (headers instanceof Headers) {
                headers.forEach((v, k) => { headersList[k] = v; });
            } else {
                Object.assign(headersList, headers || {});
            }
            
            console.log("Headers:", JSON.stringify(headersList, null, 2));
            if (typeof options.body === 'string') {
                console.log("Body JSON:", JSON.stringify(JSON.parse(options.body), null, 2));
            } else {
                console.log("Body (Raw):", options.body);
            }
            console.log("%c=====================================================", "color: #ff00ff; font-weight: bold;");
            // Payload capture alert removed for speed
        }
        return origFetch.apply(this, args);
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
            if (msg.action === "executeTurboFill") {
                turbo.run(msg.config)
                    .then(res => sendResponse({ success: true, result: res }))
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true; // Keep message channel open
            }
        });
    }
    globalThis.addEventListener('message', async (e) => {
        // Only accept messages from the same origin
        if (e.origin !== globalThis.location.origin) return;
        if (e.data?.type === 'SIGESS_TURBO_START') await turbo.run(e.data.config);
    });
    if (!(globalThis as any).__sigessTurboLogSilencedOnce) {
        (globalThis as any).__sigessTurboLogSilencedOnce = true;
        console.log('[SIGESS Turbo] Ready v2.7.2-FLEX');
    }
}
