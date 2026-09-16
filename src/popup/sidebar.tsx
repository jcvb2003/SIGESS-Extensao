import "../shared/utils/browser-shim";
import React from "react";
import ReactDOM from "react-dom/client";
import { BatchSidebarApp } from "./components/sidebar/BatchSidebarApp";
import "./styles/global.css";
import "./styles/sidebar.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BatchSidebarApp />
    </React.StrictMode>,
  );
}
