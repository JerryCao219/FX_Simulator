(function () {
  "use strict";

  const Data = window.FXData;
  const Engine = window.FXEngine;
  const SAVE_KEY = "fx-simulator-save-v1";
  const LANG_KEY = "fx-simulator-language";
  const $ = (id) => document.getElementById(id);

  let state = null;
  let language = localStorage.getItem(LANG_KEY) || "zh";
  let tradeSide = "long";
  let selectedPositionId = null;
  let historyDirty = true;
  let toastTimer = null;
  let accumulator = 0;
  let lastSchedulerTime = Date.now();
  let gameOverRevealTimer = null;

  const text = {
    zh: {
      startEyebrow: "单人外汇交易模拟", startTitle: "选择你的交易规则", startSubtitle: "选择本局资金与交易模式。模式选定后将锁定，直到重新开始。",
      startingCapital: "本局初始资金", startingCapitalHelp: "可选 30 万至 2 亿日元；开局汇率将从 20 组历史快照中随机抽取。", fundManagement: "资金管理",
      gameMode: "游戏模式", classicMode: "经典模式", classicDescription: "仅市价开仓与手动平仓，完全依靠自己的判断。", marketOnly: "仅市价单",
      riskMode: "风控模式", riskDescription: "在市价交易基础上，可随时添加、修改或取消止盈止损。", marketRisk: "市价单＋止盈止损",
      initialDeposit: "初始投入交易账户", initialDepositHelp: "剩余资金保留在钱包，之后可随时追加或提取。", startGame: "开始新游戏",
      snapshotNote: "每局随机选择一组 ECB 历史参考汇率；之后全部为随机模拟，不连接真实市场。", localSave: "本地自动存档", restart: "重新开始",
      wallet: "钱包余额", walletHint: "可用于追加资金", availableBalance: "交易可用余额", availableHint: "可开仓或提取",
      marginUsed: "已占用保证金", marginHint: "逐仓独立计算", unrealizedPnl: "未实现盈亏", unrealizedHint: "按当前价格折算日元",
      netWorth: "总净资产", netWorthHint: "钱包＋交易账户净值", simulated: "模拟行情", pause: "暂停", resume: "继续",
      entryPrice: "开仓价", liquidationPrice: "爆仓线", stopLoss: "止损", takeProfit: "止盈", chartHint: "点击仓位可高亮对应价格线",
      newOrder: "新建订单", marketOrder: "市价开仓", buyLong: "买入 / 做多", sellShort: "卖出 / 做空", marginAmount: "保证金（日元）",
      leverage: "杠杆倍数", estimatedNotional: "名义仓位", estimatedUnits: "基础货币数量", estimatedLiquidation: "预计爆仓价",
      feeNote: "仅对平仓盈利部分收取 0.5% 手续费；亏损平仓不收手续费。", fundTransfer: "资金划转", transferAmount: "划转金额（日元）",
      deposit: "钱包 → 交易账户", withdraw: "交易账户 → 钱包", openPositionsEyebrow: "当前交易", openPositions: "持仓列表",
      isolatedMargin: "每笔仓位独立保证金，亏完全部保证金时强平", market: "市场 / 方向", marginLeverage: "保证金 / 杠杆",
      entryCurrent: "开仓价 / 当前价", pnlRoe: "盈亏 / 收益率", actions: "操作", noPositions: "暂无持仓。选择方向、保证金和杠杆后即可开仓。",
      selectedPosition: "选中仓位", positionSupport: "仓位管理", addMarginHint: "追加保证金不会改变持仓数量；做多强平线下降，做空强平线上升，降低强平风险。", additionalMargin: "追加保证金（日元）", addMargin: "追加到选中仓位", marginAdded: "已追加 {amount} 保证金，新强平价为 {price}。", riskHint: "留空表示不设置；止盈止损必须在当前价格的正确一侧。", stopLossPrice: "止损价", takeProfitPrice: "止盈价",
      saveRisk: "保存止盈止损", clearRisk: "清除", closedTrades: "已平仓交易", winRate: "胜率", realizedPnl: "已实现净盈亏",
      totalFees: "累计手续费", liquidations: "爆仓次数", auditTrail: "交易记录", tradeHistory: "平仓历史", historyHint: "保留最近 500 笔记录",
      closeTime: "平仓时间", entryExit: "开仓 / 平仓", grossPnl: "盈亏（费前）", fee: "手续费", netPnl: "净盈亏", closeReason: "平仓原因",
      noHistory: "暂无平仓记录。", disclaimer: "仅供游戏与学习，不构成投资建议。所有后续行情均为随机生成。",
      totalDebt: "贷款总负债", debtHint: "未还本金＋累计利息", netWorthHint: "钱包＋交易净值－债务",
      debtManagement: "债务管理", loans: "贷款", loanRule: "未还本金上限由本局初始资金决定；每 120 模拟秒按当前债务复利 10%，每笔贷款须在 600 模拟秒内还清。",
      borrowAmount: "借款金额（日元）", borrow: "借入并存入钱包", repaymentAmount: "还款金额（日元）", repay: "部分还款", repayAll: "还清全部债务",
      repaymentNote: "还款依次使用钱包和交易账户可用余额；到期时自动平仓并尝试足额还款，不足则游戏结束。",
      loanId: "贷款", outstandingPrincipal: "未还本金", accruedInterest: "累计利息", currentDebt: "当前债务", nextInterest: "下次计息", timeRemaining: "剩余期限", noLoans: "当前没有未偿还贷款。",
      creditAvailable: "剩余额度 {amount}", loanLimitSummary: "本局额度 {limit} · 剩余 {credit}", debtSettlement: "到期偿付平仓", simulatedSeconds: "{seconds} 模拟秒",
      loanBorrowed: "已借入 {amount}，资金已存入钱包。", loanRepaid: "已还款 {amount}，剩余债务 {debt}。",
      invalidLoanAmount: "单笔借款不得低于 1000 日元。", loanLimitExceeded: "超出本局初始资金对应的贷款总额度。", noDebt: "当前没有需要偿还的债务。",
      invalidRepayment: "请输入有效的还款金额。", insufficientRepayment: "钱包与交易账户可用余额不足以支付该还款。", gameOver: "本局已经结束，请重新开始。",
      debtDefault: "债务违约", gameOverTitle: "本局游戏结束", gameOverHint: "贷款到期时，自动平仓后的可用资金仍不足以偿还债务。", gameOverMessage: "到期债务为 {amount}，可用资金不足，贷款期限为 600 模拟秒。",
      stealMoney: "从久留美的父亲那里偷钱", rescueReceived: "已获得 300 万日元救助金，作为免息贷款计入债务，还款优先级最低。", interestFree: "免息·最后还款", rescueUnavailable: "当前不可使用该救助。", rescueAlreadyUsed: "本局救助只能使用一次，还清后也不会恢复。",
      fundsExhausted: "资金耗尽", insufficientFundsHint: "钱包、交易余额与全部持仓权益合计低于最低开仓金额，且仍存在未偿还贷款。", insufficientFundsMessage: "当前可变现总资产（含持仓权益）为 {cash}，低于最低开仓金额 {minimum}；未还债务为 {debt}。",
      long: "做多", short: "做空", close: "平仓", openLong: "市价买入 {symbol}", openShort: "市价卖出 {symbol}",
      available: "可用 {amount}", nextCandle: "下一根 K 线：{seconds} 模拟秒", simulatedTime: "模拟时间 {time}",
      positionOpened: "已开仓：{symbol} {side}，保证金 {amount}", positionClosed: "已平仓，净盈亏 {amount}",
      transferComplete: "资金划转完成", riskSaved: "止盈止损已更新", riskCleared: "已清除止盈止损",
      sessionSettled: "检测到上次退出时有未结算仓位，已按最后存档价格自动平仓。",
      resetConfirm: "确定要完全重新开始吗？\n\n这将清除当前资金、全部持仓、交易记录、行情和模式选择，且无法撤销。",
      saveFailed: "本地存档失败，请检查浏览器存储权限。", invalidStart: "请输入有效金额，且初始投入不能超过本局资金。",
      loadFailed: "存档无法读取，已显示新游戏页面。原存档未被修改。",
      manual: "手动平仓", liquidation: "强制平仓", stopLossReason: "止损", takeProfitReason: "止盈", session: "退出结算",
      noSelectedPosition: "请先选择一笔持仓。", trendUp: "上涨阶段", trendDown: "下跌阶段", trendFlat: "震荡阶段",
      invalidSide: "交易方向无效。", invalidMargin: "保证金不得低于 100 日元。", insufficientBalance: "交易账户可用余额不足。",
      invalidLeverage: "杠杆必须为 1 至 1000 倍。", invalidTransfer: "请输入有效的划转金额。", insufficientWallet: "钱包余额不足。",
      positionNotFound: "该仓位已不存在。", riskModeOnly: "只有风控模式支持止盈止损。", invalidRiskPrice: "请输入有效的正数价格。",
      longStopBelow: "做多仓位的止损价必须低于当前价。", longTakeAbove: "做多仓位的止盈价必须高于当前价。",
      shortStopAbove: "做空仓位的止损价必须高于当前价。", shortTakeBelow: "做空仓位的止盈价必须低于当前价。"
    },
    en: {
      startEyebrow: "Single-player FX trading simulation", startTitle: "Choose your trading rules", startSubtitle: "Choose your starting capital and mode. The mode is locked until you restart.",
      startingCapital: "Starting capital", startingCapitalHelp: "Choose ¥300K to ¥200M. Each run randomly uses one of 20 historical FX snapshots.", fundManagement: "Fund management",
      gameMode: "Game mode", classicMode: "Classic mode", classicDescription: "Market orders and manual closing only. Every exit is your own decision.", marketOnly: "Market orders only",
      riskMode: "Risk control mode", riskDescription: "Market trading plus optional stop-loss and take-profit levels that you can edit at any time.", marketRisk: "Market orders + SL/TP",
      initialDeposit: "Initial trading account deposit", initialDepositHelp: "The remainder stays in your wallet and can be transferred in either direction later.", startGame: "Start new game",
      snapshotNote: "Each run starts from a random set of ECB historical reference rates. All subsequent prices are simulated.", localSave: "Saved locally", restart: "Restart",
      wallet: "Wallet balance", walletHint: "Available to deposit", availableBalance: "Trading cash available", availableHint: "For positions or withdrawal",
      marginUsed: "Margin in use", marginHint: "Isolated by position", unrealizedPnl: "Unrealized P&L", unrealizedHint: "Converted to JPY at current rates",
      netWorth: "Total net worth", netWorthHint: "Wallet + trading equity", simulated: "Simulated", pause: "Pause", resume: "Resume",
      entryPrice: "Entry", liquidationPrice: "Liquidation", stopLoss: "Stop-loss", takeProfit: "Take-profit", chartHint: "Select a position to highlight its price levels",
      newOrder: "New order", marketOrder: "Market order", buyLong: "Buy / Long", sellShort: "Sell / Short", marginAmount: "Margin (JPY)",
      leverage: "Leverage", estimatedNotional: "Notional value", estimatedUnits: "Base currency units", estimatedLiquidation: "Estimated liquidation",
      feeNote: "A 0.5% fee applies only to positive gross P&L at closing. Losing trades pay no fee.", fundTransfer: "Fund transfer", transferAmount: "Amount (JPY)",
      deposit: "Wallet → Trading", withdraw: "Trading → Wallet", openPositionsEyebrow: "Current trading", openPositions: "Open positions",
      isolatedMargin: "Isolated margin; liquidated only when the full margin is lost", market: "Market / Side", marginLeverage: "Margin / Leverage",
      entryCurrent: "Entry / Current", pnlRoe: "P&L / ROE", actions: "Actions", noPositions: "No open positions. Choose a side, margin and leverage to trade.",
      selectedPosition: "Selected position", positionSupport: "Position management", addMarginHint: "Adding margin does not change position units. Long liquidation moves down and short liquidation moves up, reducing liquidation risk.", additionalMargin: "Additional margin (JPY)", addMargin: "Add to selected position", marginAdded: "Added {amount} margin. New liquidation price: {price}.", riskHint: "Leave blank to disable. SL/TP must be on the valid side of the current price.", stopLossPrice: "Stop-loss price", takeProfitPrice: "Take-profit price",
      saveRisk: "Save SL / TP", clearRisk: "Clear", closedTrades: "Closed trades", winRate: "Win rate", realizedPnl: "Realized net P&L",
      totalFees: "Total fees", liquidations: "Liquidations", auditTrail: "Audit trail", tradeHistory: "Trade history", historyHint: "Keeps the latest 500 trades",
      closeTime: "Close time", entryExit: "Entry / Exit", grossPnl: "Gross P&L", fee: "Fee", netPnl: "Net P&L", closeReason: "Close reason",
      noHistory: "No closed trades yet.", disclaimer: "For games and education only. Not investment advice. All subsequent prices are random.",
      totalDebt: "Total loan debt", debtHint: "Principal + accrued interest", netWorthHint: "Wallet + trading equity − debt",
      debtManagement: "Debt management", loans: "Loans", loanRule: "The outstanding-principal limit depends on starting capital. Current debt compounds by 10% every 120 simulated seconds; each loan is due after 600 simulated seconds.",
      borrowAmount: "Loan amount (JPY)", borrow: "Borrow into wallet", repaymentAmount: "Repayment amount (JPY)", repay: "Partial repayment", repayAll: "Repay all debt",
      repaymentNote: "Repayments use wallet cash, then available trading cash. At maturity, positions are closed and full repayment is attempted; insufficient cash ends the run.",
      loanId: "Loan", outstandingPrincipal: "Principal", accruedInterest: "Interest", currentDebt: "Current debt", nextInterest: "Next interest", timeRemaining: "Time remaining", noLoans: "No outstanding loans.",
      creditAvailable: "Credit available {amount}", loanLimitSummary: "Run limit {limit} · Available {credit}", debtSettlement: "Debt settlement close", simulatedSeconds: "{seconds}s simulated",
      loanBorrowed: "Borrowed {amount} into your wallet.", loanRepaid: "Repaid {amount}. Remaining debt: {debt}.",
      invalidLoanAmount: "The minimum loan is ¥1,000.", loanLimitExceeded: "This exceeds the loan limit for the current starting capital.", noDebt: "There is no debt to repay.",
      invalidRepayment: "Enter a valid repayment amount.", insufficientRepayment: "Wallet and available trading cash are insufficient for this repayment.", gameOver: "This run has ended. Please restart.",
      debtDefault: "Debt default", gameOverTitle: "Game over", gameOverHint: "When the loan matured, your cash after automatic position settlement was insufficient to repay the debt.", gameOverMessage: "The matured debt was {amount}, exceeding available cash after the 600-second loan term.",
      stealMoney: "Steal money from Kurumi's father", rescueReceived: "Received ¥3,000,000 as an interest-free rescue loan with the lowest repayment priority.", interestFree: "Interest-free · Repaid last", rescueUnavailable: "This rescue is not currently available.", rescueAlreadyUsed: "The rescue can be used only once per run and does not reset after repayment.",
      fundsExhausted: "Funds exhausted", insufficientFundsHint: "Wallet, trading cash and all open-position equity total less than the minimum opening margin while debt remains.", insufficientFundsMessage: "Liquidatable assets including open-position equity are {cash}, below the {minimum} minimum opening margin. Outstanding debt: {debt}.",
      long: "Long", short: "Short", close: "Close", openLong: "Market buy {symbol}", openShort: "Market sell {symbol}",
      available: "Available {amount}", nextCandle: "Next candle: {seconds} simulated seconds", simulatedTime: "Simulated time {time}",
      positionOpened: "Opened {symbol} {side} with {amount} margin", positionClosed: "Position closed. Net P&L: {amount}",
      transferComplete: "Transfer completed", riskSaved: "Stop-loss and take-profit updated", riskCleared: "Stop-loss and take-profit cleared",
      sessionSettled: "Open positions from the previous session were settled at their last saved prices.",
      resetConfirm: "Completely restart?\n\nThis permanently clears funds, positions, trade history, market data and your selected mode.",
      saveFailed: "Could not save locally. Check browser storage permissions.", invalidStart: "Enter a valid amount no greater than this run's starting capital.",
      loadFailed: "The save could not be read. The new-game screen is shown; the original save was not changed.",
      manual: "Manual", liquidation: "Liquidation", stopLossReason: "Stop-loss", takeProfitReason: "Take-profit", session: "Session settlement",
      noSelectedPosition: "Select a position first.", trendUp: "Upward phase", trendDown: "Downward phase", trendFlat: "Sideways phase",
      invalidSide: "Invalid order side.", invalidMargin: "Margin must be at least ¥100.", insufficientBalance: "Insufficient available trading balance.",
      invalidLeverage: "Leverage must be between 1 and 1000.", invalidTransfer: "Enter a valid transfer amount.", insufficientWallet: "Insufficient wallet balance.",
      positionNotFound: "This position no longer exists.", riskModeOnly: "SL/TP is available only in risk control mode.", invalidRiskPrice: "Enter a valid positive price.",
      longStopBelow: "A long position's stop-loss must be below the current price.", longTakeAbove: "A long position's take-profit must be above the current price.",
      shortStopAbove: "A short position's stop-loss must be above the current price.", shortTakeBelow: "A short position's take-profit must be below the current price."
    }
  };

  function t(key, values) {
    let result = (text[language] && text[language][key]) || text.zh[key] || key;
    Object.keys(values || {}).forEach((name) => {
      result = result.replace("{" + name + "}", String(values[name]));
    });
    return result;
  }

  function formatMoney(value, signed) {
    const number = Number(value) || 0;
    const absolute = Math.abs(number);
    const formatted = new Intl.NumberFormat(language === "zh" ? "ja-JP" : "en-US", {
      style: "currency",
      currency: "JPY",
      minimumFractionDigits: Number.isInteger(absolute) ? 0 : 2,
      maximumFractionDigits: 2
    }).format(absolute);
    if (!signed) return (number < 0 ? "−" : "") + formatted;
    return number > 0 ? "+" + formatted : number < 0 ? "−" + formatted : formatted;
  }

  function formatNumber(value, maximumFractionDigits) {
    return new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US", {
      maximumFractionDigits: maximumFractionDigits === undefined ? 2 : maximumFractionDigits
    }).format(Number(value) || 0);
  }

  function pairConfig(symbol) {
    return Data.pairs.find((pair) => pair.symbol === symbol);
  }

  function formatPrice(symbol, value) {
    return Number(value).toFixed(pairConfig(symbol).precision);
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", {
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(new Date(timestamp));
  }

  function pnlClass(value) {
    return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  }

  function capitalOptionLabel(value) {
    if (language === "en") return value < 1000000 ? `¥${value / 1000}K` : `¥${value / 1000000}M`;
    return value >= 100000000 ? `${value / 100000000}亿日元` : `${value / 10000}万日元`;
  }

  function updateDepositShortcutState() {
    const capital = Number($("startingCapital").value) || Data.startingCash;
    const deposit = Number($("initialDeposit").value) || 0;
    document.querySelectorAll("[data-deposit-percent]").forEach((button) => {
      const target = capital * Number(button.dataset.depositPercent) / 100;
      button.classList.toggle("active", Math.abs(deposit - target) < 0.005);
    });
  }

  function updateDepositLimit() {
    const capital = Number($("startingCapital").value) || Data.startingCash;
    $("initialDeposit").max = capital;
    $("initialDepositRange").max = capital;
    $("depositMaxLabel").textContent = formatMoney(capital);
    const deposit = Number($("initialDeposit").value) || 0;
    if (deposit > capital) $("initialDeposit").value = capital;
    $("initialDepositRange").value = Math.max(0, Math.min(capital, Number($("initialDeposit").value) || 0));
    updateDepositShortcutState();
  }

  function renderStartingCapitalOptions() {
    const select = $("startingCapital");
    const selected = select.value || String(Data.startingCash);
    select.innerHTML = Data.startingCashChoices.map((value) =>
      `<option value="${value}">${capitalOptionLabel(value)}</option>`
    ).join("");
    select.value = Data.startingCashChoices.includes(Number(selected)) ? selected : String(Data.startingCash);
    updateDepositLimit();
  }

  function applyLanguage() {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    document.querySelectorAll("[data-zh][data-en]").forEach((element) => {
      element.textContent = language === "zh" ? element.dataset.zh : element.dataset.en;
    });
    renderStartingCapitalOptions();
    $("startLangBtn").textContent = language === "zh" ? "EN" : "中文";
    $("langBtn").textContent = language === "zh" ? "EN" : "中文";
    if (state) {
      state.language = language;
      historyDirty = true;
      renderAll();
    }
  }

  function toggleLanguage() {
    language = language === "zh" ? "en" : "zh";
    localStorage.setItem(LANG_KEY, language);
    applyLanguage();
    saveState();
  }

  function showToast(message, isError) {
    const toast = $("toast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle("error", Boolean(isError));
    toast.classList.add("visible");
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3400);
  }

  function showError(elementId, key) {
    $(elementId).textContent = key ? t(key) : "";
    if (key) showToast(t(key), true);
  }

  function saveState() {
    if (!state) return;
    try {
      state.language = language;
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error(error);
      showToast(t("saveFailed"), true);
    }
  }

  function loadState() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (![1, 2, 3, 4].includes(parsed.version) || !parsed.markets || !Array.isArray(parsed.positions) || !Array.isArray(parsed.history)) {
        throw new Error("Invalid save schema");
      }
      return Engine.migrateState(parsed);
    } catch (error) {
      console.error(error);
      setTimeout(() => showToast(t("loadFailed"), true), 100);
      return null;
    }
  }

  function showGame() {
    $("startScreen").classList.add("hidden");
    $("gameScreen").classList.remove("hidden");
    historyDirty = true;
    applyLanguage();
    renderAll();
  }

  function startGame(event) {
    event.preventDefault();
    const startingCash = Number($("startingCapital").value);
    const deposit = Number($("initialDeposit").value);
    if (!Data.startingCashChoices.includes(startingCash) || !Number.isFinite(deposit) || deposit < 0 || deposit > startingCash) {
      showError("startError", "invalidStart");
      return;
    }
    const mode = document.querySelector('input[name="gameMode"]:checked').value;
    state = Engine.createGame(mode, deposit, Date.now(), undefined, startingCash);
    $("marginInput").value = Math.min(1000000, Math.max(Data.minTradeMargin, Math.floor(deposit)));
    state.language = language;
    selectedPositionId = null;
    tradeSide = "long";
    accumulator = 0;
    saveState();
    showGame();
  }

  function restart() {
    if (!window.confirm(t("resetConfirm"))) return;
    state = null;
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(LANG_KEY);
    window.location.reload();
  }

  function renderAccount() {
    const totals = Engine.accountTotals(state);
    $("walletValue").textContent = formatMoney(totals.wallet);
    $("balanceValue").textContent = formatMoney(totals.balance);
    $("marginValue").textContent = formatMoney(totals.marginUsed);
    $("unrealizedValue").textContent = formatMoney(totals.unrealized, true);
    $("unrealizedValue").className = pnlClass(totals.unrealized);
    $("netWorthValue").textContent = formatMoney(totals.netWorth);
    $("debtValue").textContent = formatMoney(totals.debt);
    $("availableForTrade").textContent = t("available", { amount: formatMoney(totals.balance) });
  }

  function renderMarkets() {
    $("marketTabs").innerHTML = Data.pairs.map((pair) => {
      const market = state.markets[pair.symbol];
      return `<button type="button" class="market-tab ${state.selectedSymbol === pair.symbol ? "active" : ""}" data-symbol="${pair.symbol}">` +
        `<span class="market-tab-symbol">${pair.symbol}</span><span class="market-tab-price">${formatPrice(pair.symbol, market.price)}</span></button>`;
    }).join("");
  }

  function renderTimeControls() {
    $("pauseBtn").textContent = state.paused ? t("resume") : t("pause");
    $("pauseBtn").classList.toggle("active", state.paused);
    $("normalSpeedBtn").classList.toggle("active", !state.paused && state.speed === 1);
    $("fastSpeedBtn").classList.toggle("active", !state.paused && state.speed === 1.5);
  }

  function renderChartHeader() {
    const symbol = state.selectedSymbol;
    const market = state.markets[symbol];
    const pair = pairConfig(symbol);
    const change = ((market.price - market.initialPrice) / market.initialPrice) * 100;
    const candle = market.currentCandle;
    $("chartSymbol").textContent = symbol;
    $("tradePair").textContent = symbol;
    $("chartPrice").textContent = formatPrice(symbol, market.price);
    $("chartChange").textContent = `${change >= 0 ? "+" : ""}${change.toFixed(3)}%`;
    $("chartChange").className = pnlClass(change);
    $("candleInfo").textContent = `O ${formatPrice(symbol, candle.open)}  H ${formatPrice(symbol, candle.high)}  L ${formatPrice(symbol, candle.low)}  C ${formatPrice(symbol, candle.close)}`;
    $("chartTime").textContent = `${t("nextCandle", { seconds: Data.candleSeconds - candle.ticks })} · ${formatTime(state.simTime)}`;
    $("modeBadge").textContent = t(state.mode === "classic" ? "classicMode" : "riskMode");
    $("capitalBadge").textContent = `${t("startingCapital")} ${formatMoney(state.startingCash)}`;
    $("snapshotLabel").textContent = `ECB snapshot · ${state.snapshotDate}`;
    document.querySelectorAll(".risk-only").forEach((element) => element.classList.toggle("hidden", state.mode !== "risk"));
    $("openPositionBtn").textContent = t(tradeSide === "long" ? "openLong" : "openShort", { symbol: pair.symbol });
    $("openPositionBtn").classList.toggle("short", tradeSide === "short");
    $("tradeSideLong").classList.toggle("active", tradeSide === "long");
    $("tradeSideShort").classList.toggle("active", tradeSide === "short");
  }

  function renderTradeEstimate() {
    if (!state) return;
    const symbol = state.selectedSymbol;
    const pair = pairConfig(symbol);
    const margin = Number($("marginInput").value);
    const leverage = Math.floor(Number($("leverageInput").value));
    document.querySelectorAll("[data-leverage]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.leverage) === leverage);
    });
    if (!Number.isFinite(margin) || margin <= 0 || !Number.isFinite(leverage) || leverage < 1 || leverage > Data.maxLeverage) {
      $("estimatedNotional").textContent = "—";
      $("estimatedUnits").textContent = "—";
      $("estimatedLiquidation").textContent = "—";
      return;
    }
    const prices = Engine.currentPrices(state);
    const conversion = Engine.quoteInJpy(pair, prices);
    const units = (margin * leverage) / (prices[symbol] * conversion);
    const notional = units * prices[symbol] * conversion;
    const mockPosition = { symbol, side: tradeSide, margin, leverage, units, entryPrice: prices[symbol] };
    const liquidation = Engine.liquidationPrice(mockPosition, prices);
    $("estimatedNotional").textContent = formatMoney(notional);
    $("estimatedUnits").textContent = `${formatNumber(units, 2)} ${pair.base}`;
    $("estimatedLiquidation").textContent = formatPrice(symbol, liquidation);
  }

  function renderPositions() {
    const prices = Engine.currentPrices(state);
    const rows = state.positions.slice().reverse();
    $("positionCount").textContent = String(state.positions.length);
    $("positionsEmpty").classList.toggle("hidden", rows.length > 0);
    $("positionsBody").innerHTML = rows.map((position) => {
      const pnl = Engine.calculatePnl(position, prices);
      const roe = (pnl / position.margin) * 100;
      const liquidation = Engine.liquidationPrice(position, prices);
      return `<tr class="position-row ${selectedPositionId === position.id ? "selected" : ""}" data-position-id="${position.id}">` +
        `<td><div class="cell-stack"><strong>${position.symbol} <span class="direction ${position.side}">${t(position.side)}</span></strong><small>#${position.id}</small></div></td>` +
        `<td><div class="cell-stack"><strong class="mono">${formatMoney(position.margin)}</strong><small>${position.leverage}×</small></div></td>` +
        `<td><div class="cell-stack"><strong class="mono">${formatPrice(position.symbol, position.entryPrice)}</strong><small>${formatPrice(position.symbol, prices[position.symbol])}</small></div></td>` +
        `<td><span class="mono">${formatPrice(position.symbol, liquidation)}</span></td>` +
        `<td><div class="cell-stack"><strong class="${pnlClass(pnl)}">${formatMoney(pnl, true)}</strong><small class="${pnlClass(pnl)}">${roe >= 0 ? "+" : ""}${roe.toFixed(2)}%</small></div></td>` +
        `<td><button type="button" class="close-button" data-close-id="${position.id}">${t("close")}</button></td></tr>`;
    }).join("");

    const selected = state.positions.find((position) => position.id === selectedPositionId);
    const marginEditor = $("marginEditor");
    if (!selected) {
      marginEditor.classList.add("hidden");
      marginEditor.dataset.positionId = "";
    } else {
      marginEditor.classList.remove("hidden");
      $("marginPositionTitle").textContent = `#${selected.id} · ${selected.symbol} · ${t(selected.side)} · ${selected.leverage}×`;
      $("availableForAdditionalMargin").textContent = t("available", { amount: formatMoney(state.balance) });
      if (marginEditor.dataset.positionId !== String(selected.id)) {
        $("additionalMargin").value = Math.min(1000000, Math.max(Data.minTradeMargin, Math.floor(state.balance)));
        $("marginError").textContent = "";
        marginEditor.dataset.positionId = String(selected.id);
      }
    }
    const editor = $("riskEditor");
    if (state.mode !== "risk" || !selected) {
      editor.classList.add("hidden");
      editor.dataset.positionId = "";
      if (selectedPositionId !== null && !selected) selectedPositionId = null;
      return;
    }
    editor.classList.remove("hidden");
    $("riskPositionTitle").textContent = `#${selected.id} · ${selected.symbol} · ${t(selected.side)} · ${selected.leverage}×`;
    if (editor.dataset.positionId !== String(selected.id)) {
      $("stopLossInput").value = selected.stopLoss === null ? "" : selected.stopLoss;
      $("takeProfitInput").value = selected.takeProfit === null ? "" : selected.takeProfit;
      $("riskError").textContent = "";
      editor.dataset.positionId = String(selected.id);
    }
  }

  function reasonLabel(reason) {
    const keys = { manual: "manual", liquidation: "liquidation", stopLoss: "stopLossReason", takeProfit: "takeProfitReason", session: "session", debtSettlement: "debtSettlement" };
    return t(keys[reason] || "manual");
  }

  function renderHistoryAndStats() {
    if (!historyDirty) return;
    historyDirty = false;
    $("historyEmpty").classList.toggle("hidden", state.history.length > 0);
    $("historyBody").innerHTML = state.history.map((trade) => {
      return `<tr><td class="mono">${formatTime(trade.closeTime)}</td>` +
        `<td><strong>${trade.symbol}</strong> <span class="direction ${trade.side}">${t(trade.side)}</span><br><small class="muted">${trade.leverage}×</small></td>` +
        `<td><div class="cell-stack mono"><span>${formatPrice(trade.symbol, trade.entryPrice)}</span><small>${formatPrice(trade.symbol, trade.exitPrice)}</small></div></td>` +
        `<td class="mono ${pnlClass(trade.grossPnl)}">${formatMoney(trade.grossPnl, true)}</td>` +
        `<td class="mono">${formatMoney(trade.fee)}</td>` +
        `<td class="mono ${pnlClass(trade.netPnl)}"><strong>${formatMoney(trade.netPnl, true)}</strong></td>` +
        `<td>${reasonLabel(trade.reason)}</td></tr>`;
    }).join("");
    const stats = Engine.statistics(state);
    $("statTrades").textContent = formatNumber(stats.trades, 0);
    $("statWinRate").textContent = `${stats.winRate.toFixed(1)}%`;
    $("statRealized").textContent = formatMoney(stats.realized, true);
    $("statRealized").className = pnlClass(stats.realized);
    $("statFees").textContent = formatMoney(stats.fees);
    $("statLiquidations").textContent = formatNumber(stats.liquidations, 0);
  }

  function drawChart() {
    if (!state || $("gameScreen").classList.contains("hidden")) return;
    const canvas = $("chartCanvas");
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 50 || height < 50) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const symbol = state.selectedSymbol;
    const pair = pairConfig(symbol);
    const market = state.markets[symbol];
    const candles = market.candles.slice(-59).concat([market.currentCandle]);
    const positions = state.positions.filter((position) => position.symbol === symbol);
    const prices = Engine.currentPrices(state);
    const levels = [];
    positions.forEach((position) => {
      const selected = position.id === selectedPositionId;
      levels.push({ value: position.entryPrice, color: "#2563eb", label: `#${position.id} ENTRY`, selected, dash: [5, 4] });
      levels.push({ value: Engine.liquidationPrice(position, prices), color: "#e8793e", label: `#${position.id} LIQ`, selected, dash: [7, 4] });
      if (state.mode === "risk" && position.stopLoss !== null) levels.push({ value: position.stopLoss, color: "#dc4446", label: `#${position.id} SL`, selected, dash: [3, 3] });
      if (state.mode === "risk" && position.takeProfit !== null) levels.push({ value: position.takeProfit, color: "#159a72", label: `#${position.id} TP`, selected, dash: [3, 3] });
    });

    let minimum = Math.min(...candles.map((candle) => candle.low));
    let maximum = Math.max(...candles.map((candle) => candle.high));
    levels.forEach((level) => {
      if (level.value > 0) {
        minimum = Math.min(minimum, level.value);
        maximum = Math.max(maximum, level.value);
      }
    });
    const rawRange = maximum - minimum || market.price * 0.002;
    minimum -= rawRange * 0.07;
    maximum += rawRange * 0.07;
    const range = maximum - minimum;

    const left = 12;
    const right = width - 88;
    const top = 14;
    const bottom = height - 27;
    const plotWidth = Math.max(1, right - left);
    const plotHeight = Math.max(1, bottom - top);
    const y = (price) => top + ((maximum - price) / range) * plotHeight;
    const xStep = plotWidth / Math.max(1, candles.length);
    const candleWidth = Math.max(2, Math.min(12, xStep * 0.62));

    ctx.font = "10px Consolas, monospace";
    ctx.textBaseline = "middle";
    for (let index = 0; index <= 5; index += 1) {
      const gridY = top + (plotHeight / 5) * index;
      const price = maximum - (range / 5) * index;
      ctx.beginPath();
      ctx.strokeStyle = "#e9edf2";
      ctx.lineWidth = 1;
      ctx.moveTo(left, gridY);
      ctx.lineTo(right, gridY);
      ctx.stroke();
      ctx.fillStyle = "#748094";
      ctx.textAlign = "left";
      ctx.fillText(price.toFixed(pair.precision), right + 8, gridY);
    }

    candles.forEach((candle, index) => {
      const x = left + xStep * (index + 0.5);
      const rising = candle.close >= candle.open;
      const color = rising ? "#dc4446" : "#159a72";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y(candle.high));
      ctx.lineTo(x, y(candle.low));
      ctx.stroke();
      const bodyTop = y(Math.max(candle.open, candle.close));
      const bodyBottom = y(Math.min(candle.open, candle.close));
      const bodyHeight = Math.max(1, bodyBottom - bodyTop);
      if (rising) {
        ctx.globalAlpha = 0.88;
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      } else {
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      }
      ctx.globalAlpha = 1;
    });

    ctx.fillStyle = "#748094";
    ctx.textAlign = "center";
    [0, Math.floor(candles.length / 2), candles.length - 1].forEach((index) => {
      const candle = candles[index];
      if (!candle) return;
      const x = left + xStep * (index + 0.5);
      const label = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(candle.time));
      ctx.fillText(label, x, bottom + 15);
    });

    levels.forEach((level) => {
      if (level.value <= 0 || level.value < minimum || level.value > maximum) return;
      const lineY = y(level.value);
      ctx.save();
      ctx.globalAlpha = selectedPositionId === null || level.selected ? 0.95 : 0.28;
      ctx.strokeStyle = level.color;
      ctx.lineWidth = level.selected ? 1.8 : 1;
      ctx.setLineDash(level.dash);
      ctx.beginPath();
      ctx.moveTo(left, lineY);
      ctx.lineTo(right, lineY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = level.color;
      ctx.textAlign = "left";
      ctx.fillText(level.label, right + 7, lineY + (level.label.includes("LIQ") ? 7 : -6));
      ctx.restore();
    });

    const currentY = y(market.price);
    ctx.strokeStyle = "#8994a5";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(left, currentY);
    ctx.lineTo(right, currentY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#13263f";
    ctx.fillRect(right + 3, currentY - 9, 81, 18);
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(market.price.toFixed(pair.precision), right + 43, currentY);

    if (state.paused) {
      ctx.fillStyle = "rgba(248, 250, 252, 0.78)";
      ctx.fillRect(left, top, plotWidth, plotHeight);
      ctx.fillStyle = "#13263f";
      ctx.font = "600 16px Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t("pause"), left + plotWidth / 2, top + plotHeight / 2);
    }
  }

  function simulatedCountdown(targetTime) {
    if (!Number.isFinite(targetTime)) return "—";
    const seconds = Math.max(0, Math.ceil((targetTime - state.simTime) / 1000));
    return t("simulatedSeconds", { seconds: formatNumber(seconds, 0) });
  }

  function renderLoans() {
    const totals = Engine.loanTotals(state);
    const limit = Engine.loanLimit(state);
    $("loanSummary").textContent = t("loanLimitSummary", { limit: formatMoney(limit), credit: formatMoney(totals.availableCredit) });
    $("loanAmount").max = limit;
    $("loanCreditAvailable").textContent = t("creditAvailable", { amount: formatMoney(totals.availableCredit) });
    $("repaymentAvailable").textContent = t("available", { amount: formatMoney(state.wallet + state.balance) });
    $("borrowBtn").disabled = state.status === "gameOver" || totals.availableCredit < 1000;
    $("repayBtn").disabled = state.status === "gameOver" || totals.debt <= 0;
    $("repayAllBtn").disabled = state.status === "gameOver" || totals.debt <= 0;
    $("loansEmpty").classList.toggle("hidden", state.loans.length > 0);
    $("loansBody").innerHTML = state.loans.slice().sort((a, b) => a.dueAt - b.dueAt || a.id - b.id).map((loan) => {
      const debt = loan.principal + loan.interest;
      const dueClass = loan.dueAt - state.simTime <= 300000 ? "loan-due-soon" : "";
      return `<tr><td><strong>#${loan.id}</strong>${loan.noInterest ? `<br><small class="muted">${t("interestFree")}</small>` : ""}</td>` +
        `<td class="mono">${formatMoney(loan.principal)}</td>` +
        `<td class="mono">${formatMoney(loan.interest)}</td>` +
        `<td class="mono"><strong>${formatMoney(debt)}</strong></td>` +
        `<td>${simulatedCountdown(loan.nextInterestAt)}</td>` +
        `<td class="${dueClass}">${simulatedCountdown(loan.dueAt)}</td></tr>`;
    }).join("");
  }

  function renderGameOver() {
    const isOver = state.status === "gameOver";
    $("gameOverOverlay").classList.toggle("hidden", !isOver);
    if (!isOver) {
      if (gameOverRevealTimer !== null) clearTimeout(gameOverRevealTimer);
      gameOverRevealTimer = null;
      $("stealMoneyBtn").classList.add("hidden");
      return;
    }
    if (state.rescueUsed) {
      if (gameOverRevealTimer !== null) clearTimeout(gameOverRevealTimer);
      gameOverRevealTimer = null;
      $("stealMoneyBtn").classList.add("hidden");
    } else if (gameOverRevealTimer === null && $("stealMoneyBtn").classList.contains("hidden")) {
      gameOverRevealTimer = setTimeout(() => {
        $("stealMoneyBtn").classList.remove("hidden");
        gameOverRevealTimer = null;
      }, 15000);
    }
    const insufficientFunds = state.gameOverReason === "insufficientFunds";
    $("gameOverReasonLabel").textContent = t(insufficientFunds ? "fundsExhausted" : "debtDefault");
    $("gameOverHintText").textContent = t(insufficientFunds ? "insufficientFundsHint" : "gameOverHint");
    $("gameOverMessage").textContent = insufficientFunds
      ? t("insufficientFundsMessage", {
          cash: formatMoney(state.gameOverCash),
          minimum: formatMoney(Data.minTradeMargin),
          debt: formatMoney(state.gameOverDebt)
        })
      : t("gameOverMessage", { amount: formatMoney(state.gameOverDebt) });
  }

  function renderAll() {
    if (!state) return;
    renderAccount();
    renderMarkets();
    renderTimeControls();
    renderChartHeader();
    renderTradeEstimate();
    renderPositions();
    renderHistoryAndStats();
    renderLoans();
    renderGameOver();
    drawChart();
  }

  function openPosition() {
    showError("tradeError", null);
    const result = Engine.openPosition(state, {
      symbol: state.selectedSymbol,
      side: tradeSide,
      margin: $("marginInput").value,
      leverage: $("leverageInput").value
    });
    if (!result.ok) {
      showError("tradeError", result.error);
      return;
    }
    selectedPositionId = result.position.id;
    historyDirty = true;
    Engine.checkCriticalFunds(state);
    saveState();
    showToast(t("positionOpened", { symbol: result.position.symbol, side: t(result.position.side), amount: formatMoney(result.position.margin) }));
    renderAll();
  }

  function closePosition(positionId) {
    const result = Engine.closePosition(state, positionId, "manual");
    if (!result.ok) {
      showToast(t(result.error), true);
      return;
    }
    if (selectedPositionId === Number(positionId)) selectedPositionId = null;
    historyDirty = true;
    Engine.checkCriticalFunds(state);
    saveState();
    showToast(t("positionClosed", { amount: formatMoney(result.trade.netPnl, true) }));
    renderAll();
  }

  function transfer(direction) {
    showError("transferError", null);
    const result = Engine.transfer(state, direction, $("transferAmount").value);
    if (!result.ok) {
      showError("transferError", result.error);
      return;
    }
    Engine.checkCriticalFunds(state);
    saveState();
    showToast(t("transferComplete"));
    renderAll();
  }

  function updateRisk(clear) {
    if (!selectedPositionId) {
      showError("riskError", "noSelectedPosition");
      return;
    }
    const result = Engine.setRiskLevels(
      state,
      selectedPositionId,
      clear ? null : $("stopLossInput").value,
      clear ? null : $("takeProfitInput").value
    );
    if (!result.ok) {
      showError("riskError", result.error);
      return;
    }
    showError("riskError", null);
    saveState();
    showToast(t(clear ? "riskCleared" : "riskSaved"));
    renderAll();
  }

  function addMarginToPosition() {
    if (!selectedPositionId) {
      showError("marginError", "noSelectedPosition");
      return;
    }
    showError("marginError", null);
    const result = Engine.addMargin(state, selectedPositionId, $("additionalMargin").value);
    if (!result.ok) {
      showError("marginError", result.error);
      return;
    }
    Engine.checkCriticalFunds(state);
    saveState();
    const liquidation = Engine.liquidationPrice(result.position, Engine.currentPrices(state));
    showToast(t("marginAdded", { amount: formatMoney(result.amount), price: formatPrice(result.position.symbol, liquidation) }));
    renderAll();
  }

  function borrowLoan() {
    showError("loanError", null);
    const result = Engine.borrowLoan(state, $("loanAmount").value);
    if (!result.ok) {
      showError("loanError", result.error);
      return;
    }
    Engine.checkCriticalFunds(state);
    saveState();
    showToast(t("loanBorrowed", { amount: formatMoney(result.loan.principal) }));
    renderAll();
  }

  function repayLoan(repayAll) {
    showError("loanError", null);
    const amount = repayAll ? Engine.loanTotals(state).debt : $("repaymentAmount").value;
    const result = Engine.repayDebt(state, amount);
    if (!result.ok) {
      showError("loanError", result.error);
      return;
    }
    Engine.checkCriticalFunds(state);
    saveState();
    showToast(t("loanRepaid", { amount: formatMoney(result.paid), debt: formatMoney(result.remainingDebt) }));
    renderAll();
  }

  function claimRescueLoan() {
    const result = Engine.stealMoney(state);
    if (!result.ok) {
      showToast(t(result.error), true);
      return;
    }
    saveState();
    showToast(t("rescueReceived"));
    renderAll();
  }

  function bindEvents() {
    $("startLangBtn").addEventListener("click", toggleLanguage);
    $("langBtn").addEventListener("click", toggleLanguage);
    $("startForm").addEventListener("submit", startGame);
    $("startingCapital").addEventListener("change", updateDepositLimit);
    document.querySelector(".deposit-shortcuts").addEventListener("click", (event) => {
      const button = event.target.closest("[data-deposit-percent]");
      if (!button) return;
      const capital = Number($("startingCapital").value) || Data.startingCash;
      const amount = Math.round(capital * Number(button.dataset.depositPercent)) / 100;
      $("initialDeposit").value = amount;
      $("initialDepositRange").value = amount;
      updateDepositShortcutState();
    });
    $("initialDepositRange").addEventListener("input", (event) => { $("initialDeposit").value = event.target.value; updateDepositShortcutState(); });
    $("initialDeposit").addEventListener("input", (event) => { $("initialDepositRange").value = Math.max(0, Math.min(Number($("startingCapital").value) || Data.startingCash, Number(event.target.value) || 0)); updateDepositShortcutState(); });
    $("resetBtn").addEventListener("click", restart);
    $("marketTabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-symbol]");
      if (!button) return;
      state.selectedSymbol = button.dataset.symbol;
      selectedPositionId = null;
      saveState();
      renderAll();
    });
    $("tradeSideLong").addEventListener("click", () => { tradeSide = "long"; renderChartHeader(); renderTradeEstimate(); });
    $("tradeSideShort").addEventListener("click", () => { tradeSide = "short"; renderChartHeader(); renderTradeEstimate(); });
    $("marginInput").addEventListener("input", renderTradeEstimate);
    $("leverageRange").addEventListener("input", (event) => { $("leverageInput").value = event.target.value; renderTradeEstimate(); });
    $("leverageInput").addEventListener("input", (event) => { $("leverageRange").value = Math.max(1, Math.min(Data.maxLeverage, Number(event.target.value) || 1)); renderTradeEstimate(); });
    document.querySelector(".quick-leverage").addEventListener("click", (event) => {
      const button = event.target.closest("[data-leverage]");
      if (!button) return;
      $("leverageInput").value = button.dataset.leverage;
      $("leverageRange").value = button.dataset.leverage;
      renderTradeEstimate();
    });
    document.querySelector(".quick-amounts").addEventListener("click", (event) => {
      const button = event.target.closest("[data-amount]");
      if (!button) return;
      $("marginInput").value = button.dataset.amount === "max" ? Math.max(0, Math.floor(state.balance)) : button.dataset.amount;
      renderTradeEstimate();
    });
    $("openPositionBtn").addEventListener("click", openPosition);
    $("depositBtn").addEventListener("click", () => transfer("deposit"));
    $("withdrawBtn").addEventListener("click", () => transfer("withdraw"));
    document.querySelector(".transfer-shortcuts").addEventListener("click", (event) => {
      const amountButton = event.target.closest("[data-transfer-amount]");
      const maxButton = event.target.closest("[data-transfer-max]");
      if (amountButton) $("transferAmount").value = amountButton.dataset.transferAmount;
      if (maxButton) $("transferAmount").value = Engine.roundMoney(state[maxButton.dataset.transferMax]);
    });
    document.querySelector(".loan-shortcuts").addEventListener("click", (event) => {
      const amountButton = event.target.closest("[data-loan-amount]");
      const maxButton = event.target.closest("[data-loan-max]");
      if (amountButton) $("loanAmount").value = amountButton.dataset.loanAmount;
      if (maxButton) $("loanAmount").value = Engine.loanTotals(state).availableCredit;
    });
    document.querySelector(".repayment-shortcuts").addEventListener("click", (event) => {
      const amountButton = event.target.closest("[data-repayment-amount]");
      const maxButton = event.target.closest("[data-repayment-max]");
      if (amountButton) $("repaymentAmount").value = amountButton.dataset.repaymentAmount;
      if (maxButton) $("repaymentAmount").value = Engine.roundMoney(Math.min(Engine.loanTotals(state).debt, state.wallet + state.balance));
    });
    $("borrowBtn").addEventListener("click", borrowLoan);
    $("repayBtn").addEventListener("click", () => repayLoan(false));
    $("repayAllBtn").addEventListener("click", () => repayLoan(true));
    $("gameOverRestart").addEventListener("click", restart);
    $("stealMoneyBtn").addEventListener("click", claimRescueLoan);
    $("positionsBody").addEventListener("click", (event) => {
      const closeButton = event.target.closest("[data-close-id]");
      if (closeButton) {
        event.stopPropagation();
        closePosition(closeButton.dataset.closeId);
        return;
      }
      const row = event.target.closest("[data-position-id]");
      if (!row) return;
      selectedPositionId = Number(row.dataset.positionId);
      renderPositions();
      drawChart();
    });
    $("saveRiskBtn").addEventListener("click", () => updateRisk(false));
    $("clearRiskBtn").addEventListener("click", () => updateRisk(true));
    $("addMarginBtn").addEventListener("click", addMarginToPosition);
    document.querySelector(".additional-margin-shortcuts").addEventListener("click", (event) => {
      const amountButton = event.target.closest("[data-additional-margin]");
      const maxButton = event.target.closest("[data-additional-margin-max]");
      if (amountButton) $("additionalMargin").value = amountButton.dataset.additionalMargin;
      if (maxButton) $("additionalMargin").value = Engine.roundMoney(state.balance);
    });
    $("pauseBtn").addEventListener("click", () => {
      state.paused = !state.paused;
      accumulator = 0;
      lastSchedulerTime = Date.now();
      saveState();
      renderAll();
    });
    $("normalSpeedBtn").addEventListener("click", () => { state.speed = 1; state.paused = false; accumulator = 0; saveState(); renderAll(); });
    $("fastSpeedBtn").addEventListener("click", () => { state.speed = 1.5; state.paused = false; accumulator = 0; saveState(); renderAll(); });
    window.addEventListener("resize", drawChart);
    window.addEventListener("beforeunload", () => {
      if (!state) return;
      if (state.positions.length) Engine.closeAllPositions(state, "session");
      saveState();
    });
    document.addEventListener("visibilitychange", saveState);
  }

  function scheduler() {
    const now = Date.now();
    const elapsed = Math.max(0, now - lastSchedulerTime);
    lastSchedulerTime = now;
    if (!state || state.paused || state.status === "gameOver") return;
    accumulator += elapsed * state.speed;
    const due = Math.floor(accumulator / 1000);
    if (due <= 0) return;
    const steps = Math.min(due, 600);
    accumulator -= steps * 1000;
    let closedAny = false;
    let loanActivity = false;
    for (let index = 0; index < steps; index += 1) {
      Engine.tick(state);
      const loanResult = Engine.processLoans(state);
      if (loanResult.interestCount || loanResult.settledLoanIds.length || loanResult.gameOver) loanActivity = true;
      if (loanResult.closedPositions) closedAny = true;
      if (loanResult.gameOver) break;
      const closed = Engine.checkAutoClose(state);
      if (closed.length) closedAny = true;
      const critical = Engine.checkCriticalFunds(state);
      if (critical.gameOver) {
        loanActivity = true;
        break;
      }
    }
    if (closedAny) {
      if (selectedPositionId && !state.positions.some((position) => position.id === selectedPositionId)) selectedPositionId = null;
      historyDirty = true;
    }
    if (state.tick % 5 === 0 || closedAny || loanActivity) saveState();
    renderAll();
  }

  function init() {
    bindEvents();
    applyLanguage();
    state = loadState();
    if (state) {
      language = state.language || language;
      const unsettled = state.positions.length;
      if (unsettled) Engine.closeAllPositions(state, "session");
      Engine.processLoans(state);
      Engine.checkCriticalFunds(state);
      state.paused = false;
      accumulator = 0;
      historyDirty = true;
      saveState();
      showGame();
      if (unsettled) setTimeout(() => showToast(t("sessionSettled")), 200);
    }
    setInterval(scheduler, 250);
  }

  init();
})();
