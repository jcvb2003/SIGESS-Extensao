import React, { useState, useEffect } from "react";
import { UserCredentials } from "../../shared/types";
import { LoginSection } from "./panels/LoginSection";

import ReapMpaPanel from "./panels/ReapMpaPanel";
import AutoRegistrationPanel from "./panels/AutoRegistrationSettingsPanel";
import StaticCachePanel from "./panels/StaticCachePanel";
import SDPAPanel from "./panels/SDPAPanel";
import BatchLoginModal from "./ui/BatchLoginModal";
import { LicenseInfo } from "./ui/LicenseInfo";
import { Skeleton, SkeletonBadge, SkeletonCard } from "./ui/Skeleton";
import { ToastProvider, useToast } from "./ui/Toast";
import { ActivationScreen, getLicenseErrorMessage } from "./ui/ActivationScreen";
import { ExpandIcon } from "./ui/icons";
import { useLicense } from "../hooks/useLicense";
import { useSettings } from "../hooks/useSettings";
import { ShieldCheck, Info } from "lucide-react";
import {
  UpdateAvailableInfo,
  XPI_INSTALL_URL,
} from "../../shared/services/update-block";

function useUpdateAvailable(): UpdateAvailableInfo | null {
  const [info, setInfo] = useState<UpdateAvailableInfo | null>(null);

  useEffect(() => {
    const storage =
      (globalThis as any).browser?.storage?.local ??
      (globalThis as any).chrome?.storage?.local;
    if (!storage) return;

    storage.get("updateAvailable").then((result: Record<string, unknown>) => {
      setInfo((result?.updateAvailable as UpdateAvailableInfo) || null);
    });

    const onChange = (changes: Record<string, { newValue?: unknown }>) => {
      if (!changes.updateAvailable) return;
      setInfo((changes.updateAvailable.newValue as UpdateAvailableInfo) || null);
    };
    storage.onChanged?.addListener?.(onChange);
    return () => storage.onChanged?.removeListener?.(onChange);
  }, []);

  return info;
}

interface UpdateBlockScreenProps {
  info: UpdateAvailableInfo;
  onUpdate?: React.MouseEventHandler<HTMLAnchorElement>;
}

export const UpdateBlockScreen: React.FC<UpdateBlockScreenProps> = ({
  info,
  onUpdate,
}) => (
  <main className="update-block-screen">
    <header className="update-block-header">
      <img src="../../icon.png" alt="" />
      <span>SIGESS</span>
    </header>

    <section className="update-block-notice" aria-labelledby="update-block-title">
      <p className="update-block-label">Atualização necessária</p>
      <h2 id="update-block-title">Uma nova versão do SIGESS está disponível</h2>
      <p className="update-block-description">
        Para continuar utilizando a extensão, instale a atualização disponível.
      </p>
    </section>

    <footer className="update-block-footer">
      {info.version && (
        <dl className="update-block-version">
          <dt>Versão disponível</dt>
          <dd>v{info.version}</dd>
        </dl>
      )}

      <a
        href={XPI_INSTALL_URL}
        className="update-block-action"
        onClick={onUpdate}
      >
        Atualizar extensão
      </a>
    </footer>
  </main>
);

const AppContent: React.FC = () => {
  const updateInfo = useUpdateAvailable();
  const [loading, setLoading] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState<
    "mte" | "pesqbrasil_mpa" | "esocial" | "inss" | null
  >(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [openSections, setOpenSections] = useState({
    login: false,
    autoRegistration: false,
    reapMpa: false,
    sdpa: false,
  });

  const {
    license,
    loading: licenseLoading,
    activating,
    verified: licenseVerified,
    activate,
  } = useLicense();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { showToast } = useToast();

  const handleActivate = async (key: string, deviceName: string) => {
    if (!key.trim()) return;
    const result = await activate(key.trim(), deviceName.trim());
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
      if (typeof browser !== "undefined" && browser.runtime) {
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

  const handleMultiLoginBatch = async (type: "mte" | "pesqbrasil_mpa" | "esocial" | "inss") => {
    const queue = settings.multiLoginQueue || [];
    const itemsToOpen = queue.filter((item) => item.type === type);

    if (itemsToOpen.length === 0) {
      showToast(`Nenhum login do ${type} na fila.`, "info");
      return;
    }

    setLoading(true);
    try {
      if (typeof browser !== "undefined" && browser.runtime) {
        await browser.runtime.sendMessage({
          action: "startBatchLogin",
          type,
          credentials: itemsToOpen,
        });

        const remaining = queue.filter((item) => item.type !== type);
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
        autoRegistration: false,
        reapMpa: false,
        sdpa: false,
      };
      newState[key] = nextOpen;
      return newState;
    });
  };

  const handleUpdateClick: React.MouseEventHandler<HTMLAnchorElement> = (
    event,
  ) => {
    event.preventDefault();

    void browser.runtime
      .sendMessage({ action: "openExtensionUpdate" })
      .catch((error: unknown) => {
        console.error("Falha ao abrir a atualização da extensão:", error);
      });

    window.close();
  };

  if (updateInfo) {
    return (
      <UpdateBlockScreen
        info={updateInfo}
        onUpdate={handleUpdateClick}
      />
    );
  }

  if (licenseLoading || settingsLoading) {
    return <LoadingState />;
  }

  // Sem cache valido, aguarda a resposta do background antes de liberar a interface.
  // Isso evita exibir o painel autenticado por um instante apos uma desvinculacao.
  if (!license?.ok && !licenseVerified) {
    return <LoadingState />;
  }

  const shouldShowActivation =
    !license?.ok && (license?.reason === "no_key" || licenseVerified);

  if (shouldShowActivation) {
    return (
      <ActivationScreen
        license={license}
        activating={activating}
        onActivate={handleActivate}
      />
    );
  }

  const isPaidLicense = license?.plan === "paid";

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
            aria-expanded={openSections.autoRegistration}
            onClick={() => toggleSection("autoRegistration")}
          >
            <div className="section-header">
              <h2 className="section-title">Cadastro Automático</h2>
              <p className="section-description">
                Coleta de dados de sites governamentais
              </p>
            </div>
            <ExpandIcon isOpen={openSections.autoRegistration} />
          </button>
          <div
            className={`accordion-content ${openSections.autoRegistration ? "open" : "collapsed"
              }`}
          >
            <div className="section-content">
              <AutoRegistrationPanel
                settings={settings}
                onUpdate={updateSettings}
              />
            </div>
          </div>
        </section>

        <section className="section accordion filter-amber">
          <button
            type="button"
            className="accordion-header"
            aria-expanded={openSections.sdpa}
            onClick={() => toggleSection("sdpa")}
          >
            <div className="section-header">
              <h2 className="section-title">Solicitação SDPA</h2>
              <p className="section-description">
                Automação para o portal de Seguro-Desemprego
              </p>
            </div>
            <ExpandIcon isOpen={openSections.sdpa} />
          </button>
          <div
            className={`accordion-content ${openSections.sdpa ? "open" : "collapsed"
              }`}
          >
            <div className="section-content">
              <SDPAPanel settings={settings} onUpdate={updateSettings} />
            </div>
          </div>
        </section>

        <ReapMpaPanel
          settings={settings}
          onUpdate={updateSettings}
          isOpen={openSections.reapMpa}
          onToggle={() => toggleSection("reapMpa")}
        />
        <StaticCachePanel settings={settings} onUpdate={updateSettings} />
      </main>

      <footer
        style={{
          padding: "12px 16px",
          background: "rgba(255, 255, 255, 0.7)",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "sticky",
          bottom: 0,
          zIndex: 100,
          width: "100%",
        }}
      >
        <button
          onClick={() => setShowLicenseModal(true)}
          title="Ver detalhes da licença"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            borderRadius: "20px",
            fontSize: "10px",
            fontWeight: "800",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            border:
              isPaidLicense
                ? "none"
                : "1px solid var(--color-border-strong)",
            background:
              isPaidLicense
                ? "linear-gradient(135deg, #0f766e 0%, #0b5f59 100%)"
                : "var(--color-surface-alt)",
            color: isPaidLicense ? "white" : "var(--color-muted)",
            boxShadow:
              isPaidLicense
                ? "0 4px 15px rgba(15, 118, 110, 0.25)"
                : "0 4px 12px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isPaidLicense ? <ShieldCheck size={14} /> : <Info size={14} />}
          </div>
          <span>Licença ativa</span>
        </button>
      </footer>

      {showBatchModal && (
        <BatchLoginModal
          type={showBatchModal}
          onConfirm={handleBatchLogin}
          onCancel={() => setShowBatchModal(null)}
        />
      )}

      {showLicenseModal && <LicenseInfo onClose={() => setShowLicenseModal(false)} />}
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
