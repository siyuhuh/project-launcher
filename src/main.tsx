import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/fira-code";
import App from "./App";
import { I18nProvider } from "./lib/i18n";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
