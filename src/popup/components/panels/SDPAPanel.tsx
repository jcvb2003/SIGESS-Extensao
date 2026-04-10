import React from "react";
import { AppSettings } from "../../../shared/types";
import { ShieldCheck, Mail, Phone, ExternalLink } from "lucide-react";

interface SDPAPanelProps {
  settings: AppSettings;
  onUpdate: (s: Partial<AppSettings>) => void;
}

const SDPAPanel: React.FC<SDPAPanelProps> = ({ settings, onUpdate }) => {

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ sdpaEnabled: e.target.checked });
  };

  const handleInputChange = (field: keyof AppSettings, value: string) => {
    onUpdate({ [field]: value });
  };

  return (
    <div className="stack">
      {/* Toggle de Ativação Global */}
      <div className="info-card" style={{ marginBottom: '12px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: settings.sdpaEnabled ? 'rgba(245, 158, 11, 0.1)' : 'rgba(100, 116, 139, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <ShieldCheck size={18} color={settings.sdpaEnabled ? '#f59e0b' : '#64748b'} />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>Módulo SDPA (MTE)</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {settings.sdpaEnabled ? 'Validação e Preenchimento Ativos' : 'Desativado no momento'}
              </div>
            </div>
          </div>
          <label className="switch" htmlFor="sdpa-toggle" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
            <span style={{
              position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
              overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0
            }}>Ativar Módulo SDPA</span>
            <input
              id="sdpa-toggle"
              type="checkbox"
              checked={!!settings.sdpaEnabled}
              onChange={handleToggle}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span className="slider round" style={{
              position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: settings.sdpaEnabled ? '#f59e0b' : '#334155',
              transition: '.4s', borderRadius: '34px'
            }}>
              <span style={{
                position: 'absolute', height: '14px', width: '14px', left: '3px', bottom: '3px',
                backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                transform: settings.sdpaEnabled ? 'translateX(16px)' : 'translateX(0)'
              }}></span>
            </span>
          </label>
        </div>
      </div>

      {/* Configurações de Fallback */}
      <div className="info-card">
        <div className="info-header" style={{ marginBottom: '12px' }}>
          <ExternalLink size={16} className="info-icon" />
          <span className="info-title">Personalização de Preenchimento</span>
        </div>
        
        <div className="stack" style={{ gap: '10px' }}>
          <div className="input-group">
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>
              E-mail Padrão (Sempre Aplicado)
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="email"
                placeholder="exemplo@email.com"
                value={settings.sdpaDefaultEmail || ""}
                onChange={(e) => handleInputChange("sdpaDefaultEmail", e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px 8px 32px', borderRadius: '6px',
                  border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none'
                }}
              />
            </div>
          </div>

          <div className="input-group">
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px', display: 'block' }}>
              Telefone de Fallback (Caso ausente na base)
            </label>
            <div style={{ position: 'relative' }}>
              <Phone size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="(91) 99999-9999"
                value={settings.sdpaFallbackPhone || ""}
                onChange={(e) => handleInputChange("sdpaFallbackPhone", e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px 8px 32px', borderRadius: '6px',
                  border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none'
                }}
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default SDPAPanel;
