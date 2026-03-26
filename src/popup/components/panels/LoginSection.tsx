import React from "react";
import { ChevronIcon, GlobeIcon, ClipboardIcon } from "../ui/icons";

export const LoginSection: React.FC<{
  isOpen: boolean;
  onToggle: () => void;
  loading: boolean;
  onShowModal: (type: "pesqbrasil" | "esocial") => void;
}> = ({ isOpen, onToggle, loading, onShowModal }) => {
  return (
    <section className="section accordion">
      <button
        type="button"
        className="accordion-header"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <div className="section-header">
          <h2 className="section-title">Login Múltiplo</h2>
          <p className="section-description">
            Execute múltiplos logins no PesqBrasil ou eSocial
          </p>
        </div>
        <ChevronIcon isOpen={isOpen} />
      </button>
      <div className={`accordion-content ${isOpen ? "open" : "collapsed"}`}>
        <div className="section-content">
          <div className="button-group">
            <button
               className="btn btn-primary"
               onClick={() => onShowModal("pesqbrasil")}
               disabled={loading}
            >
              <GlobeIcon />
              <span className="btn-text">PesqBrasil</span>
            </button>
            <button
               className="btn btn-primary"
               onClick={() => onShowModal("esocial")}
               disabled={loading}
            >
              <ClipboardIcon />
              <span className="btn-text">eSocial</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
