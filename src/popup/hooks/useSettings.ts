import { useState, useEffect, useCallback } from "react";
import { StorageService } from "../../background/services/storage";
import { AppSettings } from "../../shared/types";

const DEFAULT_SETTINGS: AppSettings = {
  consultarGuias: false,
  gerarGps: false,
  selectedYear: "current",
  selectedMonth: "08",
  valorComercializado: "",
  reapData: {},
};

interface UseSettingsReturn {
  settings: AppSettings;
  loading: boolean;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

export const useSettings = (): UseSettingsReturn => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const s = await StorageService.getSettings();
      setSettings(s);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await browser.runtime.sendMessage({
      action: "updateESocialSettings",
      settings: updated,
    });
  }, [settings]);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    await StorageService.saveSettings(DEFAULT_SETTINGS);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    settings,
    loading,
    updateSettings,
    resetSettings,
  };
};
