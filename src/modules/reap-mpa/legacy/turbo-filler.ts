import { TurboReapConfig } from '../../../shared/types';
import { State } from '../session-state';
import { DebugLogger } from '../../debug/DebugLogger';

export class ReapTurboLegacy {
    private readonly debugLogger: DebugLogger;
    private lastActionHash: string = "0e19fa9cd1721c7395e62a3a725505d58b5b5630";

    constructor() {
        this.debugLogger = new DebugLogger("REAP-TURBO-LEGACY");
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
                console.debug("[SIGESS Turbo Legacy] Failed to parse payload chunk:", e);
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

    private updateStateWithMonth(state: any, mesNumber: number, userConfig: TurboReapConfig): any {
        const newState = structuredClone(state);
        const mesConfig = userConfig.meses.find(m => m.mes === mesNumber);

        newState.informesMensais = newState.informesMensais.map((oldMes: any) => {
            if (oldMes.mes !== mesNumber) return { ...oldMes };

            const m = { ...oldMes };
            m.observacao = m.observacao || "";

            if (m.areasRealizacaoPesca && Array.isArray(m.areasRealizacaoPesca)) {
                m.areasRealizacaoPesca = m.areasRealizacaoPesca.map((a: any) => {
                    const cloned = { ...a };
                    delete cloned.id;
                    cloned.ambientePesca = cloned.ambientePesca === undefined ? cloned.ambientePesca : String(cloned.ambientePesca);
                    return cloned;
                });
            }

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
                    return { ...esp, ...(existingId ? { id: existingId } : {}) };
                }) || [];
            } else {
                delete m.diasTrabalhados;
                m.justificativasNaoDeclaracao = [mesConfig?.justificativa || 1];
                m.areasRealizacaoPesca = [];
                m.resultadosOperacaoPesca = [];
            }
            return m;
        });

        if (newState.configuracoes) newState.configuracoes.podeEnviar = "true";
        return newState;
    }

    private async submitMonth(monthNum: number, payload: any): Promise<boolean> {
        this.debugLogger.log(`Enviando Mês ${monthNum}...`);
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
            this.debugLogger.log(`Mês ${monthNum} enviado com sucesso.`, 'success');
            return true;
        } catch (e: any) {
            this.debugLogger.log(`Erro Mês ${monthNum}: ${e.message}`, 'error');
            return false;
        }
    }

    private async processMonths(startMonth: number, config: any, initialState: any) {
        let currentState = structuredClone(initialState);

        for (let m = startMonth; m <= 12; m++) {
            if (State.stopRequested) {
                this.debugLogger.log("Interrupção solicitada pelo usuário.", "warn");
                break;
            }

            // LEGACY: remover quando /v1/ for descontinuado
            if (config.mesesFiltro && !config.mesesFiltro.includes(m)) continue;

            const exists = currentState.informesMensais.some((mesObj: any) => mesObj.mes === m);
            if (!exists) {
                this.debugLogger.log(`Mês ${m} indisponível no servidor. Pulando...`, 'warn');
                State.monthlyProgress[m - 1] = "skipped";
                if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
                continue;
            }

            this.debugLogger.log(`--- MÊS ${m} ---`, 'success');
            currentState = this.updateStateWithMonth(currentState, m, config);

            // v1 payload: estado completo (diferença intencional em relação ao v2)
            const payload = [String(currentState.id), currentState, 3];

            if (!(await this.submitMonth(m, payload))) break;

            State.monthlyProgress[m - 1] = "done";
            if (m < 12) State.currentMonthIndex = m;
            if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
        }
    }

    public async run(config: any) {
        if ((globalThis as any).__sigessTurboRunning) return;
        (globalThis as any).__sigessTurboRunning = true;
        State.stopRequested = false;

        if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
        if ((globalThis as any).showTurboOverlay) (globalThis as any).showTurboOverlay();

        const startMonth = config.startMonth || 1;
        this.debugLogger.log(`REAP TURBO LEGACY (Início: Mês ${startMonth})`);

        try {
            this.debugLogger.log("Obtendo estado inicial...");
            const initialState = await this.getReapState();
            if (!initialState) throw new Error("Não foi possível carregar o estado atual do SIGESS.");

            await this.processMonths(startMonth, config, initialState);

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
