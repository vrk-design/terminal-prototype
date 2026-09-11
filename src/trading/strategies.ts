import { getOptionInstrument } from "./optionCatalog";

export const strategyNames = ["Vertical", "Straddle", "Strangle", "Ratio/Back", "Combo", "Synthetic", "Covered", "Calendar", "Diagonal", "Butterfly", "Condor", "Iron Condor", "Custom"] as const;
export type StrategyName = typeof strategyNames[number];
export type StrategyLeg = { instrument: "stock" | "option"; side: string; quantity: string; expiration: string; strike: string; optionType: string };

export const isStrategyName = (value: string): value is StrategyName => strategyNames.includes(value as StrategyName);
export const strategySide = (buy: boolean) => buy ? "Buy" : "Sell";
export const legQuantity = (first: StrategyLeg) => Math.abs(Number(first.quantity)) || 1;
export const formatStrike = (value: number) => `${Math.round(value * 100) / 100}`;
export const optionSeed = (first: StrategyLeg, symbol: string): StrategyLeg => {
  if (first.instrument === "option") return first;
  const instrument = getOptionInstrument(symbol);
  return { instrument: "option", side: first.side, quantity: first.quantity, expiration: instrument.expirations[0], strike: `${instrument.rows[0].strike}`, optionType: "Call" };
};
export const optionLeg = (first: StrategyLeg, side: string, quantity: number, expiration: string, strike: string, optionType: string): StrategyLeg => ({ instrument: "option", side, quantity: `${quantity}`, expiration, strike, optionType });
export const stockLeg = (first: StrategyLeg, side: string, quantity: number): StrategyLeg => ({ instrument: "stock", side, quantity: `${quantity}`, expiration: "—", strike: "—", optionType: "—" });
export const otherExpiration = (symbol: string, expiration: string) => {
  const expirations = getOptionInstrument(symbol).expirations;
  return expiration === expirations[0] ? expirations[1] : expirations[0];
};
export const otherOptionType = (optionType: string) => optionType === "Call" ? "Put" : "Call";

export const createStrategyLegs = (name: StrategyName, first: StrategyLeg, symbol: string): StrategyLeg[] => {
  const option = optionSeed(first, symbol);
  const quantity = legQuantity(first);
  const buy = first.side.startsWith("Buy");
  const longSide = strategySide(buy);
  const shortSide = strategySide(!buy);
  const firstStrike = Number(option.strike);
  const strike = (offset: number) => formatStrike(firstStrike + offset);

  switch (name) {
    case "Vertical":
      return [optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(0), option.optionType), optionLeg(option, shortSide, buy ? -quantity : quantity, option.expiration, strike(.5), option.optionType)];
    case "Straddle":
      return [optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(0), option.optionType), optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(0), otherOptionType(option.optionType))];
    case "Strangle":
      return [optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(0), option.optionType), optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(.5), otherOptionType(option.optionType))];
    case "Ratio/Back":
      return [optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(0), option.optionType), optionLeg(option, shortSide, buy ? -quantity * 2 : quantity * 2, option.expiration, strike(.5), option.optionType)];
    case "Combo":
      return [optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(0), option.optionType), optionLeg(option, shortSide, buy ? -quantity : quantity, otherExpiration(symbol, option.expiration), strike(.5), otherOptionType(option.optionType))];
    case "Synthetic":
      return [optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(0), "Call"), optionLeg(option, shortSide, buy ? -quantity : quantity, option.expiration, strike(0), "Put")];
    case "Covered":
      return [stockLeg(option, longSide, buy ? quantity : -quantity), optionLeg(option, shortSide, buy ? -quantity : quantity, option.expiration, strike(0), "Call")];
    case "Calendar":
      return [optionLeg(option, longSide, buy ? quantity : -quantity, otherExpiration(symbol, option.expiration), strike(0), option.optionType), optionLeg(option, shortSide, buy ? -quantity : quantity, option.expiration, strike(0), option.optionType)];
    case "Diagonal":
      return [optionLeg(option, longSide, buy ? quantity : -quantity, otherExpiration(symbol, option.expiration), strike(0), option.optionType), optionLeg(option, shortSide, buy ? -quantity : quantity, option.expiration, strike(.5), option.optionType)];
    case "Butterfly":
      return [optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(0), option.optionType), optionLeg(option, shortSide, buy ? -quantity * 2 : quantity * 2, option.expiration, strike(.5), option.optionType), optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(1), option.optionType)];
    case "Condor":
      return [0, 1, 2, 3].map((index) => optionLeg(option, index === 0 || index === 3 ? longSide : shortSide, index === 0 || index === 3 ? buy ? quantity : -quantity : buy ? -quantity : quantity, option.expiration, strike(index * .5), option.optionType));
    case "Iron Condor":
      return [optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(0), "Put"), optionLeg(option, shortSide, buy ? -quantity : quantity, option.expiration, strike(.5), "Put"), optionLeg(option, shortSide, buy ? -quantity : quantity, option.expiration, strike(1), "Call"), optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(1.5), "Call")];
    case "Custom":
      return [optionLeg(option, longSide, buy ? quantity : -quantity, option.expiration, strike(0), option.optionType), optionLeg(option, shortSide, buy ? -quantity : quantity, option.expiration, strike(.5), otherOptionType(option.optionType))];
  }
};

const sameLeg = (actual: StrategyLeg, expected: StrategyLeg) => actual.instrument === expected.instrument && actual.side === expected.side && Number(actual.quantity) === Number(expected.quantity) && actual.expiration === expected.expiration && actual.strike === expected.strike && actual.optionType === expected.optionType;
export const strategyMatches = (name: StrategyName, legs: StrategyLeg[], symbol: string) => {
  if (name === "Custom" || name === "Combo") return true;
  const expected = createStrategyLegs(name, legs[0], symbol);
  return legs.length === expected.length && legs.every((leg, index) => sameLeg(leg, expected[index]));
};
