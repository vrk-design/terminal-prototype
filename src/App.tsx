import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { X } from "lucide-react";
import { AccountMetrics } from "./components/AccountMetrics";
import { OrderEntry } from "./components/OrderEntry";
import { TableOrderEntry } from "./components/TableOrderEntry";
import { TerminalHeader, type Workspace } from "./components/TerminalHeader";
import { OptionChain } from "./components/OptionChain";
import { RiskProfile } from "./components/RiskProfile";
import { Watchlist } from "./components/Watchlist";
import { useTradingMode } from "./trading/TradingMode";

type ResizeState =
  | { kind: "idle" }
  | { kind: "horizontal" }
  | { kind: "vertical" };

const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

export function App({ orderEntry }: { orderEntry: "form" | "table" }) {
  const { liveTradeTransition, confirmLiveTrade, cancelLiveTrade } = useTradingMode();
  const [workspace, setWorkspace] = useState<Workspace>("workspace-1");
  const [optionHeight, setOptionHeight] = useState(675);
  const [accountWidth, setAccountWidth] = useState(543);
  const [resizeState, setResizeState] = useState<ResizeState>({ kind: "idle" });
  const workspaceRef = useRef<HTMLElement>(null);
  const lowerWidgetsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workspace !== "workspace-1") return;
    const element = workspaceRef.current!;
    const fitWidgets = () => setOptionHeight((height) => Math.min(height, Math.max(220, element.clientHeight - 156)));
    const observer = new ResizeObserver(fitWidgets);
    fitWidgets();
    observer.observe(element);
    return () => observer.disconnect();
  }, [workspace]);

  const moveHorizontal = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeState.kind !== "horizontal") return;
    const bounds = workspaceRef.current!.getBoundingClientRect();
    const maximum = bounds.height - 156;
    setOptionHeight(clamp(event.clientY - bounds.top, Math.min(360, maximum), maximum));
  };

  const moveVertical = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeState.kind !== "vertical") return;
    const bounds = lowerWidgetsRef.current!.getBoundingClientRect();
    setAccountWidth(clamp(event.clientX - bounds.left, 280, bounds.width - 364));
  };

  const resizeHorizontalWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const bounds = workspaceRef.current!.getBoundingClientRect();
    const change = event.key === "ArrowUp" ? -12 : 12;
    const maximum = bounds.height - 156;
    setOptionHeight((height) => clamp(height + change, Math.min(360, maximum), maximum));
  };

  const resizeVerticalWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const bounds = lowerWidgetsRef.current!.getBoundingClientRect();
    const change = event.key === "ArrowLeft" ? -12 : 12;
    setAccountWidth((width) => clamp(width + change, 280, bounds.width - 364));
  };

  return (
    <main className={`terminal-shell resize-${resizeState.kind}`}>
      <div className="terminal-shell-body">
        <TerminalHeader workspace={workspace} onWorkspaceChange={setWorkspace} />
        {workspace === "workspace-2" ? (
          <section className="risk-workspace">
            <RiskProfile />
            <div className="collapsed-widget-bars" aria-hidden="true"><span /><span /></div>
          </section>
        ) : workspace === "workspace-3" ? (
          <section className="empty-workspace" aria-label="Empty workspace" />
        ) : (
          <section
            ref={workspaceRef}
            className="workspace-grid"
            style={{ gridTemplateRows: `${optionHeight}px minmax(150px, 1fr)` }}
          >
            <OptionChain />
            <div
              className={`resize-handle resize-handle-horizontal ${resizeState.kind === "horizontal" ? "is-active" : ""}`}
              style={{ top: optionHeight - 2 }}
              role="separator"
              tabIndex={0}
              aria-label="Resize option chain and lower widgets"
              aria-orientation="horizontal"
              aria-valuenow={optionHeight}
              onKeyDown={resizeHorizontalWithKeyboard}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setResizeState({ kind: "horizontal" });
              }}
              onPointerMove={moveHorizontal}
              onPointerUp={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId);
                setResizeState({ kind: "idle" });
              }}
              onPointerCancel={() => setResizeState({ kind: "idle" })}
            />
            <div
              ref={lowerWidgetsRef}
              className="lower-widgets"
              style={{ gridTemplateColumns: `${accountWidth}px minmax(360px, 1fr)` }}
            >
              <AccountMetrics />
              <Watchlist />
              <div
                className={`resize-handle resize-handle-vertical ${resizeState.kind === "vertical" ? "is-active" : ""}`}
                style={{ left: accountWidth - 2 }}
                role="separator"
                tabIndex={0}
                aria-label="Resize account metrics and watchlist"
                aria-orientation="vertical"
                aria-valuenow={accountWidth}
                onKeyDown={resizeVerticalWithKeyboard}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setResizeState({ kind: "vertical" });
                }}
                onPointerMove={moveVertical}
                onPointerUp={(event) => {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  setResizeState({ kind: "idle" });
                }}
                onPointerCancel={() => setResizeState({ kind: "idle" })}
              />
            </div>
          </section>
        )}
        {orderEntry === "form" ? <OrderEntry /> : <TableOrderEntry />}

        {liveTradeTransition.kind === "simulated-to-live" ? (
          <div className="confirmation-layer">
            <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="live-order-title" aria-describedby="live-order-description">
              <button className="confirmation-close" type="button" aria-label="Cancel" onClick={cancelLiveTrade}><X aria-hidden="true" /></button>
              <h2 id="live-order-title">Create a real order?</h2>
              <p id="live-order-description">Trading this simulated position will create a real order and send it to the market.</p>
              <div className="confirmation-actions">
                <button className="confirmation-cancel" type="button" onClick={cancelLiveTrade}>Cancel</button>
                <button className="confirmation-submit" type="button" onClick={confirmLiveTrade}>Send Order</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
