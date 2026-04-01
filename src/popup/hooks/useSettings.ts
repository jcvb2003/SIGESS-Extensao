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
  mpaSpecies: [
    { id: 12, kgMin: "60", kgMax: "70", priceMin: "8.00", priceMax: "11.00" },
    { id: 21, kgMin: "55", kgMax: "60", priceMin: "8.00", priceMax: "12.00" },
    { id: 26, kgMin: "55", kgMax: "60", priceMin: "9.00", priceMax: "13.00" },
    { id: 25, kgMin: "55", kgMax: "60", priceMin: "10.00", priceMax: "13.00" },
    { id: 15, kgMin: "45", kgMax: "50", priceMin: "13.00", priceMax: "16.00" },
  ],
  mpaMascProdMin: "2850",
  mpaMascProdMax: "3075",
  mpaMascDaysMin: "125",
  mpaMascDaysMax: "135",
  mpaFemProdMin: "2550",
  mpaFemProdMax: "2850",
  mpaFemDaysMin: "118",
  mpaFemDaysMax: "124",
  autoRegistrationEnabled: false,
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
