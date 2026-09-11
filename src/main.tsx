import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Notifications } from "./components/Notifications";
import { TradingModeProvider } from "./trading/TradingMode";
import { TableTerminal } from "./TableTerminal";
import "./styles.css";

const terminal = window.location.pathname === "/table-order-entry" ? <TableTerminal /> : <App orderEntry="form" />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Notifications><TradingModeProvider>{terminal}</TradingModeProvider></Notifications>
  </StrictMode>,
);
