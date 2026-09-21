import { TurboReapConfig } from '../../shared/types';
import { State } from './session-state';
import { DebugLogger } from '../debug/DebugLogger';
import { ReapTurboLegacy } from './legacy/turbo-filler';

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

    private getValidationErrorSummary(responseText: string): string | null {
        const match = responseText.match(/"errosValidacao":\{([^}]*)\}/);
        if (!match) return null;

        const messages = [...match[1].matchAll(/"([^"]+)":"([^"]+)"/g)]
            .slice(0, 5)
            .map((item) => `${item[1]}: ${item[2]}`);
        return messages.length > 0 ? messages.join("; ") : "errosValidacao retornado pelo PesqBrasil";
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
            this.lastActionHash = freshHashes.at(-1) || "";
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

    private updateStateWithAllMonths(
        state: any,
        userConfig: TurboReapConfig,
        startMonth: number
    ): { updatedState: any; targetMonths: number[]; skippedMonths: number[] } {
        const newState = structuredClone(state);
        const mesesFiltro: number[] | undefined = userConfig.mesesFiltro;
        const targetMonths: number[] = [];
        const skippedMonths: number[] = [];

        newState.informesMensais = newState.informesMensais.map((oldMes: any) => {
            const mesNum = oldMes.mes;

            // 1. Respeita filtro parcial de meses (se ativo)
            if (mesesFiltro && !mesesFiltro.includes(mesNum)) {
                skippedMonths.push(mesNum);
                return { ...oldMes };
            }

            // 2. Respeita startMonth (modo sequência)
            if (mesNum < startMonth) {
                skippedMonths.push(mesNum);
                return { ...oldMes };
            }

            // 3. Respeita meses indisponíveis/inválidos na vigência do pescador (invalido: true ou diasAtivo: "0")
            const isInvalidOnServer = Boolean(oldMes.invalido) || oldMes.configuracoes?.diasAtivo === "0";
            if (isInvalidOnServer) {
                this.debugLogger.log(`Mês ${mesNum} indisponível/fora de vigência no servidor. Preservado.`);
                skippedMonths.push(mesNum);
                return { ...oldMes };
            }

            const mesConfig = userConfig.meses.find(m => m.mes === mesNum);
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
                m.possuiDocumentosComprobatorios = false;
                m.tiposDocumentosComprobatorios = [];
                m.documentosComprobatorios = [];
                m.areasRealizacaoPesca = [{
                    ...userConfig.areaRealizacao,
                    ambientePesca: [Number(userConfig.areaRealizacao.ambientePesca)]
                }];
                const existingRows = Array.isArray(oldMes.resultadosOperacaoPesca)
                    ? oldMes.resultadosOperacaoPesca
                    : [];
                const speciesToSend = (mesConfig?.especies || []).filter(Boolean);
                this.debugLogger.diag(
                    `Mês ${mesNum}: espécies configuradas=${speciesToSend.length}, linhas existentes=${existingRows.length}`,
                );
                // Reaproveita os registros existentes por posição, não por espécie.
                // O calendário já definiu a nova ordem; preservar o ID por espécie
                // faria o portal manter a ordem antiga quando o REAP já estivesse preenchido.
                const existingIds = existingRows
                    .map((row: any) => row?.id)
                    .filter((id: any): id is number => Number.isFinite(id));
                m.resultadosOperacaoPesca = speciesToSend.map((esp: any, index: number) => {
                    const existingId = existingIds[index];
                    return existingId !== undefined ? { ...esp, id: existingId } : { ...esp };
                });
            } else {
                m.houvePesca = false;
                delete m.diasTrabalhados;
                m.justificativasNaoDeclaracao = [Number(mesConfig?.justificativa ?? 1)];
                m.areasRealizacaoPesca = [];
                m.resultadosOperacaoPesca = [];
                m.possuiDocumentosComprobatorios = false;
                m.tiposDocumentosComprobatorios = [];
                m.documentosComprobatorios = [];
            }

            targetMonths.push(mesNum);
            return m;
        });

        newState.concordaComDeclaracaoResponsabilidade = true;
        delete newState.errosValidacao;
        if (newState.configuracoes) newState.configuracoes.podeEnviar = "true";

        const formatInformeDocStatus = (m: any) => {
            if (m.houvePesca) return "pesca";
            if (m.documentoJustificativaNaoDeclaracao) return "✅doc";
            return "❌sem-doc";
        };
        const docSummary = newState.informesMensais.map((m: any) => `m${m.mes}:${formatInformeDocStatus(m)}`).join(' ');
        this.debugLogger.diag(`Payload consolidado: docs=[${docSummary}], target=[${targetMonths.join(",")}], skipped=[${skippedMonths.join(",")}]`);

        return { updatedState: newState, targetMonths, skippedMonths };
    }

    private async uploadDocument(pdfB64: string, filename: string, mesNumber?: number, informeMensalId?: number): Promise<any> {
        this.debugLogger.diag(`Upload: b64.length=${pdfB64?.length ?? 0}, filename=${filename}, mes=${mesNumber ?? '?'}, informeMensalId=${informeMensalId ?? '?'}`);
        if (!pdfB64 || pdfB64.length < 100) {
            this.debugLogger.diag("Upload cancelado: pdfB64 vazio ou inválido.");
            return null;
        }

        const hash = this.uploadActionHash;

        return new Promise<any>((resolve) => {
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

    private async prepareDocumentsForNonFishingMonths(config: any, pdfB64: string, filename: string): Promise<any | null> {
        const activeMeses = config.mesesFiltro
            ? config.meses.filter((m: any) => config.mesesFiltro.includes(m.mes))
            : config.meses;
        const nonFishingFromConfig = activeMeses
            .filter((m: any) => !m.houvePesca && m.mes >= (config.startMonth || 1))
            .map((m: any) => m.mes as number);

        if (nonFishingFromConfig.length === 0) {
            this.debugLogger.log("Nenhum mês sem pesca para anexar documento.");
            return this.getReapState();
        }

        this.debugLogger.log("Verificando estado atual antes de anexar documentos...");
        const freshState = await this.getReapState();
        const nonFishingMonths = nonFishingFromConfig.filter((mesNum: number) => {
            const serverMonth = freshState?.informesMensais?.find((m: any) => m.mes === mesNum);
            return !serverMonth?.documentoJustificativaNaoDeclaracao?.id;
        });

        if (nonFishingMonths.length === 0) {
            this.debugLogger.log("Todos os meses sem pesca já estão preenchidos! Nada a fazer.");
            return freshState;
        }

        this.debugLogger.log(`Anexando documento antes do envio consolidado para ${nonFishingMonths.length} mês(es): [${nonFishingMonths.join(", ")}] (${nonFishingFromConfig.length - nonFishingMonths.length} já preenchidos)`);

        let currentState = freshState;
        if (!currentState) {
            this.debugLogger.log("Falha ao obter estado fresco para anexar documentos.", "error");
            return null;
        }

        for (const mesNum of nonFishingMonths) {
            if (State.stopRequested) break;

            const informeMensalId = currentState.informesMensais?.find((m: any) => m.mes === mesNum)?.id;
            const docObj = await this.uploadDocument(pdfB64, filename, mesNum, informeMensalId);
            if (!docObj?.id) {
                this.debugLogger.log(`Upload do documento falhou para o mês ${mesNum}.`, "error");
                return null;
            }

            const updated = structuredClone(currentState);
            const mesRef = updated.informesMensais?.find((m: any) => m.mes === mesNum);
            if (mesRef) {
                const mesConfig = config.meses?.find((m: any) => m.mes === mesNum);
                mesRef.houvePesca = false;
                delete mesRef.diasTrabalhados;
                mesRef.justificativasNaoDeclaracao = [Number(mesConfig?.justificativa ?? 1)];
                mesRef.areasRealizacaoPesca = [];
                mesRef.resultadosOperacaoPesca = [];
                mesRef.documentoJustificativaNaoDeclaracao = docObj;
                mesRef.invalido = false;
            }
            currentState = updated;
            this.debugLogger.log(`Documento anexado para o mês ${mesNum}.`, "success");
            if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
        }

        return currentState;
    }

    private async submitConsolidated(payload: any): Promise<any> {
        this.debugLogger.log(`Enviando declaração consolidada (todos os meses)...`);
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

            const validationError = this.getValidationErrorSummary(responseText);
            if (validationError) {
                this.debugLogger.log(
                    `PesqBrasil retornou validações, mas o estado será conferido antes de interromper: ${validationError}`,
                    "warn",
                );
            } else {
                this.debugLogger.log(`Declaração enviada com sucesso ao servidor.`, "success");
            }

            this.debugLogger.diag(`Resposta raw consolidada: ${responseText.substring(0, 500)}`);
            const refreshedState = await this.getReapState();
            return refreshedState;
        } catch (e: any) {
            this.debugLogger.log(`Erro no envio consolidado: ${e.message}`, 'error');
            return null;
        }
    }

    private isMonthComplete(state: any, monthNum: number, expectedSpeciesCount = 0): boolean {
        const month = this.getMonthState(state, monthNum);
        if (!month) return false;
        if (month.houvePesca) {
            const rows = Array.isArray(month.resultadosOperacaoPesca)
                ? month.resultadosOperacaoPesca
                : [];
            return expectedSpeciesCount > 0
                && rows.length === expectedSpeciesCount
                && new Set(rows.map((row: any) => row.especiePescado)).size === expectedSpeciesCount;
        }
        return Boolean(month.documentoJustificativaNaoDeclaracao?.id);
    }

    private async animateCascadeSuccess(
        targetMonths: number[],
        skippedMonths: number[],
        refreshedState: any,
        config: any,
    ): Promise<void> {
        // Marca meses pulados ou fora de vigência
        for (const m of skippedMonths) {
            State.monthlyProgress[m - 1] = "skipped";
        }
        if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();

        // Efeito cascata para os meses processados (35ms por mês)
        for (const m of targetMonths) {
            const expectedSpeciesCount = Number(
                config.meses?.find((month: any) => month.mes === m)?.especies?.length ?? 0,
            );
            if (this.isMonthComplete(refreshedState, m, expectedSpeciesCount)) {
                State.monthlyProgress[m - 1] = "done";
            } else {
                State.monthlyProgress[m - 1] = "pending";
            }
            if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
            await new Promise((resolve) => setTimeout(resolve, 35));
        }
    }

    private async processConsolidatedRun(startMonth: number, config: any, initialState: any): Promise<boolean> {
        const { updatedState, targetMonths, skippedMonths } = this.updateStateWithAllMonths(
            initialState,
            config,
            startMonth
        );

        if (targetMonths.length === 0) {
            this.debugLogger.log("Nenhum mês para processar com os filtros atuais.", "warn");
            return true;
        }

        this.debugLogger.log(`Processando ${targetMonths.length} meses: [${targetMonths.join(", ")}]...`);
        const payloadData = {
            informesMensais: updatedState.informesMensais,
            concordaComDeclaracaoResponsabilidade: true,
        };
        const payload = [
            String(updatedState.id),
            payloadData,
            3
        ];
        this.debugLogger.diag(
            `Payload consolidado: concorda=${payloadData.concordaComDeclaracaoResponsabilidade}, ` +
            `mesesPesca=${updatedState.informesMensais.filter((month: any) => month.houvePesca).length}`,
        );

        let refreshedState = await this.submitConsolidated(payload);
        if (!refreshedState) return false;

        for (let retry = 0; retry < 2; retry += 1) {
            const incompleteMonths = targetMonths.filter((monthNumber) => {
                const monthConfig = config.meses?.find((month: any) => month.mes === monthNumber);
                if (!monthConfig?.houvePesca) return false;
                return !this.isMonthComplete(
                    refreshedState,
                    monthNumber,
                    Array.isArray(monthConfig.especies) ? monthConfig.especies.length : 0,
                );
            });

            if (incompleteMonths.length === 0) break;

            this.debugLogger.log(
                `Meses de pesca incompletos após o envio: [${incompleteMonths.join(", ")}]. Tentativa ${retry + 1}/2.`,
                "warn",
            );
            const retryState = this.updateStateWithAllMonths(refreshedState, config, startMonth).updatedState;
            refreshedState = await this.submitConsolidated([
                String(retryState.id),
                {
                    informesMensais: retryState.informesMensais,
                    concordaComDeclaracaoResponsabilidade: true,
                },
                3,
            ]);
            if (!refreshedState) return false;
        }

        const incompleteAfterRetry = targetMonths.filter((monthNumber) => {
            const monthConfig = config.meses?.find((month: any) => month.mes === monthNumber);
            if (!monthConfig?.houvePesca) return false;
            return !this.isMonthComplete(
                refreshedState,
                monthNumber,
                Array.isArray(monthConfig.especies) ? monthConfig.especies.length : 0,
            );
        });
        if (incompleteAfterRetry.length > 0) {
            this.debugLogger.log(
                `Meses de pesca continuam incompletos após as tentativas: [${incompleteAfterRetry.join(", ")}]`,
                "error",
            );
            return false;
        }

        // Efeito cascata visual de confirmação na grade do overlay
        await this.animateCascadeSuccess(targetMonths, skippedMonths, refreshedState, config);

        return true;
    }

    private async handleRunSuccess(): Promise<void> {
        if ((globalThis as any).showTurboSuccessOverlay) {
            await new Promise<void>((resolve) => {
                (globalThis as any).showTurboSuccessOverlay(() => {
                    resolve();
                });
            });
        } else {
            alert("Preenchido!");
        }
        globalThis.location.reload();
    }

    public async run(config: any) {
        if ((globalThis as any).__sigessTurboRunning) return;
        (globalThis as any).__sigessTurboRunning = true;
        State.stopRequested = false;
        
        if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
        if ((globalThis as any).showTurboOverlay) (globalThis as any).showTurboOverlay();
        
        const startMonth = config.startMonth || 1;
        this.debugLogger.log(`REAP TURBO CONSOLIDATED ULTRA-FAST (Início: Mês ${startMonth})`);

        try {
            this.debugLogger.log("Obtendo estado inicial...");
            let initialState = await this.getReapState();
            if (!initialState) throw new Error("Não foi possível carregar o estado atual do SIGESS.");

            if (config.documentoMode === "local") {
                if (!config.documentoPdfB64) {
                    throw new Error("O modo Arquivo local está ativo, mas o PDF não está disponível.");
                }
                initialState = await this.prepareDocumentsForNonFishingMonths(
                    config,
                    config.documentoPdfB64,
                    config.documentoPdfFilename || "documento.pdf",
                );
                if (!initialState) throw new Error("Não foi possível anexar os documentos comprobatórios antes do envio.");
            }

            if (initialState.informesMensais?.[0]) {
                this.debugLogger.diag("Estrutura do primeiro mês:", initialState.informesMensais[0]);
            }

            const completed = await this.processConsolidatedRun(startMonth, config, initialState);

            if (!State.stopRequested && completed) {
                await this.handleRunSuccess();
            } else if (!State.stopRequested && !completed) {
                throw new Error("O preenchimento Turbo falhou durante o envio consolidado.");
            }
        } finally { 
            (globalThis as any).__sigessTurboRunning = false;
            if ((globalThis as any).hideTurboOverlay) (globalThis as any).hideTurboOverlay();
            if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
        }
    }
}

function extractFetchUrl(input: unknown): string {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
    return "";
}

if (globalThis.window !== undefined && !(globalThis as any).__sigessTurboLoaded) {
    // LEGACY: remover bloco isV1 quando /v1/ for descontinuado
    const isV1 = /\/v1\//.test(globalThis.location.href);
    const turbo = isV1 ? new ReapTurboLegacy() : new ReapTurbo();
    (globalThis as any).__sigessTurboLoaded = true;

    // Interceptor de diagnóstico de fetch — ativo apenas quando __SIGESS_DIAGNOSTICS=true
    if (!(globalThis as any).__sigessTurboFetchIntercepted) {
        (globalThis as any).__sigessTurboFetchIntercepted = true;
        const origFetch = globalThis.fetch;
        globalThis.fetch = async function(...args) {
            const [url, options] = args;
            const urlText = extractFetchUrl(url);
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
