import { StorageService } from "./storage";
import { BadgeManager } from "./badge-manager";

const GITHUB_API_URL = "https://api.github.com/repos/jcvb2003/SIGESS-Extensao/releases/latest";

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
    // Restore badge immediately from storage (in-memory state is lost on background restart)
    void StorageService.get<any>("updateAvailable").then(result => {
      if (result?.updateAvailable) {
        BadgeManager.setUpdate(true);
      }
    });

    // Adia a verificação para não competir com o startup
    globalThis.setTimeout(() => void this.checkVersion(), 5000);

    // Cria um alarme para checar a cada 4 horas
    if (typeof browser !== 'undefined' && browser.alarms) {
      browser.alarms.create("checkUpdateAlarm", {
        periodInMinutes: 240,
      });

      browser.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "checkUpdateAlarm") {
          void this.checkVersion();
        }
      });
    }
  }
}
