export const ESOCIAL_PORTAL_BASE = "https://www.esocial.gov.br/portal";
export const ESOCIAL_LOGIN_URL = "https://login.esocial.gov.br/";

// Storage keys
export const HOOKED_BUTTON_ATTR = "data-sigess-guide-hooked";
export const GUIDE_OBSERVER_ATTR = "__sigessGuideObserverInitialized";
export const GPS_FLOW_LOCK_KEY = "sigess_gps_flow_lock";
export const GPS_FLOW_DONE_PREFIX = "sigess_gps_flow_done_";
export const GPS_FLOW_PENDING_STATE_KEY = "sigess_gps_flow_pending_state";
export const MANUAL_GUIDE_DOWNLOAD_KEY = "sigess_manual_guide_download_until";
export const ESOCIAL_PROGRESS_OVERLAY_ID = "sigess-esocial-progress-overlay";
export const ESOCIAL_PROGRESS_OVERLAY_STORAGE_KEY = "sigess_esocial_progress_overlay";

// Compiled regexes for performance
export const MONEY_VALUE_REGEX = /\d{1,3}(?:\.\d{3})*,\d{2}/g;
export const FORM_INDEX_REGEX = /^\[(\d+)\]\.(.+)$/;
export const TIPOS_COMERCIALIZACAO_REGEX = /^TiposComercializacao\[(\d+)\]\.(.+)$/;
export const COMPETENCIA_REGEX = /competencia=(\d{6})/;
export const EMITIR_GUIA_REGEX = /FolhaPagamento\/EmitirGuia\/EmitirGuiaMensal\?competencia=\d{6}/;
export const DIRECT_PDF_HTTPS_REGEX = /https?:\/\/[^\s"'<>]+\.pdf\b/i;
export const DIRECT_PDF_RELATIVE_REGEX = /\/[^\s"'<>]+\.pdf\b/i;
export const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
