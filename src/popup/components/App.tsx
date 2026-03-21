import React, { useState } from "react";
import { UserCredentials } from "../../shared/types";
import ConfigPanel from "./ConfigPanel";
import BatchLoginModal from "./BatchLoginModal";
import ReapPanel from "./ReapPanel";
import LicenseInfo from "./LicenseInfo";
import { ToastProvider, useToast } from "./Toast";
import { Skeleton, SkeletonBadge, SkeletonCard } from "./Skeleton";
import { useLicense } from "../hooks/useLicense";
import { useSettings } from "../hooks/useSettings";

const AppContent: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState<
    "pesqbrasil" | "esocial" | null
  >(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [openSections, setOpenSections] = useState({
    login: false,
    esocial: false,
    reap: false,
  });
  const [activationKey, setActivationKey] = useState("");

  const { license, loading: licenseLoading, activating, activate } = useLicense();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { showToast } = useToast();

  const onHandleActivate = async () => {
    if (!activationKey.trim()) return;
    const result = await activate(activationKey.trim());
    if (!result.ok) {
      showToast(getLicenseErrorMessage(result.reason), "error");
    } else {
      showToast("Licença ativada com sucesso!", "success");
      setActivationKey("");
    }
  };

  const handleBatchLogin = async (credentials: UserCredentials[]) => {
    if (!showBatchModal) return;
    setLoading(true);
    try {
      await browser.runtime.sendMessage({
        action: "startBatchLogin",
        type: showBatchModal,
        credentials,
      });
    } catch (e) {
      console.error(e);
      showToast("Erro ao iniciar login em lote", "error");
    } finally {
      setLoading(false);
      setShowBatchModal(null);
    }
  };

  const toggleSection = (key: "login" | "esocial" | "reap") => {
    setOpenSections((prev) => {
      const nextOpen = !prev[key];
      return {
        login: false,
        esocial: false,
        reap: false,
        [key]: nextOpen,
      };
    });
  };

  if (licenseLoading || settingsLoading) {
    return <LoadingState />;
  }

  if (!license || !license.ok) {
    return (
      <div className="container activation-screen">
        <header className="header">
          <div className="header-content">
            <img src="../../icon.png" alt="SIGESS" className="logo" />
            <h1 className="title">SIGESS</h1>
          </div>
        </header>
        <main className="main-content activation-main">
          <div className="activation-card">
            <div className="icon-lock">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h2>Ativação Necessária</h2>
            <p>Insira sua chave de acesso para começar a usar a extensão.</p>

            <div className="form-group">
              <input
                type="text"
                className="input-key"
                placeholder="SINP-XXXX-XXXX"
                value={activationKey}
                onChange={(e) => setActivationKey(e.target.value)}
                disabled={activating}
              />
              <button
                className="btn btn-primary btn-activate"
                onClick={onHandleActivate}
                disabled={activating || !activationKey}
              >
                {activating ? "Ativando..." : "Ativar Agora"}
              </button>
            </div>

            {license?.reason && license.reason !== "no_key" && (
              <div className="error-message">
                {getLicenseErrorMessage(license.reason)}
              </div>
            )}

            <div className="support-section">
              <p>Não tem uma chave? Entre em contato:</p>
              <a
                href="https://wa.me/5591993193461"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-whatsapp"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp: (91) 99319-3461
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <div className="header-content">
          <img src="../../icon.png" alt="SIGESS" className="logo" />
          <h1 className="title">SIGESS</h1>
        </div>
      </header>

      <main className="main-content">
        <section className="section accordion">
          <button
            type="button"
            className="accordion-header"
            aria-expanded={openSections.login}
            onClick={() => toggleSection("login")}
          >
            <div className="section-header">
              <h2 className="section-title">Login Múltiplo</h2>
              <p className="section-description">
                Execute múltiplos logins no PesqBrasil ou eSocial
              </p>
            </div>
            <ChevronIcon isOpen={openSections.login} />
          </button>
          <div
            className={`accordion-content ${
              openSections.login ? "open" : "collapsed"
            }`}
          >
            <div className="section-content">
              <div className="button-group">
                <button
                  className="btn btn-primary"
                  onClick={() => setShowBatchModal("pesqbrasil")}
                  disabled={loading}
                >
                  <GlobeIcon />
                  <span className="btn-text">PesqBrasil</span>
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowBatchModal("esocial")}
                  disabled={loading}
                >
                  <ClipboardIcon />
                  <span className="btn-text">eSocial</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="section accordion">
          <button
            type="button"
            className="accordion-header"
            aria-expanded={openSections.esocial}
            onClick={() => toggleSection("esocial")}
          >
            <div className="section-header">
              <h2 className="section-title">eSocial</h2>
              <p className="section-description">
                Configurações de automação para o eSocial
              </p>
            </div>
            <ChevronIcon isOpen={openSections.esocial} />
          </button>
          <div
            className={`accordion-content ${
              openSections.esocial ? "open" : "collapsed"
            }`}
          >
            <div className="section-content">
              <ConfigPanel settings={settings} onUpdate={updateSettings} />
            </div>
          </div>
        </section>

        <ReapPanel
          settings={settings}
          onUpdate={(reapData) => updateSettings({ reapData })}
          isOpen={openSections.reap}
          onToggle={() => toggleSection("reap")}
        />
      </main>

      <footer className="popup-footer">
        <button
          className="license-badge-footer"
          onClick={() => setShowLicenseModal(true)}
          title="Clique para ver detalhes da licença"
        >
          {license.plan === "trial" ? (
            <span className="badge badge-trial">
              Trial: {license.usage_count}/{license.max_usage}
            </span>
          ) : (
            <span className="badge badge-paid">Pro</span>
          )}
        </button>
      </footer>

      {showBatchModal && (
        <BatchLoginModal
          type={showBatchModal}
          onConfirm={handleBatchLogin}
          onCancel={() => setShowBatchModal(null)}
        />
      )}

      {showLicenseModal && (
        <LicenseInfo onClose={() => setShowLicenseModal(false)} />
      )}
    </div>
  );
};

const LoadingState: React.FC = () => (
  <div className="container">
    <header className="header">
      <div className="header-content">
        <Skeleton width={32} height={32} borderRadius="8px" />
        <Skeleton width={80} height={20} />
      </div>
    </header>
    <main className="main-content">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </main>
    <footer className="popup-footer">
      <SkeletonBadge />
    </footer>
  </div>
);

const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`accordion-icon ${isOpen ? "open" : ""}`}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const GlobeIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const ClipboardIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
  </svg>
);

function getLicenseErrorMessage(reason?: string): string {
  switch (reason) {
    case "trial_expired": return "Trial Expirado";
    case "expired": return "Licença Expirada";
    case "wrong_device": return "Vinculada a outro dispositivo";
    case "invalid_key": return "Chave Inválida";
    default: return "Erro na ativação";
  }
}

const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};

export default App;
