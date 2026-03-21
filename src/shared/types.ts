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
  reapData: Record<string, string>;
}
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
  [key: string]: any;
}
