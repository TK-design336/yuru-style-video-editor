import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { isTauri } from "@/lib/tauri/env";
import "./index.css";

if (isTauri()) {
  document.documentElement.classList.add("tauri-transparent");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
