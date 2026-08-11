import { AppSettings } from "../../../../shared/types";
import {
  APETRECHOS_OPTIONS,
  FISHING_LOCATION_OPTIONS,
  MONTH_LABELS,
  REAP_STATE_OPTIONS,
  WORK_RELATION_OPTIONS,
} from "./constants";
import { getMunicipiosByUf } from "./helpers";

function MonthGrid({
  selectedMonths,
  onToggle,
}: {
  selectedMonths: number[];
  onToggle: (month: number) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "5px" }}>
      {MONTH_LABELS.map((label, index) => {
        const month = index + 1;
        const isSelected = selectedMonths.includes(month);
        return (
          <button
            key={month}
            type="button"
            onClick={() => onToggle(month)}
            style={{
              border: isSelected ? "1px solid var(--color-accent-strong)" : "1px solid var(--color-border)",
              background: isSelected ? "var(--color-accent)" : "var(--color-surface-alt)",
              color: isSelected ? "#ffffff" : "var(--color-text)",
              borderRadius: "6px",
              padding: "9px 4px",
              fontSize: "10px",
              fontFamily: "var(--mono)",
              fontWeight: 600,
              letterSpacing: "0.06em",
              cursor: "pointer",
              transition: "all 0.12s",
            }}
          >
            {label.slice(0, 3).toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export function ReapPage1Section({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
}) {
  const residenceUf = settings.mpaResidenceUF;
  const residenceMunicipios = getMunicipiosByUf(residenceUf);

  return (
    <section className="section reap-intro-section" style={{ border: "none" }}>
      <div className="section-header">
        <span className="section-num">01</span>
        <div>
          <h2 className="section-title">Identificação</h2>
          <p className="section-description">Ano de referência, estado e município de residência.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: "12px" }}>
        <div className="form-group">
          <label className="reap-label" htmlFor="mpaReferenceYear">Ano de referência</label>
          <select
            id="mpaReferenceYear"
            className="gps-select"
            value={settings.mpaReferenceYear || ""}
            onChange={(e) => onUpdate({ mpaReferenceYear: e.target.value })}
          >
            <option value="">Selecione...</option>
            {Array.from({ length: Math.max(new Date().getFullYear() - 2025 + 1, 1) }, (_, index) => {
              const year = String(2025 + index);
              return <option key={year} value={year}>{year}</option>;
            })}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="form-group">
            <label className="reap-label" htmlFor="mpaResidenceUF">Estado</label>
            <select
              id="mpaResidenceUF"
              className="gps-select"
              value={residenceUf ?? ""}
              onChange={(e) => onUpdate({ mpaResidenceUF: Number(e.target.value), mpaResidenceMunicipio: undefined })}
            >
              <option value="">Selecione...</option>
              {REAP_STATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} disabled={!option.enabled}>
                  {option.label}{option.enabled ? "" : " (indisponível)"}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaResidenceMunicipio">Município</label>
            <select
              id="mpaResidenceMunicipio"
              className="gps-select"
              value={settings.mpaResidenceMunicipio || ""}
              onChange={(e) => onUpdate({ mpaResidenceMunicipio: Number(e.target.value) })}
            >
              <option value="">Selecione...</option>
              {residenceMunicipios.map((municipio) => (
                <option key={municipio.id} value={municipio.id}>{municipio.nome}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ReapPage2Section({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
}) {
  const commercializationState = settings.mpaCommercializationStates?.[0];

  return (
    <section className="section reap-intro-section" style={{ border: "none" }}>
      <div className="section-header">
        <span className="section-num">02</span>
        <div>
          <h2 className="section-title">Atividade</h2>
          <p className="section-description">Relação de trabalho e estados de comercialização.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: "12px" }}>
        <div className="form-group">
          <label className="reap-label" htmlFor="mpaWorkRelation">Relação de trabalho</label>
          <select
            id="mpaWorkRelation"
            className="gps-select"
            value={settings.mpaWorkRelation || ""}
            onChange={(e) => onUpdate({ mpaWorkRelation: e.target.value })}
          >
            <option value="">Selecione...</option>
            {WORK_RELATION_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="reap-label">Estados de comercialização</label>
          <select
            id="mpaCommercializationState"
            className="gps-select"
            value={commercializationState ?? ""}
            onChange={(e) => onUpdate({
              mpaCommercializationStates: e.target.value ? [Number(e.target.value)] : [],
            })}
          >
            <option value="">Selecione...</option>
            {REAP_STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} disabled={!option.enabled}>
                {option.label}{option.enabled ? "" : " (indisponível)"}
              </option>
            ))}
          </select>
          <p className="reap-note">Selecione apenas um estado.</p>
        </div>
      </div>
    </section>
  );
}

export function ReapPage3Section({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
}) {
  const fishingUf = settings.mpaUF;
  const fishingMunicipios = getMunicipiosByUf(fishingUf);
  const defesoMonths = settings.mpaDefesoMonths ?? [];

  const toggleDefesoMonth = (month: number) => {
    const next = defesoMonths.includes(month)
      ? defesoMonths.filter((item) => item !== month)
      : [...defesoMonths, month].sort((a, b) => a - b);
    onUpdate({ mpaDefesoMonths: next });
  };

  return (
    <section className="section">
      <div className="section-header">
        <span className="section-num">03</span>
        <div>
          <h2 className="section-title">Locais de Pesca</h2>
          <p className="section-description">Defeso, método, área e município de captura.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: "14px" }}>
        <div className="form-group">
          <label className="reap-label">Meses de defeso</label>
          <MonthGrid selectedMonths={defesoMonths} onToggle={toggleDefesoMonth} />
          {defesoMonths.length === 0 && (
            <p className="reap-note">Selecione ao menos um mês.</p>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="form-group">
            <label className="reap-label" htmlFor="mpaLocalPesca">Local</label>
            <select
              id="mpaLocalPesca"
              className="gps-select"
              value={settings.mpaLocalPesca ?? ""}
              onChange={(e) => onUpdate({ mpaLocalPesca: Number(e.target.value) })}
            >
              <option value="">Selecione...</option>
              {FISHING_LOCATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaMetodoPesca">Petrecho</label>
            <select
              id="mpaMetodoPesca"
              className="gps-select"
              value={settings.mpaMetodoPesca ?? settings.mpaPetrecho ?? ""}
              onChange={(e) => onUpdate({ mpaMetodoPesca: Number(e.target.value) })}
            >
              <option value="">Selecione...</option>
              {APETRECHOS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaUF">UF</label>
            <select
              id="mpaUF"
              className="gps-select"
              value={fishingUf ?? ""}
              onChange={(e) => onUpdate({ mpaUF: Number(e.target.value), mpaMunicipio: undefined })}
            >
              <option value="">Selecione...</option>
              {REAP_STATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} disabled={!option.enabled}>
                  {option.label}{option.enabled ? "" : " (indisponível)"}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaMunicipio">Município</label>
            <select
              id="mpaMunicipio"
              className="gps-select"
              value={settings.mpaMunicipio || ""}
              onChange={(e) => onUpdate({ mpaMunicipio: Number(e.target.value) })}
            >
              <option value="">Selecione...</option>
              {fishingMunicipios.map((municipio) => (
                <option key={municipio.id} value={municipio.id}>{municipio.nome}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}
