const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setup, fixtures, rawListing, nativeGrid, response, page, settle } = require('./helpers/active-fixture.cjs');

test('official QueryMyListings GET parameters, exact unique ids and 50/25 pagination', async () => {
  const calls = [];
  const app = setup({ fetch: async (url, options) => {
    calls.push({ url: new URL(url), options });
    const [start, count, params] = JSON.parse(calls.at(-1).url.searchParams.get('qp'));
    assert.equal(params.bGetAllData, true); assert.equal(params.category, 'active');
    assert.equal(count, start === 0 ? 50 : 25);
    return start === 0 ? page(fixtures.slice(0, 3), true, 5) : page(fixtures.slice(3), false, 5);
  } });
  try {
    await app.load();
    assert.equal(app.api.state.status, 'complete');
    assert.equal(app.api.orders.length, 5);
    assert.equal(app.doc.querySelector('#smg-filter-query').disabled, false);
    assert.equal(app.doc.querySelector('#smg-active-sort').disabled, false);
    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(calls[1].url.searchParams.get('qp'))[0], 50);
    assert.equal(calls[0].options.headers['x-valve-request-type'], 'queryAction');
    assert.equal(calls[0].options.credentials, 'include');
    assert.equal(app.api.orders[0].buyerCents, 21);
    assert.equal(app.api.orders[0].sellerCents, 7);
    assert.equal(app.api.orders[0].marketLowCents, 21);
  } finally { app.close(); }
});

test('never merge different products/apps at the same price; date splits per product and price', async () => {
  const app = setup();
  try {
    await app.load();
    assert.equal(app.api.state.rows.length, 4);
    assert.equal(app.api.state.rows.find(row => row.items.length === 2).items[0].marketKey, 'Knight Helmet');
    app.doc.querySelector('[data-smg-active-mode="date"]').click();
    assert.equal(app.api.state.rows.length, 5);
    app.doc.querySelector('[data-smg-active-mode="original"]').click();
    assert.equal(app.api.state.rows.length, 5);
  } finally { app.close(); }
});

test('combined keyword/game/category/date/age/money/duplicate filters and validation', async () => {
  const app = setup();
  try {
    await app.load();
    Object.assign(app.api.state.filters, { query: '骑士 头盔', app: '5052450', category: 'Equipment', from: '2026-11-24', to: '2026-11-26', days: '1', minCount: '2' });
    app.api.renderActivePanel();
    assert.equal(app.api.state.filtered.length, 2);
    Object.assign(app.api.state.filters, { minCount: '', priceBasis: 'seller', minPrice: '0.10' });
    app.api.renderActivePanel();
    assert.equal(app.api.state.filtered.length, 1);
    assert.equal(app.api.state.filtered[0].listingid, '4');
    app.api.state.filters.maxPrice = '0.05';
    app.api.renderActivePanel();
    assert.equal(app.api.state.filtered.length, 0);
    assert.match(app.api.state.filterError, /最低价格/);
  } finally { app.close(); }
});

test('reference comparisons use recent_price, never market_low; missing recent handled separately', async () => {
  const data = [rawListing(1, { price: 86, fee: 14, recent: 50, marketLow: 200 }), rawListing(2, { recent: undefined })];
  delete data[1].recent_price;
  const app = setup({ data });
  try {
    await app.load();
    Object.assign(app.api.state.filters, { reference: 'above', premium: '50' });
    app.api.renderActivePanel();
    assert.deepEqual(Array.from(app.api.state.filtered, item => item.listingid), ['1']);
    app.api.state.filters.reference = 'missing'; app.api.renderActivePanel();
    assert.deepEqual(Array.from(app.api.state.filtered, item => item.listingid), ['2']);
  } finally { app.close(); }
});

test('group select, original partial selection, hidden selected count and filtered select-all', async () => {
  const app = setup();
  try {
    await app.load();
    const index = app.api.state.rows.findIndex(row => row.items.length === 2);
    app.doc.querySelector(`[data-smg-active-row="${index}"]`).click();
    assert.equal(app.api.getSelectedOrders().length, 2);
    app.doc.querySelector('[data-smg-active-mode="original"]').click();
    const single = app.api.state.rows.findIndex(row => row.items[0].listingid === '1');
    app.doc.querySelector(`[data-smg-active-row="${single}"]`).click();
    app.doc.querySelector('[data-smg-active-mode="item"]').click();
    assert.equal(app.doc.querySelector(`[data-smg-active-row="${index}"]`).indeterminate, true);
    app.api.state.filters.app = '753'; app.api.renderActivePanel();
    assert.match(app.doc.querySelector('#smg-selection-count').textContent, /筛选外 1/);
    app.doc.querySelector('#smg-select-all').click();
    assert.equal(app.api.getSelectedOrders().length, 2);
  } finally { app.close(); }
});

test('HTTP business failures stay incomplete, 429 retries are bounded and resume keeps correct offset', async () => {
  let count = 0;
  const app = setup({ fetch: async url => {
    const start = JSON.parse(new URL(url).searchParams.get('qp'))[0];
    if (start === 0) return page(fixtures.slice(0, 3), true, 5);
    if (++count <= 3) return response({}, false, 429);
    return page(fixtures.slice(3), false, 5);
  } });
  try {
    await app.load();
    assert.equal(count, 3);
    assert.equal(app.api.state.status, 'error');
    assert.equal(app.api.state.offset, 50);
    assert.equal(app.api.orders.length, 3);
    assert.equal(app.doc.querySelector('#smg-filter-query').disabled, false);
    assert.equal(app.doc.querySelector('#smg-active-sort').disabled, false);
    await app.api.loadActiveListings(false);
    assert.equal(app.api.state.status, 'complete');
    assert.equal(app.api.orders.length, 5);
  } finally { app.close(); }
});

test('repeat-page detection stops safely and does not advance resume offset', async () => {
  const app = setup({ fetch: async () => page(fixtures.slice(0, 2), true, 5) });
  try {
    await app.load();
    assert.equal(app.api.state.status, 'error');
    assert.equal(app.api.state.offset, 50);
    assert.equal(app.api.orders.length, 2);
  } finally { app.close(); }
});

test('changed total or early end is partial, not successful complete', async () => {
  const app = setup({ fetch: async url => JSON.parse(new URL(url).searchParams.get('qp'))[0] === 0 ? page(fixtures.slice(0, 2), true, 5) : page(fixtures.slice(2), false, 6) });
  try {
    await app.load();
    assert.equal(app.api.state.status, 'partial');
    assert.equal(app.api.state.dirty, true);
    assert.match(app.api.state.error, /数量不一致/);
  } finally { app.close(); }
});

test('cancellation aborts request and always releases loading state; transaction never starts while loading', async () => {
  let started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const app = setup({ fetch: async (url, options) => {
    started();
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  try {
    const load = app.load(); await startedPromise;
    const controls = () => [...app.doc.querySelectorAll('.smg-content button, .smg-content input, .smg-content select')];
    assert.ok(controls().length > 10);
    assert.ok(controls().every(control => control.disabled));
    assert.equal(app.doc.querySelector('#smg-active-cancel-load').disabled, false);
    const search = app.doc.querySelector('#smg-filter-query');
    search.value = '加载时不可筛选';
    search.dispatchEvent(new app.w.Event('input', { bubbles: true }));
    const sort = app.doc.querySelector('#smg-active-sort');
    sort.value = 'name';
    sort.dispatchEvent(new app.w.Event('change', { bubbles: true }));
    assert.equal(app.api.state.filters.query, '');
    assert.equal(app.api.state.sort, 'newest');
    app.api.renderActivePanel();
    assert.ok(controls().every(control => control.disabled));
    await app.api.runActiveBatch('delist', 'filtered');
    assert.equal(app.api.busy, false);
    assert.equal(app.doc.querySelectorAll('.smg-confirm-overlay').length, 0);
    app.api.state.controller.abort(); await load;
    assert.equal(app.api.state.status, 'cancelled');
    assert.equal(app.api.state.loading, false);
    assert.equal(app.doc.querySelector('#smg-active-refresh').disabled, false);
    assert.equal(app.doc.querySelector('#smg-filter-query').disabled, false);
    assert.equal(app.doc.querySelector('#smg-active-sort').disabled, false);
    assert.equal(app.doc.querySelector('[data-smg-active-mode="date"]').disabled, false);
  } finally { app.close(); }
});

test('filtered delist affects only filter matches, failures remain selected and controls unlock', async () => {
  const calls = [];
  const app = setup({ fetch: async (url, options) => {
    if (String(url).includes('/market/actions')) return page(fixtures);
    calls.push({ url, options });
    return response(String(url).endsWith('/1') ? { success: false, message: '拒绝' } : {});
  } });
  try {
    await app.load();
    Object.assign(app.api.state.filters, { query: '头盔', app: '5052450' }); app.api.renderActivePanel();
    app.api.setItemsSelected(app.api.state.filtered, true);
    const run = app.api.runActiveBatch('delist', 'filtered');
    assert.equal(app.api.busy, true);
    app.doc.querySelector('#smg-confirm-ok').click(); await run;
    assert.deepEqual(calls.map(call => String(call.url).split('/').at(-1)), ['2', '1', '4']);
    assert.deepEqual(Array.from(app.api.getSelectedOrders(), item => item.listingid), ['1']);
    assert.equal(app.api.orders.length, 3);
    assert.equal(app.api.busy, false);
    assert.equal(app.api.state.dirty, true);
  } finally { app.close(); }
});

test('cross-app price plan uses per-product prices/context/fees and excludes preexisting matching assets', async () => {
  const data = [rawListing(1), rawListing(2, { appid: 753, context: '6', hash: 'Card', name: '卡牌', publisherRate: 0 })];
  const calls = [], inventoryReads = new Map();
  const app = setup({ data, fetch: async (url, options) => {
    if (String(url).includes('/market/actions')) return page(data);
    calls.push({ url: String(url), options });
    if (String(url).includes('/inventory/json/')) {
      const context = String(url).endsWith('/6') ? '6' : '2';
      const times = inventoryReads.get(context) || 0; inventoryReads.set(context, times + 1);
      const classid = context === '6' ? '753-Card' : '5052450-Knight Helmet';
      return response({ success: true, rgInventory: { existing: { classid, instanceid: '0' }, ...(times ? { [`returned-${context}`]: { classid, instanceid: '0' } } : {}) } });
    }
    if (String(url).includes('/sellitem/')) {
      const context = new URLSearchParams(options.body).get('contextid');
      return response({ success: true, listingid: context === '6' ? '10002' : '10001' });
    }
    return response({});
  } });
  try {
    await app.load();
    const run = app.api.runActiveBatch('relist', 'filtered');
    const inputs = app.doc.querySelectorAll('[data-price-side="seller"]');
    assert.equal(inputs.length, 2);
    inputs[0].value = '0.60'; inputs[0].dispatchEvent(new app.w.Event('input', { bubbles: true }));
    inputs[1].value = '1.00'; inputs[1].dispatchEvent(new app.w.Event('input', { bubbles: true }));
    const buyerInputs = app.doc.querySelectorAll('[data-price-side="buyer"]');
    assert.equal(buyerInputs[0].value, '0.74');
    assert.equal(buyerInputs[1].value, '1.07');
    app.doc.querySelector('[data-plan-ok]').click(); await settle();
    assert.match(app.doc.querySelector('.smg-confirm-body').textContent, /卡牌/);
    app.doc.querySelector('#smg-confirm-ok').click(); await run;
    const sells = calls.filter(call => call.url.includes('/sellitem/')).map(call => new URLSearchParams(call.options.body));
    assert.deepEqual(sells.map(body => [body.get('appid'), body.get('contextid'), body.get('price'), body.get('assetid')]), [['5052450', '2', '60', 'returned-2'], ['753', '6', '100', 'returned-6']]);
    assert.deepEqual(Array.from(app.api.orders, item => item.listingid), ['10001', '10002']);
    assert.equal(app.api.orders.find(item => item.appid === 753).buyerCents, 107);
  } finally { app.close(); }
});

test('price-plan cancel and unsupported stacks never delist by accident', async () => {
  const data = [rawListing(1, { amount: 2 })];
  const app = setup({ data });
  try {
    await app.load(); await app.api.runActiveBatch('relist', 'filtered');
    assert.equal(app.doc.querySelectorAll('.smg-confirm-overlay').length, 0);
    assert.equal(app.api.busy, false);
    app.api.orders[0].amount = 1;
    const run = app.api.runActiveBatch('relist', 'filtered');
    app.doc.querySelector('[data-plan-cancel]').click(); await run;
    assert.equal(app.api.orders.length, 1);
    assert.equal(app.api.busy, false);
  } finally { app.close(); }
});

test('inventory verification failure leaves listing untouched before any removelisting request', async () => {
  const data = [rawListing(1)];
  const calls = [];
  const app = setup({ data, fetch: async url => {
    calls.push(String(url));
    if (String(url).includes('/market/actions')) return page(data);
    if (String(url).includes('/inventory/json/')) return response({ success: false });
    throw new Error('Should not transact');
  } });
  try {
    await app.load();
    const run = app.api.runActiveBatch('relist', 'filtered');
    app.doc.querySelector('[data-price-side="seller"]').value = '0.60';
    app.doc.querySelector('[data-plan-ok]').click(); await settle();
    app.doc.querySelector('#smg-confirm-ok').click(); await run;
    assert.equal(calls.some(url => url.includes('/removelisting/') || url.includes('/sellitem/')), false);
    assert.equal(app.api.orders.length, 1);
    assert.equal(app.api.busy, false);
  } finally { app.close(); }
});

test('local pagination selects across pages and shows every matching record', async () => {
  const data = Array.from({ length: 80 }, (_, i) => rawListing(i + 1));
  const app = setup({ data, mode: 'original' });
  try {
    await app.load();
    assert.equal(app.doc.querySelectorAll('[data-smg-active-row]').length, 50);
    app.doc.querySelector('#smg-select-all').click();
    assert.equal(app.api.getSelectedOrders().length, 80);
    app.doc.querySelector('#smg-active-next').click();
    assert.equal(app.doc.querySelectorAll('[data-smg-active-row]').length, 30);
    assert.equal(app.doc.querySelectorAll('[data-smg-active-row]:checked').length, 30);
  } finally { app.close(); }
});

test('SPA route exit cancels a pending price dialog and restores the native grid', async () => {
  const app = setup();
  try {
    app.api.initActiveListings(); await settle();
    assert.equal(app.api.state.status, 'complete');
    const run = app.api.runActiveBatch('relist', 'filtered');
    app.w.history.pushState({}, '', '/market/buyorders');
    app.doc.body.appendChild(app.doc.createElement('div'));
    await settle(); await run;
    assert.equal(app.doc.querySelector('#smg-root'), null);
    assert.equal(app.doc.querySelectorAll('.smg-confirm-overlay').length, 0);
    assert.equal(app.doc.querySelector('[data-native-grid]').hidden, false);
    assert.equal(app.api.busy, false);
  } finally { app.close(); }
});

test('API text is escaped, original native DOM stays intact, reinjection preserves selection', async () => {
  const data = [rawListing(1, { name: '<img src=x onerror=alert(1)>', hash: '<unsafe>' })];
  const app = setup({ data });
  try {
    const original = app.doc.querySelector('[data-native-grid]');
    await app.load();
    assert.equal(app.doc.querySelectorAll('#smg-root img[onerror]').length, 0);
    assert.equal(app.doc.querySelector('[data-native-grid]'), original);
    app.api.setItemsSelected(app.api.orders, true);
    app.doc.querySelector('#smg-root').remove();
    original.outerHTML = nativeGrid(data);
    app.api.mountActivePanel();
    assert.equal(app.doc.querySelectorAll('#smg-root').length, 1);
    assert.match(app.doc.querySelector('#smg-selection-count').textContent, /已选 1/);
    app.doc.querySelector('#smg-toggle').click();
    assert.equal(app.doc.querySelector('[data-native-grid]').hidden, false);
  } finally { app.close(); }
});

test('converted wallet amounts are used while original-currency prices remain out of calculations', async () => {
  const app = setup({ data: [rawListing(1, { currency: 2001, price: 3, fee: 2, convertedPrice: 21, convertedFee: 14 })] });
  try {
    await app.load();
    assert.equal(app.api.orders[0].sellerCents, 21);
    assert.equal(app.api.orders[0].buyerCents, 35);
    assert.equal(app.api.orders[0].buyerPrice, '¥ 0.35');
  } finally { app.close(); }
});
