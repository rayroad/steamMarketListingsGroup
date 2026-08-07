// ==UserScript==
// @name         Steam Market Listings Group
// @namespace    https://steamcommunity.com/
// @version      2.2.0
// @description  在Steam市场饰品详情页聚合显示已上架物品，按上架日期与价格分组
// @author       RayRoad
// @match        *://steamcommunity.com/market/listings/*
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

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

  function showConfirmDialog(message) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'smg-confirm-overlay';
      overlay.innerHTML = `
        <div class="smg-confirm-box">
          <div class="smg-confirm-title">确认下架</div>
          <div class="smg-confirm-body">${message}</div>
          <div class="smg-confirm-actions">
            <button class="smg-confirm-btn smg-confirm-cancel" id="smg-confirm-cancel">取消</button>
            <button class="smg-confirm-btn smg-confirm-ok" id="smg-confirm-ok">确认下架</button>
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
    bindPanelEvents(allOrders, grouped);
  }

  function bindPanelEvents(allOrders, grouped) {
    document.getElementById('smg-toggle')?.addEventListener('click', function () {
      const p = document.getElementById('smg-panel');
      p.classList.toggle('smg-collapsed');
      this.textContent = p.classList.contains('smg-collapsed') ? '展开' : '收起';
    });

    document.getElementById('smg-delist-btn')?.addEventListener('click', () => {
      handleDelist(allOrders, grouped);
    });
  }

  async function handleDelist(allOrders, grouped) {
    const priceSelect = document.getElementById('smg-delist-price');
    const qtyInput = document.getElementById('smg-delist-qty');
    const statusEl = document.getElementById('smg-delist-status');
    const btn = document.getElementById('smg-delist-btn');
    const progressWrap = document.getElementById('smg-progress-wrap');
    const progressBar = document.getElementById('smg-progress-bar');

    const price = priceSelect.value;
    const qty = parseInt(qtyInput.value, 10);

    if (!price) {
      statusEl.textContent = '请选择价格';
      statusEl.className = 'smg-delist-status smg-error';
      return;
    }
    if (!qty || qty < 1) {
      statusEl.textContent = '请输入有效数量';
      statusEl.className = 'smg-delist-status smg-error';
      return;
    }

    const candidates = allOrders
      .filter(o => o.buyerPrice === price)
      .sort((a, b) => b.rtListed - a.rtListed);

    if (candidates.length === 0) {
      statusEl.textContent = '该价格没有可下架的商品';
      statusEl.className = 'smg-delist-status smg-error';
      return;
    }

    const toRemove = candidates.slice(0, Math.min(qty, candidates.length));
    const removedSet = new Set();

    // Confirm dialog
    const confirmed = await showConfirmDialog(
      `即将下架价格 <strong>${escapeHtml(price)}</strong> 的 <strong>${toRemove.length}</strong> 件商品，确认继续？`
    );
    if (!confirmed) {
      statusEl.textContent = '已取消';
      statusEl.className = 'smg-delist-status';
      return;
    }

    const sessionid = getSessionId();
    if (!sessionid) {
      statusEl.textContent = '无法获取会话ID';
      statusEl.className = 'smg-delist-status smg-error';
      return;
    }

    btn.disabled = true;
    progressWrap.classList.add('smg-visible');
    progressBar.style.width = '0%';

    let success = 0;
    let failed = 0;

    for (let i = 0; i < toRemove.length; i++) {
      const item = toRemove[i];
      const progress = ((i + 1) / toRemove.length * 100).toFixed(1);
      progressBar.style.width = `${progress}%`;
      statusEl.textContent = `正在下架 ${i + 1}/${toRemove.length}...`;
      statusEl.className = 'smg-delist-status';

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

    statusEl.textContent = `下架完成: 成功 ${success} 件` + (failed > 0 ? `, 失败 ${failed} 件` : '');
    statusEl.className = 'smg-delist-status' + (failed > 0 ? ' smg-error' : ' smg-ok');
    btn.disabled = false;
    setTimeout(() => progressWrap.classList.remove('smg-visible'), 1500);

    allOrders = allOrders.filter(o => !removedSet.has(o.listingid));
    const regrouped = groupOrders(allOrders);
    refreshPanel(allOrders, regrouped);
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

    bindPanelEvents(allOrders, grouped);

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

  function main() {
    console.log('[SMG] Script started on', location.href);
    showLoading();

    // [OPT] 数据预提取：不依赖 DOM，立即开始
    allOrders = extractOrders();
    if (allOrders && allOrders.length > 0) {
      grouped = groupOrders(allOrders);
      console.log(`[SMG] Pre-grouped into ${grouped.length} date groups`);
    }

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
