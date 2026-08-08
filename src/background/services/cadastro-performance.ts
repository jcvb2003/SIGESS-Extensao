import { StorageService } from "./storage";

export interface CadastroPerformancePortalSnapshot {
  requests: number;
  completed: number;
  failed: number;
  cacheHits: number;
  browserCacheHits: number;
  sigessCacheHits: number;
  networkRequests: number;
  staticRequests: number;
  dynamicRequests: number;
  totalDurationMs: number;
}

export interface CadastroPerformanceSnapshot {
  version: 1;
  startedAt: number;
  finishedAt: number;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  probableCacheHits: number;
  browserCacheHits: number;
  sigessCacheHits: number;
  networkRequests: number;
  staticRequests: number;
  dynamicRequests: number;
  totalNetworkDurationMs: number;
  byPortal: Record<string, CadastroPerformancePortalSnapshot>;
}

interface PendingRequest {
  sessionId: string;
  portal: string;
  startedAt: number;
  type: string;
  url: string;
}

interface MutableSnapshot extends CadastroPerformanceSnapshot {
  requestIds: Set<string>;
}

const snapshots = new Map<string, MutableSnapshot>();
const pendingRequests = new Map<string, PendingRequest>();
const sigessCacheRedirects = new Set<string>();
let initialized = false;

const STATIC_TYPES = new Set(["script", "stylesheet", "image", "font", "object", "media"]);
const DYNAMIC_TYPES = new Set([
  "main_frame", "sub_frame", "xmlhttprequest", "websocket", "ping", "beacon", "csp_report",
]);

function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

function isStaticRequest(type: string, url: string): boolean {
  if (STATIC_TYPES.has(type)) return true;
  if (DYNAMIC_TYPES.has(type)) return false;
  return /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|wasm|map)(?:$|\/)/i.test(url);
}

function getPortalSnapshot(snapshot: MutableSnapshot, portal: string): CadastroPerformancePortalSnapshot {
  snapshot.byPortal[portal] ??= {
    requests: 0,
    completed: 0,
    failed: 0,
    cacheHits: 0,
    browserCacheHits: 0,
    sigessCacheHits: 0,
    networkRequests: 0,
    staticRequests: 0,
    dynamicRequests: 0,
    totalDurationMs: 0,
  };
  return snapshot.byPortal[portal];
}

function getOrCreateSnapshot(sessionId: string, timestamp: number): MutableSnapshot {
  let snapshot = snapshots.get(sessionId);
  if (!snapshot) {
    snapshot = {
      version: 1,
      startedAt: timestamp,
      finishedAt: timestamp,
      totalRequests: 0,
      completedRequests: 0,
      failedRequests: 0,
      probableCacheHits: 0,
      browserCacheHits: 0,
      sigessCacheHits: 0,
      networkRequests: 0,
      staticRequests: 0,
      dynamicRequests: 0,
      totalNetworkDurationMs: 0,
      byPortal: {},
      requestIds: new Set(),
    };
    snapshots.set(sessionId, snapshot);
  }
  snapshot.finishedAt = Math.max(snapshot.finishedAt, timestamp);
  return snapshot;
}

async function onBeforeRequest(details: any): Promise<void> {
  if (details.tabId < 0 || !details.requestId || !details.url) return;
  const credentials = await StorageService.getCredentials(details.tabId);
  if (!credentials?.isCadastroAutomatico || !credentials.cadastroSessionId) return;

  const sessionId = credentials.cadastroSessionId;
  const portal = credentials.portalType || "desconhecido";
  const startedAt = Number(details.timeStamp) || Date.now();
  const pending: PendingRequest = {
    sessionId,
    portal,
    startedAt,
    type: String(details.type || "other"),
    url: sanitizeUrl(details.url),
  };
  pendingRequests.set(details.requestId, pending);

  const snapshot = getOrCreateSnapshot(sessionId, startedAt);
  if (snapshot.requestIds.has(details.requestId)) return;
  snapshot.requestIds.add(details.requestId);
  snapshot.totalRequests += 1;
  const portalSnapshot = getPortalSnapshot(snapshot, portal);
  portalSnapshot.requests += 1;
  if (isStaticRequest(pending.type, pending.url)) {
    snapshot.staticRequests += 1;
    portalSnapshot.staticRequests += 1;
  } else {
    snapshot.dynamicRequests += 1;
    portalSnapshot.dynamicRequests += 1;
  }
}

function completeRequest(details: any, failed: boolean): void {
  const pending = pendingRequests.get(details.requestId);
  if (!pending) return;
  pendingRequests.delete(details.requestId);

  const finishedAt = Number(details.timeStamp) || Date.now();
  const durationMs = Math.max(0, Math.round(finishedAt - pending.startedAt));
  const snapshot = snapshots.get(pending.sessionId);
  if (!snapshot) return;
  snapshot.finishedAt = Math.max(snapshot.finishedAt, finishedAt);
  const portalSnapshot = getPortalSnapshot(snapshot, pending.portal);
  portalSnapshot.totalDurationMs += durationMs;
  snapshot.totalNetworkDurationMs += durationMs;

  if (failed) {
    snapshot.failedRequests += 1;
    portalSnapshot.failed += 1;
  } else {
    snapshot.completedRequests += 1;
    portalSnapshot.completed += 1;
    if (sigessCacheRedirects.delete(details.requestId)) {
      snapshot.sigessCacheHits += 1;
      portalSnapshot.sigessCacheHits += 1;
    } else if ((details as any).fromCache === true) {
      snapshot.probableCacheHits += 1;
      snapshot.browserCacheHits += 1;
      portalSnapshot.cacheHits += 1;
      portalSnapshot.browserCacheHits += 1;
    } else {
      snapshot.networkRequests += 1;
      portalSnapshot.networkRequests += 1;
    }
  }
}

export function initializeCadastroPerformance(): void {
  if (initialized || typeof browser === "undefined" || !(browser as any).webRequest) return;
  initialized = true;
  const filter = { urls: ["<all_urls>"] };
  (browser as any).webRequest.onBeforeRequest.addListener(onBeforeRequest, filter);
  (browser as any).webRequest.onBeforeRedirect.addListener((details: any) => completeRequest(details, false), filter);
  (browser as any).webRequest.onCompleted.addListener((details: any) => completeRequest(details, false), filter);
  (browser as any).webRequest.onErrorOccurred.addListener((details: any) => completeRequest(details, true), filter);
}

export function markSigessCacheRedirect(requestId: string): void {
  sigessCacheRedirects.add(requestId);
}

export function takeCadastroPerformanceSnapshot(sessionId: string): CadastroPerformanceSnapshot | undefined {
  const snapshot = snapshots.get(sessionId);
  if (!snapshot) return undefined;
  snapshots.delete(sessionId);
  for (const [requestId, pending] of pendingRequests) {
    if (pending.sessionId === sessionId) pendingRequests.delete(requestId);
  }
  const { requestIds: _requestIds, ...report } = snapshot;
  return report;
}
