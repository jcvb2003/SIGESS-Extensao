import { AppSettings } from "../../../../shared/types";
import { CurrencyInput, SpeciesSearch } from "./SharedFields";

export function ReapSpeciesSection({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
}) {
  const selectedSpeciesIds =
    settings.mpaSpecies?.map((s) => s.id).filter((id): id is number => id !== undefined) || [];
  const filled = settings.mpaSpecies?.filter((s) => s?.id).length ?? 0;
  const count = settings.mpaSpeciesCount ?? 5;

  const updateSpecie = (index: number, data: any) => {
    const current = settings.mpaSpecies || [];
    const next = [...current];
    for (let i = 0; i < 10; i++) {
      if (!next[i]) next[i] = {};
    }
    next[index] = { ...next[index], ...data };
    onUpdate({ mpaSpecies: next });
  };

  return (
    <section className="section" style={{ padding: "16px" }}>
      <div className="section-header">
        <h2 className="section-title">Espécies e Produção</h2>
      </div>

      <div className="stack" style={{ gap: "12px" }}>
        <div className="config-group" style={{ background: "var(--color-surface-alt)", padding: "10px", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
          <div className="form-item">
            <label htmlFor="mpaSpeciesCount" style={{ fontSize: "11px", fontWeight: "bold", display: "block", marginBottom: "4px", color: "var(--color-accent)" }}>
              QTD. DE PEIXES NO REAP:
            </label>
            <select
              id="mpaSpeciesCount"
              className="gps-input"
              style={{ width: "100%", padding: "6px" }}
              value={settings.mpaSpeciesCount ?? 5}
              onChange={(e) => onUpdate({ mpaSpeciesCount: Number(e.target.value) })}
            >
              {[4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n} peixes
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="stack" style={{ gap: "10px" }}>
          {Array.from({ length: 10 }, (_, idx) => {
            const data = settings.mpaSpecies?.[idx] || {};
            const isOptional = idx >= 4;
            return (
              <div
                key={idx}
                style={{
                  background: "white",
                  padding: "8px",
                  borderRadius: "8px",
                  border: `1px solid ${isOptional ? "#e0e0e0" : "var(--color-border)"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label htmlFor={`specie-${idx}`} style={{ fontSize: "10px", fontWeight: "bold", color: "var(--color-accent)" }}>
                    ESPÉCIE {idx + 1}
                  </label>
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: "bold",
                      padding: "2px 6px",
                      borderRadius: "10px",
                      background: isOptional ? "#f0f0f0" : "#e8f4fd",
                      color: isOptional ? "#888" : "#007bff",
                    }}
                  >
                    {isOptional ? "Opcional" : "Obrigatória"}
                  </span>
                </div>

                <SpeciesSearch
                  idx={idx}
                  selectedId={data.id}
                  disabledIds={selectedSpeciesIds}
                  onChange={(id) => updateSpecie(idx, { id })}
                />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                  <div className="stack" style={{ gap: "2px" }}>
                    <span style={{ fontSize: "9px", fontWeight: "bold", color: "#888", textAlign: "center" }}>KG MÍN</span>
                    <input type="number" className="gps-input" style={{ width: "100%", textAlign: "center", fontSize: "11px" }} value={data.kgMin || ""} onChange={(e) => updateSpecie(idx, { kgMin: e.target.value })} placeholder="0" />
                  </div>
                  <div className="stack" style={{ gap: "2px" }}>
                    <span style={{ fontSize: "9px", fontWeight: "bold", color: "#888", textAlign: "center" }}>KG MÁX</span>
                    <input type="number" className="gps-input" style={{ width: "100%", textAlign: "center", fontSize: "11px" }} value={data.kgMax || ""} onChange={(e) => updateSpecie(idx, { kgMax: e.target.value })} placeholder="0" />
                  </div>
                  <div className="stack" style={{ gap: "2px" }}>
                    <span style={{ fontSize: "9px", fontWeight: "bold", color: "#888", textAlign: "center" }}>R$ MÍN</span>
                    <input type="number" className="gps-input" style={{ width: "100%", textAlign: "center", fontSize: "11px" }} value={data.priceMin || ""} onChange={(e) => updateSpecie(idx, { priceMin: e.target.value })} placeholder="0.00" step="0.01" />
                  </div>
                  <div className="stack" style={{ gap: "2px" }}>
                    <span style={{ fontSize: "9px", fontWeight: "bold", color: "#888", textAlign: "center" }}>R$ MÁX</span>
                    <input type="number" className="gps-input" style={{ width: "100%", textAlign: "center", fontSize: "11px" }} value={data.priceMax || ""} onChange={(e) => updateSpecie(idx, { priceMax: e.target.value })} placeholder="0.00" step="0.01" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filled < 4 && (
          <p style={{ fontSize: "10px", color: "#dc3545", textAlign: "center", margin: 0 }}>
            Preencha pelo menos 4 espécies para rodar o REAP.
          </p>
        )}
        {filled >= 4 && filled < count && (
          <p style={{ fontSize: "10px", color: "#856404", textAlign: "center", margin: 0 }}>
            Atenção: {filled} espécie(s) preenchida(s), mas {count} selecionada(s) para sorteio. Serão usadas todas as {filled}.
          </p>
        )}

        {(() => {
          const fishingCount = 12 - (settings.mpaDefesoMonths || []).length;
          const mascMin = Number(settings.mpaMascDaysMin) || 0;
          const mascMax = Number(settings.mpaMascDaysMax) || 0;
          const femMin = Number(settings.mpaFemDaysMin) || 0;
          const femMax = Number(settings.mpaFemDaysMax) || 0;
          return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div className="config-group" style={{ background: "var(--color-surface-alt)", padding: "10px", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
                <h3 style={{ fontSize: "10px", fontWeight: "bold", marginBottom: "8px", color: "var(--color-text)", textAlign: "center", borderBottom: "1px solid var(--color-border)", paddingBottom: "4px" }}>
                  MASCULINO
                </h3>
                <div className="stack" style={{ gap: "8px" }}>
                  <div>
                    <label htmlFor="mpaMascProdMin" style={{ fontSize: "9px", fontWeight: "bold", display: "block", marginBottom: "2px", color: "#666" }}>
                      Produção (R$)
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      <CurrencyInput id="mpaMascProdMin" placeholder="Mín R$" value={settings.mpaMascProdMin || ""} onChange={(v) => onUpdate({ mpaMascProdMin: v })} />
                      <CurrencyInput ariaLabel="Produção Máxima Masculina" placeholder="Máx R$" value={settings.mpaMascProdMax || ""} onChange={(v) => onUpdate({ mpaMascProdMax: v })} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="mpaMascDaysMin" style={{ fontSize: "9px", fontWeight: "bold", display: "block", marginBottom: "2px", color: "#666" }}>
                      Dias/Mês
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      <input id="mpaMascDaysMin" type="number" className="gps-input" style={{ fontSize: "11px" }} placeholder="Mín" min={7} max={27} value={settings.mpaMascDaysMin || ""} onChange={(e) => onUpdate({ mpaMascDaysMin: e.target.value })} />
                      <input type="number" className="gps-input" style={{ fontSize: "11px" }} aria-label="Dias Trabalhados Máximos Masculinos" placeholder="Máx" min={7} max={27} value={settings.mpaMascDaysMax || ""} onChange={(e) => onUpdate({ mpaMascDaysMax: e.target.value })} />
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "4px", textAlign: "center" }}>
                      {mascMin && mascMax ? `Total/ano: ${fishingCount * mascMin}–${fishingCount * mascMax} dias` : "—"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="config-group" style={{ background: "var(--color-surface-alt)", padding: "10px", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
                <h3 style={{ fontSize: "10px", fontWeight: "bold", marginBottom: "8px", color: "var(--color-text)", textAlign: "center", borderBottom: "1px solid var(--color-border)", paddingBottom: "4px" }}>
                  FEMININO
                </h3>
                <div className="stack" style={{ gap: "8px" }}>
                  <div>
                    <label htmlFor="mpaFemProdMin" style={{ fontSize: "9px", fontWeight: "bold", display: "block", marginBottom: "2px", color: "#666" }}>
                      Produção (R$)
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      <CurrencyInput id="mpaFemProdMin" placeholder="Mín R$" value={settings.mpaFemProdMin || ""} onChange={(v) => onUpdate({ mpaFemProdMin: v })} />
                      <CurrencyInput ariaLabel="Produção Máxima Feminina" placeholder="Máx R$" value={settings.mpaFemProdMax || ""} onChange={(v) => onUpdate({ mpaFemProdMax: v })} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="mpaFemDaysMin" style={{ fontSize: "9px", fontWeight: "bold", display: "block", marginBottom: "2px", color: "#666" }}>
                      Dias/Mês
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      <input id="mpaFemDaysMin" type="number" className="gps-input" style={{ fontSize: "11px" }} placeholder="Mín" min={7} max={27} value={settings.mpaFemDaysMin || ""} onChange={(e) => onUpdate({ mpaFemDaysMin: e.target.value })} />
                      <input type="number" className="gps-input" style={{ fontSize: "11px" }} aria-label="Dias Trabalhados Máximos Femininos" placeholder="Máx" min={7} max={27} value={settings.mpaFemDaysMax || ""} onChange={(e) => onUpdate({ mpaFemDaysMax: e.target.value })} />
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "4px", textAlign: "center" }}>
                      {femMin && femMax ? `Total/ano: ${fishingCount * femMin}–${fishingCount * femMax} dias` : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </section>
  );
}
