import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ReapMpaSettingsForm from "./components/panels/ReapMpaSettingsForm";
import { StorageService } from "../background/services/storage";
import { getDefesoMonthsNormalizationNotice, normalizeReapSettings } from "../modules/reap-mpa/reap-settings";
import { AppSettings } from "../shared/types";

const ReapMpaSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    StorageService.getSettings().then((current) => {
      const notice = getDefesoMonthsNormalizationNotice(current.mpaDefesoMonths);
      setSettings(normalizeReapSettings(current));
      if (notice) setStatus(notice);
    });
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!settings) return;
      const defesoNotice =
        Object.prototype.hasOwnProperty.call(patch, "mpaDefesoMonths")
          ? getDefesoMonthsNormalizationNotice(patch.mpaDefesoMonths)
          : null;
      const next = normalizeReapSettings({ ...settings, ...patch });
      setSettings(next);
      setSaving(true);
      setStatus(defesoNotice || "Salvando...");
      try {
        await browser.runtime.sendMessage({
          action: "updateESocialSettings",
          settings: next,
        });
        setStatus(defesoNotice || "Configuracoes salvas.");
      } catch (error: any) {
        setStatus(`Erro ao salvar: ${error?.message || "desconhecido"}`);
      } finally {
        setSaving(false);
      }
    },
    [settings],
  );

  if (!settings) {
    return <div className="page-shell"><div className="page-card">Carregando...</div></div>;
  }

  return (
    <div className="page-shell">
      <div className="page-card">
        <header className="page-header">
          <div>
            <div className="page-eyebrow">SIGESS</div>
            <h1>Configurações do REAP MPA</h1>
          </div>
          <button type="button" className="back-link" onClick={() => window.close()}>
            Fechar
          </button>
        </header>

        <div className="status-row">
          {status ? (
            <span className={`status-pill ${saving ? "saving" : "saved"}`}>
              {status}
            </span>
          ) : null}
        </div>

        <ReapMpaSettingsForm
          settings={settings}
          onUpdate={updateSettings}
          onOpenFilePicker={() => browser.tabs.create({ url: browser.runtime.getURL("file_picker.html") })}
        />
      </div>
    </div>
  );
};

createRoot(document.getElementById("root")!).render(<ReapMpaSettingsPage />);
