import { logger } from "../../../shared/services/logger";
import { generateSigessOverlayInjectionScript } from "../../../shared/ui/automation-overlay";

export interface MpaConsultationItem {
  cpf: string;
  nome?: string;
}

export interface MpaPublicSearchResult {
  cpf_original: string;
  nomeSocio?: string;
  codigoRGP?: string;
  situacao: string;
  tipoRegistro?: string;
  uf?: string;
  municipio?: string;
  categoria?: string;
  embarcado?: string;
  gruposAlvo?: string;
  dataCriacao?: string;
  dataPrimeiroRgp?: string;
  areasPescaPretendida?: string;
  dataCancelamento?: string;
  dataSuspensao?: string;
  status_resultado: "sucesso" | "sem_registro" | "erro_mpa" | "erro_conexao";
  error?: string;
}

export interface MpaBatchProgressPayload {
  runId: string;
  total: number;
  current: number;
  result: MpaPublicSearchResult;
  done: boolean;
}

const SITE_URL = "https://pesqbrasil-pescadorprofissional.mpa.gov.br/acesso-externo";
const RECAPTCHA_KEY = "6LeJP-srAAAAAFdZMYINP6CJ4COI_MAzFvk_0gs1";

type ActiveMpaBatch = {
  cancelled: boolean;
  tabIds: Set<number>;
};

let activeMpaBatch: ActiveMpaBatch | null = null;

async function closeMpaTab(tabId: number): Promise<void> {
  const browserAPI = typeof browser !== "undefined" ? browser : (globalThis as any).chrome;

  try {
    await browserAPI.tabs?.executeScript?.(tabId, {
      code: "(window).__sigessConsultandoAtivo = false; window.onbeforeunload = null;",
    });
  } catch {}

  try {
    await browserAPI.tabs?.remove?.(tabId);
  } catch {}
}

export function cancelMpaConsultationBatch(): boolean {
  const batch = activeMpaBatch;
  if (!batch) return true;

  batch.cancelled = true;
  for (const tabId of batch.tabIds) void closeMpaTab(tabId);
  return true;
}

/**
 * Aguarda a aba concluir o carregamento (status 'complete')
 */
function waitForTabLoad(tabId: number, timeoutMs = 35000): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        browser.tabs.onUpdated.removeListener(listener);
        reject(new Error("Timeout ao carregar a página do PesqBrasil"));
      }
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: any) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          browser.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
    };

    browser.tabs.onUpdated.addListener(listener);

    browser.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete" && !resolved) {
        resolved = true;
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(() => {});
  });
}

/**
 * Regenera o código do RGP mascarado (ex: PAPA***046352**) substituindo os asteriscos pelos dígitos do CPF
 */
export function unmaskRgp(codigoRgp?: string, cpf?: string): string | undefined {
  if (!codigoRgp) return undefined;
  const rgpStr = String(codigoRgp).trim();
  if (!cpf || !rgpStr.includes("*")) return rgpStr;

  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length !== 11) return rgpStr;

  const prefixMatch = rgpStr.match(/^[A-Za-z]+/);
  const prefix = prefixMatch ? prefixMatch[0] : "";
  const remainder = rgpStr.slice(prefix.length);

  if (remainder.length === 11) {
    return `${prefix}${cleanCpf}`;
  }

  let result = prefix;
  for (let i = 0; i < remainder.length && i < cleanCpf.length; i++) {
    result += remainder[i] === "*" ? cleanCpf[i] : remainder[i];
  }
  return result;
}

/**
 * Injeta overlay visual verde na aba do PesqBrasil com a logo do SIGESS,
 * aviso para não fechar a página e manipulador beforeunload seguro contra CSP.
 */
async function injectPesqBrasilOverlay(tabId: number): Promise<void> {
  const browserAPI = typeof browser !== "undefined" ? browser : (globalThis as any).chrome;
  const overlayScript = generateSigessOverlayInjectionScript({
    id: "sigess-consultando-overlay",
    title: "Consultando PesqBrasil",
    animatedDots: true,
    description: "Esta aba está sendo utilizada pela automação do SIGESS. Por favor, não feche esta janela.",
    note: "Para interromper o processo, utilize o botão Interromper no sistema SIGESS.",
    preventTabClose: true,
    beforeUnloadMessage: "Uma consulta pública do SIGESS está em andamento. Fechar esta aba irá interromper a consulta. Tem certeza de que deseja sair?",
  });

  try {
    if (browserAPI.tabs?.executeScript) {
      await browserAPI.tabs.executeScript(tabId, { code: overlayScript });
    } else if (browserAPI.scripting?.executeScript) {
      await browserAPI.scripting.executeScript({
        target: { tabId },
        func: new Function(overlayScript) as any,
      });
    }
  } catch (err) {
    logger.warning("MPA", "Não foi possível injetar overlay na página do PesqBrasil", { error: String(err) });
  }
}

/**
 * Executa a lógica de extração injetando código no contexto da página (MAIN world)
 * para ter acesso direto ao window.grecaptcha sem restrições de isolamento.
 */
async function executeQueryInTab(tabId: number, cpf: string, nome?: string): Promise<MpaPublicSearchResult> {
  const browserAPI = typeof browser !== "undefined" ? browser : (globalThis as any).chrome;
  const cpfClean = cpf.replace(/\D/g, "");
  const eventId = "sigess_mpa_" + Math.random().toString(36).slice(2);

  const scriptCode = `
    (async () => {
      const RECAPTCHA_KEY = "${RECAPTCHA_KEY}";
      const cpfClean = "${cpfClean}";
      const cpfOriginal = "${cpf}";
      const nomeSocio = ${JSON.stringify(nome ?? "")};
      const eventId = "${eventId}";

      return new Promise((resolve) => {
        let resolved = false;

        const finish = (result) => {
          if (!resolved) {
            resolved = true;
            window.removeEventListener(eventId, onEvent);
            resolve(result);
          }
        };

        const onEvent = (e) => {
          try {
            const data = typeof e.detail === "string" ? JSON.parse(e.detail) : e.detail;
            finish(data);
          } catch (err) {
            finish({
              cpf_original: cpfOriginal,
              nomeSocio,
              situacao: "Erro no Retorno",
              status_resultado: "erro_mpa",
              error: String(err),
            });
          }
        };

        window.addEventListener(eventId, onEvent);

        // Timeout geral de 25s
        setTimeout(() => {
          finish({
            cpf_original: cpfOriginal,
            nomeSocio,
            situacao: "Tempo Esgotado",
            status_resultado: "erro_conexao",
            error: "Timeout aguardando retorno do reCAPTCHA / PesqBrasil",
          });
        }, 25000);

        // Injeta o runner diretamente no DOM da página (Contexto MAIN)
        const runnerScript = document.createElement("script");
        runnerScript.textContent = \`
          (async () => {
            const RECAPTCHA_KEY = "\${RECAPTCHA_KEY}";
            const cpfClean = "\${cpfClean}";
            const cpfOriginal = "\${cpfOriginal}";
            const nomeSocio = \${JSON.stringify(nomeSocio)};
            const eventId = "\${eventId}";

            function send(data) {
              window.dispatchEvent(new CustomEvent(eventId, { detail: JSON.stringify(data) }));
            }

            function formatValue(v) {
              if (v === null || v === undefined) return undefined;
              if (typeof v === "object") return JSON.stringify(v);
              return String(v);
            }

            try {
              // 1. Assegura que o script do Google reCAPTCHA v3 está carregado
              if (!window.grecaptcha) {
                let s = document.querySelector('script[src*="recaptcha/api.js"]');
                if (!s) {
                  s = document.createElement("script");
                  s.src = "https://www.google.com/recaptcha/api.js?render=" + RECAPTCHA_KEY;
                  s.async = true;
                  (document.head || document.documentElement).appendChild(s);
                }
              }

              // 2. Aguarda o objeto grecaptcha estar disponível e pronto
              let attempts = 0;
              while (!window.grecaptcha || typeof window.grecaptcha.ready !== "function") {
                attempts++;
                if (attempts > 50) { // 20 segundos
                  send({
                    cpf_original: cpfOriginal,
                    nomeSocio,
                    situacao: "Erro reCAPTCHA",
                    status_resultado: "erro_mpa",
                    error: "reCAPTCHA v3 não carregou na página",
                  });
                  return;
                }
                await new Promise((r) => setTimeout(r, 400));
              }

              // 3. Executa o reCAPTCHA para obter o token com action 'submit'
              const token = await new Promise((res, rej) => {
                window.grecaptcha.ready(async () => {
                  try {
                    const t = await window.grecaptcha.execute(RECAPTCHA_KEY, { action: "submit" });
                    res(t);
                  } catch (e) {
                    rej(e);
                  }
                });
              });

              if (!token) {
                send({
                  cpf_original: cpfOriginal,
                  nomeSocio,
                  situacao: "Erro reCAPTCHA",
                  status_resultado: "erro_mpa",
                  error: "Token reCAPTCHA não foi gerado",
                });
                return;
              }

              // 4. Faz a requisição à API oficial de Consulta Pública do MPA
              const apiUrl = "https://pesqbrasil-pescadorprofissional.mpa.gov.br/api/consulta-publica/pesquisa/cpf=" + cpfClean + "&recaptchaToken=" + token;
              const res = await fetch(apiUrl, {
                method: "GET",
                headers: { "Accept": "application/json" },
                credentials: "include",
              });

              if (res.status === 404) {
                send({
                  cpf_original: cpfOriginal,
                  nomeSocio,
                  situacao: "Sem Registro",
                  status_resultado: "sem_registro",
                  error: "CPF sem registro no PesqBrasil / MPA",
                });
                return;
              }

              if (!res.ok) {
                const errTxt = await res.text().catch(() => "");
                send({
                  cpf_original: cpfOriginal,
                  nomeSocio,
                  situacao: "Erro HTTP " + res.status,
                  status_resultado: "erro_mpa",
                  error: "HTTP " + res.status + ": " + errTxt.slice(0, 80),
                });
                return;
              }

              const data = await res.json();

              // Resposta com erro interno do MPA
              if (data.error) {
                send({
                  cpf_original: cpfOriginal,
                  nomeSocio,
                  situacao: "Erro no MPA",
                  status_resultado: "erro_mpa",
                  error: String(data.error),
                });
                return;
              }

              // Resposta sem RGP e sem situação
              if (!data.codigoRGP && !data.situacao) {
                send({
                  cpf_original: cpfOriginal,
                  nomeSocio,
                  situacao: "Sem Registro",
                  status_resultado: "sem_registro",
                  error: "CPF sem registro no PesqBrasil / MPA",
                });
                return;
              }

              send({
                cpf_original: cpfOriginal,
                nomeSocio,
                codigoRGP: data.codigoRGP ? String(data.codigoRGP).trim() : undefined,
                situacao: data.situacao ? String(data.situacao).trim() : "Sem Registro",
                tipoRegistro: data.tipoRegistro ? String(data.tipoRegistro).trim() : undefined,
                uf: data.uf ? String(data.uf).trim() : undefined,
                municipio: data.municipio ? String(data.municipio).trim() : undefined,
                categoria: data.categoria ? String(data.categoria).trim() : undefined,
                embarcado: data.embarcado ? String(data.embarcado).trim() : undefined,
                gruposAlvo: formatValue(data.gruposAlvo),
                dataCriacao: data.dataCriacao ? String(data.dataCriacao).split("T")[0] : undefined,
                dataPrimeiroRgp: data.dataPrimeiroRgp ? String(data.dataPrimeiroRgp).split("T")[0] : undefined,
                areasPescaPretendida: formatValue(data.areasPescaPretendida),
                dataCancelamento: data.dataCancelamento ? String(data.dataCancelamento).split("T")[0] : undefined,
                dataSuspensao: data.dataSuspensao ? String(data.dataSuspensao).split("T")[0] : undefined,
                status_resultado: "sucesso",
              });
            } catch (err) {
              send({
                cpf_original: cpfOriginal,
                nomeSocio,
                situacao: "Erro na Consulta",
                status_resultado: "erro_conexao",
                error: err instanceof Error ? err.message : String(err),
              });
            }
          })();
        \`;

        try {
          (document.head || document.documentElement).appendChild(runnerScript);
          runnerScript.remove();
        } catch (injectionErr) {
          // Fallback via wrappedJSObject se CSP impedir script inline
          (async () => {
            try {
              const pageWin = window.wrappedJSObject || window;
              const g = pageWin.grecaptcha || window.grecaptcha;
              if (!g) throw new Error("reCAPTCHA não acessível");
              const token = await new Promise((res, rej) => {
                g.ready(async () => {
                  try {
                    const t = await g.execute(RECAPTCHA_KEY, { action: "submit" });
                    res(t);
                  } catch (e) { rej(e); }
                });
              });
              const apiUrl = "https://pesqbrasil-pescadorprofissional.mpa.gov.br/api/consulta-publica/pesquisa/cpf=" + cpfClean + "&recaptchaToken=" + token;
              const res = await fetch(apiUrl);
              if (res.status === 404) {
                finish({
                  cpf_original: cpfOriginal,
                  nomeSocio,
                  situacao: "Sem Registro",
                  status_resultado: "sem_registro",
                  error: "CPF sem registro",
                });
                return;
              }
              const data = await res.json();
              finish({
                cpf_original: cpfOriginal,
                nomeSocio,
                codigoRGP: data.codigoRGP,
                situacao: data.situacao || "Sem Registro",
                status_resultado: "sucesso",
              });
            } catch (e) {
              finish({
                cpf_original: cpfOriginal,
                nomeSocio,
                situacao: "Erro na Consulta",
                status_resultado: "erro_conexao",
                error: String(e),
              });
            }
          })();
        }
      });
    })()
  `;

  try {
    if (browserAPI.tabs?.executeScript) {
      const results = await browserAPI.tabs.executeScript(tabId, { code: scriptCode });
      return results?.[0] as MpaPublicSearchResult;
    }
    if (browserAPI.scripting?.executeScript) {
      const results = await browserAPI.scripting.executeScript({
        target: { tabId },
        func: new Function(`return ${scriptCode}`) as any,
      });
      return results?.[0]?.result as MpaPublicSearchResult;
    }
    throw new Error("Nenhuma API de injeção de script disponível.");
  } catch (error: any) {
    return {
      cpf_original: cpf,
      nomeSocio: nome,
      situacao: "Erro de Execução",
      status_resultado: "erro_conexao",
      error: error?.message || "Falha ao executar script na aba do PesqBrasil",
    };
  }
}

/**
 * Processa um lote de CPFs na consulta pública do MPA
 */
export async function runMpaConsultationBatch(
  items: MpaConsultationItem[],
  runId: string,
  onProgress?: (payload: MpaBatchProgressPayload) => void,
): Promise<{ success: boolean; results: MpaPublicSearchResult[]; error?: string }> {
  if (activeMpaBatch) {
    return {
      success: false,
      results: [],
      error: "Já existe uma consulta pública do PesqBrasil em andamento.",
    };
  }

  if (items.length === 0) {
    return { success: false, results: [], error: "Nenhum CPF foi informado para consulta." };
  }

  const batch: ActiveMpaBatch = {
    cancelled: false,
    tabIds: new Set<number>(),
  };
  activeMpaBatch = batch;
  logger.info("MPA", `Iniciando lote de consulta pública: ${items.length} itens (Run: ${runId})`);

  const resultsByIndex: Array<MpaPublicSearchResult | undefined> = new Array(items.length);
  const completedResults: MpaPublicSearchResult[] = [];
  let nextIndex = 0;
  let completed = 0;
  let progressDoneEmitted = false;
  const onTabRemoved = (tabId: number) => {
    if (!batch.tabIds.has(tabId)) return;
    batch.tabIds.delete(tabId);
    batch.cancelled = true;
    logger.warning("MPA", `Worker interrompido porque a aba ${tabId} foi fechada.`);
  };

  const emitProgress = (result: MpaPublicSearchResult, done: boolean) => {
    if (!onProgress || (done && progressDoneEmitted)) return;
    if (done) progressDoneEmitted = true;
    onProgress({
      runId,
      total: items.length,
      current: completed,
      result,
      done,
    });
  };

  const createWorkerTab = async (): Promise<number> => {
    const tab = await browser.tabs.create({
      url: SITE_URL,
      active: false,
    });
    const tabId = tab.id;
    if (typeof tabId !== "number") {
      throw new Error("Não foi possível abrir uma aba de consulta pública.");
    }

    batch.tabIds.add(tabId);
    await waitForTabLoad(tabId);
    await injectPesqBrasilOverlay(tabId);
    return tabId;
  };

  const shouldRetry = (result: MpaPublicSearchResult) =>
    result.status_resultado === "erro_conexao";

  const runWorker = async (tabId: number): Promise<void> => {
    while (!batch.cancelled) {
      const itemIndex = nextIndex++;
      if (itemIndex >= items.length) return;

      const item = items[itemIndex];
      let result: MpaPublicSearchResult | undefined;

      for (let attempt = 0; attempt < 3 && !batch.cancelled; attempt += 1) {
        try {
          result = await executeQueryInTab(tabId, item.cpf, item.nome);
        } catch (error: any) {
          result = {
            cpf_original: item.cpf,
            nomeSocio: item.nome,
            situacao: "Erro de Execução",
            status_resultado: "erro_conexao",
            error: error?.message || "Falha ao executar consulta no PesqBrasil.",
          };
        }

        if (!result || !shouldRetry(result) || attempt === 2) break;
      }

      if (batch.cancelled || !result) return;

      const normalizedResult: MpaPublicSearchResult = {
        ...result,
        codigoRGP: unmaskRgp(result.codigoRGP, item.cpf),
      };

      resultsByIndex[itemIndex] = normalizedResult;
      completedResults.push(normalizedResult);
      completed += 1;
      emitProgress(normalizedResult, completed === items.length);
    }
  };

  try {
    browser.tabs.onRemoved.addListener(onTabRemoved);
    const workerCount = Math.min(5, items.length);
    const workerTabs = await Promise.allSettled(
      Array.from({ length: workerCount }, () => createWorkerTab()),
    );
    const readyTabs = workerTabs
      .filter((result): result is PromiseFulfilledResult<number> => result.status === "fulfilled")
      .map((result) => result.value);

    if (readyTabs.length === 0) {
      throw new Error("Não foi possível abrir nenhuma aba de consulta pública.");
    }

    if (readyTabs.length < workerCount) {
      logger.warning("MPA", `Apenas ${readyTabs.length} de ${workerCount} workers foram iniciados.`);
    }

    await Promise.all(readyTabs.map((tabId) => runWorker(tabId)));

    if (batch.cancelled && completedResults.length > 0) {
      emitProgress(completedResults[completedResults.length - 1], true);
    }

    return {
      success: true,
      results: resultsByIndex.filter(
        (result): result is MpaPublicSearchResult => Boolean(result),
      ),
    };
  } catch (error: any) {
    logger.error("MPA", "Erro no processamento do lote:", error);
    return {
      success: false,
      results: resultsByIndex.filter(
        (result): result is MpaPublicSearchResult => Boolean(result),
      ),
      error: error?.message || "Erro durante o lote de consulta",
    };
  } finally {
    browser.tabs.onRemoved.removeListener(onTabRemoved);
    await Promise.all([...batch.tabIds].map((tabId) => closeMpaTab(tabId)));
    activeMpaBatch = null;
    logger.info("MPA", `Lote encerrado: ${completedResults.length}/${items.length} resultados.`);
  }
}
