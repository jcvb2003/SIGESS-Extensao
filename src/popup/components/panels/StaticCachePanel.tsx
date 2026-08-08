import React, { useState } from "react";
import { HardDrive } from "lucide-react";
import { AppSettings } from "../../../shared/types";

interface Props {
  settings: AppSettings;
  onUpdate: (settings: Partial<AppSettings>) => Promise<void> | void;
}

const StaticCachePanel: React.FC<Props> = ({ settings, onUpdate }) => {
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
    <section className="section" style={{ marginTop: "12px" }}>
      <div className="info-card" style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <HardDrive size={18} color={settings.staticCacheEnabled ? "#10b981" : "#64748b"} />
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>Aceleração de páginas</div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>
                {settings.staticCacheEnabled ? "Ativa nos portais do SIGESS" : "Desativada"}
              </div>
            </div>
          </div>
          <label className="switch" style={{ position: "relative", display: "inline-block", width: "36px", height: "20px" }}>
            <input
              type="checkbox"
              checked={Boolean(settings.staticCacheEnabled)}
              onChange={(event) => void onUpdate({ staticCacheEnabled: event.target.checked })}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span className="slider round" style={{ position: "absolute", cursor: "pointer", inset: 0, backgroundColor: settings.staticCacheEnabled ? "#10b981" : "#334155", borderRadius: "34px" }}>
              <span style={{ position: "absolute", height: "14px", width: "14px", left: "3px", bottom: "3px", backgroundColor: "white", borderRadius: "50%", transform: settings.staticCacheEnabled ? "translateX(16px)" : "translateX(0)" }} />
            </span>
          </label>
        </div>
        <button type="button" className="secondary-button" onClick={() => void clearCache()} disabled={clearing} style={{ marginTop: "12px", width: "100%" }}>
          {clearing ? "Limpando..." : "Limpar cache"}
        </button>
      </div>
    </section>
  );
};

export default StaticCachePanel;
