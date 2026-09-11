import { useState } from "react";
import { Bell, ChevronDown, Ellipsis, LoaderCircle, Plus, UserRound } from "lucide-react";
import { useNotifications } from "./Notifications";
import { useTradingMode } from "../trading/TradingMode";
import "./TerminalHeader.css";

const metrics = [
  ["Balance", "$9,996,224.18"],
  ["Equity", "$9,996,224.18"],
  ["Net liquidation", "$9,996,224.18"],
  ["UPL", "$9,996,224.18", "positive"],
  ["Day RPL", "$9,996,224.18"],
  ["Open P/L", "$9,996,224.18"],
  ["Day total P/L", "$9,996,224.18"],
  ["Margin used", "$9,996,224.18"],
] as const;

type Menu = "account" | "market" | null;

export type Workspace = "workspace-1" | "workspace-2" | "workspace-3";

const workspaces = [
  ["workspace-1", "Workspace 1"],
  ["workspace-2", "Workspace 2"],
  ["workspace-3", "Workspace 3"],
] as const;

export function TerminalHeader({ workspace, onWorkspaceChange }: { workspace: Workspace; onWorkspaceChange: (workspace: Workspace) => void }) {
  const { notify } = useNotifications();
  const { oneClick, setOneClick } = useTradingMode();
  const [menu, setMenu] = useState<Menu>(null);
  const [flattening, setFlattening] = useState(false);

  const runFlatten = () => {
    setFlattening(true);
    window.setTimeout(() => {
      setFlattening(false);
      notify({ kind: "standard", tone: "success", title: "Positions Flattened", message: "All open positions were flattened", detail: "BroAccount" });
    }, 1000);
  };

  return (
    <header className="terminal-header-wrap">
      <div className="terminal-header" aria-label="Terminal header">
        <button className="terminal-logo" type="button">
          <img src="/assets/devexperts-logo.svg" alt="Devexperts" />
        </button>

        <div className="header-account-wrap">
          <button
            className={`header-account ${menu === "account" ? "is-open" : ""}`}
            type="button"
            aria-expanded={menu === "account"}
            onClick={() => setMenu(menu === "account" ? null : "account")}
          >
            <span className="account-copy">
              <span className="header-label">Account</span>
              <span className="account-line">
                <span className="account-pill account-demo">demo</span>
                <span className="account-pill account-equities">eq</span>
                <span>bro13-E</span>
              </span>
            </span>
            <ChevronDown className="chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {menu === "account" ? (
            <div className="header-menu account-menu">
              <button type="button" onClick={() => setMenu(null)}>demo · eq · bro13-E</button>
              <button type="button" onClick={() => setMenu(null)}>Connect live account</button>
            </div>
          ) : null}
        </div>

        <div className="header-metrics">
          <div className="metrics-content">
            {metrics.map(([label, value, tone]) => (
              <div className="header-metric" key={label}>
                <span className="header-label">{label}</span>
                <span className={tone === "positive" ? "metric-value positive" : "metric-value"}>{value}</span>
              </div>
            ))}
          </div>
          <span className="metrics-separator" aria-hidden="true" />
          <button className="metric-more" type="button" aria-label="More account metrics">
            <Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="header-additional">
          <div className="header-time">
            <span className="header-label">UTC +2:00</span>
            <span>18 Aug, 13:35:03</span>
          </div>

          <div className="header-market-wrap">
            <button
              className={`header-market ${menu === "market" ? "is-open" : ""}`}
              type="button"
              aria-expanded={menu === "market"}
              onClick={() => setMenu(menu === "market" ? null : "market")}
            >
              <span className="header-label">Market data</span>
              <span className="market-status"><i className="status-dot" /> <span>Realtime</span> <ChevronDown className="chevron" size={16} strokeWidth={1.75} aria-hidden="true" /></span>
            </button>
            {menu === "market" ? (
              <div className="header-menu market-menu">
                <button type="button" onClick={() => setMenu(null)}>Realtime <span className="status-dot" /></button>
                <button type="button" onClick={() => setMenu(null)}>Delayed · 15 min</button>
              </div>
            ) : null}
          </div>

          <button className="header-icon-button" type="button" aria-label="Notifications">
            <Bell className="header-icon" size={16} strokeWidth={1.75} aria-hidden="true" /><span className="notification-dot" />
          </button>
          <button className="header-icon-button" type="button" aria-label="Settings"><UserRound className="header-icon" size={16} strokeWidth={1.75} aria-hidden="true" /></button>
        </div>
      </div>

      <div className="terminal-subheader" aria-label="Workspace controls">
        <div className="workspace-controls">
          <button className="add-widget" type="button">Add widget <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" /></button>
          <span className="workspace-separator" aria-hidden="true" />
          <nav className="workspace-tabs" aria-label="Workspaces">
            {workspaces.map(([id, name]) => (
              <button
                className={`workspace-tab ${id === workspace ? "is-active" : ""}`}
                type="button"
                key={id}
                aria-current={id === workspace ? "page" : undefined}
                onClick={() => onWorkspaceChange(id)}
              >
                <span>{name}</span><Ellipsis className="workspace-tab-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            ))}
            <button className="workspace-add" type="button" aria-label="Add workspace"><Plus size={16} strokeWidth={1.75} aria-hidden="true" /></button>
          </nav>
        </div>

        <div className="addition-panel">
          <label className="switch-control">
            <input type="checkbox" aria-label="One-click trading" checked={oneClick} onChange={(event) => setOneClick(event.target.checked)} />
            <span className="switch-track" aria-hidden="true"><span /></span>
            <span>One-click trading</span>
          </label>
          <button className="flatten-button" type="button" disabled={flattening} aria-busy={flattening} aria-label={flattening ? "Flattening positions" : "Flatten all positions"} onClick={runFlatten}>
            {flattening ? <LoaderCircle className="flatten-loader" size={14} aria-hidden="true" /> : "Flatten all"}
          </button>
        </div>
      </div>
    </header>
  );
}
