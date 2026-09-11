import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronsDown, ChevronsUp, CircleDot, CircleMinus, CirclePlus, DollarSign, FlaskConical, Lock, LockOpen, Minus, Plus, RotateCcw, X } from "lucide-react";
import selectedIndicator from "../assets/dropdown-selected.svg";
import { strategyIcons } from "../assets/strategyIcons";
import { getOptionInstrument, optionSymbols } from "../trading/optionCatalog";
import { createStrategyLegs, isStrategyName, optionSeed, otherExpiration, strategyMatches, strategySide, type StrategyLeg, type StrategyName } from "../trading/strategies";
import { useTradingMode } from "../trading/TradingMode";
import type { TradeRequest } from "../trading/types";
import { SelectMenu as BaseSelectMenu, type SelectChoice } from "./SelectMenu";
import "./OrderEntry.css";

const SelectMenu = (props: Omit<ComponentProps<typeof BaseSelectMenu>, "floating">) => <BaseSelectMenu {...props} floating />;

type QuantityUnit = "Whole Shares" | "Fractional" | "Notional";
type StrategyState =
  | { kind: "none" }
  | { kind: "multi"; name: StrategyName; locked: boolean; legs: StrategyLeg[] };
type OrderState =
  | { kind: "empty" }
  | { kind: "single"; symbol: string; spread: string; side: string; quantityUnit: QuantityUnit; quantity: string; expiration: string; strike: string; optionType: string; orderType: string; limitPrice: string; duration: string; priceLockOpen: boolean; strategy: StrategyState };
type FilledOrder = Exclude<OrderState, { kind: "empty" }>;
const templateNames = ["Single", "OCO", "One Starts the Other", "One Starts the OCO"] as const;
type TemplateName = typeof templateNames[number];
type LinkedOrder = FilledOrder & { id: string; stopPrice: string };
type OrderGroup =
  | { kind: "none" }
  | { kind: "oco"; orders: [LinkedOrder, LinkedOrder] }
  | { kind: "oso"; orders: [LinkedOrder, LinkedOrder] }
  | { kind: "oso-oco"; parent: LinkedOrder; pairs: [LinkedOrder, LinkedOrder][] };
type ResizeState =
  | { kind: "idle" }
  | { kind: "dragging"; startY: number; startHeight: number };
export type OrderEntryLayout = "form" | "table";

const templates: readonly SelectChoice[] = templateNames.map((value) => ({ value, icon: null }));
const accounts: readonly SelectChoice[] = ["trader1, USD", "trader2, USD", "bro13-E, USD", "margin1, USD"].map((value) => ({ value, icon: null }));
const symbols: readonly SelectChoice[] = optionSymbols.map((value) => ({ value, icon: null }));
const spreads: readonly SelectChoice[] = [
  { value: "Stock", icon: null },
  { value: "Single", icon: strategyIcons.single },
  { value: "Vertical", icon: strategyIcons.vertical },
  { value: "Straddle", icon: strategyIcons.straddle },
  { value: "Strangle", icon: strategyIcons.strangle },
  { value: "Ratio/Back", icon: strategyIcons.ratioBack },
  { value: "Combo", icon: strategyIcons.combo },
  { value: "Synthetic", icon: strategyIcons.synthetic },
  { value: "Covered", icon: strategyIcons.covered },
  { value: "Calendar", icon: strategyIcons.calendar },
  { value: "Diagonal", icon: strategyIcons.diagonal },
  { value: "Butterfly", icon: strategyIcons.butterfly },
  { value: "Condor", icon: strategyIcons.condor },
  { value: "Iron Condor", icon: strategyIcons.ironCondor },
  { value: "Custom", icon: null },
];
const sides: readonly SelectChoice[] = ["Buy", "Sell"].map((value) => ({ value, icon: null }));
const strategySides: readonly SelectChoice[] = ["Buy", "Sell"].map((value) => ({ value, icon: null }));
const orderTypes: readonly SelectChoice[] = ["Market", "Limit", "Stop Market", "Stop Limit", "Trailing Stop", "Trailing Stop Limit", "MOC", "LOC", "MOO", "LOO"].map((value) => ({ value, icon: null }));
const durations: readonly SelectChoice[] = ["Day", "GTC", "GTD"].map((value) => ({ value, icon: null }));
const toChoices = (values: readonly (number | string)[]): readonly SelectChoice[] => values.map((value) => ({ value: `${value}`, icon: null }));
const defaultOption = getOptionInstrument("AAPL");
const defaultOptionExpiration = defaultOption.expirations[0];
const defaultOptionStrike = "302.5";
const optionTypes: readonly SelectChoice[] = ["Call", "Put"].map((value) => ({ value, icon: null }));
const quantityUnits: QuantityUnit[] = ["Whole Shares", "Fractional", "Notional"];
const minimumHeight = 164;
const clamp = (value: number, maximum: number) => Math.min(Math.max(value, minimumHeight), maximum);
const wholeQuantityPattern = /^-?\d*$/;
const decimalPattern = /^-?\d*(\.\d{0,2})?$/;
const quantityStep = (unit: QuantityUnit) => unit === "Whole Shares" ? 1 : .01;
const formatQuantity = (value: number, unit: QuantityUnit) => unit === "Whole Shares" ? `${Math.round(value)}` : (Math.round(value * 100) / 100).toFixed(2);
const previewQuantity = (side: string, quantity: string) => `${side.startsWith("Sell") ? -Math.abs(Number(quantity)) : Math.abs(Number(quantity))}`;
const normalizeQuantity = (value: string, unit: QuantityUnit) => {
  const numericValue = Number(value);
  if (numericValue !== 0 && Number.isFinite(numericValue)) return formatQuantity(numericValue, unit);
  const minimum = quantityStep(unit);
  return formatQuantity(value.startsWith("-") ? -minimum : minimum, unit);
};
const stepQuantity = (value: string, unit: QuantityUnit, direction: -1 | 1) => {
  const step = quantityStep(unit);
  const nextValue = Math.round(((Number(value) || 0) + step * direction) * 100) / 100;
  return formatQuantity(nextValue === 0 ? step * direction : nextValue, unit);
};
const stepPrice = (value: string, direction: -1 | 1) => Math.max(.01, Math.round(((Number(value) || 0) + .01 * direction) * 100) / 100).toFixed(2);
const normalizePrice = (value: string) => Math.max(.01, Number(value) || .01).toFixed(2);
const hasLimitPrice = (orderType: string) => !["Market", "Stop Market", "MOC", "MOO"].includes(orderType);
const hasStopPrice = (orderType: string) => orderType.includes("Stop");
const formatStrike = (value: number) => `${Math.round(value * 100) / 100}`;
const isTemplateName = (value: string): value is TemplateName => templateNames.includes(value as TemplateName);
const quantityForSide = (side: string, quantity: string, unit: QuantityUnit) => formatQuantity(side.startsWith("Sell") ? -Math.abs(Number(quantity)) : Math.abs(Number(quantity)), unit);
const createOrder = (symbol: string): FilledOrder => ({
  kind: "single",
  symbol,
  spread: "Stock",
  side: "Buy",
  quantityUnit: "Whole Shares",
  quantity: "1",
  expiration: defaultOptionExpiration,
  strike: defaultOptionStrike,
  optionType: "Call",
  orderType: "Limit",
  limitPrice: "320.27",
  duration: "Day",
  priceLockOpen: false,
  strategy: { kind: "none" },
});

const createLinkedOrder = (base: FilledOrder, id: string, side: "Buy" | "Sell", orderType: string): LinkedOrder => ({
  ...base,
  id,
  spread: "Stock",
  side,
  quantity: quantityForSide(side, base.quantity, base.quantityUnit),
  expiration: "—",
  strike: "—",
  optionType: "—",
  orderType,
  stopPrice: base.limitPrice,
  strategy: { kind: "none" },
});

const createOrderGroup = (template: Exclude<TemplateName, "Single">, base: FilledOrder): OrderGroup => {
  if (template === "OCO") return { kind: "oco", orders: [createLinkedOrder(base, "oco-1", "Sell", "Limit"), createLinkedOrder(base, "oco-2", "Sell", "Stop Market")] };
  if (template === "One Starts the Other") return { kind: "oso", orders: [createLinkedOrder(base, "oso-parent", "Buy", "Limit"), createLinkedOrder(base, "oso-child", "Sell", "Limit")] };
  return { kind: "oso-oco", parent: createLinkedOrder(base, "oso-parent", "Buy", "Market"), pairs: [[createLinkedOrder(base, "oco-1-a", "Sell", "Limit"), createLinkedOrder(base, "oco-1-b", "Sell", "Stop Market")]] };
};

const getGroupOrders = (group: OrderGroup): LinkedOrder[] => {
  if (group.kind === "none") return [];
  if (group.kind === "oco" || group.kind === "oso") return group.orders;
  return [group.parent, ...group.pairs.flat()];
};

const updateGroupOrder = (group: OrderGroup, id: string, update: Partial<LinkedOrder>): OrderGroup => {
  const change = (order: LinkedOrder) => order.id === id ? { ...order, ...update } : order;
  if (group.kind === "none") return group;
  if (group.kind === "oco") return { ...group, orders: [change(group.orders[0]), change(group.orders[1])] };
  if (group.kind === "oso") return { ...group, orders: [change(group.orders[0]), change(group.orders[1])] };
  return { ...group, parent: change(group.parent), pairs: group.pairs.map(([first, second]) => [change(first), change(second)]) };
};

const createOrderFromTrade = (trade: TradeRequest): FilledOrder => {
  if (trade.legs && trade.legs.length > 0) {
    return {
      kind: "single",
      symbol: trade.symbol,
      spread: isStrategyName(trade.spread) ? trade.spread : "Custom",
      side: trade.side,
      quantityUnit: "Whole Shares",
      quantity: `${trade.quantity}`,
      expiration: trade.expiration,
      strike: trade.strike,
      optionType: trade.optionType,
      orderType: trade.price === null ? "Market" : "Limit",
      limitPrice: trade.price === null ? "" : trade.price.toFixed(2),
      duration: "Day",
      priceLockOpen: false,
      strategy: { kind: "multi", name: isStrategyName(trade.spread) ? trade.spread : "Custom", locked: false, legs: trade.legs.map((leg) => ({ instrument: "option", side: leg.side, quantity: `${leg.quantity}`, expiration: leg.expiration, strike: leg.strike, optionType: leg.optionType })) },
    };
  }
  return {
    kind: "single",
    symbol: trade.symbol,
    spread: trade.optionType === "—" ? "Stock" : "Single",
    side: trade.side,
    quantityUnit: "Whole Shares",
    quantity: `${trade.quantity}`,
    expiration: trade.expiration,
    strike: trade.strike,
    optionType: trade.optionType,
    orderType: trade.price === null ? "Market" : "Limit",
    limitPrice: trade.price === null ? "" : trade.price.toFixed(2),
    duration: "Day",
    priceLockOpen: false,
    strategy: { kind: "none" },
  };
};

const createCustomStrategyLeg = (trade: TradeRequest): StrategyLeg => ({
  instrument: "option",
  side: strategySide(trade.side === "Buy"),
  quantity: `${trade.quantity}`,
  expiration: trade.expiration,
  strike: trade.strike,
  optionType: trade.optionType,
});

const createCustomStrategyOrder = (trade: TradeRequest): FilledOrder => {
  const order = createOrderFromTrade(trade);
  return { ...order, spread: "Custom", strategy: { kind: "multi", name: "Custom", locked: false, legs: [createCustomStrategyLeg(trade)] } };
};

const addCustomStrategyLeg = (order: OrderState, trade: TradeRequest): OrderState => {
  if (order.kind !== "single" || order.strategy.kind !== "multi" || order.strategy.name !== "Custom" || order.symbol !== trade.symbol) return createCustomStrategyOrder(trade);
  return { ...order, strategy: { ...order.strategy, locked: false, legs: [...order.strategy.legs, createCustomStrategyLeg(trade)] } };
};

function FractionalIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="3" r="1.5" fill="currentColor" stroke="none" /><circle cx="5.25" cy="7.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="10.75" cy="7.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="2.5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="8" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="13.5" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>;
}

const strategyPriceRange = (symbol: string, legs: StrategyLeg[], side: string) => {
  const optionLegs = legs.filter((leg) => leg.instrument === "option");
  if (optionLegs.length === 0) return null;
  const instrument = getOptionInstrument(symbol);
  const rows = instrument.rows;
  const quote = (strike: number, optionType: string, ask: boolean) => {
    const valueOf = (row: (typeof rows)[number]) => {
      const quotes = optionType === "Call" ? row.call : row.put;
      return Number((ask ? quotes[1] : quotes[0]).value);
    };
    const exact = rows.find((row) => `${row.strike}` === `${strike}`);
    if (exact) return valueOf(exact);
    const first = rows[0];
    const last = rows[rows.length - 1];
    if (strike < first.strike || strike > last.strike) {
      const inner = strike < first.strike ? first : last;
      const outer = strike < first.strike ? rows[1] : rows[rows.length - 2];
      const slope = (valueOf(inner) - valueOf(outer)) / (inner.strike - outer.strike);
      return Math.max(0, valueOf(inner) + slope * (strike - inner.strike));
    }
    let lower = first;
    let upper = last;
    for (const row of rows) {
      if (row.strike <= strike) lower = row;
      if (row.strike >= strike) {
        upper = row;
        break;
      }
    }
    const span = upper.strike - lower.strike;
    return span === 0 ? valueOf(lower) : valueOf(lower) + ((strike - lower.strike) / span) * (valueOf(upper) - valueOf(lower));
  };
  const sign = (leg: StrategyLeg) => leg.side.startsWith("Sell") ? -1 : 1;
  const bid = optionLegs.reduce((sum, leg) => sum + sign(leg) * quote(Number(leg.strike), leg.optionType, false), 0);
  const ask = optionLegs.reduce((sum, leg) => sum + sign(leg) * quote(Number(leg.strike), leg.optionType, true), 0);
  const natural = (bid + ask) / 2;
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || Math.abs(ask - bid) < 0.01) {
    const base = Math.max(0.05, Math.round(instrument.market.last) / 100);
    const offset = Math.max(0.05, base * 0.1);
    return side.startsWith("Buy")
      ? { low: base - offset, high: base + offset, lowLabel: "nat", highLabel: "ask" }
      : { low: base - offset, high: base + offset, lowLabel: "bid", highLabel: "nat" };
  }
  return side.startsWith("Buy")
    ? { low: natural, high: ask, lowLabel: "nat", highLabel: "ask" }
    : { low: bid, high: natural, lowLabel: "bid", highLabel: "nat" };
};

type PriceRange = NonNullable<ReturnType<typeof strategyPriceRange>>;

function PriceRangeSlider({ range, value, disabled, onChange }: { range: PriceRange; value: number; disabled: boolean; onChange: (value: number) => void }) {
  const draggingRef = useRef(false);
  const { low, high, lowLabel, highLabel } = range;
  const ratio = high - low !== 0 ? Math.min(1, Math.max(0, (value - low) / (high - low))) : 0;
  const update = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    onChange(low + position * (high - low));
  };
  return (
    <div className={`price-range-slider ${disabled ? "is-disabled" : ""}`}>
      <div className="price-range-labels">
        <span>{lowLabel} {low.toFixed(2)}</span>
        <span>{high.toFixed(2)} {highLabel}</span>
      </div>
      <div
        className="price-range-track"
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          draggingRef.current = true;
          update(event);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) update(event);
        }}
        onPointerUp={(event) => {
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <div className="price-range-thumb" style={{ left: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function OrderEntry() {
  return <OrderEntryView layout="form" />;
}

export function OrderEntryView({ layout }: { layout: OrderEntryLayout }) {
  const { placeTrade, simulateTrade, tradeDraft, clearTradeDraft, customStrategyLegDraft, clearCustomStrategyLegDraft } = useTradingMode();
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<TemplateName>("Single");
  const [account, setAccount] = useState("trader1, USD");
  const [order, setOrder] = useState<OrderState>({ kind: "empty" });
  const [orderGroup, setOrderGroup] = useState<OrderGroup>({ kind: "none" });
  const [quantityMenuOpen, setQuantityMenuOpen] = useState(false);
  const quantityTypeRef = useRef<HTMLDivElement>(null);
  const [quantityMenuPosition, setQuantityMenuPosition] = useState<{ left: number; bottom: number } | null>(null);
  const [height, setHeight] = useState(349);
  const [resizeState, setResizeState] = useState<ResizeState>({ kind: "idle" });
  const maximumHeight = window.innerHeight - 72;

  useEffect(() => {
    if (tradeDraft === null) return;
    setOrder(createOrderFromTrade(tradeDraft));
    setTemplate("Single");
    setOrderGroup({ kind: "none" });
    setOpen(true);
    clearTradeDraft();
  }, [clearTradeDraft, tradeDraft]);

  useEffect(() => {
    if (customStrategyLegDraft === null) return;
    setOrder((current) => addCustomStrategyLeg(current, customStrategyLegDraft));
    setTemplate("Single");
    setOrderGroup({ kind: "none" });
    setOpen(true);
    clearCustomStrategyLegDraft();
  }, [clearCustomStrategyLegDraft, customStrategyLegDraft]);

  const changeTemplate = (value: string) => {
    if (!isTemplateName(value)) throw new Error(`Unknown order template: ${value}`);
    setTemplate(value);
    if (value === "Single") {
      setOrderGroup({ kind: "none" });
      return;
    }
    const base = order.kind === "single" ? order : createOrder("AAPL");
    setOrder(base);
    setOrderGroup(createOrderGroup(value, base));
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!quantityMenuOpen || quantityTypeRef.current === null) return;
    const updatePosition = () => {
      const { left, top } = quantityTypeRef.current!.getBoundingClientRect();
      setQuantityMenuPosition({ left, bottom: window.innerHeight - top + 4 });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [quantityMenuOpen]);

  const closeQuantityMenu = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setQuantityMenuOpen(false);
  };

  const changeQuantityUnit = (unit: QuantityUnit) => {
    if (order.kind !== "single") return;
    if (order.strategy.kind === "multi") {
      setOrder({ ...order, quantityUnit: unit, strategy: { ...order.strategy, legs: order.strategy.legs.map((leg) => ({ ...leg, quantity: normalizeQuantity(leg.quantity, unit) })) } });
    } else {
      setOrder({ ...order, quantityUnit: unit, quantity: normalizeQuantity(order.quantity, unit) });
    }
    setQuantityMenuOpen(false);
  };

  const renderQuantityMenu = () => {
    if (order.kind !== "single" || !quantityMenuOpen || quantityMenuPosition === null) return null;
    return createPortal(<div className="select-menu"><div className="select-menu-list oe-quantity-menu is-floating" role="listbox" aria-label="Quantity type" style={quantityMenuPosition}>{quantityUnits.map((unit) => {
      const Icon = unit === "Whole Shares" ? CircleDot : unit === "Fractional" ? FractionalIcon : DollarSign;
      return <button className={`select-menu-option ${unit === order.quantityUnit ? "is-selected" : ""}`} type="button" role="option" aria-selected={unit === order.quantityUnit} key={unit} onMouseDown={(event) => event.preventDefault()} onClick={() => changeQuantityUnit(unit)}><Icon aria-hidden="true" /><span>{unit}</span>{unit === order.quantityUnit ? <img className="select-menu-check" src={selectedIndicator} alt="" /> : null}</button>;
    })}</div></div>, document.body);
  };

  const changeQuantity = (quantity: string) => {
    if (order.kind !== "single") return;
    const numericQuantity = Number(quantity);
    const side = !Number.isFinite(numericQuantity) ? order.side : numericQuantity < 0 ? "Sell" : "Buy";
    setOrder({ ...order, quantity, side });
  };

  const changeSpread = (spread: string) => {
    if (order.kind !== "single") return;
    if (isStrategyName(spread)) {
      const first: StrategyLeg = order.strategy.kind === "multi" ? order.strategy.legs[0] : {
        instrument: order.spread === "Stock" ? "stock" : "option",
        side: strategySide(order.side === "Buy"),
        quantity: order.quantity,
        expiration: order.spread === "Stock" ? "—" : order.expiration,
        strike: order.spread === "Stock" ? "—" : order.strike,
        optionType: order.spread === "Stock" ? "—" : order.optionType,
      };
      const legs = spread === "Custom" && order.strategy.kind === "multi" ? order.strategy.legs : createStrategyLegs(spread, first, order.symbol);
      const locked = spread !== "Custom" && spread !== "Combo";
      setOrder({ ...order, spread, side: first.side.startsWith("Buy") ? "Buy" : "Sell", quantity: quantityForSide(first.side, first.quantity, order.quantityUnit), expiration: first.expiration, strike: first.strike, optionType: first.optionType, strategy: { kind: "multi", name: spread, locked, legs } });
      return;
    }
    if (order.strategy.kind === "multi") {
      const first = spread === "Single" ? optionSeed(order.strategy.legs[0], order.symbol) : order.strategy.legs[0];
      setOrder({ ...order, spread, side: first.side.startsWith("Buy") ? "Buy" : "Sell", quantity: quantityForSide(first.side, first.quantity, order.quantityUnit), expiration: first.expiration, strike: first.strike, optionType: first.optionType, strategy: { kind: "none" } });
      return;
    }
    setOrder({ ...order, spread });
  };

  const updateStrategyLeg = (index: number, update: Partial<StrategyLeg>) => {
    if (order.kind !== "single" || order.strategy.kind !== "multi") return;
    const legs = order.strategy.legs.map((leg, legIndex) => legIndex === index ? { ...leg, ...update } : leg);
    const matches = strategyMatches(order.strategy.name, legs, order.symbol);
    const spread = matches ? order.strategy.name : "Custom";
    setOrder({ ...order, spread, strategy: { kind: "multi", name: spread, locked: matches && order.strategy.name !== "Custom" && order.strategy.name !== "Combo" ? order.strategy.locked : false, legs } });
  };

  const changeLockedStrategy = (update: Partial<StrategyLeg>) => {
    if (order.kind !== "single" || order.strategy.kind !== "multi") return;
    const first = { ...order.strategy.legs[0], ...update };
    const legs = createStrategyLegs(order.strategy.name, first, order.symbol);
    setOrder({ ...order, spread: order.strategy.name, side: first.side.startsWith("Buy") ? "Buy" : "Sell", quantity: quantityForSide(first.side, first.quantity, order.quantityUnit), expiration: first.expiration, strike: first.strike, optionType: first.optionType, strategy: { kind: "multi", name: order.strategy.name, locked: true, legs } });
  };

  const updateStrategyStrike = (index: number, strike: string) => {
    if (order.kind !== "single" || order.strategy.kind !== "multi") return;
    const legs = order.strategy.legs.map((leg, legIndex) => legIndex === index ? { ...leg, strike } : leg);
    setOrder({ ...order, strategy: { ...order.strategy, legs } });
  };

  const changeStrategyQuantity = (index: number, quantity: string) => {
    if (order.kind !== "single" || order.strategy.kind !== "multi") return;
    const side = strategySide(Number(quantity) >= 0);
    if (order.strategy.locked) changeLockedStrategy({ quantity, side });
    else updateStrategyLeg(index, { quantity, side });
  };

  const removeStrategyLeg = (index: number) => {
    setOrder((current) => {
      if (current.kind !== "single" || current.strategy.kind !== "multi" || current.strategy.locked) return current;
      const legs = current.strategy.legs.filter((_, legIndex) => legIndex !== index);
      if (legs.length === 0) return { kind: "empty" };
      return { ...current, spread: "Custom", strategy: { kind: "multi", name: "Custom", locked: false, legs } };
    });
  };

  const addStrategyLeg = () => {
    setOrder((current) => {
      if (current.kind !== "single" || current.strategy.kind !== "multi" || current.strategy.locked) return current;
      const legs = [...current.strategy.legs, { ...current.strategy.legs[current.strategy.legs.length - 1] }];
      return { ...current, spread: "Custom", strategy: { kind: "multi", name: "Custom", locked: false, legs } };
    });
  };

  const toggleStrategyLock = () => {
    if (order.kind !== "single" || order.strategy.kind !== "multi" || order.strategy.name === "Custom" || order.strategy.name === "Combo") return;
    if (order.strategy.locked) {
      setOrder({ ...order, strategy: { ...order.strategy, locked: false } });
      return;
    }
    const legs = createStrategyLegs(order.strategy.name, order.strategy.legs[0], order.symbol);
    setOrder({ ...order, spread: order.strategy.name, strategy: { ...order.strategy, locked: true, legs } });
  };

  const changeLinkedOrder = (id: string, update: Partial<LinkedOrder>) => setOrderGroup((current) => updateGroupOrder(current, id, update));
  const changeLinkedSide = (linkedOrder: LinkedOrder, side: string) => changeLinkedOrder(linkedOrder.id, { side, quantity: quantityForSide(side, linkedOrder.quantity, linkedOrder.quantityUnit) });
  const changeLinkedQuantity = (linkedOrder: LinkedOrder, quantity: string) => changeLinkedOrder(linkedOrder.id, { quantity, side: Number(quantity) < 0 ? "Sell" : "Buy" });

  const changeLinkedOrderWith = (id: string, change: (order: LinkedOrder) => LinkedOrder) => setOrderGroup((current) => {
    const apply = (order: LinkedOrder) => order.id === id ? change(order) : order;
    if (current.kind === "none") return current;
    if (current.kind === "oco" || current.kind === "oso") return { ...current, orders: [apply(current.orders[0]), apply(current.orders[1])] };
    return { ...current, parent: apply(current.parent), pairs: current.pairs.map(([first, second]) => [apply(first), apply(second)]) };
  });

  const changeLinkedSpread = (linkedOrder: LinkedOrder, spread: string) => changeLinkedOrderWith(linkedOrder.id, (order) => {
    if (isStrategyName(spread)) {
      const first: StrategyLeg = order.strategy.kind === "multi" ? order.strategy.legs[0] : {
        instrument: order.spread === "Stock" ? "stock" : "option",
        side: strategySide(order.side === "Buy"),
        quantity: order.quantity,
        expiration: order.spread === "Stock" ? "—" : order.expiration,
        strike: order.spread === "Stock" ? "—" : order.strike,
        optionType: order.spread === "Stock" ? "—" : order.optionType,
      };
      const legs = spread === "Custom" && order.strategy.kind === "multi" ? order.strategy.legs : createStrategyLegs(spread, first, order.symbol);
      const locked = spread !== "Custom" && spread !== "Combo";
      return { ...order, spread, side: first.side.startsWith("Buy") ? "Buy" : "Sell", quantity: quantityForSide(first.side, first.quantity, order.quantityUnit), expiration: first.expiration, strike: first.strike, optionType: first.optionType, strategy: { kind: "multi", name: spread, locked, legs } };
    }
    if (order.strategy.kind === "multi") {
      const first = spread === "Single" ? optionSeed(order.strategy.legs[0], order.symbol) : order.strategy.legs[0];
      return { ...order, spread, side: first.side.startsWith("Buy") ? "Buy" : "Sell", quantity: quantityForSide(first.side, first.quantity, order.quantityUnit), expiration: spread === "Single" ? first.expiration : "—", strike: spread === "Single" ? first.strike : "—", optionType: spread === "Single" ? first.optionType : "—", strategy: { kind: "none" } };
    }
    if (spread === "Single") {
      const seed = optionSeed({ instrument: "stock", side: order.side, quantity: order.quantity, expiration: "—", strike: "—", optionType: "—" }, order.symbol);
      return { ...order, spread, expiration: seed.expiration, strike: seed.strike, optionType: seed.optionType };
    }
    return { ...order, spread, expiration: "—", strike: "—", optionType: "—" };
  });

  const updateLinkedLeg = (linkedOrder: LinkedOrder, index: number, update: Partial<StrategyLeg>) => changeLinkedOrderWith(linkedOrder.id, (order) => {
    if (order.strategy.kind !== "multi") return order;
    const legs = order.strategy.legs.map((leg, legIndex) => legIndex === index ? { ...leg, ...update } : leg);
    const matches = strategyMatches(order.strategy.name, legs, order.symbol);
    const spread = matches ? order.strategy.name : "Custom";
    return { ...order, spread, strategy: { kind: "multi", name: spread, locked: matches && order.strategy.name !== "Custom" && order.strategy.name !== "Combo" ? order.strategy.locked : false, legs } };
  });

  const changeLinkedLockedStrategy = (linkedOrder: LinkedOrder, update: Partial<StrategyLeg>) => changeLinkedOrderWith(linkedOrder.id, (order) => {
    if (order.strategy.kind !== "multi") return order;
    const first = { ...order.strategy.legs[0], ...update };
    const legs = createStrategyLegs(order.strategy.name, first, order.symbol);
    return { ...order, spread: order.strategy.name, side: first.side.startsWith("Buy") ? "Buy" : "Sell", quantity: quantityForSide(first.side, first.quantity, order.quantityUnit), expiration: first.expiration, strike: first.strike, optionType: first.optionType, strategy: { kind: "multi", name: order.strategy.name, locked: true, legs } };
  });

  const changeLinkedLegField = (linkedOrder: LinkedOrder, index: number, update: Partial<StrategyLeg>) => {
    if (linkedOrder.strategy.kind !== "multi") return;
    if (index === 0 && linkedOrder.strategy.locked) changeLinkedLockedStrategy(linkedOrder, update);
    else updateLinkedLeg(linkedOrder, index, update);
  };

  const changeLinkedLegSide = (linkedOrder: LinkedOrder, index: number, side: string) => {
    if (linkedOrder.strategy.kind !== "multi") return;
    changeLinkedLegField(linkedOrder, index, { side, quantity: quantityForSide(side, linkedOrder.strategy.legs[index].quantity, linkedOrder.quantityUnit) });
  };

  const changeLinkedLegQuantity = (linkedOrder: LinkedOrder, index: number, quantity: string) => {
    if (linkedOrder.strategy.kind !== "multi") return;
    if (index === 0 && linkedOrder.strategy.locked) changeLinkedLockedStrategy(linkedOrder, { quantity, side: strategySide(Number(quantity) >= 0) });
    else updateLinkedLeg(linkedOrder, index, { quantity });
  };

  const removeLinkedLeg = (linkedOrder: LinkedOrder, index: number) => changeLinkedOrderWith(linkedOrder.id, (order) => {
    if (order.strategy.kind !== "multi" || order.strategy.locked) return order;
    const legs = order.strategy.legs.filter((_, legIndex) => legIndex !== index);
    if (legs.length === 0) return { ...order, spread: "Stock", expiration: "—", strike: "—", optionType: "—", strategy: { kind: "none" } };
    return { ...order, spread: "Custom", strategy: { kind: "multi", name: "Custom", locked: false, legs } };
  });

  const addLinkedLeg = (linkedOrder: LinkedOrder) => changeLinkedOrderWith(linkedOrder.id, (order) => {
    if (order.strategy.kind !== "multi" || order.strategy.locked) return order;
    const legs = [...order.strategy.legs, { ...order.strategy.legs[order.strategy.legs.length - 1] }];
    return { ...order, spread: "Custom", strategy: { kind: "multi", name: "Custom", locked: false, legs } };
  });

  const toggleLinkedLock = (linkedOrder: LinkedOrder) => changeLinkedOrderWith(linkedOrder.id, (order) => {
    if (order.strategy.kind !== "multi" || order.strategy.name === "Custom" || order.strategy.name === "Combo") return order;
    if (order.strategy.locked) return { ...order, strategy: { ...order.strategy, locked: false } };
    const legs = createStrategyLegs(order.strategy.name, order.strategy.legs[0], order.symbol);
    return { ...order, spread: order.strategy.name, strategy: { ...order.strategy, locked: true, legs } };
  });
  const addOcoPair = () => setOrderGroup((current) => {
    if (current.kind !== "oso-oco" || current.pairs.length === 3) return current;
    const pairNumber = current.pairs.length + 1;
    const base = current.pairs[current.pairs.length - 1][0];
    return { ...current, pairs: [...current.pairs, [createLinkedOrder(base, `oco-${pairNumber}-a`, "Sell", "Limit"), createLinkedOrder(base, `oco-${pairNumber}-b`, "Sell", "Stop Market")]] };
  });

  const submitOrderGroup = (submitTrade: (trade: TradeRequest) => void) => {
    for (const linkedOrder of getGroupOrders(orderGroup)) {
      const price = hasLimitPrice(linkedOrder.orderType) ? Number(linkedOrder.limitPrice) : hasStopPrice(linkedOrder.orderType) ? Number(linkedOrder.stopPrice) : null;
      const execution = price === null ? linkedOrder.orderType : `@ ${price.toFixed(2)} • ${linkedOrder.orderType}`;
      if (linkedOrder.strategy.kind === "multi") {
        const legs = linkedOrder.strategy.legs;
        submitTrade({
          message: `${linkedOrder.spread} ${linkedOrder.symbol} • ${legs.length} legs ${execution}`,
          symbol: linkedOrder.symbol,
          side: legs[0].side.startsWith("Buy") ? "Buy" : "Sell",
          quantity: Number(legs[0].quantity),
          price,
          spread: linkedOrder.spread,
          expiration: legs[0].expiration,
          strike: legs[0].strike,
          optionType: legs[0].optionType,
          legs: legs.map((leg) => ({
            side: leg.side.startsWith("Buy") ? "Buy" : "Sell",
            quantity: Number(leg.quantity),
            expiration: leg.expiration,
            strike: leg.strike,
            optionType: leg.optionType,
            price,
          })),
        });
        continue;
      }
      const isOption = linkedOrder.spread === "Single";
      submitTrade({
        message: `${linkedOrder.side} ${linkedOrder.quantity} ${linkedOrder.symbol}${isOption ? ` ${linkedOrder.expiration} ${linkedOrder.strike} ${linkedOrder.optionType}` : ""} ${execution}`,
        symbol: linkedOrder.symbol,
        side: linkedOrder.side === "Buy" ? "Buy" : "Sell",
        quantity: Number(linkedOrder.quantity),
        price,
        spread: linkedOrder.spread,
        expiration: isOption ? linkedOrder.expiration : "—",
        strike: isOption ? linkedOrder.strike : "—",
        optionType: isOption ? linkedOrder.optionType : "—",
      });
    }
  };

  const submitOrder = (submitTrade: (trade: TradeRequest) => void) => {
    if (order.kind === "empty") return;
    if (order.strategy.kind === "multi") {
      const execution = order.orderType === "Market" ? "Market" : `@ ${Number(order.limitPrice).toFixed(2)} • ${order.orderType}`;
      const legs = order.strategy.legs;
      submitTrade({
        message: `${order.spread} ${order.symbol} • ${legs.length} legs ${execution}`,
        symbol: order.symbol,
        side: legs[0].side.startsWith("Buy") ? "Buy" : "Sell",
        quantity: Number(legs[0].quantity),
        price: order.orderType === "Market" ? null : Number(order.limitPrice),
        spread: order.spread,
        expiration: legs[0].expiration,
        strike: legs[0].strike,
        optionType: legs[0].optionType,
        legs: legs.map((leg) => ({
          side: leg.side.startsWith("Buy") ? "Buy" : "Sell",
          quantity: Number(leg.quantity),
          expiration: leg.expiration,
          strike: leg.strike,
          optionType: leg.optionType,
          price: order.orderType === "Market" ? null : Number(order.limitPrice),
        })),
      });
      return;
    }
    const quantity = order.quantityUnit === "Notional" ? `$${Number(order.quantity).toFixed(2)}` : order.quantityUnit === "Fractional" ? Number(order.quantity).toFixed(2) : order.quantity;
    const execution = order.orderType === "Market" ? "Market" : `@ ${Number(order.limitPrice).toFixed(2)} • ${order.orderType}`;
    const isOption = order.spread === "Single";
    const instrument = isOption ? `${order.symbol} ${order.expiration} ${order.strike} ${order.optionType}` : order.symbol;
    submitTrade({
      message: `${order.side} ${quantity} ${instrument} ${execution}`,
      symbol: order.symbol,
      side: order.side === "Buy" ? "Buy" : "Sell",
      quantity: Number(order.quantity),
      price: order.orderType === "Market" ? null : Number(order.limitPrice),
      spread: order.spread,
      expiration: isOption ? order.expiration : "—",
      strike: isOption ? order.strike : "—",
      optionType: isOption ? order.optionType : "—",
    });
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    setHeight((current) => clamp(current + (event.key === "ArrowUp" ? 12 : -12), maximumHeight));
  };

  const resizeWithPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeState.kind === "idle") return;
    setHeight(clamp(resizeState.startHeight + resizeState.startY - event.clientY, maximumHeight));
  };

  if (!open) {
    return (
      <section className={`order-entry ${layout === "table" ? "is-table-layout" : ""}`}>
        <button className="order-entry-collapsed-trigger" type="button" aria-expanded="false" onClick={() => setOpen(true)}>
          <ChevronsUp aria-hidden="true" /><span>Show Order Entry</span>
        </button>
      </section>
    );
  }

  const filled = order.kind === "single";
  const strategyLegs = filled && order.strategy.kind === "multi" ? order.strategy.legs : null;
  const isStrategy = strategyLegs !== null;
  const limitEnabled = filled && !["Market", "MOC", "MOO"].includes(order.orderType);
  const numericQuantity = filled ? Number(isStrategy ? strategyLegs[0].quantity : order.quantity) : 0;
  const linkedOrders = getGroupOrders(orderGroup);
  const groupCanSubmit = linkedOrders.length > 0 && linkedOrders.every((linkedOrder) => Number(linkedOrder.quantity) !== 0 && (!hasLimitPrice(linkedOrder.orderType) || linkedOrder.limitPrice !== "") && (!hasStopPrice(linkedOrder.orderType) || linkedOrder.stopPrice !== ""));
  const canSubmit = orderGroup.kind === "none" ? filled && Number.isFinite(numericQuantity) && numericQuantity !== 0 && (!limitEnabled || order.limitPrice !== "") : groupCanSubmit;
  const QuantityIcon = !filled || order.quantityUnit === "Whole Shares" ? CircleDot : order.quantityUnit === "Fractional" ? FractionalIcon : DollarSign;
  const isOption = filled && !isStrategy && order.spread === "Single";
  const optionData = filled ? getOptionInstrument(order.symbol) : null;
  const expirations = optionData ? toChoices(optionData.expirations) : [];
  const strikes = optionData ? toChoices(optionData.rows.map((row) => row.strike)) : [];
  const strategyOptionLegs = isStrategy ? strategyLegs.filter((leg) => leg.instrument === "option") : [];
  const strategyStrikes = strategyOptionLegs.map((leg) => leg.strike).join(" / ");

  const renderStrategyFields = () => {
    if (order.kind !== "single" || order.strategy.kind !== "multi") return null;
    const { name, legs, locked } = order.strategy;
    const firstIsOption = legs[0].instrument === "option";
    const strategyCanLock = name !== "Custom" && name !== "Combo";
    const optionData = getOptionInstrument(order.symbol);
    const sliderRange = strategyPriceRange(order.symbol, legs, order.side);
    const expirations = toChoices(optionData.expirations);
    const strikes = toChoices(optionData.rows.map((row) => row.strike));
    const strategyStrikeChoices = [...new Set([...strikes.map((choice) => choice.value), ...legs.filter((leg) => leg.instrument === "option").map((leg) => leg.strike)])].sort((left, right) => Number(left) - Number(right)).map((value) => ({ value, icon: null }));
    const updateFirstLeg = (update: Partial<StrategyLeg>) => locked ? changeLockedStrategy(update) : updateStrategyLeg(0, update);
    const changeStrategySide = (index: number, side: string) => {
      const update = { side, quantity: quantityForSide(side, legs[index].quantity, order.quantityUnit) };
      if (index === 0) updateFirstLeg(update);
      else updateStrategyLeg(index, update);
    };
    return (
      <div className="order-entry-fields is-strategy">
        <div className="oe-field oe-strategy-column oe-symbol"><span>Symbol</span><SelectMenu ariaLabel="Order symbol" className="oe-control-select" choices={symbols} label={null} variant="solid" value={order.symbol} onChange={(symbol) => setOrder(createOrder(symbol))} />{legs.slice(1).map((_, index) => <div className="oe-leg-placeholder" key={index} />)}</div>
        <div className="oe-field oe-strategy-column oe-spread"><span>Spread</span><div className={`oe-strategy-spread ${name === "Custom" ? "is-custom" : ""}`}><SelectMenu ariaLabel="Order spread" className="oe-control-select" choices={spreads} label={null} variant="solid" value={order.spread} onChange={changeSpread} />{name !== "Custom" ? <button className="oe-strategy-lock" type="button" aria-label={locked ? "Unlock strategy" : "Lock strategy"} aria-pressed={!locked} disabled={!strategyCanLock} onClick={toggleStrategyLock}>{locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}</button> : null}</div>{legs.slice(1).map((_, index) => <div className="oe-leg-cell is-leg-label" key={index}>Leg {index + 2}{!locked && index === legs.length - 2 ? <button className="toe-leg-add" type="button" aria-label="Add leg" onClick={addStrategyLeg}><CirclePlus aria-hidden="true" /></button> : null}</div>)}</div>
        <div className="oe-field oe-strategy-column oe-side"><span>Side</span><SelectMenu ariaLabel="Side for leg 1" className="oe-control-select" choices={strategySides} label={null} variant="solid" value={legs[0].side} onChange={(side) => changeStrategySide(0, side)} />{legs.slice(1).map((leg, index) => locked ? <div className={`oe-leg-cell ${leg.side.startsWith("Sell") ? "is-sell" : "is-buy"}`} key={index}>{leg.side}</div> : <SelectMenu ariaLabel={`Side for leg ${index + 2}`} className="oe-control-select" choices={strategySides} label={null} variant="solid" value={leg.side} onChange={(side) => changeStrategySide(index + 1, side)} key={index} />)}</div>
        <div className="oe-field oe-strategy-column oe-quantity"><span>Quantity</span><div className="oe-quantity-control"><div className="oe-quantity-type" ref={quantityTypeRef} onBlur={closeQuantityMenu}><button type="button" aria-label="Quantity type" aria-expanded={quantityMenuOpen} onClick={() => setQuantityMenuOpen((current) => !current)}><QuantityIcon aria-hidden="true" /><ChevronDown aria-hidden="true" /></button>{renderQuantityMenu()}</div><div className="oe-number-input"><input type="text" inputMode={order.quantityUnit === "Whole Shares" ? "numeric" : "decimal"} aria-label="Quantity for leg 1" value={legs[0].quantity} onFocus={(event) => event.currentTarget.select()} onBlur={() => updateFirstLeg({ quantity: normalizeQuantity(legs[0].quantity, order.quantityUnit) })} onChange={(event) => { const value = event.target.value; const pattern = order.quantityUnit === "Whole Shares" ? wholeQuantityPattern : decimalPattern; if (pattern.test(value) && (value === "" || value === "-" || Number(value) !== 0)) changeStrategyQuantity(0, value); }} /><button type="button" aria-label="Decrease quantity for leg 1" onClick={() => changeStrategyQuantity(0, stepQuantity(legs[0].quantity, order.quantityUnit, -1))}><Minus aria-hidden="true" /></button><button type="button" aria-label="Increase quantity for leg 1" onClick={() => changeStrategyQuantity(0, stepQuantity(legs[0].quantity, order.quantityUnit, 1))}><Plus aria-hidden="true" /></button></div></div>{legs.slice(1).map((leg, index) => locked ? <div className="oe-leg-cell is-quantity" key={index}>{leg.quantity}</div> : <div className="oe-number-input" key={index}><input type="text" inputMode={order.quantityUnit === "Whole Shares" ? "numeric" : "decimal"} aria-label={`Quantity for leg ${index + 2}`} value={leg.quantity} onFocus={(event) => event.currentTarget.select()} onBlur={() => changeStrategyQuantity(index + 1, normalizeQuantity(leg.quantity, order.quantityUnit))} onChange={(event) => { const value = event.target.value; const pattern = order.quantityUnit === "Whole Shares" ? wholeQuantityPattern : decimalPattern; if (pattern.test(value) && (value === "" || value === "-" || Number(value) !== 0)) changeStrategyQuantity(index + 1, value); }} /><button type="button" aria-label={`Decrease quantity for leg ${index + 2}`} onClick={() => changeStrategyQuantity(index + 1, stepQuantity(leg.quantity, order.quantityUnit, -1))}><Minus aria-hidden="true" /></button><button type="button" aria-label={`Increase quantity for leg ${index + 2}`} onClick={() => changeStrategyQuantity(index + 1, stepQuantity(leg.quantity, order.quantityUnit, 1))}><Plus aria-hidden="true" /></button></div>)}</div>
        <div className="oe-field oe-strategy-column oe-expiration"><span>Expiration Date</span>{firstIsOption ? <SelectMenu ariaLabel="Option expiration date for leg 1" className="oe-control-select" choices={expirations} label={null} variant="solid" value={legs[0].expiration} onChange={(expiration) => updateFirstLeg({ expiration })} /> : <div className="oe-leg-cell is-disabled">—</div>}{legs.slice(1).map((leg, index) => leg.instrument === "stock" ? <div className="oe-leg-cell is-disabled" key={index}>—</div> : locked ? <div className="oe-leg-cell" key={index}>{leg.expiration}</div> : <SelectMenu ariaLabel={`Option expiration date for leg ${index + 2}`} className="oe-control-select" choices={expirations} label={null} variant="solid" value={leg.expiration} onChange={(expiration) => updateStrategyLeg(index + 1, { expiration })} key={index} />)}</div>
        <div className="oe-field oe-strategy-column oe-strike"><span>Strike</span>{firstIsOption ? <SelectMenu ariaLabel="Option strike for leg 1" className="oe-control-select" choices={strategyStrikeChoices} label={null} variant="solid" value={legs[0].strike} onChange={(strike) => updateFirstLeg({ strike })} /> : <div className="oe-leg-cell is-disabled">—</div>}{legs.slice(1).map((leg, index) => leg.instrument === "stock" ? <div className="oe-leg-cell is-disabled" key={index}>—</div> : <SelectMenu ariaLabel={`Option strike for leg ${index + 2}`} className="oe-control-select" choices={strategyStrikeChoices} label={null} variant="solid" value={leg.strike} onChange={(strike) => updateStrategyStrike(index + 1, strike)} key={index} />)}</div>
        <div className="oe-field oe-strategy-column oe-option-type"><span>Option Type</span>{firstIsOption ? <SelectMenu ariaLabel="Option type for leg 1" className="oe-control-select" choices={optionTypes} label={null} variant="solid" value={legs[0].optionType} onChange={(optionType) => updateFirstLeg({ optionType })} /> : <div className="oe-leg-cell is-disabled">—</div>}{legs.slice(1).map((leg, index) => leg.instrument === "stock" ? <div className="oe-leg-cell is-disabled" key={index}>—</div> : locked ? <div className="oe-leg-cell" key={index}>{leg.optionType}</div> : <SelectMenu ariaLabel={`Option type for leg ${index + 2}`} className="oe-control-select" choices={optionTypes} label={null} variant="solid" value={leg.optionType} onChange={(optionType) => updateStrategyLeg(index + 1, { optionType })} key={index} />)}</div>
        <div className="oe-field oe-strategy-column oe-order-type"><span>Order Type</span><SelectMenu ariaLabel="Order type" className="oe-control-select" choices={orderTypes} label={null} variant="solid" value={order.orderType} onChange={(orderType) => setOrder({ ...order, orderType })} />{legs.slice(1).map((_, index) => locked ? <div className="oe-leg-placeholder" key={index} /> : <button className="oe-leg-remove" type="button" aria-label={`Remove leg ${index + 2}`} key={index} onClick={() => removeStrategyLeg(index + 1)}><CircleMinus aria-hidden="true" /></button>)}{!locked ? <button className="oe-leg-remove" type="button" aria-label="Add leg" onClick={addStrategyLeg}><Plus aria-hidden="true" /></button> : null}</div>
        <div className={`oe-field oe-strategy-column oe-limit-price ${limitEnabled ? "" : "is-disabled"}`}><span>Limit Price</span><div className="oe-price-control"><div className={`oe-number-input ${limitEnabled ? "" : "is-disabled"}`}><input type="text" inputMode="decimal" aria-label="Limit price" disabled={!limitEnabled} value={limitEnabled ? order.limitPrice : ""} placeholder="—" onFocus={(event) => event.currentTarget.select()} onBlur={() => { if (limitEnabled) setOrder({ ...order, limitPrice: normalizePrice(order.limitPrice) }); }} onChange={(event) => { if (decimalPattern.test(event.target.value)) setOrder({ ...order, limitPrice: event.target.value }); }} /><button type="button" aria-label="Decrease limit price" disabled={!limitEnabled} onClick={() => setOrder({ ...order, limitPrice: stepPrice(order.limitPrice, -1) })}><Minus aria-hidden="true" /></button><button type="button" aria-label="Increase limit price" disabled={!limitEnabled} onClick={() => setOrder({ ...order, limitPrice: stepPrice(order.limitPrice, 1) })}><Plus aria-hidden="true" /></button></div><button className="oe-price-lock" type="button" aria-label={order.priceLockOpen ? "Unlock limit price" : "Lock limit price"} aria-pressed={order.priceLockOpen} disabled={!limitEnabled} onClick={() => setOrder({ ...order, priceLockOpen: !order.priceLockOpen })}>{order.priceLockOpen ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}</button></div>{legs.slice(1).map((_, index) => <div className="oe-leg-placeholder" key={index} />)}</div>
        <div className="oe-field oe-strategy-column oe-price-slider"><span>Limit Price Slider</span>{sliderRange ? <PriceRangeSlider range={sliderRange} value={Number(order.limitPrice) || 0} disabled={!limitEnabled || order.priceLockOpen} onChange={(value) => setOrder({ ...order, limitPrice: value.toFixed(2) })} /> : null}{legs.slice(1).map((_, index) => <div className="oe-leg-placeholder" key={index} />)}</div>
        <div className="oe-field oe-strategy-column oe-duration"><span>Duration</span><SelectMenu ariaLabel="Order duration" className="oe-control-select" choices={durations} label={null} variant="solid" value={order.duration} onChange={(duration) => setOrder({ ...order, duration })} />{legs.slice(1).map((_, index) => <div className="oe-leg-placeholder" key={index} />)}</div>
        <div className="oe-field oe-strategy-column oe-actions"><span /><button type="button" aria-label="Remove order" onClick={() => setOrder({ kind: "empty" })}><X aria-hidden="true" /></button>{legs.slice(1).map((_, index) => <div className="oe-leg-placeholder" key={index} />)}</div>
      </div>
    );
  };

  const tableHasType = template !== "Single";
  const tableHasOptions = isOption || isStrategy;
  const tableHasSlider = isStrategy;
  const tableColumns = [
    tableHasType ? "100px" : "",
    "120px",
    "170px",
    "120px",
    "160px",
    ...(tableHasOptions ? ["120px", "80px", "80px"] : []),
    "140px",
    "140px",
    ...(tableHasSlider ? ["140px"] : []),
    "120px",
    "minmax(32px, 1fr)",
    "24px",
  ].filter(Boolean).join(" ");

  const renderTypeCell = (index: number, count: number) => {
    if (!tableHasType) return null;
    const position = count === 1 ? "single" : index === 0 ? "start" : index === count - 1 ? "end" : "middle";
    if (template === "One Starts the OCO") {
      const childCount = count - 1;
      const childPosition = childCount === 1 ? "single" : index === 1 ? "start" : index === count - 1 ? "end" : "middle";
      return <div className="toe-cell toe-type-cell">{index < 2 ? <span className={`toe-connector is-oso is-${index === 0 ? "start" : "end"}`} /> : null}{index > 0 ? <span className={`toe-connector is-oco is-${childPosition}`} /> : null}<span className={index === 0 ? "is-oso-label" : "is-oco-label"}>{index === 0 ? "OSO" : "OCO"}</span></div>;
    }
    const label = template === "OCO" ? "OCO" : "OSO";
    return <div className="toe-cell toe-type-cell"><span className={`toe-connector ${template === "OCO" ? "is-oco" : "is-oso"} is-${position}`} /><span className={template === "OCO" ? "is-oco-label" : "is-oso-label"}>{label}</span></div>;
  };

  type GroupRow = { linkedOrder: LinkedOrder; orderIndex: number; leg: StrategyLeg | null; legIndex: number };
  const groupRows = linkedOrders.flatMap((linkedOrder, orderIndex): GroupRow[] => linkedOrder.strategy.kind === "multi"
    ? linkedOrder.strategy.legs.map((leg, legIndex) => ({ linkedOrder, orderIndex, leg, legIndex }))
    : [{ linkedOrder, orderIndex, leg: null, legIndex: 0 }]);
  const firstRowByOrder = new Map<string, number>();
  groupRows.forEach((row, rowIndex) => {
    if (row.legIndex === 0 && !firstRowByOrder.has(row.linkedOrder.id)) firstRowByOrder.set(row.linkedOrder.id, rowIndex);
  });
  const osoSequence = orderGroup.kind === "oso-oco" ? [orderGroup.parent, ...orderGroup.pairs.map(([first]) => first)] : orderGroup.kind === "oso" ? [...orderGroup.orders] : [];
  const ocoSequence = orderGroup.kind === "oco" ? [...orderGroup.orders] : [];
  const childOcoSequences = orderGroup.kind === "oso-oco" ? orderGroup.pairs.map(([first, second]) => [first, second]) : [];
  const lineSegment = (sequence: LinkedOrder[], rowIndex: number) => {
    if (sequence.length < 2) return null;
    const firsts = sequence.map((order) => firstRowByOrder.get(order.id) ?? -1);
    if (rowIndex < firsts[0] || rowIndex > firsts[firsts.length - 1]) return null;
    const memberIndex = firsts.indexOf(rowIndex);
    if (memberIndex === -1) return "through";
    if (memberIndex === 0) return "start";
    return memberIndex === firsts.length - 1 ? "end" : "middle";
  };
  const renderLegConnectors = (rowIndex: number) => {
    const connectors = [];
    if (lineSegment(osoSequence, rowIndex) === "through") connectors.push(<span className="toe-connector is-oso is-through" key="oso" />);
    if (lineSegment(ocoSequence, rowIndex) === "through") connectors.push(<span className="toe-connector is-oco is-through" key="oco" />);
    childOcoSequences.forEach((sequence, pairIndex) => {
      if (lineSegment(sequence, rowIndex) === "through") connectors.push(<span className="toe-connector is-oco is-child is-through" key={`oco-${pairIndex}`} />);
    });
    return connectors;
  };
  const renderLegQuantityCell = (linkedOrder: LinkedOrder, leg: StrategyLeg, legIndex: number, first: boolean, key: string) => {
    const pattern = linkedOrder.quantityUnit === "Whole Shares" ? wholeQuantityPattern : decimalPattern;
    const locked = linkedOrder.strategy.kind === "multi" && linkedOrder.strategy.locked;
    const changeQuantity = (value: string) => changeLinkedLegQuantity(linkedOrder, legIndex, value);
    if (!first && locked) return <span className="toe-number">{leg.quantity}</span>;
    return <div className="oe-number-input"><input type="text" inputMode={linkedOrder.quantityUnit === "Whole Shares" ? "numeric" : "decimal"} aria-label={`Quantity for leg ${legIndex + 1} of ${linkedOrder.id}`} value={leg.quantity} onFocus={(event) => event.currentTarget.select()} onBlur={() => changeQuantity(normalizeQuantity(leg.quantity, linkedOrder.quantityUnit))} onChange={(event) => { const value = event.target.value; if (pattern.test(value) && (value === "" || value === "-" || Number(value) !== 0)) changeQuantity(value); }} /><button type="button" aria-label={`Decrease quantity for leg ${legIndex + 1} of ${linkedOrder.id}`} onClick={() => changeQuantity(stepQuantity(leg.quantity, linkedOrder.quantityUnit, -1))}><Minus aria-hidden="true" /></button><button type="button" aria-label={`Increase quantity for leg ${legIndex + 1} of ${linkedOrder.id}`} onClick={() => changeQuantity(stepQuantity(leg.quantity, linkedOrder.quantityUnit, 1))}><Plus aria-hidden="true" /></button></div>;
  };
  const renderQuantityCell = (linkedOrder: LinkedOrder, leg: StrategyLeg | null, legIndex: number, first: boolean, key: string) => {
    if (leg === null) {
      return <div className="oe-quantity-control"><div className="oe-quantity-type"><button type="button" aria-label={`Quantity type for linked order ${key}`}><CircleDot aria-hidden="true" /><ChevronDown aria-hidden="true" /></button></div><div className="oe-number-input"><input type="text" inputMode="numeric" aria-label={`Quantity for linked order ${key}`} value={linkedOrder.quantity} onFocus={(event) => event.currentTarget.select()} onBlur={() => changeLinkedQuantity(linkedOrder, normalizeQuantity(linkedOrder.quantity, linkedOrder.quantityUnit))} onChange={(event) => { const value = event.target.value; if (wholeQuantityPattern.test(value) && (value === "" || value === "-" || Number(value) !== 0)) changeLinkedQuantity(linkedOrder, value); }} /><button type="button" aria-label={`Decrease quantity for linked order ${key}`} onClick={() => changeLinkedQuantity(linkedOrder, stepQuantity(linkedOrder.quantity, linkedOrder.quantityUnit, -1))}><Minus aria-hidden="true" /></button><button type="button" aria-label={`Increase quantity for linked order ${key}`} onClick={() => changeLinkedQuantity(linkedOrder, stepQuantity(linkedOrder.quantity, linkedOrder.quantityUnit, 1))}><Plus aria-hidden="true" /></button></div></div>;
    }
    const inner = renderLegQuantityCell(linkedOrder, leg, legIndex, first, key);
    if (!first) return inner;
    return <div className="oe-quantity-control"><div className="oe-quantity-type"><button type="button" aria-label={`Quantity type for leg 1 of ${key}`}><CircleDot aria-hidden="true" /><ChevronDown aria-hidden="true" /></button></div>{inner}</div>;
  };

  const renderGroupTypeCell = (index: number) => {
    if (orderGroup.kind === "none") return null;
    if (orderGroup.kind === "oco" || orderGroup.kind === "oso") {
      const oco = orderGroup.kind === "oco";
      return <div className="toe-cell toe-type-cell"><span className={`toe-connector ${oco ? "is-oco" : "is-oso"} is-${index === 0 ? "start" : "end"}`} /><span className={oco ? "is-oco-label" : "is-oso-label"}>{oco ? "OCO" : "OSO"}</span></div>;
    }
    if (index === 0) return <div className="toe-cell toe-type-cell"><span className="toe-connector is-oso is-start" /><span className="is-oso-label">OSO</span></div>;
    const childIndex = index - 1;
    const pairFirst = childIndex % 2 === 0;
    const lastParentBranch = 1 + (orderGroup.pairs.length - 1) * 2;
    const parentPosition = index === lastParentBranch ? "end" : pairFirst ? "middle" : "through";
    return <div className="toe-cell toe-type-cell">{index <= lastParentBranch ? <span className={`toe-connector is-oso is-${parentPosition}`} /> : null}<span className={`toe-connector is-oco is-child is-${pairFirst ? "start" : "end"}`} /><span className="is-oco-label">OCO</span></div>;
  };

  const renderOrderGroup = () => {
    if (orderGroup.kind === "none") return null;
    const groupHasOptions = linkedOrders.some((linkedOrder) => linkedOrder.spread === "Single" || linkedOrder.strategy.kind === "multi");
    const groupHasStop = linkedOrders.some((linkedOrder) => hasStopPrice(linkedOrder.orderType));
    const groupHasSlider = linkedOrders.some((linkedOrder) => linkedOrder.strategy.kind === "multi" && linkedOrder.strategy.legs.some((leg) => leg.instrument === "option"));
    const groupColumns = ["100px", "120px", "170px", "120px", "160px", ...(groupHasOptions ? ["120px", "80px", "80px"] : []), "140px", "140px", ...(groupHasSlider ? ["140px"] : []), ...(groupHasStop ? ["140px"] : []), "120px", "minmax(32px, 1fr)", "24px"].join(" ");
    const headers = ["Type", "Symbol", "Spread", "Side", "Quantity", ...(groupHasOptions ? ["Expiration Date", "Strike", "Option Type"] : []), "Order Type", "Limit Price", ...(groupHasSlider ? ["Limit Price Slider"] : []), ...(groupHasStop ? ["Stop Price"] : []), "Duration", "", ""];
    const clearGroup = () => {
      setOrderGroup({ kind: "none" });
      setTemplate("Single");
      setOrder({ kind: "empty" });
    };
    const mutedCells = (count: number, key: string) => Array.from({ length: count }, (_, index) => <div className="toe-cell" key={`${key}-${index}`}><span className="toe-muted">—</span></div>);
    const renderLegOptionCells = (linkedOrder: LinkedOrder, leg: StrategyLeg, legIndex: number, key: string) => {
      if (leg.instrument !== "option") return mutedCells(3, key);
      const locked = linkedOrder.strategy.kind === "multi" && linkedOrder.strategy.locked;
      const editable = legIndex === 0 || !locked;
      const changeField = (update: Partial<StrategyLeg>) => linkedOrder.strategy.kind === "multi" ? changeLinkedLegField(linkedOrder, legIndex, update) : changeLinkedOrder(linkedOrder.id, update);
      const optionData = getOptionInstrument(linkedOrder.symbol);
      const strategyLegs = linkedOrder.strategy.kind === "multi" ? linkedOrder.strategy.legs : [];
      const legStrikes = [...new Set([...optionData.rows.map((row) => `${row.strike}`), ...strategyLegs.filter((strategyLeg) => strategyLeg.instrument === "option").map((strategyLeg) => strategyLeg.strike)])].sort((left, right) => Number(left) - Number(right)).map((value) => ({ value, icon: null }));
      return <>
        <div className="toe-cell oe-field oe-expiration">{editable ? <SelectMenu ariaLabel={`Option expiration date for leg ${legIndex + 1} of ${linkedOrder.id}`} className="oe-control-select" choices={toChoices(optionData.expirations)} label={null} variant="solid" value={leg.expiration} onChange={(expiration) => changeField({ expiration })} /> : <span>{leg.expiration}</span>}</div>
        <div className="toe-cell oe-field oe-strike">{editable ? <SelectMenu ariaLabel={`Option strike for leg ${legIndex + 1} of ${linkedOrder.id}`} className="oe-control-select" choices={legStrikes} label={null} variant="solid" value={leg.strike} onChange={(strike) => changeField({ strike })} /> : <span>{leg.strike}</span>}</div>
        <div className="toe-cell oe-field oe-option-type">{editable ? <SelectMenu ariaLabel={`Option type for leg ${legIndex + 1} of ${linkedOrder.id}`} className="oe-control-select" choices={optionTypes} label={null} variant="solid" value={leg.optionType} onChange={(optionType) => changeField({ optionType })} /> : <span>{leg.optionType}</span>}</div>
      </>;
    };
    return <div className="toe-group-layout">
      <div className="table-order-entry-grid is-order-group" style={{ gridTemplateColumns: groupColumns }}>
        {headers.map((header, index) => <div className="toe-header-cell" key={`${header}-${index}`}>{header}</div>)}
        {groupRows.map(({ linkedOrder, orderIndex, leg, legIndex }, rowIndex) => {
          const first = leg === null || legIndex === 0;
          const strategy = linkedOrder.strategy.kind === "multi" ? linkedOrder.strategy : null;
          const locked = strategy?.locked ?? false;
          const limit = hasLimitPrice(linkedOrder.orderType);
          const stop = hasStopPrice(linkedOrder.orderType);
          const rowKey = `${linkedOrder.id}-${legIndex}`;
          const sliderRange = strategy && hasLimitPrice(linkedOrder.orderType) ? strategyPriceRange(linkedOrder.symbol, strategy.legs, linkedOrder.side) : null;
          return <div className="toe-row" data-order-id={linkedOrder.id} key={rowKey}>
            {first ? renderGroupTypeCell(orderIndex) : <div className="toe-cell toe-type-cell toe-cell-empty">{renderLegConnectors(rowIndex)}</div>}
            <div className={`toe-cell oe-field oe-symbol ${first ? "" : "toe-cell-empty"}`}>{first ? <SelectMenu ariaLabel={`Symbol for linked order ${orderIndex + 1}`} className="oe-control-select" choices={symbols} label={null} variant="solid" value={linkedOrder.symbol} onChange={(symbol) => changeLinkedOrder(linkedOrder.id, { symbol })} /> : null}</div>
            <div className={`toe-cell oe-field oe-spread ${first ? "" : "toe-cell-empty"}`}>{first ? (strategy ? <div className={`oe-strategy-spread ${strategy.name === "Custom" ? "is-custom" : ""}`}><SelectMenu ariaLabel={`Spread for linked order ${orderIndex + 1}`} className="oe-control-select" choices={spreads} label={null} variant="solid" value={linkedOrder.spread} onChange={(spread) => changeLinkedSpread(linkedOrder, spread)} />{strategy.name !== "Custom" ? <button className="oe-strategy-lock" type="button" aria-label={locked ? "Unlock strategy" : "Lock strategy"} aria-pressed={!locked} onClick={() => toggleLinkedLock(linkedOrder)}>{locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}</button> : null}</div> : <SelectMenu ariaLabel={`Spread for linked order ${orderIndex + 1}`} className="oe-control-select" choices={spreads} label={null} variant="solid" value={linkedOrder.spread} onChange={(spread) => changeLinkedSpread(linkedOrder, spread)} />) : <><span className="toe-muted">Leg {legIndex + 1}</span>{!locked && strategy && legIndex === strategy.legs.length - 1 ? <button className="toe-leg-add" type="button" aria-label={`Add leg to ${linkedOrder.id}`} onClick={() => addLinkedLeg(linkedOrder)}><CirclePlus aria-hidden="true" /></button> : null}</>}</div>
            <div className="toe-cell oe-field oe-side">{leg === null ? <SelectMenu ariaLabel={`Side for linked order ${orderIndex + 1}`} className="oe-control-select" choices={sides} label={null} variant="solid" value={linkedOrder.side} onChange={(side) => changeLinkedSide(linkedOrder, side)} /> : first || !locked ? <SelectMenu ariaLabel={`Side for leg ${legIndex + 1} of ${linkedOrder.id}`} className="oe-control-select" choices={strategySides} label={null} variant="solid" value={leg.side} onChange={(side) => changeLinkedLegSide(linkedOrder, legIndex, side)} /> : <span className={leg.side.startsWith("Sell") ? "toe-sell" : "toe-buy"}>{leg.side}</span>}</div>
            <div className="toe-cell oe-field oe-quantity">{renderQuantityCell(linkedOrder, leg, legIndex, first, rowKey)}</div>
            {groupHasOptions ? (leg === null ? (linkedOrder.spread === "Single" ? renderLegOptionCells(linkedOrder, { instrument: "option", side: linkedOrder.side, quantity: linkedOrder.quantity, expiration: linkedOrder.expiration, strike: linkedOrder.strike, optionType: linkedOrder.optionType }, 0, rowKey) : mutedCells(3, rowKey)) : renderLegOptionCells(linkedOrder, leg, legIndex, rowKey)) : null}
            <div className={`toe-cell oe-field oe-order-type ${first ? "" : "toe-cell-empty"}`}>{first ? <SelectMenu ariaLabel={`Order type for linked order ${orderIndex + 1}`} className="oe-control-select" choices={orderTypes} label={null} variant="solid" value={linkedOrder.orderType} onChange={(orderType) => changeLinkedOrder(linkedOrder.id, { orderType })} /> : null}</div>
            <div className={`toe-cell oe-field oe-limit-price ${first ? "" : "toe-cell-empty"}`}>{first && limit ? <div className="oe-price-control"><div className="oe-number-input"><input type="text" inputMode="decimal" aria-label={`Limit price for linked order ${orderIndex + 1}`} value={linkedOrder.limitPrice} onFocus={(event) => event.currentTarget.select()} onBlur={() => changeLinkedOrder(linkedOrder.id, { limitPrice: normalizePrice(linkedOrder.limitPrice) })} onChange={(event) => { if (decimalPattern.test(event.target.value)) changeLinkedOrder(linkedOrder.id, { limitPrice: event.target.value }); }} /><button type="button" aria-label={`Decrease limit price for linked order ${orderIndex + 1}`} onClick={() => changeLinkedOrder(linkedOrder.id, { limitPrice: stepPrice(linkedOrder.limitPrice, -1) })}><Minus aria-hidden="true" /></button><button type="button" aria-label={`Increase limit price for linked order ${orderIndex + 1}`} onClick={() => changeLinkedOrder(linkedOrder.id, { limitPrice: stepPrice(linkedOrder.limitPrice, 1) })}><Plus aria-hidden="true" /></button></div><button className="oe-price-lock" type="button" aria-label={linkedOrder.priceLockOpen ? "Unlock limit price" : "Lock limit price"} aria-pressed={linkedOrder.priceLockOpen} onClick={() => changeLinkedOrder(linkedOrder.id, { priceLockOpen: !linkedOrder.priceLockOpen })}>{linkedOrder.priceLockOpen ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}</button></div> : null}</div>
            {groupHasSlider ? <div className={`toe-cell toe-cell-slider ${first && sliderRange ? "" : "toe-cell-empty"}`}>{first && sliderRange ? <PriceRangeSlider range={sliderRange} value={Number(linkedOrder.limitPrice) || 0} disabled={!limit || linkedOrder.priceLockOpen} onChange={(value) => changeLinkedOrder(linkedOrder.id, { limitPrice: value.toFixed(2) })} /> : null}</div> : null}
            {groupHasStop ? <div className={`toe-cell oe-field oe-stop-price ${first ? "" : "toe-cell-empty"}`}>{first && stop ? <div className="oe-price-control"><button className="oe-price-lock" type="button" aria-label={`Follow market stop price for linked order ${orderIndex + 1}`}><Lock aria-hidden="true" /></button><div className="oe-number-input"><input type="text" inputMode="decimal" aria-label={`Stop price for linked order ${orderIndex + 1}`} value={linkedOrder.stopPrice} onFocus={(event) => event.currentTarget.select()} onBlur={() => changeLinkedOrder(linkedOrder.id, { stopPrice: normalizePrice(linkedOrder.stopPrice) })} onChange={(event) => { if (decimalPattern.test(event.target.value)) changeLinkedOrder(linkedOrder.id, { stopPrice: event.target.value }); }} /><button type="button" aria-label={`Decrease stop price for linked order ${orderIndex + 1}`} onClick={() => changeLinkedOrder(linkedOrder.id, { stopPrice: stepPrice(linkedOrder.stopPrice, -1) })}><Minus aria-hidden="true" /></button><button type="button" aria-label={`Increase stop price for linked order ${orderIndex + 1}`} onClick={() => changeLinkedOrder(linkedOrder.id, { stopPrice: stepPrice(linkedOrder.stopPrice, 1) })}><Plus aria-hidden="true" /></button></div></div> : null}</div> : null}
            <div className={`toe-cell oe-field oe-duration ${first ? "" : "toe-cell-empty"}`}>{first ? <SelectMenu ariaLabel={`Duration for linked order ${orderIndex + 1}`} className="oe-control-select" choices={durations} label={null} variant="solid" value={linkedOrder.duration} onChange={(duration) => changeLinkedOrder(linkedOrder.id, { duration })} /> : null}</div>
            <div className="toe-cell toe-cell-empty" />
            <div className={`toe-cell toe-action-cell ${first || !locked ? "" : "toe-cell-empty"}`}>{first ? <button type="button" aria-label="Remove order group" onClick={clearGroup}><X aria-hidden="true" /></button> : !locked ? <button type="button" aria-label={`Remove leg ${legIndex + 1} of ${linkedOrder.id}`} onClick={() => removeLinkedLeg(linkedOrder, legIndex)}><CircleMinus aria-hidden="true" /></button> : null}</div>
          </div>;
        })}
      </div>
      {orderGroup.kind === "oso-oco" && orderGroup.pairs.length < 3 ? <button className="toe-add-oco" type="button" onClick={addOcoPair}><Plus aria-hidden="true" /> Add OCO</button> : null}
    </div>;
  };

  const renderFormGroup = () => {
    if (orderGroup.kind === "none") return null;
    const groupHasOptions = linkedOrders.some((linkedOrder) => linkedOrder.spread === "Single" || linkedOrder.strategy.kind === "multi");
    const groupHasStop = linkedOrders.some((linkedOrder) => hasStopPrice(linkedOrder.orderType));
    const groupHasSlider = linkedOrders.some((linkedOrder) => linkedOrder.strategy.kind === "multi" && linkedOrder.strategy.legs.some((leg) => leg.instrument === "option"));
    const columns = ["72px", "120px", "192px", "120px", "230px", ...(groupHasOptions ? ["120px", "80px", "80px"] : []), "160px", "160px", ...(groupHasSlider ? ["160px"] : []), ...(groupHasStop ? ["160px"] : []), "100px", "minmax(32px, 1fr)"].join(" ");
    const clearGroup = () => {
      setOrderGroup({ kind: "none" });
      setTemplate("Single");
      setOrder({ kind: "empty" });
    };
    const renderFormTypeCell = (orderIndex: number) => {
      if (orderGroup.kind === "oco" || orderGroup.kind === "oso") {
        const oco = orderGroup.kind === "oco";
        return <><span className={`toe-connector ${oco ? "is-oco" : "is-oso"} is-${orderIndex === 0 ? "start" : "end"}`} /><span className={`oeg-badge ${oco ? "is-oco" : "is-oso"}`}>{oco ? "OCO" : "OSO"}</span></>;
      }
      if (orderIndex === 0) return <><span className="toe-connector is-oso is-start" /><span className="oeg-badge is-oso">OSO</span></>;
      const childIndex = orderIndex - 1;
      const pairFirst = childIndex % 2 === 0;
      const lastParentBranch = 1 + (orderGroup.pairs.length - 1) * 2;
      const parentPosition = orderIndex === lastParentBranch ? "end" : pairFirst ? "middle" : "through";
      return <>
        {orderIndex <= lastParentBranch ? <span className={`toe-connector is-oso is-${parentPosition}`} /> : null}
        <span className={`toe-connector is-oco is-child is-${pairFirst ? "start" : "end"}`} />
        <span className="oeg-badge is-oco">OCO</span>
      </>;
    };
    const rows = groupRows.map(({ linkedOrder, orderIndex, leg, legIndex }, rowIndex) => {
      const first = leg === null || legIndex === 0;
      const strategy = linkedOrder.strategy.kind === "multi" ? linkedOrder.strategy : null;
      const locked = strategy?.locked ?? false;
      const limit = hasLimitPrice(linkedOrder.orderType);
      const stop = hasStopPrice(linkedOrder.orderType);
      const rowKey = `${linkedOrder.id}-${legIndex}`;
      const optionLeg = leg ?? (linkedOrder.spread === "Single" ? { instrument: "option" as const, side: linkedOrder.side, quantity: linkedOrder.quantity, expiration: linkedOrder.expiration, strike: linkedOrder.strike, optionType: linkedOrder.optionType } : null);
      const showOptions = groupHasOptions && optionLeg !== null;
      const changeField = (update: Partial<StrategyLeg>) => strategy ? changeLinkedLegField(linkedOrder, legIndex, update) : changeLinkedOrder(linkedOrder.id, update);
      const optionData = getOptionInstrument(linkedOrder.symbol);
      const strategyLegs = strategy ? strategy.legs : [];
      const legStrikes = [...new Set([...optionData.rows.map((row) => `${row.strike}`), ...strategyLegs.filter((strategyLeg) => strategyLeg.instrument === "option").map((strategyLeg) => strategyLeg.strike)])].sort((left, right) => Number(left) - Number(right)).map((value) => ({ value, icon: null }));
      const emptyCell = <span className="oe-leg-cell" />;
      const disabledCell = <span className="oe-leg-cell is-disabled">—</span>;
      const editable = leg === null || first || !locked;
      const sliderRange = strategy && hasLimitPrice(linkedOrder.orderType) ? strategyPriceRange(linkedOrder.symbol, strategy.legs, linkedOrder.side) : null;
      const lastLeg = leg !== null && strategy !== null && legIndex === strategy.legs.length - 1;
      return {
        rowKey, first, locked, limit, stop, linkedOrder, orderIndex, leg, legIndex, strategy, emptyCell, disabledCell, editable, changeField, optionData, legStrikes, optionLeg, showOptions, sliderRange, lastLeg,
      };
    });
    const columnsDef: { label: string; render: (row: (typeof rows)[number]) => ReactNode }[] = [
      { label: "Symbol", render: (row) => row.first ? <SelectMenu ariaLabel={`Symbol for linked order ${row.orderIndex + 1}`} className="oe-control-select" choices={symbols} label={null} variant="solid" value={row.linkedOrder.symbol} onChange={(symbol) => changeLinkedOrder(row.linkedOrder.id, { symbol })} /> : null },
      { label: "Spread", render: (row) => row.first ? (row.strategy ? <div className={`oe-strategy-spread ${row.strategy.name === "Custom" ? "is-custom" : ""}`}><SelectMenu ariaLabel={`Spread for linked order ${row.orderIndex + 1}`} className="oe-control-select" choices={spreads} label={null} variant="solid" value={row.linkedOrder.spread} onChange={(spread) => changeLinkedSpread(row.linkedOrder, spread)} />{row.strategy.name !== "Custom" ? <button className="oe-strategy-lock" type="button" aria-label={row.locked ? "Unlock strategy" : "Lock strategy"} aria-pressed={!row.locked} onClick={() => toggleLinkedLock(row.linkedOrder)}>{row.locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}</button> : null}</div> : <SelectMenu ariaLabel={`Spread for linked order ${row.orderIndex + 1}`} className="oe-control-select" choices={spreads} label={null} variant="solid" value={row.linkedOrder.spread} onChange={(spread) => changeLinkedSpread(row.linkedOrder, spread)} />) : <div className="oe-leg-cell is-leg-label">Leg {row.legIndex + 1}{row.lastLeg && !row.locked ? <button className="toe-leg-add" type="button" aria-label={`Add leg to ${row.linkedOrder.id}`} onClick={() => addLinkedLeg(row.linkedOrder)}><CirclePlus aria-hidden="true" /></button> : null}</div> },
      { label: "Side", render: (row) => row.leg === null ? <SelectMenu ariaLabel={`Side for linked order ${row.orderIndex + 1}`} className="oe-control-select" choices={sides} label={null} variant="solid" value={row.linkedOrder.side} onChange={(side) => changeLinkedSide(row.linkedOrder, side)} /> : row.editable ? <SelectMenu ariaLabel={`Side for leg ${row.legIndex + 1} of ${row.linkedOrder.id}`} className="oe-control-select" choices={strategySides} label={null} variant="solid" value={row.leg.side} onChange={(side) => changeLinkedLegSide(row.linkedOrder, row.legIndex, side)} /> : <span className={`oe-leg-cell ${row.leg.side.startsWith("Sell") ? "is-sell" : "is-buy"}`}>{row.leg.side}</span> },
      { label: "Quantity", render: (row) => renderQuantityCell(row.linkedOrder, row.leg, row.legIndex, row.first, row.rowKey) },
      ...(groupHasOptions ? [
        { label: "Expiration Date", render: (row: (typeof rows)[number]) => row.optionLeg === null ? row.disabledCell : row.optionLeg.instrument !== "option" ? row.disabledCell : row.editable ? <SelectMenu ariaLabel={`Option expiration date for ${row.rowKey}`} className="oe-control-select" choices={toChoices(row.optionData.expirations)} label={null} variant="solid" value={row.optionLeg.expiration} onChange={(expiration) => row.changeField({ expiration })} /> : <span className="oe-leg-cell">{row.optionLeg.expiration}</span> },
        { label: "Strike", render: (row: (typeof rows)[number]) => row.optionLeg === null ? row.disabledCell : row.optionLeg.instrument !== "option" ? row.disabledCell : row.editable ? <SelectMenu ariaLabel={`Option strike for ${row.rowKey}`} className="oe-control-select" choices={row.legStrikes} label={null} variant="solid" value={row.optionLeg.strike} onChange={(strike) => row.changeField({ strike })} /> : <span className="oe-leg-cell">{row.optionLeg.strike}</span> },
        { label: "Option Type", render: (row: (typeof rows)[number]) => row.optionLeg === null ? row.disabledCell : row.optionLeg.instrument !== "option" ? row.disabledCell : row.editable ? <SelectMenu ariaLabel={`Option type for ${row.rowKey}`} className="oe-control-select" choices={optionTypes} label={null} variant="solid" value={row.optionLeg.optionType} onChange={(optionType) => row.changeField({ optionType })} /> : <span className="oe-leg-cell">{row.optionLeg.optionType}</span> },
      ] : []),
      { label: "Order Type", render: (row) => row.first ? <SelectMenu ariaLabel={`Order type for linked order ${row.orderIndex + 1}`} className="oe-control-select" choices={orderTypes} label={null} variant="solid" value={row.linkedOrder.orderType} onChange={(orderType) => changeLinkedOrder(row.linkedOrder.id, { orderType })} /> : row.emptyCell },
      { label: "Limit Price", render: (row) => row.first && row.limit ? <div className="oe-price-control"><div className="oe-number-input"><input type="text" inputMode="decimal" aria-label={`Limit price for linked order ${row.orderIndex + 1}`} value={row.linkedOrder.limitPrice} onFocus={(event) => event.currentTarget.select()} onBlur={() => changeLinkedOrder(row.linkedOrder.id, { limitPrice: normalizePrice(row.linkedOrder.limitPrice) })} onChange={(event) => { if (decimalPattern.test(event.target.value)) changeLinkedOrder(row.linkedOrder.id, { limitPrice: event.target.value }); }} /><button type="button" aria-label={`Decrease limit price for linked order ${row.orderIndex + 1}`} onClick={() => changeLinkedOrder(row.linkedOrder.id, { limitPrice: stepPrice(row.linkedOrder.limitPrice, -1) })}><Minus aria-hidden="true" /></button><button type="button" aria-label={`Increase limit price for linked order ${row.orderIndex + 1}`} onClick={() => changeLinkedOrder(row.linkedOrder.id, { limitPrice: stepPrice(row.linkedOrder.limitPrice, 1) })}><Plus aria-hidden="true" /></button></div><button className="oe-price-lock" type="button" aria-label={row.linkedOrder.priceLockOpen ? "Unlock limit price" : "Lock limit price"} aria-pressed={row.linkedOrder.priceLockOpen} onClick={() => changeLinkedOrder(row.linkedOrder.id, { priceLockOpen: !row.linkedOrder.priceLockOpen })}>{row.linkedOrder.priceLockOpen ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}</button></div> : row.emptyCell },
      ...(groupHasSlider ? [{ label: "Limit Price Slider", render: (row: (typeof rows)[number]) => row.first && row.sliderRange ? <PriceRangeSlider range={row.sliderRange} value={Number(row.linkedOrder.limitPrice) || 0} disabled={!row.limit || row.linkedOrder.priceLockOpen} onChange={(value) => changeLinkedOrder(row.linkedOrder.id, { limitPrice: value.toFixed(2) })} /> : null }] : []),
      ...(groupHasStop ? [{ label: "Stop Price", render: (row: (typeof rows)[number]) => row.first && row.stop ? <div className="oe-price-control"><button className="oe-price-lock" type="button" aria-label={`Follow market stop price for linked order ${row.orderIndex + 1}`}><Lock aria-hidden="true" /></button><div className="oe-number-input"><input type="text" inputMode="decimal" aria-label={`Stop price for linked order ${row.orderIndex + 1}`} value={row.linkedOrder.stopPrice} onFocus={(event) => event.currentTarget.select()} onBlur={() => changeLinkedOrder(row.linkedOrder.id, { stopPrice: normalizePrice(row.linkedOrder.stopPrice) })} onChange={(event) => { if (decimalPattern.test(event.target.value)) changeLinkedOrder(row.linkedOrder.id, { stopPrice: event.target.value }); }} /><button type="button" aria-label={`Decrease stop price for linked order ${row.orderIndex + 1}`} onClick={() => changeLinkedOrder(row.linkedOrder.id, { stopPrice: stepPrice(row.linkedOrder.stopPrice, -1) })}><Minus aria-hidden="true" /></button><button type="button" aria-label={`Increase stop price for linked order ${row.orderIndex + 1}`} onClick={() => changeLinkedOrder(row.linkedOrder.id, { stopPrice: stepPrice(row.linkedOrder.stopPrice, 1) })}><Plus aria-hidden="true" /></button></div></div> : row.emptyCell }] : []),
      { label: "Duration", render: (row) => row.first ? <SelectMenu ariaLabel={`Duration for linked order ${row.orderIndex + 1}`} className="oe-control-select" choices={durations} label={null} variant="solid" value={row.linkedOrder.duration} onChange={(duration) => changeLinkedOrder(row.linkedOrder.id, { duration })} /> : row.emptyCell },
      { label: "", render: (row) => row.first ? <button className="oe-leg-remove" type="button" aria-label="Remove order group" onClick={clearGroup}><X aria-hidden="true" /></button> : row.leg !== null && !row.locked ? <button className="oe-leg-remove" type="button" aria-label={`Remove leg ${row.legIndex + 1} of ${row.linkedOrder.id}`} onClick={() => removeLinkedLeg(row.linkedOrder, row.legIndex)}><CircleMinus aria-hidden="true" /></button> : row.emptyCell },
    ];
    return <>
      <div className="order-entry-fields is-group" style={{ gridTemplateColumns: columns }}>
        <div className="oe-field oe-strategy-column oeg-type-column"><span aria-hidden="true" />{rows.map((row, rowIndex) => <div className={`oeg-type-cell ${row.first && row.orderIndex > 0 ? "is-order-start" : ""}`} key={row.rowKey}>{row.first ? renderFormTypeCell(row.orderIndex) : renderLegConnectors(rowIndex)}</div>)}</div>
        {columnsDef.map((column) => <div className="oe-field oe-strategy-column" key={column.label}>{column.label ? <span>{column.label}</span> : <span aria-hidden="true" />}{rows.map((row) => <div className={`oeg-cell ${row.first && row.orderIndex > 0 ? "is-order-start" : ""}`} key={row.rowKey}>{column.render(row)}</div>)}</div>)}
      </div>
      {orderGroup.kind === "oso-oco" && orderGroup.pairs.length < 3 ? <button className="toe-add-oco oeg-add-oco" type="button" onClick={addOcoPair}><Plus aria-hidden="true" /> Add OCO</button> : null}
    </>;
  };

  const renderTableFields = () => {
    if (orderGroup.kind !== "none") return renderOrderGroup();
    const headers = [
      ...(tableHasType ? ["Type"] : []),
      "Symbol",
      "Spread",
      "Side",
      "Quantity",
      ...(tableHasOptions ? ["Expiration Date", "Strike", "Option Type"] : []),
      "Order Type",
      "Limit Price",
      ...(tableHasSlider ? ["Limit Price Slider"] : []),
      "Duration",
      "",
      "",
    ];

    if (order.kind === "single" && order.strategy.kind === "multi") {
      const { name, legs, locked } = order.strategy;
      const strategyCanLock = name !== "Custom" && name !== "Combo";
      const optionData = getOptionInstrument(order.symbol);
      const sliderRange = strategyPriceRange(order.symbol, legs, order.side);
      const legExpirations = toChoices(optionData.expirations);
      const legStrikes = [...new Set([...optionData.rows.map((row) => `${row.strike}`), ...legs.filter((leg) => leg.instrument === "option").map((leg) => leg.strike)])].sort((left, right) => Number(left) - Number(right)).map((value) => ({ value, icon: null }));
      const updateFirstLeg = (update: Partial<StrategyLeg>) => locked ? changeLockedStrategy(update) : updateStrategyLeg(0, update);
      const changeSide = (index: number, side: string) => {
        const update = { side, quantity: quantityForSide(side, legs[index].quantity, order.quantityUnit) };
        if (index === 0) updateFirstLeg(update);
        else updateStrategyLeg(index, update);
      };

      return (
        <div className="table-order-entry-grid is-strategy" style={{ gridTemplateColumns: tableColumns }}>
          {headers.map((header, index) => <div className="toe-header-cell" key={`${header}-${index}`}>{header}</div>)}
          {legs.map((leg, index) => {
            const first = index === 0;
            const option = leg.instrument === "option";
            return <div className="toe-row" key={`${leg.expiration}-${leg.strike}-${index}`}>
              {renderTypeCell(index, legs.length)}
              <div className={`toe-cell oe-field oe-symbol ${first ? "" : "toe-cell-empty"}`}>{first ? <SelectMenu ariaLabel="Order symbol" className="oe-control-select" choices={symbols} label={null} variant="solid" value={order.symbol} onChange={(symbol) => setOrder(createOrder(symbol))} /> : null}</div>
              <div className={`toe-cell oe-field oe-spread ${first ? "" : "toe-cell-empty"}`}>{first ? <div className={`oe-strategy-spread ${name === "Custom" ? "is-custom" : ""}`}><SelectMenu ariaLabel="Order spread" className="oe-control-select" choices={spreads} label={null} variant="solid" value={order.spread} onChange={changeSpread} />{name !== "Custom" ? <button className="oe-strategy-lock" type="button" aria-label={locked ? "Unlock strategy" : "Lock strategy"} aria-pressed={!locked} disabled={!strategyCanLock} onClick={toggleStrategyLock}>{locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}</button> : null}</div> : <><span className="toe-muted">Leg {index + 1}</span>{!locked && index === legs.length - 1 ? <button className="toe-leg-add" type="button" aria-label="Add leg" onClick={addStrategyLeg}><CirclePlus aria-hidden="true" /></button> : null}</>}</div>
              <div className="toe-cell oe-field oe-side">{first || !locked ? <SelectMenu ariaLabel={`Side for leg ${index + 1}`} className="oe-control-select" choices={strategySides} label={null} variant="solid" value={leg.side} onChange={(side) => changeSide(index, side)} /> : <span className={leg.side.startsWith("Sell") ? "toe-sell" : "toe-buy"}>{leg.side}</span>}</div>
              <div className="toe-cell oe-field oe-quantity">{first ? <div className="oe-quantity-control"><div className="oe-quantity-type" ref={quantityTypeRef} onBlur={closeQuantityMenu}><button type="button" aria-label="Quantity type" aria-expanded={quantityMenuOpen} onClick={() => setQuantityMenuOpen((current) => !current)}><QuantityIcon aria-hidden="true" /><ChevronDown aria-hidden="true" /></button>{renderQuantityMenu()}</div><div className="oe-number-input"><input type="text" inputMode={order.quantityUnit === "Whole Shares" ? "numeric" : "decimal"} aria-label="Quantity for leg 1" value={leg.quantity} onFocus={(event) => event.currentTarget.select()} onBlur={() => updateFirstLeg({ quantity: normalizeQuantity(leg.quantity, order.quantityUnit) })} onChange={(event) => { const value = event.target.value; const pattern = order.quantityUnit === "Whole Shares" ? wholeQuantityPattern : decimalPattern; if (pattern.test(value) && (value === "" || value === "-" || Number(value) !== 0)) changeStrategyQuantity(0, value); }} /><button type="button" aria-label="Decrease quantity for leg 1" onClick={() => changeStrategyQuantity(0, stepQuantity(leg.quantity, order.quantityUnit, -1))}><Minus aria-hidden="true" /></button><button type="button" aria-label="Increase quantity for leg 1" onClick={() => changeStrategyQuantity(0, stepQuantity(leg.quantity, order.quantityUnit, 1))}><Plus aria-hidden="true" /></button></div></div> : locked ? <span className="toe-number">{leg.quantity}</span> : <div className="oe-number-input"><input type="text" inputMode={order.quantityUnit === "Whole Shares" ? "numeric" : "decimal"} aria-label={`Quantity for leg ${index + 1}`} value={leg.quantity} onFocus={(event) => event.currentTarget.select()} onBlur={() => changeStrategyQuantity(index, normalizeQuantity(leg.quantity, order.quantityUnit))} onChange={(event) => { const value = event.target.value; const pattern = order.quantityUnit === "Whole Shares" ? wholeQuantityPattern : decimalPattern; if (pattern.test(value) && (value === "" || value === "-" || Number(value) !== 0)) changeStrategyQuantity(index, value); }} /><button type="button" aria-label={`Decrease quantity for leg ${index + 1}`} onClick={() => changeStrategyQuantity(index, stepQuantity(leg.quantity, order.quantityUnit, -1))}><Minus aria-hidden="true" /></button><button type="button" aria-label={`Increase quantity for leg ${index + 1}`} onClick={() => changeStrategyQuantity(index, stepQuantity(leg.quantity, order.quantityUnit, 1))}><Plus aria-hidden="true" /></button></div>}</div>
              <div className="toe-cell oe-field oe-expiration">{option ? first || !locked ? <SelectMenu ariaLabel={`Option expiration date for leg ${index + 1}`} className="oe-control-select" choices={legExpirations} label={null} variant="solid" value={leg.expiration} onChange={(expiration) => first ? updateFirstLeg({ expiration }) : updateStrategyLeg(index, { expiration })} /> : <span>{leg.expiration}</span> : <span className="toe-muted">—</span>}</div>
              <div className="toe-cell oe-field oe-strike">{option ? <SelectMenu ariaLabel={`Option strike for leg ${index + 1}`} className="oe-control-select" choices={legStrikes} label={null} variant="solid" value={leg.strike} onChange={(strike) => first ? updateFirstLeg({ strike }) : updateStrategyStrike(index, strike)} /> : <span className="toe-muted">—</span>}</div>
              <div className="toe-cell oe-field oe-option-type">{option ? first || !locked ? <SelectMenu ariaLabel={`Option type for leg ${index + 1}`} className="oe-control-select" choices={optionTypes} label={null} variant="solid" value={leg.optionType} onChange={(optionType) => first ? updateFirstLeg({ optionType }) : updateStrategyLeg(index, { optionType })} /> : <span>{leg.optionType}</span> : <span className="toe-muted">—</span>}</div>
              <div className={`toe-cell oe-field oe-order-type ${first ? "" : "toe-cell-empty"}`}>{first ? <SelectMenu ariaLabel="Order type" className="oe-control-select" choices={orderTypes} label={null} variant="solid" value={order.orderType} onChange={(orderType) => setOrder({ ...order, orderType })} /> : null}</div>
              <div className={`toe-cell oe-field oe-limit-price ${first ? "" : "toe-cell-empty"}`}>{first ? <div className="oe-price-control"><div className={`oe-number-input ${limitEnabled ? "" : "is-disabled"}`}><input type="text" inputMode="decimal" aria-label="Limit price" disabled={!limitEnabled} value={limitEnabled ? order.limitPrice : ""} placeholder="—" onFocus={(event) => event.currentTarget.select()} onBlur={() => { if (limitEnabled) setOrder({ ...order, limitPrice: normalizePrice(order.limitPrice) }); }} onChange={(event) => { if (decimalPattern.test(event.target.value)) setOrder({ ...order, limitPrice: event.target.value }); }} /><button type="button" aria-label="Decrease limit price" disabled={!limitEnabled} onClick={() => setOrder({ ...order, limitPrice: stepPrice(order.limitPrice, -1) })}><Minus aria-hidden="true" /></button><button type="button" aria-label="Increase limit price" disabled={!limitEnabled} onClick={() => setOrder({ ...order, limitPrice: stepPrice(order.limitPrice, 1) })}><Plus aria-hidden="true" /></button></div><button className="oe-price-lock" type="button" aria-label={order.priceLockOpen ? "Unlock limit price" : "Lock limit price"} aria-pressed={order.priceLockOpen} disabled={!limitEnabled} onClick={() => setOrder({ ...order, priceLockOpen: !order.priceLockOpen })}>{order.priceLockOpen ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}</button></div> : null}</div>
              <div className={`toe-cell toe-cell-slider ${first ? "" : "toe-cell-empty"}`}>{first && sliderRange ? <PriceRangeSlider range={sliderRange} value={Number(order.limitPrice) || 0} disabled={!limitEnabled || order.priceLockOpen} onChange={(value) => setOrder({ ...order, limitPrice: value.toFixed(2) })} /> : null}</div>
              <div className={`toe-cell oe-field oe-duration ${first ? "" : "toe-cell-empty"}`}>{first ? <SelectMenu ariaLabel="Order duration" className="oe-control-select" choices={durations} label={null} variant="solid" value={order.duration} onChange={(duration) => setOrder({ ...order, duration })} /> : null}</div>
              <div className="toe-cell toe-cell-empty" />
              <div className={`toe-cell toe-action-cell ${first || !locked ? "" : "toe-cell-empty"}`}>{first ? <button type="button" aria-label="Remove order" onClick={() => setOrder({ kind: "empty" })}><X aria-hidden="true" /></button> : !locked ? <button type="button" aria-label={`Remove leg ${index + 1}`} onClick={() => removeStrategyLeg(index)}><CircleMinus aria-hidden="true" /></button> : null}</div>
            </div>;
          })}
        </div>
      );
    }

    return (
      <div className="table-order-entry-grid" style={{ gridTemplateColumns: tableColumns }}>
        {headers.map((header, index) => <div className="toe-header-cell" key={`${header}-${index}`}>{header}</div>)}
        <div className="toe-row">
          {renderTypeCell(0, 1)}
          <div className="toe-cell oe-field oe-symbol"><SelectMenu ariaLabel="Order symbol" className="oe-control-select" choices={symbols} label={filled ? null : "Select Symbol"} variant="solid" value={filled ? order.symbol : ""} onChange={(symbol) => setOrder(createOrder(symbol))} /></div>
          <div className="toe-cell oe-field oe-spread">{filled ? <SelectMenu ariaLabel="Order spread" className="oe-control-select" choices={spreads} label={null} variant="solid" value={order.spread} onChange={changeSpread} /> : <button className="oe-disabled-select" type="button" disabled>—<ChevronDown aria-hidden="true" /></button>}</div>
          <div className="toe-cell oe-field oe-side">{filled ? <SelectMenu ariaLabel="Order side" className="oe-control-select" choices={sides} label={null} variant="solid" value={order.side} onChange={(side) => setOrder({ ...order, side, quantity: quantityForSide(side, order.quantity, order.quantityUnit) })} /> : <button className="oe-disabled-select" type="button" disabled>—<ChevronDown aria-hidden="true" /></button>}</div>
          <div className="toe-cell oe-field oe-quantity"><div className="oe-quantity-control"><div className="oe-quantity-type" ref={quantityTypeRef} onBlur={closeQuantityMenu}><button type="button" aria-label="Quantity type" aria-expanded={quantityMenuOpen} disabled={!filled} onClick={() => setQuantityMenuOpen((current) => !current)}><QuantityIcon aria-hidden="true" /><ChevronDown aria-hidden="true" /></button>{renderQuantityMenu()}</div><div className={`oe-number-input ${filled && order.quantityUnit === "Notional" ? "has-prefix" : ""} ${filled ? "" : "is-disabled"}`}>{filled && order.quantityUnit === "Notional" ? <span className="oe-currency-prefix">$</span> : null}<input type="text" inputMode={filled && order.quantityUnit === "Whole Shares" ? "numeric" : "decimal"} aria-label="Order quantity" disabled={!filled} value={filled ? order.quantity : "1"} onFocus={(event) => event.currentTarget.select()} onBlur={() => { if (filled) changeQuantity(normalizeQuantity(order.quantity, order.quantityUnit)); }} onChange={(event) => { if (!filled) return; const value = event.target.value; const pattern = order.quantityUnit === "Whole Shares" ? wholeQuantityPattern : decimalPattern; if (pattern.test(value) && (value === "" || value === "-" || Number(value) !== 0)) changeQuantity(value); }} /><button type="button" aria-label="Decrease quantity" disabled={!filled} onClick={() => { if (filled) changeQuantity(stepQuantity(order.quantity, order.quantityUnit, -1)); }}><Minus aria-hidden="true" /></button><button type="button" aria-label="Increase quantity" disabled={!filled} onClick={() => { if (filled) changeQuantity(stepQuantity(order.quantity, order.quantityUnit, 1)); }}><Plus aria-hidden="true" /></button></div></div></div>
          {isOption ? <><div className="toe-cell oe-field oe-expiration"><SelectMenu ariaLabel="Option expiration date" className="oe-control-select" choices={expirations} label={null} variant="solid" value={order.expiration} onChange={(expiration) => setOrder({ ...order, expiration })} /></div><div className="toe-cell oe-field oe-strike"><SelectMenu ariaLabel="Option strike" className="oe-control-select" choices={strikes} label={null} variant="solid" value={order.strike} onChange={(strike) => setOrder({ ...order, strike })} /></div><div className="toe-cell oe-field oe-option-type"><SelectMenu ariaLabel="Option type" className="oe-control-select" choices={optionTypes} label={null} variant="solid" value={order.optionType} onChange={(optionType) => setOrder({ ...order, optionType })} /></div></> : null}
          <div className="toe-cell oe-field oe-order-type">{filled ? <SelectMenu ariaLabel="Order type" className="oe-control-select" choices={orderTypes} label={null} variant="solid" value={order.orderType} onChange={(orderType) => setOrder({ ...order, orderType })} /> : <button className="oe-disabled-select" type="button" disabled>—<ChevronDown aria-hidden="true" /></button>}</div>
          <div className="toe-cell oe-field oe-limit-price"><div className="oe-price-control"><div className={`oe-number-input ${limitEnabled ? "" : "is-disabled"}`}><input type="text" inputMode="decimal" aria-label="Limit price" disabled={!limitEnabled} value={limitEnabled ? order.limitPrice : ""} placeholder="—" onFocus={(event) => event.currentTarget.select()} onBlur={() => { if (filled && limitEnabled) setOrder({ ...order, limitPrice: normalizePrice(order.limitPrice) }); }} onChange={(event) => { if (filled && decimalPattern.test(event.target.value)) setOrder({ ...order, limitPrice: event.target.value }); }} /><button type="button" aria-label="Decrease limit price" disabled={!limitEnabled} onClick={() => { if (filled) setOrder({ ...order, limitPrice: stepPrice(order.limitPrice, -1) }); }}><Minus aria-hidden="true" /></button><button type="button" aria-label="Increase limit price" disabled={!limitEnabled} onClick={() => { if (filled) setOrder({ ...order, limitPrice: stepPrice(order.limitPrice, 1) }); }}><Plus aria-hidden="true" /></button></div><button className="oe-price-lock" type="button" aria-label={filled && order.priceLockOpen ? "Lock limit price" : "Unlock limit price"} aria-pressed={filled && order.priceLockOpen} disabled={!limitEnabled} onClick={() => { if (filled) setOrder({ ...order, priceLockOpen: !order.priceLockOpen }); }}>{filled && order.priceLockOpen ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}</button></div></div>
          <div className="toe-cell oe-field oe-duration">{filled ? <SelectMenu ariaLabel="Order duration" className="oe-control-select" choices={durations} label={null} variant="solid" value={order.duration} onChange={(duration) => setOrder({ ...order, duration })} /> : <button className="oe-disabled-select" type="button" disabled>—<ChevronDown aria-hidden="true" /></button>}</div>
          <div className="toe-cell" />
          <div className="toe-cell toe-action-cell">{filled ? <button type="button" aria-label="Remove order" onClick={() => setOrder({ kind: "empty" })}><X aria-hidden="true" /></button> : null}</div>
        </div>
      </div>
    );
  };

  return (
    <section className={`order-entry is-open ${layout === "table" ? "is-table-layout" : ""} ${resizeState.kind === "dragging" ? "is-resizing" : ""}`} style={{ height }} aria-label="Order Entry">
      <div
        className={`order-entry-resize-handle ${resizeState.kind === "dragging" ? "is-active" : ""}`}
        role="separator"
        tabIndex={0}
        aria-label="Resize order entry"
        aria-orientation="horizontal"
        aria-valuemin={minimumHeight}
        aria-valuemax={maximumHeight}
        aria-valuenow={height}
        onKeyDown={resizeWithKeyboard}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setResizeState({ kind: "dragging", startY: event.clientY, startHeight: height });
        }}
        onPointerMove={resizeWithPointer}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setResizeState({ kind: "idle" });
        }}
        onPointerCancel={() => setResizeState({ kind: "idle" })}
      />
      <header className="order-entry-header">
        <div className="order-entry-header-left">
          <div className="oe-header-field oe-template">
            <span>Template</span>
            <SelectMenu ariaLabel="Order template" className="oe-header-select" choices={templates} label={null} variant="ghost" value={template} onChange={changeTemplate} />
          </div>
          <div className="oe-header-field oe-account">
            <span>Account</span>
            <SelectMenu ariaLabel="Order account" className="oe-header-select" choices={accounts} label={null} variant="ghost" value={account} onChange={setAccount} />
          </div>
          <div className={`order-preview ${filled ? "" : "is-hidden"}`}>
            <b>Preview</b>
            {filled ? <span>{isStrategy ? <><em className={`is-${strategyLegs[0].side.startsWith("Sell") ? "sell" : "buy"}`}>{strategyLegs[0].side} {previewQuantity(strategyLegs[0].side, strategyLegs[0].quantity)}</em> {order.spread} {order.symbol} {strategyOptionLegs.length > 0 ? <>{strategyOptionLegs[0].expiration} {strategyStrikes} {strategyOptionLegs[0].optionType}</> : null} <i>@</i> $ {order.limitPrice} {order.orderType}</> : <><em className={`is-${order.side.toLowerCase()}`}>{order.side} {order.quantityUnit === "Notional" ? "$" : ""}{previewQuantity(order.side, order.quantity)}</em> {order.symbol}{isOption ? <> {order.expiration} {order.strike} {order.optionType}</> : null} <i>@</i> $ {order.limitPrice} {order.orderType}</>}</span> : null}
          </div>
        </div>
        <button className="order-entry-hide" type="button" aria-expanded="true" onClick={() => setOpen(false)}><ChevronsDown aria-hidden="true" /> Hide Order Entry</button>
      </header>

      <div className="order-entry-content">
        {layout === "table" ? renderTableFields() : orderGroup.kind !== "none" ? renderFormGroup() : isStrategy ? renderStrategyFields() : <div className={`order-entry-fields ${filled ? "is-filled" : "is-empty"} ${isOption ? "is-option" : ""}`}>
          <label className="oe-field oe-symbol"><span>Symbol</span><SelectMenu ariaLabel="Order symbol" className="oe-control-select" choices={symbols} label={filled ? null : "Select Symbol"} variant="solid" value={filled ? order.symbol : ""} onChange={(symbol) => setOrder(createOrder(symbol))} /></label>
          <label className="oe-field oe-spread"><span>Spread</span>{filled ? <SelectMenu ariaLabel="Order spread" className="oe-control-select" choices={spreads} label={null} variant="solid" value={order.spread} onChange={changeSpread} /> : <button className="oe-disabled-select" type="button" disabled>—<ChevronDown aria-hidden="true" /></button>}</label>
          <label className="oe-field oe-side"><span>Side</span>{filled ? <SelectMenu ariaLabel="Order side" className="oe-control-select" choices={sides} label={null} variant="solid" value={order.side} onChange={(side) => setOrder({ ...order, side, quantity: quantityForSide(side, order.quantity, order.quantityUnit) })} /> : <button className="oe-disabled-select" type="button" disabled>—<ChevronDown aria-hidden="true" /></button>}</label>

          <label className="oe-field oe-quantity">
            <span>Qty</span>
            <div className="oe-quantity-control">
              <div className="oe-quantity-type" ref={quantityTypeRef} onBlur={closeQuantityMenu}>
                <button type="button" aria-label="Quantity type" aria-expanded={quantityMenuOpen} disabled={!filled} onClick={() => setQuantityMenuOpen((current) => !current)}><QuantityIcon aria-hidden="true" /><ChevronDown aria-hidden="true" /></button>
                {renderQuantityMenu()}
              </div>
              <div className={`oe-number-input ${filled && order.quantityUnit === "Notional" ? "has-prefix" : ""} ${filled ? "" : "is-disabled"}`}>
                {filled && order.quantityUnit === "Notional" ? <span className="oe-currency-prefix">$</span> : null}
                <input type="text" inputMode={filled && order.quantityUnit === "Whole Shares" ? "numeric" : "decimal"} aria-label="Order quantity" disabled={!filled} value={filled ? order.quantity : "1"} onFocus={(event) => event.currentTarget.select()} onBlur={() => { if (filled) changeQuantity(normalizeQuantity(order.quantity, order.quantityUnit)); }} onChange={(event) => { if (!filled) return; const value = event.target.value; const pattern = order.quantityUnit === "Whole Shares" ? wholeQuantityPattern : decimalPattern; if (pattern.test(value) && (value === "" || value === "-" || Number(value) !== 0)) changeQuantity(value); }} />
                <button type="button" aria-label="Decrease quantity" disabled={!filled} onClick={() => { if (filled) changeQuantity(stepQuantity(order.quantity, order.quantityUnit, -1)); }}><Minus aria-hidden="true" /></button>
                <button type="button" aria-label="Increase quantity" disabled={!filled} onClick={() => { if (filled) changeQuantity(stepQuantity(order.quantity, order.quantityUnit, 1)); }}><Plus aria-hidden="true" /></button>
              </div>
            </div>
          </label>

          {isOption ? <>
            <label className="oe-field oe-expiration"><span>Expiration Date</span><SelectMenu ariaLabel="Option expiration date" className="oe-control-select" choices={expirations} label={null} variant="solid" value={order.expiration} onChange={(expiration) => setOrder({ ...order, expiration })} /></label>
            <label className="oe-field oe-strike"><span>Strike</span><SelectMenu ariaLabel="Option strike" className="oe-control-select" choices={strikes} label={null} variant="solid" value={order.strike} onChange={(strike) => setOrder({ ...order, strike })} /></label>
            <label className="oe-field oe-option-type"><span>Option Type</span><SelectMenu ariaLabel="Option type" className="oe-control-select" choices={optionTypes} label={null} variant="solid" value={order.optionType} onChange={(optionType) => setOrder({ ...order, optionType })} /></label>
          </> : null}

          <label className="oe-field oe-order-type"><span>Order Type</span>{filled ? <SelectMenu ariaLabel="Order type" className="oe-control-select" choices={orderTypes} label={null} variant="solid" value={order.orderType} onChange={(orderType) => setOrder({ ...order, orderType })} /> : <button className="oe-disabled-select" type="button" disabled>—<ChevronDown aria-hidden="true" /></button>}</label>

          <label className={`oe-field oe-limit-price ${limitEnabled ? "" : "is-disabled"}`}>
            <span>Limit Price</span>
            <div className="oe-price-control">
              {!filled ? <button className="oe-price-lock" type="button" aria-label="Lock limit price" disabled><Lock aria-hidden="true" /></button> : null}
              <div className={`oe-number-input ${limitEnabled ? "" : "is-disabled"}`}>
                <input type="text" inputMode="decimal" aria-label="Limit price" disabled={!limitEnabled} value={limitEnabled ? order.limitPrice : ""} placeholder="—" onFocus={(event) => event.currentTarget.select()} onBlur={() => { if (filled && limitEnabled) setOrder({ ...order, limitPrice: normalizePrice(order.limitPrice) }); }} onChange={(event) => { if (filled && decimalPattern.test(event.target.value)) setOrder({ ...order, limitPrice: event.target.value }); }} />
                <button type="button" aria-label="Decrease limit price" disabled={!limitEnabled} onClick={() => { if (filled) setOrder({ ...order, limitPrice: stepPrice(order.limitPrice, -1) }); }}><Minus aria-hidden="true" /></button>
                <button type="button" aria-label="Increase limit price" disabled={!limitEnabled} onClick={() => { if (filled) setOrder({ ...order, limitPrice: stepPrice(order.limitPrice, 1) }); }}><Plus aria-hidden="true" /></button>
              </div>
              {filled ? <button className="oe-price-lock" type="button" aria-label={order.priceLockOpen ? "Unlock limit price" : "Lock limit price"} aria-pressed={order.priceLockOpen} disabled={!limitEnabled} onClick={() => setOrder({ ...order, priceLockOpen: !order.priceLockOpen })}>{order.priceLockOpen ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}</button> : null}
            </div>
          </label>

          <label className="oe-field oe-duration"><span>Duration</span>{filled ? <SelectMenu ariaLabel="Order duration" className="oe-control-select" choices={durations} label={null} variant="solid" value={order.duration} onChange={(duration) => setOrder({ ...order, duration })} /> : <button className="oe-disabled-select" type="button" disabled>—<ChevronDown aria-hidden="true" /></button>}</label>
          {filled ? <div className="oe-field oe-actions"><span /><button type="button" aria-label="Remove order" onClick={() => setOrder({ kind: "empty" })}><X aria-hidden="true" /></button></div> : null}
        </div>}
      </div>

      <footer className="order-entry-footer">
        <button className="oe-clear" type="button" disabled={!filled && orderGroup.kind === "none"} onClick={() => { setOrder({ kind: "empty" }); setOrderGroup({ kind: "none" }); setTemplate("Single"); }}><RotateCcw aria-hidden="true" /> Clear Data</button>
        <button className="oe-simulate" type="button" disabled={!canSubmit} onClick={() => orderGroup.kind === "none" ? submitOrder(simulateTrade) : submitOrderGroup(simulateTrade)}><FlaskConical aria-hidden="true" />Create Sim Position</button>
        <button className="oe-confirm" type="button" disabled={!canSubmit} onClick={() => orderGroup.kind === "none" ? submitOrder(placeTrade) : submitOrderGroup(placeTrade)}>Confirm and Send</button>
      </footer>
    </section>
  );
}
