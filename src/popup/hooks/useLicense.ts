import { useState, useEffect, useCallback } from "react";
import { LicenseService, LicenseResult } from "../../shared/services/license";

interface UseLicenseReturn {
  license: LicenseResult | null;
  loading: boolean;
  activating: boolean;
  refreshing: boolean;
  verified: boolean;
  checkLicense: (
    forceLive?: boolean,
    forceConsume?: boolean,
  ) => Promise<LicenseResult>;
  activate: (key: string, deviceName?: string) => Promise<LicenseResult>;
}

export const useLicense = (): UseLicenseReturn => {
  const [license, setLicense] = useState<LicenseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [verified, setVerified] = useState(false);

  const hydrateInitialLicense = useCallback(async () => {
    try {
      const { license_cache, license_key } = await browser.storage.local.get([
        "license_cache",
        "license_key",
      ]);

      if (license_cache) {
        const cachedLicense = license_cache as LicenseResult;
        setLicense(
          LicenseService.isLocallyActive(cachedLicense)
            ? cachedLicense
            : { ok: false, reason: "expired" },
        );
        return;
      }

      if (!license_key) {
        setLicense({ ok: false, reason: "no_key" });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const checkLicense = useCallback(
    async (
      forceLive = false,
      forceConsume = false,
    ): Promise<LicenseResult> => {
      setRefreshing(true);
      try {
        if (!forceLive && !forceConsume) {
          const response = await browser.runtime.sendMessage({
            action: "checkLicense",
          });

          if (response && response.success) {
            const { success: _success, ...licenseData } = response;
            const result = licenseData as LicenseResult;
            setLicense(result);
            setVerified(true);
            return result;
          }
        }

        const result = await LicenseService.checkLicense(forceLive);
        setLicense(result);
        setVerified(true);
        return result;
      } catch (error) {
        console.warn(
          "[SIGESS] Falha ao obter licença via Background, tentando direto...",
          error,
        );
        const result = await LicenseService.checkLicense(forceLive);
        setLicense(result);
        setVerified(true);
        return result;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  const activate = useCallback(
    async (key: string, deviceName?: string): Promise<LicenseResult> => {
      setActivating(true);
      try {
        await LicenseService.saveKey(key);
        if (deviceName?.trim()) {
          await LicenseService.updateDeviceName(deviceName.trim());
        }

        const result = await LicenseService.checkLicense(true);
        setLicense(result);
        setVerified(true);
        return result;
      } finally {
        setActivating(false);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

    const bootstrap = async () => {
      await hydrateInitialLicense();
      if (cancelled) return;

      timer = globalThis.setTimeout(() => {
        void checkLicense();
      }, 1000);
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (timer !== null) {
        globalThis.clearTimeout(timer);
      }
    };
  }, [checkLicense, hydrateInitialLicense]);

  return {
    license,
    loading,
    activating,
    refreshing,
    verified,
    checkLicense,
    activate,
  };
};
