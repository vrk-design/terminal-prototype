import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Clock3, Columns3, Download, Ellipsis, Maximize2, Minus, PanelRightOpen } from "lucide-react";
import { useTradingMode } from "../trading/TradingMode";
import type { TradeRequest } from "../trading/types";
import { SelectMenu } from "./SelectMenu";
import { SimulationMenu, type TradeMenuSelection } from "./SimulationMenu";
import "./Watchlist.css";

type Trend = "up" | "down" | "flat";
type SortKey = "symbol" | "last" | "change" | "ask" | "bid" | "spread" | "mark" | "volume" | "description" | "prevClose" | "range" | "heading";
type SortState = { kind: "none" } | { kind: "column"; key: SortKey; direction: "asc" | "desc" };
type WatchlistMenu = { kind: "closed" } | ({ kind: "open"; x: number; y: number } & TradeMenuSelection);

type Quote = {
  symbol: string;
  exchange: string;
  last: string;
  change: string;
  ask: string;
  bid: string;
  spread: string;
  mark: string;
  volume: string;
  description: string;
  prevClose: string;
  range: string;
  heading: string;
  trend: Trend;
};

const initialQuotes: Quote[] = [
  { symbol: "/NQ", exchange: "XCME", last: "28,951.75", change: "−144.25", ask: "28,952.25", bid: "28,951.25", spread: "1.00", mark: "28,951.75", volume: "—", description: "—", prevClose: "29,096.00", range: "—", heading: "—", trend: "up" },
  { symbol: "/ES", exchange: "XCME", last: "7,386.75", change: "−39.00", ask: "7,386.75", bid: "7,386.50", spread: "0.25", mark: "7,386.75", volume: "—", description: "—", prevClose: "7,425.75", range: "—", heading: "—", trend: "up" },
  { symbol: "/RTY", exchange: "XCME", last: "2,755.0", change: "−27.7", ask: "2,755.1", bid: "2,754.9", spread: "0.2", mark: "2,755.0", volume: "—", description: "—", prevClose: "2,782.7", range: "—", heading: "—", trend: "down" },
  { symbol: "/YM", exchange: "XCBT", last: "49,564", change: "−204", ask: "49,565", bid: "49,563", spread: "2", mark: "49,564", volume: "—", description: "—", prevClose: "49,768", range: "—", heading: "—", trend: "flat" },
  { symbol: "/GC", exchange: "XCED", last: "4,512.0", change: "+1,250.00", ask: "4,512.4", bid: "4,511.9", spread: "0.5", mark: "4,512.0", volume: "—", description: "—", prevClose: "3,262.0", range: "—", heading: "—", trend: "down" },
  { symbol: "/HG", exchange: "XCME", last: "6.2005", change: "−1,250.00", ask: "6.2005", bid: "6.1995", spread: "0.0010", mark: "6.2000", volume: "—", description: "—", prevClose: "7.4505", range: "—", heading: "—", trend: "flat" },
];

const columnLabels: { key: SortKey; label: string }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "last", label: "Last Price" },
  { key: "change", label: "Chg Prev Day" },
  { key: "ask", label: "Ask Price" },
  { key: "bid", label: "Bid Price" },
  { key: "spread", label: "Spread" },
  { key: "mark", label: "Mark Price" },
  { key: "volume", label: "Vol" },
  { key: "description", label: "Description" },
  { key: "prevClose", label: "Prev day close" },
  { key: "range", label: "52 Week Range" },
  { key: "heading", label: "Heading" },
];

const numericValue = (quote: Quote, key: SortKey) => {
  if (key === "symbol") return quote.symbol;
  return Number(quote[key].replace(/[−+,]/g, (character) => (character === "−" ? "-" : ""))) || 0;
};

const createQuoteTrade = (quote: Quote, side: "Buy" | "Sell"): TradeRequest => {
  const value = side === "Buy" ? quote.ask : quote.bid;
  return { message: `${side} 1 ${quote.symbol} @ ${value} • Limit`, symbol: quote.symbol, side, quantity: 1, price: Number(value.replace(/,/g, "")), spread: "Stock", expiration: "—", strike: "—", optionType: "—" };
};

function TrendIcon({ trend }: { trend: Trend }) {
  if (trend === "up") return <ArrowUp aria-hidden="true" />;
  if (trend === "down") return <ArrowDown aria-hidden="true" />;
  return <Minus aria-hidden="true" />;
}

export function Watchlist() {
  const { requestTrade, simulateTrade } = useTradingMode();
  const [quotes, setQuotes] = useState(initialQuotes);
  const [preset, setPreset] = useState("Preset");
  const [addOpen, setAddOpen] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [sort, setSort] = useState<SortState>({ kind: "none" });
  const [watchlistMenu, setWatchlistMenu] = useState<WatchlistMenu>({ kind: "closed" });

  const sortedQuotes = useMemo(() => {
    if (sort.kind === "none") return quotes;
    return [...quotes].sort((left, right) => {
      const a = numericValue(left, sort.key);
      const b = numericValue(right, sort.key);
      const result = typeof a === "string" ? a.localeCompare(b as string) : a - (b as number);
      return sort.direction === "asc" ? result : -result;
    });
  }, [quotes, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((current) => current.kind === "column" && current.key === key
      ? { kind: "column", key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { kind: "column", key, direction: "asc" });
  };

  const addQuote = () => {
    const symbol = newSymbol.trim().toUpperCase();
    if (!symbol) return;
    if (quotes.some((quote) => quote.symbol === symbol)) return;
    setQuotes((current) => [...current, { symbol, exchange: "XNAS", last: "—", change: "—", ask: "—", bid: "—", spread: "—", mark: "—", volume: "—", description: "—", prevClose: "—", range: "—", heading: "—", trend: "flat" }]);
    setNewSymbol("");
    setAddOpen(false);
  };

  const downloadCsv = () => {
    const csv = ["Symbol,Exchange,Last Price,Change,Ask Price,Bid Price,Spread", ...quotes.map((quote) => [quote.symbol, quote.exchange, quote.last, quote.change, quote.ask, quote.bid, quote.spread].join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "watchlist.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="widget watchlist-widget" aria-label="Watchlist">
      <header className="watchlist-toolbar">
        <div className="widget-title"><span>Watchlist</span></div>
        <SelectMenu ariaLabel="Watchlist preset" className="watchlist-preset-select" label={null} variant="ghost" value={preset} choices={["Preset", "US Futures", "Crypto", "Forex"].map((value) => ({ value, icon: null }))} onChange={setPreset} />
        <span className="watchlist-toolbar-separator" aria-hidden="true" />
        <button className="watchlist-toolbar-button watchlist-add-button" type="button" aria-expanded={addOpen} onClick={() => setAddOpen((open) => !open)}>
          <span>Add Symbols</span>
        </button>
        {addOpen ? (
          <form className="watchlist-add-panel" onSubmit={(event) => { event.preventDefault(); addQuote(); }}>
            <label htmlFor="watchlist-symbol">Add symbol</label>
            <div className="watchlist-add-row">
              <input id="watchlist-symbol" value={newSymbol} onChange={(event) => setNewSymbol(event.target.value)} placeholder="AAPL" autoFocus />
              <button type="submit">Add</button>
            </div>
          </form>
        ) : null}
        <div className="watchlist-toolbar-spacer" />
        <button className="watchlist-download-button" type="button" aria-label="Download watchlist" onClick={downloadCsv}><Download aria-hidden="true" /></button>
      </header>

      <div className="watchlist-table-wrap">
        <div className="watchlist-table-actions" aria-label="Table actions">
          <button className="watchlist-table-action is-disabled" type="button" aria-label="Open table panel"><PanelRightOpen aria-hidden="true" /></button>
          <span className="watchlist-table-action-separator" aria-hidden="true" />
          <button className="watchlist-table-action" type="button" aria-label="Resize table"><Maximize2 aria-hidden="true" /></button>
          <span className="watchlist-table-action-separator" aria-hidden="true" />
          <button className="watchlist-table-action" type="button" aria-label="Choose table columns"><Columns3 aria-hidden="true" /></button>
        </div>
        <table className="watchlist-table">
          <thead>
            <tr>
              {columnLabels.map((column) => (
                <th key={column.key} scope="col">
                  <button className="watchlist-sort-button" type="button" onClick={() => toggleSort(column.key)}>
                    <span>{column.label}</span>
                    <span className="watchlist-sort-indicator" aria-hidden="true">
                      {sort.kind === "column" && sort.key === column.key
                        ? sort.direction === "asc" ? <ArrowUp /> : <ArrowDown />
                        : <Ellipsis />}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedQuotes.map((quote) => {
              const buyTrade = createQuoteTrade(quote, "Buy");
              const sellTrade = createQuoteTrade(quote, "Sell");
              const selection = { title: `${quote.symbol}:${quote.exchange}`, sell: { price: quote.bid, trade: sellTrade, disabled: quote.bid === "—" }, buy: { price: quote.ask, trade: buyTrade, disabled: quote.ask === "—" } };
              return (
                <tr key={quote.symbol} onContextMenu={(event) => { event.preventDefault(); setWatchlistMenu({ kind: "open", x: event.clientX, y: event.clientY, ...selection }); }}>
                  <th scope="row" className="watchlist-symbol-cell"><span>{quote.symbol}:{quote.exchange}</span><Clock3 className="watchlist-delayed-status" aria-label="Delayed quote" /><span className="watchlist-live-dot" aria-label="Market open" /></th>
                  <td><span className={`watchlist-data-cell trend-${quote.trend}`}><TrendIcon trend={quote.trend} />{quote.last}</span></td>
                  <td><span className={`watchlist-data-cell trend-${quote.change.startsWith("+") ? "up" : quote.change.startsWith("−") ? "down" : "flat"}`}>{quote.change}</span></td>
                  <td><button className="watchlist-quote-cell trend-up quote-pill" type="button" disabled={quote.ask === "—"} onClick={() => requestTrade(buyTrade)}><ArrowUp aria-hidden="true" />{quote.ask}</button></td>
                  <td><button className="watchlist-quote-cell trend-up quote-pill" type="button" disabled={quote.bid === "—"} onClick={() => requestTrade(sellTrade)}><ArrowUp aria-hidden="true" />{quote.bid}</button></td>
                  <td className="watchlist-spread-cell">{quote.spread}</td>
                  <td className="watchlist-value-cell">{quote.mark}</td>
                  <td className="watchlist-value-cell">{quote.volume}</td>
                  <td className="watchlist-value-cell">{quote.description}</td>
                  <td className="watchlist-value-cell">{quote.prevClose}</td>
                  <td className="watchlist-value-cell">{quote.range}</td>
                  <td className="watchlist-value-cell">{quote.heading}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {watchlistMenu.kind === "open" ? <SimulationMenu x={watchlistMenu.x} y={watchlistMenu.y} title={watchlistMenu.title} sell={watchlistMenu.sell} buy={watchlistMenu.buy} onTrade={requestTrade} onSimulate={simulateTrade} onClose={() => setWatchlistMenu({ kind: "closed" })} /> : null}
    </section>
  );
}
