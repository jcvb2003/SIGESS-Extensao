import React, { useState } from "react";
import { UserCredentials } from "../../shared/types";
import ESocialPanel from "./panels/ESocialPanel";
import { LoginSection } from "./panels/LoginSection";
import ReapAgroPanel from "./panels/ReapAgroPanel";
import ReapMpaPanel from "./panels/ReapMpaPanel";
import BatchLoginModal from "./ui/BatchLoginModal";
import { LicenseInfo } from "./ui/LicenseInfo";
import { Skeleton, SkeletonBadge, SkeletonCard } from "./ui/Skeleton";
import { ToastProvider, useToast } from "./ui/Toast";
import { ActivationScreen, getLicenseErrorMessage } from "./ui/ActivationScreen";
import { ChevronIcon } from "./ui/icons";
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
    reapAgro: false,
    reapMpa: false,
  });

  const { license, loading: licenseLoading, activating, activate } = useLicense();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { showToast } = useToast();

  const handleActivate = async (key: string) => {
    if (!key.trim()) return;
    const result = await activate(key.trim());
    if (result.ok) {
      showToast("Licença ativada com sucesso!", "success");
    } else {
      showToast(getLicenseErrorMessage(result.reason), "error");
    }
  };

  const handleBatchLogin = async (credentials: UserCredentials[]) => {
    if (!showBatchModal) return;
    setLoading(true);
    try {
      if (typeof browser !== 'undefined' && browser.runtime) {
         await browser.runtime.sendMessage({
           action: "startBatchLogin",
           type: showBatchModal,
           credentials,
         });
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao iniciar login em lote", "error");
    } finally {
      setLoading(false);
      setShowBatchModal(null);
    }
  };

  const handleMultiLoginBatch = async (type: "pesqbrasil" | "esocial") => {
    const queue = settings.multiLoginQueue || [];
    const itemsToOpen = queue.filter(item => item.type === type);
    
    if (itemsToOpen.length === 0) {
      showToast(`Nenhum login do ${type} na fila.`, "info");
      return;
    }

    setLoading(true);
    try {
      if (typeof browser !== 'undefined' && browser.runtime) {
         // Abre em lote
         await browser.runtime.sendMessage({
           action: "startBatchLogin",
           type,
           credentials: itemsToOpen,
         });

         // Limpa APENAS os itens abertos da fila
         const remaining = queue.filter(item => item.type !== type);
         await updateSettings({ multiLoginQueue: remaining });
         showToast(`${itemsToOpen.length} abas abertas.`, "success");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao iniciar lote de login múltiplo", "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => {
      const nextOpen = !prev[key];
      const newState = {
        login: false,
        esocial: false,
        reapAgro: false,
        reapMpa: false,
      };
      newState[key] = nextOpen;
      return newState;
    });
  };

  if (licenseLoading || settingsLoading) {
    return <LoadingState />;
  }

  if (!(license?.ok)) {
    return (
      <ActivationScreen 
         license={license} 
         activating={activating} 
         onActivate={handleActivate} 
      />
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
        <LoginSection 
           isOpen={openSections.login} 
           onToggle={() => toggleSection("login")}
           loading={loading}
           settings={settings}
           onUpdate={updateSettings}
           onShowModal={(type) => setShowBatchModal(type)}
           onOpenBatch={handleMultiLoginBatch}
        />

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
              <ESocialPanel settings={settings} onUpdate={updateSettings} />
            </div>
          </div>
        </section>

        <ReapAgroPanel
          settings={settings}
          onUpdate={updateSettings}
          isOpen={openSections.reapAgro}
          onToggle={() => toggleSection("reapAgro")}
        />

        <ReapMpaPanel
          settings={settings}
          onUpdate={updateSettings}
          isOpen={openSections.reapMpa}
          onToggle={() => toggleSection("reapMpa")}
        />
      </main>

      <footer className="popup-footer">
        <button
          className="license-badge-footer"
          onClick={() => setShowLicenseModal(true)}
          title="Clique para ver detalhes da licença"
        >
          {license?.plan === "trial" ? (
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

const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};

export default App;
