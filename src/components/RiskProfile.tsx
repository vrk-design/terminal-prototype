import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  CalendarDays,
  ArrowLeftRight,
  Check,
  CircleOff,
  ChevronDown,
  ChevronRight,
  Columns3,
  Ellipsis,
  Eye,
  EyeOff,
  LockKeyhole,
  Maximize2,
  Minus,
  PanelRightOpen,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { strategyIcons } from "../assets/strategyIcons";
import { useTradingMode } from "../trading/TradingMode";
import type { Position, TradeRequest } from "../trading/types";
import { SelectMenu, type SelectChoice } from "./SelectMenu";
import "./RiskProfile.css";

type PlotId = "cyan" | "magenta" | "yellow";
type PositionFilter = "all" | "real" | "simulated";
type ResizeState = "idle" | "chart" | "slices";
type PositionMenu = { kind: "closed" } | { kind: "open"; positionId: string; x: number; y: number };
type SectionSizes = { chart: number; slices: number };
type Slice = { id: number; date: string; price: number; offset: number; theo: string; value: string; delta: string; vega: string; theta: string; gamma: string; rho: string };

const defaultSlices: Slice[] = [
  { id: 1, date: "10/10/2026", price: 218, offset: -5, theo: "−825.00", value: "605.12", delta: "0.00", vega: "0.00", theta: "0.00", gamma: "0.00", rho: "0.00" },
  { id: 2, date: "10/10/2026", price: 248, offset: 0, theo: "31,463.31", value: "33,505.88", delta: "218.45", vega: "−98.07", theta: "56,148.90", gamma: "−13.29", rho: "2.20" },
  { id: 3, date: "10/10/2026", price: 288, offset: 5, theo: "105,614.30", value: "107,605.54", delta: "23.01", vega: "0.00", theta: "0.00", gamma: "0.00", rho: "0.00" },
];

const initialPositions: Position[] = [
  { id: "real-stock", kind: "real", spread: "Stock", side: "+1,250.00", qty: 1250, expiration: "—", strike: "—", optionType: "—", price: 1250, symbol: "AAPL", volatility: "—", delta: "—", group: "stock" },
  { id: "leg-1", kind: "simulated", spread: "Iron Condor", side: "Sell to Open", qty: -10, expiration: "22 APR 27", strike: "130", optionType: "Put", price: 8.8, symbol: ".AAPL26...", volatility: "84.73", delta: "0.16", group: "leg" },
  { id: "leg-2", kind: "simulated", spread: "", side: "Buy to Open", qty: 10, expiration: "22 APR 27", strike: "135", optionType: "Put", price: null, symbol: ".AAPL26...", volatility: "84.73", delta: "−0.30", group: "leg", parentId: "leg-1" },
  { id: "leg-3", kind: "simulated", spread: "", side: "Buy to Open", qty: 10, expiration: "22 APR 27", strike: "140", optionType: "Call", price: null, symbol: ".AAPL26...", volatility: "104.52", delta: "996.63", group: "leg", parentId: "leg-1" },
  { id: "leg-4", kind: "simulated", spread: "", side: "Sell to Open", qty: -10, expiration: "22 APR 27", strike: "145", optionType: "Call", price: null, symbol: ".AAPL26...", volatility: "104.52", delta: "−996.63", group: "leg", parentId: "leg-1" },
  { id: "single", kind: "simulated", spread: "Single", side: "Buy to Open", qty: 10, expiration: "22 APR 27", strike: "130", optionType: "Put", price: 0.03, symbol: ".AAPL26...", volatility: "84.73", delta: "−0.16", group: "single" },
  { id: "sim-stock", kind: "simulated", spread: "Stock", side: "Sell", qty: -10, expiration: "—", strike: "—", optionType: "—", price: 297.2, symbol: "AAPL", volatility: "—", delta: "—", group: "stock" },
];

const sideChoices: readonly SelectChoice[] = ["Buy to Open", "Sell to Open", "Buy", "Sell"].map((value) => ({ value, icon: null }));
const baseExpirations = ["22 APR 27", "20 MAY 27", "17 JUN 27"];
const baseStrikes = ["130", "135", "140", "145"];
const mergeChoices = (values: readonly string[], base: readonly string[]): readonly SelectChoice[] => {
  const extras = [...new Set(values)].filter((value) => value && value !== "—" && !base.includes(value));
  return [...base, ...extras].map((value) => ({ value, icon: null }));
};
const typeChoices: readonly SelectChoice[] = ["Put", "Call"].map((value) => ({ value, icon: null }));

const xAxis = [160, 180, 200, 220, 240, 260, 280, 300, 320, 340];
const yAxis = ["2000.00", "1500.00", "1000.00", "500.00", "0.00", "−500.00", "−1000.00", "−1500.00", "−2000.00"];
const fixedHeight = 197;
const minimumChartHeight = 120;
const minimumSliceHeight = 60;
const minimumPositionsHeight = 80;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

function createTradeRequest(position: Position): TradeRequest {
  const symbol = position.symbol || "AAPL";
  const side = position.side.startsWith("Buy") ? "Buy" : "Sell";
  const quantity = Math.abs(position.qty ?? 10);
  const message = position.group === "leg" && position.spread
    ? `${side} ${quantity} ${symbol} ${position.spread} • Limit`
    : position.group === "single"
      ? `${side} ${quantity} ${symbol} ${position.strike} ${position.optionType} @ ${position.price?.toFixed(2) || "Market"} • Limit`
      : `${side} ${quantity} ${symbol} @ ${position.price?.toFixed(2) || "Market"} • Market`;
  return {
    message,
    symbol,
    side,
    quantity,
    price: position.price,
    spread: position.spread || "Stock",
    expiration: position.expiration || "—",
    strike: position.strike || "—",
    optionType: position.optionType || "—",
  };
}

export function RiskProfile() {
  const { simulatedPositions, realPositions, requestLiveTrade, removeSimulatedPosition, placeTrade } = useTradingMode();
  const profileRef = useRef<HTMLElement>(null);
  const positionsTableRef = useRef<HTMLDivElement>(null);
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [visiblePlots, setVisiblePlots] = useState<Record<PlotId, boolean>>({ cyan: true, magenta: true, yellow: true });
  const [zoom, setZoom] = useState(1);
  const [slicesOpen, setSlicesOpen] = useState(true);
  const [slices, setSlices] = useState(defaultSlices);
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
  const [collapsedParents, setCollapsedParents] = useState<string[]>([]);
  const [positionRows, setPositionRows] = useState(initialPositions);
  const [deselectedPositions, setDeselectedPositions] = useState<string[]>([]);
  const [volatility, setVolatility] = useState(0);
  const [currentPrice, setCurrentPrice] = useState(256.48);
  const [resizeState, setResizeState] = useState<ResizeState>("idle");
  const [positionMenu, setPositionMenu] = useState<PositionMenu>({ kind: "closed" });
  const [sectionSizes, setSectionSizes] = useState<SectionSizes>({ chart: 400, slices: 159 });

  useEffect(() => {
    const profile = profileRef.current!;
    const fitSections = () => {
      const available = profile.clientHeight - fixedHeight;
      setSectionSizes((current) => {
        const chart = clamp(current.chart, minimumChartHeight, available - minimumSliceHeight - minimumPositionsHeight);
        const slices = clamp(current.slices, minimumSliceHeight, available - chart - minimumPositionsHeight);
        if (chart === current.chart && slices === current.slices) return current;
        return { chart, slices };
      });
    };
    const observer = new ResizeObserver(fitSections);
    fitSections();
    observer.observe(profile);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (positionMenu.kind === "closed") return;
    const closePositionMenu = () => setPositionMenu({ kind: "closed" });
    window.addEventListener("click", closePositionMenu);
    return () => window.removeEventListener("click", closePositionMenu);
  }, [positionMenu.kind]);

  const allPositions = useMemo(() => [...realPositions, ...simulatedPositions, ...positionRows], [positionRows, realPositions, simulatedPositions]);

  const expirationChoices = useMemo(() => mergeChoices(allPositions.map(({ expiration }) => expiration), baseExpirations), [allPositions]);
  const strikeChoices = useMemo(() => mergeChoices(allPositions.map(({ strike }) => strike), baseStrikes), [allPositions]);

  const filteredPositions = useMemo(() => allPositions.filter((position) => {
    if (positionFilter !== "all" && position.kind !== positionFilter) return false;
    if (position.parentId && collapsedParents.includes(position.parentId)) return false;
    return true;
  }), [allPositions, collapsedParents, positionFilter]);

  const toggleParent = (parentId: string) => {
    setCollapsedParents((current) => current.includes(parentId) ? current.filter((item) => item !== parentId) : [...current, parentId]);
  };

  const allVisiblePositionsSelected = filteredPositions.every(({ id }) => !deselectedPositions.includes(id));

  const changeSlice = (id: number, field: "price" | "offset", amount: number) => {
    setSlices((current) => current.map((slice) => slice.id === id ? { ...slice, [field]: slice[field] + amount } : slice));
  };

  const togglePosition = (id: string) => {
    setDeselectedPositions((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleVisiblePositions = () => {
    const visibleIds = filteredPositions.map(({ id }) => id);
    setDeselectedPositions((current) => allVisiblePositionsSelected
      ? [...new Set([...current, ...visibleIds])]
      : current.filter((id) => !visibleIds.includes(id)));
  };

  const updatePosition = (id: string, change: Partial<Position>) => {
    setPositionRows((current) => current.map((position) => position.id === id ? { ...position, ...change } : position));
  };

  const openPositionMenu = (positionId: string, x: number, y: number) => {
    setPositionMenu({ kind: "open", positionId, x: Math.max(8, Math.min(x, window.innerWidth - 184)), y: Math.max(8, Math.min(y, window.innerHeight - 84)) });
  };

  const removePosition = () => {
    if (positionMenu.kind === "closed") return;
    const { positionId } = positionMenu;
    setPositionRows((current) => current.filter((position) => position.id !== positionId && position.parentId !== positionId));
    setDeselectedPositions((current) => current.filter((id) => id !== positionId && !id.startsWith(`${positionId}-leg-`)));
    removeSimulatedPosition(positionId);
    setPositionMenu({ kind: "closed" });
  };

  const closePosition = (reverse = false) => {
    if (positionMenu.kind === "closed") return;
    const position = allPositions.find(({ id }) => id === positionMenu.positionId);
    if (!position) return;
    const root = position.parentId ? allPositions.find(({ id }) => id === position.parentId) ?? position : position;
    const legs = allPositions.filter((item) => item.parentId === root.id);
    const flip = (side: string) => side.startsWith("Sell") ? "Buy" : "Sell";
    const action = reverse ? "Reverse" : "Close";
    if (legs.length > 0) {
      placeTrade({
        message: `${action}: ${root.spread || "Strategy"} ${root.symbol} • ${legs.length} legs`,
        symbol: root.symbol,
        side: flip(root.side || "Buy"),
        quantity: Math.abs(root.qty ?? 1),
        price: null,
        spread: root.spread || "Custom",
        expiration: root.expiration || "—",
        strike: root.strike || "—",
        optionType: root.optionType || "—",
        legs: legs.map((leg) => ({ side: flip(leg.side) as "Buy" | "Sell", quantity: Math.abs(leg.qty ?? 1), expiration: leg.expiration, strike: leg.strike, optionType: leg.optionType, price: null })),
      });
    } else {
      const trade = createTradeRequest(root);
      const side = trade.side === "Buy" ? "Sell" : "Buy";
      const quantity = trade.quantity * (reverse ? 2 : 1);
      placeTrade({
        ...trade,
        side,
        quantity,
        message: `${action}: ${side} ${quantity} ${trade.symbol}${trade.spread === "Stock" ? "" : ` ${trade.expiration} ${trade.strike} ${trade.optionType}`}`,
      });
    }
    setPositionMenu({ kind: "closed" });
  };

  const resizeChart = (clientY: number) => {
    const bounds = profileRef.current!.getBoundingClientRect();
    const available = bounds.height - fixedHeight;
    setSectionSizes((current) => ({ ...current, chart: clamp(clientY - bounds.top - 92, minimumChartHeight, available - current.slices - minimumPositionsHeight) }));
  };

  const resizeSlices = (clientY: number) => {
    const bounds = profileRef.current!.getBoundingClientRect();
    const available = bounds.height - fixedHeight;
    setSectionSizes((current) => ({ ...current, slices: clamp(clientY - bounds.top - current.chart - 145, minimumSliceHeight, available - current.chart - minimumPositionsHeight) }));
  };

  const resizeWithKeyboard = (section: Exclude<ResizeState, "idle">, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const change = event.key === "ArrowUp" ? -12 : 12;
    const bounds = profileRef.current!.getBoundingClientRect();
    const available = bounds.height - fixedHeight;
    setSectionSizes((current) => section === "chart"
      ? { ...current, chart: clamp(current.chart + change, minimumChartHeight, available - current.slices - minimumPositionsHeight) }
      : { ...current, slices: clamp(current.slices + change, minimumSliceHeight, available - current.chart - minimumPositionsHeight) });
  };

  const beginResize = (section: Exclude<ResizeState, "idle">, event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizeState(section);
  };

  const moveResize = (section: Exclude<ResizeState, "idle">, event: PointerEvent<HTMLDivElement>) => {
    if (resizeState !== section) return;
    if (section === "chart") resizeChart(event.clientY);
    else resizeSlices(event.clientY);
  };

  const endResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setResizeState("idle");
  };

  return (
    <section
      ref={profileRef}
      className={`risk-profile ${resizeState === "idle" ? "" : "is-resizing"}`}
      style={{ gridTemplateRows: `41px ${sectionSizes.chart}px 49px 4px 49px ${sectionSizes.slices}px 4px 50px minmax(0, 1fr)` }}
      aria-label="Risk Profile"
    >
      <div className="risk-toolbar">
        <div className="risk-toolbar-left">
          <div className="widget-title"><span>Risk Profile</span></div>
          <div className="risk-symbol-wrap">
            <button className="risk-symbol" type="button" aria-expanded={symbolOpen} onClick={() => setSymbolOpen((open) => !open)}>
              AAPL <i aria-label="Market open" /> <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
            {symbolOpen ? <div className="risk-symbol-menu"><button type="button" onClick={() => setSymbolOpen(false)}>AAPL <span>285.56</span></button><button type="button" onClick={() => setSymbolOpen(false)}>TSLA <span>—</span></button></div> : null}
          </div>
        </div>
        <button className="risk-icon-button" type="button" aria-label="Risk profile menu"><Ellipsis size={20} strokeWidth={1.75} /></button>
      </div>

      <div className="risk-chart">
        <div className="chart-canvas" style={{ "--chart-zoom": zoom } as React.CSSProperties}>
          <div className="chart-legend">
            <span>Price&nbsp; <b>285.56</b></span>
            <span className="cyan">━&nbsp; 10/10/2027&nbsp; <em>P/L</em>&nbsp; 485.00</span>
            <span className="magenta">┅&nbsp; 12/11/2027&nbsp; <em>P/L</em>&nbsp; 1485.00</span>
            <span className="yellow">┅&nbsp; 25/10/2027&nbsp; <em>P/L</em>&nbsp; 850.00</span>
          </div>
          <div className="chart-zero" />
          <div className="chart-profit-line"><span>−120.00</span></div>
          <div className="chart-crosshair" />
          <svg className="risk-plots" viewBox="0 0 1296.32 246" preserveAspectRatio="none" aria-label="Profit and loss payoff chart">
            {visiblePlots.yellow ? <path d="M1296.32 0.500435C833.637 0.279847 789.946 111.214 567.963 116.038C420.526 121.55 356.194 28.8884 0.0368885 2.56772" stroke="#FEEF39" strokeDasharray="2 4" /> : null}
            {visiblePlots.magenta ? <path d="M1296.32 0.499999L809.028 0.500032L685.491 245.5L643.892 245.5L530.033 0.500051L0.0366734 0.500087" stroke="#F66DEF" strokeDasharray="4 4" /> : null}
            {visiblePlots.cyan ? <path d="M1296.32 0.860306C935.103 0.860262 886.005 109.069 713.764 127.226C471.704 152.743 521.117 0.860306 0.0368868 0.860287" stroke="#0DE5F1" /> : null}
          </svg>
          <span className="break-even be-1" /><span className="break-even be-2" /><span className="break-even be-3" />
          <div className="chart-y-axis">{yAxis.map((value) => <span key={value}>{value}</span>)}</div>
          <div className="chart-x-axis">{xAxis.map((value) => <span key={value}>{value}</span>)}</div>
          <div className="strike-markers"><span>218.00</span><span>248.00</span><span className="neutral">290.00</span><span>288.00</span></div>
          <div className="chart-controls">
            <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.5, value + .1))}><Plus size={16} /></button>
            <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.7, value - .1))}><Minus size={16} /></button>
            <button type="button" aria-label="Reset chart zoom" onClick={() => setZoom(1)}><RotateCcw size={16} /></button>
          </div>
        </div>
      </div>

      <div className="plot-toolbar">
        {(["cyan", "magenta", "yellow"] as PlotId[]).map((id, index) => {
          const dates = ["10/10/2026", "12/11/2026", "25/10/2026"];
          return <div className={`plot-control ${id}`} key={id}><div className="plot-date-field"><span className="plot-dash" /><span>{dates[index]}</span><CalendarDays size={16} strokeWidth={1.75} /></div><button type="button" aria-label={`${visiblePlots[id] ? "Hide" : "Show"} ${dates[index]} plot`} onClick={() => setVisiblePlots((current) => ({ ...current, [id]: !current[id] }))}>{visiblePlots[id] ? <Eye size={16} /> : <EyeOff size={16} />}</button></div>;
        })}
        <button className="risk-secondary-button reset-plots" type="button" aria-label="Reset plots to default" disabled={Object.values(visiblePlots).every(Boolean) && zoom === 1} onClick={() => { setVisiblePlots({ cyan: true, magenta: true, yellow: true }); setZoom(1); }}>Reset to Default</button>
      </div>

      <div className={`risk-resize-bar ${resizeState === "chart" ? "is-active" : ""}`} role="separator" tabIndex={0} aria-label="Resize chart and price slices" aria-orientation="horizontal" aria-valuenow={sectionSizes.chart} onKeyDown={(event) => resizeWithKeyboard("chart", event)} onPointerDown={(event) => beginResize("chart", event)} onPointerMove={(event) => moveResize("chart", event)} onPointerUp={endResize} onPointerCancel={() => setResizeState("idle")} />
      <div className="risk-section-header">
        <button className="risk-section-title" type="button" aria-expanded={slicesOpen} onClick={() => setSlicesOpen((open) => !open)}>{slicesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Price Slice</button>
        <div>
          <button className="risk-secondary-button" type="button" onClick={() => setSlices((current) => [...current, { ...defaultSlices[1], id: Math.max(0, ...current.map(({ id }) => id)) + 1 }])}>Add Slice</button>
          <button className="risk-secondary-button" type="button" aria-label="Reset price slices to default" disabled={slices === defaultSlices} onClick={() => setSlices(defaultSlices)}>Reset to Default</button>
          <button className="risk-secondary-button" type="button" disabled={slices.length === 0} onClick={() => setSlices([])}>Remove All</button>
        </div>
      </div>

      <div className={`slice-table ${slicesOpen ? "" : "is-collapsed"}`} role="table" aria-label="Price slices">
        <div className="slice-grid slice-header" role="row"><span>Date</span><span>Price&nbsp; ···</span><span>Offset, %&nbsp; ···</span><span>Theo...&nbsp; ···</span><span>Value&nbsp; ···</span><span>Delta&nbsp; ···</span><span>Vega&nbsp; ···</span><span>Theta&nbsp; ···</span><span>Gamma&nbsp; ···</span><span>Rho&nbsp; ···</span><span /><span><SlidersHorizontal size={16} /><Columns3 size={16} /></span></div>
        {slices.map((slice) => <div className="slice-grid slice-row" role="row" key={slice.id}>
          <span className="slice-date"><i />{slice.date}<ChevronDown size={16} /></span>
          <span className="slice-step"><LockKeyhole size={16} /><b>{slice.price.toFixed(2)}</b><button type="button" aria-label={`Decrease slice price ${slice.id}`} onClick={() => changeSlice(slice.id, "price", -1)}><Minus size={16} /></button><button type="button" aria-label={`Increase slice price ${slice.id}`} onClick={() => changeSlice(slice.id, "price", 1)}><Plus size={16} /></button></span>
          <span className="slice-step offset"><b>{slice.offset.toFixed(2)}</b><button type="button" aria-label={`Decrease slice offset ${slice.id}`} onClick={() => changeSlice(slice.id, "offset", -1)}><Minus size={16} /></button><button type="button" aria-label={`Increase slice offset ${slice.id}`} onClick={() => changeSlice(slice.id, "offset", 1)}><Plus size={16} /></button></span>
          <span className={slice.id === 1 ? "negative" : "positive"}>{slice.theo}</span><span>{slice.value}</span><span>{slice.delta}</span><span>{slice.vega}</span><span>{slice.theta}</span><span>{slice.gamma}</span><span>{slice.rho}</span><span /><button className="row-remove" type="button" aria-label={`Remove slice ${slice.id}`} onClick={() => setSlices((current) => current.filter(({ id }) => id !== slice.id))}><X size={16} /></button>
        </div>)}
      </div>

      <div className={`risk-resize-bar ${resizeState === "slices" ? "is-active" : ""}`} role="separator" tabIndex={0} aria-label="Resize price slices and positions" aria-orientation="horizontal" aria-valuenow={sectionSizes.slices} onKeyDown={(event) => resizeWithKeyboard("slices", event)} onPointerDown={(event) => beginResize("slices", event)} onPointerMove={(event) => moveResize("slices", event)} onPointerUp={endResize} onPointerCancel={() => setResizeState("idle")} />

      <div className="positions-header">
        <div className="positions-left">
          <b>Positions</b>
          <div className="position-filters">
            {(["all", "real", "simulated"] as PositionFilter[]).map((filter) => (
              <button className={positionFilter === filter ? "is-active" : ""} type="button" key={filter} onClick={() => setPositionFilter(filter)}>
                {filter[0].toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="positions-controls">
          <button className="plot-select" type="button"><span>━</span> 10/10/2026 <ChevronDown size={16} /></button>
          <div className="number-group"><div className="number-control"><span><small>Volatility Adj.</small><b>{volatility.toFixed(2)}</b></span><button type="button" aria-label="Decrease volatility" onClick={() => setVolatility((value) => value - .25)}><Minus size={16} /></button><button type="button" aria-label="Increase volatility" onClick={() => setVolatility((value) => value + .25)}><Plus size={16} /></button></div><button className="small-square" type="button" aria-label="Reset volatility" disabled={volatility === 0} onClick={() => setVolatility(0)}><RotateCcw size={16} /></button></div>
          <div className="number-group"><div className="number-control"><span><small>Current Price</small><b>{currentPrice.toFixed(2)}</b></span><button type="button" aria-label="Decrease current price" onClick={() => setCurrentPrice((value) => value - 1)}><Minus size={16} /></button><button type="button" aria-label="Increase current price" onClick={() => setCurrentPrice((value) => value + 1)}><Plus size={16} /></button></div><button className="small-square" type="button" aria-label="Lock current price"><LockKeyhole size={16} /></button></div>
        </div>
      </div>

      <div ref={positionsTableRef} className="positions-table" role="table" aria-label="Positions">
        <div className="position-grid position-table-header" role="row">
          <span />
          <span><button className="position-checkbox" type="button" role="checkbox" aria-label="Select all visible positions" aria-checked={allVisiblePositionsSelected} onClick={toggleVisiblePositions}>{allVisiblePositionsSelected ? <Check aria-hidden="true" /> : null}</button></span>
          <span />
          {[
            ["Spread", "start"], ["Side", "start"], ["Qty", "end"], ["Expira...", "end"], ["Strike", "end"], ["Type", "end"],
            ["Price", "end"], ["Symbol", "start"], ["Vol...", "end"], ["Delta", "end"],
          ].map(([label, align]) => <span className={`is-${align}`} role="columnheader" key={label}>{label}<button type="button" aria-label={`${label} column menu`}><Ellipsis aria-hidden="true" /></button></span>)}
          <span />
          <span className="position-header-actions">
            <button type="button" aria-label="Open positions table panel" disabled><PanelRightOpen aria-hidden="true" /></button><i />
            <button type="button" aria-label="Fit positions table" onClick={() => { positionsTableRef.current!.scrollLeft = 0; }}><Maximize2 aria-hidden="true" /></button><i />
            <button type="button" aria-label="Choose position columns"><Columns3 aria-hidden="true" /></button>
          </span>
        </div>
        {filteredPositions.map((position) => {
          const editable = position.kind === "simulated" && (position.group === "leg" || position.group === "single");
          const sideEditable = position.kind === "simulated";
          const hasStepper = position.kind === "simulated" && position.qty !== null;
          const quantityLocked = position.group === "leg" && position.id !== "leg-1";
          const hasPriceField = position.kind === "simulated" && position.price !== null;
          const hasSpreadIndicators = position.kind === "simulated" && ((position.group === "leg" && position.spread) || position.group === "single");
          const positionSelected = !deselectedPositions.includes(position.id);
          const trade = createTradeRequest(position);
          const childLegs = allPositions.filter((item) => item.parentId === position.id);
          const liveTrade = childLegs.length > 0 ? { ...trade, legs: childLegs.map((leg) => ({ side: (leg.side.startsWith("Sell") ? "Sell" : "Buy") as "Buy" | "Sell", quantity: Math.abs(leg.qty ?? 1), expiration: leg.expiration, strike: leg.strike, optionType: leg.optionType, price: leg.price })) } : trade;
          return (
            <div className={`position-grid position-row is-${position.group} ${position.group === "leg" && position.spread ? "is-group-header" : ""}`} role="row" key={position.id} onContextMenu={(event) => { event.preventDefault(); openPositionMenu(position.id, event.clientX, event.clientY); }}>
              <span className="position-expander">{position.group === "leg" && position.spread ? <button type="button" aria-label={collapsedParents.includes(position.id) ? `Expand ${position.spread} legs` : `Collapse ${position.spread} legs`} aria-expanded={!collapsedParents.includes(position.id)} onClick={() => toggleParent(position.id)}>{collapsedParents.includes(position.id) ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}</button> : null}</span>
              <span className="position-check"><button className="position-checkbox" type="button" role="checkbox" aria-label={`Select ${position.spread || position.id}`} aria-checked={positionSelected} onClick={() => togglePosition(position.id)}>{positionSelected ? <Check aria-hidden="true" /> : null}</button></span>
              <span className={`position-kind is-${position.kind}`}>{position.kind === "real" ? "Real" : "Sim"}</span>
              <span className="position-spread">
                {position.group === "leg" && position.spread ? <img src={strategyIcons.ironCondor} alt="" /> : null}
                {position.group === "single" ? <img src={strategyIcons.single} alt="" /> : null}
                <span>{position.spread}</span>
                {hasSpreadIndicators ? <ChevronDown className="cell-chevron" aria-hidden="true" /> : null}
                {position.kind === "simulated" && position.group === "leg" && position.spread ? <LockKeyhole className="cell-lock" aria-hidden="true" /> : null}
              </span>
              <span className={`position-side ${position.side.startsWith("Sell") ? "negative" : "positive"}`}>
                {sideEditable ? <SelectMenu ariaLabel={`Side for ${position.id}`} className="position-cell-select" choices={sideChoices} label={null} variant="ghost" value={position.side} onChange={(side) => updatePosition(position.id, { side })} /> : position.side}
              </span>
              <span className={`position-number ${quantityLocked ? "is-locked" : ""}`}>
                {position.qty === null ? "" : position.qty.toLocaleString("en-US", { minimumFractionDigits: position.kind === "real" ? 2 : 0, maximumFractionDigits: 2 })}
                {hasStepper ? <><button type="button" aria-label={`Decrease quantity for ${position.id}`} disabled={quantityLocked} onClick={() => updatePosition(position.id, { qty: position.qty! - 1 })}><Minus aria-hidden="true" /></button><button type="button" aria-label={`Increase quantity for ${position.id}`} disabled={quantityLocked} onClick={() => updatePosition(position.id, { qty: position.qty! + 1 })}><Plus aria-hidden="true" /></button></> : null}
              </span>
              <span>{editable ? <SelectMenu ariaLabel={`Expiration for ${position.id}`} className="position-cell-select" choices={expirationChoices} label={null} variant="ghost" value={position.expiration} onChange={(expiration) => updatePosition(position.id, { expiration })} /> : position.expiration}</span>
              <span>{editable ? <SelectMenu ariaLabel={`Strike for ${position.id}`} className="position-cell-select" choices={strikeChoices} label={null} variant="ghost" value={position.strike} onChange={(strike) => updatePosition(position.id, { strike })} /> : position.strike}</span>
              <span>{editable ? <SelectMenu ariaLabel={`Type for ${position.id}`} className="position-cell-select" choices={typeChoices} label={null} variant="ghost" value={position.optionType} onChange={(optionType) => updatePosition(position.id, { optionType })} /> : position.optionType}</span>
              <span className="position-price">
                {hasPriceField ? <><button className="position-lock" type="button" aria-label={`Lock price for ${position.id}`}><LockKeyhole aria-hidden="true" /></button><b>{position.price!.toFixed(2)}</b><button type="button" aria-label={`Decrease price for ${position.id}`} onClick={() => updatePosition(position.id, { price: Math.max(0, position.price! - .01) })}><Minus aria-hidden="true" /></button><button type="button" aria-label={`Increase price for ${position.id}`} onClick={() => updatePosition(position.id, { price: position.price! + .01 })}><Plus aria-hidden="true" /></button></> : position.price?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="position-symbol">{position.symbol}</span>
              <span>{position.volatility}</span>
              <span>{position.delta}</span>
              <span>{position.kind === "simulated" && (position.group === "single" || position.id === "sim-stock" || (position.group === "leg" && position.spread)) ? <button className="trade-button" type="button" onClick={() => requestLiveTrade(liveTrade, position.id)}>Trade</button> : null}</span>
              <span />
              <span className="position-row-action"><button type="button" aria-label={`More actions for ${position.spread || position.id}`} aria-expanded={positionMenu.kind === "open" && positionMenu.positionId === position.id} onClick={(event) => { event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); openPositionMenu(position.id, bounds.right - 176, bounds.bottom + 4); }}><Ellipsis aria-hidden="true" /></button></span>
            </div>
          );
        })}
      </div>
      {positionMenu.kind === "open" ? (
        <div className="position-context-menu" role="menu" style={{ left: positionMenu.x, top: positionMenu.y }} onClick={(event) => event.stopPropagation()}>
          {allPositions.find(({ id }) => id === positionMenu.positionId)?.kind === "real" ? (
            <>
              <button className="is-neutral" type="button" role="menuitem" onClick={() => closePosition(false)}><CircleOff aria-hidden="true" />Close position</button>
              <button className="is-neutral" type="button" role="menuitem" onClick={() => closePosition(true)}><ArrowLeftRight aria-hidden="true" />Reverse position</button>
            </>
          ) : (
            <button type="button" role="menuitem" onClick={removePosition}><Trash2 aria-hidden="true" />Delete position</button>
          )}
        </div>
      ) : null}
    </section>
  );
}
