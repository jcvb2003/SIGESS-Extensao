import React, { useState, useEffect } from "react";
import { LicenseService, LicenseResult } from "../../shared/services/license";
import { Skeleton } from "./Skeleton";

interface LicenseInfoProps {
  onClose: () => void;
}

const LicenseInfo: React.FC<LicenseInfoProps> = ({ onClose }) => {
  const [license, setLicense] = useState<LicenseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    loadLicense();
  }, []);

  const loadLicense = async (forceLive = false, forceConsume = false) => {
    setLoading(true);
    const result = await LicenseService.checkLicense(forceLive, forceConsume);
    setLicense(result);
    setLastRefresh(new Date());
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLicense(true, false);
    setRefreshing(false);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = () => {
    if (!license) return null;
    return license.ok ? (
      <span className="status-badge status-active">Vinculado</span>
    ) : (
      <span className="status-badge status-inactive">Não Vinculado</span>
    );
  };

  const getPlanBadge = () => {
    if (!license) return null;
    return license.plan === "trial" ? (
      <span className="plan-badge plan-trial">Trial</span>
    ) : (
      <span className="plan-badge plan-paid">Pro</span>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="license-loading">
          <Skeleton height={20} width="40%" />
          <Skeleton height={14} width="100%" />
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="60%" />
          <Skeleton height={14} width="70%" />
        </div>
      );
    }

    if (!license) {
      return <div className="error-state">Erro ao carregar informações</div>;
    }

    return (
      <>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Plano</span>
            <span className="info-value">{getPlanBadge()}</span>
          </div>

          {license.plan === "trial" && (
            <div className="info-item">
              <span className="info-label">Usos Disponíveis</span>
              <span className="info-value usage-count">
                {license.usage_count ?? 0} / {license.max_usage ?? 0}
              </span>
            </div>
          )}

          <div className="info-item">
            <span className="info-label">Validade</span>
            <span className="info-value">{formatDate(license.expires_at)}</span>
          </div>

          <div className="info-item">
            <span className="info-label">Dispositivo</span>
            <span className="info-value">{getStatusBadge()}</span>
          </div>

          <div className="info-item">
            <span className="info-label">Dispositivos</span>
            <span className="info-value">
              <span className={(license.devices ?? 0) >= (license.max_devices ?? 1) ? 'status-warning' : ''}>
                {license.devices ?? 1} / {license.max_devices ?? 2}
              </span>
            </span>
          </div>

          <div className="info-item">
            <span className="info-label">Última Verificação</span>
            <span className="info-value">
              {lastRefresh
                ? lastRefresh.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "N/A"}
            </span>
          </div>
        </div>

        {license.reason && !license.ok && (
          <div className="error-message">
            <span className="error-icon">⚠</span>
            <span className="error-text">
              {getReasonMessage(license.reason)}
            </span>
          </div>
        )}

        {(license.reason === "wrong_device" || (license.ok && (license.devices ?? 0) >= (license.max_devices ?? 1))) && (
          <div className="support-section-info">
            <p>Atingiu o limite de dispositivos ou este PC é novo?</p>
            <a 
              href="https://wa.me/5591993193461" 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn-whatsapp-small"
            >
              Solicitar Liberação no WhatsApp
            </a>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="modal-container-fixed">
      <button 
        className="modal-overlay" 
        onClick={onClose}
        aria-label="Fechar modal"
        type="button"
      />
      <dialog 
        className="license-modal" 
        open
        aria-labelledby="modal-title"
      >
        <header className="license-modal-header">
          <div className="header-brand">
            <img src="../../icon.png" alt="SIGESS" className="brand-logo" />
            <h1 id="modal-title" className="brand-title">Informações da Licença</h1>
          </div>
          <button 
            className="btn-close" 
            onClick={onClose} 
            title="Fechar"
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <main className="license-modal-content">
          {renderContent()}
        </main>

        <footer className="license-modal-footer">
          <button 
            className={`btn-refresh ${refreshing ? "loading" : ""}`} 
            onClick={handleRefresh}
            disabled={loading || refreshing}
            type="button"
          >
            {refreshing ? "Atualizando..." : "Atualizar Agora"}
          </button>
          <span className="last-refresh">
            V. {browser.runtime.getManifest().version}
          </span>
        </footer>
      </dialog>
    </div>
  );
};

function getReasonMessage(reason: string): string {
  const messages: Record<string, string> = {
    invalid_key: "Chave de licença inválida",
    wrong_device: "Licença vinculada a outro dispositivo",
    trial_expired: "Período trial expirado",
    expired: "Licença expirada",
    blocked: "Licença bloqueada",
    no_key: "Nenhuma chave de licença cadastrada",
    network_error: "Erro de conexão com servidor",
    database_error: "Erro no banco de dados",
    unauthorized_access: "Acesso não autorizado",
    missing_parameters: "Parâmetros ausentes",
    internal_error: "Erro interno do servidor",
  };
  return messages[reason] || `Erro: ${reason}`;
}

export default LicenseInfo;
