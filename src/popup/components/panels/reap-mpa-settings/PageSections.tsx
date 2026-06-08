import { AppSettings } from "../../../../shared/types";
import {
  APETRECHOS_OPTIONS,
  FISHING_ENVIRONMENT_OPTIONS,
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: "8px",
      }}
    >
      {MONTH_LABELS.map((label, index) => {
        const month = index + 1;
        const isSelected = selectedMonths.includes(month);
        return (
          <button
            key={month}
            type="button"
            onClick={() => onToggle(month)}
            style={{
              border: isSelected ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
              background: isSelected ? "var(--color-accent-soft)" : "white",
              color: isSelected ? "var(--color-accent-strong)" : "var(--color-text)",
              borderRadius: "10px",
              padding: "10px 6px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function MultiStateSelector({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const toggle = (value: number) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
      return;
    }
    onChange([...selected, value]);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: "8px",
      }}
    >
      {REAP_STATE_OPTIONS.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <label
            key={option.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px",
              borderRadius: "10px",
              border: checked ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
              background: checked ? "var(--color-accent-soft)" : "white",
              opacity: option.enabled ? 1 : 0.45,
              cursor: option.enabled ? "pointer" : "not-allowed",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              disabled={!option.enabled}
              checked={checked}
              onChange={() => toggle(option.value)}
            />
            <span>{option.label}</span>
          </label>
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
  const residenceUf = settings.mpaResidenceUF ?? 5;
  const residenceMunicipios = getMunicipiosByUf(residenceUf);

  return (
    <section className="section" style={{ padding: "16px" }}>
      <div className="section-header">
        <h2 className="section-title">Página 1</h2>
        <p className="section-description">Identificação do pescador e dados de residência.</p>
      </div>

      <div className="stack" style={{ gap: "12px" }}>
        <div className="form-group">
          <label className="reap-label" htmlFor="mpaReferenceYear">Ano de referência do REAP</label>
          <select
            id="mpaReferenceYear"
            className="gps-select"
            value={settings.mpaReferenceYear || "2025"}
            onChange={(e) => onUpdate({ mpaReferenceYear: e.target.value })}
          >
            {Array.from({ length: Math.max(new Date().getFullYear() - 2025 + 1, 1) }, (_, index) => {
              const year = String(2025 + index);
              return (
                <option key={year} value={year}>
                  {year}
                </option>
              );
            })}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="form-group">
            <label className="reap-label" htmlFor="mpaResidenceUF">Estado de residência</label>
            <select
              id="mpaResidenceUF"
              className="gps-select"
              value={residenceUf}
              onChange={(e) =>
                onUpdate({
                  mpaResidenceUF: Number(e.target.value),
                  mpaResidenceMunicipio: undefined,
                })
              }
            >
              {REAP_STATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} disabled={!option.enabled}>
                  {option.label}{option.enabled ? "" : " (indisponível)"}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaResidenceMunicipio">Município de residência</label>
            <select
              id="mpaResidenceMunicipio"
              className="gps-select"
              value={settings.mpaResidenceMunicipio || ""}
              onChange={(e) => onUpdate({ mpaResidenceMunicipio: Number(e.target.value) })}
            >
              <option value="">Selecione um município...</option>
              {residenceMunicipios.map((municipio) => (
                <option key={municipio.id} value={municipio.id}>
                  {municipio.nome}
                </option>
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
  const commercializationStates = settings.mpaCommercializationStates ?? [5];

  return (
    <section className="section" style={{ padding: "16px" }}>
      <div className="section-header">
        <h2 className="section-title">Página 2</h2>
        <p className="section-description">Dados da atividade e estados de comercialização.</p>
      </div>

      <div className="stack" style={{ gap: "12px" }}>
        <div className="form-group">
          <label className="reap-label" htmlFor="mpaWorkRelation">Relação de trabalho</label>
          <select
            id="mpaWorkRelation"
            className="gps-select"
            value={settings.mpaWorkRelation || "Economia Familiar"}
            onChange={(e) => onUpdate({ mpaWorkRelation: e.target.value })}
          >
            {WORK_RELATION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="reap-label">Estado de comercialização nos meses de referência</label>
          <MultiStateSelector
            selected={commercializationStates}
            onChange={(next) => onUpdate({ mpaCommercializationStates: next })}
          />
          <p className="reap-note">Somente Pará e Maranhão ficam habilitados por enquanto.</p>
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
  const fishingUf = settings.mpaUF ?? 5;
  const fishingMunicipios = getMunicipiosByUf(fishingUf);
  const defesoMonths = settings.mpaDefesoMonths ?? [1, 2, 3, 4];

  const toggleDefesoMonth = (month: number) => {
    const next = defesoMonths.includes(month)
      ? defesoMonths.filter((item) => item !== month)
      : [...defesoMonths, month].sort((a, b) => a - b);
    onUpdate({ mpaDefesoMonths: next });
  };

  return (
    <section className="section" style={{ padding: "16px" }}>
      <div className="section-header">
        <h2 className="section-title">Página 3</h2>
        <p className="section-description">Meses de defeso e perfil dos meses com pesca.</p>
      </div>

      <div className="stack" style={{ gap: "14px" }}>
        <div className="form-group">
          <label className="reap-label">Marque os meses do período de defeso.</label>
          <MonthGrid selectedMonths={defesoMonths} onToggle={toggleDefesoMonth} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="form-group">
            <label className="reap-label" htmlFor="mpaLocalPesca">Local da pesca</label>
            <select
              id="mpaLocalPesca"
              className="gps-select"
              value={settings.mpaLocalPesca ?? 6}
              onChange={(e) => onUpdate({ mpaLocalPesca: Number(e.target.value) })}
            >
              {FISHING_LOCATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaMetodoPesca">Método de pesca</label>
            <select
              id="mpaMetodoPesca"
              className="gps-select"
              value={settings.mpaMetodoPesca ?? settings.mpaPetrecho ?? 4}
              onChange={(e) => onUpdate({ mpaMetodoPesca: Number(e.target.value) })}
            >
              {APETRECHOS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaUF">UF</label>
            <select
              id="mpaUF"
              className="gps-select"
              value={fishingUf}
              onChange={(e) =>
                onUpdate({
                  mpaUF: Number(e.target.value),
                  mpaMunicipio: undefined,
                })
              }
            >
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
              <option value="">Selecione um município...</option>
              {fishingMunicipios.map((municipio) => (
                <option key={municipio.id} value={municipio.id}>
                  {municipio.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaPetrecho">Petrecho de pesca</label>
            <select
              id="mpaPetrecho"
              className="gps-select"
              value={settings.mpaPetrecho ?? 4}
              onChange={(e) => onUpdate({ mpaPetrecho: Number(e.target.value) })}
            >
              {APETRECHOS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="reap-label" htmlFor="mpaAmbiente">Ambiente de pesca</label>
            <select
              id="mpaAmbiente"
              className="gps-select"
              value={settings.mpaAmbiente ?? 1}
              onChange={(e) => onUpdate({ mpaAmbiente: Number(e.target.value) })}
            >
              {FISHING_ENVIRONMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}
