import { StorageService } from "./storage";
import { BadgeManager } from "./badge-manager";

const GITHUB_API_URL = "https://api.github.com/repos/jcvb2003/SIGESS-Extensao/releases/latest";
const UPDATE_CHECK_META_KEY = "updateCheckMeta";
const STARTUP_CHECK_DELAY_MS = 5000;
const MIN_RECHECK_INTERVAL_MS = 15 * 60 * 1000;

export class VersionChecker {
  static async checkVersion() {
    try {
      const response = await fetch(GITHUB_API_URL, {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
        cache: "no-cache",
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const release = await response.json();
      const latestVersion = release.tag_name.replace(/^v/, ""); // remove o 'v' do v1.2.3
      const currentVersion = browser.runtime.getManifest().version;

      if (this.isNewerVersion(currentVersion, latestVersion)) {
        await StorageService.set({
          updateAvailable: {
            version: latestVersion,
            url: release.html_url,
          },
        });
        
        // Exibe um badge na extensão para alertar o usuário (opcional)
        BadgeManager.setUpdate(true);
      } else {
         // Se estiver atualizado, limpa qualquer badge/aviso anterior
        await StorageService.remove("updateAvailable");
        BadgeManager.setUpdate(false);
      }
    } catch (error) {
      console.error("Falha ao verificar atualização:", error);
    }
  }

  private static async shouldRunStartupCheck(): Promise<boolean> {
    try {
      const result = await StorageService.get<{ checkedAt?: number }>(UPDATE_CHECK_META_KEY);
      const checkedAt = Number(result?.[UPDATE_CHECK_META_KEY]?.checkedAt || 0);
      if (!checkedAt) return true;
      return Date.now() - checkedAt >= MIN_RECHECK_INTERVAL_MS;
    } catch {
      return true;
    }
  }

  private static async markCheckRun(): Promise<void> {
    try {
      await StorageService.set({
        [UPDATE_CHECK_META_KEY]: {
          checkedAt: Date.now(),
        },
      });
    } catch (error) {
      console.warn("Falha ao registrar metadata de verificação de atualização:", error);
    }
  }

  private static scheduleStartupCheck() {
    globalThis.setTimeout(() => {
      void this.shouldRunStartupCheck().then((shouldRun) => {
        if (!shouldRun) return;
        void this.markCheckRun();
        void this.checkVersion();
      });
    }, STARTUP_CHECK_DELAY_MS);
  }

  static isNewerVersion(current: string, latest: string): boolean {
    const currentParts = current.split(".").map(Number);
    const latestParts = latest.split(".").map(Number);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const curr = currentParts[i] || 0;
      const lat = latestParts[i] || 0;
      if (lat > curr) return true;
      if (curr > lat) return false;
    }
    return false;
  }

  static start() {
    // Agenda a primeira verificação em segundo plano para não competir com o startup.
    this.scheduleStartupCheck();

    // Cria um alarme para checar a cada 4 horas
    if (typeof browser !== 'undefined' && browser.alarms) {
      browser.alarms.create("checkUpdateAlarm", {
        periodInMinutes: 240,
      });

      browser.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "checkUpdateAlarm") {
          void this.markCheckRun();
          void this.checkVersion();
        }
      });
    }
  }
}
