import { RealtimeClient, RealtimeChannel } from "@supabase/realtime-js";
import { LicenseService } from "../../shared/services/license";

export class RealtimeLicenseService {
  private static client: RealtimeClient | null = null;
  private static channel: RealtimeChannel | null = null;
  private static startupTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private static readonly STARTUP_CONNECT_DELAY_MS = 0;

  /**
   * Inicializa o cliente Realtime para ouvir notificações de desvinculação da licença.
   */
  static async init() {
    if (this.startupTimer !== null) return;

    this.startupTimer = globalThis.setTimeout(() => {
      this.startupTimer = null;
      void this.connect();
    }, this.STARTUP_CONNECT_DELAY_MS);
  }

  private static async connect() {
    const key = await LicenseService.getSavedKey();
    if (!key) return;

    // Se já estiver conectado à chave correta, não faz nada
    if (this.channel?.topic === `sigess:license:${key}`) return;

    // Garante limpeza de conexões órfãs
    this.stop();

    const SUPABASE_URL = "https://vdwupmfpfkaempsiqfgb.supabase.co";
    const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

    if (!ANON_KEY) {
       console.warn("Realtime: VITE_SUPABASE_ANON_KEY not found. Realtime invalidation disabled.");
       return;
    }

    const socketUrl = `${SUPABASE_URL.replace("https://", "wss://")}/realtime/v1`;
    
    this.client = new RealtimeClient(socketUrl, {
      params: { apikey: ANON_KEY },
    });

    this.channel = this.client.channel(`sigess:license:${key}`);

    // Ouve o evento de invalidação disparado pelo backend (manage-license)
    this.channel.on("broadcast", { event: "INVALIDATE_CACHE" }, async (payload: any) => {
      console.log("Realtime: License invalidation received via broadcast.", payload);
      await LicenseService.resetCache();
    });

    this.channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        console.log(`Realtime: Monitoring license updates for key: ${key.substring(0, 8)}...`);
      }
    });

    this.client.connect();
  }

  static stop() {
    if (this.startupTimer !== null) {
      globalThis.clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}
