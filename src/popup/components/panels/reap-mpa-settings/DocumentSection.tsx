import { useEffect, useState } from "react";
import { AppSettings } from "../../../../shared/types";
import { IBAMA_PDF_FILENAME } from "./constants";

export function ReapDocumentSection({
  settings,
  onUpdate,
  onOpenFilePicker,
}: {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
  onOpenFilePicker?: () => void;
}) {
  const [cachedPdfFilename, setCachedPdfFilename] = useState<string | null>(null);

  useEffect(() => {
    browser.storage.local.get("sigessReapPdfCache").then((result: any) => {
      if (result.sigessReapPdfCache?.filename) {
        setCachedPdfFilename(result.sigessReapPdfCache.filename);
      }
    });

    const handleStorageChange = (changes: Record<string, any>) => {
      if ("sigessReapPdfCache" in changes) {
        setCachedPdfFilename(changes.sigessReapPdfCache.newValue?.filename ?? null);
      }
    };
    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
          {(["manual", "local", "url"] as const).map((m) => {
            const active = mode === m;
            const labels = { manual: "Manual", local: "Arquivo local", url: "Internet" };
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
                  fontFamily: "var(--mono)",
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
          <div className="stack" style={{ gap: "6px" }}>
            <button
              type="button"
              onClick={() =>
                onOpenFilePicker
                  ? onOpenFilePicker()
                  : browser.tabs.create({ url: browser.runtime.getURL("file_picker.html") })
              }
              className="btn btn-secondary btn-full"
              style={{ minHeight: "40px" }}
            >
              Selecionar PDF
            </button>
            {cachedPdfFilename ? (
              <p style={{ fontSize: "10px", color: "var(--color-success)", margin: 0, fontFamily: "var(--mono)" }}>
                {cachedPdfFilename}
              </p>
            ) : (
              <p style={{ fontSize: "10px", color: "var(--color-muted)", margin: 0, fontFamily: "var(--mono)" }}>
                Nenhum PDF selecionado
              </p>
            )}
          </div>
        )}

        {mode === "url" && (
          <p style={{ fontSize: "10px", color: "var(--color-muted)", margin: 0, fontFamily: "var(--mono)" }}>
            {IBAMA_PDF_FILENAME} — baixado automaticamente pelo Turbo.
          </p>
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
