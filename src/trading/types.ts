export type Position = {
  id: string;
  kind: "real" | "simulated";
  spread: string;
  side: string;
  qty: number | null;
  expiration: string;
  strike: string;
  optionType: string;
  price: number | null;
  symbol: string;
  volatility: string;
  delta: string;
  group: "stock" | "leg" | "single";
  parentId?: string;
};

export type TradeLeg = {
  side: "Buy" | "Sell";
  quantity: number;
  expiration: string;
  strike: string;
  optionType: string;
  price: number | null;
};

export type TradeRequest = {
  message: string;
  symbol: string;
  side: "Buy" | "Sell";
  quantity: number;
  price: number | null;
  spread: string;
  expiration: string;
  strike: string;
  optionType: string;
  legs?: TradeLeg[];
};
