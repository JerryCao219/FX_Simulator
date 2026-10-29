(function (root) {
  "use strict";

  const snapshot = {
    date: "2025-01-02",
    source: "European Central Bank reference rates via Frankfurter",
    url: "https://api.frankfurter.app/2025-01-02?from=EUR&to=USD,JPY,GBP,CHF,HKD,CNY",
    base: "EUR",
    rates: { USD: 1.0321, JPY: 162.04, GBP: 0.83118, CHF: 0.9371, HKD: 8.0261, CNY: 7.5338 }
  };

  const snapshots = [
    {
      date: "2019-01-02",
      base: "EUR",
      rates: { CHF: 1.1239, CNY: 7.8165, GBP: 0.90165, HKD: 8.9294, JPY: 124.28, USD: 1.1397 }
    },
    {
      date: "2019-06-03",
      base: "EUR",
      rates: { CHF: 1.1162, CNY: 7.7253, GBP: 0.88618, HKD: 8.7645, JPY: 121.17, USD: 1.1185 }
    },
    {
      date: "2020-01-02",
      base: "EUR",
      rates: { CHF: 1.0865, CNY: 7.7946, GBP: 0.84828, HKD: 8.7203, JPY: 121.75, USD: 1.1193 }
    },
    {
      date: "2020-06-01",
      base: "EUR",
      rates: { CHF: 1.0686, CNY: 7.9327, GBP: 0.89673, HKD: 8.6165, JPY: 119.75, USD: 1.1116 }
    },
    {
      date: "2021-01-04",
      base: "EUR",
      rates: { CHF: 1.0811, CNY: 7.9484, GBP: 0.9016, HKD: 9.533, JPY: 126.62, USD: 1.2296 }
    },
    {
      date: "2021-06-01",
      base: "EUR",
      rates: { CHF: 1.0986, CNY: 7.8043, GBP: 0.86285, HKD: 9.4853, JPY: 134.05, USD: 1.2225 }
    },
    {
      date: "2022-01-03",
      base: "EUR",
      rates: { CHF: 1.0372, CNY: 7.2174, GBP: 0.84135, HKD: 8.8541, JPY: 130.56, USD: 1.1355 }
    },
    {
      date: "2022-06-01",
      base: "EUR",
      rates: { CHF: 1.0305, CNY: 7.1586, GBP: 0.85158, HKD: 8.4057, JPY: 138.68, USD: 1.0712 }
    },
    {
      date: "2022-12-01",
      base: "EUR",
      rates: { CHF: 0.9868, CNY: 7.3965, GBP: 0.85715, HKD: 8.1371, JPY: 142.48, USD: 1.0454 }
    },
    {
      date: "2023-06-01",
      base: "EUR",
      rates: { CHF: 0.9732, CNY: 7.6066, GBP: 0.85823, HKD: 8.3786, JPY: 149.25, USD: 1.0697 }
    },
    {
      date: "2023-12-01",
      base: "EUR",
      rates: { CHF: 0.953, CNY: 7.7685, GBP: 0.86045, HKD: 8.497, JPY: 161.14, USD: 1.0875 }
    },
    {
      date: "2024-01-02",
      base: "EUR",
      rates: { CHF: 0.9305, CNY: 7.8264, GBP: 0.86645, HKD: 8.5609, JPY: 155.68, USD: 1.0956 }
    },
    {
      date: "2024-06-03",
      base: "EUR",
      rates: { CHF: 0.9772, CNY: 7.8562, GBP: 0.85175, HKD: 8.4797, JPY: 170.09, USD: 1.0842 }
    },
    {
      date: "2024-12-02",
      base: "EUR",
      rates: { CHF: 0.9316, CNY: 7.6421, GBP: 0.82898, HKD: 8.1753, JPY: 157.74, USD: 1.0507 }
    },
    snapshot,
    {
      date: "2025-02-03",
      base: "EUR",
      rates: { CHF: 0.9393, CNY: 7.45, GBP: 0.83136, HKD: 8.0072, JPY: 158.87, USD: 1.0274 }
    },
    {
      date: "2025-06-02",
      base: "EUR",
      rates: { CHF: 0.9336, CNY: 8.2214, GBP: 0.8434, HKD: 8.9576, JPY: 162.98, USD: 1.1419 }
    },
    {
      date: "2025-08-01",
      base: "EUR",
      rates: { CHF: 0.9312, CNY: 8.2243, GBP: 0.8665, HKD: 8.9521, JPY: 171.61, USD: 1.1404 }
    },
    {
      date: "2025-10-01",
      base: "EUR",
      rates: { CHF: 0.9365, CNY: 8.347, GBP: 0.8704, HKD: 9.1235, JPY: 172.47, USD: 1.1724 }
    },
    {
      date: "2025-12-01",
      base: "EUR",
      rates: { CHF: 0.9323, CNY: 8.2358, GBP: 0.8778, HKD: 9.0703, JPY: 180.28, USD: 1.1646 }
    }
  ];

  function priceAtSnapshot(symbol, selectedSnapshot) {
    const rates = (selectedSnapshot || snapshot).rates;
    const formulas = {
      "USD/JPY": () => rates.JPY / rates.USD,
      "EUR/JPY": () => rates.JPY,
      "GBP/JPY": () => rates.JPY / rates.GBP,
      "CHF/JPY": () => rates.JPY / rates.CHF,
      "EUR/USD": () => rates.USD,
      "GBP/USD": () => rates.USD / rates.GBP,
      "HKD/CNY": () => rates.CNY / rates.HKD,
      "HKD/USD": () => rates.USD / rates.HKD,
      "HKD/JPY": () => rates.JPY / rates.HKD
    };
    if (!formulas[symbol]) throw new Error("Unknown snapshot pair: " + symbol);
    return formulas[symbol]();
  }

  const pairs = [
    {
      symbol: "USD/JPY",
      base: "USD",
      quote: "JPY",
      initial: 157.00029066950876,
      volatility: 0.00013,
      precision: 3
    },
    {
      symbol: "EUR/JPY",
      base: "EUR",
      quote: "JPY",
      initial: 162.04,
      volatility: 0.000155,
      precision: 3
    },
    {
      symbol: "GBP/JPY",
      base: "GBP",
      quote: "JPY",
      initial: 194.95175533578765,
      volatility: 0.00021,
      precision: 3
    },
    {
      symbol: "CHF/JPY",
      base: "CHF",
      quote: "JPY",
      initial: 172.91644434958914,
      volatility: 0.000135,
      precision: 3
    },
    {
      symbol: "EUR/USD",
      base: "EUR",
      quote: "USD",
      initial: 1.0321,
      volatility: 0.00009,
      precision: 5
    },
    {
      symbol: "GBP/USD",
      base: "GBP",
      quote: "USD",
      initial: 1.2417286267715777,
      volatility: 0.000115,
      precision: 5
    },
    {
      symbol: "HKD/CNY",
      base: "HKD",
      quote: "CNY",
      initial: 0.9386626132243556,
      volatility: 0.0001,
      precision: 5
    },
    {
      symbol: "HKD/USD",
      base: "HKD",
      quote: "USD",
      initial: 0.12859296545021867,
      volatility: 0.000085,
      precision: 5
    },
    {
      symbol: "HKD/JPY",
      base: "HKD",
      quote: "JPY",
      initial: 20.18913295373843,
      volatility: 0.00013,
      precision: 3
    }
  ];

  const data = {
    startingCash: 100000000,
    startingCashChoices: [3000000, 10000000, 20000000, 50000000, 100000000, 200000000],
    maxLeverage: 1000,
    minTradeMargin: 100,
    maxLoanPrincipal: 500000000,
    loanLimitsByCapital: {
      3000000: 30000000,
      10000000: 50000000,
      20000000: 80000000,
      50000000: 150000000,
      100000000: 500000000,
      200000000: 1000000000
    },
    loanInterestRate: 0.1,
    loanInterestInterval: 120,
    loanTerm: 600,
    feeRate: 0.005,
    liquidationLossRate: 1,
    candleSeconds: 30,
    maxCandles: 90,
    maxHistory: 500,
    snapshot,
    snapshots,
    priceAtSnapshot,
    pairs
  };

  root.FXData = data;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = data;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
