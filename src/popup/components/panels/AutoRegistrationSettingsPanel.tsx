import React from "react";
import { AppSettings } from "../../../shared/types";
import { Database } from "lucide-react";

interface AutoRegistrationSettingsPanelProps {
  settings: AppSettings;
  onUpdate: (settings: Partial<AppSettings>) => void;
}

const AutoRegistrationSettingsPanel: React.FC<AutoRegistrationSettingsPanelProps> = ({ settings, onUpdate }) => (
  <div className="stack">
    <div className="info-card" style={{ marginBottom: "12px", padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "8px",
            background: settings.autoRegistrationEnabled ? "rgba(16, 185, 129, 0.1)" : "rgba(100, 116, 139, 0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Database size={18} color={settings.autoRegistrationEnabled ? "#10b981" : "#64748b"} />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>Captura Automática</div>
            <div style={{ fontSize: "11px", color: "#64748b" }}>
              {settings.autoRegistrationEnabled ? "Ativada para sites GOV" : "Desativada no momento"}
            </div>
          </div>
        </div>
        <label className="switch" htmlFor="auto-capture-toggle" style={{ position: "relative", display: "inline-block", width: "36px", height: "20px" }}>
          <span style={{
            position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px",
            overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", borderWidth: 0,
          }}>Ativar Captura Automática</span>
          <input
            id="auto-capture-toggle"
            type="checkbox"
            checked={Boolean(settings.autoRegistrationEnabled)}
            onChange={(event) => onUpdate({ autoRegistrationEnabled: event.target.checked })}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span className="slider round" style={{
            position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: settings.autoRegistrationEnabled ? "#10b981" : "#334155",
            transition: ".4s", borderRadius: "34px",
          }}>
            <span style={{
              position: "absolute", height: "14px", width: "14px", left: "3px", bottom: "3px",
              backgroundColor: "white", transition: ".4s", borderRadius: "50%",
              transform: settings.autoRegistrationEnabled ? "translateX(16px)" : "translateX(0)",
            }} />
          </span>
        </label>
      </div>
    </div>
  </div>
);

export default AutoRegistrationSettingsPanel;
