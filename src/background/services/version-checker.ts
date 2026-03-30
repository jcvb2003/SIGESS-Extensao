import { StorageService } from "./storage";

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
        browser.action.setBadgeText({ text: "!" });
        browser.action.setBadgeBackgroundColor({ color: "#FF0000" });
      } else {
         // Se estiver atualizado, limpa qualquer badge/aviso anterior
        await StorageService.remove("updateAvailable");
        browser.action.setBadgeText({ text: "" });
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
    // Verifica agora na inicialização
    this.checkVersion();

    // Cria um alarme para checar a cada 4 horas
    browser.alarms.create("checkUpdateAlarm", {
      periodInMinutes: 240,
    });

    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "checkUpdateAlarm") {
        this.checkVersion();
      }
    });
  }
}
