import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useNotifications } from "../components/Notifications";
import type { Position, TradeRequest } from "./types";
import "./TradingMode.css";

export type LiveTradeTransition = { kind: "idle" } | { kind: "simulated-to-live"; trade: TradeRequest };

type Session = {
  oneClick: boolean;
  simulatedPositions: Position[];
  realPositions: Position[];
};

type TradingModeActions = {
  oneClick: boolean;
  simulatedPositions: Position[];
  realPositions: Position[];
  tradeDraft: TradeRequest | null;
  customStrategyLegDraft: TradeRequest | null;
  liveTradeTransition: LiveTradeTransition;
  setOneClick: (enabled: boolean) => void;
  requestTrade: (trade: TradeRequest) => void;
  requestCustomStrategyLeg: (trade: TradeRequest) => void;
  placeTrade: (trade: TradeRequest) => void;
  simulateTrade: (trade: TradeRequest) => void;
  clearTradeDraft: () => void;
  clearCustomStrategyLegDraft: () => void;
  removeSimulatedPosition: (id: string) => void;
  removeRealPosition: (id: string) => void;
  requestLiveTrade: (trade: TradeRequest) => void;
  confirmLiveTrade: () => void;
  cancelLiveTrade: () => void;
};

const sessionKey = "terminal-prototype-session";
const channelKey = "terminal-prototype-session-sync";
const defaultSession: Session = { oneClick: false, simulatedPositions: [], realPositions: [] };
const withSignedQuantity = (trade: TradeRequest): TradeRequest => ({ ...trade, quantity: trade.side === "Sell" ? -Math.abs(trade.quantity) : Math.abs(trade.quantity) });
const legacySingleSpread = /^\d+(\.\d+)? (Call|Put)$/;
const normalizePosition = (position: Position): Position => legacySingleSpread.test(position.spread) ? { ...position, spread: "Single" } : position;
const normalizePositions = (positions: Position[]): Position[] => positions.map(normalizePosition);

function assertSession(value: unknown): asserts value is Session {
  if (!value || typeof value !== "object") throw new Error("Invalid terminal session");
  const record = value as Record<string, unknown>;
  if (typeof record.oneClick !== "boolean") throw new Error("Invalid one-click setting");
  if (!Array.isArray(record.simulatedPositions)) throw new Error("Invalid simulated positions");
  if (record.realPositions !== undefined && !Array.isArray(record.realPositions)) throw new Error("Invalid real positions");
}

function readSession(): Session {
  const saved = window.localStorage.getItem(sessionKey);
  if (!saved) return defaultSession;
  const parsed: unknown = JSON.parse(saved);
  assertSession(parsed);
  return { oneClick: parsed.oneClick, simulatedPositions: normalizePositions(parsed.simulatedPositions), realPositions: normalizePositions(Array.isArray(parsed.realPositions) ? parsed.realPositions : []) };
}

export function TradingModeProvider({ children }: { children: ReactNode }) {
  const { createSimulatedPosition, placeOrder } = useNotifications();
  const [session, setSession] = useState<Session>(readSession);
  const [liveTradeTransition, setLiveTradeTransition] = useState<LiveTradeTransition>({ kind: "idle" });
  const [tradeDraft, setTradeDraft] = useState<TradeRequest | null>(null);
  const [customStrategyLegDraft, setCustomStrategyLegDraft] = useState<TradeRequest | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const sessionRef = useRef(session);
  const nextPositionId = useRef(0);

  useEffect(() => {
    const channel = new BroadcastChannel(channelKey);
    channelRef.current = channel;
    const applySession = (value: unknown) => {
      assertSession(value);
      const next = { oneClick: value.oneClick, simulatedPositions: normalizePositions(value.simulatedPositions), realPositions: normalizePositions(value.realPositions) };
      sessionRef.current = next;
      setSession(next);
    };
    const onMessage = (event: MessageEvent<unknown>) => applySession(event.data);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== sessionKey || !event.newValue) return;
      applySession(JSON.parse(event.newValue) as unknown);
    };
    channel.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      channel.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const updateSession = useCallback((next: Session) => {
    sessionRef.current = next;
    setSession(next);
    window.localStorage.setItem(sessionKey, JSON.stringify(next));
    channelRef.current?.postMessage(next);
  }, []);

  const setOneClick = useCallback((enabled: boolean) => {
    updateSession({ ...sessionRef.current, oneClick: enabled });
  }, [updateSession]);

  const createPositions = (trade: TradeRequest, kind: Position["kind"], idPrefix: string): Position[] => {
    if (!trade.legs || trade.legs.length === 0) {
      return [{
        id: `${idPrefix}-${Date.now()}-${nextPositionId.current++}`,
        kind,
        spread: trade.spread,
        side: trade.side,
        qty: trade.quantity,
        expiration: trade.expiration,
        strike: trade.strike,
        optionType: trade.optionType,
        price: trade.price,
        symbol: trade.symbol,
        volatility: "—",
        delta: "—",
        group: trade.spread === "Stock" ? "stock" : "single",
      }];
    }
    const groupId = `${idPrefix}-${Date.now()}-${nextPositionId.current++}`;
    return trade.legs.map((leg, index) => ({
      id: index === 0 ? groupId : `${groupId}-leg-${index}`,
      kind,
      spread: index === 0 ? trade.spread : "",
      side: leg.side,
      qty: leg.quantity,
      expiration: leg.expiration,
      strike: leg.strike,
      optionType: leg.optionType,
      price: leg.price,
      symbol: trade.symbol,
      volatility: "—",
      delta: "—",
      group: "leg",
      parentId: index === 0 ? undefined : groupId,
    }));
  };

  const placeTrade = useCallback((trade: TradeRequest) => {
    const current = sessionRef.current;
    updateSession({ ...current, realPositions: [...createPositions(trade, "real", "real"), ...current.realPositions] });
    placeOrder(trade.message);
  }, [placeOrder, updateSession]);

  const simulateTrade = useCallback((trade: TradeRequest) => {
    const signedTrade = withSignedQuantity(trade);
    const current = sessionRef.current;
    updateSession({ ...current, simulatedPositions: [...createPositions(signedTrade, "simulated", "sim"), ...current.simulatedPositions] });
    createSimulatedPosition(signedTrade.message);
  }, [createSimulatedPosition, updateSession]);

  const requestTrade = useCallback((trade: TradeRequest) => {
    const signedTrade = withSignedQuantity(trade);
    if (session.oneClick) {
      placeTrade(signedTrade);
      return;
    }
    setTradeDraft(signedTrade);
  }, [placeTrade, session.oneClick]);

  const requestCustomStrategyLeg = useCallback((trade: TradeRequest) => {
    setCustomStrategyLegDraft(withSignedQuantity(trade));
  }, []);

  const removeSimulatedPosition = useCallback((id: string) => {
    const current = sessionRef.current;
    updateSession({ ...current, simulatedPositions: current.simulatedPositions.filter((position) => position.id !== id && position.parentId !== id) });
  }, [updateSession]);

  const removeRealPosition = useCallback((id: string) => {
    const current = sessionRef.current;
    updateSession({ ...current, realPositions: current.realPositions.filter((position) => position.id !== id && position.parentId !== id) });
  }, [updateSession]);

  const requestLiveTrade = useCallback((trade: TradeRequest) => {
    setLiveTradeTransition({ kind: "simulated-to-live", trade });
  }, []);

  const confirmLiveTrade = useCallback(() => {
    if (liveTradeTransition.kind !== "simulated-to-live") return;
    const current = sessionRef.current;
    updateSession({ ...current, realPositions: [...createPositions(liveTradeTransition.trade, "real", "real"), ...current.realPositions] });
    placeOrder(liveTradeTransition.trade.message);
    setLiveTradeTransition({ kind: "idle" });
  }, [liveTradeTransition, placeOrder, updateSession]);

  const cancelLiveTrade = useCallback(() => setLiveTradeTransition({ kind: "idle" }), []);

  return (
    <TradingModeContext.Provider value={{
      oneClick: session.oneClick,
      simulatedPositions: session.simulatedPositions,
      realPositions: session.realPositions,
      tradeDraft,
      customStrategyLegDraft,
      liveTradeTransition,
      setOneClick,
      requestTrade,
      requestCustomStrategyLeg,
      placeTrade,
      simulateTrade,
      clearTradeDraft: () => setTradeDraft(null),
      clearCustomStrategyLegDraft: () => setCustomStrategyLegDraft(null),
      removeSimulatedPosition,
      removeRealPosition,
      requestLiveTrade,
      confirmLiveTrade,
      cancelLiveTrade,
    }}>
      {children}
    </TradingModeContext.Provider>
  );
}

const TradingModeContext = createContext<TradingModeActions | null>(null);

export function useTradingMode() {
  return useContext(TradingModeContext)!;
}
