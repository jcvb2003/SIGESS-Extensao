import React from "react";
import { createRoot } from "react-dom/client";
import { UpdateBlockScreen } from "./components/App";
import "./styles/global.css";

const container = document.getElementById("root");

if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <UpdateBlockScreen info={{ version: "3.2.0" }} />
    </React.StrictMode>,
  );
}
