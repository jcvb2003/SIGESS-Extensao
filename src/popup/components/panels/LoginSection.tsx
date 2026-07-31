import React from "react";
import { ChevronIcon, GlobeIcon, ClipboardIcon } from "../ui/icons";
import { AppSettings } from "../../../shared/types";

interface LoginSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  loading: boolean;
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void;
  onShowModal: (type: "mte" | "pesqbrasil_mpa" | "esocial" | "inss") => void;
  onOpenBatch: (type: "mte" | "pesqbrasil_mpa" | "esocial" | "inss") => void;
}

export const LoginSection: React.FC<LoginSectionProps> = ({
  isOpen,
  onToggle,
  loading,
  settings,
  onUpdate,
  onShowModal,
  onOpenBatch,
}) => {
  const queue = settings.multiLoginQueue || [];

  const handleToggleMulti = (enabled: boolean) => {
    onUpdate({ multiLoginEnabled: enabled });
  };

  const removeFromQueue = (id: string) => {
    const next = queue.filter((item) => item.id !== id);
    onUpdate({ multiLoginQueue: next });
  };

  return (
    <section className="section accordion">
      <button
        type="button"
        className="accordion-header"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <div className="section-header">
          <h2 className="section-title">Login Múltiplo</h2>
          <p className="section-description">
            Enfileire logins e execute-os em lote
          </p>
        </div>
        <ChevronIcon isOpen={isOpen} />
      </button>

      <div className={`accordion-content ${isOpen ? "open" : "collapsed"}`}>
        <div className="section-content">
          <div className="stack" style={{ gap: "16px" }}>
            {/* TOGGLE PRINCIPAL */}
            <div className="toggle-group" style={{ marginBottom: "4px" }}>
              <label className="toggle-label">
                <span className="toggle-text" style={{ fontWeight: "600" }}>
                  Ativar login múltiplo via sistema
                </span>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-input"
                    checked={settings.multiLoginEnabled || false}
                    onChange={(e) => handleToggleMulti(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </div>
              </label>
            </div>

            {/* BOTÕES DE AÇÃO */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button
                className="btn btn-primary"
                onClick={() =>
                  settings.multiLoginEnabled
                    ? onOpenBatch("mte")
                    : onShowModal("mte")
                }
                disabled={loading}
              >
                <GlobeIcon />
                <span className="btn-text">
                  {settings.multiLoginEnabled
                    ? `MTE (${queue.filter((i) => i.type === "mte").length})`
                    : "MTE"}
                </span>
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  settings.multiLoginEnabled
                    ? onOpenBatch("pesqbrasil_mpa")
                    : onShowModal("pesqbrasil_mpa")
                }
                disabled={loading}
              >
                <GlobeIcon />
                <span className="btn-text">
                  {settings.multiLoginEnabled
                    ? `PesqBrasil MPA (${queue.filter((i) => i.type === "pesqbrasil_mpa").length})`
                    : "PesqBrasil MPA"}
                </span>
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  settings.multiLoginEnabled
                    ? onOpenBatch("esocial")
                    : onShowModal("esocial")
                }
                disabled={loading}
              >
                <ClipboardIcon />
                <span className="btn-text">
                  {settings.multiLoginEnabled
                    ? `eSocial (${queue.filter((i) => i.type === "esocial").length})`
                    : "eSocial"}
                </span>
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  settings.multiLoginEnabled
                    ? onOpenBatch("inss")
                    : onShowModal("inss")
                }
                disabled={loading}
              >
                <GlobeIcon />
                <span className="btn-text">
                  {settings.multiLoginEnabled
                    ? `INSS (${queue.filter((i) => i.type === "inss").length})`
                    : "INSS"}
                </span>
              </button>
            </div>

            {/* LISTA DE ESPERA (Apenas quando habilitado) */}
            {settings.multiLoginEnabled && queue.length > 0 && (
              <div
                className="queue-container fade-in"
                style={{
                  background: "var(--color-surface-alt)",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "8px 12px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    color: "var(--color-accent)",
                    background: "rgba(15, 118, 110, 0.05)",
                    borderBottom: "1px solid var(--color-border)",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>FILA DE LOGINS ({queue.length}/5)</span>
                  <span>NOMES</span>
                </div>
                <div style={{ maxHeight: "150px", overflowY: "auto" }}>
                  {queue.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderBottom: "1px solid rgba(0,0,0,0.05)",
                        fontSize: "11px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background:
                              item.type === "esocial" ? "#2563eb"
                              : item.type === "inss" ? "#7c3aed"
                              : item.type === "pesqbrasil_mpa" ? "#0284c7"
                              : "#0f766e",
                          }}
                        />
                        <span style={{ fontWeight: "600", textTransform: "uppercase" }}>
                          {item.nome}
                        </span>
                      </div>
                      <button
                        onClick={() => removeFromQueue(item.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#e11d48",
                          cursor: "pointer",
                          padding: "4px",
                          fontWeight: "bold",
                          fontSize: "12px",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {settings.multiLoginEnabled && queue.length === 0 && (
              <p
                style={{
                  fontSize: "11px",
                  textAlign: "center",
                  color: "var(--color-muted)",
                  fontStyle: "italic",
                }}
              >
                Aguardando logins do sistema externo...
              </p>
            )}

            {settings.multiLoginEnabled && (
              <div
                style={{
                  padding: "8px",
                  background: "#fff4d8",
                  borderRadius: "6px",
                  fontSize: "10px",
                  color: "#8a5d00",
                  border: "1px solid #f9dab1",
                  textAlign: "center",
                }}
              >
                <strong>MODO ATIVO:</strong> Logins enviados não abrirão abas. <br />
                Eles serão salvos na lista acima para abertura em lote.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
