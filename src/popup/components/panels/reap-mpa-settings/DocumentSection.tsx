import { useEffect, useRef, useState } from "react";
import { AppSettings } from "../../../../shared/types";
import {
  getReapPdfCacheForPreset,
  removeReapPdfCacheForPreset,
  saveReapPdfCacheForPreset,
  REAP_PDF_CACHES_STORAGE_KEY,
} from "../../../../modules/reap-mpa/pdf-cache";
import { IBAMA_DEFESO_URL } from "./constants";

export function ReapDocumentSection({
  settings,
  onUpdate,
  presetId,
}: {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
  presetId?: string;
}) {
  const [cachedPdfFilename, setCachedPdfFilename] = useState<string | null>(null);
  const [isReadingPdf, setIsReadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    const storageApi = typeof browser !== "undefined" && browser?.storage ? browser.storage : (globalThis as any).chrome?.storage;
    if (storageApi?.onChanged) {
      storageApi.onChanged.addListener(handleStorageChange);
    }
    return () => {
      disposed = true;
      if (storageApi?.onChanged) {
        storageApi.onChanged.removeListener(handleStorageChange);
      }
    };
  }, [presetId]);

  const mode = settings.mpaDocumentoMode || "manual";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setPdfError("Por favor, selecione um arquivo em formato PDF.");
      if (e.target) e.target.value = "";
      return;
    }

    setIsReadingPdf(true);
    setPdfError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = reader.result as string;
        const b64 = result.includes(",") ? result.split(",")[1] : result;
        await saveReapPdfCacheForPreset(presetId, { b64, filename: file.name });
        setCachedPdfFilename(file.name);
      } catch (err: any) {
        setPdfError(err?.message || "Falha ao salvar PDF no cache.");
      } finally {
        setIsReadingPdf(false);
        if (e.target) e.target.value = "";
      }
    };
    reader.onerror = () => {
      setPdfError("Falha na leitura do arquivo.");
      setIsReadingPdf(false);
      if (e.target) e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const removePdf = async () => {
    await removeReapPdfCacheForPreset(presetId);
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            {!cachedPdfFilename ? (
              <div style={{
                padding: "10px",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                background: "var(--color-surface-alt)",
              }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isReadingPdf}
                  className="btn btn-secondary btn-full"
                  style={{ minHeight: "42px" }}
                >
                  {isReadingPdf ? "Lendo PDF..." : "Selecionar PDF"}
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
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isReadingPdf}
                  style={{ padding: "6px 10px", fontSize: "11px" }}
                >
                  {isReadingPdf ? "Lendo..." : "Substituir"}
                </button>
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
            {pdfError && (
              <div style={{ fontSize: "11px", color: "var(--color-danger)", gridColumn: "1 / -1" }}>
                {pdfError}
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
