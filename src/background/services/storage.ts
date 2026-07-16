import { AppSettings, GovBatchItemStatus, UserCredentials, PessoaData } from "../../shared/types";
import { normalizeReapSettings } from "../../modules/reap-mpa/reap-settings";
import { CadastroSourceSnapshot } from "../../modules/automation/cadastro/contracts";
import { normalizeCapturedValue, normalizePessoaData } from "../../modules/automation/cadastro/source-normalizer";
import { projectSourceFields } from "../../modules/automation/cadastro/source-projections";

declare var chrome: any;
declare var browser: any;

function getBrowserStorage() {
  if (globalThis.browser !== undefined && browser.storage)
    return browser.storage.local;
  if (globalThis.chrome !== undefined && chrome.storage)
    return chrome.storage.local;
  return null;
}

export class StorageService {
  static async get<T>(keys: string | string[]): Promise<Record<string, T>> {
    const storage = getBrowserStorage();
    if (!storage) return {} as Record<string, T>;
    return storage.get(keys) as Promise<Record<string, T>>;
  }

  static async set(data: Record<string, any>): Promise<void> {
    const storage = getBrowserStorage();
    if (storage) return storage.set(data);
  }

  static async remove(keys: string | string[]): Promise<void> {
    const storage = getBrowserStorage();
    if (storage) return storage.remove(keys);
  }

  static async getSettings(): Promise<AppSettings> {
    const result = await this.get<AppSettings>("sigessSettings");
    const current = result.sigessSettings || ({} as AppSettings);

    const defaults: AppSettings = {
      consultarGuias: false,
      gerarGps: false,
      selectedYear: "current",
      selectedMonth: "08",
      valorComercializado: "",
      reapData: {
        2021: "", 2022: "", 2023: "", 2024: "",
      },
      mpaReferenceYear: "2025",
      mpaResidenceUF: 5,
      mpaWorkRelation: "Economia Familiar",
      mpaCommercializationStates: [5],
      mpaDefesoMonths: [],
      mpaUF: 5,
      mpaLocalPesca: 6,
      mpaMetodoPesca: 4,
      mpaAmbiente: 1,
      mpaSpecies: [
        { id: 12, kgMin: "60", kgMax: "70", priceMin: "8.00", priceMax: "11.00" },
        { id: 21, kgMin: "55", kgMax: "60", priceMin: "8.00", priceMax: "12.00" },
        { id: 26, kgMin: "55", kgMax: "60", priceMin: "9.00", priceMax: "13.00" },
        { id: 25, kgMin: "55", kgMax: "60", priceMin: "10.00", priceMax: "13.00" },
        { id: 15, kgMin: "45", kgMax: "50", priceMin: "13.00", priceMax: "16.00" },
      ],
      mpaMascProdMin: "2850",
      mpaMascProdMax: "3075",
      mpaMascDaysMin: "125",
      mpaMascDaysMax: "135",
      mpaFemProdMin: "2550",
      mpaFemProdMax: "2850",
      mpaFemDaysMin: "118",
      mpaFemDaysMax: "124",
      autoRegistrationEnabled: false,
      sdpaEnabled: false,
      sdpaDefaultEmail: "",
      sdpaFallbackPhone: "",
    };

    return normalizeReapSettings({
      ...defaults,
      ...current,
      mpaSpecies: current.mpaSpecies && current.mpaSpecies.length > 0 ? current.mpaSpecies : defaults.mpaSpecies,
    });
  }

  static async saveSettings(settings: AppSettings): Promise<void> {
    await this.set({ sigessSettings: normalizeReapSettings(settings) });
  }

  static async saveCadastroSenhaGovInss(senhaGovInss: string): Promise<void> {
    const settings = await this.getSettings();
    await this.saveSettings({
      ...settings,
      pessoaData_sensitive: {
        ...(settings.pessoaData_sensitive || {}),
        senhaGovInss,
      },
    });
  }

  /**
   * Mescla dados de uma nova fonte e reconsolida o cadastro por prioridade.
   */
  static async mergePessoaData(
    data: Partial<PessoaData>,
    fonte: string,
    snapshot?: unknown,
  ): Promise<AppSettings> {
    const settings = await this.getSettings();
    const currentPessoa: PessoaData = settings.pessoaData ?? { nome: "", cpf: "", fontes: {} };
    const currentRaw = settings.pessoaData_raw ?? ({} as Record<string, Partial<PessoaData>>);
    const currentProjections = settings.pessoaData_projections ?? currentRaw;
    const currentSnapshots = settings.pessoaData_snapshots ?? {};
    const currentSensitive = settings.pessoaData_sensitive ?? {};
    
    // 1. Normalização do dado que está entrando (CPF 11 dígitos)
    const normalizedIn = normalizePessoaData(data);
    if (data.senhaGovInss !== undefined) normalizedIn.senhaGovInss = data.senhaGovInss;
    if (data.escolaridade !== undefined) normalizedIn.escolaridade = data.escolaridade;
    if (normalizedIn.cpf) {
      normalizedIn.cpf = normalizedIn.cpf.toString().padStart(11, '0');
    }

    // 2. Salva o dado bruto normalizado no snapshot da fonte
    const newRaw: Record<string, Partial<PessoaData>> = {
      ...currentRaw,
      [fonte]: {
        ...(currentRaw[fonte] || {}),
        ...normalizedIn
      }
    };

    const projectedIn = projectSourceFields(fonte, normalizedIn);
    const newProjections: Record<string, Partial<PessoaData>> = {
      ...currentProjections,
      [fonte]: {
        ...(currentProjections[fonte] || {}),
        ...projectedIn,
      },
    };

    const newSnapshots: Record<string, CadastroSourceSnapshot> = snapshot === undefined
      ? currentSnapshots
      : {
        ...currentSnapshots,
        [fonte]: {
          portal: sourceToPortalId(fonte),
          outcome: "collected",
          evidence: `payload:${fonte}`,
          collectedAt: Date.now(),
          data: normalizeCapturedValue(snapshot),
        },
      };

    // 3. Reconsolidação Prioritária do pessoaData (objeto principal)
    // Ordem: 1. CadÚnico, 2. PesqBrasil, 3. Resto (Cronológico)
    const priorityOrder = [
      'cadunico_adv', 'cadunico',
      'pesqbrasil', 'pesq_brasil',
      'inss'
    ];

    let consolidated: PessoaData = { 
      nome: "", cpf: "", 
      fontes: { ...(currentPessoa.fontes || {}) } as Record<string, any> 
    };

    // Primeiro aplica o "Resto" (fontes que não estão na lista de prioridade explícita)
    Object.entries(newProjections).forEach(([f, d]) => {
      if (!priorityOrder.includes(f)) {
        consolidated = { ...consolidated, ...d };
      }
    });

    // Depois aplica a prioridade (quem estiver no final do spread SOBRESCREVE)
    // Por isso aplicamos a prioridade REVERSA (menos prioritário primeiro)
    const reversedPriority = [...priorityOrder].reverse();
    reversedPriority.forEach(f => {
      if (newProjections[f]) {
        consolidated = { ...consolidated, ...newProjections[f] };
      }
    });

    // 4. Metadados e status das fontes
    consolidated.fontes ??= {};
    consolidateFontes(consolidated, fonte, normalizedIn as Partial<PessoaData>);

    const newSettings: AppSettings = { 
      ...settings, 
      pessoaData: consolidated,
      pessoaData_raw: newRaw,
      pessoaData_projections: newProjections,
      pessoaData_snapshots: newSnapshots,
      pessoaData_sensitive: data.senhaGovInss === undefined
        ? currentSensitive
        : { ...currentSensitive, senhaGovInss: data.senhaGovInss },
    };
    
    await this.saveSettings(newSettings);
    return newSettings;
  }

  static async getCredentials(tabId: number): Promise<UserCredentials | null> {
    const key = `credenciais_${tabId}`;
    const result = await this.get<UserCredentials>(key);
    return result[key] || null;
  }

  static async saveCredentials(tabId: number, creds: UserCredentials): Promise<void> {
    const key = `credenciais_${tabId}`;
    await this.set({ [key]: creds });
    await this.set({ sigess_last_esocial_credentials: creds });
  }

  static async clearCredentials(tabId: number): Promise<void> {
    const key = `credenciais_${tabId}`;
    await this.remove(key);
  }

  static async updateCredentials(
    tabId: number,
    patch: Partial<UserCredentials>,
  ): Promise<UserCredentials | null> {
    const current = await this.getCredentials(tabId);
    if (!current) return null;

    const next: UserCredentials = {
      ...current,
      ...patch,
      lastUpdatedAt: Date.now(),
    };

    await this.saveCredentials(tabId, next);
    return next;
  }

  static async updateBatchStatus(
    tabId: number,
    status: GovBatchItemStatus,
    statusTitle: string,
    statusDescription: string,
    extra?: Partial<UserCredentials>,
  ): Promise<UserCredentials | null> {
    const shouldKeepError = status === "erro";

    return this.updateCredentials(tabId, {
      status,
      statusTitle,
      statusDescription,
      ...extra,
      lastError: shouldKeepError ? extra?.lastError : undefined,
    });
  }

  static async getLastEsocialCredentials(): Promise<UserCredentials | null> {
    const result = await this.get<UserCredentials>("sigess_last_esocial_credentials");
    return result.sigess_last_esocial_credentials || null;
  }

  static async getAllCredentials(): Promise<Record<string, UserCredentials>> {
    const storage = getBrowserStorage();
    if (!storage) return {};

    const all = await storage.get(null);
    const credentials: Record<string, UserCredentials> = {};

    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith("credenciais_")) {
        credentials[key] = value as UserCredentials;
      }
    }

    return credentials;
  }
}

function sourceToPortalId(fonte: string): CadastroSourceSnapshot["portal"] {
  if (fonte === "cadunico" || fonte === "cadunico_adv") return "cadunico";
  if (fonte === "pesqbrasil" || fonte === "pesqbrasil_mpa") return "pesqbrasil";
  if (fonte === "ecac_cpf" || fonte === "ecac_caepf") return "ecac";
  if (fonte === "inss") return "inss";
  return "tse";
}

/**
 * Atualiza o status das fontes no objeto consolidado.
 */
function consolidateFontes(consolidated: PessoaData, fonte: string, data: Partial<PessoaData>): void {
  consolidated.fontes![fonte] = {
    capturado: true,
    timestamp: Date.now()
  };

  // Se CadÚnico deu dados eleitorais, marca TSE como "virtualmente" capturado
  if (fonte.startsWith('cadunico') && data.tituloEleitor && data.zonaEleitoral && data.secaoEleitoral) {
    consolidated.fontes!['tse'] = { 
      capturado: true, 
      timestamp: Date.now() 
    };
  }
}
