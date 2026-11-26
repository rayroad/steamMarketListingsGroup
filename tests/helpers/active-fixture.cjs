const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const scriptPath = path.join(__dirname, '../../steam-market-listings-group.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const now = Date.parse('2026-11-26T16:00:00+08:00');

function rawListing(id, { appid = 5052450, name = '骑士头盔', hash = 'Knight Helmet', price = 7, fee = 14, context = '2', days = 0, recent = 21, publisherRate = 0.1, amount = 1, status = 1, currency = 2023, convertedPrice, convertedFee, marketLow = 21 } = {}) {
  return {
    listing: {
      listingid: String(id), time_created: now / 1000 - days * 86400, status, active: true, time_finish_hold: 0,
      asset: { appid, id: `800${id}`, contextid: context, classid: `${appid}-${hash}`, instanceid: '0', amount: String(amount) },
      price: String(price), fee: String(fee), currencyid: String(currency),
      converted_price: String(convertedPrice ?? price), converted_fee: String(convertedFee ?? fee), converted_currencyid: '2023',
      steam_fee: '7', publisher_fee: '7', publisher_fee_percent: publisherRate, has_pending_price_change: false,
    },
    description: { appid, classid: `${appid}-${hash}`, instanceid: '0', market_hash_name: hash, market_name: name, name, type: appid === 753 ? '来源游戏 集换式卡牌' : 'Equipment', icon_url: '', tags: appid === 753 ? [{ category: 'Game', localized_tag_name: '来源游戏' }] : [] },
    recent_price: recent, recent_price_currency: 23, market_low: marketLow,
  };
}
const fixtures = [
  rawListing(1, { days: 2 }), rawListing(2),
  rawListing(3, { name: '骑士靴子', hash: 'Knight Boots', days: 3 }),
  rawListing(4, { price: 12, fee: 14, days: 2 }),
  rawListing(5, { appid: 753, name: '骑士头盔', hash: 'Knight Helmet', context: '6', days: 10, publisherRate: 0 }),
];

function nativeGrid(data = fixtures) {
  return `<div data-native-grid style="--grid-columns: [nameblock-start] 1fr [nameblock-end date-start] max-content [date-end price-start] max-content [price-end recent-start] max-content [recent-end modify-start] max-content [modify-end]"><div style="--grid-column:nameblock">名称</div><div>上架时间</div><div>要价</div><div>通常价格</div>${data.map(raw => {
    const d = raw.description, l = raw.listing;
    return `<div style="--grid-columns: subgrid"><div style="--grid-column: nameblock;"><a href="https://steamcommunity.com/market/listings/${d.appid}/${encodeURIComponent(d.market_hash_name)}">${d.name}</a><a href="https://store.steampowered.com/app/${d.appid}/">${d.appid === 753 ? 'Steam 社区物品' : '挂币英雄'}</a></div><div style="--grid-column: date;">2026年11月26日</div><div style="--grid-column: price;">¥ 0.21（¥ 0.07）</div><div style="--grid-column: recent;">¥ 0.21</div><div style="--grid-column: modify;"><button type="button">修改</button></div></div>`;
  }).join('')}</div>`;
}

function body(data = fixtures) {
  return `<main id="market"><nav><a href="/market/activelistings">我当前的出售挂单（${data.length}）</a><a href="/market/buyorders">我当前的求购挂单</a></nav>${nativeGrid(data)}</main>`;
}
const response = (data, ok = true, status = 200) => ({ ok, status, json: async () => data });
const page = (listings, more = false, total = listings.length) => response({ data: { eResult: 1, rgListings: listings, bMore: more, cTotalListings: total } });
const tick = () => new Promise(resolve => setTimeout(resolve, 8));
async function settle() { await tick(); await tick(); }

function setup({ data = fixtures, fetch, mode = 'item' } = {}) {
  const dom = new JSDOM(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body>${body(data)}</body></html>`, { url: 'https://steamcommunity.com/market/activelistings', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.Date.now = () => now;
  w.GM_getValue = (key, fallback) => key === 'activeViewMode' ? mode : fallback;
  w.GM_setValue = () => {};
  w.GM_registerMenuCommand = () => {};
  w.GM_addStyle = css => { const el = w.document.createElement('style'); el.textContent = css; w.document.head.append(el); };
  w.unsafeWindow = { SSR: { loaderData: [] }, g_sessionID: '0123456789abcdef01234567' };
  w.console = { log() {}, warn() {} };
  w.fetch = fetch || (async url => { if (String(url).includes('/market/actions')) return page(data); throw new Error('Unexpected real request'); });
  w.setTimeout = (callback, delay) => delay >= 5000 ? 0 : setTimeout(callback, 1);
  w.clearTimeout = handle => clearTimeout(handle);
  w.requestAnimationFrame = callback => { callback(); return 0; };
  const bootstrap = source.search(/  if \(document\.readyState === ['"]loading['"]\)/);
  if (bootstrap < 0) throw new Error('Script bootstrap not found');
  w.eval(source.slice(0, bootstrap) + `window.smg = { main, initActiveListings, mountActivePanel, loadActiveListings, normalizeActiveListing, filteredActiveOrders, buildActiveRows, renderActivePanel, updateActiveSelection, runActiveBatch, setItemsSelected, getSelectedOrders, get state(){return activeState}, get orders(){return allOrders}, get busy(){return batchBusy} };})();`);
  w.smg.mountActivePanel();
  const load = () => w.smg.loadActiveListings(true);
  return { dom, w, doc: w.document, api: w.smg, load, close: () => { w.smg.state.controller?.abort(); w.smg.state.observer?.disconnect(); dom.window.close(); } };
}

module.exports = { rawListing, fixtures, nativeGrid, body, setup, response, page, settle, source, now };
