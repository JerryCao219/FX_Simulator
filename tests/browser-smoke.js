"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const Engine = require("../js/engine.js");

const root = path.resolve(__dirname, "..");
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fx-simulator-chrome-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  "--remote-debugging-port=0",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: ["ignore", "ignore", "pipe"] });

let socket;
let nextId = 1;
const pending = new Map();
const eventWaiters = new Map();
const runtimeErrors = [];
let checks = 0;

function check(name, condition) {
  assert.ok(condition, name);
  checks += 1;
  console.log("✓ " + name);
}

function waitForEvent(method, sessionId, timeout = 10000) {
  const key = `${sessionId || "browser"}:${method}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for " + key)), timeout);
    eventWaiters.set(key, { resolve, timer });
  });
}

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function evaluate(expression, sessionId) {
  const response = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true
  }, sessionId);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result.value;
}

async function main() {
  const browserWsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("Chrome DevTools endpoint was not announced")), 15000);
    chrome.stderr.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    chrome.once("error", reject);
    chrome.once("exit", (code) => {
      if (code) reject(new Error("Chrome exited with code " + code));
    });
  });

  socket = new WebSocket(browserWsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
    const key = `${message.sessionId || "browser"}:${message.method}`;
    const waiter = eventWaiters.get(key);
    if (waiter) {
      clearTimeout(waiter.timer);
      eventWaiters.delete(key);
      waiter.resolve(message.params);
    }
  });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  }, sessionId);
  const loaded = waitForEvent("Page.loadEventFired", sessionId);
  await send("Page.navigate", { url: pathToFileURL(path.join(root, "index.html")).href }, sessionId);
  await loaded;

  check("new-game screen renders", await evaluate("!document.getElementById('startScreen').classList.contains('hidden')", sessionId));
  check("creator credit is fixed at the bottom-right", await evaluate("var c=document.querySelector('.made-by'); c.textContent==='Made by Jerry Cao' && getComputedStyle(c).position==='fixed' && getComputedStyle(c).right==='14px' && getComputedStyle(c).bottom==='10px'", sessionId));
  check("both game modes are available", await evaluate("document.querySelectorAll('input[name=gameMode]').length === 2", sessionId));
  check("seven starting-capital choices including ¥300K are available", await evaluate("document.querySelectorAll('#startingCapital option').length === 7 && document.querySelector('#startingCapital option[value=\"300000\"]') !== null", sessionId));
  await evaluate("var c=document.getElementById('startingCapital'); c.value='20000000'; c.dispatchEvent(new Event('change'));", sessionId);
  const depositShortcuts = await evaluate("var values=[]; [10,15,50,75,100].forEach(p => { document.querySelector('[data-deposit-percent=\"'+p+'\"]').click(); values.push(document.getElementById('initialDeposit').value); }); values.join(',')", sessionId);
  check("all five deposit shortcuts use the selected starting capital", depositShortcuts === "2000000,3000000,10000000,15000000,20000000");
  await evaluate("var c=document.getElementById('startingCapital'); c.value='100000000'; c.dispatchEvent(new Event('change')); document.querySelector('[data-deposit-percent=\"10\"]').click();", sessionId);

  await evaluate("document.querySelector('input[value=risk]').click(); document.getElementById('startForm').requestSubmit();", sessionId);
  const initial = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", sessionId);
  check("risk mode and initial allocation are saved", initial.mode === "risk" && initial.balance === 10000000 && initial.wallet === 90000000 && initial.startingCash === 100000000);
  check("a historical starting-rate snapshot is selected", await evaluate("FXData.snapshots.some(s => s.date === JSON.parse(localStorage.getItem('fx-simulator-save-v1')).snapshotDate)", sessionId));
  check("exactly 20 ECB snapshots are built in", await evaluate("FXData.snapshots.length === 20", sessionId));
  check("profitable-close fee is displayed as 0.5%", await evaluate("document.querySelector('.fee-note').textContent.includes('0.5%')", sessionId));
  check("all ten markets including JPY/AUD are displayed", await evaluate("document.querySelectorAll('#marketTabs .market-tab').length === 10 && document.querySelector('[data-symbol=\"JPY/AUD\"]') !== null", sessionId));
  check("fund transfer is below history and positions", await evaluate("var h=document.querySelector('.history-panel'); var p=document.querySelector('.positions-panel'); var f=document.querySelector('.transfer-panel-bottom'); Boolean((h.compareDocumentPosition(f)&Node.DOCUMENT_POSITION_FOLLOWING) && (p.compareDocumentPosition(f)&Node.DOCUMENT_POSITION_FOLLOWING))", sessionId));
  check("game screen is visible", await evaluate("!document.getElementById('gameScreen').classList.contains('hidden')", sessionId));
  check("chart hides market-phase labels", await evaluate("!/(上涨阶段|下跌阶段|震荡阶段|Upward phase|Downward phase|Sideways phase)/.test(document.getElementById('chartTime').textContent)", sessionId));
  check("chart canvas has dimensions", await evaluate("var c=document.getElementById('chartCanvas'); c.width>500 && c.height>300", sessionId));

  await evaluate("document.querySelector('[data-leverage=\"1000\"]').click(); document.querySelector('[data-amount=\"1000000\"]').click(); document.getElementById('openPositionBtn').click();", sessionId);
  let saved = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", sessionId);
  check("margin shortcuts do not alter selected 1000× leverage", saved.positions.length === 1 && saved.balance === 9000000 && saved.positions[0].leverage === 1000);
  check("position table and liquidation level render", await evaluate("document.querySelectorAll('#positionsBody tr').length===1 && document.getElementById('positionsBody').textContent.includes('1000')", sessionId));
  await evaluate("document.querySelector('[data-additional-margin-max]').click()", sessionId);
  check("additional-margin MAX uses available trading cash", await evaluate("document.getElementById('additionalMargin').value==='9000000'", sessionId));
  const marginMoved = await evaluate("var marginState=JSON.parse(localStorage.getItem('fx-simulator-save-v1')); var oldLine=FXEngine.liquidationPrice(marginState.positions[0],FXEngine.currentPrices(marginState)); document.getElementById('additionalMargin').value=500000; document.getElementById('addMarginBtn').click(); var updatedState=JSON.parse(localStorage.getItem('fx-simulator-save-v1')); var newLine=FXEngine.liquidationPrice(updatedState.positions[0],FXEngine.currentPrices(updatedState)); updatedState.positions[0].margin===1500000 && updatedState.balance===8500000 && newLine<oldLine", sessionId);
  check("adding margin lowers the long liquidation line", marginMoved);

  await evaluate("var s=JSON.parse(localStorage.getItem('fx-simulator-save-v1')); var p=s.markets['USD/JPY'].price; document.getElementById('stopLossInput').value=p-1; document.getElementById('takeProfitInput').value=p+1; document.getElementById('saveRiskBtn').click();", sessionId);
  saved = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", sessionId);
  check("stop-loss and take-profit can be edited", saved.positions[0].stopLoss !== null && saved.positions[0].takeProfit !== null);

  const screenshot = await send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
  fs.writeFileSync(path.join(root, "screenshot.png"), Buffer.from(screenshot.data, "base64"));

  await evaluate("document.querySelector('[data-close-id]').click()", sessionId);
  saved = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", sessionId);
  check("manual close realizes the position into history", saved.positions.length === 0 && saved.history.length === 1 && saved.history[0].reason === "manual");

  await evaluate("document.getElementById('transferAmount').value=1000000; document.getElementById('withdrawBtn').click()", sessionId);
  saved = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", sessionId);
  check("wallet withdrawal updates both balances", saved.wallet === 91000000);
  await evaluate("document.querySelector('[data-transfer-max=\"wallet\"]').click()", sessionId);
  check("wallet MAX shortcut uses the full wallet balance", await evaluate("document.getElementById('transferAmount').value==='91000000'", sessionId));
  await evaluate("document.querySelector('[data-transfer-max=\"balance\"]').click()", sessionId);
  check("trading MAX shortcut uses the available trading balance", await evaluate("document.getElementById('transferAmount').value===String(FXEngine.accountTotals(JSON.parse(localStorage.getItem('fx-simulator-save-v1'))).balance)", sessionId));
  await evaluate("document.querySelector('[data-loan-max]').click()", sessionId);
  check("loan MAX shortcut uses all remaining credit", await evaluate("document.getElementById('loanAmount').value==='500000000'", sessionId));

  await evaluate("document.getElementById('loanAmount').value=10000000; document.getElementById('borrowBtn').click()", sessionId);
  saved = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", sessionId);
  check("borrowing credits the wallet and displays an active loan", saved.wallet === 101000000 && saved.loans.length === 1 && saved.loans[0].principal === 10000000 && await evaluate("document.querySelectorAll('#loansBody tr').length === 1", sessionId));
  await evaluate("document.querySelector('[data-repayment-max]').click()", sessionId);
  check("repayment MAX shortcut uses the current debt", await evaluate("document.getElementById('repaymentAmount').value==='10000000'", sessionId));
  await evaluate("document.getElementById('repayAllBtn').click()", sessionId);
  saved = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", sessionId);
  check("repay-all clears the debt and restores available cash", saved.wallet === 91000000 && saved.loans.length === 0);

  await evaluate("document.getElementById('langBtn').click()", sessionId);
  check("interface switches to English", await evaluate("document.documentElement.lang==='en' && document.getElementById('walletValue').previousElementSibling?.textContent!=='钱包余额'", sessionId));
  check("quick amounts use K and M in English", await evaluate("document.querySelector('[data-amount=\"100000\"]').textContent==='100K' && document.querySelector('[data-amount=\"1000000\"]').textContent==='1M' && document.querySelector('[data-amount=\"10000000\"]').textContent==='10M'", sessionId));

  await evaluate("document.getElementById('fastSpeedBtn').click(); document.getElementById('pauseBtn').click()", sessionId);
  saved = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", sessionId);
  check("1.5× speed and pause controls persist", saved.speed === 1.5 && saved.paused === true);

  await evaluate("document.getElementById('openPositionBtn').click(); window.dispatchEvent(new Event('beforeunload'));", sessionId);
  saved = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", sessionId);
  check("exit settlement closes remaining positions", saved.positions.length === 0 && saved.history[0].reason === "session");

  const reloaded = waitForEvent("Page.loadEventFired", sessionId);
  await evaluate("window.confirm=()=>true; document.getElementById('resetBtn').click();", sessionId);
  await reloaded;
  check("full restart clears the save and returns to mode selection", await evaluate("document.getElementById('startScreen') && !document.getElementById('startScreen').classList.contains('hidden') && localStorage.getItem('fx-simulator-save-v1')===null", sessionId));

  await evaluate("var c=document.getElementById('startingCapital'); c.value='3000000'; c.dispatchEvent(new Event('change')); document.getElementById('startForm').requestSubmit(); document.querySelector('[data-symbol=\"HKD/CNY\"]').click(); document.getElementById('openPositionBtn').click();", sessionId);
  saved = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", sessionId);
  check("custom capital and HKD/CNY work in classic mode", saved.mode === "classic" && saved.startingCash === 3000000 && saved.positions.length === 1 && saved.positions[0].symbol === "HKD/CNY" && await evaluate("document.getElementById('riskEditor').classList.contains('hidden')", sessionId));
  await evaluate("document.querySelector('[data-loan-max]').click()", sessionId);
  check("3M starting capital has a 30M loan MAX", await evaluate("document.getElementById('loanAmount').value==='30000000'", sessionId));
  await evaluate("document.getElementById('loanAmount').value=1000; document.getElementById('borrowBtn').click(); document.getElementById('transferAmount').value=1000; document.getElementById('depositBtn').click(); document.querySelector('[data-symbol=\"JPY/AUD\"]').click(); document.querySelector('[data-amount=\"max\"]').click(); document.getElementById('openPositionBtn').click();", sessionId);
  saved = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", sessionId);
  check("JPY/AUD positions can be opened", saved.positions.some((position) => position.symbol === "JPY/AUD"));
  check("open-position equity prevents a false bankruptcy popup", saved.status === "playing" && saved.gameOverCash === 0 && await evaluate("document.getElementById('gameOverOverlay').classList.contains('hidden')", sessionId));
  check("no uncaught browser runtime errors", runtimeErrors.length === 0);

  const rescueState = Engine.createGame("classic", 300000, Date.now(), () => 0.5, 300000);
  rescueState.wallet = 0;
  rescueState.balance = 0;
  rescueState.loans = [{
    id: 1,
    principal: 1000,
    interest: 0,
    borrowedAt: rescueState.simTime,
    nextInterestAt: rescueState.simTime + 120000,
    dueAt: rescueState.simTime + 600000
  }];
  rescueState.nextLoanId = 2;
  rescueState.status = "gameOver";
  rescueState.gameOverReason = "insufficientFunds";
  rescueState.gameOverAt = rescueState.simTime;
  rescueState.gameOverDebt = 1000;
  rescueState.gameOverCash = 0;
  const rescueTarget = await send("Target.createTarget", { url: "about:blank" });
  const rescueAttach = await send("Target.attachToTarget", { targetId: rescueTarget.targetId, flatten: true });
  const rescueSession = rescueAttach.sessionId;
  await send("Page.enable", {}, rescueSession);
  await send("Runtime.enable", {}, rescueSession);
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `if (location.protocol === 'file:') { localStorage.setItem('fx-simulator-save-v1', ${JSON.stringify(JSON.stringify(rescueState))}); }`
  }, rescueSession);
  const rescueLoaded = waitForEvent("Page.loadEventFired", rescueSession);
  await send("Page.navigate", { url: pathToFileURL(path.join(root, "index.html")).href }, rescueSession);
  await rescueLoaded;
  check("rescue option is initially hidden on the game-over screen", await evaluate("!document.getElementById('gameOverOverlay').classList.contains('hidden') && document.getElementById('stealMoneyBtn').classList.contains('hidden')", rescueSession));
  await new Promise((resolve) => setTimeout(resolve, 15500));
  check("rescue option appears after 15 seconds", await evaluate("!document.getElementById('stealMoneyBtn').classList.contains('hidden')", rescueSession));
  await evaluate("document.getElementById('stealMoneyBtn').click()", rescueSession);
  const rescued = await evaluate("JSON.parse(localStorage.getItem('fx-simulator-save-v1'))", rescueSession);
  check("rescue restores play and adds an interest-free lowest-priority loan", rescued.status === "playing" && rescued.wallet === 3000000 && rescued.rescueUsed === true && rescued.loans.some((loan) => loan.noInterest && loan.lowestPriority && loan.principal === 3000000) && await evaluate("document.getElementById('gameOverOverlay').classList.contains('hidden')", rescueSession));
  check("no uncaught browser runtime errors after rescue", runtimeErrors.length === 0);

  console.log(`\n${checks} browser checks passed. Screenshot saved to screenshot.png.`);
  await send("Browser.close");
}

main().catch(async (error) => {
  console.error(error);
  if (socket && socket.readyState === WebSocket.OPEN) {
    try { await send("Browser.close"); } catch {}
  } else {
    chrome.kill();
  }
  process.exitCode = 1;
});
