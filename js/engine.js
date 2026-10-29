(function (root) {
  "use strict";

  const isNode = typeof module !== "undefined" && module.exports;
  const Data = isNode ? require("./data.js") : root.FXData;

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function roundPrice(value, precision) {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
  }

  function pairBySymbol(symbol, pairs) {
    const pair = (pairs || Data.pairs).find((item) => item.symbol === symbol);
    if (!pair) throw new Error("Unknown currency pair: " + symbol);
    return pair;
  }

  function quoteInJpy(pair, prices) {
    if (pair.quote === "JPY") return 1;
    if (pair.quote === "USD") return prices["USD/JPY"];
    if (pair.quote === "CNY") return prices["HKD/JPY"] / prices["HKD/CNY"];
    if (pair.quote === "AUD") return 1 / prices["JPY/AUD"];
    throw new Error("Unsupported quote currency: " + pair.quote);
  }

  function currentPrices(state) {
    const prices = {};
    Object.keys(state.markets).forEach((symbol) => {
      prices[symbol] = state.markets[symbol].price;
    });
    return prices;
  }

  function calculatePnl(position, prices, pairs) {
    const pair = pairBySymbol(position.symbol, pairs);
    const price = prices[position.symbol];
    const conversion = quoteInJpy(pair, prices);
    const direction = position.side === "long" ? 1 : -1;
    const raw = direction * (price - position.entryPrice) * position.units * conversion;
    return Math.max(raw, -position.margin);
  }

  function calculateNotional(position, prices, pairs) {
    const pair = pairBySymbol(position.symbol, pairs);
    return position.units * prices[position.symbol] * quoteInJpy(pair, prices);
  }

  function liquidationPrice(position, prices, pairs) {
    const pair = pairBySymbol(position.symbol, pairs);
    const conversion = quoteInJpy(pair, prices);
    const distance = (Data.liquidationLossRate * position.margin) / (position.units * conversion);
    const price = position.side === "long"
      ? position.entryPrice - distance
      : position.entryPrice + distance;
    return Math.max(0, price);
  }

  function normalRandom(rng) {
    const u = Math.max(rng(), Number.EPSILON);
    const v = Math.max(rng(), Number.EPSILON);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function makeHistoricalCandles(pair, now, rng) {
    const candles = [];
    let price = pair.initial;
    const count = 70;
    let candleTime = now - count * Data.candleSeconds * 1000;

    for (let index = 0; index < count; index += 1) {
      const open = price;
      let high = price;
      let low = price;
      for (let tick = 0; tick < Data.candleSeconds; tick += 1) {
        const cycle = Math.sin((index + tick / Data.candleSeconds) / 8) * pair.volatility * 0.035;
        price *= Math.exp(cycle + normalRandom(rng) * pair.volatility * 0.55);
        high = Math.max(high, price);
        low = Math.min(low, price);
      }
      candles.push({
        time: candleTime,
        open,
        high,
        low,
        close: price,
        ticks: Data.candleSeconds
      });
      candleTime += Data.candleSeconds * 1000;
    }

    const scale = pair.initial / price;
    candles.forEach((candle) => {
      candle.open = roundPrice(candle.open * scale, pair.precision);
      candle.high = roundPrice(candle.high * scale, pair.precision);
      candle.low = roundPrice(candle.low * scale, pair.precision);
      candle.close = roundPrice(candle.close * scale, pair.precision);
    });
    candles[candles.length - 1].close = roundPrice(pair.initial, pair.precision);
    return candles;
  }

  function createMarket(pair, now, rng) {
    const initial = roundPrice(pair.initial, pair.precision);
    return {
      price: initial,
      initialPrice: initial,
      candles: makeHistoricalCandles(pair, now, rng),
      currentCandle: {
        time: now,
        open: initial,
        high: initial,
        low: initial,
        close: initial,
        ticks: 0
      },
      trend: { direction: 0, remaining: 0 }
    };
  }

  function createGame(mode, initialDeposit, now, rng, startingCash) {
    if (!["classic", "risk"].includes(mode)) throw new Error("Invalid game mode");
    const cash = roundMoney(Number(startingCash === undefined ? Data.startingCash : startingCash));
    const deposit = roundMoney(Number(initialDeposit));
    if (!Number.isFinite(cash) || cash <= 0) throw new Error("Invalid starting cash");
    if (!Number.isFinite(deposit) || deposit < 0 || deposit > cash) {
      throw new Error("Invalid initial deposit");
    }
    const random = rng || Math.random;
    const timestamp = now || Date.now();
    const selectedSnapshot = Data.snapshots[Math.floor(random() * Data.snapshots.length)];
    const markets = {};
    Data.pairs.forEach((pair) => {
      const snapshotPair = Object.assign({}, pair, { initial: Data.priceAtSnapshot(pair.symbol, selectedSnapshot) });
      markets[pair.symbol] = createMarket(snapshotPair, timestamp, random);
    });
    return {
      version: 4,
      mode,
      startingCash: cash,
      snapshotDate: selectedSnapshot.date,
      wallet: roundMoney(cash - deposit),
      balance: deposit,
      positions: [],
      history: [],
      loans: [],
      nextLoanId: 1,
      rescueUsed: false,
      status: "playing",
      gameOverReason: null,
      gameOverAt: null,
      gameOverDebt: 0,
      gameOverCash: 0,
      markets,
      selectedSymbol: "USD/JPY",
      nextPositionId: 1,
      nextTradeId: 1,
      tick: 0,
      simTime: timestamp,
      createdAt: timestamp,
      speed: 1,
      paused: false,
      language: "zh"
    };
  }

  function migrateState(state) {
    const previousVersion = Number(state.version) || 1;
    state.startingCash = Number(state.startingCash) || Data.startingCash;
    state.snapshotDate = state.snapshotDate || Data.snapshot.date;
    const savedSnapshot = Data.snapshots.find((item) => item.date === state.snapshotDate) || Data.snapshot;
    Data.pairs.forEach((pair) => {
      if (!state.markets[pair.symbol]) {
        const snapshotPair = Object.assign({}, pair, { initial: Data.priceAtSnapshot(pair.symbol, savedSnapshot) });
        state.markets[pair.symbol] = createMarket(snapshotPair, state.simTime || Date.now(), Math.random);
      }
    });
    state.loans = Array.isArray(state.loans) ? state.loans : [];
    state.nextLoanId = Number(state.nextLoanId) || 1;
    state.rescueUsed = Boolean(state.rescueUsed);
    state.status = state.status || "playing";
    state.gameOverReason = state.gameOverReason || null;
    state.gameOverAt = state.gameOverAt || null;
    state.gameOverDebt = Number(state.gameOverDebt) || 0;
    state.gameOverCash = Number(state.gameOverCash) || 0;
    if (previousVersion < 4) {
      state.loans.forEach((loan) => {
        loan.borrowedAt = Number(loan.borrowedAt) || state.simTime;
        const elapsed = Math.max(0, state.simTime - loan.borrowedAt);
        const intervals = Math.floor(elapsed / (Data.loanInterestInterval * 1000));
        loan.nextInterestAt = loan.borrowedAt + (intervals + 1) * Data.loanInterestInterval * 1000;
        loan.dueAt = loan.borrowedAt + Data.loanTerm * 1000;
      });
    }
    state.version = 4;
    return state;
  }

  function openPosition(state, order) {
    if (state.status === "gameOver") return { ok: false, error: "gameOver" };
    const pair = pairBySymbol(order.symbol);
    const margin = roundMoney(Number(order.margin));
    const leverage = Math.floor(Number(order.leverage));
    if (!["long", "short"].includes(order.side)) return { ok: false, error: "invalidSide" };
    if (!Number.isFinite(margin) || margin < Data.minTradeMargin) return { ok: false, error: "invalidMargin" };
    if (margin > state.balance) return { ok: false, error: "insufficientBalance" };
    if (!Number.isFinite(leverage) || leverage < 1 || leverage > Data.maxLeverage) {
      return { ok: false, error: "invalidLeverage" };
    }

    const prices = currentPrices(state);
    const entryPrice = prices[order.symbol];
    const conversion = quoteInJpy(pair, prices);
    const units = (margin * leverage) / (entryPrice * conversion);
    const position = {
      id: state.nextPositionId++,
      symbol: order.symbol,
      side: order.side,
      margin,
      leverage,
      units,
      entryPrice,
      entryQuoteJpy: conversion,
      openTime: state.simTime,
      stopLoss: null,
      takeProfit: null
    };
    state.balance = roundMoney(state.balance - margin);
    state.positions.push(position);
    return { ok: true, position };
  }

  function addMargin(state, positionId, rawAmount) {
    if (state.status === "gameOver") return { ok: false, error: "gameOver" };
    const position = state.positions.find((item) => item.id === Number(positionId));
    if (!position) return { ok: false, error: "positionNotFound" };
    const amount = roundMoney(Number(rawAmount));
    if (!Number.isFinite(amount) || amount < Data.minTradeMargin) return { ok: false, error: "invalidMargin" };
    if (amount > state.balance) return { ok: false, error: "insufficientBalance" };
    state.balance = roundMoney(state.balance - amount);
    position.margin = roundMoney(position.margin + amount);
    return { ok: true, position, amount };
  }

  function closePosition(state, positionId, reason) {
    const index = state.positions.findIndex((position) => position.id === Number(positionId));
    if (index < 0) return { ok: false, error: "positionNotFound" };
    const position = state.positions[index];
    const prices = currentPrices(state);
    const exitPrice = prices[position.symbol];
    const grossPnl = roundMoney(calculatePnl(position, prices));
    const fee = roundMoney(Math.max(0, grossPnl) * Data.feeRate);
    const returned = roundMoney(Math.max(0, position.margin + grossPnl - fee));
    const trade = {
      id: state.nextTradeId++,
      positionId: position.id,
      symbol: position.symbol,
      side: position.side,
      margin: position.margin,
      leverage: position.leverage,
      units: position.units,
      entryPrice: position.entryPrice,
      exitPrice,
      grossPnl,
      fee,
      netPnl: roundMoney(grossPnl - fee),
      returned,
      openTime: position.openTime,
      closeTime: state.simTime,
      reason: reason || "manual"
    };
    state.balance = roundMoney(state.balance + returned);
    state.positions.splice(index, 1);
    state.history.unshift(trade);
    if (state.history.length > Data.maxHistory) state.history.length = Data.maxHistory;
    return { ok: true, trade };
  }

  function closeAllPositions(state, reason) {
    const ids = state.positions.map((position) => position.id);
    return ids.map((id) => closePosition(state, id, reason)).filter((result) => result.ok);
  }

  function transfer(state, direction, rawAmount) {
    if (state.status === "gameOver") return { ok: false, error: "gameOver" };
    const amount = roundMoney(Number(rawAmount));
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "invalidTransfer" };
    if (direction === "deposit") {
      if (amount > state.wallet) return { ok: false, error: "insufficientWallet" };
      state.wallet = roundMoney(state.wallet - amount);
      state.balance = roundMoney(state.balance + amount);
    } else if (direction === "withdraw") {
      if (amount > state.balance) return { ok: false, error: "insufficientBalance" };
      state.balance = roundMoney(state.balance - amount);
      state.wallet = roundMoney(state.wallet + amount);
    } else {
      return { ok: false, error: "invalidTransfer" };
    }
    return { ok: true };
  }

  function loanLimit(state) {
    return Data.loanLimitsByCapital[state.startingCash] || Data.maxLoanPrincipal;
  }

  function loanTotals(state) {
    const loans = Array.isArray(state.loans) ? state.loans : [];
    const principal = roundMoney(loans.reduce((sum, loan) => sum + loan.principal, 0));
    const interest = roundMoney(loans.reduce((sum, loan) => sum + loan.interest, 0));
    const activeTimes = loans.map((loan) => loan.dueAt).filter(Number.isFinite);
    const interestTimes = loans.map((loan) => loan.nextInterestAt).filter(Number.isFinite);
    return {
      principal,
      interest,
      debt: roundMoney(principal + interest),
      availableCredit: roundMoney(Math.max(0, loanLimit(state) - principal)),
      nextDueAt: activeTimes.length ? Math.min(...activeTimes) : null,
      nextInterestAt: interestTimes.length ? Math.min(...interestTimes) : null
    };
  }

  function checkCriticalFunds(state) {
    if (state.status === "gameOver") {
      return { gameOver: true, reason: state.gameOverReason, existing: true };
    }
    const cash = roundMoney(state.wallet + state.balance);
    const prices = currentPrices(state);
    const positionEquity = roundMoney(state.positions.reduce(
      (sum, position) => sum + position.margin + calculatePnl(position, prices),
      0
    ));
    const liquidFunds = roundMoney(cash + positionEquity);
    const debt = loanTotals(state).debt;
    if (debt > 0 && liquidFunds < Data.minTradeMargin) {
      state.status = "gameOver";
      state.gameOverReason = "insufficientFunds";
      state.gameOverAt = state.simTime;
      state.gameOverDebt = debt;
      state.gameOverCash = liquidFunds;
      return { gameOver: true, reason: "insufficientFunds", cash, positionEquity, liquidFunds, debt };
    }
    return { gameOver: false, cash, positionEquity, liquidFunds, debt };
  }

  function borrowLoan(state, rawAmount) {
    if (state.status === "gameOver") return { ok: false, error: "gameOver" };
    const amount = roundMoney(Number(rawAmount));
    if (!Number.isFinite(amount) || amount < 1000) return { ok: false, error: "invalidLoanAmount" };
    const totals = loanTotals(state);
    if (amount > totals.availableCredit) return { ok: false, error: "loanLimitExceeded" };
    const loan = {
      id: state.nextLoanId++,
      principal: amount,
      interest: 0,
      borrowedAt: state.simTime,
      nextInterestAt: state.simTime + Data.loanInterestInterval * 1000,
      dueAt: state.simTime + Data.loanTerm * 1000
    };
    state.loans.push(loan);
    state.wallet = roundMoney(state.wallet + amount);
    return { ok: true, loan };
  }

  function stealMoney(state) {
    if (state.rescueUsed) return { ok: false, error: "rescueAlreadyUsed" };
    if (state.status !== "gameOver") return { ok: false, error: "rescueUnavailable" };
    const amount = 3000000;
    const loan = {
      id: state.nextLoanId++,
      principal: amount,
      interest: 0,
      borrowedAt: state.simTime,
      nextInterestAt: null,
      dueAt: null,
      noInterest: true,
      lowestPriority: true,
      source: "kurumiFather"
    };
    state.loans.push(loan);
    state.wallet = roundMoney(state.wallet + amount);
    state.rescueUsed = true;
    state.status = "playing";
    state.gameOverReason = null;
    state.gameOverAt = null;
    state.gameOverDebt = 0;
    state.gameOverCash = 0;
    return { ok: true, loan, amount };
  }

  function repayDebt(state, rawAmount) {
    if (state.status === "gameOver") return { ok: false, error: "gameOver" };
    if (!state.loans.length) return { ok: false, error: "noDebt" };
    const requested = roundMoney(Number(rawAmount));
    if (!Number.isFinite(requested) || requested <= 0) return { ok: false, error: "invalidRepayment" };
    const available = roundMoney(state.wallet + state.balance);
    if (requested > available) return { ok: false, error: "insufficientRepayment" };
    let remaining = Math.min(requested, loanTotals(state).debt);
    const target = remaining;
    const orderedLoans = state.loans.slice().sort((a, b) => {
      const aPriority = a.noInterest || a.lowestPriority ? 1 : 0;
      const bPriority = b.noInterest || b.lowestPriority ? 1 : 0;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aDue = Number.isFinite(a.dueAt) ? a.dueAt : Number.MAX_SAFE_INTEGER;
      const bDue = Number.isFinite(b.dueAt) ? b.dueAt : Number.MAX_SAFE_INTEGER;
      return aDue - bDue || a.id - b.id;
    });
    orderedLoans.forEach((loan) => {
      if (remaining <= 0) return;
      const debt = roundMoney(loan.principal + loan.interest);
      const payment = roundMoney(Math.min(remaining, debt));
      const interestPayment = Math.min(loan.interest, payment);
      loan.interest = roundMoney(loan.interest - interestPayment);
      const principalPayment = roundMoney(payment - interestPayment);
      loan.principal = roundMoney(Math.max(0, loan.principal - principalPayment));
      remaining = roundMoney(remaining - payment);
    });
    state.loans = state.loans.filter((loan) => loan.principal + loan.interest > 0.005);
    const paid = roundMoney(target - remaining);
    const walletPayment = roundMoney(Math.min(state.wallet, paid));
    state.wallet = roundMoney(state.wallet - walletPayment);
    state.balance = roundMoney(state.balance - (paid - walletPayment));
    return { ok: true, paid, remainingDebt: loanTotals(state).debt };
  }

  function processLoans(state) {
    const result = { interestCount: 0, closedPositions: 0, settledLoanIds: [], gameOver: false };
    if (state.status === "gameOver") return result;
    state.loans.forEach((loan) => {
      if (loan.noInterest) return;
      while (Number.isFinite(loan.nextInterestAt) && loan.nextInterestAt <= state.simTime) {
        const debt = loan.principal + loan.interest;
        loan.interest = roundMoney(debt * (1 + Data.loanInterestRate) - loan.principal);
        loan.nextInterestAt += Data.loanInterestInterval * 1000;
        result.interestCount += 1;
      }
    });
    const dueLoans = state.loans
      .filter((loan) => !loan.noInterest && Number.isFinite(loan.dueAt) && loan.dueAt <= state.simTime)
      .sort((a, b) => a.dueAt - b.dueAt || a.id - b.id);
    if (dueLoans.length && state.positions.length) {
      result.closedPositions = closeAllPositions(state, "debtSettlement").length;
    }
    for (const loan of dueLoans) {
      if (!state.loans.some((item) => item.id === loan.id)) continue;
      const debt = roundMoney(loan.principal + loan.interest);
      const available = roundMoney(state.wallet + state.balance);
      if (available >= debt) {
        const repayment = repayDebt(state, debt);
        if (repayment.ok) result.settledLoanIds.push(loan.id);
      } else {
        state.status = "gameOver";
        state.gameOverReason = "debtDefault";
        state.gameOverAt = state.simTime;
        state.gameOverDebt = debt;
        state.gameOverCash = available;
        result.gameOver = true;
        break;
      }
    }
    return result;
  }

  function setRiskLevels(state, positionId, stopLoss, takeProfit) {
    const position = state.positions.find((item) => item.id === Number(positionId));
    if (!position) return { ok: false, error: "positionNotFound" };
    if (state.mode !== "risk") return { ok: false, error: "riskModeOnly" };
    const price = state.markets[position.symbol].price;
    const sl = stopLoss === null || stopLoss === "" ? null : Number(stopLoss);
    const tp = takeProfit === null || takeProfit === "" ? null : Number(takeProfit);
    if ((sl !== null && (!Number.isFinite(sl) || sl <= 0)) ||
        (tp !== null && (!Number.isFinite(tp) || tp <= 0))) {
      return { ok: false, error: "invalidRiskPrice" };
    }
    if (position.side === "long") {
      if (sl !== null && sl >= price) return { ok: false, error: "longStopBelow" };
      if (tp !== null && tp <= price) return { ok: false, error: "longTakeAbove" };
    } else {
      if (sl !== null && sl <= price) return { ok: false, error: "shortStopAbove" };
      if (tp !== null && tp >= price) return { ok: false, error: "shortTakeBelow" };
    }
    position.stopLoss = sl;
    position.takeProfit = tp;
    return { ok: true };
  }

  function tickMarket(state, pair, rng) {
    const market = state.markets[pair.symbol];
    if (market.trend.remaining <= 0) {
      const selector = rng();
      market.trend.direction = selector < 0.45 ? 0 : selector < 0.725 ? 1 : -1;
      market.trend.remaining = 30 + Math.floor(rng() * 151);
    }
    market.trend.remaining -= 1;
    const drift = market.trend.direction * pair.volatility * 0.12;
    const shock = normalRandom(rng) * pair.volatility;
    const nextPrice = Math.max(
      Math.pow(10, -pair.precision),
      market.price * Math.exp(drift + shock)
    );
    const price = roundPrice(nextPrice, pair.precision);
    market.price = price;
    const candle = market.currentCandle;
    candle.high = Math.max(candle.high, price);
    candle.low = Math.min(candle.low, price);
    candle.close = price;
    candle.ticks += 1;
    if (candle.ticks >= Data.candleSeconds) {
      market.candles.push(candle);
      if (market.candles.length > Data.maxCandles) market.candles.shift();
      market.currentCandle = {
        time: state.simTime,
        open: price,
        high: price,
        low: price,
        close: price,
        ticks: 0
      };
    }
  }

  function tick(state, rng) {
    if (state.status === "gameOver") return;
    const random = rng || Math.random;
    state.tick += 1;
    state.simTime += 1000;
    Data.pairs.forEach((pair) => tickMarket(state, pair, random));
  }

  function checkAutoClose(state) {
    const closed = [];
    state.positions.slice().forEach((position) => {
      const price = state.markets[position.symbol].price;
      let reason = null;
      if (state.mode === "risk") {
        if (position.side === "long") {
          if (position.takeProfit !== null && price >= position.takeProfit) reason = "takeProfit";
          else if (position.stopLoss !== null && price <= position.stopLoss) reason = "stopLoss";
        } else {
          if (position.takeProfit !== null && price <= position.takeProfit) reason = "takeProfit";
          else if (position.stopLoss !== null && price >= position.stopLoss) reason = "stopLoss";
        }
      }
      if (!reason) {
        const pnl = calculatePnl(position, currentPrices(state));
        if (pnl <= -position.margin * Data.liquidationLossRate + 0.005) reason = "liquidation";
      }
      if (reason) closed.push(closePosition(state, position.id, reason));
    });
    return closed;
  }

  function accountTotals(state) {
    const prices = currentPrices(state);
    const marginUsed = state.positions.reduce((sum, position) => sum + position.margin, 0);
    const unrealized = state.positions.reduce(
      (sum, position) => sum + calculatePnl(position, prices),
      0
    );
    const tradingEquity = state.balance + marginUsed + unrealized;
    const debt = loanTotals(state);
    return {
      wallet: state.wallet,
      balance: state.balance,
      marginUsed,
      unrealized,
      tradingEquity,
      loanPrincipal: debt.principal,
      loanInterest: debt.interest,
      debt: debt.debt,
      netWorth: state.wallet + tradingEquity - debt.debt
    };
  }

  function statistics(state) {
    const wins = state.history.filter((trade) => trade.netPnl > 0).length;
    const losses = state.history.filter((trade) => trade.netPnl < 0).length;
    return {
      trades: state.history.length,
      wins,
      losses,
      winRate: state.history.length ? (wins / state.history.length) * 100 : 0,
      realized: state.history.reduce((sum, trade) => sum + trade.netPnl, 0),
      fees: state.history.reduce((sum, trade) => sum + trade.fee, 0),
      liquidations: state.history.filter((trade) => trade.reason === "liquidation").length
    };
  }

  const api = {
    roundMoney,
    roundPrice,
    pairBySymbol,
    quoteInJpy,
    currentPrices,
    calculatePnl,
    calculateNotional,
    liquidationPrice,
    createGame,
    migrateState,
    openPosition,
    addMargin,
    closePosition,
    closeAllPositions,
    transfer,
    loanLimit,
    loanTotals,
    checkCriticalFunds,
    borrowLoan,
    stealMoney,
    repayDebt,
    processLoans,
    setRiskLevels,
    tick,
    checkAutoClose,
    accountTotals,
    statistics
  };

  root.FXEngine = api;
  if (isNode) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
