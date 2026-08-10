// ==UserScript==
// @name         Steam Market Listings Group
// @namespace    https://steamcommunity.com/
// @version      2.5.4
// @description  在Steam市场饰品详情页聚合显示已上架物品，按上架日期与价格分组，支持批量下架与改价重新上架
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
  'use strict';

  // ── Configuration ──────────────────────────────────────
  const CONFIG = {
    minOrders: GM_getValue('minOrders', 5),
  };

  // 已知游戏的非默认 contextid 映射（其余游戏默认 context 为 2，Steam 社区物品为 6）
  const KNOWN_APP_CONTEXT = { '753': '6' };
  const DEFAULT_CONTEXT_ID = '2';

  // 2025年12月Steam市场规则变更：这些货币手续费用 Math.round 而非 Math.floor
  const CURRENCY_CODES_TO_ROUND = ['JPY', 'IDR', 'UAH', 'CLP', 'COP', 'TWD', 'KZT', 'CRC', 'UYU', 'KRW', 'VND'];
  // wallet_currency ID → 货币代码（部分，供页面未提供 GetCurrencyCode 时使用）
  const CURRENCY_ID_TO_CODE = { 1: 'USD', 2: 'GBP', 3: 'EUR', 25: 'CNY', 32: 'TWD', 33: 'HKD', 37: 'JPY' };
  // 2025年12月Steam变更：单笔手续费最低额提高到 $0.01 等值（国区 ¥0.07，旧值 0.01 元）；
  // 已用真实挂单数据验证：到手 0.85 → 买方 1.00（Steam费4 + 发行商费8），到手 0.60 → 买方 0.74（两费各按最低 0.07）
  const MIN_FEE_BY_CURRENCY = { 'CNY': 7 };

  GM_registerMenuCommand('\u2699 \u8BBE\u7F6E\u6700\u5C11\u68C0\u6D4B\u4E0A\u67B6\u6570\u91CF\u9608\u503C', () => {
    const val = prompt(`\u8BF7\u8F93\u5165\u6700\u5C11\u68C0\u6D4B\u4E0A\u67B6\u6570\u91CF\u9608\u503C\uFF08\u5F53\u524D: ${CONFIG.minOrders}\uFF09\n\u4E0A\u67B6\u5546\u54C1\u6570 \u2264 \u6B64\u503C\u65F6\u4E0D\u663E\u793A\u6C47\u603B\u9762\u677F`, String(CONFIG.minOrders));
    if (val === null) return;
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) {
      alert('\u8BF7\u8F93\u5165\u6709\u6548\u7684\u975E\u8D1F\u6574\u6570');
      return;
    }
    CONFIG.minOrders = num;
    GM_setValue('minOrders', num);
    alert(`\u5DF2\u4FDD\u5B58\uFF0C\u9608\u503C: ${num}\u3002\u5237\u65B0\u9875\u9762\u540E\u751F\u6548`);
  });

  // ── Styles ──────────────────────────────────────────────

  GM_addStyle(`
    #smg-panel {
      box-sizing: border-box;
      background: linear-gradient(180deg, #1d1f23 0%, #23262e 100%);
      border: 1px solid #3d4450; border-radius: 4px;
      padding: 16px 20px; margin: 12px 0 16px; width: 100%;
      font-family: "Motiva Sans", Arial, Helvetica, sans-serif; color: #c7d5e0;
    }
    .smg-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
    }
    .smg-title { color: #66c0f4; font-size: 15px; font-weight: 500; margin: 0; }
    .smg-toggle-btn {
      background: none; border: 1px solid #3d4450; color: #8f98a0; cursor: pointer;
      padding: 4px 12px; border-radius: 3px; font-size: 12px; transition: all .15s;
    }
    .smg-toggle-btn:hover { border-color: #66c0f4; color: #66c0f4; }

    .smg-table { width: 100%; border-collapse: collapse; }
    .smg-table th {
      color: #8f98a0; text-align: left; padding: 6px 8px; font-size: 12px;
      border-bottom: 1px solid #3d4450; font-weight: 500;
    }
    .smg-table td {
      color: #c7d5e0; padding: 7px 8px; font-size: 13px;
      border-bottom: 1px solid rgba(61,68,80,.4);
    }
    .smg-table tr:last-child td { border-bottom: none; }
    .smg-table tr:hover td { background: rgba(102,192,244,.04); }
    .smg-date-cell { white-space: nowrap; color: #66c0f4; font-weight: 500; width: 110px; }
    .smg-prices-cell { color: #acb2b8; line-height: 1.8; }
    .smg-price-tag {
      display: inline-block; background: rgba(102,192,244,.08); border: 1px solid rgba(102,192,244,.15);
      border-radius: 3px; padding: 1px 7px; margin: 2px 3px 2px 0; font-size: 12px; color: #c7d5e0;
    }
    .smg-price-tag .smg-ct { color: #8f98a0; margin-left: 3px; }
    .smg-price-tag .smg-sp { color: #7a8a96; font-size: 11px; margin-left: 2px; }
    .smg-count-cell { text-align: right; white-space: nowrap; color: #acb2b8; width: 60px; }
    .smg-total-row td {
      border-top: 1px solid #3d4450; font-weight: 500; color: #66c0f4; padding-top: 10px;
    }
    #smg-panel.smg-collapsed .smg-table-wrap { display: none; }

    .smg-delist-section {
      margin-top: 14px; padding-top: 12px; border-top: 1px solid #3d4450;
    }
    .smg-delist-row {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    }
    .smg-delist-label { color: #8f98a0; font-size: 13px; white-space: nowrap; }
    .smg-delist-select {
      background: #31404d; border: 1px solid #3d4450; color: #c7d5e0;
      padding: 5px 8px; border-radius: 3px; font-size: 13px; min-width: 140px;
    }
    .smg-delist-input {
      background: #31404d; border: 1px solid #3d4450; color: #c7d5e0;
      padding: 5px 8px; border-radius: 3px; font-size: 13px; width: 70px; text-align: center;
    }
    .smg-delist-btn {
      background: linear-gradient(180deg, #c44 0%, #a33 100%); border: none;
      color: #fff; padding: 5px 16px; border-radius: 3px; cursor: pointer;
      font-size: 13px; transition: opacity .15s;
    }
    .smg-delist-btn:hover { opacity: .85; }
    .smg-delist-btn:disabled { opacity: .5; cursor: default; }
    .smg-delist-all-btn { margin-left: auto; }
    .smg-relist-btn {
      background: linear-gradient(180deg, #66c0f4 0%, #417a9b 100%); border: none;
      color: #fff; padding: 5px 16px; border-radius: 3px; cursor: pointer;
      font-size: 13px; transition: opacity .15s;
    }
    .smg-relist-btn:hover { opacity: .85; }
    .smg-relist-btn:disabled { opacity: .5; cursor: default; }
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
      background: #1b2838; border: 1px solid #3d4450; border-radius: 6px;
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
  `);

  // ── Utility ─────────────────────────────────────────────

  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, c => map[c]);
  }

  function formatDateParts(ts) {
    const d = new Date(ts * 1000);
    return {
      y: d.getFullYear(),
      m: String(d.getMonth() + 1).padStart(2, '0'),
      day: String(d.getDate()).padStart(2, '0'),
      h: String(d.getHours()).padStart(2, '0'),
      min: String(d.getMinutes()).padStart(2, '0'),
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

  function getSessionId() {
    if (unsafeWindow.g_sessionID) return unsafeWindow.g_sessionID;
    const meta = document.querySelector('meta[name="sessionid"]');
    if (meta) return meta.content;
    const match = document.cookie.match(/sessionid=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  // ── Loading Overlay ─────────────────────────────────────

  function showLoading() {
    if (document.getElementById('smg-loading')) return;
    const el = document.createElement('div');
    el.id = 'smg-loading';
    el.innerHTML = '<div class="smg-spinner"></div><div class="smg-loading-text">正在加载上架数据...</div>';
    document.body.appendChild(el);
  }

  function hideLoading() {
    const el = document.getElementById('smg-loading');
    if (!el) return;
    el.classList.add('smg-fade-out');
    setTimeout(() => el.remove(), 300);
  }

  // ── Confirm Dialog ──────────────────────────────────────

  function showConfirmDialog(message, opts) {
    const { title = '确认下架', okText = '确认下架' } = opts || {};
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'smg-confirm-overlay';
      overlay.innerHTML = `
        <div class="smg-confirm-box">
          <div class="smg-confirm-title">${title}</div>
          <div class="smg-confirm-body">${message}</div>
          <div class="smg-confirm-actions">
            <button class="smg-confirm-btn smg-confirm-cancel" id="smg-confirm-cancel">取消</button>
            <button class="smg-confirm-btn smg-confirm-ok" id="smg-confirm-ok">${okText}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const cleanup = (result) => { overlay.remove(); resolve(result); };
      overlay.querySelector('#smg-confirm-cancel').addEventListener('click', () => cleanup(false));
      overlay.querySelector('#smg-confirm-ok').addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    });
  }

  // ── Data Extraction ──────────────────────────────────────

  function extractOrders() {
    console.log('[SMG] Extracting orders from SSR data...');
    const ssr = unsafeWindow.SSR?.loaderData;
    if (!Array.isArray(ssr)) {
      console.warn('[SMG] SSR data not available');
      return null;
    }

    for (const entry of ssr) {
      try {
        const data = typeof entry === 'string' ? JSON.parse(entry) : entry;
        const orders = data?.myOrders?.rgSellOrders;
        if (Array.isArray(orders) && orders.length > 0) {
          console.log(`[SMG] Found ${orders.length} sell orders`);
          return orders.map(o => ({
            listingid: o.listingid,
            assetid: o.assetid,
            appid: o.appid,
            classid: o.classid,
            rtListed: o.rtListed,
            dateKey: tsToDateKey(o.rtListed),
            dateTime: tsToDateTime(o.rtListed),
            buyerPrice: (o.strBuyerPrice || '').trim(),
            sellerPrice: (o.strSellerPrice || '').trim(),
          }));
        }
      } catch (e) { /* skip */ }
    }

    console.warn('[SMG] No sell orders found in SSR data');
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
      .map(g => ({
        dateKey: g.dateKey,
        prices: g.prices,
        sortedPrices: [...g.prices.keys()].sort((a, b) =>
          parseFloat(a.replace(/[^0-9.]/g, '')) - parseFloat(b.replace(/[^0-9.]/g, ''))
        ),
        totalCount: g.items.length,
      }));
  }

  // ── Rendering ───────────────────────────────────────────

  function renderSummary(grouped, allOrders) {
    const total = grouped.reduce((s, g) => s + g.totalCount, 0);

    let rows = '';
    for (const g of grouped) {
      const tags = g.sortedPrices.map(p => {
        const items = g.prices.get(p);
        const cnt = items.length;
        const sp = items[0].sellerPrice;
        const sellerPart = sp ? `<span class="smg-sp">(${escapeHtml(sp)})</span>` : '';
        return `<span class="smg-price-tag">${escapeHtml(p)}${sellerPart}<span class="smg-ct">x${cnt}</span></span>`;
      }).join('');

      rows += `<tr>
        <td class="smg-date-cell">${escapeHtml(g.dateKey)}</td>
        <td class="smg-prices-cell">${tags}</td>
        <td class="smg-count-cell">${g.totalCount}</td>
      </tr>`;
    }

    return `<div id="smg-panel">
      <div class="smg-header">
        <h3 class="smg-title">上架汇总 - 共 ${total} 件 / ${grouped.length} 个日期</h3>
        <button class="smg-toggle-btn" id="smg-toggle">收起</button>
      </div>
      <div class="smg-table-wrap">
        <table class="smg-table">
          <thead><tr><th>日期</th><th>价格分布</th><th style="text-align:right">数量</th></tr></thead>
          <tbody>${rows}
            <tr class="smg-total-row">
              <td>合计</td><td></td><td class="smg-count-cell">${total}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${renderDelistSection(allOrders)}
    </div>`;
  }

  function renderDelistSection(allOrders) {
    const priceMap = new Map();
    for (const o of allOrders) {
      if (!priceMap.has(o.buyerPrice)) priceMap.set(o.buyerPrice, 0);
      priceMap.set(o.buyerPrice, priceMap.get(o.buyerPrice) + 1);
    }

    const options = [...priceMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([p, c]) => `<option value="${escapeHtml(p)}">${escapeHtml(p)} (${c}件)</option>`)
      .join('');

    return `<div class="smg-delist-section">
      <div class="smg-delist-row">
        <span class="smg-delist-label">下架价格:</span>
        <select class="smg-delist-select" id="smg-delist-price">
          <option value="">选择价格</option>
          ${options}
        </select>
        <span class="smg-delist-label">数量:</span>
        <input type="number" class="smg-delist-input" id="smg-delist-qty" value="1" min="1" placeholder="数量">
        <button class="smg-delist-btn" id="smg-delist-btn">下架</button>
        <button class="smg-relist-btn" id="smg-relist-btn">重新上架</button>
        <button class="smg-delist-btn smg-delist-all-btn" id="smg-delist-all-btn">全部下架</button>
      </div>
      <div class="smg-delist-status" id="smg-delist-status"></div>
      <div class="smg-progress-wrap" id="smg-progress-wrap">
        <div class="smg-progress-bar" id="smg-progress-bar"></div>
      </div>
    </div>`;
  }

  function refreshPanel(allOrders, grouped) {
    const panel = document.getElementById('smg-panel');
    if (!panel) return;
    const wrapper = document.getElementById('smg-root');
    if (wrapper) {
      wrapper.innerHTML = renderSummary(grouped, allOrders);
      if (!document.getElementById('smg-panel')) {
        console.warn('[SMG] Panel not found after refresh');
        return;
      }
    }
    bindPanelEvents();
  }

  function bindPanelEvents() {
    document.getElementById('smg-toggle')?.addEventListener('click', function () {
      const p = document.getElementById('smg-panel');
      p.classList.toggle('smg-collapsed');
      this.textContent = p.classList.contains('smg-collapsed') ? '展开' : '收起';
    });

    // 处理器内部直接读写模块级 allOrders/grouped，确保批量操作回写后的最新状态被使用
    document.getElementById('smg-delist-btn')?.addEventListener('click', () => {
      handleDelist();
    });

    document.getElementById('smg-delist-all-btn')?.addEventListener('click', () => {
      handleDelist(true);
    });

    document.getElementById('smg-relist-btn')?.addEventListener('click', () => {
      handleRelist();
    });
  }

  // 状态提示统一入口：autoHide=true 时 5 秒后自动清空（非进度类提示）；
  // 进度类消息传 false 保持常显，并顺带取消待执行的隐藏定时器
  let _statusTimer = null;
  function showStatus(el, text, cls, autoHide) {
    if (!el) return;
    clearTimeout(_statusTimer);
    el.textContent = text;
    el.className = 'smg-delist-status' + (cls ? ' ' + cls : '');
    if (autoHide) {
      _statusTimer = setTimeout(() => {
        el.textContent = '';
        el.className = 'smg-delist-status';
      }, 5000);
    }
  }

  async function handleDelist(removeAll) {
    const priceSelect = document.getElementById('smg-delist-price');
    const qtyInput = document.getElementById('smg-delist-qty');
    const statusEl = document.getElementById('smg-delist-status');
    const btn = document.getElementById('smg-delist-btn');
    const allBtn = document.getElementById('smg-delist-all-btn');
    const relistBtn = document.getElementById('smg-relist-btn');

    // 互斥：任一批量流程进行中禁止启动另一个批量（比按钮禁用更可靠，不受重注入影响）
    if (batchBusy) {
      showStatus(statusEl, '已有批量操作进行中，请稍候', 'smg-error', true);
      return;
    }
    const progressWrap = document.getElementById('smg-progress-wrap');
    const progressBar = document.getElementById('smg-progress-bar');

    const price = priceSelect.value;
    const qty = parseInt(qtyInput.value, 10);

    let toRemove;
    if (removeAll) {
      // 全部下架：忽略价格/数量选择，按上架时间从新到旧处理
      toRemove = allOrders.slice().sort((a, b) => b.rtListed - a.rtListed);
      if (toRemove.length === 0) {
        showStatus(statusEl, '没有可下架的商品', 'smg-error', true);
        return;
      }
    } else {
      if (!price) {
        showStatus(statusEl, '请选择价格', 'smg-error', true);
        return;
      }
      if (!qty || qty < 1) {
        showStatus(statusEl, '请输入有效数量', 'smg-error', true);
        return;
      }

      const candidates = allOrders
        .filter(o => o.buyerPrice === price)
        .sort((a, b) => b.rtListed - a.rtListed);

      if (candidates.length === 0) {
        showStatus(statusEl, '该价格没有可下架的商品', 'smg-error', true);
        return;
      }

      toRemove = candidates.slice(0, Math.min(qty, candidates.length));
    }
    const removedSet = new Set();

    // Confirm dialog
    const confirmMsg = removeAll
      ? `即将下架全部 <strong>${toRemove.length}</strong> 件商品，确认继续？`
      : `即将下架价格 <strong>${escapeHtml(price)}</strong> 的 <strong>${toRemove.length}</strong> 件商品，确认继续？`;
    const confirmed = await showConfirmDialog(confirmMsg);
    if (!confirmed) {
      showStatus(statusEl, '已取消', '', true);
      return;
    }

    const sessionid = getSessionId();
    if (!sessionid) {
      showStatus(statusEl, '无法获取会话ID', 'smg-error', true);
      return;
    }

    batchBusy = true;
    btn.disabled = true;
    if (allBtn) allBtn.disabled = true;
    if (relistBtn) relistBtn.disabled = true;
    progressWrap.classList.add('smg-visible');
    progressBar.style.width = '0%';

    let success = 0;
    let failed = 0;

    for (let i = 0; i < toRemove.length; i++) {
      const item = toRemove[i];
      const progress = ((i + 1) / toRemove.length * 100).toFixed(1);
      progressBar.style.width = `${progress}%`;
      showStatus(statusEl, `正在下架 ${i + 1}/${toRemove.length}...`);

      try {
        const resp = await fetch(`https://steamcommunity.com/market/removelisting/${item.listingid}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `sessionid=${encodeURIComponent(sessionid)}`,
        });
        if (resp.ok) {
          success++;
          removedSet.add(item.listingid);
        } else {
          failed++;
          console.warn(`[SMG] Failed to delist ${item.listingid}: HTTP ${resp.status}`);
        }
      } catch (e) {
        failed++;
        console.warn(`[SMG] Failed to delist ${item.listingid}:`, e);
      }
    }

    btn.disabled = false;
    if (allBtn) allBtn.disabled = false;
    if (relistBtn) relistBtn.disabled = false;
    setTimeout(() => progressWrap.classList.remove('smg-visible'), 1500);
    batchBusy = false;

    // 回写模块级状态：reinjectObserver 重注入与后续按钮回调都依赖它，
    // 否则 hydration 重注入会用陈旧数据把已下架商品"复活"到面板
    allOrders = allOrders.filter(o => !removedSet.has(o.listingid));
    grouped = groupOrders(allOrders);
    refreshPanel(allOrders, grouped);
    // 完成提示写入刷新后的新面板（refreshPanel 重建 DOM 会擦掉旧状态），5 秒后自动消失
    showStatus(document.getElementById('smg-delist-status'),
      `下架完成: 成功 ${success} 件` + (failed > 0 ? `, 失败 ${failed} 件` : ''),
      failed > 0 ? 'smg-error' : 'smg-ok', true);
  }

  // ── Relist ─────────────────────────────────────────

  // 钱包费率信息（仅缓存从 g_rgWalletInfo 成功读取的结果，回退值不缓存）
  let _walletInfoCache = null;
  function getWalletInfo() {
    if (_walletInfoCache) return _walletInfoCache;
    try {
      const wi = unsafeWindow.g_rgWalletInfo;
      if (wi && wi.wallet_currency != null) {
        _walletInfoCache = {
          feePercent: parseFloat(wi.wallet_fee_percent) || 0.05,
          feeBase: parseInt(wi.wallet_fee_base, 10) || 0,
          feeMinimum: parseInt(wi.wallet_fee_minimum, 10) || 1,
          pubPercentDefault: parseFloat(wi.wallet_publisher_fee_percent_default) || 0.10,
          currency: wi.wallet_currency,
        };
        // 货币代码 → 取整方式与最低费（2025年12月Steam变更）
        let code = '';
        try {
          if (typeof unsafeWindow.GetCurrencyCode === 'function') code = unsafeWindow.GetCurrencyCode(wi.wallet_currency) || '';
        } catch (e) { /* 使用本地映射表 */ }
        code = code || CURRENCY_ID_TO_CODE[wi.wallet_currency] || '';
        _walletInfoCache.currencyCode = code;
        _walletInfoCache.useRound = CURRENCY_CODES_TO_ROUND.includes(code);
        return _walletInfoCache;
      }
    } catch (e) { /* 回退默认费率 */ }
    // 默认值不缓存，下次调用重试 g_rgWalletInfo；
    // 无钱包信息时（新版 SSR 页面常见）从订单价格前缀推断货币，保证最低费/取整规则仍生效
    let code = '';
    try {
      if (allOrders && allOrders[0] && /^[¥￥]/.test(allOrders[0].buyerPrice || '')) code = 'CNY';
    } catch (e) { /* allOrders 尚未就绪 */ }
    return { feePercent: 0.05, feeBase: 0, feeMinimum: 1, pubPercentDefault: 0.10, currency: code === 'CNY' ? 25 : 1, currencyCode: code, useRound: CURRENCY_CODES_TO_ROUND.includes(code) };
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
    } catch (e) { /* 保持钱包默认费率 */ }
    return { pubRate, steamRate: wi.feePercent, feeBase: wi.feeBase, feeMinimum: wi.feeMinimum, currencyCode: wi.currencyCode, useRound: wi.useRound };
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

  function showPriceDialog(oldPrice, count, appId) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'smg-confirm-overlay';
      overlay.innerHTML = `
        <div class="smg-confirm-box">
          <div class="smg-confirm-title">重新上架 - 输入新价格</div>
          <div class="smg-confirm-body">
            将价格 <strong>${escapeHtml(oldPrice)}</strong> 的 <strong>${count}</strong> 件商品以新价格重新上架:
          </div>
          <div style="margin-bottom: 20px;">
            <div class="smg-relist-price-grid">
              <span class="smg-relist-price-label">您将收到:</span>
              <span class="smg-relist-price-label">买方支付:</span>
              <input type="text" class="smg-price-input" id="smg-relist-received" placeholder="0.00">
              <input type="text" class="smg-price-input" id="smg-relist-buyer" placeholder="0.00">
            </div>
          </div>
          <div class="smg-confirm-actions">
            <button class="smg-confirm-btn smg-confirm-cancel" id="smg-price-cancel">取消</button>
            <button class="smg-confirm-btn smg-confirm-blue" id="smg-price-ok">下一步</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const receivedInput = overlay.querySelector('#smg-relist-received');
      const buyerInput = overlay.querySelector('#smg-relist-buyer');
      const cleanup = (result) => { overlay.remove(); resolve(result); };

      const parseCents = (str) => {
        const num = parseFloat(String(str).replace(/[^\d.]/g, ''));
        return (!isNaN(num) && num > 0) ? Math.round(num * 100) : 0;
      };

      receivedInput.addEventListener('input', () => {
        const receivedCents = parseCents(receivedInput.value);
        if (!receivedCents) { buyerInput.value = ''; return; }
        buyerInput.value = (calcBuyerTotal(receivedCents, appId).total / 100).toFixed(2);
      });

      buyerInput.addEventListener('input', () => {
        const buyerCents = parseCents(buyerInput.value);
        if (!buyerCents) { receivedInput.value = ''; return; }
        receivedInput.value = (calcReceivedFromTotal(buyerCents, appId) / 100).toFixed(2);
      });

      overlay.querySelector('#smg-price-cancel').addEventListener('click', () => cleanup(null));
      overlay.querySelector('#smg-price-ok').addEventListener('click', () => {
        // 以"您将收到"为唯一事实来源重算买方价：sellitem 实际只提交 receivedCents，
        // 若两输入框不一致仍原样提交，确认页展示的买方支付将与 Steam 实际挂单价不符
        const receivedCents = parseCents(receivedInput.value);
        if (!receivedCents) {
          receivedInput.focus();
          return;
        }
        const buyerCents = calcBuyerTotal(receivedCents, appId).total;
        cleanup({ buyerCents, receivedCents });
      });
      [receivedInput, buyerInput].forEach(inp => inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') overlay.querySelector('#smg-price-ok').click();
      }));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
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
    let contextId = '';

    // 1) 旧版 g_rgAppContextData（兼容数组与对象两种结构）
    const appCtx = unsafeWindow.g_rgAppContextData && unsafeWindow.g_rgAppContextData[appId];
    if (Array.isArray(appCtx) && appCtx.length > 0 && appCtx[0].id) {
      contextId = String(appCtx[0].id);
    } else if (appCtx && typeof appCtx === 'object') {
      if (appCtx.contexts && typeof appCtx.contexts === 'object') {
        const first = Object.keys(appCtx.contexts).find(k => /^\d+$/.test(k));
        if (first) contextId = first;
      } else {
        const first = Object.keys(appCtx).find(k => /^\d+$/.test(k));
        if (first) contextId = first;
      }
    }

    // 2) SSR loaderData 深度扫描 contextid 字段
    if (!contextId) contextId = scanSSRForContextId();

    // 3) 页面 HTML 源码（SSR 序列化 JSON / 链接参数）正则扫描
    if (!contextId) {
      const html = document.documentElement.innerHTML;
      const m = html.match(/"contextid"\s*:\s*"?(\d+)"?/i)
        || html.match(/contextid=(\d+)/i);
      if (m) contextId = m[1];
    }

    if (!contextId) {
      console.warn('[SMG] contextid not found; SSR keys:',
        (unsafeWindow.SSR?.loaderData || []).map((e, i) => {
          try { return `${i}:${typeof e === 'string' ? Object.keys(JSON.parse(e)).join(',') : Object.keys(e || {}).join(',')}`; }
          catch (err) { return `${i}:?`; }
        })
      );
    }
    console.log(`[SMG] App context: appid=${appId}, contextid=${contextId || '(not found)'}`);
    return { appId, contextId };
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 下架回库后 assetid 可能变化：单次查库存，按 classid 定位可用资产
  async function findReturnedAssetId(appId, contextId, classid, excludeIds) {
    try {
      const resp = await fetch(`https://steamcommunity.com/my/inventory/json/${appId}/${contextId}`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' },
      });
      if (!resp.ok) return '';
      const data = await resp.json();
      if (!data || !data.success || !data.rgInventory) return '';
      for (const [assetId, entry] of Object.entries(data.rgInventory)) {
        if (entry && String(entry.classid) === String(classid) && !excludeIds.has(assetId)) {
          return assetId;
        }
      }
    } catch (e) {
      console.warn('[SMG] inventory lookup error:', e);
    }
    return '';
  }

  // 轮询等待物品回库并返回其（可能已变化的）assetid，超时返回空串
  async function waitForReturnedAsset(appId, contextId, classid, excludeIds, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const assetId = await findReturnedAssetId(appId, contextId, classid, excludeIds);
      if (assetId) return assetId;
      await sleep(1500);
    }
    return '';
  }

  function scanSSRForContextId() {
    const ssr = unsafeWindow.SSR?.loaderData;
    if (!Array.isArray(ssr)) return '';
    for (const entry of ssr) {
      let obj = entry;
      if (typeof entry === 'string') {
        try { obj = JSON.parse(entry); } catch (e) { continue; }
      }
      const found = findContextId(obj, 0);
      if (found) return found;
    }
    return '';
  }

  function findContextId(node, depth) {
    if (!node || typeof node !== 'object' || depth > 8) return '';
    if (Array.isArray(node)) {
      for (const v of node) {
        const r = findContextId(v, depth + 1);
        if (r) return r;
      }
      return '';
    }
    // 直接字段 contextid / context_id
    for (const [k, v] of Object.entries(node)) {
      const lk = k.toLowerCase();
      if ((lk === 'contextid' || lk === 'context_id') && (typeof v === 'string' || typeof v === 'number')) {
        return String(v);
      }
    }
    // contexts 映射 { "2": {...} }
    for (const [k, v] of Object.entries(node)) {
      const lk = k.toLowerCase();
      if ((lk === 'contexts' || lk === 'rgcontexts' || lk === 'app_contexts') && v && typeof v === 'object') {
        const first = Object.keys(v).find(key => /^\d+$/.test(key));
        if (first) return first;
      }
    }
    // 递归子节点
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') {
        const r = findContextId(v, depth + 1);
        if (r) return r;
      }
    }
    return '';
  }

  async function handleRelist() {
    const priceSelect = document.getElementById('smg-delist-price');
    const qtyInput = document.getElementById('smg-delist-qty');
    const statusEl = document.getElementById('smg-delist-status');
    const delistBtn = document.getElementById('smg-delist-btn');
    const relistBtn = document.getElementById('smg-relist-btn');
    const allBtn = document.getElementById('smg-delist-all-btn');

    // 互斥：任一批量流程进行中禁止启动另一个批量
    if (batchBusy) {
      showStatus(statusEl, '已有批量操作进行中，请稍候', 'smg-error', true);
      return;
    }
    const progressWrap = document.getElementById('smg-progress-wrap');
    const progressBar = document.getElementById('smg-progress-bar');

    const price = priceSelect.value;
    const qty = parseInt(qtyInput.value, 10);

    if (!price) {
      showStatus(statusEl, '请选择价格', 'smg-error', true);
      return;
    }
    if (!qty || qty < 1) {
      showStatus(statusEl, '请输入有效数量', 'smg-error', true);
      return;
    }

    const candidates = allOrders
      .filter(o => o.buyerPrice === price)
      .sort((a, b) => b.rtListed - a.rtListed);

    if (candidates.length === 0) {
      showStatus(statusEl, '该价格没有可操作的商品', 'smg-error', true);
      return;
    }

    const toRemove = candidates.slice(0, Math.min(qty, candidates.length));

    const sessionid = getSessionId();
    if (!sessionid) {
      showStatus(statusEl, '无法获取会话ID', 'smg-error', true);
      return;
    }

    const { appId, contextId: pageContextId } = getAppContext(toRemove[0].appid);
    if (!appId) {
      showStatus(statusEl, '无法获取应用 appid，请刷新页面重试', 'smg-error', true);
      return;
    }

    // Step 1: 输入新价格（您将收到 / 买方支付 联动，含手续费计算）
    const priceResult = await showPriceDialog(price, toRemove.length, appId);
    if (priceResult === null) {
      showStatus(statusEl, '已取消', '', true);
      return;
    }
    const { buyerCents, receivedCents } = priceResult;

    // Step 2: 二次确认
    const confirmed = await showConfirmDialog(
      `即将把价格 <strong>${escapeHtml(price)}</strong> 的 <strong>${toRemove.length}</strong> 件商品下架，` +
      `并以新价格重新上架（您将收到 <strong>${(receivedCents / 100).toFixed(2)}</strong>，` +
      `买方支付 <strong>${(buyerCents / 100).toFixed(2)}</strong>），确认继续？`,
      { title: '确认重新上架', okText: '确认重新上架' }
    );
    if (!confirmed) {
      showStatus(statusEl, '已取消', '', true);
      return;
    }

    // Step 3: contextid 解析（与参考实现 market.uset.js 一致：页面提取 → 静态映射 + 默认值）
    const contextId = pageContextId || KNOWN_APP_CONTEXT[String(appId)] || DEFAULT_CONTEXT_ID;
    if (!pageContextId) {
      console.log(`[SMG] contextid not found in page sources; using default '${contextId}' for app ${appId}`);
    }

    batchBusy = true;
    delistBtn.disabled = true;
    relistBtn.disabled = true;
    if (allBtn) allBtn.disabled = true;
    progressWrap.classList.add('smg-visible');
    progressBar.style.width = '0%';

    let success = 0;
    let delistFailed = 0;
    let relistFailed = 0;
    let lastSellMsg = '';
    // 已下架但重新上架失败的条目：物品已回库存、listingid 已失效，结束时须从本地数据移除
    const unlistedSet = new Set();
    // 同批次内已使用的回库 assetid，避免重复选中同一资产
    const usedAssetIds = new Set();
    const nowTs = Math.floor(Date.now() / 1000);
    // 复用页面原价格格式的货币前缀（如 "¥ "）
    const currencyPrefix = ((allOrders[0]?.buyerPrice || '').match(/^[^0-9]*/) || [''])[0];

    for (let i = 0; i < toRemove.length; i++) {
      const item = toRemove[i];
      progressBar.style.width = `${((i + 1) / toRemove.length * 100).toFixed(1)}%`;
      showStatus(statusEl, `正在重新上架 ${i + 1}/${toRemove.length}...`);

      try {
        // 先下架旧挂单
        const rmResp = await fetch(`https://steamcommunity.com/market/removelisting/${item.listingid}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `sessionid=${encodeURIComponent(sessionid)}`,
        });
        if (!rmResp.ok) {
          delistFailed++;
          console.warn(`[SMG] Relist: failed to delist ${item.listingid}: HTTP ${rmResp.status}`);
          continue;
        }

        // 等待物品返回库存并重新定位 assetid（下架回库后 assetid 可能变化，旧值会报“物品不在库存”）
        showStatus(statusEl, `正在重新上架 ${i + 1}/${toRemove.length}: 等待物品返回库存...`);
        let sellAssetId = item.assetid;
        if (item.classid) {
          const returnedId = await waitForReturnedAsset(appId, contextId, item.classid, usedAssetIds, 10000);
          if (returnedId) {
            sellAssetId = returnedId;
            usedAssetIds.add(returnedId);
            if (returnedId !== item.assetid) {
              console.log(`[SMG] Relist: assetid changed after delist: ${item.assetid} -> ${returnedId}`);
            }
          } else {
            console.warn(`[SMG] Relist: returned asset not found by classid ${item.classid}; using original assetid ${item.assetid}`);
          }
        }

        // 再以新价格上架（price 为最低货币单位），失败则再等一次重试
        let sellOk = false;
        let sellMsg = '';
        let newListingId = '';
        for (let attempt = 0; attempt < 2 && !sellOk; attempt++) {
          if (attempt > 0) {
            showStatus(statusEl, `正在重新上架 ${i + 1}/${toRemove.length}: 重试上架...`);
            await sleep(1500);
          }
          sellMsg = '';
          try {
            const sellResp = await fetch('https://steamcommunity.com/market/sellitem/', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `sessionid=${encodeURIComponent(sessionid)}&appid=${appId}&contextid=${contextId}` +
                `&assetid=${sellAssetId}&amount=1&price=${receivedCents}`,
            });
            sellOk = sellResp.ok;
            try {
              const data = await sellResp.json();
              if (data) {
                if (data.success === false) sellOk = false;
                if (data.message) sellMsg = String(data.message);
                if (data.listingid) newListingId = String(data.listingid);
              }
            } catch (e) { /* 无法解析时以 HTTP 状态为准 */ }
            if (!sellOk) {
              console.warn(`[SMG] Relist: sellitem failed (attempt ${attempt + 1}): HTTP ${sellResp.status}` +
                `${sellMsg ? ', message: ' + sellMsg : ''} (asset ${sellAssetId}, context ${contextId})`);
            }
          } catch (e) {
            console.warn(`[SMG] Relist: sellitem error (attempt ${attempt + 1}):`, e);
          }
        }
        if (!sellOk) {
          relistFailed++;
          unlistedSet.add(item.listingid);
          lastSellMsg = lastSellMsg || sellMsg;
          console.warn(`[SMG] Relist: failed to list ${sellAssetId} at ${receivedCents} (received)`);
          continue;
        }

        success++;
        // 就地更新本地数据（新挂单价格/时间/assetid），避免刷新页面
        // sellitem 生成的是全新挂单，旧 listingid 已随 removelisting 销毁，必须回写，
        // 否则后续对该条目下架会命中失效 id 且永远无法从面板移除
        if (newListingId) item.listingid = newListingId;
        item.assetid = sellAssetId;
        item.rtListed = nowTs;
        item.dateKey = tsToDateKey(nowTs);
        item.dateTime = tsToDateTime(nowTs);
        item.buyerPrice = currencyPrefix + (buyerCents / 100).toFixed(2);
        item.sellerPrice = '';
      } catch (e) {
        delistFailed++;
        console.warn(`[SMG] Relist: failed for ${item.listingid}:`, e);
      }

      // 请求间隔，避免触发 Steam 限流
      if (i < toRemove.length - 1) await sleep(800);
    }

    let msg = `重新上架完成: 成功 ${success} 件`;
    if (delistFailed > 0) msg += `, 下架失败 ${delistFailed} 件`;
    if (relistFailed > 0) msg += `, 上架失败 ${relistFailed} 件(已回到库存${lastSellMsg ? ': ' + lastSellMsg : ''})`;
    delistBtn.disabled = false;
    relistBtn.disabled = false;
    if (allBtn) allBtn.disabled = false;
    batchBusy = false;

    // 回写模块级状态：移除"已下架但上架失败"的失效条目（物品已回库存，继续展示会与服务器状态脱节）
    if (unlistedSet.size > 0) {
      allOrders = allOrders.filter(o => !unlistedSet.has(o.listingid));
    }
    grouped = groupOrders(allOrders);
    refreshPanel(allOrders, grouped);
    // 完成提示写入刷新后的新面板（refreshPanel 重建 DOM 会擦掉旧状态），5 秒后自动消失
    showStatus(document.getElementById('smg-delist-status'), msg,
      ((delistFailed || relistFailed) ? 'smg-error' : 'smg-ok'), true);
  }

  // ── Main ────────────────────────────────────────────────

  function findTargetElement() {
    return document.querySelector(
      '[style="--background: var(--color-dull-5); --border: 2px solid; ' +
      '--border-color: var(--color-accent-8); --direction: column; --gap: var(--spacing-2);"]'
    );
  }

  function ensurePanel(allOrders, grouped, targetEl) {
    if (document.getElementById('smg-panel')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'smg-root';
    wrapper.innerHTML = renderSummary(grouped, allOrders);

    targetEl.style.display = 'none';
    targetEl.parentNode.insertBefore(wrapper, targetEl.nextSibling);

    bindPanelEvents();

    console.log('[SMG] Panel injected');
    hideLoading();
  }

  let reinjectObserver = null;

  function proceed(targetEl) {
    if (!allOrders || allOrders.length === 0) {
      console.log('[SMG] No orders to display');
      hideLoading();
      return;
    }

    // [OPT] 使用预提取的数据，无需重新提取
    const useGrouped = grouped || groupOrders(allOrders);
    console.log(`[SMG] Using ${useGrouped.length} date groups`);

    ensurePanel(allOrders, useGrouped, targetEl);

    // [OPT] 重注入 Observer 缩小范围（复用引用，防止泄漏）
    if (reinjectObserver) reinjectObserver.disconnect();
    reinjectObserver = new MutationObserver(() => {
      const panel = document.getElementById('smg-panel');
      if (!panel) {
        console.log('[SMG] Panel removed by page, re-injecting...');
        if (targetEl) targetEl.style.display = '';
        ensurePanel(allOrders, groupOrders(allOrders), targetEl);
      }
    });
    reinjectObserver.observe(targetEl.parentNode || document.body, { childList: true, subtree: true });
  }

  let allOrders = [];
  let grouped = null;
  // 批量流程互斥标志：为 true 时 handleDelist/handleRelist 入口直接返回
  let batchBusy = false;

  function main() {
    console.log('[SMG] Script started on', location.href);
    showLoading();

    // [OPT] 数据预提取：不依赖 DOM，立即开始
    allOrders = extractOrders();
    if (!allOrders || allOrders.length <= CONFIG.minOrders) {
      console.log(`[SMG] Skipping: only ${allOrders?.length || 0} orders (minimum ${CONFIG.minOrders})`);
      hideLoading();
      return;
    }
    grouped = groupOrders(allOrders);
    console.log(`[SMG] Pre-grouped into ${grouped.length} date groups`);

    let targetEl = findTargetElement();
    if (targetEl) {
      console.log('[SMG] Target element found immediately');
      proceed(targetEl);
      return;
    }

    // [OPT] 主动轮询 + MutationObserver 双保险
    console.log('[SMG] Target element not found, polling + observing...');
    let found = false;
    let pollCount = 0;

    function onFound(el) {
      if (found) return;
      found = true;
      if (waitObs) waitObs.disconnect();
      console.log('[SMG] Target element found');
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
        console.warn('[SMG] Target element not found after timeout');
        hideLoading();
      }
    }, 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
