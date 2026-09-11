export type QuoteTrend = "up" | "down" | "flat";

export type OptionQuote = {
  value: string;
  trend: QuoteTrend;
};

export type OptionRow = {
  strike: number;
  callTheo: string;
  putTheo: string;
  call: [OptionQuote, OptionQuote];
  put: [OptionQuote, OptionQuote];
  callIv: string;
  callDelta: string;
  callMark: string;
  putMark: string;
  putDelta: string;
  putIv: string;
};

type MarketSnapshot = {
  last: number;
  change: number;
  changePercent: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  volume: string;
};

export type OptionInstrument = {
  market: MarketSnapshot;
  expirations: readonly string[];
  rows: readonly OptionRow[];
};

export const optionSymbols = ["AAPL", "TSLA", "NVDA", "MSFT"] as const;
export type OptionSymbol = typeof optionSymbols[number];

const formatOptionPrice = (value: number) => Math.max(.01, value).toFixed(2);

const createQuotePair = (mid: number, trend: QuoteTrend): [OptionQuote, OptionQuote] => {
  const spread = Math.max(.02, mid * .025);
  return [
    { value: formatOptionPrice(mid - spread), trend },
    { value: formatOptionPrice(mid + spread), trend },
  ];
};

const createRows = (strikes: readonly number[], last: number, volatility: number): OptionRow[] => {
  const range = strikes[strikes.length - 1] - strikes[0];

  return strikes.map((strike, index) => {
    const timeValue = Math.max(.28, (strikes.length - index) * .42);
    const callMid = timeValue + Math.max(last - strike, 0) * .1;
    const putMid = timeValue + Math.max(strike - last, 0) * .1;
    const callDelta = Math.max(.05, Math.min(.95, .5 + (last - strike) / (range * 1.5)));
    const trend: QuoteTrend = index < 3 ? "up" : index > 5 ? "down" : "flat";

    return {
      strike,
      callTheo: formatOptionPrice(callMid * 1.01),
      putTheo: formatOptionPrice(putMid * 1.01),
      call: createQuotePair(callMid, trend),
      put: createQuotePair(putMid, trend),
      callIv: (volatility + index * .6).toFixed(2),
      callDelta: callDelta.toFixed(2),
      callMark: formatOptionPrice(callMid),
      putMark: formatOptionPrice(putMid),
      putDelta: `−${(1 - callDelta).toFixed(2)}`,
      putIv: (volatility - 2 + index * .8).toFixed(2),
    };
  });
};

const aaplRows: OptionRow[] = [
  { strike: 285, callTheo: "9.40", putTheo: "0.12", call: [{ value: "9.10", trend: "up" }, { value: "9.75", trend: "up" }], put: [{ value: "0.10", trend: "up" }, { value: "0.11", trend: "down" }], callIv: "39.25", callDelta: "0.92", callMark: "0.10", putMark: "0.10", putDelta: "−0.05", putIv: "21.77" },
  { strike: 287.5, callTheo: "6.93", putTheo: "0.26", call: [{ value: "6.75", trend: "up" }, { value: "6.80", trend: "up" }], put: [{ value: "0.20", trend: "up" }, { value: "0.21", trend: "up" }], callIv: "32.54", callDelta: "0.89", callMark: "0.22", putMark: "0.22", putDelta: "−0.11", putIv: "26.70" },
  { strike: 290, callTheo: "4.64", putTheo: "0.62", call: [{ value: "4.60", trend: "up" }, { value: "4.75", trend: "up" }], put: [{ value: "0.45", trend: "down" }, { value: "0.46", trend: "down" }], callIv: "29.17", callDelta: "0.80", callMark: "0.48", putMark: "0.48", putDelta: "−0.23", putIv: "27.89" },
  { strike: 292.5, callTheo: "2.75", putTheo: "1.41", call: [{ value: "3.80", trend: "up" }, { value: "3.83", trend: "down" }], put: [{ value: "0.99", trend: "up" }, { value: "1.04", trend: "up" }], callIv: "28.16", callDelta: "0.65", callMark: "1.08", putMark: "1.08", putDelta: "−0.43", putIv: "27.54" },
  { strike: 295, callTheo: "1.41", putTheo: "2.24", call: [{ value: "1.42", trend: "down" }, { value: "1.44", trend: "up" }], put: [{ value: "1.44", trend: "down" }, { value: "1.45", trend: "down" }], callIv: "27.54", callDelta: "0.43", callMark: "2.24", putMark: "2.24", putDelta: "−0.56", putIv: "27.02" },
  { strike: 297.5, callTheo: "0.62", putTheo: "3.95", call: [{ value: "0.63", trend: "up" }, { value: "0.63", trend: "up" }], put: [{ value: "2.08", trend: "down" }, { value: "2.45", trend: "down" }], callIv: "27.89", callDelta: "0.23", callMark: "3.95", putMark: "3.65", putDelta: "−0.75", putIv: "25.89" },
  { strike: 300, callTheo: "0.26", putTheo: "6.00", call: [{ value: "0.28", trend: "flat" }, { value: "0.27", trend: "flat" }], put: [{ value: "6.50", trend: "flat" }, { value: "6.75", trend: "flat" }], callIv: "26.70", callDelta: "0.11", callMark: "6.00", putMark: "6.00", putDelta: "−0.87", putIv: "27.08" },
  { strike: 302.5, callTheo: "0.12", putTheo: "8.43", call: [{ value: "0.11", trend: "down" }, { value: "0.12", trend: "down" }], put: [{ value: "7.45", trend: "up" }, { value: "8.40", trend: "up" }], callIv: "21.77", callDelta: "0.05", callMark: "8.43", putMark: "8.43", putDelta: "−0.92", putIv: "32.64" },
];

export const optionCatalog: Record<OptionSymbol, OptionInstrument> = {
  AAPL: {
    market: { last: 298.21, change: -2.61, changePercent: -.61, bid: 298.21, ask: 298.21, open: 297.82, high: 300.45, low: 296.99, volume: "4,646,990" },
    expirations: ["May 14, 26", "May 21, 26", "May 28, 26", "Jun 04, 26", "Jun 11, 26", "Jun 18, 26"],
    rows: aaplRows,
  },
  TSLA: {
    market: { last: 347.8, change: 4.62, changePercent: 1.35, bid: 347.79, ask: 347.81, open: 343.12, high: 351.44, low: 339.78, volume: "98,231,440" },
    expirations: ["May 15, 26", "May 22, 26", "May 29, 26", "Jun 05, 26", "Jun 12, 26", "Jun 19, 26"],
    rows: createRows([330, 335, 340, 345, 350, 355, 360, 365], 347.8, 42.5),
  },
  NVDA: {
    market: { last: 178.64, change: -2.31, changePercent: -1.28, bid: 178.63, ask: 178.65, open: 181.02, high: 182.33, low: 176.4, volume: "183,450,210" },
    expirations: ["May 16, 26", "May 23, 26", "May 30, 26", "Jun 06, 26", "Jun 13, 26", "Jun 20, 26"],
    rows: createRows([160, 165, 170, 175, 180, 185, 190, 195], 178.64, 48.2),
  },
  MSFT: {
    market: { last: 484.17, change: .86, changePercent: .18, bid: 484.16, ask: 484.18, open: 483.7, high: 487.25, low: 480.9, volume: "18,942,670" },
    expirations: ["May 18, 26", "May 25, 26", "Jun 01, 26", "Jun 08, 26", "Jun 15, 26", "Jun 22, 26"],
    rows: createRows([450, 455, 460, 465, 470, 475, 480, 485], 484.17, 23.4),
  },
};

export const getOptionInstrument = (symbol: string) => optionCatalog[symbol as OptionSymbol];
