import React from "react";
import { AppSettings } from "../../../shared/types";
import { ChevronIcon } from "../ui/icons";

interface ReapMpaPanelProps {
  settings: AppSettings;
  onUpdate: (data: Partial<AppSettings>) => void;
  isOpen: boolean;
  onToggle: () => void;
}

function getStateName(value?: number) {
  if (value === 5) return "PARÁ";
  if (value === 8) return "MARANHÃO";
  return "Não definido";
}

const ReapMpaPanel: React.FC<ReapMpaPanelProps> = ({
  settings,
  isOpen,
  onToggle,
}) => {
  const openSettingsPage = () => {
    browser.tabs.create({ url: browser.runtime.getURL("reap_mpa_settings.html") });
  };

  const filledSpecies = settings.mpaSpecies?.filter((item) => item?.id).length ?? 0;
  const defesoMonths = settings.mpaDefesoMonths?.length ?? 4;

  return (
    <section className="section accordion">
      <button
        type="button"
        className="accordion-header"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <div className="section-header">
          <h2 className="section-title">REAP MPA</h2>
          <p className="section-description">
            Acesse a página dedicada para configurar as páginas 1, 2 e 3 do REAP.
          </p>
        </div>
        <ChevronIcon isOpen={isOpen} />
      </button>

      <div className={`accordion-content ${isOpen ? "open" : "collapsed"}`}>
        <div className="section-content">
          <div
            style={{
              display: "grid",
              gap: "12px",
              background: "linear-gradient(180deg, rgba(15, 118, 110, 0.08) 0%, rgba(255,255,255,0.95) 100%)",
              border: "1px solid var(--color-border)",
              borderRadius: "16px",
              padding: "16px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "8px",
              }}
            >
              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  border: "1px solid var(--color-border)",
                  padding: "10px",
                }}
              >
                <div style={{ fontSize: "10px", fontWeight: 800, color: "var(--color-muted)", textTransform: "uppercase" }}>
                  UF da pesca
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "4px" }}>
                  {getStateName(settings.mpaUF)}
                </div>
              </div>

              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  border: "1px solid var(--color-border)",
                  padding: "10px",
                }}
              >
                <div style={{ fontSize: "10px", fontWeight: 800, color: "var(--color-muted)", textTransform: "uppercase" }}>
                  Meses de defeso
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "4px" }}>
                  {defesoMonths} mês(es)
                </div>
              </div>

              <div
                style={{
                  background: "white",
                  borderRadius: "12px",
                  border: "1px solid var(--color-border)",
                  padding: "10px",
                }}
              >
                <div style={{ fontSize: "10px", fontWeight: 800, color: "var(--color-muted)", textTransform: "uppercase" }}>
                  Espécies prontas
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "4px" }}>
                  {filledSpecies}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: "8px" }}>
              <button type="button" className="btn btn-primary btn-full" onClick={openSettingsPage}>
                Abrir configurações do REAP
              </button>
              <p style={{ fontSize: "11px", color: "var(--color-muted)", textAlign: "center", margin: 0 }}>
                As opções do REAP MPA foram movidas para uma página dedicada da extensão.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ReapMpaPanel;
