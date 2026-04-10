import { useState, useEffect, useCallback } from "react";
import { LicenseService, LicenseResult } from "../../shared/services/license";

interface UseLicenseReturn {
  license: LicenseResult | null;
  loading: boolean;
  activating: boolean;
  refreshing: boolean;
  checkLicense: (forceLive?: boolean, forceConsume?: boolean) => Promise<LicenseResult>;
  activate: (key: string, deviceName?: string) => Promise<LicenseResult>;
}

export const useLicense = (): UseLicenseReturn => {
  const [license, setLicense] = useState<LicenseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const checkLicense = useCallback(async (
    forceLive = false,
    forceConsume = false
  ): Promise<LicenseResult> => {
    setRefreshing(true);
    try {
      // Prioridade: Se não for forçado, pede ao Background (que já tem em RAM)
      // para evitar I/O lento de disco e HMAC no processo do popup
      if (!forceLive && !forceConsume) {
        const response = await browser.runtime.sendMessage({ action: "checkLicense" });
        if (response && response.success) {
          const { success: _s, ...licData } = response;
          setLicense(licData as LicenseResult);
          return licData as LicenseResult;
        }
      }

      // Fallback para chamada direta em casos de força bruta ou falha na mensagem
      const result = await LicenseService.checkLicense(forceLive, forceConsume);
      setLicense(result);
      return result;
    } catch (e) {
      console.warn("[SIGESS] Falha ao obter licença via Background, tentando direto...", e);
      const result = await LicenseService.checkLicense(forceLive, forceConsume);
      setLicense(result);
      return result;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const activate = useCallback(async (key: string, deviceName?: string): Promise<LicenseResult> => {
    setActivating(true);
    try {
      await LicenseService.saveKey(key);
      if (deviceName?.trim()) {
        await LicenseService.updateDeviceName(deviceName.trim());
      }
      // Na ativação, usamos forceConsume = false e o tipo especial 'activate'
      // para autorizar o vínculo do fingerprint no banco de dados.
      const result = await LicenseService.checkLicense(true, false, 'activate');
      setLicense(result);
      return result;
    } finally {
      setActivating(false);
    }
  }, [checkLicense]);

  useEffect(() => {
    checkLicense();
  }, [checkLicense]);

  return {
    license,
    loading,
    activating,
    refreshing,
    checkLicense,
    activate,
  };
};
