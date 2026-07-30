import { LicenseService } from "../../shared/services/license";

export function reconnectDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(5_000 * 2 ** attempt, 60_000);
  return Math.round(base * (0.8 + random() * 0.4));
}

export class RealtimeLicenseService {
  private static socket: WebSocket | null = null;
  private static startupTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private static reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private static reconnectAttempt = 0;
  private static initialized = false;
  private static invalidationCheck: Promise<void> | null = null;

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
    let opened = false;
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      opened = true;
      this.reconnectAttempt = 0;
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
          console.warn(`[SIGESS] Evento remoto de licença recebido: ${payload.type}.`);
          void this.handleInvalidation();
        }
      } catch {
        // Mensagens desconhecidas não alteram o estado local.
      }
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      const mustValidate = opened || event.code === 4001;
      console.warn(mustValidate
        ? `[SIGESS] Canal de licença encerrado (${event.code}). Validando antes de reconectar.`
        : `[SIGESS] Canal de licença indisponível (${event.code}). Tentando reconectar.`);
      const validation = mustValidate
        ? this.handleInvalidation()
        : Promise.resolve();
      void validation.finally(() => {
        this.scheduleReconnect(event.code === 4001 ? 30_000 : undefined);
      });
    });

    socket.addEventListener("error", () => {
      if (this.socket === socket) socket.close();
    });
  }

  private static handleInvalidation(): Promise<void> {
    if (this.invalidationCheck) return this.invalidationCheck;
    this.invalidationCheck = LicenseService.handleRemoteInvalidation()
      .then(() => undefined)
      .finally(() => {
        this.invalidationCheck = null;
      });
    return this.invalidationCheck;
  }

  private static scheduleReconnect(delay?: number): void {
    this.clearReconnectTimer();
    const backoff = delay ?? reconnectDelayMs(this.reconnectAttempt);
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
