import { useEffect, useState } from "react";
import { AppSettings } from "../../../../shared/types";
import {
  getReapPdfCacheForPreset,
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

        <a
          href={IBAMA_DEFESO_URL}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            color: "var(--color-accent-strong)",
            fontSize: "10px",
            fontFamily: "var(--sans)",
            fontWeight: 600,
          }}
        >
          Consultar portarias de defeso no IBAMA
        </a>

        {mode === "local" && (
          <div className="stack" style={{ gap: "6px" }}>
            <button
              type="button"
              onClick={() =>
                onOpenFilePicker
                  ? onOpenFilePicker(presetId)
                  : browser.tabs.create({ url: browser.runtime.getURL("file_picker.html") })
              }
              className="btn btn-secondary btn-full"
              style={{ minHeight: "40px" }}
            >
              Selecionar PDF
            </button>
            {cachedPdfFilename ? (
              <p style={{ fontSize: "10px", color: "var(--color-success)", margin: 0, fontFamily: "var(--sans)" }}>
                {cachedPdfFilename}
              </p>
            ) : (
              <p style={{ fontSize: "10px", color: "var(--color-muted)", margin: 0, fontFamily: "var(--sans)" }}>
                Nenhum PDF selecionado
              </p>
            )}
          </div>
        )}

        {mode === "manual" && (
          <p style={{ fontSize: "10px", color: "var(--color-muted)", margin: 0 }}>
            Anexe o PDF manualmente no portal após rodar o Turbo.
          </p>
        )}
      </div>
    </section>
  );
}
