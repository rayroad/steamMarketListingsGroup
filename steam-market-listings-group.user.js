// ==UserScript==
// @name         Steam Market Listings Group
// @namespace    https://steamcommunity.com/
// @version      2.0.0
// @description  在Steam市场饰品详情页聚合显示已上架物品，按上架日期与价格分组
// @author       User
// @match        *://steamcommunity.com/market/listings/*
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-idle
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
    .smg-count-cell { text-align: right; white-space: nowrap; color: #acb2b8; width: 60px; }
    .smg-total-row td {
      border-top: 1px solid #3d4450; font-weight: 500; color: #66c0f4; padding-top: 10px;
    }
    #smg-panel.smg-collapsed .smg-table-wrap { display: none; }

    .smg-group-header {
      background: linear-gradient(90deg, rgba(102,192,244,.12) 0%, rgba(102,192,244,.03) 100%);
      border-left: 3px solid #66c0f4; padding: 8px 14px; margin-top: 14px;
      display: flex; align-items: baseline; gap: 10px;
      font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
    }
    .smg-group-date { color: #66c0f4; font-size: 14px; font-weight: 500; }
    .smg-group-count { color: #8f98a0; font-size: 12px; }

    .smg-price-sub {
      background: rgba(30,40,48,.6); padding: 5px 14px; margin-left: 3px;
      display: flex; align-items: baseline; gap: 8px;
      font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
    }
    .smg-price-label { color: #acb2b8; font-size: 13px; }
    .smg-price-count { color: #8f98a0; font-size: 12px; }

    .smg-item-card {
      margin-left: 3px; padding: 6px 14px;
      border-bottom: 1px solid rgba(61,68,80,.3);
      display: flex; justify-content: space-between; align-items: center;
      font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
      font-size: 13px; color: #c7d5e0;
    }
    .smg-item-card:hover { background: rgba(102,192,244,.03); }
    .smg-item-time { color: #8f98a0; font-size: 12px; }
    .smg-item-price { color: #66c0f4; font-weight: 500; }
    .smg-item-seller { color: #4da6b8; font-size: 12px; }
    .smg-item-asset { color: #8f98a0; font-size: 11px; font-family: monospace; }

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
  `);

  // ── Utility ─────────────────────────────────────────────

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function tsToDateKey(ts) {
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function tsToDateTime(ts) {
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  }

  function getSessionId() {
    if (unsafeWindow.g_sessionID) return unsafeWindow.g_sessionID;
    const meta = document.querySelector('meta[name="sessionid"]');
    if (meta) return meta.content;
    const match = document.cookie.match(/sessionid=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  // ── Data Extraction ─────────────────────────────────────

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
        sortedPrices: [...g.prices.keys()].sort(),
        totalCount: g.items.length,
      }));
  }

  // ── Rendering ───────────────────────────────────────────

  function renderSummary(grouped, allOrders) {
    const total = grouped.reduce((s, g) => s + g.totalCount, 0);

    let rows = '';
    for (const g of grouped) {
      const tags = g.sortedPrices.map(p => {
        const cnt = g.prices.get(p).length;
        return `<span class="smg-price-tag">${escapeHtml(p)}<span class="smg-ct">x${cnt}</span></span>`;
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
    </div>`;
  }

  function refreshPanel(allOrders, grouped) {
    const panel = document.getElementById('smg-panel');
    if (!panel) return;
    const wrapper = document.getElementById('smg-root');
    if (wrapper) wrapper.innerHTML = renderSummary(grouped, allOrders);
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
    const sessionid = getSessionId();
    if (!sessionid) {
      statusEl.textContent = '无法获取会话ID';
      statusEl.className = 'smg-delist-status smg-error';
      return;
    }

    btn.disabled = true;
    let success = 0;
    let failed = 0;

    for (let i = 0; i < toRemove.length; i++) {
      const item = toRemove[i];
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
          const idx = allOrders.indexOf(item);
          if (idx !== -1) allOrders.splice(idx, 1);
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

    const regrouped = groupOrders(allOrders);
    refreshPanel(allOrders, regrouped);
  }

  function renderGroupedListings(grouped) {
    let html = '';

    for (const g of grouped) {
      html += `<div class="smg-group-header">
        <span class="smg-group-date">${escapeHtml(g.dateKey)}</span>
        <span class="smg-group-count">${g.totalCount} 件</span>
      </div>`;

      for (const price of g.sortedPrices) {
        const items = g.prices.get(price);
        html += `<div class="smg-price-sub">
          <span class="smg-price-label">${escapeHtml(price)}</span>
          <span class="smg-price-count">${items.length} 件</span>
        </div>`;

        for (const item of items) {
          html += `<div class="smg-item-card">
            <div>
              <span class="smg-item-time">${escapeHtml(item.dateTime)}</span>
              <span class="smg-item-asset">asset:${escapeHtml(item.assetid)}</span>
            </div>
            <div>
              <span class="smg-item-seller">收入 ${escapeHtml(item.sellerPrice)}</span>
              <span class="smg-item-price">${escapeHtml(item.buyerPrice)}</span>
            </div>
          </div>`;
        }
      }
    }

    return html;
  }

  // ── Main ────────────────────────────────────────────────

  function findListingContainer() {
    const priceEls = [];
    const walker = document.createTreeWalker(document.body, 4, null);
    let count = 0;
    while (walker.nextNode() && count < 5) {
      if (/¥\s*\d/.test(walker.currentNode.nodeValue)) {
        priceEls.push(walker.currentNode.parentElement);
        count++;
      }
    }

    if (priceEls.length === 0) return null;

    let common = priceEls[0].parentElement;
    while (common && common !== document.body) {
      const allInside = priceEls.every(el => common.contains(el));
      if (allInside && common.children.length > 2) return common;
      common = common.parentElement;
    }
    return priceEls[0].parentElement?.parentElement?.parentElement || null;
  }

  function findTargetElement() {
    return document.querySelector(
      '[style="--background: var(--color-dull-5); --border: 2px solid; ' +
      '--border-color: var(--color-accent-8); --direction: column; --gap: var(--spacing-2);"]'
    );
  }

  function ensurePanel(allOrders, grouped, targetEl) {
    if (document.getElementById('smg-panel')) return;

    const listingContainer = findListingContainer();
    console.log('[SMG] Listing container:', listingContainer?.tagName, listingContainer?.className?.slice(0, 50));

    const wrapper = document.createElement('div');
    wrapper.id = 'smg-root';
    wrapper.innerHTML = renderSummary(grouped, allOrders);

    if (targetEl) {
      targetEl.style.display = 'none';
      targetEl.parentNode.insertBefore(wrapper, targetEl.nextSibling);
      console.log('[SMG] Target element hidden, panel inserted in its place');
    } else if (listingContainer && listingContainer.parentNode) {
      listingContainer.parentNode.insertBefore(wrapper, listingContainer);
    } else {
      const target = document.querySelector('#mainContents')
                  || document.querySelector('[class*="pagecontent"]')
                  || document.body;
      target.insertBefore(wrapper, target.firstChild);
    }

    bindPanelEvents(allOrders, grouped);

    console.log('[SMG] Panel injected');
  }

  let allOrders = [];

  function main() {
    console.log('[SMG] Script started on', location.href);

    let targetEl = findTargetElement();

    if (!targetEl) {
      console.log('[SMG] Target element not found, waiting...');
      const waitObs = new MutationObserver(() => {
        targetEl = findTargetElement();
        if (targetEl) {
          waitObs.disconnect();
          console.log('[SMG] Target element found');
          proceed(targetEl);
        }
      });
      waitObs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        if (!targetEl) {
          waitObs.disconnect();
          console.warn('[SMG] Target element not found after timeout');
        }
      }, 15000);
      return;
    }

    proceed(targetEl);

    function proceed(targetEl) {
      allOrders = extractOrders();
      if (!allOrders || allOrders.length === 0) {
        console.log('[SMG] No orders to display');
        return;
      }

      const grouped = groupOrders(allOrders);
      console.log(`[SMG] Grouped into ${grouped.length} date groups`);

      ensurePanel(allOrders, grouped, targetEl);

      new MutationObserver(() => {
        const panel = document.getElementById('smg-panel');
        if (!panel) {
          console.log('[SMG] Panel removed by page, re-injecting...');
          if (targetEl) targetEl.style.display = '';
          ensurePanel(allOrders, groupOrders(allOrders), targetEl);
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
