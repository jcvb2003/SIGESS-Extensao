import React, { useState, useEffect } from "react";
import { LicenseService, LicenseResult } from "../../../shared/services/license";
import { Skeleton } from "./Skeleton";

// Ícones Premium (Inline SVG)
const IconPlan = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

const IconCalendar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconDevice = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconZap = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const LicenseInfo: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [license, setLicense] = useState<LicenseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    loadLicense();
  }, []);

  const loadLicense = async (forceLive = false) => {
    setLoading(true);
    const result = await LicenseService.checkLicense(forceLive, false);
    setLicense(result);
    setLastRefresh(new Date());
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLicense(true);
    setRefreshing(false);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  };

  const renderItem = (label: string, value: React.ReactNode, subValue: string, icon: React.ReactNode, color: string) => (
    <div style={{ 
        background: 'var(--color-surface)', 
        border: '1px solid var(--color-border)', 
        borderRadius: '12px', 
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        transition: 'all 0.2s ease',
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <div style={{ color: color, display: 'flex' }}>{icon}</div>
        <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-text)' }}>{value}</div>
      <div style={{ fontSize: '9px', color: 'var(--color-muted)', fontWeight: '500' }}>{subValue}</div>
    </div>
  );

  return (
    <div className="modal-overlay" style={{ backdropFilter: 'blur(8px)', background: 'rgba(15, 23, 42, 0.4)' }}>
      <div className="section modal-card fade-in" style={{ 
          width: '340px', 
          padding: '0', 
          overflow: 'hidden', 
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Header com Gradiente Premium */}
        <header style={{ 
            background: 'linear-gradient(135deg, #0f766e 0%, #134e4a 100%)', 
            padding: '20px', 
            color: 'white',
            position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '10px', borderRadius: '12px', backdropFilter: 'blur(4px)' }}>
              <img src="../../icon.png" width="24" height="24" alt="SIGESS" />
            </div>
            <div>
               <h3 style={{ fontSize: '16px', margin: '0', fontWeight: '800' }}>Assinatura SIGESS</h3>
               <p style={{ fontSize: '11px', margin: '0', opacity: '0.8', fontWeight: '500' }}>Painel de Gestão de Licença</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="btn-icon" 
            style={{ position: 'absolute', top: '20px', right: '20px', color: 'white', opacity: '0.7', filter: 'invert(1)' }}
          >
             ✕
          </button>
        </header>

        <div className="modal-body" style={{ padding: '20px', background: 'var(--color-surface-alt)' }}>
          {loading ? (
             <div className="stack" style={{ gap: '12px' }}>
                <Skeleton height={60} width="100%" borderRadius="12px" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <Skeleton height={80} width="100%" borderRadius="12px" />
                    <Skeleton height={80} width="100%" borderRadius="12px" />
                </div>
             </div>
          ) : !license ? (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-danger)' }}>Erro ao carregar dados</div>
          ) : (
             <div className="stack" style={{ gap: '16px' }}>
                {/* Banner de Plano */}
                <div style={{ 
                    background: license.plan === 'trial' ? 'linear-gradient(90deg, #fffbeb 0%, #fef3c7 100%)' : 'linear-gradient(90deg, #f0fdfa 0%, #ccfbf1 100%)',
                    padding: '12px 16px',
                    borderRadius: '14px',
                    border: license.plan === 'trial' ? '1px solid #fde68a' : '1px solid #99f6e4',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                         <div style={{ color: license.plan === 'trial' ? '#d97706' : '#0f766e' }}><IconZap /></div>
                         <span style={{ fontWeight: '800', color: license.plan === 'trial' ? '#92400e' : '#134e4a', fontSize: '13px' }}>
                            Sua licença é {license.plan === 'trial' ? 'Grátis (Trial)' : 'Profissional (Pro)'}
                         </span>
                    </div>
                </div>

                {/* Grid de Informações */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                   {renderItem("Validade", formatDate(license.expires_at), "Vencimento da chave", <IconCalendar />, "#ef4444")}
                   {renderItem("Multiuso", `${license.devices || 1}/${license.max_devices || 2}`, "Limite de aparelhos", <IconDevice />, "#3b82f6")}
                   {renderItem("Status", license.ok ? "Ativo" : "Pendente", "Estado da ativação", <IconCheck />, "#22c55e")}
                   {renderItem("Referência", license.plan === 'paid' ? "PRO-ACTIVE" : "TRIAL-MODE", "Tipo de registro", <IconPlan />, "#8b5cf6")}
                </div>

                {/* Trial Box */}
                {license.plan === 'trial' && (
                    <div style={{ padding: '14px', background: 'var(--color-surface)', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px', fontWeight: '700' }}>
                            <span>PROGRESSO DE USO</span>
                            <span style={{ color: 'var(--color-accent)' }}>{license.usage_count}/{license.max_usage}</span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--color-surface-alt)', borderRadius: '10px', overflow: 'hidden' }}>
                            <div style={{ 
                                width: `${Math.min(((license.usage_count || 0) / (license.max_usage || 1)) * 100, 100)}%`, 
                                height: '100%', 
                                background: 'var(--color-accent)' 
                            }} />
                        </div>
                    </div>
                )}

                {/* Erros */}
                {license.reason && !license.ok && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px', borderRadius: '10px', color: '#b91c1c', fontSize: '11px', fontWeight: '600', textAlign: 'center' }}>
                         {license.reason === 'wrong_device' ? 'Licença em outro PC. Entre em contato.' : `Atenção: ${license.reason}`}
                    </div>
                )}
             </div>
          )}
        </div>

        <footer style={{ 
            padding: '16px 20px', 
            background: 'var(--color-surface)', 
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}>
          <button
            className={`btn btn-primary ${refreshing ? "loading" : ""}`}
            onClick={handleRefresh}
            disabled={loading || refreshing}
            type="button"
            style={{ borderRadius: '10px', padding: '8px 18px', fontWeight: '700', fontSize: '12px' }}
          >
            {refreshing ? "Atualizando..." : "Verificar Agora"}
          </button>
          <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--color-muted)' }}>VERSÃO {browser.runtime.getManifest().version}</div>
              <div style={{ fontSize: '9px', color: 'var(--color-muted)' }}>Check: {lastRefresh?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LicenseInfo;
