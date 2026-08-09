import React, { useState } from "react";
import { HardDrive } from "lucide-react";
import { AppSettings } from "../../../shared/types";
import { ExpandIcon } from "../ui/icons";

interface Props {
  settings: AppSettings;
  onUpdate: (settings: Partial<AppSettings>) => Promise<void> | void;
  isOpen: boolean;
  onToggle: () => void;
}

const StaticCachePanel: React.FC<Props> = ({ settings, onUpdate, isOpen, onToggle }) => {
  const [clearing, setClearing] = useState(false);

  const clearCache = async () => {
    if (!confirm("Limpar o cache HTTP do Firefox? Isso afeta todos os sites, mas não remove cookies ou senhas.")) return;
    setClearing(true);
    try {
      await browser.runtime.sendMessage({ action: "clearStaticCache" });
    } finally {
      setClearing(false);
    }
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
          <h2 className="section-title">Aceleração de páginas</h2>
          <p className="section-description">Cache estático dos portais do cadastro automático</p>
        </div>
        <ExpandIcon isOpen={isOpen} />
      </button>

      <div className={`accordion-content ${isOpen ? "open" : "collapsed"}`}>
        <div className="section-content">
          <div className="info-card" style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: settings.staticCacheEnabled ? "rgba(16, 185, 129, 0.1)" : "rgba(100, 116, 139, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <HardDrive size={18} color={settings.staticCacheEnabled ? "#10b981" : "#64748b"} />
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>Cache do cadastro</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    {settings.staticCacheEnabled ? "Ativo no container dedicado" : "Desativado no momento"}
                  </div>
                </div>
              </div>
              <label className="switch" htmlFor="static-cache-toggle" style={{ position: "relative", display: "inline-block", width: "36px", height: "20px" }}>
                <span style={{
                  position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px",
                  overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", borderWidth: 0,
                }}>Ativar aceleração de páginas</span>
                <input
                  id="static-cache-toggle"
                  type="checkbox"
                  checked={Boolean(settings.staticCacheEnabled)}
                  onChange={(event) => void onUpdate({ staticCacheEnabled: event.target.checked })}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span className="slider round" style={{ position: "absolute", cursor: "pointer", inset: 0, backgroundColor: settings.staticCacheEnabled ? "#10b981" : "#334155", transition: ".4s", borderRadius: "34px" }}>
                  <span style={{ position: "absolute", height: "14px", width: "14px", left: "3px", bottom: "3px", backgroundColor: "white", transition: ".4s", borderRadius: "50%", transform: settings.staticCacheEnabled ? "translateX(16px)" : "translateX(0)" }} />
                </span>
              </label>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: "11px", lineHeight: 1.45, color: "#64748b" }}>
              O cadastro automático reutiliza uma sessão exclusiva. Ao finalizar, os acessos são limpos e os arquivos estáticos permanecem disponíveis para acelerar a próxima execução.
            </p>
            <button type="button" className="btn btn-secondary btn-full" onClick={() => void clearCache()} disabled={clearing} style={{ marginTop: "12px" }}>
              {clearing ? "Limpando..." : "Limpar cache"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StaticCachePanel;
