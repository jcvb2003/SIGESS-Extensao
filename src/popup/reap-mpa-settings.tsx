import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, Upload } from "lucide-react";
import ReapMpaSettingsForm from "./components/panels/ReapMpaSettingsForm";
import { StorageService } from "../background/services/storage";
import { getDefesoMonthsNormalizationNotice, normalizeReapSettings } from "../modules/reap-mpa/reap-settings";
import { copyReapPdfCache, getReapPdfCacheForPreset, removeReapPdfCacheForPreset, REAP_PDF_CACHES_STORAGE_KEY } from "../modules/reap-mpa/pdf-cache";
import { checkPresetReadiness } from "../modules/reap-mpa/turbo-config";
import { AppSettings, ReapMpaPreset } from "../shared/types";

function getMpaSettings(settings: AppSettings): Partial<AppSettings> {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => key.startsWith("mpa")),
  ) as Partial<AppSettings>;
}

function withoutMpaSettings(settings: AppSettings): AppSettings {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !key.startsWith("mpa")),
  ) as AppSettings;
}

function getSettingsForPreset(settings: AppSettings, preset: ReapMpaPreset): AppSettings {
  return normalizeReapSettings({
    ...withoutMpaSettings(settings),
    ...preset.settings,
  });
}

function createPreset(settings: AppSettings, name = "Padrão"): ReapMpaPreset {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `preset-${Date.now()}`,
    name,
    settings: getMpaSettings(settings),
  };
}

function getPresets(settings: AppSettings): ReapMpaPreset[] {
  return settings.reapMpaPresets?.length ? settings.reapMpaPresets : [createPreset(settings)];
}

const ReapMpaSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetNameDraft, setPresetNameDraft] = useState("");
  const [hasPdf, setHasPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    StorageService.getSettings().then((current) => {
      const notice = getDefesoMonthsNormalizationNotice(current.mpaDefesoMonths);
      const normalized = normalizeReapSettings(current);
      const presets = getPresets(normalized);
      const nextSettings = {
        ...normalized,
        reapMpaPresets: presets,
        activeReapMpaPresetId: normalized.activeReapMpaPresetId ?? presets[0].id,
      };
      setSettings(nextSettings);
      if (notice) setStatus(notice);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    const checkPdf = async () => {
      const activeId = selectedPresetId ?? settings?.activeReapMpaPresetId;
      const cache = await getReapPdfCacheForPreset(activeId);
      if (!disposed) setHasPdf(Boolean(cache?.b64));
    };
    void checkPdf();
    const handleStorage = (changes: Record<string, any>) => {
      if (REAP_PDF_CACHES_STORAGE_KEY in changes || "sigessReapPdfCache" in changes) void checkPdf();
    };
    const storageApi = typeof browser !== "undefined" && browser?.storage ? browser.storage : (globalThis as any).chrome?.storage;
    storageApi?.onChanged?.addListener(handleStorage);
    return () => {
      disposed = true;
      storageApi?.onChanged?.removeListener(handleStorage);
    };
  }, [selectedPresetId, settings?.activeReapMpaPresetId]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!settings) return;
      const defesoNotice =
        Object.hasOwn(patch, "mpaDefesoMonths")
          ? getDefesoMonthsNormalizationNotice(patch.mpaDefesoMonths)
          : null;
      const presets = getPresets(settings);
      const activePresetId = settings.activeReapMpaPresetId ?? presets[0].id;
      const editedPresetId = selectedPresetId ?? activePresetId;
      const editedPreset = presets.find((preset) => preset.id === editedPresetId) ?? presets[0];
      const updatedPresetSettings = getMpaSettings(normalizeReapSettings({
        ...getSettingsForPreset(settings, editedPreset),
        ...patch,
      }));
      const nextPresets = presets.map((preset) =>
        preset.id === editedPresetId
          ? { ...preset, settings: updatedPresetSettings }
          : preset,
      );
      const updatedActiveSettings = editedPresetId === activePresetId
        ? normalizeReapSettings({ ...settings, ...updatedPresetSettings })
        : settings;
      const next = {
        ...updatedActiveSettings,
        reapMpaPresets: nextPresets,
        activeReapMpaPresetId: activePresetId,
      };
      setSettings(next);
      setStatus(defesoNotice || "Salvando...");
      try {
        await browser.runtime.sendMessage({
          action: "updateESocialSettings",
          settings: next,
        });
        setStatus(defesoNotice || "Salvo");
      } catch (error: any) {
        setStatus(`Erro: ${error?.message || "desconhecido"}`);
      }
    },
    [selectedPresetId, settings],
  );

  const updatePresets = useCallback(
    async (presets: ReapMpaPreset[], activePresetId: string, activePresetSettings?: Partial<AppSettings>) => {
      if (!settings) return;
      const baseSettings = activePresetSettings
        ? { ...withoutMpaSettings(settings), ...activePresetSettings }
        : settings;
      const next = normalizeReapSettings({
        ...baseSettings,
        reapMpaPresets: presets,
        activeReapMpaPresetId: activePresetId,
      });
      setSettings(next);
      setStatus("Salvando presets...");
      try {
        await browser.runtime.sendMessage({ action: "updateESocialSettings", settings: next });
        setStatus("Presets salvos");
      } catch (error: any) {
        setStatus(`Erro: ${error?.message || "desconhecido"}`);
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

  const presets = getPresets(settings);
  const activePresetId = settings.activeReapMpaPresetId ?? presets[0].id;
  const selectedPreset = presets.find((preset) => preset.id === (selectedPresetId ?? activePresetId)) ?? presets[0];
  const displayedSettings = selectedPreset.id === activePresetId
    ? settings
    : getSettingsForPreset(settings, selectedPreset);

  const renamePreset = () => {
    const name = presetNameDraft.trim() || "Sem nome";
    updatePresets(
      presets.map((preset) => preset.id === selectedPreset.id ? { ...preset, name: name || "Sem nome" } : preset),
      activePresetId,
    );
    setEditingPresetId(null);
  };

  const addPreset = () => {
    if (presets.length >= 3) return;
    const preset = createPreset(settings, `Preset ${presets.length + 1}`);
    setSelectedPresetId(preset.id);
    setEditingPresetId(null);
    updatePresets([...presets, preset], activePresetId);
    void copyReapPdfCache(activePresetId, preset.id);
  };

  const removePreset = (presetToRemove = selectedPreset) => {
    if (!window.confirm(`Remover o preset "${presetToRemove.name}"? Esta ação não pode ser desfeita.`)) return;
    const remaining = presets.filter((preset) => preset.id !== presetToRemove.id);
    const nextPresets = remaining.length ? remaining : [createPreset(settings)];
    const nextActivePreset = nextPresets.find((preset) => preset.id === activePresetId) ?? nextPresets[0];
    setSelectedPresetId(nextActivePreset.id);
    setEditingPresetId(null);
    updatePresets(
      nextPresets,
      nextActivePreset.id,
      presetToRemove.id === activePresetId ? nextActivePreset.settings : undefined,
    );
    void removeReapPdfCacheForPreset(presetToRemove.id);
  };

  const handleExportSettings = async () => {
    try {
      const rawSettings = await StorageService.getSettings();
      const pdfResult = await browser.storage.local.get(REAP_PDF_CACHES_STORAGE_KEY);
      const pdfCaches = pdfResult[REAP_PDF_CACHES_STORAGE_KEY] || {};

      const exportData = {
        version: 1,
        format: "sigess-reap-mpa-settings",
        exportedAt: new Date().toISOString(),
        settings: rawSettings,
        pdfCaches,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `configuracoes_reap_mpa_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus("Configurações exportadas com sucesso!");
      setTimeout(() => setStatus(""), 4000);
    } catch (error: any) {
      alert("Erro ao exportar configurações: " + (error?.message || String(error)));
    }
  };

  const handleImportSettings = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let imported: any;
      try {
        imported = JSON.parse(text);
      } catch {
        alert("O arquivo selecionado não é um arquivo JSON válido.");
        return;
      }

      let nextSettings: AppSettings | null = null;
      let nextPdfCaches: any = null;

      if (imported && typeof imported === "object") {
        if (imported.format === "sigess-reap-mpa-settings" && imported.settings) {
          nextSettings = imported.settings;
          nextPdfCaches = imported.pdfCaches;
        } else if (imported.reapMpaPresets || Object.keys(imported).some((k) => k.startsWith("mpa"))) {
          nextSettings = imported;
          nextPdfCaches = imported.pdfCaches;
        }
      }

      if (!nextSettings) {
        alert("Arquivo inválido. Não foram encontradas configurações válidas do REAP MPA.");
        return;
      }

      if (!window.confirm("Deseja substituir as configurações atuais pelas configurações deste arquivo?")) {
        return;
      }

      const normalized = normalizeReapSettings(nextSettings);
      const presets = getPresets(normalized);
      const finalSettings = {
        ...normalized,
        reapMpaPresets: presets,
        activeReapMpaPresetId: normalized.activeReapMpaPresetId ?? presets[0].id,
      };

      await browser.runtime.sendMessage({
        action: "updateESocialSettings",
        settings: finalSettings,
      });

      if (nextPdfCaches && typeof nextPdfCaches === "object") {
        await browser.storage.local.set({
          [REAP_PDF_CACHES_STORAGE_KEY]: nextPdfCaches,
        });
      }

      setSettings(finalSettings);
      setSelectedPresetId(finalSettings.activeReapMpaPresetId);
      setStatus("Configurações importadas com sucesso!");
      alert("Configurações importadas com sucesso!");
    } catch (error: any) {
      alert("Erro ao importar arquivo: " + (error?.message || "Falha na importação."));
    } finally {
      if (event.target) event.target.value = "";
    }
  };

  const readiness = checkPresetReadiness(displayedSettings, "MASCULINO", {
    hasPdf,
    strictBothGenders: true,
  });

  return (
    <div className="page-shell">
      <div className="page-header-wrap">
        <header className="page-header">
          <div className="page-header-left">
            <img
              src={browser.runtime?.getURL ? browser.runtime.getURL("sigess-logo.png") : "sigess-logo.png"}
              alt="SIGESS"
              className="page-header-logo"
            />
            <span className="page-header-title">REAP — Configurações</span>
          </div>
          <div className="page-header-right">
            {status && !["Salvo", "Salvando...", "Presets salvos", "Salvando presets..."].includes(status) && (
              <span className="status-message">{status}</span>
            )}
            <div
              className={`readiness-badge ${readiness.isReady ? "ready" : "pending"}`}
              title={
                readiness.isReady
                  ? `Preset "${selectedPreset.name}" totalmente configurado e pronto para uso.`
                  : `Pendências no preset "${selectedPreset.name}":\n• ${readiness.pendingFields.join("\n• ")}`
              }
            >
              {readiness.isReady
                ? "Configuração pronta"
                : `Incompleto (${readiness.pendingCount})`}
            </div>
            <button type="button" className="back-link" onClick={() => window.close()}>
              Fechar
            </button>
          </div>
        </header>
      </div>

      <div className="page-card">
        <div className="page-content-inner">
          <section className="section" style={{ paddingBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <div>
                <h2 className="section-title">Presets de configuração</h2>
                <p className="section-description">O preset ativo é usado pela extensão.</p>
              </div>
              {presets.length < 3 && (
                <button type="button" className="btn btn-secondary" onClick={addPreset} aria-label="Criar preset">
                  +
                </button>
              )}
            </div>
            <div role="tablist" aria-label="Presets" style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
              {presets.map((preset) => {
                const selected = preset.id === selectedPreset.id;
                const active = preset.id === activePresetId;
                const editing = preset.id === editingPresetId;
                return (
                  <div key={preset.id} style={{ display: "flex", flex: "1 0 120px", gap: "3px" }}>
                    {editing ? (
                      <input
                        className="gps-input"
                        value={presetNameDraft}
                        maxLength={40}
                        ref={(el) => { el?.focus(); }}
                        aria-label="Renomear preset"
                        onChange={(event) => setPresetNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") renamePreset();
                          if (event.key === "Escape") setEditingPresetId(null);
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          borderColor: "var(--color-accent)",
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setSelectedPresetId(preset.id)}
                        className="btn btn-secondary"
                        style={{
                          flex: 1,
                          borderColor: selected ? "var(--color-accent)" : undefined,
                          background: selected ? "var(--color-accent-soft)" : undefined,
                          color: selected ? "var(--color-accent-strong)" : undefined,
                        }}
                      >
                        {active ? "● " : ""}{preset.name}
                      </button>
                    )}
                    {presets.length > 1 && (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          aria-label={editing ? `Confirmar nome de ${preset.name}` : `Renomear ${preset.name}`}
                          onClick={() => {
                            if (editing) {
                              renamePreset();
                              return;
                            }
                            setSelectedPresetId(preset.id);
                            setPresetNameDraft(preset.name);
                            setEditingPresetId(preset.id);
                          }}
                          style={{ padding: "7px 9px" }}
                        >
                          {editing ? "✓" : "✎"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          aria-label={`Remover preset ${preset.name}`}
                          title={`Remover preset ${preset.name}`}
                          onClick={() => removePreset(preset)}
                          style={{ padding: "7px 9px", color: "var(--color-danger)" }}
                        >
                          🗑
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <ReapMpaSettingsForm
            settings={displayedSettings}
            presetId={selectedPreset.id}
            onUpdate={updateSettings}
            onOpenFilePicker={(presetId) => {
              const url = new URL(browser.runtime.getURL("file_picker.html"));
              if (presetId) url.searchParams.set("presetId", presetId);
              void browser.tabs.create({ url: url.toString() });
            }}
          />

          {/* Seção Importar e Exportar Configurações */}
          <section
            className="section"
            style={{
              marginTop: "20px",
              paddingTop: "24px",
              paddingBottom: "24px",
              borderTop: "1px solid var(--color-border)",
              borderBottom: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "16px",
              }}
            >
              <div>
                <h2 className="section-title">Importar e Exportar Configurações</h2>
                <p className="section-description" style={{ marginTop: "4px" }}>
                  Exporte suas configurações e presets para usar em outro computador ou criar um backup.
                </p>
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleExportSettings}
                  style={{ gap: "8px", fontWeight: 600 }}
                  title="Salva um arquivo .json com todos os presets e configurações"
                >
                  <Download size={15} />
                  Exportar
                </button>

                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ gap: "8px", fontWeight: 600 }}
                  title="Carrega um arquivo .json de configurações previamente exportado"
                >
                  <Upload size={15} />
                  Importar
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  onChange={handleImportSettings}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

createRoot(document.getElementById("root")!).render(<ReapMpaSettingsPage />);
