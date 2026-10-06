import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioSite } from "./StudioSite";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StudioSite />
  </StrictMode>,
);
