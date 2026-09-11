import { useMemo, useState, type MouseEvent } from "react";
import { ArrowUpDown, ChevronDown, ChevronRight, Ellipsis, Plus } from "lucide-react";
import trendDown from "../assets/option-trend-down.svg";
import trendFlat from "../assets/option-trend-flat.svg";
import trendUp from "../assets/option-trend-up.svg";
import { strategyIcons } from "../assets/strategyIcons";
import { useTradingMode } from "../trading/TradingMode";
import { getOptionInstrument, optionSymbols, type OptionQuote, type OptionSymbol } from "../trading/optionCatalog";
import { createStrategyLegs, formatStrike, strategySide, type StrategyName } from "../trading/strategies";
import type { TradeRequest } from "../trading/types";
import { SelectMenu, type SelectChoice } from "./SelectMenu";
import { SimulationMenu, type TradeMenuSelection } from "./SimulationMenu";
import "./OptionChain.css";

type Quote = OptionQuote;
type ChainMenu = { kind: "closed" } | ({ kind: "open"; x: number; y: number } & TradeMenuSelection);

const trendIcons = { up: trendUp, down: trendDown, flat: trendFlat } as const;
const formatMarketPrice = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatSigned = (value: number) => `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(2)}`;
const menuExpiration = (expiration: string) => expiration.replace(/^(\w+) (\d+), (\d+)$/, "$2 $1 $3");
const twoExpirySpreads = ["Combo", "Calendar", "Diagonal"];
const expiryDays = [0, 4, 5, 7, 10, 12, 14, 19, 26, 33, 40, 47, 54, 61, 68, 75];

const spreadChoices: readonly SelectChoice[] = [
  { value: "Single", icon: strategyIcons.single },
  { value: "Vertical", icon: strategyIcons.vertical },
  { value: "Straddle", icon: strategyIcons.straddle },
  { value: "Strangle", icon: strategyIcons.strangle },
  { value: "Ratio/Back", icon: strategyIcons.ratioBack },
  { value: "Combo", icon: strategyIcons.combo },
  { value: "Synthetic", icon: strategyIcons.synthetic },
  { value: "Calendar", icon: strategyIcons.calendar },
  { value: "Diagonal", icon: strategyIcons.diagonal },
  { value: "Butterfly", icon: strategyIcons.butterfly },
  { value: "Condor", icon: strategyIcons.condor },
  { value: "Iron Condor", icon: strategyIcons.ironCondor },
];

function SelectControl({ ariaLabel, label, variant, value, options, onChange, className }: { ariaLabel: string; label: string | null; variant: "ghost" | "solid"; value: string; options: readonly string[]; onChange: (value: string) => void; className?: string }) {
  return <SelectMenu ariaLabel={ariaLabel} className={`option-chain-select ${className ?? ""}`} label={label} variant={variant} value={value} choices={options.map((option) => ({ value: option, icon: null }))} onChange={onChange} />;
}

export function OptionChain() {
  const { requestTrade, requestCustomStrategyLeg, simulateTrade } = useTradingMode();
  const [symbol, setSymbol] = useState<OptionSymbol>("AAPL");
  const [symbolMenuOpen, setSymbolMenuOpen] = useState(false);
  const [view, setView] = useState("Calls & Puts");
  const [series, setSeries] = useState("All");
  const [expirationType, setExpirationType] = useState("All");
  const [expirationStyle, setExpirationStyle] = useState("All");
  const [spread, setSpread] = useState("Single");
  const [strikes, setStrikes] = useState("8");
  const [width, setWidth] = useState("1");
  const [expiries, setExpiries] = useState("1");
  const [sortAscending, setSortAscending] = useState(true);
  const [openExpirations, setOpenExpirations] = useState<string[]>([getOptionInstrument("AAPL").expirations[0]]);
  const [chainMenu, setChainMenu] = useState<ChainMenu>({ kind: "closed" });
  const instrument = getOptionInstrument(symbol);

  const isSingle = spread === "Single";
  const usesTwoExpiries = twoExpirySpreads.includes(spread);
  const widthCount = Number(width);
  const expiriesCount = Number(expiries);
  const structureFirstExpiration = instrument.expirations[0];
  const createStructure = (buy: boolean) => createStrategyLegs(spread as StrategyName, { instrument: "option", side: strategySide(buy), quantity: "1", expiration: structureFirstExpiration, strike: "0", optionType: "Call" }, symbol);
  const comboStrike = (anchor: number, offset: string) => formatStrike(anchor + Number(offset) * 5 * widthCount);
  const strikeColumnWidth = isSingle ? 80 : 80 + (createStructure(true).length - 1) * 40;
  const chainColumns = `32px repeat(4, 97.75px) 110px 110px ${strikeColumnWidth}px 110px 110px repeat(4, 97.75px) 32px`;

  const displayRows = useMemo(() => {
    const count = Number(strikes);
    const visible = instrument.rows.slice(0, count);
    return sortAscending ? visible : [...visible].reverse();
  }, [instrument.rows, sortAscending, strikes]);

  const expirationGroups = useMemo(() => usesTwoExpiries
    ? instrument.expirations.slice(0, instrument.expirations.length - expiriesCount).map((first, index) => ({ first, second: instrument.expirations[index + expiriesCount] }))
    : instrument.expirations.map((expiration) => ({ first: expiration, second: null })), [expiriesCount, instrument.expirations, usesTwoExpiries]);

  const selectSymbol = (nextSymbol: OptionSymbol) => {
    setSymbol(nextSymbol);
    setOpenExpirations([getOptionInstrument(nextSymbol).expirations[0]]);
    setStrikes("8");
    setSortAscending(true);
    setSymbolMenuOpen(false);
  };

  const toggleExpiration = (expiration: string) => {
    setOpenExpirations((current) => current.includes(expiration) ? current.filter((item) => item !== expiration) : [...current, expiration]);
  };

  const openSimulationMenu = (event: MouseEvent<HTMLElement>, selection: TradeMenuSelection) => {
    event.preventDefault();
    event.stopPropagation();
    setChainMenu({ kind: "open", x: event.clientX, y: event.clientY, ...selection });
  };

  const renderRows = (expiration: string, secondExpiration: string | null) => displayRows.map((row, index) => {
    const comboStrikes = isSingle ? null : createStructure(true).map((leg) => comboStrike(row.strike, leg.strike));
    const createSingleTrade = (side: "Buy" | "Sell", optionType: "Call" | "Put", quote: Quote) => ({
      message: `${side} 1 ${symbol} ${row.strike} ${optionType} @ ${quote.value} • Limit`,
      symbol,
      side,
      quantity: 1,
      price: Number(quote.value),
      spread: "Single",
      expiration,
      strike: `${row.strike}`,
      optionType,
    });
    const createStrategyTrade = (side: "Buy" | "Sell"): TradeRequest => {
      const legs = createStructure(side === "Buy").map((leg) => {
        const strike = comboStrike(row.strike, leg.strike);
        const legExpiration = secondExpiration !== null && leg.expiration !== structureFirstExpiration ? secondExpiration : expiration;
        const strikeRow = instrument.rows.find((candidate) => `${candidate.strike}` === strike) ?? row;
        const quotes = leg.optionType === "Call" ? strikeRow.call : strikeRow.put;
        return { side: leg.side as "Buy" | "Sell", quantity: 1, expiration: legExpiration, strike, optionType: leg.optionType, price: Number((leg.side === "Buy" ? quotes[1] : quotes[0]).value) };
      });
      const totalPrice = legs.reduce((sum, leg) => sum + leg.price, 0);
      return {
        message: `${side} 1 ${symbol} ${spread} ${comboStrikes!.join(" / ")} @ ${totalPrice.toFixed(2)} • Limit`,
        symbol,
        side,
        quantity: 1,
        price: Number(totalPrice.toFixed(2)),
        spread,
        expiration,
        strike: comboStrikes![0],
        optionType: "Call",
        legs,
      };
    };
    const sellCall = createSingleTrade("Sell", "Call", row.call[0]);
    const buyCall = createSingleTrade("Buy", "Call", row.call[1]);
    const sellPut = createSingleTrade("Sell", "Put", row.put[0]);
    const buyPut = createSingleTrade("Buy", "Put", row.put[1]);
    const sellTrade = isSingle ? sellCall : createStrategyTrade("Sell");
    const buyTrade = isSingle ? buyCall : createStrategyTrade("Buy");
    const comboLabel = comboStrikes === null ? `${row.strike} Call` : `${spread} ${comboStrikes.join(" / ")}`;
    const menuTitle = `${symbol} ${secondExpiration ? `${menuExpiration(expiration)} / ${menuExpiration(secondExpiration)}` : menuExpiration(expiration)} ${comboLabel}`;
    const callMenu = { title: menuTitle, sell: { price: isSingle ? row.call[0].value : sellTrade.price!.toFixed(2), trade: sellTrade, disabled: false }, buy: { price: isSingle ? row.call[1].value : buyTrade.price!.toFixed(2), trade: buyTrade, disabled: false } };
    const putMenu = { title: menuTitle, sell: { price: isSingle ? row.put[0].value : sellTrade.price!.toFixed(2), trade: sellTrade, disabled: false }, buy: { price: isSingle ? row.put[1].value : buyTrade.price!.toFixed(2), trade: buyTrade, disabled: false } };

    return (
      <div className={`chain-row ${index < 4 ? "call-itm" : "put-itm"} ${index === 4 ? "atm-row" : ""}`} role="row" style={{ gridTemplateColumns: chainColumns }} key={`${expiration}-${row.strike}`} onContextMenu={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); openSimulationMenu(event, event.clientX < bounds.left + bounds.width / 2 ? callMenu : putMenu); }}>
        <button className="row-menu" type="button" aria-label={`Call row menu ${row.strike}`} aria-haspopup="menu" onClick={(event) => openSimulationMenu(event, callMenu)}><Ellipsis aria-hidden="true" size={16} strokeWidth={1.75} /></button><span>{row.callTheo}</span><span>{row.callIv}</span><span>{row.callDelta}</span><span>{row.callMark}</span>
        <QuoteCell quote={row.call[0]} label={`Sell ${symbol} ${comboLabel}`} onTrade={() => requestTrade(sellTrade)} onAdd={() => requestCustomStrategyLeg(sellCall)} />
        <QuoteCell quote={row.call[1]} label={`Buy ${symbol} ${comboLabel}`} onTrade={() => requestTrade(buyTrade)} onAdd={() => requestCustomStrategyLeg(buyCall)} />
        <span className="strike-cell">{isSingle ? row.strike : comboStrikes!.join(" / ")}</span>
        <QuoteCell quote={row.put[0]} label={`Sell ${symbol} ${comboLabel}`} onTrade={() => requestTrade(sellTrade)} onAdd={() => requestCustomStrategyLeg(sellPut)} />
        <QuoteCell quote={row.put[1]} label={`Buy ${symbol} ${comboLabel}`} onTrade={() => requestTrade(buyTrade)} onAdd={() => requestCustomStrategyLeg(buyPut)} />
        <span>{row.putMark}</span><span>{row.putDelta}</span><span>{row.putIv}</span><span>{row.putTheo}</span><button className="row-menu" type="button" aria-label={`Put row menu ${row.strike}`} aria-haspopup="menu" onClick={(event) => openSimulationMenu(event, putMenu)}><Ellipsis aria-hidden="true" size={16} strokeWidth={1.75} /></button>
      </div>
    );
  });

  const renderExpiryGroup = (group: { first: string; second: string | null }, groupIndex: number, isTop: boolean) => {
    const open = openExpirations.includes(group.first);
    const rows = open ? renderRows(group.first, group.second) : null;
    const groupContent = (
      <>
        <span className="expiry-chevron">{open ? <ChevronDown aria-hidden="true" size={16} strokeWidth={1.75} /> : <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} />}</span>
        <span>{group.second ? `${group.first} / ${group.second}` : group.first}</span>
        <span>{group.second ? `${expiryDays[groupIndex]} / ${expiryDays[groupIndex + expiriesCount]}` : "326"}</span>
        <span className="blue-text">E</span><span className="blue-text">120</span><span className="blue-text">110</span><span className="blue-text">Delivers: HGV 10, PK 22, USD 31.13</span><span className="blue-text">Weeklys</span>
      </>
    );
    const header = <button type="button" className={`expiry-group ${open ? "is-open" : ""}`} onClick={() => toggleExpiration(group.first)}>{groupContent}</button>;
    if (isTop) {
      return (
        <div className="expiry-groups expiry-top-group">
          {header}
          {rows}
        </div>
      );
    }
    return <div className="expiry-block" key={group.first}>{header}{rows}</div>;
  };

  return (
    <section className="widget option-chain" aria-label="Option chain">
      <div className="option-chain-toolbar">
        <div className="widget-title"><span>Option Chain</span></div>
        <div className="symbol-picker">
          <button type="button" className="symbol-picker-trigger" aria-label="Instrument picker" aria-expanded={symbolMenuOpen} onClick={() => setSymbolMenuOpen((open) => !open)}><span>{symbol}</span><span className="symbol-status" aria-label="Market open" /><ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} /></button>
          {symbolMenuOpen ? (
            <div className="symbol-menu">
              {optionSymbols.map((item) => <button type="button" key={item} onClick={() => selectSymbol(item)}>{item}<span>{formatMarketPrice(getOptionInstrument(item).market.last)}</span></button>)}
            </div>
          ) : null}
        </div>
        <div className="toolbar-controls">
          <SelectControl ariaLabel="Option view" label={null} variant="ghost" value={view} options={["Calls & Puts", "Calls", "Puts"]} onChange={setView} />
          <SelectControl ariaLabel="Series" label="Series" variant="ghost" value={series} options={["All", "Quarterly", "Weekly"]} onChange={setSeries} />
          <SelectControl ariaLabel="Expiration type" label="Expiration Type" variant="ghost" value={expirationType} options={["All", "Weeklys", "Quarterlys"]} onChange={setExpirationType} />
          <SelectControl ariaLabel="Expiration style" label="Expiration Style" variant="ghost" value={expirationStyle} options={["All", "American", "European"]} onChange={setExpirationStyle} />
          <span className="toolbar-divider" />
          <button className="toolbar-icon" type="button" aria-label="More options"><Ellipsis aria-hidden="true" size={18} strokeWidth={1.75} /></button>
        </div>
      </div>

      <div className="market-strip">
        <span className="market-info market-last">Last <b className={instrument.market.change >= 0 ? "positive" : "negative"}><img className="trend-icon" src={instrument.market.change >= 0 ? trendUp : trendDown} alt="" />{formatMarketPrice(instrument.market.last)}</b></span>
        <span className="market-info">Chg <b className={instrument.market.change >= 0 ? "positive" : "negative"}>{formatSigned(instrument.market.change)}</b></span>
        <span className="market-info">Chg, % <b className={instrument.market.changePercent >= 0 ? "positive" : "negative"}>{formatSigned(instrument.market.changePercent)}%</b></span>
        <span className="market-action"><span>Bid</span><button className="market-chip positive-chip" type="button" aria-label={`Sell ${symbol} at bid ${formatMarketPrice(instrument.market.bid)}`} onClick={() => requestTrade({ message: `Sell 1 ${symbol} @ ${formatMarketPrice(instrument.market.bid)} • Limit`, symbol, side: "Sell", quantity: 1, price: instrument.market.bid, spread: "Stock", expiration: "—", strike: "—", optionType: "—" })}><img className="trend-icon" src={trendUp} alt="" />{formatMarketPrice(instrument.market.bid)}</button></span>
        <span className="market-action"><span>Ask</span><button className="market-chip negative-chip" type="button" aria-label={`Buy ${symbol} at ask ${formatMarketPrice(instrument.market.ask)}`} onClick={() => requestTrade({ message: `Buy 1 ${symbol} @ ${formatMarketPrice(instrument.market.ask)} • Limit`, symbol, side: "Buy", quantity: 1, price: instrument.market.ask, spread: "Stock", expiration: "—", strike: "—", optionType: "—" })}><img className="trend-icon" src={trendDown} alt="" />{formatMarketPrice(instrument.market.ask)}</button></span>
        <span className="market-info">Open <b>{formatMarketPrice(instrument.market.open)}</b></span><span className="market-info">High <b>{formatMarketPrice(instrument.market.high)}</b></span><span className="market-info">Low <b>{formatMarketPrice(instrument.market.low)}</b></span><span className="market-info">Volume <b>{instrument.market.volume}</b></span>
        <button className="market-expand" type="button" aria-label="Expand quote details"><ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} /></button>
      </div>

      <div className="chain-filters">
        <span>Spread</span><SelectMenu ariaLabel="Spread" className="option-chain-select spread-select" label={null} variant="solid" value={spread} choices={spreadChoices} onChange={setSpread} />
        <span>Strikes</span><SelectControl ariaLabel="Strikes" label={null} variant="solid" value={strikes} options={["8", "6", "4"]} onChange={setStrikes} />
        {isSingle ? null : <><span>Width</span><SelectControl ariaLabel="Width" className="width-select" label={null} variant="solid" value={width} options={["1", "2", "3"]} onChange={setWidth} /></>}
        {usesTwoExpiries ? <><span>Expiries</span><SelectControl ariaLabel="Expiries" className="expiries-select" label={null} variant="solid" value={expiries} options={["1", "2", "3"]} onChange={setExpiries} /></> : null}
      </div>

      <div className="option-chain-scroll">
        <div className="chain-table" role="table" aria-label={`${symbol} option chain`}>
          <div className="chain-superheader" role="row" style={{ gridTemplateColumns: chainColumns }}>
            <span className="call-group" style={{ gridColumn: "1 / 8" }}>CALLS</span><span className="put-group" style={{ gridColumn: "9 / 16" }}>PUTS</span>
          </div>
          <div className="chain-header" role="row" style={{ gridTemplateColumns: chainColumns }}>
            <Ellipsis className="header-ellipsis" aria-hidden="true" size={16} strokeWidth={1.75} /><span>Theo Price</span><span>IV, %</span><span>Delta</span><span>Mark Price</span><span className="quote-heading">Bid</span><span className="quote-heading">Ask</span><button type="button" className="strike-heading" onClick={() => setSortAscending((ascending) => !ascending)}>Strike <span><ArrowUpDown aria-hidden="true" size={13} strokeWidth={1.75} /></span></button><span className="quote-heading">Bid</span><span className="quote-heading">Ask</span><span>Mark Price</span><span>Delta</span><span>IV, %</span><span>Theo Price</span><Ellipsis className="header-ellipsis" aria-hidden="true" size={16} strokeWidth={1.75} />
          </div>
          {renderExpiryGroup(expirationGroups[0], 0, true)}
          <div className="expiry-groups">
            {expirationGroups.slice(1).map((group, index) => renderExpiryGroup(group, index + 1, false))}
          </div>
        </div>
      </div>
      {chainMenu.kind === "open" ? <SimulationMenu x={chainMenu.x} y={chainMenu.y} title={chainMenu.title} sell={chainMenu.sell} buy={chainMenu.buy} onTrade={requestTrade} onSimulate={simulateTrade} onClose={() => setChainMenu({ kind: "closed" })} /> : null}
    </section>
  );
}

function QuoteCell({ quote, label, onTrade, onAdd }: { quote: Quote; label: string; onTrade: () => void; onAdd: () => void }) {
  return (
    <div className={`quote-cell is-${quote.trend}`}>
      <button type="button" className="quote-trade" aria-label={`${label} at ${quote.value}`} onClick={onTrade}>
        <span><img className="trend-icon" src={trendIcons[quote.trend]} alt="" />{quote.value}</span>
      </button>
      <button type="button" className="quote-add" aria-label={`Add ${label} quote`} onClick={onAdd}>
        <Plus aria-hidden="true" size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
