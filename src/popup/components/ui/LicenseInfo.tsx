import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  Calendar,
  Key,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Zap,
  MousePointer2,
  Activity,
  Monitor,
  Plus,
  CreditCard
} from "lucide-react";
import { LicenseService, LicenseResult } from "../../../shared/services/license";
import { Skeleton } from "./Skeleton";

interface UsageBucketProps {
  label: string;
  icon: React.ReactNode;
  current: number;
  max: number;
  color: string;
  bgColor: string;
}

const UsageBucket = ({ label, icon, current, max, color, bgColor }: UsageBucketProps) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '12px',
      background: 'var(--color-surface)',
      borderRadius: '12px',
      border: '1px solid var(--color-border)',
      transition: 'all 0.2s ease'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            padding: '6px',
            borderRadius: '8px',
            background: bgColor,
            color: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {React.cloneElement(icon as React.ReactElement, { size: 14 })}
          </div>
          <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text)' }}>{label}</span>
        </div>
        <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--color-muted)', background: 'var(--color-surface-alt)', padding: '2px 8px', borderRadius: '10px' }}>
          {current} / {max}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={`dot-${i}`}
            style={{
              height: '4px',
              flex: 1,
              borderRadius: '4px',
              background: i < current ? color : 'var(--color-border)',
              opacity: i < current ? 1 : 0.3,
              transition: 'all 0.3s ease'
            }}
          />
        ))}
      </div>
    </div>
  );
};

export const LicenseInfo: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [license, setLicense] = useState<LicenseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inputKey, setInputKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const loadLicense = useCallback(async (forceLive = false) => {
    setRefreshing(true);
    try {
      const result = await LicenseService.checkLicense(forceLive);
      setLicense(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLicense();
  }, [loadLicense]);

  useEffect(() => {
    if (license?.device_name) {
      setDeviceName(license.device_name);
    }
  }, [license]);

  const handleSaveName = async (newName: string) => {
    if (!newName.trim() || newName === license?.device_name) return;
    setIsSavingName(true);
    try {
      await LicenseService.updateDeviceName(newName.trim());
    } catch (e) {
      console.error("Erro ao salvar nome:", e);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleActivate = async () => {
    if (!inputKey.trim()) return;
    setActivating(true);
    try {
      await LicenseService.saveKey(inputKey.trim());
      await loadLicense(true);
      setInputKey("");
    } catch (e) {
      alert("Falha ao ativar.");
    } finally {
      setActivating(false);
    }
  };

  const renderItem = (label: string, value: string, sub: string, icon: React.ReactNode, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--color-surface)', borderRadius: '12px', border: '1px solid var(--color-border)', flex: '1' }}>
      <div style={{ padding: '8px', background: `${color}15`, color: color, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '9px', color: 'var(--color-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text)' }}>{value}</span>
        <span style={{ fontSize: '9px', color: 'var(--color-muted)' }}>{sub}</span>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ padding: '24px' }}>
      <Skeleton className="h-40 w-full mb-4" />
      <Skeleton className="h-10 w-full mb-2" />
      <Skeleton className="h-10 w-full" />
    </div>
  );

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
      <div style={{
        background: 'var(--color-page)',
        width: '92%',
        maxWidth: '330px',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-soft)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
        color: 'var(--color-text)',
        fontFamily: 'Inter, sans-serif'
      }}>

        {/* Header Profissional Compacto */}
        <div style={{ background: 'linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-strong) 100%)', padding: '12px 16px', borderRadius: '0 0 16px 16px', color: 'white', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.1 }}>
            <ShieldCheck size={100} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '-0.5px' }}>Painel do Usuário</h2>
              <p style={{ margin: 0, fontSize: '11px', opacity: 0.8 }}>Gestão de Licenciamento SIGESS</p>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '6px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus style={{ transform: 'rotate(45deg)' }} size={18} />
            </button>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', padding: '8px 12px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={14} />
            <span style={{ fontSize: '10px', fontWeight: '700' }}>DISPOSITIVO VINCULADO</span>
          </div>
        </div>

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '310px', overflowY: 'auto' }}>
          {license && license.ok ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Status Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {renderItem("Expira em", (license.expires_at || license.valid_until) ? new Date(license.expires_at || license.valid_until || "").toLocaleDateString() : "Sem expiração", "Expiração da chave", <Calendar size={18} />, "#3b82f6")}
                {renderItem("Máquinas", `${license.devices}/${license.max_devices}`, "Limite de acessos", <Monitor size={18} />, "#10b981")}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {renderItem("Status", "VERIFICADO", "Licença autêntica", <ShieldCheck size={18} />, "#f59e0b")}
                {renderItem("Referência", license.plan === 'paid' ? "PRO-ACTIVE" : "TRIAL-MODE", "Tipo de registro", <CreditCard size={18} />, "#8b5cf6")}
              </div>

              {/* Segmented Usage Bars */}
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ margin: 0, fontSize: '10px', fontWeight: '800', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Consumo de Automações</p>

                <UsageBucket
                  label="REAP 2025 (Manual)"
                  icon={<MousePointer2 />}
                  current={license.usage_manual ?? 0}
                  max={license.max_manual ?? 5}
                  color="#0f766e"
                  bgColor="rgba(15, 118, 110, 0.1)"
                />

                <UsageBucket
                  label="REAP 2025 (Turbo)"
                  icon={<Zap />}
                  current={license.usage_turbo ?? 0}
                  max={license.max_turbo ?? 3}
                  color="#8b5cf6"
                  bgColor="rgba(139, 92, 246, 0.1)"
                />

                <UsageBucket
                  label="REAP Simplificado"
                  icon={<Activity />}
                  current={license.usage_agro ?? 0}
                  max={license.max_agro ?? 10}
                  color="#f97316"
                  bgColor="rgba(249, 115, 22, 0.1)"
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--color-success-bg)', borderRadius: '12px', border: '1px solid #c6e7db' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={14} color="var(--color-success)" />
                    <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-success-text)' }}>Consultas e eSocial</span>
                  </div>
                  <span style={{ padding: '2px 8px', background: 'var(--color-success)', color: 'white', fontSize: '9px', fontWeight: '800', borderRadius: '8px' }}>
                    LIVRE
                  </span>
                </div>
              </div>

              <button
                onClick={() => loadLicense(true)}
                disabled={refreshing}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: '12px', cursor: refreshing ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600', color: 'var(--color-text)',
                  transition: 'all 0.2s', marginTop: '8px'
                }}
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                {refreshing ? "Atualizando..." : "Sincronizar Dados"}
              </button>
            </div>
          ) : (
            /* Formulário de Ativação */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: '12px', lineHeight: '1.5' }}>
                Insira sua chave de licença abaixo para ativar todos os recursos premium do SIGESS.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Nome deste PC (ex: Escritório)"
                    value={deviceName}
                    onChange={e => setDeviceName(e.target.value)}
                    onBlur={() => handleSaveName(deviceName)}
                    style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '12px', border: '2px solid var(--color-border)', fontSize: '13px', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box', outline: 'none' }}
                  />
                  <Monitor size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                  {isSavingName && <RefreshCw size={12} className="animate-spin" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-accent)', animation: 'spin 1s linear infinite' }} />}
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                    value={inputKey}
                    onChange={e => setInputKey(e.target.value)}
                    style={{ width: '100%', padding: '14px 14px 14px 40px', borderRadius: '12px', border: '2px solid var(--color-border)', fontSize: '13px', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box', outline: 'none' }}
                  />
                  <Key size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                </div>
              </div>
              <button
                onClick={handleActivate}
                disabled={activating || !inputKey.trim()}
                className="btn btn-primary"
                style={{ width: '100%', padding: '14px' }}
              >
                {activating ? "Ativando..." : "Ativar Licença Agora"}
              </button>
              <a href="https://wa.me/5591993193461" target="_blank" rel="noreferrer" style={{ textAlign: 'center', fontSize: '11px', color: 'var(--color-accent)', fontWeight: '700', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                Adquirir chave de acesso <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', padding: '8px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-alt)' }}>
          <p style={{ margin: 0, fontSize: '10px', color: 'var(--color-muted)', fontWeight: '600' }}>v{browser.runtime.getManifest().version}</p>
        </div>
      </div>
      <style>{`
        @keyframes spin { from {transform:rotate(0deg);} to {transform:rotate(360deg);} }
      `}</style>
    </div>
  );
};
