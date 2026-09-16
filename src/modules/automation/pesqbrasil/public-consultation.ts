import { logger } from "../../../shared/services/logger";

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

let activeBatchCancelled = false;
let activeConsultationTabId: number | null = null;

export function cancelMpaConsultationBatch(): boolean {
  activeBatchCancelled = true;
  if (typeof activeConsultationTabId === "number") {
    const tabIdToClose = activeConsultationTabId;
    activeConsultationTabId = null;
    const browserAPI = typeof browser !== "undefined" ? browser : (globalThis as any).chrome;
    try {
      browserAPI.tabs?.executeScript?.(tabIdToClose, {
        code: "(window).__sigessConsultandoAtivo = false; window.onbeforeunload = null;",
      }).catch(() => {});
      browserAPI.tabs?.remove?.(tabIdToClose).catch(() => {});
    } catch {}
  }
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
  const logoUrl = browserAPI.runtime.getURL("sigess-logo.png");

  const overlayScript = `
    (() => {
      try {
        const pWin = window.wrappedJSObject || window;
        pWin.__sigessConsultandoAtivo = true;
        const beforeUnloadHandler = function(e) {
          if (pWin.__sigessConsultandoAtivo) {
            const msg = "Uma consulta pública do SIGESS está em andamento. Fechar esta aba irá interromper a consulta. Tem certeza de que deseja sair?";
            e.preventDefault();
            e.returnValue = msg;
            return msg;
          }
        };
        pWin.onbeforeunload = beforeUnloadHandler;
        window.onbeforeunload = beforeUnloadHandler;
        window.addEventListener("beforeunload", beforeUnloadHandler);
      } catch (e) {}

      if (document.getElementById("sigess-consultando-overlay")) return;

      const overlay = document.createElement("div");
      overlay.id = "sigess-consultando-overlay";
      overlay.style.cssText = "position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(15, 23, 42, 0.75) !important; z-index: 2147483647 !important; display: flex !important; align-items: center !important; justify-content: center !important; backdrop-filter: blur(4px) !important; pointer-events: auto !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;";

      const box = document.createElement("div");
      box.style.cssText = "background: #ffffff !important; padding: 32px 42px !important; border-radius: 20px !important; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35) !important; border: 2px solid rgba(16, 185, 129, 0.4) !important; display: flex !important; flex-direction: column !important; align-items: center !important; gap: 14px !important; max-width: 420px !important; text-align: center !important;";

      const loaderWrapper = document.createElement("div");
      loaderWrapper.style.cssText = "position: relative !important; width: 76px !important; height: 76px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin: 4px 0 !important;";

      const spinner = document.createElement("div");
      spinner.style.cssText = "position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; border: 3.5px solid rgba(16, 185, 129, 0.2) !important; border-top: 3.5px solid #059669 !important; border-radius: 50% !important; animation: sigess-spin 0.9s linear infinite !important; box-sizing: border-box !important;";

      const img = document.createElement("img");
      img.src = ${JSON.stringify(logoUrl)};
      img.style.cssText = "position: relative !important; width: 44px !important; height: 44px !important; object-fit: contain !important; z-index: 1 !important;";
      img.alt = "SIGESS";

      loaderWrapper.appendChild(spinner);
      loaderWrapper.appendChild(img);

      const title = document.createElement("h3");
      title.textContent = "Consultando PesqBrasil...";
      title.style.cssText = "margin: 0 !important; font-size: 16px !important; font-weight: 700 !important; color: #065f46 !important; letter-spacing: -0.01em !important;";

      const desc = document.createElement("p");
      desc.textContent = "Esta aba está sendo utilizada pela automação do SIGESS. Por favor, não feche esta janela.";
      desc.style.cssText = "margin: 4px 0 0 !important; font-size: 12.5px !important; color: #4b5563 !important; line-height: 1.5 !important;";

      const note = document.createElement("div");
      note.textContent = "Para interromper o processo, utilize o botão Interromper no sistema SIGESS.";
      note.style.cssText = "background: #f0fdf4 !important; border: 1px solid #bbf7d0 !important; border-radius: 8px !important; padding: 8px 14px !important; font-size: 11.5px !important; color: #166534 !important; line-height: 1.4 !important; margin-top: 4px !important;";

      const style = document.createElement("style");
      style.textContent = "@keyframes sigess-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }";

      box.appendChild(loaderWrapper);
      box.appendChild(title);
      box.appendChild(desc);
      box.appendChild(note);
      overlay.appendChild(box);
      overlay.appendChild(style);

      // Anexa no documentElement para não ser afetado por re-renders do body do Next.js
      (document.documentElement || document.body).appendChild(overlay);
    })();
  `;

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
  activeBatchCancelled = false;
  logger.info("MPA", `Iniciando lote de consulta pública: ${items.length} itens (Run: ${runId})`);

  let tabId: number | null = null;
  let tabRemovedListener: ((id: number) => void) | null = null;
  const results: MpaPublicSearchResult[] = [];

  try {
    // 1. Abre a página em segundo plano
    const tab = await browser.tabs.create({
      url: SITE_URL,
      active: false,
    });

    tabId = tab.id ?? null;
    if (typeof tabId !== "number") {
      throw new Error("Não foi possível abrir a aba de consulta pública.");
    }

    activeConsultationTabId = tabId;

    // Monitora o fechamento manual da aba pelo usuário para interromper o lote imediatamente
    const currentOpenedTabId = tabId;
    tabRemovedListener = (removedTabId: number) => {
      if (removedTabId === currentOpenedTabId) {
        logger.info("MPA", "Aba da consulta do PesqBrasil foi fechada pelo usuário. Interrompendo lote imediatamente.");
        activeBatchCancelled = true;
      }
    };
    browser.tabs.onRemoved.addListener(tabRemovedListener);

    // 2. Aguarda carregamento inicial
    await waitForTabLoad(tabId);
    await injectPesqBrasilOverlay(tabId);

    // Pausa de 1.5s para o Next.js inicializar e garante overlay ativo
    await new Promise((r) => setTimeout(r, 1500));
    await injectPesqBrasilOverlay(tabId);

    // 3. Itera sobre os CPFs
    for (let i = 0; i < items.length; i++) {
      if (activeBatchCancelled) {
        logger.info("MPA", "Lote interrompido/cancelado antes do próximo item.");
        break;
      }

      // Verifica se a aba ainda existe antes de executar a consulta
      try {
        const tabCheck = await browser.tabs.get(tabId);
        if (!tabCheck) {
          logger.info("MPA", "Aba de consulta não encontrada. Interrompendo lote.");
          activeBatchCancelled = true;
          break;
        }
      } catch {
        logger.info("MPA", "Aba de consulta foi fechada. Interrompendo lote imediatamente.");
        activeBatchCancelled = true;
        break;
      }

      const item = items[i];
      logger.info("MPA", `Consultando item ${i + 1}/${items.length}: CPF ${item.cpf}`);

      const rawResult = await executeQueryInTab(tabId, item.cpf, item.nome);

      // Se a aba foi fechada ou o lote foi cancelado durante a execução deste item
      if (activeBatchCancelled) {
        logger.info("MPA", "Aba fechada ou cancelamento solicitado durante a consulta. Interrompendo.");
        break;
      }

      // Se o erro indicar que a aba foi fechada ou destruída durante a injeção
      if (
        rawResult.error &&
        (rawResult.error.toLowerCase().includes("tab") ||
          rawResult.error.toLowerCase().includes("closed") ||
          rawResult.error.toLowerCase().includes("invalid") ||
          rawResult.error.toLowerCase().includes("no tab"))
      ) {
        try {
          await browser.tabs.get(tabId);
        } catch {
          logger.info("MPA", "Aba fechada detectada pelo erro de execução. Interrompendo lote.");
          activeBatchCancelled = true;
          break;
        }
      }

      const result: MpaPublicSearchResult = {
        ...rawResult,
        codigoRGP: unmaskRgp(rawResult.codigoRGP, item.cpf),
      };
      results.push(result);

      if (onProgress) {
        onProgress({
          runId,
          total: items.length,
          current: i + 1,
          result,
          done: i === items.length - 1 || activeBatchCancelled,
        });
      }

      // Intervalo seguro entre consultas para não saturar
      if (i < items.length - 1 && !activeBatchCancelled) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    // Se o lote foi interrompido/cancelado antes do fim, emite o evento final com done: true
    if (activeBatchCancelled && onProgress && results.length > 0) {
      onProgress({
        runId,
        total: items.length,
        current: results.length,
        result: results[results.length - 1],
        done: true,
      });
    }

    return {
      success: true,
      results,
    };
  } catch (error: any) {
    logger.error("MPA", "Erro no processamento do lote:", error);
    return {
      success: false,
      results,
      error: error?.message || "Erro durante o lote de consulta",
    };
  } finally {
    activeConsultationTabId = null;

    // Remove listener de monitoramento
    try {
      if (tabRemovedListener) {
        browser.tabs.onRemoved.removeListener(tabRemovedListener);
      }
    } catch {}

    // Fecha a aba de background de forma limpa caso ainda esteja aberta
    if (typeof tabId === "number") {
      try {
        await browser.tabs.executeScript(tabId, {
          code: "(window).__sigessConsultandoAtivo = false; window.onbeforeunload = null;",
        }).catch(() => {});
        await browser.tabs.remove(tabId).catch(() => {});
        logger.info("MPA", "Aba de consulta em background encerrada.");
      } catch {}
    }
  }
}
