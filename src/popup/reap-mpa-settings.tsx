import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ReapMpaSettingsForm from "./components/panels/ReapMpaSettingsForm";
import { StorageService } from "../background/services/storage";
import { getDefesoMonthsNormalizationNotice, normalizeReapSettings } from "../modules/reap-mpa/reap-settings";
import { copyReapPdfCache, removeReapPdfCacheForPreset } from "../modules/reap-mpa/pdf-cache";
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

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      if (!settings) return;
      const defesoNotice =
        Object.prototype.hasOwnProperty.call(patch, "mpaDefesoMonths")
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
      const next = normalizeReapSettings({
        ...(activePresetSettings ? withoutMpaSettings(settings) : settings),
        ...(activePresetSettings ?? {}),
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

  return (
    <div className="page-shell">
      <div className="page-header-wrap">
        <header className="page-header">
          <div className="page-header-left">
            <span className="page-eyebrow">SIGESS</span>
            <span className="page-header-title">REAP MPA — Configurações</span>
          </div>
          <div className="page-header-right">
            {status && !["Salvo", "Salvando...", "Presets salvos", "Salvando presets..."].includes(status) && (
              <span style={{ fontSize: "11px", color: "#ffffff" }}>{status}</span>
            )}
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
                        autoFocus
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
        </div>
      </div>
    </div>
  );
};

createRoot(document.getElementById("root")!).render(<ReapMpaSettingsPage />);
