export type LicenseOperationState =
  | "license_not_activated"
  | "license_unlinked"
  | "license_expired"
  | "license_blocked"
  | "license_invalid_key"
  | "license_device_limit"
  | "license_network_error"
  | "license_database_error"
  | "license_rate_limited"
  | "license_unauthorized_access"
  | "license_invalid_signature"
  | "license_missing_parameters"
  | "license_internal_error"
  | "license_unknown_error";

const LICENSE_OPERATION_STATE_BY_REASON: Record<string, LicenseOperationState> = {
  no_key: "license_not_activated",
  wrong_device: "license_unlinked",
  expired: "license_expired",
  blocked: "license_blocked",
  invalid_key: "license_invalid_key",
  device_limit: "license_device_limit",
  network_error: "license_network_error",
  database_error: "license_database_error",
  rate_limited: "license_rate_limited",
  unauthorized_access: "license_unauthorized_access",
  invalid_signature: "license_invalid_signature",
  missing_parameters: "license_missing_parameters",
  internal_error: "license_internal_error",
};

export function getLicenseOperationState(reason?: string): LicenseOperationState {
  return reason ? LICENSE_OPERATION_STATE_BY_REASON[reason] ?? "license_unknown_error" : "license_unknown_error";
}

export function getLicenseErrorMessage(reason?: string): string {
  switch (reason) {
    case "no_key":
      return "Extensão não ativada. No Web, acesse Configurações > Extensão, copie a chave e ative a extensão.";
    case "expired":
      return "A validade desta licença terminou. Entre em contato para renovar.";
    case "device_limit":
      return "Todos os acessos desta licença estão ocupados. Libere um acesso em Configurações > Extensão no sistema web e tente novamente.";
    case "wrong_device":
      return "Este computador foi desvinculado da licença. Informe a chave para vinculá-lo novamente.";
    case "blocked":
      return "Esta licença está bloqueada. Entre em contato com o responsável pela licença.";
    case "invalid_key":
      return "A chave informada não é válida. Confira o código e tente novamente.";
    case "network_error":
    case "database_error":
      return "Não foi possível validar a licença agora. Verifique sua conexão e tente novamente.";
    case "rate_limited":
      return "Foram feitas muitas tentativas. Aguarde um minuto e tente novamente.";
    case "unauthorized_access":
    case "invalid_signature":
      return "Não foi possível confirmar a licença neste dispositivo. Tente novamente.";
    default:
      return "Falha na validação da licença. Tente novamente.";
  }
}
