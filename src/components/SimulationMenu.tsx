import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FlaskConical } from "lucide-react";
import type { TradeRequest } from "../trading/types";
import "./SelectMenu.css";
import "./SimulationMenu.css";

export type TradeMenuQuote = {
  price: string;
  trade: TradeRequest;
  disabled: boolean;
};

export type TradeMenuSelection = { title: string; sell: TradeMenuQuote; buy: TradeMenuQuote };

export function SimulationMenu({ x, y, title, sell, buy, onTrade, onSimulate, onClose }: { x: number; y: number; title: string; sell: TradeMenuQuote; buy: TradeMenuQuote; onTrade: (trade: TradeRequest) => void; onSimulate: (trade: TradeRequest) => void; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    const closeWithKeyboard = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeWithKeyboard);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 331));
  const top = Math.max(8, Math.min(y, window.innerHeight - 222));

  return createPortal(
    <div className="select-menu simulation-menu" style={{ left, top }} onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
      <div className="select-menu-list simulation-menu-list" role="menu" aria-label={`Trade actions for ${title}`}>
        <div className="simulation-menu-header">{title}</div>
        <button className="select-menu-option is-sell" type="button" role="menuitem" disabled={sell.disabled} onClick={() => { onTrade(sell.trade); onClose(); }}>Sell at Bid {sell.price}</button>
        <button className="select-menu-option is-buy" type="button" role="menuitem" disabled={buy.disabled} onClick={() => { onTrade(buy.trade); onClose(); }}>Buy at Ask {buy.price}</button>
        <div className="simulation-menu-separator" role="separator" />
        <button className="select-menu-option" type="button" role="menuitem" disabled={sell.disabled} onClick={() => { onSimulate(sell.trade); onClose(); }}><FlaskConical aria-hidden="true" /><span>Create Sim Position at Bid {sell.price}</span></button>
        <button className="select-menu-option" type="button" role="menuitem" disabled={buy.disabled} onClick={() => { onSimulate(buy.trade); onClose(); }}><FlaskConical aria-hidden="true" /><span>Create Sim Position at Ask {buy.price}</span></button>
      </div>
    </div>,
    document.body,
  );
}
