// ==UserScript==
// @name         Steam Market Listings Group
// @namespace    https://steamcommunity.com/
// @version      3.1.2
// @description  增强Steam挂单详情与当前出售挂单页，支持全量加载、物品/日期聚合、组合筛选、多选下架与分别定价重新上架
// @author       RayRoad
// @match        *://steamcommunity.com/market/listings/*
// @match        *://steamcommunity.com/market/activelistings*
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

  const isActiveListingsPage = /^\/market\/activelistings\/?$/.test(location.pathname);

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
    .smg-toolbar { display:flex; gap:8px 12px; align-items:center; flex-wrap:wrap; padding:8px; }
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

    .smg-active-source[hidden] { display:none !important; }
    .smg-active-manager { margin:12px 0 !important; border:1px solid #3d4450 !important; background:var(--color-dull-5,#1d1f23) !important; padding:12px !important; }
    .smg-active-manager .smg-item { min-width:200px; }
    .smg-active-manager a { color:var(--color-accent-8,#1a9fff); text-decoration:none; }
    .smg-active-manager a:hover { text-decoration:underline; }
    #smg-root.smg-active-root input:not([type="checkbox"]), #smg-root.smg-active-root select,
    .smg-price-plan input { box-sizing:border-box; min-height:34px; max-width:100%; background:#171a21; color:#f1f2f3; border:1px solid #48505e; border-radius:2px; padding:5px 8px; font:inherit; }
    .smg-search { flex:1 1 260px; }
    .smg-search input { width:100%; }
    .smg-active-manager label { display:flex; flex-direction:column; gap:5px; font-size:13px; }
    .smg-active-manager label.smg-select-label { flex-direction:row; }
    .smg-active-sticky { position:sticky; top:0; z-index:50; background:var(--color-dull-5,#1d1f23); padding:8px 0; border-bottom:1px solid #3d4450; box-shadow:0 6px 12px rgba(0,0,0,.2); max-height:70vh; overflow:auto; }
    .smg-active-manager label.smg-search, .smg-active-manager label.smg-sort { flex-direction:row; align-items:center; gap:8px; white-space:nowrap; min-width:0; }
    .smg-active-manager .smg-search input { flex:1; min-width:0; width:auto; }
    .smg-sort select { min-width:0; }
    #smg-active-filters { border-block:1px solid #3d4450; margin-block:8px; padding-block:10px; }
    #smg-active-filters summary { cursor:pointer; padding:4px 8px; color:#c7d5e0; }
    .smg-filter-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; padding:12px 8px; align-items:end; }
    .smg-active-error { color:#ff9da4; font-size:13px; margin:4px 0; }
    .smg-active-error:empty { display:none; }
    .smg-active-pager { display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:12px; margin-top:12px; }
    .smg-price-plan { width:min(1000px,94vw); max-width:1000px; padding:20px; box-sizing:border-box; }
    .smg-price-plan .smg-confirm-body { max-height:65vh; overflow:auto; }
    .smg-plan-table { width:100%; border-collapse:collapse; font-size:13px; }
    .smg-plan-table th, .smg-plan-table td { padding:8px; text-align:left; border-bottom:1px solid #3d4450; }
    .smg-plan-table input { width:130px; }
    .smg-plan-table input:focus-visible { outline:2px solid #1a9fff; outline-offset:2px; }
    @media(max-width:700px) { .smg-active-manager { padding:8px !important; } .smg-active-manager .smg-header { align-items:flex-start; } .smg-active-manager .smg-item { min-width:160px; } .smg-plan-table input { width:100px; } }

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
    if (isActiveListingsPage) {
      renderActivePanel();
      return;
    }
    const liveIds = new Set(allOrders.map((o) => String(o.listingid)));
    for (const id of selectedIds) if (!liveIds.has(id)) selectedIds.delete(id);
    const wrapper = document.getElementById("smg-root");
    if (!wrapper) return;
    wrapper.innerHTML = renderSummary(grouped, allOrders);
    bindPanelEvents();
    syncNativeList();
  }

  function updateSelectionUI() {
    if (isActiveListingsPage) {
      updateActiveSelection();
      return;
    }
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
    if (isActiveListingsPage) return runActiveBatch(action, scope === "all" ? "filtered" : scope, rowItems);
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
    const unit = isActiveListingsPage ? "笔" : "件";
    showToast(`下架完成: 成功 ${success} ${unit}${failed ? `，失败 ${failed} ${unit}` : ""}`, failed ? "smg-error" : "smg-ok");
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
  function calcBuyerTotal(receivedCents, appId, publisherRate) {
    const rates = getFeeRates(appId);
    const { steamRate, feeBase, feeMinimum, currencyCode, useRound } = rates;
    const pubRate = Number.isFinite(publisherRate) ? publisherRate : rates.pubRate;
    const effMin = Math.max(feeMinimum, MIN_FEE_BY_CURRENCY[currencyCode] || 0);
    const roundFee = useRound ? Math.round : Math.floor;
    const steamFee = Math.max(parseInt(roundFee(receivedCents * steamRate + feeBase), 10), effMin);
    const publisherFee = pubRate > 0 ? Math.max(parseInt(roundFee(receivedCents * pubRate), 10), effMin) : 0;
    return { total: receivedCents + steamFee + publisherFee, fee: steamFee + publisherFee, steamFee, publisherFee };
  }

  // 买方支付 -> 卖方到手价（迭代逼近，与参考实现 calcReceivedAmount 一致）
  function calcReceivedFromTotal(buyerCents, appId, publisherRate) {
    let estimated = buyerCents;
    let lastAmount = 0;
    for (let i = 0; i < 10; i++) {
      const { total, fee } = calcBuyerTotal(estimated, appId, publisherRate);
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
  async function findReturnedAssetId(appId, contextId, classid, excludeIds, instanceid) {
    try {
      const resp = await fetch(`https://steamcommunity.com/my/inventory/json/${appId}/${contextId}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) return "";
      const data = await resp.json();
      if (!data || !data.success || !data.rgInventory) return "";
      for (const [assetId, entry] of Object.entries(data.rgInventory)) {
        if (
          entry &&
          String(entry.classid) === String(classid) &&
          (instanceid === undefined || String(entry.instanceid || "0") === String(instanceid)) &&
          !excludeIds.has(assetId)
        ) {
          return assetId;
        }
      }
    } catch (e) {
      console.warn("[SMG] inventory lookup error:", e);
    }
    return "";
  }

  // 轮询等待物品回库并返回其（可能已变化的）assetid，超时返回空串
  async function waitForReturnedAsset(appId, contextId, classid, excludeIds, timeoutMs, instanceid) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const assetId = await findReturnedAssetId(appId, contextId, classid, excludeIds, instanceid);
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
  async function executeRelist(items, sessionid, appId, contextId, receivedCents, buyerCents, options = {}) {
    let success = 0,
      delistFailed = 0,
      relistFailed = 0,
      pending = 0;
    let lastMessage = "";
    const usedAssetIds = options.usedAssetIds || new Set();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const position = (options.progressOffset || 0) + i;
      const count = options.progressTotal || items.length;
      let excludedIds = usedAssetIds;
      updateProgress(`正在重新上架 ${position + 1}/${count}...`, (position / count) * 100);
      try {
        if (options.strictAssetMatch) {
          const before = await fetchActiveInventoryIds(appId, contextId);
          excludedIds = new Set([...usedAssetIds, ...before]);
        }
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
        updateProgress(`正在重新上架 ${position + 1}/${count}: 等待物品返回库存...`, (position / count) * 100);
        const returnedId = item.classid && (await waitForReturnedAsset(appId, contextId, item.classid, excludedIds, 10000, options.strictAssetMatch ? item.instanceid : undefined));
        if (options.strictAssetMatch && !returnedId) throw new Error("未能确认回库资产，已停止该件上架；请在库存核对");
        const assetid = returnedId || item.assetid;
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
          if (isActiveListingsPage) {
            item.buyerCents = buyerCents;
            item.sellerCents = receivedCents;
          }
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
    if (!options.silent) showToast(message, delistFailed || relistFailed || pending ? "smg-error" : "smg-ok");
    return { success, delistFailed, relistFailed, pending, lastMessage };
  }

  async function fetchActiveInventoryIds(appId, contextId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`https://steamcommunity.com/my/inventory/json/${appId}/${contextId}`, { credentials: "include", signal: controller.signal });
      if (!response.ok) throw new Error(`无法读取回库前的库存: HTTP ${response.status}`);
      const data = await response.json();
      if (!data?.success || !data.rgInventory || typeof data.rgInventory !== "object" || Array.isArray(data.rgInventory)) throw new Error("无法核对回库前库存，尚未下架该件物品");
      return new Set(Object.keys(data.rgInventory));
    } finally {
      clearTimeout(timer);
    }
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

  // ── 当前出售挂单管理器（QueryMyListings，2026-11-26 核验） ──
  const ACTIVE_PAGE_SIZE = 50;
  const activeState = {
    mode: ["item", "date", "original"].includes(GM_getValue("activeViewMode", "item")) ? GM_getValue("activeViewMode", "item") : "item",
    filters: { query: "", app: "", category: "", from: "", to: "", days: "", priceBasis: "buyer", minPrice: "", maxPrice: "", minCount: "", reference: "", premium: "" },
    sort: "newest",
    page: 0,
    rows: [],
    filtered: [],
    filterError: "",
    filtersOpen: false,
    status: "idle",
    loading: false,
    total: null,
    offset: 0,
    requestCount: 50,
    controller: null,
    changed: false,
    dirty: false,
    loadedAt: "",
    error: "",
    currencyId: null,
    observedIds: new Set(),
    excluded: 0,
    gameLabels: new Map(),
    observer: null,
    scheduled: false,
  };

  function activeProductKey(item) {
    return JSON.stringify([String(item.appid), item.marketKey, item.contextid, item.currencyId]);
  }

  function collectActiveGameLabels() {
    document.querySelectorAll('a[href*="store.steampowered.com/app/"]').forEach((link) => {
      const id = link.href.match(/\/app\/(\d+)/)?.[1];
      const name = link.textContent.trim() || link.querySelector("img")?.alt;
      if (id && name) activeState.gameLabels.set(id, name);
    });
    activeState.gameLabels.set("753", "Steam 社区物品");
  }

  function findActiveSourceGrid() {
    const nav = [...document.querySelectorAll("a[href]")].find((link) => {
      try {
        return new URL(link.href).pathname === "/market/activelistings" && /出售|active.*listings/i.test(link.textContent);
      } catch {
        return false;
      }
    });
    return (
      [...document.querySelectorAll('[style*="nameblock-start"]')].find(
        (grid) =>
          !grid.closest("#smg-root") &&
          grid.querySelector('[style*="--grid-column: modify;"]') &&
          (!nav || Boolean(nav.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING)),
      ) || null
    );
  }

  function resolveActiveCurrency(data) {
    if (activeState.currencyId !== null || !data.rgListings.length) return;
    const first = data.rgListings[0];
    const listing = first.listing;
    const currencyId = Number(listing.converted_currencyid || listing.currencyid);
    if (!Number.isInteger(currencyId) || currencyId < 2000) throw new Error("挂单货币信息不完整");
    // 此接口使用经济货币 ID（2000 + 钱包货币）；23=CNY 已和真实响应核验。
    const walletId = currencyId - 2000;
    let code = walletId === 23 ? "CNY" : "";
    try {
      code = code || unsafeWindow.GetCurrencyCode?.(walletId) || "";
    } catch {
      /* 使用页面符号 */
    }
    const nativePrice = findActiveSourceGrid()?.querySelector('[style*="--grid-column: price;"]')?.textContent || "";
    code = code || detectCodeBySymbol(nativePrice);
    if (!code || !CURRENCY_META[String(code).toUpperCase()]) throw new Error("无法可靠识别钱包货币，请刷新 Steam 页面后重试");
    currencyMeta = buildCurrencyMeta(String(code).toUpperCase());
    _walletInfoCache = null;
    activeState.currencyId = currencyId;
    console.log(`[SMG] Active listings currency: ${currencyMeta.code} (${currencyId})`);
  }

  function normalizeActiveListing(raw) {
    const listing = raw?.listing,
      description = raw?.description,
      asset = listing?.asset;
    if (!listing || !description || !asset) throw new Error("挂单缺少 listing / description / asset 字段");
    if (listing.active === false || Number(listing.status) !== 1 || Number(listing.time_finish_hold) > Date.now() / 1000) return null;
    const id = String(listing.listingid || "");
    const appid = Number(asset.appid || description.appid);
    const amount = Number(asset.amount);
    const rtListed = Number(listing.time_created);
    const currencyId = Number(listing.converted_currencyid || listing.currencyid);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(appid) || appid <= 0 || !Number.isSafeInteger(amount) || amount < 1 || !Number.isFinite(rtListed))
      throw new Error("挂单标识、数量或日期无效");
    if (currencyId !== activeState.currencyId) throw new Error("服务器返回多种钱包货币，请刷新后核对，未混合计算金额");
    const converted = Number(listing.converted_currencyid) === currencyId;
    const sellerCents = Number(converted ? listing.converted_price : listing.price);
    const fee = Number(converted ? listing.converted_fee : listing.fee);
    if (![sellerCents, fee, sellerCents + fee].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error("挂单金额不是有效的最低货币单位整数");
    const marketKey = String(description.market_bucket_group_id || description.market_hash_name || "");
    if (!marketKey) throw new Error("挂单缺少市场商品标识");
    const tags = Array.isArray(description.tags) ? description.tags : [];
    const originGame = tags.find((tag) => tag.category === "Game")?.localized_tag_name || "";
    const game = activeState.gameLabels.get(String(appid)) || `应用 ${appid}`;
    const referenceMatches = Number(raw.recent_price_currency) === currencyId - 2000;
    const validReference = (value) => (referenceMatches && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null);
    const publisherRate = Number(listing.publisher_fee_percent);
    return {
      listingid: id,
      appid,
      assetid: String(asset.id || ""),
      contextid: String(asset.contextid || ""),
      classid: String(asset.classid || description.classid || ""),
      instanceid: String(asset.instanceid || description.instanceid || "0"),
      amount,
      rtListed,
      dateKey: tsToDateKey(rtListed),
      dateTime: tsToDateTime(rtListed),
      currencyId,
      sellerCents,
      buyerCents: sellerCents + fee,
      sellerPrice: formatMoney(sellerCents),
      buyerPrice: formatMoney(sellerCents + fee),
      name: String(description.market_name || description.name || marketKey),
      marketKey,
      url: `https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(marketKey)}`,
      image: description.icon_url ? `https://community.akamai.steamstatic.com/economy/image/${encodeURI(String(description.icon_url))}` : "",
      game,
      originGame,
      category: String(description.type || "未分类"),
      recentCents: validReference(raw.recent_price),
      marketLowCents: validReference(raw.market_low),
      publisherRate: Number.isFinite(publisherRate) && publisherRate >= 0 && publisherRate <= 1 ? publisherRate : null,
      originalCurrencyId: Number(listing.currencyid),
      pendingPriceChange: Boolean(listing.has_pending_price_change),
    };
  }

  async function requestActivePage(start, count, signal) {
    const url = new URL("/market/actions", location.origin);
    url.searchParams.set("q", "QueryMyListings");
    url.searchParams.set("qp", JSON.stringify([start, count, { bGetAllData: true, category: "active" }]));
    for (let attempt = 0; attempt < 3; attempt++) {
      const timeout = new AbortController();
      const abort = () => timeout.abort();
      signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, 15000);
      try {
        if (signal.aborted) throw new DOMException("已取消", "AbortError");
        const response = await fetch(url.href, { credentials: "include", signal: timeout.signal, redirect: "error", headers: { "x-valve-request-type": "queryAction" } });
        if (!response.ok) {
          const error = new Error(`加载挂单失败: HTTP ${response.status}`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }
        const { data } = await response.json();
        if (
          Number(data?.eResult) !== 1 ||
          !Array.isArray(data.rgListings) ||
          typeof data.bMore !== "boolean" ||
          !Number.isSafeInteger(data.cTotalListings) ||
          data.cTotalListings < 0
        ) {
          const error = new Error("挂单响应格式或登录状态异常，请刷新 Steam 页面");
          error.retryable = false;
          throw error;
        }
        return data;
      } catch (error) {
        if (signal.aborted) throw new DOMException("已取消", "AbortError");
        if (error.retryable === false || attempt === 2) throw error;
        activeState.error = `请求失败，${attempt + 1}/2 次重试`;
        renderActivePanel();
        await abortableActiveDelay((attempt + 1) * 1500, signal);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      }
    }
  }

  function abortableActiveDelay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("已取消", "AbortError"));
        return;
      }
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("已取消", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, ms);
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  async function loadActiveListings(reset = false) {
    if (activeState.loading || batchBusy) return;
    if (reset || activeState.dirty) {
      allOrders = [];
      activeState.offset = 0;
      activeState.requestCount = 50;
      activeState.total = null;
      activeState.observedIds.clear();
      activeState.excluded = 0;
      activeState.changed = false;
      activeState.dirty = false;
      activeState.loadedAt = "";
    }
    activeState.loading = true;
    activeState.status = "loading";
    activeState.error = "";
    activeState.controller = new AbortController();
    const signal = activeState.controller.signal;
    renderActivePanel();
    try {
      let pages = 0;
      while (!signal.aborted && pages++ < 3000) {
        const start = activeState.offset,
          count = activeState.requestCount;
        const data = await requestActivePage(start, count, signal);
        if (signal.aborted) throw new DOMException("已取消", "AbortError");
        resolveActiveCurrency(data);
        if (activeState.total !== null && activeState.total !== data.cTotalListings) activeState.changed = true;
        activeState.total = data.cTotalListings;
        const nextOrders = data.rgListings.map(normalizeActiveListing);
        let added = 0;
        for (let i = 0; i < data.rgListings.length; i++) {
          const id = String(data.rgListings[i].listing.listingid);
          if (activeState.observedIds.has(id)) continue;
          activeState.observedIds.add(id);
          added++;
          if (nextOrders[i]) allOrders.push(nextOrders[i]);
          else activeState.excluded++;
        }
        if (data.bMore && (!data.rgListings.length || !added)) throw new Error("分页没有返回新挂单，已停止以避免重复加载");
        activeState.offset = start + count;
        activeState.requestCount = 25;
        activeState.error = "";
        renderActivePanel();
        if (!data.bMore) {
          const complete = activeState.observedIds.size === data.cTotalListings && !activeState.changed;
          activeState.status = complete ? "complete" : "partial";
          activeState.error = complete ? "" : "加载期间列表发生变化或数量不一致，请刷新数据核对";
          activeState.dirty = !complete;
          activeState.loadedAt = new Date().toLocaleTimeString();
          const live = new Set(allOrders.map((item) => item.listingid));
          for (const id of selectedIds) if (!live.has(id)) selectedIds.delete(id);
          return;
        }
        await abortableActiveDelay(350, signal);
      }
      if (signal.aborted) throw new DOMException("已取消", "AbortError");
      throw new Error("达到分页安全上限，当前数据尚未完整");
    } catch (error) {
      activeState.status = signal.aborted ? "cancelled" : "error";
      activeState.error = signal.aborted ? "已取消加载；可继续读取剩余分页" : error.message;
      console.warn("[SMG] Active listings loader:", error);
    } finally {
      activeState.loading = false;
      activeState.controller = null;
      renderActivePanel();
    }
  }

  function filteredActiveOrders() {
    const f = activeState.filters;
    activeState.filterError = "";
    const numeric = (text, money = false) => {
      if (text === "") return null;
      if (!/^\d+(?:[.,]\d+)?$/.test(text)) throw new Error("筛选金额和数量需为非负数字");
      const value = money ? parseAmount(text) : Number(text);
      if (!Number.isFinite(value) || (money && !Number.isSafeInteger(value))) throw new Error("筛选数值超出有效范围");
      return value;
    };
    try {
      const days = numeric(f.days),
        minimum = numeric(f.minPrice, true),
        maximum = numeric(f.maxPrice, true);
      const minCount = numeric(f.minCount),
        premium = numeric(f.premium);
      if (minCount !== null && (!Number.isInteger(minCount) || minCount < 1)) throw new Error("重复挂单数量需为正整数");
      if (minimum !== null && maximum !== null && minimum > maximum) throw new Error("最低价格不能大于最高价格");
      if (f.from && f.to && f.from > f.to) throw new Error("开始日期不能晚于结束日期");
      const terms = f.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      let items = allOrders.filter((item) => {
        const searchable = `${item.name} ${item.marketKey} ${item.game} ${item.originGame} ${item.category}`.toLocaleLowerCase();
        const price = f.priceBasis === "seller" ? item.sellerCents : item.buyerCents;
        if (!terms.every((term) => searchable.includes(term))) return false;
        if (f.app && String(item.appid) !== f.app) return false;
        if (f.category && item.category !== f.category) return false;
        if ((f.from && item.dateKey < f.from) || (f.to && item.dateKey > f.to)) return false;
        if (days !== null && Date.now() / 1000 - item.rtListed < days * 86400) return false;
        if ((minimum !== null && price < minimum) || (maximum !== null && price > maximum)) return false;
        if (f.reference === "missing" && item.recentCents !== null) return false;
        if (f.reference === "above" && (item.recentCents === null || item.buyerCents <= item.recentCents * (1 + (premium || 0) / 100))) return false;
        return true;
      });
      if (minCount !== null) {
        const counts = new Map();
        items.forEach((item) => counts.set(activeProductKey(item), (counts.get(activeProductKey(item)) || 0) + 1));
        items = items.filter((item) => counts.get(activeProductKey(item)) >= minCount);
      }
      return items;
    } catch (error) {
      activeState.filterError = error.message;
      return [];
    }
  }

  function buildActiveRows(items, mode = activeState.mode) {
    const map = new Map();
    for (const item of items) {
      const key =
        mode === "original" ? item.listingid : JSON.stringify([activeProductKey(item), item.buyerCents, item.sellerCents, item.amount, ...(mode === "date" ? [item.dateKey] : [])]);
      if (!map.has(key)) map.set(key, { items: [], total: 0, oldest: item.rtListed, newest: item.rtListed });
      const row = map.get(key);
      row.items.push(item);
      row.total += item.sellerCents;
      row.oldest = Math.min(row.oldest, item.rtListed);
      row.newest = Math.max(row.newest, item.rtListed);
    }
    return [...map.values()].sort((a, b) => {
      if (activeState.sort === "oldest") return a.oldest - b.oldest;
      if (activeState.sort === "count") return b.items.length - a.items.length || b.newest - a.newest;
      if (activeState.sort === "total") return b.total - a.total;
      if (activeState.sort === "price") return a.items[0].buyerCents - b.items[0].buyerCents;
      if (activeState.sort === "name") return a.items[0].name.localeCompare(b.items[0].name, "zh-CN") || a.items[0].buyerCents - b.items[0].buyerCents;
      return b.newest - a.newest;
    });
  }

  function activeOptions(values, selected, label) {
    return (
      `<option value="">${label}</option>` +
      values.map(([value, text]) => `<option value="${escapeHtml(String(value))}" ${String(value) === selected ? "selected" : ""}>${escapeHtml(String(text))}</option>`).join("")
    );
  }

  function renderActiveFilters() {
    const f = activeState.filters;
    const apps = [...new Map(allOrders.map((item) => [String(item.appid), item.game])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const categories = [...new Set(allOrders.map((item) => item.category))].sort().map((value) => [value, value]);
    const field = (name, label, type = "text", extra = "") =>
      `<label>${label}<input id="smg-filter-${name}" data-smg-filter="${name}" type="${type}" value="${escapeHtml(f[name])}" ${extra}></label>`;
    return `<details id="smg-active-filters" ${activeState.filtersOpen ? "open" : ""}><summary>筛选条件${Object.entries(f).filter(([key, value]) => key !== "priceBasis" && value).length ? "（已设置）" : ""}</summary><div class="smg-filter-grid">
      <label>游戏 / 应用<select id="smg-filter-app" data-smg-filter="app">${activeOptions(apps, f.app, "全部游戏 / 应用")}</select></label>
      <label>物品类别<select id="smg-filter-category" data-smg-filter="category">${activeOptions(categories, f.category, "全部类别")}</select></label>
      ${field("from", "上架开始日期", "date")}${field("to", "上架结束日期", "date")}${field("days", "至少挂单天数", "number", 'min="0" step="1"')}
      <label>价格口径<select id="smg-filter-priceBasis" data-smg-filter="priceBasis"><option value="buyer" ${f.priceBasis === "buyer" ? "selected" : ""}>买方支付</option><option value="seller" ${f.priceBasis === "seller" ? "selected" : ""}>卖方到手</option></select></label>
      ${field("minPrice", "最低要价", "text", 'inputmode="decimal"')}${field("maxPrice", "最高要价", "text", 'inputmode="decimal"')}${field("minCount", "同商品至少挂单数", "number", 'min="1" step="1"')}
      <label>通常价格参考<select id="smg-filter-reference" data-smg-filter="reference"><option value="">不限</option><option value="above" ${f.reference === "above" ? "selected" : ""}>要价高于通常价格</option><option value="missing" ${f.reference === "missing" ? "selected" : ""}>没有通常价格</option></select></label>
      ${field("premium", "高于通常价格至少 %", "number", 'min="0" step="1"')}<button type="button" id="smg-filter-clear">清空筛选</button>
      </div><p class="smg-note">通常价格不是当前最低价；金额均以当前钱包货币显示，堆叠挂单为整笔金额。条件组合后再按同商品挂单数筛选。</p></details>`;
  }

  function renderActivePanel(root = document.getElementById("smg-root")) {
    if (!root || !isActiveListingsPage || !/^\/market\/activelistings\/?$/.test(location.pathname)) return;
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const focus = focused ? { id: focused.id, start: focused.selectionStart, end: focused.selectionEnd } : null;
    const details = root.querySelector("#smg-active-filters");
    if (details) activeState.filtersOpen = details.open;
    activeState.filtered = filteredActiveOrders();
    activeState.rows = buildActiveRows(activeState.filtered);
    const pages = Math.max(1, Math.ceil(activeState.rows.length / ACTIVE_PAGE_SIZE));
    activeState.page = Math.min(activeState.page, pages - 1);
    const labels = { idle: "等待加载", loading: "正在加载", complete: "全部加载完成", partial: "部分数据，需核对", error: "加载失败，数据不完整", cancelled: "已取消，数据不完整" };
    const prefix = activeState.loading ? `${activeState.observedIds.size}/${activeState.total ?? "?"} 笔` : `${allOrders.length}/${activeState.total ?? "?"} 笔`;
    const rows = activeState.rows
      .slice(activeState.page * ACTIVE_PAGE_SIZE, (activeState.page + 1) * ACTIVE_PAGE_SIZE)
      .map((row, localIndex) => {
        const item = row.items[0],
          index = activeState.page * ACTIVE_PAGE_SIZE + localIndex;
        const quantity = row.items.reduce((n, order) => n + order.amount, 0);
        const date =
          activeState.mode === "original"
            ? item.dateTime
            : tsToDateKey(row.oldest) === tsToDateKey(row.newest)
              ? tsToDateKey(row.oldest)
              : `${tsToDateKey(row.oldest)} ～ ${tsToDateKey(row.newest)}`;
        return `<tr><td><input type="checkbox" data-smg-active-row="${index}" aria-label="选择 ${escapeHtml(item.name)} ${row.items.length} 笔挂单"></td>
        <td><div class="smg-item">${item.image ? `<img src="${escapeHtml(item.image)}" width="48" height="48" loading="lazy" alt="">` : ""}<div><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.name)}</a><span>${escapeHtml(item.game)} · ${escapeHtml(item.category)}</span>${item.originGame ? `<span>${escapeHtml(item.originGame)}</span>` : ""}</div></div></td>
        <td class="smg-date">${escapeHtml(date)}<span class="smg-note">最长 ${Math.max(0, Math.floor((Date.now() / 1000 - row.oldest) / 86400))} 天</span></td>
        <td class="smg-money">${escapeHtml(formatMoney(item.buyerCents))}<span class="smg-note">到手 ${escapeHtml(formatMoney(item.sellerCents))}${item.amount > 1 ? "（整笔）" : ""}</span></td>
        <td class="smg-money">${row.items.length} 笔${quantity !== row.items.length ? ` / ${quantity} 件` : ""}<span class="smg-note">到手合计 ${escapeHtml(formatMoney(row.total))}</span></td>
        <td class="smg-money">${item.recentCents === null ? "—" : escapeHtml(formatMoney(item.recentCents))}<span class="smg-note">最低 ${item.marketLowCents === null ? "—" : escapeHtml(formatMoney(item.marketLowCents))}</span></td>
        <td class="smg-row-actions"><button type="button" data-smg-action="delist" data-smg-scope="row" data-smg-active-index="${index}">下架</button><button type="button" data-smg-action="relist" data-smg-scope="row" data-smg-active-index="${index}">重新上架</button></td></tr>`;
      })
      .join("");
    root.innerHTML = `<div id="smg-panel" class="smg-active-manager"><div class="smg-header"><h2 class="smg-title">我当前的出售挂单</h2><span id="smg-active-load-status" role="status" aria-live="polite">${labels[activeState.status]} · ${prefix}</span><button type="button" id="smg-active-load">${activeState.offset && !activeState.dirty && activeState.status !== "complete" ? "继续加载" : "加载全部"}</button><button type="button" id="smg-active-refresh">刷新数据</button><button type="button" id="smg-active-cancel-load" ${activeState.loading ? "" : "hidden"}>取消加载</button><button type="button" id="smg-toggle">${panelCollapsed ? "展开增强" : "收起增强"}</button></div>
      <div class="smg-content" ${panelCollapsed ? "hidden" : ""}><div class="smg-active-sticky"><div class="smg-toolbar"><div class="smg-modes" role="group" aria-label="挂单显示模式">${[
        ["item", "按物品"],
        ["date", "按日期"],
        ["original", "原版"],
      ]
        .map(([mode, label]) => `<button type="button" data-smg-active-mode="${mode}" aria-pressed="${mode === activeState.mode}">${label}</button>`)
        .join(
          "",
        )}</div><label class="smg-search">搜索挂单<input id="smg-filter-query" data-smg-filter="query" type="search" placeholder="名称、游戏、等级；空格组合关键词" value="${escapeHtml(activeState.filters.query)}"></label><label class="smg-sort">排序<select id="smg-active-sort">${[
        ["newest", "最新上架"],
        ["oldest", "挂单最久"],
        ["count", "数量最多"],
        ["total", "到手合计最高"],
        ["price", "单价最低"],
        ["name", "商品名称"],
      ]
        .map(([value, text]) => `<option value="${value}" ${value === activeState.sort ? "selected" : ""}>${text}</option>`)
        .join("")}</select></label></div>
      ${renderActiveFilters()}<div class="smg-toolbar"><label class="smg-select-label"><input id="smg-select-all" type="checkbox">全选筛选结果 ${activeState.filtered.length} 笔</label><span id="smg-selection-count" role="status" aria-live="polite"></span><button type="button" id="smg-selected-delist" data-smg-action="delist" data-smg-scope="selected">下架选中</button><button type="button" id="smg-selected-relist" data-smg-action="relist" data-smg-scope="selected">重新上架选中</button><button type="button" id="smg-clear-selection">清空选择</button><div class="smg-all-actions"><button type="button" data-smg-action="delist" data-smg-scope="filtered">下架筛选结果</button><button type="button" data-smg-action="relist" data-smg-scope="filtered">重新上架筛选结果</button></div></div>
      ${renderProgressSection()}<p class="smg-active-error" role="status">${escapeHtml(activeState.filterError || activeState.error)}</p></div><div class="smg-totals">匹配 ${activeState.filtered.length} 笔 / ${new Set(activeState.filtered.map(activeProductKey)).size} 种商品 · 卖方到手合计 <strong>${escapeHtml(formatMoney(activeState.filtered.reduce((n, item) => n + item.sellerCents, 0)))}</strong><span>${activeState.loadedAt ? `最近扫描结束 ${escapeHtml(activeState.loadedAt)}` : "当前统计仅含已加载数据"}${activeState.excluded ? ` · 排除 ${activeState.excluded} 笔非正常出售记录` : ""}</span></div>
      ${activeState.mode === "original" ? '<p class="smg-note">原版逐件布局 · 全量数据由脚本分页展示；收起增强可查看 Steam 原生列表。</p>' : ""}<div class="smg-table-wrap"><table class="smg-table"><thead><tr><th scope="col">选择</th><th scope="col">名称</th><th scope="col">上架日期</th><th scope="col">要价</th><th scope="col">数量</th><th scope="col">通常价格</th><th scope="col">操作</th></tr></thead><tbody>${rows || '<tr><td colspan="7">没有匹配的已加载挂单</td></tr>'}</tbody></table></div><div class="smg-active-pager"><button id="smg-active-prev" type="button" ${activeState.page ? "" : "disabled"}>上一页</button><span>${activeState.page + 1} / ${pages} 页 · 每页 ${ACTIVE_PAGE_SIZE} 行</span><button id="smg-active-next" type="button" ${activeState.page + 1 < pages ? "" : "disabled"}>下一页</button></div></div></div>`;
    const loading = activeState.loading;
    root.querySelector("#smg-active-load").disabled = loading || batchBusy || activeState.status === "complete";
    root.querySelector("#smg-active-refresh").disabled = loading || batchBusy;
    if (batchBusy || loading)
      root.querySelectorAll(batchBusy ? "button, input, select" : ".smg-content button, .smg-content input, .smg-content select").forEach((control) => {
        control.disabled = true;
      });
    updateActiveSelection();
    document.querySelectorAll(".smg-active-source").forEach((grid) => {
      grid.hidden = !panelCollapsed && activeState.currencyId !== null;
    });
    if (focus?.id) {
      const field = document.getElementById(focus.id);
      if (field && !field.disabled) {
        field.focus({ preventScroll: true });
        if (focus.start !== null && ["text", "search"].includes(field.type)) field.setSelectionRange(focus.start, focus.end);
      }
    }
  }

  function updateActiveSelection() {
    const root = document.getElementById("smg-root");
    if (!root) return;
    const filteredIds = new Set(activeState.filtered.map((item) => item.listingid));
    const selected = getSelectedOrders(),
      hidden = selected.filter((item) => !filteredIds.has(item.listingid)).length;
    const label = root.querySelector("#smg-selection-count");
    if (label) label.textContent = `已选 ${selected.length} 笔${hidden ? `（筛选外 ${hidden} 笔）` : ""}`;
    const sync = (box, items) => {
      const count = items.filter((item) => selectedIds.has(item.listingid)).length;
      box.checked = items.length > 0 && count === items.length;
      box.indeterminate = count > 0 && count < items.length;
      box.disabled = batchBusy || activeState.loading || !items.length;
    };
    const all = root.querySelector("#smg-select-all");
    if (all) sync(all, activeState.filtered);
    root.querySelectorAll("[data-smg-active-row]").forEach((box) => sync(box, activeState.rows[Number(box.dataset.smgActiveRow)].items));
    root.querySelectorAll("[data-smg-action]").forEach((button) => {
      const scope = button.dataset.smgScope;
      button.disabled = batchBusy || activeState.loading || (scope === "selected" ? !selected.length : !activeState.filtered.length);
    });
    const clear = root.querySelector("#smg-clear-selection");
    if (clear) clear.disabled = batchBusy || activeState.loading || !selectedIds.size;
  }

  function bindActiveRoot(root) {
    root.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      if (activeState.loading && button.closest(".smg-content")) return;
      if (button.dataset.smgActiveMode) {
        activeState.mode = button.dataset.smgActiveMode;
        activeState.page = 0;
        GM_setValue("activeViewMode", activeState.mode);
        renderActivePanel();
      } else if (button.dataset.smgAction) {
        const items = activeState.rows[Number(button.dataset.smgActiveIndex)]?.items;
        runActiveBatch(button.dataset.smgAction, button.dataset.smgScope, items);
      } else if (button.id === "smg-active-load") loadActiveListings(false);
      else if (button.id === "smg-active-refresh") loadActiveListings(true);
      else if (button.id === "smg-active-cancel-load") activeState.controller?.abort();
      else if (button.id === "smg-toggle") {
        panelCollapsed = !panelCollapsed;
        renderActivePanel();
      } else if (button.id === "smg-clear-selection") {
        selectedIds.clear();
        updateActiveSelection();
      } else if (button.id === "smg-active-prev" || button.id === "smg-active-next") {
        activeState.page += button.id === "smg-active-next" ? 1 : -1;
        renderActivePanel();
      } else if (button.id === "smg-filter-clear") {
        Object.keys(activeState.filters).forEach((key) => {
          activeState.filters[key] = key === "priceBasis" ? "buyer" : "";
        });
        activeState.page = 0;
        renderActivePanel();
      }
    });
    root.addEventListener("input", (event) => {
      const field = event.target;
      if (activeState.loading || batchBusy || field.disabled) return;
      if (field.dataset.smgFilter && field.tagName === "INPUT") {
        activeState.filters[field.dataset.smgFilter] = field.value;
        activeState.page = 0;
        renderActivePanel();
      }
    });
    root.addEventListener("change", (event) => {
      const field = event.target;
      if (activeState.loading || batchBusy || field.disabled) return;
      if (field.id === "smg-select-all") setItemsSelected(activeState.filtered, field.checked);
      else if (field.dataset.smgActiveRow !== undefined) setItemsSelected(activeState.rows[Number(field.dataset.smgActiveRow)].items, field.checked);
      else if (field.dataset.smgFilter && field.tagName === "SELECT") {
        activeState.filters[field.dataset.smgFilter] = field.value;
        activeState.page = 0;
        renderActivePanel();
      } else if (field.id === "smg-active-sort") {
        activeState.sort = field.value;
        activeState.page = 0;
        renderActivePanel();
      }
      updateActiveSelection();
    });
  }

  function showActivePricePlan(items) {
    const groups = new Map();
    for (const item of items) {
      if (item.amount !== 1 || !/^\d+$/.test(item.assetid) || !/^\d+$/.test(item.contextid) || !item.classid || item.publisherRate === null || item.pendingPriceChange) {
        throw new Error(`${item.name} 的资产、费率或挂单状态不支持安全重新上架，请在 Steam 原生界面操作`);
      }
      const key = `${activeProductKey(item)}:${item.publisherRate}`;
      if (!groups.has(key)) groups.set(key, { items: [], publisherRate: item.publisherRate });
      groups.get(key).items.push(item);
    }
    const plans = [...groups.values()];
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "smg-confirm-overlay";
      overlay.innerHTML = `<div class="smg-confirm-box smg-price-plan"><div class="smg-confirm-title">重新上架 · 按商品设置新价格</div><div class="smg-confirm-body"><p>共 ${items.length} 笔 / ${plans.length} 组商品。每组分别定价，括号内为当前买方价范围。</p><div class="smg-table-wrap"><table class="smg-plan-table"><thead><tr><th>商品 / 数量</th><th>您将收到</th><th>买方支付</th><th>到手合计</th></tr></thead><tbody>${plans
        .map((plan, index) => {
          const first = plan.items[0],
            prices = plan.items.map((item) => item.buyerCents);
          return `<tr><td>${escapeHtml(first.name)}<span class="smg-note">${plan.items.length} 笔（${escapeHtml(formatMoney(Math.min(...prices)))} ～ ${escapeHtml(formatMoney(Math.max(...prices)))}）</span></td><td><input type="text" inputmode="decimal" data-plan="${index}" data-price-side="seller" aria-label="${escapeHtml(first.name)} 您将收到"></td><td><input type="text" inputmode="decimal" data-plan="${index}" data-price-side="buyer" aria-label="${escapeHtml(first.name)} 买方支付"></td><td data-plan-total="${index}">—</td></tr>`;
        })
        .join(
          "",
        )}</tbody></table></div><p id="smg-plan-error" class="smg-active-error" role="status"></p></div><div class="smg-confirm-actions"><button type="button" class="smg-confirm-btn smg-confirm-cancel" data-plan-cancel>取消</button><button type="button" class="smg-confirm-btn smg-confirm-blue" data-plan-ok>预览确认</button></div></div>`;
      const finish = (result) => {
        overlay.remove();
        resolve(result);
      };
      configureDialog(overlay, "按商品设置重新上架价格", () => finish(null));
      const parse = (value) => (/^[\d.,\s]+$/.test(value) ? parseAmount(value) : 0);
      overlay.addEventListener("input", (event) => {
        const input = event.target;
        if (!input.dataset.priceSide) return;
        const index = Number(input.dataset.plan),
          plan = plans[index],
          item = plan.items[0];
        const amount = parse(input.value);
        const seller = input.dataset.priceSide === "seller" ? amount : calcReceivedFromTotal(amount, item.appid, plan.publisherRate);
        const other = overlay.querySelector(`[data-plan="${index}"][data-price-side="${input.dataset.priceSide === "seller" ? "buyer" : "seller"}"]`);
        const otherAmount = input.dataset.priceSide === "seller" ? calcBuyerTotal(seller, item.appid, plan.publisherRate).total : seller;
        other.value = seller > 0 ? (otherAmount / getCurrencyMeta().unit).toFixed(getCurrencyMeta().decimals) : "";
        overlay.querySelector(`[data-plan-total="${index}"]`).textContent = seller > 0 ? formatMoney(seller * plan.items.length) : "—";
      });
      overlay.querySelector("[data-plan-cancel]").addEventListener("click", () => finish(null));
      overlay.querySelector("[data-plan-ok]").addEventListener("click", () => {
        for (let index = 0; index < plans.length; index++) {
          const plan = plans[index];
          const input = overlay.querySelector(`[data-plan="${index}"][data-price-side="seller"]`);
          const amount = parse(input.value);
          if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(amount * plan.items.length)) {
            overlay.querySelector("#smg-plan-error").textContent = "请为每组商品填写有效的新到手单价";
            input.focus();
            return;
          }
          plan.receivedCents = amount;
          plan.buyerCents = calcBuyerTotal(amount, plan.items[0].appid, plan.publisherRate).total;
        }
        finish(plans);
      });
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) finish(null);
      });
      document.body.appendChild(overlay);
      overlay.querySelector("input").focus();
    });
  }

  async function runActiveBatch(action, scope, rowItems) {
    if (!/^\/market\/activelistings\/?$/.test(location.pathname)) return;
    if (batchBusy || activeState.loading) {
      showToast("请先等待或取消当前加载/批量操作", "smg-error");
      return;
    }
    batchBusy = true;
    setAllBatchButtonsDisabled(true);
    let executed = false;
    try {
      const items = (
        scope === "selected" ? getSelectedOrders() : scope === "filtered" ? activeState.filtered.slice() : (rowItems || []).filter((item) => allOrders.includes(item))
      ).sort((a, b) => b.rtListed - a.rtListed);
      if (!items.length) throw new Error("请先选择要操作的挂单");
      const plans = action === "relist" ? await showActivePricePlan(items) : null;
      if (action === "relist" && !plans) {
        showToast("已取消");
        return;
      }
      const label = action === "relist" ? "重新上架" : "下架";
      const hidden = items.filter((item) => !activeState.filtered.includes(item)).length;
      const planMessage = plans
        ? plans
            .map(
              (plan) =>
                `${escapeHtml(plan.items[0].name)}：${plan.items.length} 笔，单件到手 ${escapeHtml(formatMoney(plan.receivedCents))}，买方支付 ${escapeHtml(formatMoney(plan.buyerCents))}`,
            )
            .join("<br>") + `<br><strong>预计到手合计 ${escapeHtml(formatMoney(plans.reduce((n, plan) => n + plan.receivedCents * plan.items.length, 0)))}</strong>`
        : "";
      const confirmed = await showConfirmDialog(
        `即将${label}${scope === "filtered" ? "筛选匹配的已加载" : "选定的"} <strong>${items.length}</strong> 笔挂单${hidden ? `（其中 ${hidden} 笔在当前筛选外）` : ""}。<br>${activeState.status !== "complete" ? "当前列表未完整加载，本次仅处理上述已加载记录。<br>" : ""}${planMessage}`,
        { title: `确认${label}`, okText: `确认${label}`, action },
      );
      if (!confirmed) {
        showToast("已取消");
        return;
      }
      if (!/^\/market\/activelistings\/?$/.test(location.pathname)) throw new Error("页面已切换，已取消尚未执行的操作");
      const sessionid = await resolveSessionId();
      if (!sessionid) throw new Error("无法获取会话ID");
      executed = true;
      if (action === "delist") await executeDelist(items, sessionid);
      else {
        const totals = { success: 0, delistFailed: 0, relistFailed: 0, pending: 0 };
        const usedByContext = new Map();
        let offset = 0,
          lastMessage = "";
        for (const plan of plans) {
          const item = plan.items[0];
          const contextKey = `${item.appid}:${item.contextid}`;
          if (!usedByContext.has(contextKey)) usedByContext.set(contextKey, new Set());
          const usedAssetIds = usedByContext.get(contextKey);
          const result = await executeRelist(plan.items, sessionid, item.appid, item.contextid, plan.receivedCents, plan.buyerCents, {
            silent: true,
            strictAssetMatch: true,
            usedAssetIds,
            progressOffset: offset,
            progressTotal: items.length,
          });
          Object.keys(totals).forEach((key) => {
            totals[key] += result[key];
          });
          lastMessage = result.lastMessage || lastMessage;
          offset += plan.items.length;
        }
        let message = `重新上架完成：成功 ${totals.success} 笔`;
        if (totals.delistFailed) message += `，未处理/下架失败 ${totals.delistFailed} 笔`;
        if (totals.relistFailed) message += `，上架失败 ${totals.relistFailed} 笔（已回到库存）`;
        if (totals.pending) message += `，待核实/确认 ${totals.pending} 笔`;
        if (lastMessage) message += `：${lastMessage}`;
        showToast(message, totals.delistFailed || totals.relistFailed || totals.pending ? "smg-error" : "smg-ok");
      }
    } catch (error) {
      console.warn("[SMG] Active batch:", error);
      showToast(error.message || "操作失败，请刷新核对", "smg-error");
    } finally {
      batchBusy = false;
      batchProgress = "";
      batchPercent = 0;
      if (executed) {
        activeState.dirty = true;
        activeState.status = "partial";
        activeState.error = "本地列表已同步操作结果；再次操作前可刷新核对服务器状态";
      }
      renderActivePanel();
    }
  }

  function mountActivePanel() {
    if (!/^\/market\/activelistings\/?$/.test(location.pathname)) return false;
    collectActiveGameLabels();
    const grid = findActiveSourceGrid();
    if (grid) grid.classList.add("smg-active-source");
    if (document.getElementById("smg-root")) {
      if (grid) grid.hidden = !panelCollapsed && activeState.currencyId !== null;
      return true;
    }
    const nav = [...document.querySelectorAll("a[href]")].find((link) => {
      try {
        return new URL(link.href).pathname === "/market/activelistings" && /出售|active.*listings/i.test(link.textContent);
      } catch {
        return false;
      }
    });
    const target = grid || nav?.parentElement;
    if (!target?.parentElement) return false;
    const root = document.createElement("section");
    root.id = "smg-root";
    root.className = "smg-active-root";
    root.setAttribute("aria-label", "出售挂单聚合筛选");
    // 先在脱离 DOM 的 root 上渲染，再原子插入。
    renderActivePanel(root);
    target.parentElement.insertBefore(root, grid || target.nextSibling);
    bindActiveRoot(root);
    updateActiveSelection();
    return true;
  }

  function initActiveListings() {
    if (activeState.observer) return;
    let started = false;
    const ensure = () => {
      if (!/^\/market\/activelistings\/?$/.test(location.pathname)) {
        activeState.controller?.abort();
        document.getElementById("smg-root")?.remove();
        document.querySelectorAll(".smg-active-source").forEach((grid) => {
          grid.hidden = false;
        });
        document.querySelectorAll(".smg-confirm-overlay").forEach((overlay) => overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        return;
      }
      if (!isActiveListingsPage || !mountActivePanel()) return;
      if (!started) {
        started = true;
        loadActiveListings(true);
      }
    };
    activeState.observer = new MutationObserver((records) => {
      if (records.every((record) => record.target.closest?.("#smg-root, .smg-confirm-overlay, .smg-toast-container"))) return;
      if (activeState.scheduled) return;
      activeState.scheduled = true;
      queueMicrotask(() => {
        activeState.scheduled = false;
        ensure();
      });
    });
    activeState.observer.observe(document.body, { childList: true, subtree: true });
    ensure();
  }

  function main() {
    if (isActiveListingsPage) {
      initActiveListings();
      return;
    }
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
