export interface UserCredentials {
    cpf: string;
    senha: string;
    loginConcluido?: boolean;
}

export interface AppSettings {
    consultarGuias: boolean;
    gerarGps: boolean;
    selectedYear: string;
    selectedMonth: string;
    valorComercializado: string;
    reapData: Record<string, string>; // Ano -> Dados (tab separated)
}

export type StorageKey = 'sinpescaSettings' | string; // Permitir chaves dinâmicas como creditais_{tabId}

export interface MessageRequest {
    action: string;
    settings?: Partial<AppSettings>;
    [key: string]: any;
}

export interface MessageResponse {
    success: boolean;
    error?: string;
    settings?: AppSettings;
    data?: any;
}
