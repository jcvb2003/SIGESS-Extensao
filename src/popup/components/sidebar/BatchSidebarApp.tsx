import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Trash2,
  X,
  Layers,
  Clock,
  FileText,
  Paperclip,
} from "lucide-react";

export interface BatchItem {
  tabId?: number;
  runId?: string;
  cpf: string;
  nome?: string;
  status: string;
  statusTitle?: string;
  statusDescription?: string;
  sessionClosedByUser?: boolean;
  progressFlow?: string;
  progressStage?: string;
  loginConcluido?: boolean;
  boletoGerado?: boolean;
  lastError?: string;
  lastUpdatedAt?: number;
}

function formatCpf(cpf: string): string {
  const digits = String(cpf || "").replace(/\D/g, "").padStart(11, "0");
  if (digits.length !== 11) return cpf || "";
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function isPasswordError(item: BatchItem): boolean {
  const text = [
    item.statusTitle,
    item.statusDescription,
    item.lastError,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("senha gov incorreta") ||
    text.includes("senha incorreta") ||
    text.includes("senha inválida") ||
    text.includes("senha invalida") ||
    text.includes("govbr_senha_invalida")
  );
}

export const BatchSidebarApp: React.FC = () => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [aliveTabIds, setAliveTabIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [sdpaData, setSdpaData] = useState<{
    nome?: string;
    cpf?: string;
    dataPrimeiroRegistro?: string;
    rgp?: string;
    endereco?: string;
    numero?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    telefone?: string;
    email?: string;
    auditStats?: {
      ok: number;
      warning: number;
      missing: number;
      total: number;
    };
  } | null>(null);
  const [sdpaTabId, setSdpaTabId] = useState<number | null>(null);
  const [sdpaFilling, setSdpaFilling] = useState(false);

  const fetchStatuses = useCallback(async () => {
    try {
      // 1. Verifica abas reais abertas no navegador
      if (typeof browser !== "undefined" && browser.tabs?.query) {
        try {
          const openTabs = await browser.tabs.query({});
          const ids = new Set<number>();
          let foundMteTab: any = null;
          for (const tab of openTabs) {
            if (typeof tab.id === "number") ids.add(tab.id);
            if (tab.url?.includes("/solicitacao-pescador")) {
              foundMteTab = tab;
            }
          }
          setAliveTabIds(ids);

          if (foundMteTab?.id) {
            // Consulta ativa à aba MTE para checar estritamente se está em /solicitacao-pescador/etapas
            try {
              const resp = await browser.tabs.sendMessage(foundMteTab.id, { action: "GET_SDPA_STATUS" });
              if (resp?.success && resp.isEtapasRoute && resp.data) {
                setSdpaTabId(foundMteTab.id);
                setSdpaData(resp.data);
              } else {
                // Fora da rota de etapas (ex: tela inicial), oculta o card SDPA
                setSdpaTabId(null);
                setSdpaData(null);
              }
            } catch {
              if (foundMteTab.url?.includes("/solicitacao-pescador/etapas")) {
                setSdpaTabId(foundMteTab.id);
              } else {
                setSdpaTabId(null);
                setSdpaData(null);
              }
            }
          } else {
            setSdpaTabId(null);
            setSdpaData(null);
          }
        } catch {
          // silencioso
        }
      }

      // 2. Busca status do lote unificado
      if (typeof browser !== "undefined" && browser.runtime?.sendMessage) {
        const response = await browser.runtime.sendMessage({
          action: "getGovBatchStatuses",
        });
        if (response && response.success && Array.isArray(response.items)) {
          setItems(response.items);
        }
      }
    } catch (err) {
      console.error("[Sidebar] Erro ao carregar status do lote:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();

    // Escuta mudanças de storage da extensão em tempo real
    const browserAPI =
      typeof browser !== "undefined" ? browser : (window as any).chrome;

    const storageListener = () => {
      fetchStatuses();
    };

    if (browserAPI?.storage?.onChanged) {
      browserAPI.storage.onChanged.addListener(storageListener);
    }

    // Escuta remoção de abas para desativar botões instantaneamente
    const tabRemovedListener = (tabId: number) => {
      setAliveTabIds((prev) => {
        const next = new Set(prev);
        next.delete(tabId);
        return next;
      });
      fetchStatuses();
    };

    if (typeof browser !== "undefined" && browser.tabs?.onRemoved) {
      browser.tabs.onRemoved.addListener(tabRemovedListener);
    }

    // Escuta mensagens de broadcast (dados do pescador e auditoria de campos)
    const messageListener = (msg: any, sender: any) => {
      if (
        (msg?.action === "SDPA_DATA_BROADCAST" || msg?.action === "UPDATE_SDPA_STATUS") &&
        msg.data
      ) {
        if (msg.data.isEtapasRoute === false) {
          setSdpaTabId(null);
          setSdpaData(null);
        } else {
          setSdpaData(msg.data);
          if (sender?.tab?.id) {
            setSdpaTabId(sender.tab.id);
          }
        }
      }
    };

    if (browserAPI?.runtime?.onMessage) {
      browserAPI.runtime.onMessage.addListener(messageListener);
    }

    // Polling leve a cada 1.5 segundos
    const interval = setInterval(fetchStatuses, 1500);

    return () => {
      if (browserAPI?.storage?.onChanged) {
        browserAPI.storage.onChanged.removeListener(storageListener);
      }
      if (typeof browser !== "undefined" && browser.tabs?.onRemoved) {
        browser.tabs.onRemoved.removeListener(tabRemovedListener);
      }
      if (browserAPI?.runtime?.onMessage) {
        browserAPI.runtime.onMessage.removeListener(messageListener);
      }
      clearInterval(interval);
    };
  }, [fetchStatuses]);

  const isSdpaActive = Boolean(sdpaTabId && sdpaData);

  // Evita duplicar o card do sócio: se já estiver em destaque no SDPA, remove o card de lote repetido
  const displayedItems = useMemo(() => {
    return items.filter((item) => {
      if (!isSdpaActive) return true;
      if (sdpaTabId && item.tabId === sdpaTabId) return false;
      if (
        sdpaData?.cpf &&
        item.cpf &&
        item.cpf.replace(/\D/g, "") === sdpaData.cpf.replace(/\D/g, "")
      ) {
        return false;
      }
      return true;
    });
  }, [items, isSdpaActive, sdpaTabId, sdpaData]);

  const handleTriggerSdpa = async () => {
    if (!sdpaTabId) return;
    setSdpaFilling(true);
    try {
      const browserAPI =
        typeof browser !== "undefined" ? browser : (window as any).chrome;
      if (browserAPI?.tabs?.sendMessage) {
        await browserAPI.tabs.sendMessage(sdpaTabId, { action: "TRIGGER_SDPA_FILL" });
      }
    } catch (err) {
      console.error("[Sidebar] Erro ao disparar preenchimento SDPA:", err);
    } finally {
      setTimeout(() => setSdpaFilling(false), 2000);
    }
  };

  const handleHighlightAttachments = async () => {
    if (!sdpaTabId) return;
    try {
      const browserAPI =
        typeof browser !== "undefined" ? browser : (window as any).chrome;
      if (browserAPI?.tabs?.sendMessage) {
        await browserAPI.tabs.sendMessage(sdpaTabId, { action: "HIGHLIGHT_SDPA_ATTACHMENTS" });
      }
    } catch (err) {
      console.error("[Sidebar] Erro ao destacar anexos na aba:", err);
    }
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchStatuses();
  };

  const handleClearHistory = async () => {
    try {
      if (typeof browser !== "undefined" && browser.runtime?.sendMessage) {
        await browser.runtime.sendMessage({ action: "clearGovBatchHistory" });
      }
      // Mantém apenas itens cujas abas continuam ativas no momento
      setItems((prev) => prev.filter((it) => typeof it.tabId === "number" && aliveTabIds.has(it.tabId)));
    } catch (e) {
      console.error("[Sidebar] Erro ao limpar histórico:", e);
    }
  };

  const handleFocusTab = async (tabId?: number) => {
    if (typeof tabId !== "number") return;
    try {
      if (typeof browser !== "undefined" && browser.tabs?.update) {
        await browser.tabs.update(tabId, { active: true });
      }
    } catch (e) {
      console.error("[Sidebar] Erro ao focar na aba:", e);
      // Se a aba não existe mais, remove do aliveTabIds
      setAliveTabIds((prev) => {
        const next = new Set(prev);
        next.delete(tabId);
        return next;
      });
    }
  };

  const handleCloseTab = async (tabId?: number) => {
    if (typeof tabId !== "number") return;
    try {
      if (typeof browser !== "undefined" && browser.tabs?.remove) {
        await browser.tabs.remove(tabId);
      }
      setAliveTabIds((prev) => {
        const next = new Set(prev);
        next.delete(tabId);
        return next;
      });
      // Atualiza localmente preservando o sucesso se já havia concluído
      setItems((prev) =>
        prev.map((it) => {
          if (it.tabId !== tabId) return it;
          const wasSuccess = it.status === "concluido" || it.status === "sucesso" || Boolean(it.boletoGerado);
          return {
            ...it,
            sessionClosedByUser: true,
            status: wasSuccess ? "concluido" : "erro",
            statusTitle: wasSuccess ? (it.statusTitle || "Concluído") : "Sessão perdida",
            statusDescription: wasSuccess ? (it.statusDescription || "Processamento concluído com sucesso") : "Aba fechada/encerrada pelo usuário",
          };
        }),
      );
    } catch (e) {
      console.error("[Sidebar] Erro ao fechar aba:", e);
    }
  };

  const stats = useMemo(() => {
    const total = items.length;
    let processing = 0;
    let success = 0;
    let errors = 0;
    let passwordErrors = 0;

    for (const it of items) {
      if (isPasswordError(it)) {
        passwordErrors++;
        errors++;
      } else if (
        it.status === "concluido" ||
        it.status === "sucesso" ||
        Boolean(it.boletoGerado)
      ) {
        success++;
      } else if (it.status === "erro" || it.sessionClosedByUser) {
        errors++;
      } else {
        processing++;
      }
    }

    return { total, processing, success, errors, passwordErrors };
  }, [items]);

  return (
    <div className="sidebar-container">
      <header className="sidebar-header">
        <div className="sidebar-header-left">
          <img src="../../sigess-logo.png" alt="SIGESS" className="sidebar-logo" />
          <div>
            <div className="sidebar-title">Acompanhamento de Lote</div>
            <div className="sidebar-subtitle">Painel Lateral SIGESS</div>
          </div>
        </div>
        <div className="sidebar-header-actions">
          {items.length > 0 && (
            <button
              type="button"
              className="sidebar-icon-btn"
              onClick={handleClearHistory}
              title="Limpar histórico do painel"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={handleManualRefresh}
            title="Atualizar status agora"
          >
            <RefreshCw
              size={14}
              className={isRefreshing ? "sidebar-spin" : undefined}
            />
          </button>
        </div>
      </header>

      <section className="sidebar-stats-bar">
        <div className="sidebar-stat-item">
          <span className="sidebar-stat-value">{stats.total}</span>
          <span className="sidebar-stat-label">Total</span>
        </div>
        <div className="sidebar-stat-item active">
          <span className="sidebar-stat-value">{stats.processing}</span>
          <span className="sidebar-stat-label">Em andam.</span>
        </div>
        <div className="sidebar-stat-item success">
          <span className="sidebar-stat-value">{stats.success}</span>
          <span className="sidebar-stat-label">Concluídos</span>
        </div>
        <div className={`sidebar-stat-item ${stats.errors > 0 ? "error" : ""}`}>
          <span className="sidebar-stat-value">{stats.errors}</span>
          <span className="sidebar-stat-label">Falhas</span>
          {stats.passwordErrors > 0 && (
            <span className="sidebar-stat-sublabel">
              ({stats.passwordErrors} {stats.passwordErrors === 1 ? "senha" : "senhas"})
            </span>
          )}
        </div>
      </section>

      <main className="sidebar-content">
        {sdpaTabId && sdpaData && (
          <section className="sidebar-sdpa-card">
            <div className="sidebar-sdpa-header">
              <div className="sidebar-sdpa-title-wrap">
                <span className="sidebar-sdpa-badge">SDPA / MTE</span>
                <h4 className="sidebar-sdpa-title" title={sdpaData.nome || "Pescador(a)"}>
                  {sdpaData.nome || "Pescador(a)"}
                </h4>
                <span className="sidebar-sdpa-cpf">CPF: {formatCpf(sdpaData.cpf || "")}</span>
              </div>
              <div className="sidebar-sdpa-actions">
                <button
                  type="button"
                  className="sidebar-btn-sdpa-secondary"
                  onClick={handleHighlightAttachments}
                  title="Localizar e destacar área de upload de anexos"
                >
                  <Paperclip size={12} />
                  Anexos
                </button>
                <button
                  type="button"
                  className="sidebar-btn-sdpa"
                  onClick={handleTriggerSdpa}
                  disabled={sdpaFilling}
                  title="Preencher formulário no portal MTE"
                >
                  {sdpaFilling ? (
                    <Loader2 size={13} className="sidebar-spin" />
                  ) : (
                    <FileText size={13} />
                  )}
                  {sdpaFilling ? "Preenchendo..." : "Preencher"}
                </button>
                {sdpaTabId && (
                  <button
                    type="button"
                    className="sidebar-btn-sdpa-close"
                    onClick={() => handleCloseTab(sdpaTabId)}
                    title="Fechar aba da solicitação"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Resumo da Auditoria de Campos com semântica e cores originais do projeto */}
            {sdpaData.auditStats && sdpaData.auditStats.total > 0 && (
              <div className="sidebar-sdpa-audit-summary">
                <span className="sdpa-audit-pill is-ok" title="Campos preenchidos e validados">
                  {sdpaData.auditStats.ok} OK
                </span>
                {sdpaData.auditStats.warning > 0 && (
                  <span className="sdpa-audit-pill is-warning" title="Campos com divergência ou a revisar">
                    {sdpaData.auditStats.warning} A revisar
                  </span>
                )}
                {sdpaData.auditStats.missing > 0 && (
                  <span className="sdpa-audit-pill is-missing" title="Campos pendentes ou não preenchidos">
                    {sdpaData.auditStats.missing} Pendentes
                  </span>
                )}
              </div>
            )}

            <div className="sidebar-sdpa-body">
              {sdpaData.rgp && (
                <div className="sidebar-sdpa-row">
                  <span className="label">RGP:</span>
                  <span className="value">{sdpaData.rgp}</span>
                </div>
              )}
              {sdpaData.dataPrimeiroRegistro && (
                <div className="sidebar-sdpa-row">
                  <span className="label">1º Registro:</span>
                  <span className="value">{sdpaData.dataPrimeiroRegistro}</span>
                </div>
              )}
              {(sdpaData.cidade || sdpaData.uf) && (
                <div className="sidebar-sdpa-row">
                  <span className="label">Município:</span>
                  <span className="value">
                    {[sdpaData.cidade, sdpaData.uf].filter(Boolean).join(" - ")}
                  </span>
                </div>
              )}
              {(sdpaData.endereco || sdpaData.numero || sdpaData.bairro) && (
                <div className="sidebar-sdpa-row">
                  <span className="label">Endereço:</span>
                  <span className="value">
                    {[
                      sdpaData.endereco,
                      sdpaData.numero ? `nº ${sdpaData.numero}` : "",
                      sdpaData.bairro,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
              {(sdpaData.telefone || sdpaData.email) && (
                <div className="sidebar-sdpa-row">
                  <span className="label">Contato:</span>
                  <span className="value">
                    {[sdpaData.telefone, sdpaData.email].filter(Boolean).join(" | ")}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {loading && items.length === 0 ? (
          <div className="sidebar-empty">
            <Loader2 size={36} className="sidebar-empty-icon sidebar-spin" />
            <div className="sidebar-empty-title">Carregando lote...</div>
            <div className="sidebar-empty-desc">
              Obtendo dados das abas de automação em execução.
            </div>
          </div>
        ) : displayedItems.length === 0 && !isSdpaActive ? (
          <div className="sidebar-empty">
            <Layers size={40} className="sidebar-empty-icon" />
            <div className="sidebar-empty-title">Nenhum lote ativo</div>
            <div className="sidebar-empty-desc">
              Inicie um lote de automação no SIGESS Web. O acompanhamento em
              tempo real aparecerá aqui.
            </div>
          </div>
        ) : (
          displayedItems.map((item) => {
            const hasPassError = isPasswordError(item);
            const isCompleted =
              item.status === "concluido" ||
              item.status === "sucesso" ||
              Boolean(item.boletoGerado);
            const isError =
              hasPassError || item.status === "erro" || (item.sessionClosedByUser && !isCompleted);
            const isProcessing = !isCompleted && !isError;
            const isTabAlive = typeof item.tabId === "number" && aliveTabIds.has(item.tabId);
            const canInteractTab = isTabAlive && !item.sessionClosedByUser;

            let cardClass = "sidebar-item-card";
            if (hasPassError) {
              cardClass += " is-password-error is-error";
            } else if (isError) {
              cardClass += " is-error";
            } else if (isCompleted) {
              cardClass += " is-success";
            } else if (isProcessing) {
              cardClass += " is-processing";
            }

            const title = (item.statusTitle || "Aguardando").trim();
            const desc = (item.statusDescription || "").trim();
            const shouldShowDesc = desc &&
              desc.toLowerCase() !== title.toLowerCase() &&
              !desc.toLowerCase().includes(title.toLowerCase()) &&
              !title.toLowerCase().includes(desc.toLowerCase());

            return (
              <article
                key={item.tabId ? `tab-${item.tabId}` : `cpf-${item.cpf}`}
                className={cardClass}
              >
                <div className="sidebar-item-header">
                  <div className="sidebar-item-info">
                    <span className="sidebar-item-name" title={item.nome || "Sócio"}>
                      {item.nome || "Sócio sem nome"}
                    </span>
                    <span className="sidebar-item-cpf">
                      CPF: {formatCpf(item.cpf)}
                    </span>
                  </div>

                  <div>
                    {hasPassError ? (
                      <span className="sidebar-badge password-error">
                        <KeyRound size={11} /> Senha incorreta
                      </span>
                    ) : isError ? (
                      <span className="sidebar-badge error">
                        <AlertTriangle size={11} /> Erro
                      </span>
                    ) : isCompleted ? (
                      <span className="sidebar-badge success">
                        <CheckCircle2 size={11} /> Concluído
                      </span>
                    ) : (
                      <span className="sidebar-badge processing">
                        <Loader2 size={11} className="sidebar-spin" /> Em andamento
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={`sidebar-status-banner ${
                    hasPassError || isError
                      ? "error"
                      : isCompleted
                        ? "success"
                        : "processing"
                  }`}
                >
                  {hasPassError ? (
                    <KeyRound size={14} style={{ flexShrink: 0 }} />
                  ) : isError ? (
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                  ) : isCompleted ? (
                    <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                  ) : (
                    <Clock size={14} style={{ flexShrink: 0 }} />
                  )}
                  <span>
                    <strong>{title}</strong>
                    {shouldShowDesc ? ` - ${desc}` : ""}
                  </span>
                </div>

                {canInteractTab && (
                  <div className="sidebar-item-actions">
                    <button
                      type="button"
                      className="sidebar-btn-action"
                      onClick={() => handleFocusTab(item.tabId)}
                      title="Ir para a aba no navegador"
                    >
                      <ExternalLink size={12} />
                      Ver aba
                    </button>
                    <button
                      type="button"
                      className="sidebar-btn-action close-tab"
                      onClick={() => handleCloseTab(item.tabId)}
                      title="Fechar esta aba"
                    >
                      <X size={12} />
                      Fechar
                    </button>
                  </div>
                )}
              </article>
            );
          })
        )}
      </main>

      <footer className="sidebar-footer">
        <span>Atalho: <strong>Ctrl+Alt+S</strong></span>
        <span>{items.length} {items.length === 1 ? "registro" : "registros"}</span>
      </footer>
    </div>
  );
};
