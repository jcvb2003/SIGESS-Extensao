import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument.startsWith("--")) {
    args.set(argument.slice(2), process.argv[index + 1]);
    index += 1;
  }
}

const coldPath = args.get("cold");
const warmPath = args.get("warm");
const outputPath = args.get("output") ?? "sigess-network-candidates.json";

if (!coldPath || !warmPath) {
  console.error(
    "Uso: node compare-captures.mjs --cold cold.jsonl --warm warm.jsonl [--output relatorio.json]",
  );
  process.exit(1);
}

function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function aggregate(records) {
  const result = new Map();
  for (const record of records) {
    const key = `${record.method} ${record.url}`;
    const current = result.get(key) ?? {
      url: record.url,
      host: record.host,
      path: record.path,
      method: record.method,
      requests: 0,
      statuses: {},
      wireBodyBytes: 0,
      decodedBodyBytes: 0,
      mimeType: record.mimeType,
      isStaticType: Boolean(record.isStaticType),
      isStaticPath: Boolean(record.isStaticPath),
      requestHasCookie: false,
      requestHasValidator: false,
      responseHasSetCookie: false,
      cacheControl: record.cacheControl ?? null,
      etag: record.etag ?? null,
      lastModified: record.lastModified ?? null,
      vary: record.vary ?? null,
    };

    current.requests += 1;
    current.statuses[record.status] = (current.statuses[record.status] ?? 0) + 1;
    current.wireBodyBytes += Number(record.wireBodyBytes ?? 0);
    current.decodedBodyBytes += Number(record.decodedBodyBytes ?? 0);
    current.requestHasCookie ||= Boolean(record.requestHasCookie);
    current.requestHasValidator ||= Boolean(record.requestHasValidator);
    current.responseHasSetCookie ||= Boolean(record.responseHasSetCookie);
    result.set(key, current);
  }
  return result;
}

function hasDynamicSignal(item) {
  const source = `${item.url} ${item.path}`.toLowerCase();
  return (
    item.method !== "GET" ||
    item.requestHasCookie ||
    item.responseHasSetCookie ||
    item.vary === "*" ||
    /(?:token|csrf|xsrf|session|sid|auth|jwt|captcha|api|graphql|login|logout)/i.test(source)
  );
}

function statusLabel(statuses) {
  return Object.entries(statuses)
    .map(([status, count]) => `${status}x${count}`)
    .join(",");
}

const cold = aggregate(readJsonl(coldPath));
const warm = aggregate(readJsonl(warmPath));
const keys = new Set([...cold.keys(), ...warm.keys()]);
const candidates = [];

for (const key of keys) {
  const coldItem = cold.get(key);
  const warmItem = warm.get(key);
  const base = coldItem ?? warmItem;
  const coldBytes = coldItem?.wireBodyBytes ?? 0;
  const warmBytes = warmItem?.wireBodyBytes ?? 0;
  const hasStaticSignal = Boolean(base.isStaticType || base.isStaticPath);
  const dynamicSignal = hasDynamicSignal(base);
  const warmNotObserved = Boolean(coldItem && !warmItem);
  const status = warmNotObserved
    ? "not-observed-in-warm"
    : warmBytes < coldBytes
      ? "reduced-in-warm"
      : "network-again";

  let classification = "ignore";
  if (hasStaticSignal && coldBytes > 0 && !dynamicSignal) {
    classification = warmNotObserved || warmBytes < coldBytes ? "high-potential" : "candidate";
  }

  candidates.push({
    ...base,
    classification,
    comparison: status,
    cold: coldItem
      ? {
          requests: coldItem.requests,
          statuses: statusLabel(coldItem.statuses),
          wireBodyBytes: coldBytes,
          decodedBodyBytes: coldItem.decodedBodyBytes,
        }
      : null,
    warm: warmItem
      ? {
          requests: warmItem.requests,
          statuses: statusLabel(warmItem.statuses),
          wireBodyBytes: warmBytes,
          decodedBodyBytes: warmItem.decodedBodyBytes,
        }
      : null,
  });
}

candidates.sort((left, right) => {
  const rank = { "high-potential": 0, candidate: 1, ignore: 2 };
  return (
    (rank[left.classification] ?? 3) - (rank[right.classification] ?? 3) ||
    (right.cold?.wireBodyBytes ?? 0) - (left.cold?.wireBodyBytes ?? 0)
  );
});

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  method: "mitmproxy-cold-warm-comparison",
  evidence: {
    coldCapture: path.resolve(coldPath),
    warmCapture: path.resolve(warmPath),
    caveat:
      "A URL absent from the warm capture is evidence of no network request in that run; it is not, by itself, proof that the page reused the resource from cache.",
  },
  summary: {
    totalResources: candidates.length,
    highPotential: candidates.filter((item) => item.classification === "high-potential").length,
    candidates: candidates.filter((item) => item.classification === "candidate").length,
    coldWireBodyBytes: candidates.reduce((sum, item) => sum + (item.cold?.wireBodyBytes ?? 0), 0),
    warmWireBodyBytes: candidates.reduce((sum, item) => sum + (item.warm?.wireBodyBytes ?? 0), 0),
  },
  resources: candidates,
};

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
console.log(`Relatório gravado em ${path.resolve(outputPath)}`);
console.log(JSON.stringify(report.summary, null, 2));
