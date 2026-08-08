import { useState, useEffect, useCallback } from "react";
import { StorageService } from "../../background/services/storage";
import { normalizeReapSettings } from "../../modules/reap-mpa/reap-settings";
import { AppSettings } from "../../shared/types";

const DEFAULT_SETTINGS: AppSettings = {
  consultarGuias: false,
  gerarGps: false,
  selectedYear: "current",
  selectedMonth: "08",
  valorComercializado: "",
  reapData: {},
  mpaReferenceYear: "2025",
  mpaResidenceUF: 5,
  mpaWorkRelation: "Economia Familiar",
  mpaCommercializationStates: [5],
  mpaDefesoMonths: [],
  mpaUF: 5,
  mpaLocalPesca: 6,
  mpaMetodoPesca: 4,
  mpaAmbiente: 1,
  mpaSpeciesCount: 4,
  mpaSpecies: [
    { id: 12, kgMin: "60", kgMax: "70", priceMin: "8.00", priceMax: "11.00" },
    { id: 21, kgMin: "55", kgMax: "60", priceMin: "8.00", priceMax: "12.00" },
    { id: 26, kgMin: "55", kgMax: "60", priceMin: "9.00", priceMax: "13.00" },
    { id: 25, kgMin: "55", kgMax: "60", priceMin: "10.00", priceMax: "13.00" },
    { id: 15, kgMin: "45", kgMax: "50", priceMin: "13.00", priceMax: "16.00" },
    {}, {}, {}, {}, {},
  ],
  mpaMascProdMin: "2850",
  mpaMascProdMax: "3075",
  mpaMascDaysMin: "21",
  mpaMascDaysMax: "21",
  mpaFemProdMin: "2550",
  mpaFemProdMax: "2850",
  mpaFemDaysMin: "25",
  mpaFemDaysMax: "25",
  autoRegistrationEnabled: false,
  staticCacheEnabled: false,
  mpaDocumentoMode: "manual",
};

interface UseSettingsReturn {
  settings: AppSettings;
  loading: boolean;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  clearCapturedPessoaData: () => Promise<void>;
  resetSettings: () => Promise<void>;
}

export const useSettings = (): UseSettingsReturn => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
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
    const normalizedDefaults = normalizeReapSettings(DEFAULT_SETTINGS);
    setSettings(normalizedDefaults);
    await StorageService.saveSettings(normalizedDefaults);
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
