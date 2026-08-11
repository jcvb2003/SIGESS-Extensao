import { useEffect, useState } from "react";
import { AppSettings } from "../../../../shared/types";
import {
  getReapPdfCacheForPreset,
  removeReapPdfCacheForPreset,
  REAP_PDF_CACHES_STORAGE_KEY,
} from "../../../../modules/reap-mpa/pdf-cache";
import { IBAMA_DEFESO_URL } from "./constants";

export function ReapDocumentSection({
  settings,
  onUpdate,
  presetId,
  onOpenFilePicker,
}: {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
  presetId?: string;
  onOpenFilePicker?: (presetId?: string) => void;
}) {
  const [cachedPdfFilename, setCachedPdfFilename] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const loadCache = async () => {
      const cache = await getReapPdfCacheForPreset(presetId);
      if (!disposed) setCachedPdfFilename(cache?.filename ?? null);
    };

    void loadCache();

    const handleStorageChange = (changes: Record<string, any>) => {
      if (REAP_PDF_CACHES_STORAGE_KEY in changes || "sigessReapPdfCache" in changes) void loadCache();
    };
    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      disposed = true;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [presetId]);

  const mode = settings.mpaDocumentoMode || "manual";

  const removePdf = async () => {
    if (presetId) {
      await removeReapPdfCacheForPreset(presetId);
    } else {
      await browser.storage.local.remove("sigessReapPdfCache");
    }
    setCachedPdfFilename(null);
  };

  return (
    <section className="section">
      <div className="section-header">
        <span className="section-num">05</span>
        <div>
          <h2 className="section-title">Documento Comprobatório</h2>
          <p className="section-description">Comprovante do período sem pesca (defeso).</p>
        </div>
      </div>

      <div className="stack" style={{ gap: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px" }}>
          {(["manual", "local"] as const).map((m) => {
            const active = mode === m;
            const labels = { manual: "Manual", local: "Arquivo local" };
            return (
              <label
                key={m}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                  padding: "9px 6px",
                  borderRadius: "3px",
                  border: active ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
                  background: active ? "var(--color-accent-soft)" : "var(--color-surface-alt)",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontFamily: "var(--sans)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  color: active ? "var(--color-accent-strong)" : "var(--color-text)",
                  transition: "all 0.12s",
                }}
              >
                <input
                  type="radio"
                  name="mpaDocumentoMode"
                  value={m}
                  checked={active}
                  onChange={() => onUpdate({ mpaDocumentoMode: m })}
                  style={{ accentColor: "var(--color-accent)" }}
                />
                {labels[m]}
              </label>
            );
          })}
        </div>

        {mode === "local" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
            {!cachedPdfFilename && (
              <div style={{
                padding: "10px",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                background: "var(--color-surface-alt)",
              }}>
                <a
                  href={IBAMA_DEFESO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-full"
                  style={{
                    minHeight: "42px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    textDecoration: "none",
                  }}
                >
                  Consultar portarias de defeso
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            )}
            {!cachedPdfFilename ? (
              <div style={{
                padding: "10px",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                background: "var(--color-surface-alt)",
              }}>
                <button
                  type="button"
                  onClick={() =>
                    onOpenFilePicker
                      ? onOpenFilePicker(presetId)
                      : browser.tabs.create({ url: browser.runtime.getURL("file_picker.html") })
                  }
                  className="btn btn-secondary btn-full"
                  style={{ minHeight: "42px" }}
                >
                  Selecionar PDF
                </button>
              </div>
            ) : (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                minWidth: 0,
                gridColumn: "1 / -1",
                padding: "10px",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                background: "var(--color-surface-alt)",
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "10px", color: "var(--color-success)", fontWeight: 700, fontFamily: "var(--sans)" }}>
                    PDF anexado
                  </div>
                  <div
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "10px", color: "var(--color-muted)", fontFamily: "var(--sans)" }}
                    title={cachedPdfFilename ?? undefined}
                  >
                    {cachedPdfFilename}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void removePdf()}
                  aria-label="Remover PDF anexado"
                  title="Remover PDF anexado"
                  style={{ minWidth: "32px", padding: "7px 9px", color: "var(--color-danger)" }}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )}

        {mode === "manual" && (
          <p style={{ fontSize: "10px", color: "var(--color-muted)", margin: 0 }}>
            Anexe o PDF manualmente na justificativa.
          </p>
        )}
      </div>
    </section>
  );
}
