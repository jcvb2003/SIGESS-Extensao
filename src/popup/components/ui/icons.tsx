import React from "react";

export const ExpandIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <div style={{
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    border: `1.5px solid ${isOpen ? "var(--color-accent)" : "var(--color-border-strong)"}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: isOpen ? "var(--color-accent)" : "var(--color-muted)",
    fontSize: "15px",
    fontWeight: 400,
    lineHeight: 1,
    flexShrink: 0,
    transition: "border-color 0.2s ease, color 0.2s ease",
    userSelect: "none",
    fontFamily: "system-ui, sans-serif",
  }}>
    {isOpen ? "−" : "+"}
  </div>
);

/** @deprecated use ExpandIcon */
export const ChevronIcon: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <ExpandIcon isOpen={isOpen} />
);

export const GlobeIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export const ClipboardIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);
