// ==UserScript==
// @name         Steam Market Listings Group
// @namespace    https://steamcommunity.com/
// @version      3.0.2
// @description  增强Steam原版挂单列表，支持按价格/按日期/原版显示、多选、批量下架与改价重新上架
// @author       RayRoad
// @match        *://steamcommunity.com/market/listings/*
// @homepageURL  https://keylol.com/t1045939-1-1
// @updateURL    https://greasyfork.org/zh-CN/scripts/590179-steam-market-listings-group
// @downloadURL  https://greasyfork.org/zh-CN/scripts/590179-steam-market-listings-group/code/Steam%20Market%20Listings%20Group.user.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(() => {
  "use strict";

  // ── Configuration ──────────────────────────────────────
  const CONFIG = {
    minOrders: GM_getValue("minOrders", 0),
  };

  // 已知游戏的非默认 contextid 映射（其余游戏默认 context 为 2，Steam 社区物品为 6）
  const KNOWN_APP_CONTEXT = { 753: "6" };
  const DEFAULT_CONTEXT_ID = "2";

  // 2025年12月Steam市场规则变更：这些货币手续费用 Math.round 而非 Math.floor
  const CURRENCY_CODES_TO_ROUND = ["JPY", "IDR", "UAH", "CLP", "COP", "TWD", "KZT", "CRC", "UYU", "KRW", "VND"];
  // wallet_currency ID → 货币代码（部分：25/32/33/37 经真实环境验证；宁缺毋错，未收录 id 走符号推断）
  const CURRENCY_ID_TO_CODE = {
    1: "USD",
    2: "GBP",
    3: "EUR",
    4: "CHF",
    5: "RUB",
    6: "PLN",
    7: "BRL",
    9: "NOK",
    10: "IDR",
    11: "MYR",
    12: "PHP",
    13: "SGD",
    14: "THB",
    15: "VND",
    16: "KRW",
    17: "TRY",
    18: "UAH",
    19: "MXN",
    20: "CAD",
    21: "AUD",
    22: "NZD",
    25: "CNY",
    32: "TWD",
    33: "HKD",
    37: "JPY",
  };
  // 2025年12月Steam变更：单笔手续费最低额提高到 $0.01 等值（国区 ¥0.07，旧值 0.01 元）；
  // 已用真实挂单数据验证：到手 0.85 → 买方 1.00（Steam费4 + 发行商费8），到手 0.60 → 买方 0.74（两费各按最低 0.07）
  // 仅收录有实测数据佐证的货币；其余货币依赖 wallet_fee_minimum，不臆造数值
  const MIN_FEE_BY_CURRENCY = { CNY: 7 };
  // 货币元数据：小数位数与符号格式（最低货币单位换算因子 unit = 10^decimals）；
  // 未收录货币回退 {decimals:2, symbol:'$', prefix:true}（USD 规则）
  const CURRENCY_META = {
    USD: { decimals: 2, symbol: "$", prefix: true },
    EUR: { decimals: 2, symbol: "€", prefix: true },
    GBP: { decimals: 2, symbol: "£", prefix: true },
    CNY: { decimals: 2, symbol: "¥", prefix: true },
    JPY: { decimals: 0, symbol: "¥", prefix: true },
    KRW: { decimals: 0, symbol: "₩", prefix: true },
    RUB: { decimals: 2, symbol: "₽", prefix: true },
    BRL: { decimals: 2, symbol: "R$", prefix: true },
    MXN: { decimals: 2, symbol: "MX$", prefix: true },
    CAD: { decimals: 2, symbol: "C$", prefix: true },
    AUD: { decimals: 2, symbol: "A$", prefix: true },
    NZD: { decimals: 2, symbol: "NZ$", prefix: true },
    CHF: { decimals: 2, symbol: "CHF", prefix: true },
    HKD: { decimals: 2, symbol: "HK$", prefix: true },
    TWD: { decimals: 0, symbol: "NT$", prefix: true },
    THB: { decimals: 2, symbol: "฿", prefix: true },
    INR: { decimals: 2, symbol: "₹", prefix: true },
    IDR: { decimals: 0, symbol: "Rp", prefix: true },
    MYR: { decimals: 2, symbol: "RM", prefix: true },
    PHP: { decimals: 2, symbol: "₱", prefix: true },
    SGD: { decimals: 2, symbol: "S$", prefix: true },
    TRY: { decimals: 2, symbol: "₺", prefix: true },
    UAH: { decimals: 2, symbol: "₴", prefix: true },
    VND: { decimals: 0, symbol: "₫", prefix: false },
    ZAR: { decimals: 2, symbol: "R", prefix: true },
    NOK: { decimals: 2, symbol: "kr", prefix: false },
    SEK: { decimals: 2, symbol: "kr", prefix: false },
    DKK: { decimals: 2, symbol: "kr", prefix: false },
    PLN: { decimals: 2, symbol: "zł", prefix: false },
    CZK: { decimals: 2, symbol: "Kč", prefix: false },
    AED: { decimals: 2, symbol: "AED", prefix: true },
    SAR: { decimals: 2, symbol: "SAR", prefix: true },
    ILS: { decimals: 2, symbol: "₪", prefix: true },
    CLP: { decimals: 0, symbol: "$", prefix: true },
    COP: { decimals: 0, symbol: "$", prefix: true },
    CRC: { decimals: 0, symbol: "₡", prefix: true },
    UYU: { decimals: 2, symbol: "$U", prefix: true },
    KZT: { decimals: 2, symbol: "₸", prefix: true },
    QAR: { decimals: 2, symbol: "QR", prefix: true },
    KWD: { decimals: 3, symbol: "KD", prefix: true },
  };
  // 价格字符串前缀 → 货币代码（无钱包信息的新版 SSR 页面用；匹配时最长前缀优先）
  const SYMBOL_TO_CODE = {
    "¥": "CNY",
    "￥": "CNY",
    "€": "EUR",
    "£": "GBP",
    "₩": "KRW",
    "₽": "RUB",
    "₹": "INR",
    "₺": "TRY",
    "₴": "UAH",
    "฿": "THB",
    "₱": "PHP",
    "₡": "CRC",
    "₸": "KZT",
    "₪": "ILS",
    "₫": "VND",
    R$: "BRL",
    MX$: "MXN",
    C$: "CAD",
    A$: "AUD",
    NZ$: "NZD",
    HK$: "HKD",
    NT$: "TWD",
    S$: "SGD",
    RM: "MYR",
    zł: "PLN",
    Kč: "CZK",
    kr: "SEK",
    $: "USD",
  };

  GM_registerMenuCommand("\u2699 \u8BBE\u7F6E\u6700\u5C11\u68C0\u6D4B\u4E0A\u67B6\u6570\u91CF\u9608\u503C", () => {
    const val = prompt(
      `\u8BF7\u8F93\u5165\u6700\u5C11\u68C0\u6D4B\u4E0A\u67B6\u6570\u91CF\u9608\u503C\uFF08\u5F53\u524D: ${CONFIG.minOrders}\uFF09\n\u4E0A\u67B6\u5546\u54C1\u6570 \u2264 \u6B64\u503C\u65F6\u4E0D\u663E\u793A\u6C47\u603B\u9762\u677F`,
      String(CONFIG.minOrders),
    );
    if (val === null) return;
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) {
      alert("\u8BF7\u8F93\u5165\u6709\u6548\u7684\u975E\u8D1F\u6574\u6570");
      return;
    }
    CONFIG.minOrders = num;
    GM_setValue("minOrders", num);
    alert(`\u5DF2\u4FDD\u5B58\uFF0C\u9608\u503C: ${num}\u3002\u5237\u65B0\u9875\u9762\u540E\u751F\u6548`);
  });

  // ── Styles ──────────────────────────────────────────────

  GM_addStyle(`
    .smg-price-input {
      background: #31404d; border: 1px solid #3d4450; color: #c7d5e0;
      padding: 6px 10px; border-radius: 3px; font-size: 14px; width: 140px; text-align: center;
    }
    .smg-relist-price-grid {
      display: grid; grid-template-columns: 1fr 1fr; column-gap: 14px; row-gap: 6px; margin-bottom: 10px;
    }
    .smg-relist-price-label {
      color: #8f98a0; font-size: 13px; white-space: nowrap;
    }
    .smg-relist-price-grid .smg-price-input { width: 100%; box-sizing: border-box; }
    .smg-delist-status { color: #8f98a0; font-size: 12px; margin-top: 8px; }
    .smg-delist-status.smg-error { color: #e44; }
    .smg-delist-status.smg-ok { color: #5c7; }

    /* ── Loading overlay ── */
    #smg-loading {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 99998;
      background: rgba(27,40,56,.85);
      display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 16px;
      transition: opacity .25s ease;
    }
    #smg-loading.smg-fade-out { opacity: 0; pointer-events: none; }
    .smg-spinner {
      width: 36px; height: 36px;
      border: 3px solid rgba(102,192,244,.2); border-top-color: #66c0f4;
      border-radius: 50%; animation: smg-spin .7s linear infinite;
    }
    @keyframes smg-spin { to { transform: rotate(360deg); } }
    .smg-loading-text { color: #8f98a0; font-size: 13px; font-family: "Motiva Sans", Arial, sans-serif; }

    /* ── Confirm dialog ── */
    .smg-confirm-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 99999;
      background: rgba(0,0,0,.6);
      display: flex; align-items: center; justify-content: center;
    }
    .smg-confirm-box {
      background: var(--color-dull-5, #1d1f23); border: 1px solid #48505e; border-radius: 3px;
      padding: 24px 28px; max-width: 400px; width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
    }
    .smg-confirm-title { color: #66c0f4; font-size: 15px; font-weight: 600; margin-bottom: 12px; }
    .smg-confirm-body { color: #c7d5e0; font-size: 13px; line-height: 1.6; margin-bottom: 20px; }
    .smg-confirm-body strong { color: #fff; }
    .smg-confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .smg-confirm-btn {
      padding: 6px 20px; border-radius: 3px; font-size: 13px; cursor: pointer;
      border: 1px solid #3d4450; transition: all .15s;
    }
    .smg-confirm-cancel { background: #31404d; color: #c7d5e0; }
    .smg-confirm-cancel:hover { background: #3d4f60; }
    .smg-confirm-ok {
      background: linear-gradient(180deg, #c44 0%, #a33 100%); color: #fff; border-color: #a33;
    }
    .smg-confirm-ok:hover { opacity: .85; }
    .smg-confirm-blue {
      background: linear-gradient(180deg, #66c0f4 0%, #417a9b 100%); color: #fff; border-color: #417a9b;
    }
    .smg-confirm-blue:hover { opacity: .85; }

    /* ── Delist progress bar ── */
    .smg-progress-wrap {
      margin-top: 8px; height: 6px; background: #31404d;
      border-radius: 3px; overflow: hidden; display: none;
    }
    .smg-progress-wrap.smg-visible { display: block; }
    .smg-progress-bar {
      height: 100%; background: linear-gradient(90deg, #66c0f4, #5c7);
      border-radius: 3px; transition: width .15s ease; width: 0%;
    }

    /* ── Toast notifications ── */
    .smg-toast-container {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      z-index: 99999; display: flex; flex-direction: column-reverse;
      gap: 8px; align-items: center; pointer-events: none;
    }
    .smg-toast {
      background: #1b2838; border: 1px solid #3d4450; border-radius: 4px;
      padding: 10px 20px; font-size: 13px; color: #c7d5e0;
      font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,.4);
      pointer-events: auto; opacity: 0; transform: translateY(12px);
      transition: opacity .3s, transform .3s;
    }
    .smg-toast.smg-toast-show { opacity: 1; transform: translateY(0); }
    .smg-toast.smg-toast-hide { opacity: 0; transform: translateY(12px); }
    .smg-toast.smg-ok { border-color: #5c7; color: #5c7; }
    .smg-toast.smg-error { border-color: #e44; color: #e44; }
    /* 直接使用示例页的 Steam CSS 变量和原容器，原版列表节点保持不变。 */
    #smg-root { width:100%; min-width:0; }
    #smg-panel { box-sizing:border-box; background:transparent; border:0; border-radius:0; margin:0; padding:8px; width:100%; font-family:inherit; color:var(--color-text-body, #acb2b8); }
    #smg-root [hidden], .smg-native-grid[hidden], .smg-native-grid [hidden] { display:none !important; }
    .smg-header { display:flex; align-items:center; justify-content:flex-start; gap:12px; margin-bottom:8px; flex-wrap:wrap; }
    .smg-title { font:inherit; font-size:18px; font-weight:600; color:var(--color-text-body-title,#f1f2f3); }
    #smg-toggle { margin-left:auto; }
    .smg-toolbar { display:flex; gap:8px 12px; align-items:center; flex-wrap:wrap; padding:8px 0; }
    .smg-modes { display:flex; gap:2px; }
    #smg-root button, .smg-native-grid button { font:inherit; font-size:13px; min-height:32px; padding:5px 12px; border:1px solid transparent; border-radius:2px; color:var(--color-text-body-title,#f1f2f3); background:rgba(72,80,94,.35); cursor:pointer; }
    #smg-root button:hover, .smg-native-grid button:hover { background:rgba(72,80,94,.65); }
    /* 同类操作统一配色，覆盖工具栏、聚合行及原版行操作弹窗。 */
    #smg-root :is(#smg-selected-delist, #smg-delist-all-btn, [data-smg-action="delist"]),
    .smg-native-actions [data-action="delist"] { background:#a33138; border-color:#c44c55; color:#fff; }
    #smg-root :is(#smg-selected-delist, #smg-delist-all-btn, [data-smg-action="delist"]):hover:not(:disabled),
    .smg-native-actions [data-action="delist"]:hover:not(:disabled) { background:#bd3b44; }
    #smg-root :is(#smg-selected-relist, #smg-relist-all-btn, [data-smg-action="relist"]),
    .smg-native-actions [data-action="relist"] { background:#216394; border-color:#3885ba; color:#fff; }
    #smg-root :is(#smg-selected-relist, #smg-relist-all-btn, [data-smg-action="relist"]):hover:not(:disabled),
    .smg-native-actions [data-action="relist"]:hover:not(:disabled) { background:#287bb5; }
    #smg-root button[aria-pressed="true"] { background:var(--color-accent-8,#1a9fff); color:#fff; }
    #smg-root button:disabled, .smg-native-grid button:disabled { opacity:.45; cursor:default; }
    #smg-root :focus-visible, .smg-native-grid :focus-visible { outline:2px solid var(--color-accent-8,#1a9fff); outline-offset:2px; }
    #smg-root input[type="checkbox"], .smg-native-select { width:18px; height:18px; accent-color:var(--color-accent-8,#1a9fff); cursor:pointer; flex-shrink:0; }
    .smg-select-label { display:flex; align-items:center; gap:6px; padding:5px 0; }
    #smg-selection-count { color:var(--color-text-body-title,#f1f2f3); }
    .smg-all-actions { display:flex; flex-wrap:wrap; gap:8px; margin-left:auto; justify-content:flex-end; }
    .smg-totals { display:flex; gap:8px; flex-wrap:wrap; padding:8px 0 12px; font-size:13px; }
    .smg-totals span { margin-left:auto; }
    .smg-table-wrap { overflow-x:auto; }
    .smg-table { width:100%; border-collapse:separate; border-spacing:0 4px; }
    .smg-table th, .smg-table td { padding:6px 8px; border:0; background:rgba(72,80,94,.2); color:inherit; text-align:center; font-size:13px; }
    .smg-table th { font-weight:500; }
    .smg-table th:nth-child(2), .smg-table td:nth-child(2) { text-align:left; }
    .smg-table tr:hover td { background:rgba(72,80,94,.32); }
    .smg-item { display:flex; align-items:center; gap:8px; min-width:180px; }
    .smg-item img { object-fit:contain; }
    .smg-item strong { display:block; color:var(--color-text-body-title,#f1f2f3); font-weight:500; }
    .smg-item span, .smg-note { display:block; font-size:12px; color:var(--color-text-body-subtitle,#acb2b8); margin-top:4px; }
    .smg-date, .smg-money { white-space:nowrap; font-variant-numeric:tabular-nums; }
    .smg-row-actions { white-space:nowrap; }
    .smg-row-actions button + button { margin-left:4px; }
    .smg-native-grid > :first-child { display:none !important; }
    .smg-native-grid [style*="--grid-columns: subgrid"] > :first-child { display:flex; align-items:center; gap:8px; }
    .smg-native-select { margin:0 4px; }
    @media (max-width:700px) { .smg-toolbar { gap:8px; } .smg-item { min-width:130px; } .smg-row-actions button { display:block; margin:4px 0 !important; } #smg-panel { padding:4px; } }
    @media (prefers-reduced-motion:reduce) { .smg-toast, .smg-progress-bar { transition:none; } .smg-spinner { animation:none; } }

  `);

  // ── Utility ─────────────────────────────────────────────

  function escapeHtml(str) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return str.replace(/[&<>"']/g, (c) => map[c]);
  }

  function formatDateParts(ts) {
    const d = new Date(ts * 1000);
    return {
      y: d.getFullYear(),
      m: String(d.getMonth() + 1).padStart(2, "0"),
      day: String(d.getDate()).padStart(2, "0"),
      h: String(d.getHours()).padStart(2, "0"),
      min: String(d.getMinutes()).padStart(2, "0"),
    };
  }

  function tsToDateKey(ts) {
    const { y, m, day } = formatDateParts(ts);
    return `${y}-${m}-${day}`;
  }

  function tsToDateTime(ts) {
    const { y, m, day, h, min } = formatDateParts(ts);
    return `${y}-${m}-${day} ${h}:${min}`;
  }

  // ── sessionid ────────────────────────────────────

  // 从任意文本中提取 sessionid（兼容转义引号 \"、大小写变体 sessionID/sessionId）；
  // Steam sessionid 为 8–48 位十六进制串
  function extractSessionIdFromText(text) {
    if (!text) return "";
    const patterns = [
      /g_sessionID\s*[:=]\s*\\?\s*["']([0-9a-fA-F]{8,48})\\?["']/,
      /\\?["']g_sessionID\\?["']\s*\\?\s*:\s*\\?["']([0-9a-fA-F]{8,48})\\?["']/,
      /\\?["']session[-_]?id\\?["']\s*\\?\s*:\s*\\?["']([0-9a-fA-F]{8,48})\\?["']/i,
      /name=["']sessionid["']\s+content=["']([0-9a-fA-F]{8,48})["']/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) return m[1];
    }
    return "";
  }

  // 递归扫描对象树中的 sessionid 字段（含嵌套 JSON 字符串内的转义形式）
  function findSessionId(node, depth) {
    if (!node || depth > 8) return "";
    if (typeof node === "string") {
      return node.length > 20 ? extractSessionIdFromText(node) : "";
    }
    if (typeof node !== "object") return "";
    if (Array.isArray(node)) {
      for (const v of node) {
        const r = findSessionId(v, depth + 1);
        if (r) return r;
      }
      return "";
    }
    for (const [k, v] of Object.entries(node)) {
      if (/^session[-_]?id$/i.test(k) && typeof v === "string" && /^[0-9a-fA-F]{8,48}$/.test(v)) return v;
    }
    for (const v of Object.values(node)) {
      const r = findSessionId(v, depth + 1);
      if (r) return r;
    }
    return "";
  }

  function scanSSRForSessionId() {
    try {
      if (unsafeWindow.SSR) {
        const r = findSessionId(unsafeWindow.SSR, 0);
        if (r) return r;
      }
    } catch (e) {
      /* SSR 结构不可遍历 */
    }
    return "";
  }

  // 本地同步来源：旧版全局变量 → meta 标签 → cookie → SSR 深度扫描 → 页面源码正则
  let _sessionIdCache = "";
  function getSessionId() {
    if (_sessionIdCache) return _sessionIdCache;
    let sid = "";
    try {
      sid = unsafeWindow.g_sessionID || "";
    } catch (e) {
      /* 旧版全局变量可能不存在 */
    }
    if (!sid) {
      const meta = document.querySelector('meta[name="sessionid"]');
      if (meta && meta.content) sid = meta.content;
    }
    if (!sid) {
      const match = document.cookie.match(/(^|;\s*)sessionid=([^;]+)/);
      if (match) sid = decodeURIComponent(match[2]);
    }
    if (!sid) sid = scanSSRForSessionId();
    if (!sid) sid = extractSessionIdFromText(document.documentElement.innerHTML);
    if (sid) _sessionIdCache = sid;
    return sid;
  }

  // 本地全部落空时（新版 SSR 页面可能完全不含 sessionid）：拉取其他 Steam 页面提取
  async function fetchSessionIdFromRemote() {
    for (const url of ["https://steamcommunity.com/my/inventory", "https://steamcommunity.com/market/"]) {
      try {
        const resp = await fetch(url, { credentials: "include", redirect: "follow" });
        if (!resp.ok) continue;
        const sid = extractSessionIdFromText(await resp.text());
        if (sid) {
          console.log(`[SMG] sessionid resolved via remote fetch: ${url}`);
          return sid;
        }
      } catch (e) {
        console.warn(`[SMG] sessionid remote fetch failed: ${url}`, e);
      }
    }
    return "";
  }

  // 批量操作统一入口：同步本地链 → 异步远端兜底；成功结果缓存到会话结束
  async function resolveSessionId() {
    let sid = getSessionId();
    if (!sid) {
      sid = await fetchSessionIdFromRemote();
      if (sid) _sessionIdCache = sid;
    }
    if (sid) {
      console.log("[SMG] sessionid resolved");
    } else {
      console.warn("[SMG] sessionid not found via g_sessionID / meta / cookie / SSR scan / page source / remote fetch");
    }
    return sid;
  }

  // ── Currency ────────────────────────────────────

  // 货币在会话内恒定：main() 提取订单后一次性解析，后续格式化/解析/费用计算共用同一 meta
  let currencyMeta = null;

  function buildCurrencyMeta(code) {
    const spec = CURRENCY_META[code] || { decimals: 2, symbol: "$", prefix: true };
    return { code, decimals: spec.decimals, unit: Math.pow(10, spec.decimals), symbol: spec.symbol, prefix: spec.prefix };
  }

  // 价格字符串前缀 → 货币代码（最长前缀优先，如 MX$ 先于 $）
  function detectCodeBySymbol(priceStr) {
    if (!priceStr) return "";
    const symbols = Object.keys(SYMBOL_TO_CODE).sort((a, b) => b.length - a.length);
    for (const sym of symbols) {
      if (priceStr.startsWith(sym)) return SYMBOL_TO_CODE[sym];
    }
    return "";
  }

  // 货币解析优先级：① 钱包信息（wallet_currency ID → GetCurrencyCode/本地映射）
  // → ② 订单价格符号推断（新版 SSR 页面常见无钱包信息）→ ③ USD 默认规则
  function resolveCurrency() {
    try {
      const wi = unsafeWindow.g_rgWalletInfo;
      if (wi && wi.wallet_currency != null) {
        let code = "";
        try {
          if (typeof unsafeWindow.GetCurrencyCode === "function") code = unsafeWindow.GetCurrencyCode(wi.wallet_currency) || "";
        } catch (e) {
          /* 使用本地映射表 */
        }
        code = code || CURRENCY_ID_TO_CODE[wi.wallet_currency] || "";
        if (code) {
          currencyMeta = buildCurrencyMeta(code);
          console.log(`[SMG] Currency resolved: ${code} (via wallet info)`);
          return currencyMeta;
        }
      }
    } catch (e) {
      /* 继续符号推断 */
    }

    const sample = allOrders && allOrders[0] ? allOrders[0].buyerPrice || allOrders[0].sellerPrice || "" : "";
    const code = detectCodeBySymbol(sample);
    if (code) {
      currencyMeta = buildCurrencyMeta(code);
      console.log(`[SMG] Currency resolved: ${code} (via symbol)`);
      return currencyMeta;
    }

    console.warn("[SMG] Currency detection failed; falling back to USD rules");
    currencyMeta = buildCurrencyMeta("USD");
    return currencyMeta;
  }

  function getCurrencyMeta() {
    if (!currencyMeta) resolveCurrency();
    return currencyMeta;
  }

  // 最低货币单位整数 → 展示字符串（前缀货币符号后补空格，与 SSR 的 "¥ 0.95" 格式一致）
  function formatMoney(cents, meta) {
    const m = meta || getCurrencyMeta();
    const amount = (cents / m.unit).toFixed(m.decimals);
    return m.prefix ? `${m.symbol} ${amount}` : `${amount} ${m.symbol}`;
  }

  // 用户输入金额 → 最低货币单位整数；兼容千分位逗号与欧式小数逗号，非法/≤0 返回 0
  function parseAmount(str, meta) {
    const m = meta || getCurrencyMeta();
    let s = String(str).replace(/\s/g, "");
    if (m.symbol) s = s.split(m.symbol).join("");
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/,/g, ""); // 同时含 , 与 . ：逗号为千分位
    } else if (/\d,\d{3}(?:\D|$)/.test(s)) {
      s = s.replace(/,/g, ""); // 仅逗号且其后恰为 3 位数字：千分位
    } else {
      s = s.replace(",", "."); // 其余情况：欧式小数逗号
    }
    const num = parseFloat(s.replace(/[^\d.]/g, ""));
    return !isNaN(num) && num > 0 ? Math.round(num * m.unit) : 0;
  }

  // ── Loading Overlay ─────────────────────────────────────

  function showLoading() {
    if (document.getElementById("smg-loading")) return;
    const el = document.createElement("div");
    el.id = "smg-loading";
    el.innerHTML = '<div class="smg-spinner"></div><div class="smg-loading-text">正在加载上架数据...</div>';
    document.body.appendChild(el);
  }

  function hideLoading() {
    const el = document.getElementById("smg-loading");
    if (!el) return;
    el.classList.add("smg-fade-out");
    setTimeout(() => el.remove(), 300);
  }

  // ── Confirm Dialog ──────────────────────────────────────

  function configureDialog(overlay, title, cancel) {
    const box = overlay.querySelector(".smg-confirm-box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", title);
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
      if (e.key !== "Tab") return;
      const controls = [...box.querySelectorAll("button, input")].filter((el) => !el.disabled);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    });
  }

  function showConfirmDialog(message, opts) {
    const { title = "确认下架", okText = "确认下架", action = "delist" } = opts || {};
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "smg-confirm-overlay";
      overlay.innerHTML = `
        <div class="smg-confirm-box">
          <div class="smg-confirm-title">${escapeHtml(title)}</div>
          <div class="smg-confirm-body">${message}</div>
          <div class="smg-confirm-actions">
            <button class="smg-confirm-btn smg-confirm-cancel" id="smg-confirm-cancel">取消</button>
            <button class="smg-confirm-btn ${action === "relist" ? "smg-confirm-blue" : "smg-confirm-ok"}" id="smg-confirm-ok">${escapeHtml(okText)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };
      configureDialog(overlay, title, () => cleanup(false));
      overlay.querySelector("#smg-confirm-cancel").focus();
      overlay.querySelector("#smg-confirm-cancel").addEventListener("click", () => cleanup(false));
      overlay.querySelector("#smg-confirm-ok").addEventListener("click", () => cleanup(true));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) cleanup(false);
      });
    });
  }

  // ── Data Extraction ──────────────────────────────────────

  function extractOrders() {
    console.log("[SMG] Extracting orders from SSR data...");
    const ssr = unsafeWindow.SSR?.loaderData;
    if (!Array.isArray(ssr)) {
      console.warn("[SMG] SSR data not available");
      return null;
    }

    for (const entry of ssr) {
      try {
        const data = typeof entry === "string" ? JSON.parse(entry) : entry;
        const orders = data?.myOrders?.rgSellOrders;
        if (Array.isArray(orders) && orders.length > 0) {
          console.log(`[SMG] Found ${orders.length} sell orders`);
          return orders.map((o) => ({
            listingid: o.listingid,
            assetid: o.assetid,
            appid: o.appid,
            classid: o.classid,
            rtListed: o.rtListed,
            dateKey: tsToDateKey(o.rtListed),
            dateTime: tsToDateTime(o.rtListed),
            buyerPrice: (o.strBuyerPrice || "").trim(),
            sellerPrice: (o.strSellerPrice || "").trim(),
          }));
        }
      } catch (e) {
        /* skip */
      }
    }

    console.warn("[SMG] No sell orders found in SSR data");
    return null;
  }

  // ── Grouping ────────────────────────────────────────────

  function groupOrders(orders) {
    const dateMap = new Map();

    for (const o of orders) {
      if (!dateMap.has(o.dateKey)) {
        dateMap.set(o.dateKey, { dateKey: o.dateKey, prices: new Map(), items: [] });
      }
      const dg = dateMap.get(o.dateKey);
      if (!dg.prices.has(o.buyerPrice)) {
        dg.prices.set(o.buyerPrice, []);
      }
      dg.prices.get(o.buyerPrice).push(o);
      dg.items.push(o);
    }

    for (const g of dateMap.values()) {
      for (const items of g.prices.values()) {
        items.sort((a, b) => b.rtListed - a.rtListed);
      }
    }

    return [...dateMap.values()]
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .map((g) => ({
        dateKey: g.dateKey,
        prices: g.prices,
        sortedPrices: [...g.prices.keys()].sort((a, b) => parseFloat(a.replace(/[^0-9.]/g, "")) - parseFloat(b.replace(/[^0-9.]/g, ""))),
        totalCount: g.items.length,
      }));
  }

  // ── Rendering ───────────────────────────────────────────

  // 计算所有订单的卖方到手总额（最低货币单位整数）
  function computeTotalReceived(orders, fallbackAppId) {
    let totalCents = 0;
    for (const o of orders) {
      if (o.sellerPrice) {
        totalCents += parseAmount(o.sellerPrice);
      } else {
        // 重新上架后 sellerPrice 为空，从 buyerPrice 反推
        const buyerCents = parseAmount(o.buyerPrice);
        if (buyerCents > 0) {
          totalCents += calcReceivedFromTotal(buyerCents, o.appid || fallbackAppId);
        }
      }
    }
    return totalCents;
  }

  // 选择始终对应具体 listingid；聚合模式只改变视图，不改变操作范围。
  function buildViewRows(orders, mode) {
    if (mode === "original") return orders.map((item) => ({ items: [item] }));
    const rows = new Map();
    for (const item of orders) {
      const key = JSON.stringify(mode === "date" ? [item.dateKey, item.buyerPrice] : [item.buyerPrice]);
      if (!rows.has(key)) rows.set(key, { items: [] });
      rows.get(key).items.push(item);
    }
    return [...rows.values()].sort((a, b) => {
      const x = a.items[0],
        y = b.items[0];
      return (mode === "date" ? y.dateKey.localeCompare(x.dateKey) : 0) || parseAmount(x.buyerPrice) - parseAmount(y.buyerPrice) || x.buyerPrice.localeCompare(y.buyerPrice);
    });
  }

  function getSelectedOrders() {
    return allOrders.filter((item) => selectedIds.has(String(item.listingid)));
  }

  function setItemsSelected(items, checked) {
    for (const item of items) {
      if (checked) selectedIds.add(String(item.listingid));
      else selectedIds.delete(String(item.listingid));
    }
  }

  function renderSummary(unusedGrouped, orders) {
    viewRows = buildViewRows(orders, viewMode);
    const rows = viewRows
      .map((row, index) => {
        const item = row.items[0];
        const dates = [...new Set(row.items.map((o) => o.dateKey))].sort();
        const date = dates.length > 1 ? `${dates[0]} ～ ${dates[dates.length - 1]}` : dates[0];
        const received = computeTotalReceived(row.items, item.appid);
        const sellerValues = new Set(row.items.map((o) => o.sellerPrice || formatMoney(calcReceivedFromTotal(parseAmount(o.buyerPrice), o.appid))));
        const seller = sellerValues.size === 1 ? [...sellerValues][0] : "到手价不同";
        return `<tr>
        <td><input type="checkbox" data-smg-row="${index}" aria-label="选择${escapeHtml(date)} ${escapeHtml(item.buyerPrice)}的 ${row.items.length} 件商品"></td>
        <td><div class="smg-item">${itemPresentation.image ? `<img src="${escapeHtml(itemPresentation.image)}" alt="" width="48" height="48">` : ""}<div><strong>${escapeHtml(itemPresentation.name)}</strong><span>${escapeHtml(itemPresentation.game)}</span></div></div></td>
        <td class="smg-date">${escapeHtml(date)}</td>
        <td class="smg-money">${escapeHtml(item.buyerPrice)}<span class="smg-note">(${escapeHtml(seller)})</span></td>
        <td class="smg-money">${row.items.length}<span class="smg-note">到手合计 ${escapeHtml(formatMoney(received))}</span></td>
        <td class="smg-row-actions"><button type="button" data-smg-action="delist" data-smg-index="${index}">下架</button><button type="button" data-smg-action="relist" data-smg-index="${index}">重新上架</button></td>
      </tr>`;
      })
      .join("");
    return `<div id="smg-panel">
      <div class="smg-header"><h2 class="smg-title">出售 - 我的上架物品</h2><span>共 ${orders.length} 件</span><button type="button" class="smg-toggle-btn" id="smg-toggle" aria-expanded="${!panelCollapsed}">${panelCollapsed ? "展开" : "收起"}</button></div>
      <div class="smg-content" ${panelCollapsed ? "hidden" : ""}>
        <div class="smg-toolbar"><div class="smg-modes" role="group" aria-label="挂单显示模式">${[
          ["price", "按价格"],
          ["date", "按日期"],
          ["original", "原版"],
        ]
          .map(([mode, label]) => `<button type="button" data-smg-mode="${mode}" aria-pressed="${viewMode === mode}">${label}</button>`)
          .join(
            "",
          )}</div><label class="smg-select-label"><input type="checkbox" id="smg-select-all">全选 ${orders.length} 件</label><span id="smg-selection-count" role="status" aria-live="polite"></span><button type="button" id="smg-selected-delist">下架选中</button><button type="button" id="smg-selected-relist">重新上架选中</button><button type="button" id="smg-clear-selection">清空选择</button><div class="smg-all-actions"><button type="button" id="smg-delist-all-btn">全部下架</button><button type="button" id="smg-relist-all-btn">全部重新上架</button></div></div>
        ${renderProgressSection()}
        <div class="smg-totals">卖方到手合计：<strong>${escapeHtml(formatMoney(computeTotalReceived(orders)))}</strong><span>括号内为单件卖方到手价</span></div>
        <div class="smg-table-wrap" ${viewMode === "original" ? "hidden" : ""}><table class="smg-table"><thead><tr><th scope="col">选择</th><th scope="col">名称</th><th scope="col">上架日期</th><th scope="col">价格</th><th scope="col">数量</th><th scope="col">操作</th></tr></thead><tbody>${rows || '<tr><td colspan="6">暂无上架物品</td></tr>'}</tbody></table></div>
      </div>
    </div>`;
  }

  function renderProgressSection() {
    return `<div id="smg-delist-status" class="smg-delist-status" role="status" aria-live="polite">${escapeHtml(batchProgress)}</div><div id="smg-progress-wrap" class="smg-progress-wrap ${batchProgress ? "smg-visible" : ""}"><div id="smg-progress-bar" class="smg-progress-bar" style="width:${batchPercent}%"></div></div>`;
  }

  function refreshPanel() {
    const liveIds = new Set(allOrders.map((o) => String(o.listingid)));
    for (const id of selectedIds) if (!liveIds.has(id)) selectedIds.delete(id);
    const wrapper = document.getElementById("smg-root");
    if (!wrapper) return;
    wrapper.innerHTML = renderSummary(grouped, allOrders);
    bindPanelEvents();
    syncNativeList();
  }

  function updateSelectionUI() {
    const count = getSelectedOrders().length;
    const summary = document.getElementById("smg-selection-count");
    if (summary) summary.textContent = `已选 ${count} 件`;
    function sync(box, items) {
      const n = items.filter((o) => selectedIds.has(String(o.listingid))).length;
      box.checked = items.length > 0 && n === items.length;
      box.indeterminate = n > 0 && n < items.length;
      box.disabled = batchBusy || items.length === 0;
    }
    const all = document.getElementById("smg-select-all");
    if (all) sync(all, allOrders);
    document.querySelectorAll("[data-smg-row]").forEach((box) => sync(box, viewRows[Number(box.dataset.smgRow)].items));
    for (const [row, item] of nativeBindings) {
      if (!row.isConnected) {
        nativeBindings.delete(row);
        continue;
      }
      const box = row.querySelector(".smg-native-select");
      if (box) sync(box, [item]);
    }
    for (const id of ["smg-selected-delist", "smg-selected-relist", "smg-clear-selection"]) {
      const button = document.getElementById(id);
      if (button) button.disabled = batchBusy || count === 0;
    }
  }

  function bindPanelEvents() {
    const root = document.getElementById("smg-root");
    root.querySelector("#smg-toggle").addEventListener("click", () => {
      panelCollapsed = !panelCollapsed;
      refreshPanel();
    });
    root.querySelectorAll("[data-smg-mode]").forEach((button) =>
      button.addEventListener("click", () => {
        viewMode = button.dataset.smgMode;
        GM_setValue("viewMode", viewMode);
        refreshPanel();
        document.querySelector(`[data-smg-mode="${viewMode}"]`)?.focus();
      }),
    );
    root.querySelector("#smg-select-all").addEventListener("change", (e) => {
      setItemsSelected(allOrders, e.target.checked);
      updateSelectionUI();
    });
    root.querySelectorAll("[data-smg-row]").forEach((box) =>
      box.addEventListener("change", () => {
        setItemsSelected(viewRows[Number(box.dataset.smgRow)].items, box.checked);
        updateSelectionUI();
      }),
    );
    root.querySelector("#smg-clear-selection").addEventListener("click", () => {
      selectedIds.clear();
      updateSelectionUI();
    });
    for (const [id, action, scope] of [
      ["smg-delist-all-btn", "delist", "all"],
      ["smg-relist-all-btn", "relist", "all"],
      ["smg-selected-delist", "delist", "selected"],
      ["smg-selected-relist", "relist", "selected"],
    ])
      root.querySelector(`#${id}`).addEventListener("click", () => runBatch(action, scope));
    root
      .querySelectorAll("[data-smg-action]")
      .forEach((button) => button.addEventListener("click", () => runBatch(button.dataset.smgAction, "row", viewRows[Number(button.dataset.smgIndex)].items)));
    setAllBatchButtonsDisabled(batchBusy);
    updateSelectionUI();
  }

  // 保留原版真实节点；只在原行名称前加复选框，修改入口复用同一批量流程。
  function syncNativeList() {
    if (!nativeGrid?.isConnected) return;
    nativeGrid.classList.add("smg-native-grid");
    nativeGrid.hidden = viewMode !== "original" || panelCollapsed;
    const rows = [...nativeGrid.querySelectorAll('[style*="--grid-columns: subgrid"]')];
    const assigned = new Set([...nativeBindings].filter(([row]) => row.isConnected).map(([, item]) => item));
    for (const row of rows) {
      let item = nativeBindings.get(row);
      if (!item) {
        const dateText = row.children[1]?.textContent.trim().replace(/\//g, "-");
        const price = row.children[2]?.firstElementChild?.textContent.trim();
        item = nativeSnapshots.find((s) => !assigned.has(s.item) && s.dateKey === dateText && s.buyerPrice === price)?.item;
        if (!item) continue;
        nativeBindings.set(row, item);
        assigned.add(item);
      }
      const active = allOrders.includes(item);
      row.hidden = !active;
      if (!active) continue;
      const nameCell = row.children[0];
      if (!row.querySelector(".smg-native-select")) {
        const box = document.createElement("input");
        box.type = "checkbox";
        box.className = "smg-native-select";
        box.setAttribute("aria-label", `选择 ${itemPresentation.name} ${item.dateKey} ${item.buyerPrice}`);
        box.addEventListener("change", () => {
          setItemsSelected([item], box.checked);
          updateSelectionUI();
        });
        nameCell.prepend(box);
      }
      // 用当前 item 引用处理修改，重新上架后不会调用原版闭包中的旧 listingid。
      const modify = row.children[3]?.querySelector("button");
      if (modify && !modify.dataset.smgBound) {
        modify.dataset.smgBound = "true";
        modify.addEventListener(
          "click",
          (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            showNativeActions(item);
          },
          true,
        );
      }
      if (item.locallyUpdated) {
        const date = item.dateKey.replace(/-/g, "/");
        if (row.children[1].textContent !== date) row.children[1].textContent = date;
        const priceCell = row.children[2];
        if (priceCell.firstElementChild.textContent !== item.buyerPrice) priceCell.firstElementChild.textContent = item.buyerPrice;
        const seller = `(${item.sellerPrice || formatMoney(calcReceivedFromTotal(parseAmount(item.buyerPrice), item.appid))})`;
        if (priceCell.children[1] && priceCell.children[1].textContent !== seller) priceCell.children[1].textContent = seller;
      }
    }
    updateSelectionUI();
  }

  function showNativeActions(item) {
    if (batchBusy || !allOrders.includes(item)) return;
    if (document.querySelector(".smg-native-actions")) return;
    const overlay = document.createElement("div");
    overlay.className = "smg-confirm-overlay smg-native-actions";
    overlay.innerHTML = `<div class="smg-confirm-box" role="dialog" aria-modal="true" aria-label="修改上架物品"><div class="smg-confirm-title">修改上架物品</div><div class="smg-confirm-body">${escapeHtml(itemPresentation.name)}<br>${escapeHtml(item.buyerPrice)}</div><div class="smg-confirm-actions"><button type="button" data-action="cancel" class="smg-confirm-btn">取消</button><button type="button" data-action="delist" class="smg-confirm-btn">下架</button><button type="button" data-action="relist" class="smg-confirm-btn">重新上架</button></div></div>`;
    overlay.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (!action && e.target !== overlay) return;
      overlay.remove();
      if (action && action !== "cancel") runBatch(action, "row", [item]);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") overlay.remove();
    });
    document.body.appendChild(overlay);
    overlay.querySelector("button").focus();
  }

  // 状态提示统一入口：autoHide=true 时显示为底部浮动 Toast（非进度类提示）；
  // 进度类消息传 false 保持常显于面板内状态区域
  function showStatus(el, text, cls, autoHide) {
    if (autoHide) {
      showToast(text, cls);
      return;
    }
    // 进度类：写入面板内状态元素；若元素已脱离 DOM（refreshPanel 后），降级为 Toast
    if (el && el.isConnected) {
      el.textContent = text;
      el.className = "smg-delist-status" + (cls ? " " + cls : "");
    } else {
      showToast(text, cls);
    }
  }

  // 底部居中浮动 Toast 提示（5 秒后自动消失）
  function showToast(message, cls) {
    let container = document.getElementById("smg-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "smg-toast-container";
      container.className = "smg-toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = "smg-toast" + (cls ? " " + cls : "");
    toast.setAttribute("role", "status");
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("smg-toast-show"));
    setTimeout(() => {
      toast.classList.add("smg-toast-hide");
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  function setAllBatchButtonsDisabled(disabled) {
    document.querySelectorAll("#smg-root button, #smg-root select, #smg-root input, .smg-native-grid button, .smg-native-select").forEach((el) => {
      el.disabled = disabled;
    });
  }

  function updateProgress(text, percent) {
    batchProgress = text;
    batchPercent = percent;
    showStatus(document.getElementById("smg-delist-status"), text);
    const wrap = document.getElementById("smg-progress-wrap");
    const bar = document.getElementById("smg-progress-bar");
    wrap?.classList.add("smg-visible");
    if (bar) bar.style.width = `${percent}%`;
  }

  function selectBatchOrders(scope, rowItems) {
    let items;
    if (scope === "all") items = allOrders.slice();
    else if (scope === "selected") items = getSelectedOrders();
    else if (scope === "row") items = (rowItems || []).filter((item) => allOrders.includes(item));
    else throw new Error("无效的操作范围");
    if (!items.length) throw new Error(scope === "selected" ? "请先选择要操作的商品" : "没有可操作的商品");
    return items.sort((a, b) => b.rtListed - a.rtListed);
  }

  async function runBatch(action, scope, rowItems) {
    if (batchBusy) {
      showToast("已有批量操作进行中，请稍候", "smg-error");
      return;
    }
    // 从选择快照到确认、交易完成全程加锁，阻止异步弹窗期间重复提交。
    batchBusy = true;
    setAllBatchButtonsDisabled(true);
    try {
      const items = selectBatchOrders(scope, rowItems);
      const description = scope === "all" ? "全部" : scope === "selected" ? "选中的" : "指定的";
      let priceResult;
      if (action === "relist") {
        priceResult = await showPriceDialog(items[0].buyerPrice, items.length, items[0].appid, `将${description} <strong>${items.length}</strong> 件商品以同一新价格重新上架：`);
        if (!priceResult) {
          showToast("已取消");
          return;
        }
      }
      const priceMessage = priceResult
        ? `<br>单件您将收到 <strong>${escapeHtml(formatMoney(priceResult.receivedCents))}</strong>，买方支付 <strong>${escapeHtml(formatMoney(priceResult.buyerCents))}</strong>。<br>您将总共收到 <strong>${escapeHtml(formatMoney(priceResult.receivedCents * items.length))}</strong>。`
        : "";
      const label = action === "relist" ? "重新上架" : "下架";
      const confirmed = await showConfirmDialog(`即将${label}${description} <strong>${items.length}</strong> 件商品，确认继续？${priceMessage}`, {
        title: `确认${label}`,
        okText: `确认${label}`,
        action,
      });
      if (!confirmed) {
        showToast("已取消");
        return;
      }
      const sessionid = await resolveSessionId();
      if (!sessionid) throw new Error("无法获取会话ID");
      if (action === "delist") await executeDelist(items, sessionid);
      else {
        const { appId, contextId } = getAppContext(items[0].appid);
        if (!appId) throw new Error("无法获取应用 appid，请刷新页面重试");
        await executeRelist(items, sessionid, appId, contextId || KNOWN_APP_CONTEXT[String(appId)] || DEFAULT_CONTEXT_ID, priceResult.receivedCents, priceResult.buyerCents);
      }
    } catch (e) {
      console.warn("[SMG] Batch operation failed:", e);
      showToast(e.message || "操作失败，请刷新页面核对挂单", "smg-error");
    } finally {
      batchBusy = false;
      batchProgress = "";
      batchPercent = 0;
      grouped = groupOrders(allOrders);
      refreshPanel();
      setAllBatchButtonsDisabled(false);
      updateSelectionUI();
    }
  }

  async function removeListing(item, sessionid) {
    const response = await fetch(`https://steamcommunity.com/market/removelisting/${encodeURIComponent(item.listingid)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ sessionid }).toString(),
    });
    if (!response.ok) throw new Error(`下架失败: HTTP ${response.status}`);
    // Steam 的正常下架可返回 {}；显式业务失败不可仅凭 HTTP 200 判为成功。
    const data = await response.json();
    if (data?.success === false || data?.success === 0) throw new Error(data.message || "Steam 拒绝下架");
  }

  async function executeDelist(items, sessionid) {
    let success = 0,
      failed = 0;
    for (let i = 0; i < items.length; i++) {
      updateProgress(`正在下架 ${i + 1}/${items.length}...`, (i / items.length) * 100);
      try {
        await removeListing(items[i], sessionid);
        allOrders = allOrders.filter((item) => item !== items[i]);
        selectedIds.delete(String(items[i].listingid));
        success++;
      } catch (e) {
        failed++;
        console.warn(`[SMG] Failed to delist ${items[i].listingid}:`, e);
      }
      if (i < items.length - 1) await sleep(800);
    }
    showToast(`下架完成: 成功 ${success} 件${failed ? `，失败 ${failed} 件` : ""}`, failed ? "smg-error" : "smg-ok");
  }

  // ── Relist ─────────────────────────────────────────

  // 钱包费率信息（仅缓存从 g_rgWalletInfo 成功读取的结果，回退值不缓存）
  let _walletInfoCache = null;
  function getWalletInfo() {
    if (_walletInfoCache) return _walletInfoCache;
    try {
      const wi = unsafeWindow.g_rgWalletInfo;
      if (wi && wi.wallet_currency != null) {
        // 货币代码/小数位统一走 resolveCurrency，与格式化/解析入口保持一致
        const m = getCurrencyMeta();
        _walletInfoCache = {
          feePercent: parseFloat(wi.wallet_fee_percent) || 0.05,
          feeBase: parseInt(wi.wallet_fee_base, 10) || 0,
          feeMinimum: parseInt(wi.wallet_fee_minimum, 10) || 1,
          pubPercentDefault: parseFloat(wi.wallet_publisher_fee_percent_default) || 0.1,
          currency: wi.wallet_currency,
          currencyCode: m.code,
          useRound: CURRENCY_CODES_TO_ROUND.includes(m.code),
          decimals: m.decimals,
          unit: m.unit,
        };
        return _walletInfoCache;
      }
    } catch (e) {
      /* 回退默认费率 */
    }
    // 默认值不缓存，下次调用重试 g_rgWalletInfo；
    // 无钱包信息时（新版 SSR 页面常见）货币由 resolveCurrency 统一解析（订单价格符号推断 → USD 默认）
    const m = getCurrencyMeta();
    return {
      feePercent: 0.05,
      feeBase: 0,
      feeMinimum: 1,
      pubPercentDefault: 0.1,
      currency: m.code === "CNY" ? 25 : 1,
      currencyCode: m.code,
      useRound: CURRENCY_CODES_TO_ROUND.includes(m.code),
      decimals: m.decimals,
      unit: m.unit,
    };
  }

  function getFeeRates(appId) {
    const wi = getWalletInfo();
    let pubRate = wi.pubPercentDefault;
    try {
      // app 级发行商费率优先（官方 economy_v2.js 同样优先读 market_pubfee_rate）
      const appCtx = unsafeWindow.g_rgAppContextData && unsafeWindow.g_rgAppContextData[appId];
      if (appCtx && appCtx.market_pubfee_rate != null && !isNaN(parseFloat(appCtx.market_pubfee_rate))) {
        pubRate = parseFloat(appCtx.market_pubfee_rate);
      }
    } catch (e) {
      /* 保持钱包默认费率 */
    }
    return {
      pubRate,
      steamRate: wi.feePercent,
      feeBase: wi.feeBase,
      feeMinimum: wi.feeMinimum,
      currencyCode: wi.currencyCode,
      useRound: wi.useRound,
      decimals: wi.decimals,
      unit: wi.unit,
    };
  }

  // 卖方到手价 -> 买方支付（百分比 → 加 base → 取整 → 与最低费取 max；
  // 2025年12月起最低费为 $0.01 等值，国区 ¥0.07，见 MIN_FEE_BY_CURRENCY）
  function calcBuyerTotal(receivedCents, appId) {
    const { pubRate, steamRate, feeBase, feeMinimum, currencyCode, useRound } = getFeeRates(appId);
    const effMin = Math.max(feeMinimum, MIN_FEE_BY_CURRENCY[currencyCode] || 0);
    const roundFee = useRound ? Math.round : Math.floor;
    const steamFee = Math.max(parseInt(roundFee(receivedCents * steamRate + feeBase), 10), effMin);
    const publisherFee = pubRate > 0 ? Math.max(parseInt(roundFee(receivedCents * pubRate), 10), effMin) : 0;
    return { total: receivedCents + steamFee + publisherFee, fee: steamFee + publisherFee, steamFee, publisherFee };
  }

  // 买方支付 -> 卖方到手价（迭代逼近，与参考实现 calcReceivedAmount 一致）
  function calcReceivedFromTotal(buyerCents, appId) {
    let estimated = buyerCents;
    let lastAmount = 0;
    for (let i = 0; i < 10; i++) {
      const { total, fee } = calcBuyerTotal(estimated, appId);
      if (total === buyerCents || total === lastAmount) return estimated;
      lastAmount = total;
      estimated = buyerCents - fee;
      if (estimated <= 0) return 0;
    }
    return estimated;
  }

  function showPriceDialog(oldPrice, count, appId, dialogMsg) {
    return new Promise((resolve) => {
      const meta = getCurrencyMeta();
      // 输入框内只填数字（不带符号）；小数位数随货币自适应（如 JPY 为整数）
      const fmtAmount = (cents) => (cents / meta.unit).toFixed(meta.decimals);
      const placeholder = (0).toFixed(meta.decimals);
      const overlay = document.createElement("div");
      overlay.className = "smg-confirm-overlay";
      overlay.innerHTML = `
        <div class="smg-confirm-box">
          <div class="smg-confirm-title">重新上架 - 输入新价格</div>
          <div class="smg-confirm-body">
            ${dialogMsg || `将价格 <strong>${escapeHtml(oldPrice)}</strong> 的 <strong>${count}</strong> 件商品以新价格重新上架:`}
          </div>
          <div style="margin-bottom: 20px;">
            <div class="smg-relist-price-grid">
              <label for="smg-relist-received" class="smg-relist-price-label">您将收到 (${escapeHtml(meta.symbol)}):</label>
              <label for="smg-relist-buyer" class="smg-relist-price-label">买方支付 (${escapeHtml(meta.symbol)}):</label>
              <input type="text" class="smg-price-input" id="smg-relist-received" placeholder="${placeholder}">
              <input type="text" class="smg-price-input" id="smg-relist-buyer" placeholder="${placeholder}">
            </div>
            <div id="smg-relist-total" style="color:#66c0f4;font-size:13px;margin-top:8px;">
              您将总共收到: <strong>--</strong> (共 ${count} 件)
            </div>
          </div>
          <div class="smg-confirm-actions">
            <button class="smg-confirm-btn smg-confirm-cancel" id="smg-price-cancel">取消</button>
            <button class="smg-confirm-btn smg-confirm-blue" id="smg-price-ok">下一步</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const receivedInput = overlay.querySelector("#smg-relist-received");
      const buyerInput = overlay.querySelector("#smg-relist-buyer");
      const totalEl = overlay.querySelector("#smg-relist-total");
      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };
      configureDialog(overlay, "重新上架 - 输入新价格", () => cleanup(null));

      // 更新总余额显示
      const updateTotal = (receivedCents) => {
        if (!Number.isSafeInteger(receivedCents) || receivedCents <= 0 || !Number.isSafeInteger(receivedCents * count)) {
          totalEl.innerHTML = `您将总共收到: <strong>--</strong> (共 ${count} 件)`;
          return;
        }
        const totalCents = receivedCents * count;
        totalEl.innerHTML = `您将总共收到: <strong>${escapeHtml(formatMoney(totalCents))}</strong> (共 ${count} 件)`;
      };

      receivedInput.addEventListener("input", () => {
        const receivedCents = parseAmount(receivedInput.value, meta);
        if (!receivedCents) {
          buyerInput.value = "";
          updateTotal(0);
          return;
        }
        buyerInput.value = fmtAmount(calcBuyerTotal(receivedCents, appId).total);
        updateTotal(receivedCents);
      });

      buyerInput.addEventListener("input", () => {
        const buyerCents = parseAmount(buyerInput.value, meta);
        if (!buyerCents) {
          receivedInput.value = "";
          updateTotal(0);
          return;
        }
        const receivedCents = calcReceivedFromTotal(buyerCents, appId);
        receivedInput.value = fmtAmount(receivedCents);
        updateTotal(receivedCents);
      });

      overlay.querySelector("#smg-price-cancel").addEventListener("click", () => cleanup(null));
      overlay.querySelector("#smg-price-ok").addEventListener("click", () => {
        // 以"您将收到"为唯一事实来源重算买方价：sellitem 实际只提交 receivedCents，
        // 若两输入框不一致仍原样提交，确认页展示的买方支付将与 Steam 实际挂单价不符
        const receivedCents = parseAmount(receivedInput.value, meta);
        if (!Number.isSafeInteger(receivedCents) || receivedCents <= 0 || !Number.isSafeInteger(receivedCents * count) || /-/.test(receivedInput.value)) {
          receivedInput.focus();
          return;
        }
        const buyerCents = calcBuyerTotal(receivedCents, appId).total;
        cleanup({ buyerCents, receivedCents });
      });
      [receivedInput, buyerInput].forEach((inp) =>
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") overlay.querySelector("#smg-price-ok").click();
        }),
      );
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) cleanup(null);
      });
      receivedInput.focus();
    });
  }

  function getAppContext(appidHint) {
    // appid: 优先订单数据自带字段，其次旧版全局变量，最后 URL 路径
    let appId = appidHint || unsafeWindow.g_appId;
    if (!appId) {
      const m = location.pathname.match(/\/market\/listings\/(\d+)\//);
      appId = m ? Number(m[1]) : 0;
    }

    // contextid: 多来源探测（新版 SSR 页面可能不提供旧版全局变量）
    let contextId = "";

    // 1) 旧版 g_rgAppContextData（兼容数组与对象两种结构）
    const appCtx = unsafeWindow.g_rgAppContextData && unsafeWindow.g_rgAppContextData[appId];
    if (Array.isArray(appCtx) && appCtx.length > 0 && appCtx[0].id) {
      contextId = String(appCtx[0].id);
    } else if (appCtx && typeof appCtx === "object") {
      if (appCtx.contexts && typeof appCtx.contexts === "object") {
        const first = Object.keys(appCtx.contexts).find((k) => /^\d+$/.test(k));
        if (first) contextId = first;
      } else {
        const first = Object.keys(appCtx).find((k) => /^\d+$/.test(k));
        if (first) contextId = first;
      }
    }

    // 2) SSR loaderData 深度扫描 contextid 字段
    if (!contextId) contextId = scanSSRForContextId();

    // 3) 页面 HTML 源码（SSR 序列化 JSON / 链接参数）正则扫描
    if (!contextId) {
      const html = document.documentElement.innerHTML;
      const m = html.match(/"contextid"\s*:\s*"?(\d+)"?/i) || html.match(/contextid=(\d+)/i);
      if (m) contextId = m[1];
    }

    if (!contextId) {
      console.warn(
        "[SMG] contextid not found; SSR keys:",
        (unsafeWindow.SSR?.loaderData || []).map((e, i) => {
          try {
            return `${i}:${typeof e === "string" ? Object.keys(JSON.parse(e)).join(",") : Object.keys(e || {}).join(",")}`;
          } catch (err) {
            return `${i}:?`;
          }
        }),
      );
    }
    console.log(`[SMG] App context: appid=${appId}, contextid=${contextId || "(not found)"}`);
    return { appId, contextId };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 下架回库后 assetid 可能变化：单次查库存，按 classid 定位可用资产
  async function findReturnedAssetId(appId, contextId, classid, excludeIds) {
    try {
      const resp = await fetch(`https://steamcommunity.com/my/inventory/json/${appId}/${contextId}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) return "";
      const data = await resp.json();
      if (!data || !data.success || !data.rgInventory) return "";
      for (const [assetId, entry] of Object.entries(data.rgInventory)) {
        if (entry && String(entry.classid) === String(classid) && !excludeIds.has(assetId)) {
          return assetId;
        }
      }
    } catch (e) {
      console.warn("[SMG] inventory lookup error:", e);
    }
    return "";
  }

  // 轮询等待物品回库并返回其（可能已变化的）assetid，超时返回空串
  async function waitForReturnedAsset(appId, contextId, classid, excludeIds, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const assetId = await findReturnedAssetId(appId, contextId, classid, excludeIds);
      if (assetId) return assetId;
      await sleep(1500);
    }
    return "";
  }

  function scanSSRForContextId() {
    const ssr = unsafeWindow.SSR?.loaderData;
    if (!Array.isArray(ssr)) return "";
    for (const entry of ssr) {
      let obj = entry;
      if (typeof entry === "string") {
        try {
          obj = JSON.parse(entry);
        } catch (e) {
          continue;
        }
      }
      const found = findContextId(obj, 0);
      if (found) return found;
    }
    return "";
  }

  function findContextId(node, depth) {
    if (!node || typeof node !== "object" || depth > 8) return "";
    if (Array.isArray(node)) {
      for (const v of node) {
        const r = findContextId(v, depth + 1);
        if (r) return r;
      }
      return "";
    }
    // 直接字段 contextid / context_id
    for (const [k, v] of Object.entries(node)) {
      const lk = k.toLowerCase();
      if ((lk === "contextid" || lk === "context_id") && (typeof v === "string" || typeof v === "number")) {
        return String(v);
      }
    }
    // contexts 映射 { "2": {...} }
    for (const [k, v] of Object.entries(node)) {
      const lk = k.toLowerCase();
      if ((lk === "contexts" || lk === "rgcontexts" || lk === "app_contexts") && v && typeof v === "object") {
        const first = Object.keys(v).find((key) => /^\d+$/.test(key));
        if (first) return first;
      }
    }
    // 递归子节点
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") {
        const r = findContextId(v, depth + 1);
        if (r) return r;
      }
    }
    return "";
  }

  // 按价格重新上架（从面板选择器获取价格和数量）
  async function executeRelist(items, sessionid, appId, contextId, receivedCents, buyerCents) {
    let success = 0,
      delistFailed = 0,
      relistFailed = 0,
      pending = 0;
    let lastMessage = "";
    const usedAssetIds = new Set();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      updateProgress(`正在重新上架 ${i + 1}/${items.length}...`, (i / items.length) * 100);
      try {
        await removeListing(item, sessionid);
      } catch (e) {
        delistFailed++;
        console.warn(`[SMG] Relist: failed to delist ${item.listingid}:`, e);
        if (i < items.length - 1) await sleep(800);
        continue;
      }
      // 下架成功立即同步：后续任何异常均不会在本地保留已销毁的 listingid。
      allOrders = allOrders.filter((order) => order !== item);
      selectedIds.delete(String(item.listingid));
      try {
        updateProgress(`正在重新上架 ${i + 1}/${items.length}: 等待物品返回库存...`, (i / items.length) * 100);
        const assetid = (item.classid && (await waitForReturnedAsset(appId, contextId, item.classid, usedAssetIds, 10000))) || item.assetid;
        usedAssetIds.add(String(assetid));
        let data;
        let message = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt) await sleep(1500);
          let response;
          try {
            response = await fetch("https://steamcommunity.com/market/sellitem/", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ sessionid, appid: appId, contextid: contextId, assetid, amount: "1", price: String(receivedCents) }).toString(),
            });
            data = await response.json();
          } catch (e) {
            // 请求可能已经成功送达，网络/解析失败不盲目重试，防止重复提交。
            data = null;
            message = "上架响应不明，请刷新页面或库存核对";
            break;
          }
          if (response.ok && (data?.success === true || data?.success === 1)) break;
          message = String(data?.message || `HTTP ${response.status}`);
          console.warn(`[SMG] Relist: sellitem failed (attempt ${attempt + 1}): ${message}`);
          data = { success: false };
        }
        if (
          !data ||
          ((data.success === true || data.success === 1) && (!data.listingid || data.requires_confirmation || data.needs_mobile_confirmation || data.needs_email_confirmation))
        ) {
          pending++;
          lastMessage = message || "上架已提交，请完成所需确认并刷新页面核对";
        } else if (data.success !== true && data.success !== 1) {
          relistFailed++;
          lastMessage = message;
        } else {
          item.listingid = String(data.listingid);
          item.assetid = String(assetid);
          item.rtListed = Math.floor(Date.now() / 1000);
          item.dateKey = tsToDateKey(item.rtListed);
          item.dateTime = tsToDateTime(item.rtListed);
          item.buyerPrice = formatMoney(buyerCents);
          item.sellerPrice = formatMoney(receivedCents);
          item.locallyUpdated = true;
          allOrders.push(item);
          success++;
        }
      } catch (e) {
        relistFailed++;
        lastMessage = e.message;
        console.warn("[SMG] Relist: item returned to inventory:", e);
      }
      if (i < items.length - 1) await sleep(800);
    }
    let message = `重新上架完成: 成功 ${success} 件`;
    if (delistFailed) message += `，下架失败 ${delistFailed} 件`;
    if (relistFailed) message += `，上架失败 ${relistFailed} 件（已回到库存）`;
    if (pending) message += `，待核实/确认 ${pending} 件`;
    if (lastMessage) message += `：${lastMessage}`;
    showToast(message, delistFailed || relistFailed || pending ? "smg-error" : "smg-ok");
  }

  // ── Main ────────────────────────────────────────────────

  function findTargetElement() {
    // 优先识别我的挂单 grid，不依赖易变的哈希 class 或整个 style 属性。
    for (const heading of document.querySelectorAll("h2")) {
      if (!/我的上架物品|My (?:sell )?listings|My active listings/i.test(heading.textContent)) continue;
      const grid = heading.parentElement?.parentElement;
      if (grid?.querySelector('[style*="--grid-columns: subgrid"]')) return grid.parentElement;
    }
    // 其他界面语言沿用已验证的容器变量，但不要求属性顺序和空格完全相同。
    return (
      [...document.querySelectorAll('[style*="--border-color:"][style*="--color-accent-8"]')].find(
        (el) => !el.closest("#smg-root") && el.querySelector('[style*="--grid-columns: subgrid"]'),
      ) || null
    );
  }

  function ensurePanel(orders, groups, targetEl) {
    if (document.getElementById("smg-panel")) return;
    nativeGrid = [...targetEl.children].find((el) => el.querySelector('[style*="--grid-columns: subgrid"]'));
    if (!nativeGrid) return;
    const firstRow = nativeGrid.querySelector('[style*="--grid-columns: subgrid"]');
    const image = firstRow?.querySelector("img");
    const labels = firstRow?.children[0]?.querySelectorAll("span");
    if (labels?.length) {
      itemPresentation.name = labels[0].textContent.trim();
      itemPresentation.game = labels[1]?.textContent.trim() || "";
    }
    // 只复用受信任的 Steam 商品图片地址，拒绝任意 URL 协议。
    if (image) {
      try {
        const url = new URL(image.src);
        if (url.protocol === "https:" && /(^|\.)(steamstatic\.com|steamcommunity\.com|akamaihd\.net)$/.test(url.hostname)) itemPresentation.image = url.href;
      } catch (e) {
        /* 无有效图片时只显示名称 */
      }
    }
    const wrapper = document.createElement("div");
    wrapper.id = "smg-root";
    wrapper.innerHTML = renderSummary(groups, orders);
    targetEl.insertBefore(wrapper, nativeGrid);
    targetEl.style.removeProperty("display");
    bindPanelEvents();
    syncNativeList();
    console.log("[SMG] Panel injected");
    hideLoading();
  }

  let reinjectObserver = null;
  let reinjectScheduled = false;
  function proceed(targetEl) {
    ensurePanel(allOrders, grouped || groupOrders(allOrders), targetEl);
    if (reinjectObserver) return;
    reinjectObserver = new MutationObserver((records) => {
      // 自身控件更新不触发整面板重建，避免 observer 反馈循环。
      if (records.every((record) => record.target.closest?.("#smg-root, .smg-native-select"))) return;
      if (reinjectScheduled) return;
      reinjectScheduled = true;
      queueMicrotask(() => {
        reinjectScheduled = false;
        const currentTarget = findTargetElement();
        if (!currentTarget) return;
        const root = document.getElementById("smg-root");
        if (!root || !currentTarget.contains(root)) {
          root?.remove();
          ensurePanel(allOrders, groupOrders(allOrders), currentTarget);
        } else {
          nativeGrid = [...currentTarget.children].find((el) => el !== root && el.querySelector('[style*="--grid-columns: subgrid"]')) || nativeGrid;
          syncNativeList();
          setAllBatchButtonsDisabled(batchBusy);
          updateSelectionUI();
        }
      });
    });
    reinjectObserver.observe(document.body, { childList: true, subtree: true });
  }

  let allOrders = [];
  let grouped = null;
  let batchBusy = false;
  const savedMode = GM_getValue("viewMode", "price");
  let viewMode = ["price", "date", "original"].includes(savedMode) ? savedMode : "price";
  let viewRows = [];
  const selectedIds = new Set();
  let panelCollapsed = false;
  let batchProgress = "";
  let batchPercent = 0;
  let nativeGrid = null;
  const nativeBindings = new Map();
  let nativeSnapshots = [];
  const itemPresentation = { name: "当前商品", game: "", image: "" };

  function main() {
    console.log("[SMG] Script started on", location.href);
    showLoading();

    // [OPT] 数据预提取：不依赖 DOM，立即开始
    allOrders = extractOrders();
    if (!allOrders || allOrders.length <= CONFIG.minOrders) {
      console.log(`[SMG] Skipping: only ${allOrders?.length || 0} orders (minimum ${CONFIG.minOrders})`);
      hideLoading();
      return;
    }
    // [OPT] 货币一次性解析（订单数据已就绪，符号推断可用）：后续格式化/解析/费用计算共用
    nativeSnapshots = allOrders.map((item) => ({ item, dateKey: item.dateKey, buyerPrice: item.buyerPrice }));
    resolveCurrency();
    grouped = groupOrders(allOrders);
    console.log(`[SMG] Pre-grouped into ${grouped.length} date groups`);

    let targetEl = findTargetElement();
    if (targetEl) {
      console.log("[SMG] Target element found immediately");
      proceed(targetEl);
      return;
    }

    // [OPT] 主动轮询 + MutationObserver 双保险
    console.log("[SMG] Target element not found, polling + observing...");
    let found = false;
    let pollCount = 0;

    function onFound(el) {
      if (found) return;
      found = true;
      if (waitObs) waitObs.disconnect();
      console.log("[SMG] Target element found");
      proceed(el);
    }

    // 递归 setTimeout 实现退避轮询
    function poll() {
      if (found) return;
      pollCount++;
      const target = findTargetElement();
      if (target) {
        onFound(target);
        return;
      }
      // 退避策略：前10次50ms，之后200ms，超过30次停止轮询仅靠Observer
      if (pollCount >= 30) return;
      const delay = pollCount <= 10 ? 50 : 200;
      setTimeout(poll, delay);
    }
    setTimeout(poll, 50);

    // [OPT] MutationObserver 缩小范围：只监听 body 直接子节点
    const waitObs = new MutationObserver(() => {
      const target = findTargetElement();
      if (target) onFound(target);
    });
    waitObs.observe(document.body, { childList: true, subtree: false });

    // 超时清理
    setTimeout(() => {
      if (!found) {
        if (waitObs) waitObs.disconnect();
        console.warn("[SMG] Target element not found after timeout");
        hideLoading();
      }
    }, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
