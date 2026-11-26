const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../steam-market-listings-group.user.js'), 'utf8');
const stamp = date => Date.parse(`${date}T12:00:00+08:00`) / 1000;
const orders = [
  ['a', '2026-11-17', '¥ 0.21', '¥ 0.07'],
  ['b', '2026-11-17', '¥ 0.21', '¥ 0.07'],
  ['c', '2026-11-20', '¥ 0.26', '¥ 0.12'],
  ['d', '2026-11-20', '¥ 0.23', '¥ 0.09'],
  ['e', '2026-11-26', '¥ 0.21', '¥ 0.07'],
].map(([listingid, date, strBuyerPrice, strSellerPrice]) => ({ listingid, rtListed: stamp(date), strBuyerPrice, strSellerPrice, appid: 5052450, classid: 'helmet', assetid: `asset-${listingid}` }));

function nativeGrid(data = orders) {
  return `<div style="--grid-columns: 2fr max-content max-content 1fr"><div><h2>出售 - 我的上架物品</h2></div><div>名称</div><div>上架日期</div><div>价格</div><div></div>${data.map(o => `<div style="--grid-columns: subgrid"><div><div><img src="https://community.akamai.steamstatic.com/economy/image/test" alt=""><div><span>稀有 骑士 头盔 Lv.30 +0</span><span>挂币英雄</span></div></div></div><div>${new Date(o.rtListed * 1000).toISOString().slice(0, 10).replaceAll('-', '/')}</div><div><div>${o.strBuyerPrice}</div><span>(${o.strSellerPrice})</span></div><div><button>修改</button></div></div>`).join('')}</div>`;
}

const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); }
function setup({ mode = 'price', data = orders, fetch } = {}) {
  const dom = new JSDOM(`<body><section id="native" style="--border-color: var(--color-accent-8)">${nativeGrid(data)}</section></body>`, { url: 'https://steamcommunity.com/market/listings/5052450/Rare%20Knight%20Helmet', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.GM_getValue = (key, fallback) => key === 'viewMode' ? mode : fallback;
  w.GM_setValue = () => {};
  w.GM_registerMenuCommand = () => {};
  w.GM_addStyle = css => { const style = w.document.createElement('style'); style.textContent = css; w.document.head.append(style); };
  w.unsafeWindow = { SSR: { loaderData: [{ myOrders: { rgSellOrders: JSON.parse(JSON.stringify(data)) } }] }, g_sessionID: '0123456789abcdef01234567' };
  w.console = { log() {}, warn() {} };
  w.fetch = fetch || (async () => { throw new Error('Unexpected real request'); });
  w.setTimeout = (callback, delay) => { if (delay < 2000) setImmediate(callback); return 1; };
  w.requestAnimationFrame = callback => { callback(); return 1; };
  const start = source.indexOf("  if (document.readyState === 'loading')");
  w.eval(source.slice(0, start) + `window.smg = { main, buildViewRows, getSelectedOrders, setItemsSelected, refreshPanel, runBatch, selectBatchOrders, updateProgress, get orders(){return allOrders}, get busy(){return batchBusy}, get rows(){return viewRows} };})();`);
  w.smg.main();
  return { dom, w, api: w.smg, doc: w.document, close: () => dom.window.close() };
}
const response = (data = {}, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => data });
async function confirm(doc) { doc.querySelector('#smg-confirm-ok').click(); await settle(); }
function price(doc, value = '0.60') {
  const input = doc.querySelector('#smg-relist-received');
  input.value = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  doc.querySelector('#smg-price-ok').click();
}

test('price groups merge dates; date groups split every price on the same date', () => {
  const app = setup();
  try {
    assert.equal(app.api.rows.length, 3);
    assert.equal(app.api.rows[0].items.length, 3);
    app.doc.querySelector('[data-smg-mode="date"]').click();
    assert.equal(app.api.rows.length, 4);
    const middle = app.api.rows.filter(row => row.items[0].dateKey === '2026-11-20');
    assert.equal(middle.length, 2);
    assert.deepEqual(Array.from(middle, row => row.items[0].buyerPrice), ['¥ 0.23', '¥ 0.26']);
  } finally { app.close(); }
});

test('aggregate selection controls every item, persists across modes and shows mixed state', () => {
  const app = setup();
  try {
    app.doc.querySelector('[data-smg-row="0"]').click();
    assert.equal(app.api.getSelectedOrders().length, 3);
    app.doc.querySelector('[data-smg-mode="original"]').click();
    assert.equal(app.doc.querySelectorAll('.smg-native-select:checked').length, 3);
    app.doc.querySelector('.smg-native-select').click();
    assert.equal(app.api.getSelectedOrders().length, 2);
    app.doc.querySelector('[data-smg-mode="price"]').click();
    assert.equal(app.doc.querySelector('[data-smg-row="0"]').indeterminate, true);
    app.doc.querySelector('[data-smg-row="0"]').click();
    assert.equal(app.api.getSelectedOrders().length, 3);
    app.doc.querySelector('#smg-select-all').click();
    assert.equal(app.api.getSelectedOrders().length, 5);
    app.doc.querySelector('#smg-clear-selection').click();
    assert.equal(app.api.getSelectedOrders().length, 0);
  } finally { app.close(); }
});

test('original mode keeps original row nodes while switching modes', () => {
  const app = setup({ mode: 'original' });
  try {
    const grid = app.doc.querySelector('.smg-native-grid');
    const row = grid.querySelector('[style*="subgrid"]');
    assert.equal(grid.hidden, false);
    app.doc.querySelector('[data-smg-mode="date"]').click();
    assert.equal(grid.hidden, true);
    app.doc.querySelector('[data-smg-mode="original"]').click();
    assert.equal(grid.querySelector('[style*="subgrid"]'), row);
    assert.equal(app.doc.querySelector('#smg-delist-price'), null);
    assert.equal(app.doc.querySelector('#smg-delist-qty'), null);
    app.doc.querySelector('#smg-toggle').click();
    assert.equal(grid.hidden, true);
  } finally { app.close(); }
});

test('mutex covers confirmation and cancellation releases every control', async () => {
  const app = setup();
  try {
    const first = app.api.runBatch('delist', 'all');
    assert.equal(app.api.busy, true);
    await app.api.runBatch('relist', 'all');
    assert.equal(app.doc.querySelectorAll('.smg-confirm-overlay').length, 1);
    app.doc.querySelector('#smg-confirm-cancel').click();
    await first;
    assert.equal(app.api.busy, false);
    assert.equal(app.doc.querySelector('#smg-delist-all-btn').disabled, false);
  } finally { app.close(); }
});

test('selected delist sends only selected ids, newest first; failures remain selected', async () => {
  const calls = [];
  const app = setup({ fetch: async (url, opts) => { calls.push({ url, opts }); return response(url.endsWith('/a') ? { success: false, message: '拒绝' } : {}); } });
  try {
    app.api.setItemsSelected([app.api.orders[0], app.api.orders[4]], true);
    const run = app.api.runBatch('delist', 'selected');
    await confirm(app.doc); await run;
    assert.deepEqual(calls.map(c => c.url.split('/').at(-1)), ['e', 'a']);
    assert.equal(app.api.orders.length, 4);
    assert.equal(app.api.getSelectedOrders()[0].listingid, 'a');
    assert.equal(app.doc.querySelectorAll('.smg-native-grid [style*="subgrid"][hidden]').length, 1);
    assert.match(calls[0].opts.body, /sessionid=/);
  } finally { app.close(); }
});

test('relist uses returned asset and seller amount, writes new id, updates original row', async () => {
  const calls = [];
  const app = setup({ mode: 'original', fetch: async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('/inventory/json/')) return response({ success: true, rgInventory: { 'returned-id': { classid: 'helmet' } } });
    if (url.includes('/sellitem/')) return response({ success: true, listingid: 'new-id' });
    return response();
  } });
  try {
    const item = app.api.orders[0];
    const run = app.api.runBatch('relist', 'row', [item]);
    price(app.doc); await settle(); await confirm(app.doc); await run; await settle();
    const sell = calls.find(c => c.url.includes('/sellitem/'));
    const body = new URLSearchParams(sell.opts.body);
    assert.equal(body.get('price'), '60');
    assert.equal(body.get('assetid'), 'returned-id');
    assert.equal(body.get('contextid'), '2');
    assert.equal(item.listingid, 'new-id');
    assert.equal(item.buyerPrice, '¥ 0.74');
    assert.match(app.doc.querySelector('.smg-native-grid [style*="subgrid"]').textContent, /0.74/);
    const second = app.api.runBatch('delist', 'row', [item]);
    await confirm(app.doc); await second;
    assert.ok(calls.some(c => c.url.endsWith('/new-id')));
  } finally { app.close(); }
});

test('relist failure retries once, drops destroyed listing and reports inventory', async () => {
  let sells = 0;
  const app = setup({ fetch: async url => {
    if (url.includes('/inventory/json/')) return response({ success: true, rgInventory: { returned: { classid: 'helmet' } } });
    if (url.includes('/sellitem/')) { sells++; return response({ success: false, message: '库存错误' }); }
    return response();
  } });
  try {
    const run = app.api.runBatch('relist', 'row', [app.api.orders[0]]);
    price(app.doc); await settle(); await confirm(app.doc); await run;
    assert.equal(sells, 2);
    assert.equal(app.api.orders.length, 4);
    assert.match(app.doc.querySelector('.smg-toast-container').textContent, /已回到库存/);
    assert.equal(app.api.busy, false);
  } finally { app.close(); }
});

test('hydration replacement reinjects selection and busy state without duplicate checkboxes', async () => {
  const app = setup({ mode: 'original' });
  try {
    app.api.setItemsSelected([app.api.orders[0]], true);
    const run = app.api.runBatch('delist', 'all');
    app.api.updateProgress('测试进度', 25);
    app.doc.querySelector('#native').innerHTML = nativeGrid();
    await settle();
    assert.equal(app.doc.querySelectorAll('#smg-root').length, 1);
    assert.equal(app.doc.querySelectorAll('.smg-native-select').length, 5);
    assert.equal(app.doc.querySelectorAll('.smg-native-select:checked').length, 1);
    assert.equal(app.doc.querySelector('#smg-delist-all-btn').disabled, true);
    assert.match(app.doc.querySelector('#smg-delist-status').textContent, /测试进度/);
    app.doc.querySelector('#smg-confirm-cancel').click(); await run;
  } finally { app.close(); }
});

test('HTML from item names/prices is escaped and empty selection does not send requests', async () => {
  const app = setup();
  try {
    const item = app.api.orders[0];
    item.buyerPrice = '<img src=x onerror=alert(1)> 0.21';
    app.api.refreshPanel();
    assert.equal(app.doc.querySelectorAll('#smg-root img[onerror]').length, 0);
    await app.api.runBatch('delist', 'selected');
    assert.equal(app.doc.querySelectorAll('.smg-confirm-overlay').length, 0);
    assert.equal(app.api.busy, false);
  } finally { app.close(); }
});

test('confirmation-required success drops obsolete listing id and never retries submission', async () => {
  let sells = 0;
  const app = setup({ fetch: async url => {
    if (url.includes('/inventory/json/')) return response({ success: true, rgInventory: { returned: { classid: 'helmet' } } });
    if (url.includes('/sellitem/')) { sells++; return response({ success: true, needs_mobile_confirmation: true }); }
    return response();
  } });
  try {
    const run = app.api.runBatch('relist', 'row', [app.api.orders[0]]);
    price(app.doc); await settle(); await confirm(app.doc); await run;
    assert.equal(sells, 1);
    assert.equal(app.api.orders.length, 4);
    assert.match(app.doc.querySelector('.smg-toast-container').textContent, /待核实\/确认 1/);
  } finally { app.close(); }
});

test('price submit recomputes buyer amount and Escape cancels without any request', async () => {
  const app = setup();
  try {
    const run = app.api.runBatch('relist', 'all');
    const received = app.doc.querySelector('#smg-relist-received');
    received.value = '0.60';
    app.doc.querySelector('#smg-relist-buyer').value = '99999';
    app.doc.querySelector('#smg-price-ok').click();
    await settle();
    assert.match(app.doc.querySelector('.smg-confirm-body').textContent, /0.74/);
    assert.doesNotMatch(app.doc.querySelector('.smg-confirm-body').textContent, /99999/);
    app.doc.querySelector('#smg-confirm-cancel').dispatchEvent(new app.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await run;
    assert.equal(app.api.busy, false);
    assert.equal(app.api.orders.length, 5);
  } finally { app.close(); }
});

test('rebuilding native DOM after delist does not resurrect removed orders', async () => {
  const app = setup({ mode: 'original', fetch: async () => response() });
  try {
    const run = app.api.runBatch('delist', 'row', [app.api.orders[0]]);
    await confirm(app.doc); await run;
    app.doc.querySelector('#native').innerHTML = nativeGrid();
    await settle();
    assert.equal(app.api.orders.length, 4);
    assert.equal(app.doc.querySelectorAll('.smg-native-grid [style*="subgrid"][hidden]').length, 1);
    assert.equal(app.doc.querySelectorAll('.smg-native-select').length, 4);
  } finally { app.close(); }
});
