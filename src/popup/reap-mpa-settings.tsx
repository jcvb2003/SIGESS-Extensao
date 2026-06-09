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
        setStatus(defesoNotice || "Salvo");
      } catch (error: any) {
        setStatus(`Erro: ${error?.message || "desconhecido"}`);
      } finally {
        setSaving(false);
      }
    },
    [settings],
  );

  if (!settings) {
    return (
      <div className="page-shell">
        <div className="page-header-wrap">
          <div className="page-header">
            <div className="page-header-left">
              <span className="page-eyebrow">SIGESS</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header-wrap">
        <header className="page-header">
          <div className="page-header-left">
            <span className="page-eyebrow">SIGESS</span>
            <span className="page-header-title">REAP MPA — Configurações</span>
          </div>
          <div className="page-header-right">
            {status && (
              <div className={`status-pill ${saving ? "saving" : "saved"}`}>
                <div className={`status-dot ${saving ? "saving" : "saved"}`} />
                {status}
              </div>
            )}
            <button type="button" className="back-link" onClick={() => window.close()}>
              Fechar
            </button>
          </div>
        </header>
      </div>

      <div className="page-card">
        <div className="page-content-inner">
          <ReapMpaSettingsForm
            settings={settings}
            onUpdate={updateSettings}
            onOpenFilePicker={() => browser.tabs.create({ url: browser.runtime.getURL("file_picker.html") })}
          />
        </div>
      </div>
    </div>
  );
};

createRoot(document.getElementById("root")!).render(<ReapMpaSettingsPage />);
