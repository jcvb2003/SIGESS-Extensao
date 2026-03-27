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
