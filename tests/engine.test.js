"use strict";

const assert = require("node:assert/strict");
const Data = require("../js/data.js");
const Engine = require("../js/engine.js");

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("✓ " + name);
  } catch (error) {
    console.error("✗ " + name);
    throw error;
  }
}

function approx(actual, expected, tolerance = 0.02) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

function game(mode = "classic", deposit = 10000000) {
  return Engine.createGame(mode, deposit, 1735689600000, () => 0.5);
}

function open(state, overrides = {}) {
  const result = Engine.openPosition(state, {
    symbol: "USD/JPY",
    side: "long",
    margin: 1000000,
    leverage: 100,
    ...overrides
  });
  assert.equal(result.ok, true);
  return result.position;
}

test("new game preserves the ¥100m total and locks the selected mode", () => {
  const state = game("risk", 25000000);
  assert.equal(state.mode, "risk");
  assert.equal(state.wallet, 75000000);
  assert.equal(state.balance, 25000000);
  assert.equal(Engine.accountTotals(state).netWorth, 100000000);
  assert.equal(Object.keys(state.markets).length, 10);
});

test("opening a position reserves isolated margin and calculates base units", () => {
  const state = game();
  const position = open(state);
  assert.equal(state.balance, 9000000);
  assert.equal(state.positions.length, 1);
  approx(position.units * position.entryPrice, 100000000, 0.01);
  assert.equal(Engine.accountTotals(state).marginUsed, 1000000);
});

test("long P&L, profit-only fee and returned cash are calculated correctly", () => {
  const state = game();
  const position = open(state);
  state.markets["USD/JPY"].price = position.entryPrice + 1;
  const expectedGross = position.units;
  approx(Engine.calculatePnl(position, Engine.currentPrices(state)), expectedGross);
  const result = Engine.closePosition(state, position.id, "manual");
  assert.equal(result.ok, true);
  approx(result.trade.grossPnl, expectedGross);
  approx(result.trade.fee, expectedGross * 0.005);
  approx(result.trade.netPnl, expectedGross * 0.995);
  approx(state.balance, 9000000 + 1000000 + expectedGross * 0.995);
});

test("losing trades pay no fee", () => {
  const state = game();
  const position = open(state);
  state.markets["USD/JPY"].price = position.entryPrice - 0.1;
  const result = Engine.closePosition(state, position.id, "manual");
  assert.ok(result.trade.grossPnl < 0);
  assert.equal(result.trade.fee, 0);
  assert.equal(result.trade.netPnl, result.trade.grossPnl);
});

test("short positions profit when price falls", () => {
  const state = game();
  const position = open(state, { side: "short" });
  state.markets["USD/JPY"].price = position.entryPrice - 1;
  approx(Engine.calculatePnl(position, Engine.currentPrices(state)), position.units);
});

test("liquidation price corresponds to a full margin loss", () => {
  const state = game();
  const position = open(state);
  const prices = Engine.currentPrices(state);
  const liquidation = Engine.liquidationPrice(position, prices);
  prices["USD/JPY"] = liquidation;
  approx(Engine.calculatePnl(position, prices), -1000000, 0.05);
});

test("USD-quoted pairs convert P&L using current USD/JPY", () => {
  const state = game();
  const position = open(state, { symbol: "EUR/USD", margin: 1000000, leverage: 10 });
  const prices = Engine.currentPrices(state);
  prices["EUR/USD"] += 0.01;
  const expected = position.units * 0.01 * prices["USD/JPY"];
  approx(Engine.calculatePnl(position, prices), expected);
});

test("invalid leverage and excessive margin are rejected", () => {
  const state = game();
  assert.equal(Engine.openPosition(state, { symbol: "USD/JPY", side: "long", margin: 1000, leverage: 1001 }).ok, false);
  assert.equal(Engine.openPosition(state, { symbol: "USD/JPY", side: "long", margin: 10000001, leverage: 10 }).error, "insufficientBalance");
  assert.equal(state.positions.length, 0);
});

test("wallet and trading transfers work in both directions", () => {
  const state = game();
  assert.equal(Engine.transfer(state, "deposit", 5000000).ok, true);
  assert.equal(state.wallet, 85000000);
  assert.equal(state.balance, 15000000);
  assert.equal(Engine.transfer(state, "withdraw", 2000000).ok, true);
  assert.equal(state.wallet, 87000000);
  assert.equal(state.balance, 13000000);
  assert.equal(Engine.accountTotals(state).netWorth, 100000000);
});

test("risk mode validates long stop-loss and take-profit levels", () => {
  const state = game("risk");
  const position = open(state);
  const current = position.entryPrice;
  assert.equal(Engine.setRiskLevels(state, position.id, current + 1, null).error, "longStopBelow");
  assert.equal(Engine.setRiskLevels(state, position.id, null, current - 1).error, "longTakeAbove");
  assert.equal(Engine.setRiskLevels(state, position.id, current - 1, current + 1).ok, true);
});

test("classic mode rejects stop-loss and take-profit settings", () => {
  const state = game("classic");
  const position = open(state);
  assert.equal(Engine.setRiskLevels(state, position.id, 1, 1000).error, "riskModeOnly");
});

test("take-profit automatically closes a risk-mode position", () => {
  const state = game("risk");
  const position = open(state);
  const current = position.entryPrice;
  Engine.setRiskLevels(state, position.id, current - 1, current + 1);
  state.markets["USD/JPY"].price = current + 1;
  const closed = Engine.checkAutoClose(state);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].trade.reason, "takeProfit");
  assert.equal(state.positions.length, 0);
});

test("a full margin loss triggers isolated liquidation", () => {
  const state = game();
  const position = open(state);
  state.markets["USD/JPY"].price = Engine.liquidationPrice(position, Engine.currentPrices(state));
  const closed = Engine.checkAutoClose(state);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].trade.reason, "liquidation");
  approx(state.balance, 9000000, 1);
  assert.equal(state.positions.length, 0);
});

test("a position cannot lose more than its isolated margin", () => {
  const state = game();
  const position = open(state, { leverage: 500 });
  state.markets["USD/JPY"].price = 0.001;
  const result = Engine.closePosition(state, position.id, "manual");
  assert.equal(result.trade.grossPnl, -1000000);
  assert.equal(result.trade.returned, 0);
});

test("30 simulated seconds create a new candle", () => {
  const state = game();
  const symbol = "USD/JPY";
  const initialCount = state.markets[symbol].candles.length;
  for (let index = 0; index < 29; index += 1) Engine.tick(state, () => 0.5);
  assert.equal(state.markets[symbol].candles.length, initialCount);
  assert.equal(state.markets[symbol].currentCandle.ticks, 29);
  Engine.tick(state, () => 0.5);
  assert.equal(state.markets[symbol].candles.length, initialCount + 1);
  assert.equal(state.markets[symbol].currentCandle.ticks, 0);
});

test("session settlement closes every remaining position and records history", () => {
  const state = game();
  open(state);
  open(state, { symbol: "EUR/USD", side: "short" });
  const results = Engine.closeAllPositions(state, "session");
  assert.equal(results.length, 2);
  assert.equal(state.positions.length, 0);
  assert.equal(state.history.length, 2);
  assert.ok(state.history.every((trade) => trade.reason === "session"));
});

test("statistics include wins, fees, net P&L and liquidations", () => {
  const state = game();
  const first = open(state);
  state.markets["USD/JPY"].price = first.entryPrice + 1;
  Engine.closePosition(state, first.id, "manual");
  const second = open(state);
  state.markets["USD/JPY"].price = Engine.liquidationPrice(second, Engine.currentPrices(state));
  Engine.checkAutoClose(state);
  const stats = Engine.statistics(state);
  assert.equal(stats.trades, 2);
  assert.equal(stats.wins, 1);
  assert.equal(stats.liquidations, 1);
  assert.ok(stats.fees > 0);
  assert.equal(stats.winRate, 50);
});

test("1000× leverage is accepted and calculates the corresponding notional", () => {
  const state = game();
  const position = open(state, { leverage: 1000 });
  assert.equal(position.leverage, 1000);
  approx(position.units * position.entryPrice, 1000000000, 0.01);
});

test("selected starting capital controls wallet and trading allocation", () => {
  const state = Engine.createGame("classic", 3000000, 1735689600000, () => 0.5, 20000000);
  assert.equal(state.startingCash, 20000000);
  assert.equal(state.wallet, 17000000);
  assert.equal(state.balance, 3000000);
  assert.equal(Engine.accountTotals(state).netWorth, 20000000);
});

test("new games randomly select a historical snapshot for all ten pairs", () => {
  const state = Engine.createGame("classic", 1000000, 1735689600000, () => 0.999999, 10000000);
  const selected = Data.snapshots[Data.snapshots.length - 1];
  assert.equal(state.snapshotDate, selected.date);
  Data.pairs.forEach((pair) => {
    const expected = Engine.roundPrice(Data.priceAtSnapshot(pair.symbol, selected), pair.precision);
    assert.equal(state.markets[pair.symbol].initialPrice, expected);
  });
});

test("CNY-quoted HKD positions convert P&L to JPY", () => {
  const state = game();
  const position = open(state, { symbol: "HKD/CNY", margin: 1000000, leverage: 10 });
  const prices = Engine.currentPrices(state);
  prices["HKD/CNY"] += 0.01;
  const conversion = prices["HKD/JPY"] / prices["HKD/CNY"];
  const expected = position.units * 0.01 * conversion;
  approx(Engine.calculatePnl(position, prices), expected);
});

test("version 1 saves migrate with HKD markets and preserve existing funds", () => {
  const state = game();
  state.version = 1;
  delete state.startingCash;
  delete state.snapshotDate;
  ["HKD/CNY", "HKD/USD", "HKD/JPY"].forEach((symbol) => delete state.markets[symbol]);
  const balance = state.balance;
  Engine.migrateState(state);
  assert.equal(state.version, 4);
  assert.equal(state.startingCash, 100000000);
  assert.deepEqual(state.loans, []);
  assert.equal(state.status, "playing");
  assert.equal(state.balance, balance);
  assert.equal(Object.keys(state.markets).length, 10);
});

test("the snapshot library contains exactly 20 ECB reference dates", () => {
  assert.equal(Data.snapshots.length, 20);
  assert.equal(new Set(Data.snapshots.map((item) => item.date)).size, 20);
});

test("borrowing preserves net worth and enforces the ¥500m principal limit", () => {
  const state = game();
  const result = Engine.borrowLoan(state, 500000000);
  assert.equal(result.ok, true);
  assert.equal(state.wallet, 590000000);
  assert.equal(Engine.loanTotals(state).debt, 500000000);
  assert.equal(Engine.accountTotals(state).netWorth, 100000000);
  assert.equal(Engine.borrowLoan(state, 1000).error, "loanLimitExceeded");
});

test("loan debt compounds by 10% every 120 simulated seconds", () => {
  const state = game();
  Engine.borrowLoan(state, 1000000);
  state.simTime += 120000;
  let result = Engine.processLoans(state);
  assert.equal(result.interestCount, 1);
  assert.equal(Engine.loanTotals(state).interest, 100000);
  state.simTime += 120000;
  result = Engine.processLoans(state);
  assert.equal(result.interestCount, 1);
  assert.equal(Engine.loanTotals(state).interest, 210000);
  assert.equal(Engine.loanTotals(state).debt, 1210000);
});

test("repayments pay interest first and release principal credit", () => {
  const state = game();
  Engine.borrowLoan(state, 1000000);
  state.simTime += 120000;
  Engine.processLoans(state);
  assert.equal(Engine.repayDebt(state, 100000).ok, true);
  assert.equal(Engine.loanTotals(state).interest, 0);
  assert.equal(Engine.loanTotals(state).principal, 1000000);
  assert.equal(Engine.repayDebt(state, 200000).ok, true);
  assert.equal(Engine.loanTotals(state).principal, 800000);
  assert.equal(Engine.loanTotals(state).availableCredit, 499200000);
});

test("loan repayment uses wallet cash before available trading cash", () => {
  const state = game();
  Engine.borrowLoan(state, 1000000);
  Engine.transfer(state, "deposit", 91000000);
  assert.equal(state.wallet, 0);
  const result = Engine.repayDebt(state, 100000);
  assert.equal(result.ok, true);
  assert.equal(state.balance, 100900000);
  assert.equal(Engine.loanTotals(state).debt, 900000);
});

test("maturity closes positions and automatically repays affordable debt", () => {
  const state = game();
  Engine.borrowLoan(state, 1000000);
  open(state);
  state.simTime += 600000;
  const result = Engine.processLoans(state);
  assert.equal(result.interestCount, 5);
  assert.equal(result.closedPositions, 1);
  assert.deepEqual(result.settledLoanIds, [1]);
  assert.equal(result.gameOver, false);
  assert.equal(state.status, "playing");
  assert.equal(state.loans.length, 0);
  assert.equal(state.positions.length, 0);
  assert.equal(state.history[0].reason, "debtSettlement");
});

test("unaffordable debt at 600 seconds ends the game", () => {
  const state = game();
  Engine.borrowLoan(state, 500000000);
  state.simTime += 599000;
  Engine.processLoans(state);
  assert.equal(state.status, "playing");
  state.simTime += 1000;
  const result = Engine.processLoans(state);
  assert.equal(result.interestCount, 1);
  assert.equal(result.gameOver, true);
  assert.equal(state.status, "gameOver");
  assert.equal(state.gameOverReason, "debtDefault");
  assert.equal(state.gameOverDebt, 805255000);
  assert.equal(Engine.openPosition(state, { symbol: "USD/JPY", side: "long", margin: 1000, leverage: 10 }).error, "gameOver");
});

test("available cash below the minimum margin ends the game only when debt remains", () => {
  const state = game();
  state.wallet = 0;
  state.balance = 99;
  assert.equal(Engine.checkCriticalFunds(state).gameOver, false);
  Engine.borrowLoan(state, 1000);
  state.wallet = 0;
  state.balance = 99;
  const result = Engine.checkCriticalFunds(state);
  assert.equal(result.gameOver, true);
  assert.equal(state.gameOverReason, "insufficientFunds");
  assert.equal(state.gameOverCash, 99);
  assert.equal(state.gameOverDebt, 1000);
});

test("available cash exactly at the minimum margin does not end the game", () => {
  const state = game();
  Engine.borrowLoan(state, 1000);
  state.wallet = 0;
  state.balance = 100;
  assert.equal(Engine.checkCriticalFunds(state).gameOver, false);
  assert.equal(state.status, "playing");
});

test("bankruptcy checks include open-position equity before declaring failure", () => {
  const state = game();
  Engine.borrowLoan(state, 1000);
  const position = open(state, { margin: 1000 });
  state.wallet = 0;
  state.balance = 0;
  let result = Engine.checkCriticalFunds(state);
  assert.equal(result.gameOver, false);
  assert.equal(result.positionEquity, 1000);
  assert.equal(result.liquidFunds, 1000);
  state.markets["USD/JPY"].price = Engine.liquidationPrice(position, Engine.currentPrices(state));
  Engine.checkAutoClose(state);
  result = Engine.checkCriticalFunds(state);
  assert.equal(result.gameOver, true);
  assert.equal(result.positionEquity, 0);
  assert.equal(result.liquidFunds, 0);
});

test("loan limits follow the seven starting-capital tiers", () => {
  const cases = [
    [300000, 3000000],
    [3000000, 30000000],
    [10000000, 50000000],
    [20000000, 80000000],
    [50000000, 150000000],
    [100000000, 500000000],
    [200000000, 1000000000]
  ];
  cases.forEach(([capital, limit]) => {
    const state = Engine.createGame("classic", Math.min(1000000, capital), 1735689600000, () => 0.5, capital);
    assert.equal(Engine.loanLimit(state), limit);
    assert.equal(Engine.loanTotals(state).availableCredit, limit);
  });
  const small = Engine.createGame("classic", 1000000, 1735689600000, () => 0.5, 3000000);
  assert.equal(Engine.borrowLoan(small, 30000000).ok, true);
  assert.equal(Engine.borrowLoan(small, 1000).error, "loanLimitExceeded");
});

test("older loan saves migrate to 120-second interest and 600-second maturity", () => {
  const state = game();
  const loan = Engine.borrowLoan(state, 1000000).loan;
  state.simTime += 130000;
  loan.nextInterestAt = loan.borrowedAt + 300000;
  loan.dueAt = loan.borrowedAt + 1500000;
  state.version = 3;
  Engine.migrateState(state);
  assert.equal(state.version, 4);
  assert.equal(loan.nextInterestAt, loan.borrowedAt + 240000);
  assert.equal(loan.dueAt, loan.borrowedAt + 600000);
});

test("JPY/AUD converts AUD-denominated P&L back to JPY", () => {
  const state = game();
  const position = open(state, { symbol: "JPY/AUD", margin: 1000000, leverage: 10 });
  const prices = Engine.currentPrices(state);
  const entry = prices["JPY/AUD"];
  prices["JPY/AUD"] = entry * 1.01;
  const expected = position.units * (prices["JPY/AUD"] - entry) / prices["JPY/AUD"];
  approx(Engine.calculatePnl(position, prices), expected);
});

test("additional margin moves long liquidation down and short liquidation up", () => {
  const longState = game();
  const longPosition = open(longState);
  const oldLongLine = Engine.liquidationPrice(longPosition, Engine.currentPrices(longState));
  const added = Engine.addMargin(longState, longPosition.id, 500000);
  assert.equal(added.ok, true);
  assert.equal(longPosition.margin, 1500000);
  assert.equal(longState.balance, 8500000);
  assert.ok(Engine.liquidationPrice(longPosition, Engine.currentPrices(longState)) < oldLongLine);

  const shortState = game();
  const shortPosition = open(shortState, { side: "short" });
  const oldShortLine = Engine.liquidationPrice(shortPosition, Engine.currentPrices(shortState));
  assert.equal(Engine.addMargin(shortState, shortPosition.id, 500000).ok, true);
  assert.ok(Engine.liquidationPrice(shortPosition, Engine.currentPrices(shortState)) > oldShortLine);
});

test("rescue money is interest-free, restores play, and is repaid last", () => {
  const state = game();
  const normalLoan = Engine.borrowLoan(state, 1000000).loan;
  state.status = "gameOver";
  state.wallet = 0;
  const rescue = Engine.stealMoney(state);
  assert.equal(rescue.ok, true);
  assert.equal(state.status, "playing");
  assert.equal(state.wallet, 3000000);
  assert.equal(rescue.loan.noInterest, true);
  assert.equal(rescue.loan.lowestPriority, true);
  assert.equal(Engine.repayDebt(state, 1000000).ok, true);
  assert.equal(state.loans.some((loan) => loan.id === normalLoan.id), false);
  assert.equal(rescue.loan.principal, 3000000);
  state.simTime += 10000000;
  const result = Engine.processLoans(state);
  assert.equal(result.interestCount, 0);
  assert.equal(rescue.loan.interest, 0);
  assert.equal(rescue.loan.dueAt, null);
});

test("rescue is limited to once per run even after full repayment", () => {
  const state = game();
  state.status = "gameOver";
  assert.equal(Engine.stealMoney(state).ok, true);
  assert.equal(state.rescueUsed, true);
  assert.equal(Engine.repayDebt(state, 3000000).ok, true);
  assert.equal(state.loans.length, 0);
  state.status = "gameOver";
  const second = Engine.stealMoney(state);
  assert.equal(second.ok, false);
  assert.equal(second.error, "rescueAlreadyUsed");
  assert.equal(state.loans.length, 0);
  assert.equal(state.rescueUsed, true);
});

console.log(`\n${passed} tests passed.`);
