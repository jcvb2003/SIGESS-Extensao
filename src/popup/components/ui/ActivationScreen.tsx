import React, { useState } from "react";
import { Monitor, Key, ShieldCheck, Activity, ExternalLink } from "lucide-react";

export function getLicenseErrorMessage(reason?: string): string {
  switch (reason) {
    case "expired": return "Sua licença expirou.";
    case "wrong_device": return "Licença em uso em outro dispositivo.";
    case "invalid_key": return "Chave de acesso inválida.";
    case "limit_reached_devices": return "Limite de dispositivos atingido.";
    default: return "Falha na validação da licença.";
  }
}

interface ActivationScreenProps {
  license: any;
  activating: boolean;
  onActivate: (key: string, deviceName: string) => void;
}

export const ActivationScreen: React.FC<ActivationScreenProps> = ({ license, activating, onActivate }) => {
  const [activationKey, setActivationKey] = useState("");
  const [deviceName, setDeviceName] = useState("");

  const handleActivateClick = () => {
    if (!activationKey || !deviceName) return;
    onActivate(activationKey.trim(), deviceName.trim());
  };

  return (
    <div className="activation-screen-container" style={{
      minHeight: '520px',
      width: '400px',
      display: 'flex',
      flexDirection: 'column',
      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background Glows */}
      <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, background: 'var(--color-accent)', opacity: 0.08, borderRadius: '50%', filter: 'blur(40px)' }} />
      <div style={{ position: 'absolute', bottom: -20, left: -20, width: 120, height: 120, background: 'var(--color-accent)', opacity: 0.04, borderRadius: '50%', filter: 'blur(30px)' }} />

      <header style={{ padding: '28px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ background: 'white', padding: 12, borderRadius: 16, boxShadow: '0 6px 16px rgba(15, 118, 110, 0.12)', display: 'flex' }}>
          <img src="../../icon.png" alt="SIGESS" style={{ width: 38, height: 38, borderRadius: 8 }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: '800', color: 'var(--color-text)', letterSpacing: '-0.5px', margin: 0 }}>SIGESS</h1>
          <p style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1.2px', marginTop: 3 }}>Enterprise Control</p>
        </div>
      </header>

      <main style={{ flex: 1, padding: '0 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(16px)',
          padding: '24px 20px',
          borderRadius: 24,
          border: '1px solid rgba(255, 255, 255, 0.6)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.03)',
          width: '100%',
          maxWidth: 360
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="form-group">
              <label htmlFor="dev-name" style={{ fontSize: 10, fontWeight: '800', color: '#64748b', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                Computador da Estação
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="dev-name"
                  type="text"
                  placeholder="Ex: Recepção Central"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  disabled={activating}
                  style={{
                    width: '100%', padding: '13px 14px 13px 42px', borderRadius: 14,
                    border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: '500',
                    background: 'white', color: 'var(--color-text)', outline: 'none', transition: 'all 0.2s'
                  }}
                />
                <Monitor size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="act-key" style={{ fontSize: 10, fontWeight: '800', color: '#64748b', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                Chave da Licença
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="act-key"
                  type="text"
                  placeholder="Seu código de ativação"
                  value={activationKey}
                  onChange={(e) => setActivationKey(e.target.value)}
                  disabled={activating}
                  style={{
                    width: '100%', padding: '13px 14px 13px 42px', borderRadius: 14,
                    border: '1.5px solid var(--color-accent)', fontSize: 13, fontWeight: '600',
                    background: 'white', color: 'var(--color-text)', outline: 'none',
                    boxShadow: '0 0 0 4px rgba(15, 118, 110, 0.04)'
                  }}
                />
                <Key size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-accent)' }} />
              </div>
            </div>

            <button
              onClick={handleActivateClick}
              disabled={activating || !activationKey || !deviceName}
              style={{
                width: '100%',
                padding: 15,
                marginTop: 6,
                fontWeight: '800',
                fontSize: 14,
                borderRadius: 14,
                border: 'none',
                background: activating ? '#cbd5e1' : 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                color: 'white',
                cursor: activating ? 'wait' : 'pointer',
                boxShadow: '0 8px 20px rgba(15, 118, 110, 0.2)',
                transition: 'all 0.2s'
              }}
            >
              {activating ? "Validando Chave..." : "Ativar SIGESS Agora"}
            </button>

            {license?.reason && license.reason !== "no_key" && (
              <div style={{
                padding: 12,
                background: '#fef2f2',
                borderRadius: 12,
                color: '#b91c1c',
                fontSize: 11,
                fontWeight: '700',
                border: '1px solid #fee2e2',
                display: 'flex',
                gap: 8,
                alignItems: 'center'
              }}>
                <ShieldCheck size={14} style={{ color: '#ef4444' }} />
                {getLicenseErrorMessage(license.reason)}
              </div>
            )}
          </div>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <a
              href="https://wa.me/5591993193461"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--color-muted)',
                fontSize: 11,
                fontWeight: '600',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 16px',
                borderRadius: 20,
                background: '#f8fafc',
                border: '1px solid #e2e8f0'
              }}
            >
              <Activity size={12} /> Ajuda ou Renovação <span style={{ color: 'var(--color-accent)', fontWeight: '800' }}>WhatsApp <ExternalLink size={10} /></span>
            </a>
          </div>
        </div>
      </main>

      <footer style={{
        padding: '16px 12px',
        textAlign: 'center',
        fontSize: 10,
        color: '#94a3b8',
        fontWeight: '600',
        letterSpacing: 0.5
      }}>
      </footer>
    </div>
  );
};
