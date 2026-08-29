import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/archivo";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { store } from "./store/store.ts";
import { ErrorBoundary } from "./components/general/error-boundary.component.tsx";

// Dev builds only. Registers window.__DF_FIXTURES__ (see src/dev/task-fixtures.ts)
// so the console handle works on any page, not just after the Dev settings panel
// has been opened once. `import.meta.env.DEV` is folded to false in a production
// build, taking the dynamic import - and therefore the whole chunk - with it.
// Keep the guard inline; hoisting it into a variable reintroduces the import.
if (import.meta.env.DEV) {
  void import("./dev/fixture-runner.ts");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);
