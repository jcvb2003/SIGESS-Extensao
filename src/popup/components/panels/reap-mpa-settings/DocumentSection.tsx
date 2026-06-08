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

  return (
    <section className="section" style={{ padding: "16px" }}>
      <div className="section-header">
        <h2 className="section-title">Documento Comprobatório</h2>
        <p className="section-description">Meses sem pesca.</p>
      </div>

      <div className="stack" style={{ gap: "10px" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          {(["manual", "local", "url"] as const).map((mode) => (
            <label
              key={mode}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                cursor: "pointer",
                flex: 1,
                justifyContent: "center",
              }}
            >
              <input
                type="radio"
                name="mpaDocumentoMode"
                value={mode}
                checked={(settings.mpaDocumentoMode || "manual") === mode}
                onChange={() => onUpdate({ mpaDocumentoMode: mode })}
              />
              {mode === "manual" ? "Manual" : mode === "local" ? "Local" : "Internet"}
            </label>
          ))}
        </div>

        {(settings.mpaDocumentoMode || "manual") === "local" && (
          <div>
            <button
              type="button"
              onClick={() =>
                onOpenFilePicker
                  ? onOpenFilePicker()
                  : browser.tabs.create({ url: browser.runtime.getURL("file_picker.html") })
              }
              className="btn btn-secondary btn-full"
              style={{ minHeight: "44px" }}
            >
              Selecionar PDF
            </button>
            {cachedPdfFilename ? (
              <p style={{ fontSize: "10px", color: "#28a745", marginTop: "4px" }}>✅ {cachedPdfFilename}</p>
            ) : (
              <p style={{ fontSize: "10px", color: "#999", marginTop: "4px" }}>Nenhum PDF selecionado</p>
            )}
          </div>
        )}

        {(settings.mpaDocumentoMode || "manual") === "url" && (
          <p style={{ fontSize: "10px", color: "var(--color-muted)", margin: 0 }}>
            📡 {IBAMA_PDF_FILENAME} — baixado automaticamente pelo Turbo.
          </p>
        )}

        {(settings.mpaDocumentoMode || "manual") === "manual" && (
          <p style={{ fontSize: "10px", color: "var(--color-muted)", margin: 0 }}>
            Anexe o PDF manualmente no portal após rodar o Turbo.
          </p>
        )}
      </div>
    </section>
  );
}
