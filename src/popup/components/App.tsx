import React, { useState, useEffect } from "react";
import { UserCredentials } from "../../shared/types";
import ESocialPanel from "./panels/ESocialPanel";
import { LoginSection } from "./panels/LoginSection";

import ReapMpaPanel from "./panels/ReapMpaPanel";
import AutoRegistrationPanel from "./panels/AutoRegistrationPanel";
import SDPAPanel from "./panels/SDPAPanel";
import BatchLoginModal from "./ui/BatchLoginModal";
import { LicenseInfo } from "./ui/LicenseInfo";
import { Skeleton, SkeletonBadge, SkeletonCard } from "./ui/Skeleton";
import { ToastProvider, useToast } from "./ui/Toast";
import { ActivationScreen, getLicenseErrorMessage } from "./ui/ActivationScreen";
import { ChevronIcon } from "./ui/icons";
import { useLicense } from "../hooks/useLicense";
import { useSettings } from "../hooks/useSettings";
import { ShieldCheck, Info, UserPlus } from "lucide-react";
import { UpdateAvailableInfo } from "../../shared/services/update-block";

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

const UpdateBlockScreen: React.FC<{ info: UpdateAvailableInfo }> = ({ info }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      minHeight: "260px",
      padding: "18px",
      background: "linear-gradient(180deg, #fff 0%, #fff8f8 100%)",
    }}
  >
    <div
      style={{
        border: "1px solid rgba(248, 113, 113, 0.2)",
        borderRadius: "18px",
        background: "#ffffff",
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
        padding: "18px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          padding: "6px 12px",
          borderRadius: "999px",
          background: "#fff1f2",
          color: "#be123c",
          fontSize: "10px",
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Atualização obrigatória
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h2
          style={{
            margin: 0,
            fontSize: "20px",
            fontWeight: 900,
            color: "#881337",
            lineHeight: 1.15,
          }}
        >
          Nova versão disponível
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "#475569",
            lineHeight: 1.55,
          }}
        >
          Atualize a extensão para continuar usando as funções do SIGESS.
        </p>
      </div>

      {info.version && (
        <div
          style={{
            borderRadius: "14px",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            background: "#f8fafc",
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#64748b",
              marginBottom: "4px",
            }}
          >
            Versão disponível
          </div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
            v{info.version}
          </div>
        </div>
      )}

      <a
        href="https://github.com/jcvb2003/SIGESS-Extensao/releases/latest/download/sigess.xpi"
        target="_blank"
        rel="noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "44px",
          padding: "0 18px",
          borderRadius: "12px",
          background: "linear-gradient(135deg, #dc2626 0%, #be123c 100%)",
          color: "#fff",
          textDecoration: "none",
          fontSize: "13px",
          fontWeight: 800,
          boxShadow: "0 10px 24px rgba(190, 24, 93, 0.22)",
        }}
      >
        Atualizar extensão
      </a>
    </div>
  </div>
);

const AppContent: React.FC = () => {
  const updateInfo = useUpdateAvailable();
  const [loading, setLoading] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState<
    "pesqbrasil" | "esocial" | null
  >(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [openSections, setOpenSections] = useState({
    login: false,
    autoRegistration: false,
    esocial: false,
    reapMpa: false,
    sdpa: false,
  });

  const { license, loading: licenseLoading, activating, activate } = useLicense();
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

  const handleMultiLoginBatch = async (type: "pesqbrasil" | "esocial") => {
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
        esocial: false,
        reapMpa: false,
        sdpa: false,
      };
      newState[key] = nextOpen;
      return newState;
    });
  };

  if (updateInfo) {
    return <UpdateBlockScreen info={updateInfo} />;
  }

  if (licenseLoading || settingsLoading) {
    return <LoadingState />;
  }

  if (!license?.ok) {
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
            aria-expanded={openSections.autoRegistration}
            onClick={() => toggleSection("autoRegistration")}
          >
            <div className="section-header">
              <h2 className="section-title">Cadastro Automático</h2>
              <p className="section-description">
                Coleta de dados de sites governamentais
              </p>
            </div>
            <UserPlus
              size={18}
              className={`accordion-icon ${openSections.autoRegistration ? "open" : ""}`}
            />
          </button>
          <div
            className={`accordion-content ${openSections.autoRegistration ? "open" : "collapsed"
              }`}
          >
            <div className="section-content">
              <AutoRegistrationPanel settings={settings} onUpdate={updateSettings} />
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
            className={`accordion-content ${openSections.esocial ? "open" : "collapsed"
              }`}
          >
            <div className="section-content">
              <ESocialPanel settings={settings} onUpdate={updateSettings} />
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
            <ShieldCheck
              size={18}
              className={`accordion-icon ${openSections.sdpa ? "open" : ""}`}
            />
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
              license?.plan === "paid"
                ? "none"
                : "1px solid var(--color-border-strong)",
            background:
              license?.plan === "paid"
                ? "linear-gradient(135deg, #0f766e 0%, #0b5f59 100%)"
                : "var(--color-surface-alt)",
            color: license?.plan === "paid" ? "white" : "var(--color-muted)",
            boxShadow:
              license?.plan === "paid"
                ? "0 4px 15px rgba(15, 118, 110, 0.25)"
                : "0 4px 12px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            {license?.plan === "paid" ? <ShieldCheck size={14} /> : <Info size={14} />}
          </div>
          <span>{license?.plan === "paid" ? "Licença Ativa : PRO" : "Licença : Teste"}</span>
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
