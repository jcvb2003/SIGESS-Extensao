import { useState, useEffect, useCallback } from "react";
import { StorageService } from "../../background/services/storage";
import { normalizeReapSettings } from "../../modules/reap-mpa/reap-settings";
import { AppSettings } from "../../shared/types";

const EMPTY_SETTINGS: AppSettings = {
  consultarGuias: false,
  gerarGps: false,
  selectedYear: "",
  selectedMonth: "",
  valorComercializado: "",
  reapData: {},
};

interface UseSettingsReturn {
  settings: AppSettings;
  loading: boolean;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  clearCapturedPessoaData: () => Promise<void>;
  resetSettings: () => Promise<void>;
}

export const useSettings = (): UseSettingsReturn => {
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const s = await StorageService.getSettings();
      setSettings(normalizeReapSettings(s));
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    if (newSettings.autoRegistrationEnabled === false && settings.autoRegistrationEnabled) {
      await browser.runtime.sendMessage({ action: "cancelarCadastroAutomatico" });
      const disabled = await StorageService.disableAutomaticCapture();
      setSettings(normalizeReapSettings(disabled));
      return;
    }
    const updated = normalizeReapSettings({ ...settings, ...newSettings });
    setSettings(updated);
    await browser.runtime.sendMessage({
      action: "updateESocialSettings",
      settings: updated,
    });
  }, [settings]);

  const resetSettings = useCallback(async () => {
    setSettings(EMPTY_SETTINGS);
    await StorageService.saveSettings(EMPTY_SETTINGS);
  }, []);

  const clearCapturedPessoaData = useCallback(async () => {
    const cleared = await StorageService.clearCapturedPessoaData();
    setSettings(normalizeReapSettings(cleared));
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    settings,
    loading,
    updateSettings,
    clearCapturedPessoaData,
    resetSettings,
  };
};
