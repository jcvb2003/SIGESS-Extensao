import { LicenseService } from "../../shared/services/license";

export class RealtimeLicenseService {
  private static socket: WebSocket | null = null;
  private static startupTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private static reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private static pingTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private static reconnectAttempt = 0;
  private static initialized = false;

  static async init(): Promise<void> {
    if (!this.initialized) {
      this.initialized = true;
      browser.storage.onChanged.addListener((changes, areaName) => {
        if (
          areaName === "local" &&
          (
            "license_key" in changes ||
            "license_api_id" in changes ||
            "license_device_token" in changes
          )
        ) {
          this.scheduleReconnect(250);
        }
      });
    }
    if (this.startupTimer !== null || this.socket) return;
    this.startupTimer = globalThis.setTimeout(() => {
      this.startupTimer = null;
      void this.connect();
    }, 0);
  }

  private static async connect(): Promise<void> {
    this.clearReconnectTimer();
    const url = await LicenseService.createSessionUrl();
    if (!url) return;

    this.closeSocket();
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      this.startPing();
      console.info("[SIGESS] Canal de licença conectado.");
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      try {
        const payload = JSON.parse(String(event.data)) as { type?: string };
        if (
          payload.type === "LICENSE_INVALIDATED" ||
          payload.type === "LICENSE_UPDATED"
        ) {
          void LicenseService.resetCache();
        }
      } catch {
        // Mensagens desconhecidas não alteram o estado local.
      }
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopPing();
      if (event.code === 4001) void LicenseService.resetCache();
      this.scheduleReconnect(event.code === 4001 ? 30_000 : undefined);
    });

    socket.addEventListener("error", () => {
      if (this.socket === socket) socket.close();
    });
  }

  private static startPing(): void {
    this.stopPing();
    this.pingTimer = globalThis.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send("ping");
      }
    }, 20_000);
  }

  private static stopPing(): void {
    if (this.pingTimer !== null) {
      globalThis.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private static scheduleReconnect(delay?: number): void {
    this.clearReconnectTimer();
    const backoff = delay ?? Math.min(5_000 * 2 ** this.reconnectAttempt, 60_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, backoff);
  }

  private static clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      globalThis.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private static closeSocket(): void {
    this.stopPing();
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.close(1000, "client_reconnect");
    }
  }

  static stop(): void {
    if (this.startupTimer !== null) {
      globalThis.clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    this.clearReconnectTimer();
    this.closeSocket();
  }
}
