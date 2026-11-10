/**
 * Host half of the stock panel bundle.
 *
 * The browser never calls a third-party quote site directly: that would depend
 * on cross-origin permissions this deployment does not control. Instead this
 * plugin serves one read-only same-origin endpoint that proxies a symbol list
 * to the public quote feed and returns plain JSON. It holds no user data —
 * holdings stay in the browser — so the route exposes nothing private.
 */

const ROUTE_PATH = '/stock-panel/quotes';
const SEARCH_PATH = '/stock-panel/search';
const TREND_PATH = '/stock-panel/trend';
const UPSTREAM = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
const SEARCH_UPSTREAM = 'https://searchapi.eastmoney.com/api/suggest/get';
const TREND_UPSTREAM = 'https://push2his.eastmoney.com/api/qt/stock/trends2/get';
const FIELDS = 'f2,f3,f4,f12,f13,f14,f15,f16,f17,f18';
const MAX_SYMBOLS = 60;
const MAX_QUERY_LENGTH = 32;
const SEARCH_COUNT = 8;
// The panel can poll once per second, so the dedupe window stays below that:
// consecutive polls still request fresh data, while one poll and its retry
// cannot double-hit the feed.
const CACHE_TTL_MS = 900;
const SEARCH_CACHE_TTL_MS = 10000;
// One intraday series is shared by every poll for a minute; the panel replaces
// its last point with the live price on each tick, so the shape stays current
// without re-downloading 240 points per symbol per second.
const TREND_CACHE_TTL_MS = 45000;
const UPSTREAM_TIMEOUT_MS = 8000;
const SEARCH_TIMEOUT_MS = 5000;
const TREND_TIMEOUT_MS = 7000;

const RESPONSE_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});

/** US tickers are requested through these eastmoney markets in order. */
const US_MARKETS = ['105', '106', '107'];

function normalizeSymbol(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().toUpperCase();
  if (text.length === 0 || text.length > 16) return null;
  let match = /^(SH|SZ|BJ)(\d{6})$/.exec(text);
  if (match !== null) {
    const market = match[1] === 'SH' ? '1' : '0';
    return { symbol: text, secid: market + '.' + match[2], market, code: match[2] };
  }
  // A canonical feed id such as `1.600519` or `105.AAPL`, as produced by the
  // search endpoint. It is the unambiguous form when a bare code names both a
  // stock and an index (000001 is 平安银行 on SZ and 上证指数 on SH).
  match = /^(\d{1,3})\.([A-Z0-9][A-Z0-9.-]{0,11})$/.exec(text);
  if (match !== null) {
    const market = match[1];
    return {
      symbol: text,
      secid: market + '.' + match[2],
      market,
      code: match[2],
      us: US_MARKETS.indexOf(market) >= 0,
    };
  }
  match = /^(\d{6})$/.exec(text);
  if (match !== null) {
    const market = /^[69]/.test(match[1]) ? '1' : '0';
    return { symbol: text, secid: market + '.' + match[1], market, code: match[1] };
  }
  match = /^HK(\d{5})$/.exec(text);
  if (match !== null) {
    return { symbol: text, secid: '116.' + match[1], market: '116', code: match[1] };
  }
  match = /^(\d{5})$/.exec(text);
  if (match !== null) {
    return { symbol: text, secid: '116.' + match[1], market: '116', code: match[1] };
  }
  match = /^[A-Z][A-Z0-9.-]{0,9}$/.exec(text);
  if (match !== null) {
    return { symbol: text, secid: '105.' + text, market: '105', code: text, us: true };
  }
  return null;
}

function timeoutSignal(ms) {
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(ms);
    }
  } catch (_error) {
    /* Fall through to the manual controller. */
  }
  const controller = new AbortController();
  const timer = setTimeout(function abortRequest() {
    controller.abort();
  }, ms);
  if (timer !== null && typeof timer.unref === 'function') timer.unref();
  return controller.signal;
}

/**
 * Read one upstream quote list and return a Map keyed by `<market>.<code>`.
 * Rows are validated field by field so a format change degrades to "no quote"
 * instead of a broken panel.
 */
async function requestUpstream(secids) {
  const url = UPSTREAM
    + '?fltt=2&invt=2&fields=' + FIELDS
    + '&secids=' + encodeURIComponent(secids.join(','));
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'dsh-stock-panel/1.0' },
    signal: timeoutSignal(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('upstream status ' + String(response.status));
  const body = await response.json();
  if (body === null || typeof body !== 'object') throw new Error('upstream returned no JSON');
  // `rc: 102` with `data: null` is how the feed answers a symbol it does not
  // know; that is a per-symbol result, not a transport failure, so it must not
  // fail the whole batch. Only a non-JSON body or HTTP error is an error.
  let rows = [];
  if (body.data !== null && typeof body.data === 'object' && body.data.diff !== null && body.data.diff !== undefined) {
    rows = Array.isArray(body.data.diff) ? body.data.diff : [body.data.diff];
  }
  const quotes = new Map();
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const key = String(row.f13) + '.' + String(row.f12);
    const price = Number(row.f2);
    if (!Number.isFinite(price)) continue;
    const changePct = Number(row.f3);
    const change = Number(row.f4);
    const prevClose = Number(row.f18);
    const high = Number(row.f15);
    const low = Number(row.f16);
    const open = Number(row.f17);
    quotes.set(key, {
      code: String(row.f12),
      market: String(row.f13),
      name: typeof row.f14 === 'string' && row.f14.length > 0 ? row.f14 : String(row.f12),
      price,
      changePct: Number.isFinite(changePct) ? changePct : null,
      change: Number.isFinite(change) ? change : null,
      prevClose: Number.isFinite(prevClose) ? prevClose : null,
      high: Number.isFinite(high) ? high : null,
      low: Number.isFinite(low) ? low : null,
      open: Number.isFinite(open) ? open : null,
    });
  }
  return quotes;
}

function uniqueSecids(entries) {
  const seen = new Set();
  const list = [];
  for (const entry of entries) {
    if (entry === null || seen.has(entry.secid)) continue;
    seen.add(entry.secid);
    list.push(entry);
  }
  return list;
}

/**
 * Resolve every requested symbol to a quote list entry, preserving request
 * order and reporting invalid or unknown symbols explicitly.
 */
async function collectQuotes(symbols) {
  const entries = [];
  const items = [];
  for (const raw of symbols) {
    const normalized = normalizeSymbol(raw);
    if (normalized === null) {
      items.push({ input: raw, ok: false, reason: 'invalid-symbol' });
      continue;
    }
    entries.push(normalized);
  }

  const quotes = new Map();
  const unique = uniqueSecids(entries);
  if (unique.length > 0) {
    const fetched = await requestUpstream(unique.map(function secid(entry) {
      return entry.secid;
    }));
    for (const pair of fetched) quotes.set(pair[0], pair[1]);
  }

  // A US ticker may be listed on a market we did not guess; try the remaining
  // exchanges once, only for the tickers still unresolved.
  const unresolvedUs = unique.filter(function missing(entry) {
    return entry.us === true && quotes.has(entry.secid) === false;
  });
  if (unresolvedUs.length > 0) {
    for (const market of US_MARKETS) {
      const pending = unresolvedUs.filter(function stillMissing(entry) {
        return entry.market !== market && !quotes.has(market + '.' + entry.code);
      });
      if (pending.length === 0) continue;
      const fetched = await requestUpstream(pending.map(function secid(entry) {
        return market + '.' + entry.code;
      }));
      for (const pair of fetched) quotes.set(pair[0], pair[1]);
    }
  }

  for (const entry of entries) {
    const quote = quotes.get(entry.secid)
      || (entry.us === true ? quotes.get('106.' + entry.code) || quotes.get('107.' + entry.code) : undefined);
    if (quote === undefined) {
      items.push({ input: entry.symbol, ok: false, reason: 'not-found', symbol: entry.symbol });
      continue;
    }
    items.push({
      input: entry.symbol,
      ok: true,
      symbol: entry.symbol,
      code: quote.code,
      market: quote.market,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changePct: quote.changePct,
      prevClose: quote.prevClose,
      open: quote.open,
      high: quote.high,
      low: quote.low,
    });
  }
  return items;
}

function readSymbols(request) {
  let url;
  try {
    url = new URL(request.url, 'http://localhost');
  } catch (_error) {
    return [];
  }
  const raw = url.searchParams.get('symbols') || url.searchParams.get('list') || '';
  const seen = new Set();
  const symbols = [];
  // Parse a bounded superset of the documented cap so the caller can be told
  // that the batch is too large instead of silently losing the tail.
  const parseCeiling = MAX_SYMBOLS * 4;
  for (const part of raw.split(',')) {
    const text = part.trim().toUpperCase();
    if (text === '' || seen.has(text)) continue;
    seen.add(text);
    symbols.push(text);
    if (symbols.length >= parseCeiling) break;
  }
  return symbols;
}

function readQuery(request) {
  let url;
  try {
    url = new URL(request.url, 'http://localhost');
  } catch (_error) {
    return '';
  }
  const raw = url.searchParams.get('q') || url.searchParams.get('query') || '';
  const query = raw.trim();
  if (query.length === 0 || query.length > MAX_QUERY_LENGTH) return '';
  return query;
}

/**
 * Resolve a typed name, pinyin, or code to instruments. The feed answers with
 * its own code table; each row carries the canonical `QuoteID` the quote route
 * accepts, so a selection can never be re-interpreted as a different market.
 */
async function searchSymbols(query) {
  const url = SEARCH_UPSTREAM
    + '?type=14&count=' + String(SEARCH_COUNT)
    + '&input=' + encodeURIComponent(query);
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'dsh-stock-panel/1.0' },
    signal: timeoutSignal(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('search upstream status ' + String(response.status));
  const body = await response.json();
  const table = body !== null && typeof body === 'object' ? body.QuotationCodeTable : null;
  const rows = table !== null && typeof table === 'object' && Array.isArray(table.Data) ? table.Data : [];
  const items = [];
  const seen = new Set();
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const sid = typeof row.QuoteID === 'string' ? row.QuoteID.trim().toUpperCase() : '';
    const code = typeof row.Code === 'string' ? row.Code.trim().toUpperCase() : '';
    const name = typeof row.Name === 'string' ? row.Name : '';
    if (sid === '' || code === '' || name === '' || seen.has(sid)) continue;
    // The US table mixes bonds and notes whose tickers carry digits (AAPL22);
    // a personal portfolio list is clearer without them.
    if (row.Classify === 'UsStock' && /[0-9]/.test(code)) continue;
    const kind = typeof row.SecurityTypeName === 'string' ? row.SecurityTypeName : '';
    // Sector boards and futures cannot be held the way the panel computes
    // value and cost; keep the picker to instruments a portfolio can hold.
    if (kind === '板块' || kind === '期货') continue;
    seen.add(sid);
    items.push({
      sid,
      code,
      name,
      kind,
    });
    if (items.length >= SEARCH_COUNT) break;
  }
  return items;
}

function readTrendSymbol(request) {
  let url;
  try {
    url = new URL(request.url, 'http://localhost');
  } catch (_error) {
    return '';
  }
  const raw = url.searchParams.get('symbol') || url.searchParams.get('sid') || '';
  return raw.trim().toUpperCase().slice(0, 16);
}

/**
 * One trading day of one-minute closes for a single instrument, as
 * `[label, price, average]` triples. The quote route drives the live tick; this
 * series only supplies the shape, so it is cached for most of a minute.
 */
async function fetchTrend(entry) {
  const url = TREND_UPSTREAM
    + '?secid=' + encodeURIComponent(entry.secid)
    + '&ndays=1&iscr=0'
    + '&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13'
    + '&fields2=f51,f52,f53,f54,f55,f56,f57,f58';
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'dsh-stock-panel/1.0' },
    signal: timeoutSignal(TREND_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('trend upstream status ' + String(response.status));
  const body = await response.json();
  const data = body !== null && typeof body === 'object' ? body.data : null;
  const rows = data !== null && typeof data === 'object' && Array.isArray(data.trends) ? data.trends : [];
  const points = [];
  for (const row of rows) {
    if (typeof row !== 'string') continue;
    const parts = row.split(',');
    if (parts.length < 8) continue;
    const stamp = parts[0].indexOf(' ') >= 0 ? parts[0].slice(parts[0].indexOf(' ') + 1) : parts[0];
    const price = Number(parts[2]);
    const average = Number(parts[7]);
    if (!Number.isFinite(price) || price <= 0) continue;
    points.push([stamp, price, Number.isFinite(average) ? average : null]);
  }
  const prevClose = data !== null && typeof data === 'object' && Number.isFinite(Number(data.preClose))
    ? Number(data.preClose)
    : null;
  const name = data !== null && typeof data === 'object' && typeof data.name === 'string'
    ? data.name
    : entry.symbol;
  if (points.length === 0) throw new Error('trend upstream returned no points');
  return { symbol: entry.symbol, name, prevClose, points };
}

function sendJson(response, status, payload) {
  response.writeHead(status, RESPONSE_HEADERS);
  response.end(JSON.stringify(payload));
}

export const inject = ['webServer'];

export function apply(ctx) {
  // A very short cache keeps a panel refresh and an auto-refresh tick from
  // issuing duplicate upstream requests without ever hiding a real update.
  const cache = new Map();
  const searchCache = new Map();

  const disposeQuotes = ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async function handleQuotes(request, response) {
      const method = String(request.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        response.writeHead(405, { ...RESPONSE_HEADERS, allow: 'GET, HEAD' });
        response.end(JSON.stringify({ ok: false, error: { code: 'E_METHOD', message: 'GET only' } }));
        return;
      }

      const symbols = readSymbols(request);
      if (symbols.length === 0) {
        response.writeHead(200, RESPONSE_HEADERS);
        response.end(JSON.stringify({ ok: true, updatedAt: Date.now(), items: [] }));
        return;
      }
      if (symbols.length > MAX_SYMBOLS) {
        if (method === 'HEAD') {
          response.writeHead(400, RESPONSE_HEADERS);
          response.end();
          return;
        }
        sendJson(response, 400, {
          ok: false,
          error: { code: 'E_TOO_MANY', message: 'At most ' + String(MAX_SYMBOLS) + ' symbols per request' },
        });
        return;
      }

      try {
        const cacheKey = symbols.join(',');
        const cached = cache.get(cacheKey);
        let items;
        let stamp;
        if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) {
          items = cached.items;
          stamp = cached.at;
        } else {
          items = await collectQuotes(symbols);
          // The reported update time is when the data was fetched, never the
          // moment a cached answer was re-served.
          stamp = Date.now();
          cache.set(cacheKey, { at: stamp, items });
          if (cache.size > 64) {
            const oldest = cache.keys().next();
            if (oldest.done === false) cache.delete(oldest.value);
          }
        }
        if (method === 'HEAD') {
          response.writeHead(200, RESPONSE_HEADERS);
          response.end();
          return;
        }
        sendJson(response, 200, { ok: true, updatedAt: stamp, items });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'quote request failed';
        if (method === 'HEAD') {
          response.writeHead(502, RESPONSE_HEADERS);
          response.end();
          return;
        }
        sendJson(response, 502, { ok: false, error: { code: 'E_UPSTREAM', message } });
      }
    },
  });

  const disposeSearch = ctx.webServer.register({
    kind: 'exact',
    path: SEARCH_PATH,
    handler: async function handleSearch(request, response) {
      const method = String(request.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        response.writeHead(405, { ...RESPONSE_HEADERS, allow: 'GET, HEAD' });
        response.end(JSON.stringify({ ok: false, error: { code: 'E_METHOD', message: 'GET only' } }));
        return;
      }

      const query = readQuery(request);
      if (query === '') {
        sendJson(response, 200, { ok: true, items: [] });
        return;
      }

      try {
        const key = query.toLowerCase();
        const cached = searchCache.get(key);
        let items;
        if (cached !== undefined && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
          items = cached.items;
        } else {
          items = await searchSymbols(query);
          searchCache.set(key, { at: Date.now(), items });
          if (searchCache.size > 64) {
            const oldest = searchCache.keys().next();
            if (oldest.done === false) searchCache.delete(oldest.value);
          }
        }
        if (method === 'HEAD') {
          response.writeHead(200, RESPONSE_HEADERS);
          response.end();
          return;
        }
        sendJson(response, 200, { ok: true, items });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'search failed';
        if (method === 'HEAD') {
          response.writeHead(502, RESPONSE_HEADERS);
          response.end();
          return;
        }
        sendJson(response, 502, { ok: false, error: { code: 'E_SEARCH', message } });
      }
    },
  });

  const trendCache = new Map();

  const disposeTrend = ctx.webServer.register({
    kind: 'exact',
    path: TREND_PATH,
    handler: async function handleTrend(request, response) {
      const method = String(request.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        response.writeHead(405, { ...RESPONSE_HEADERS, allow: 'GET, HEAD' });
        response.end(JSON.stringify({ ok: false, error: { code: 'E_METHOD', message: 'GET only' } }));
        return;
      }

      const symbol = readTrendSymbol(request);
      const entry = symbol === '' ? null : normalizeSymbol(symbol);
      if (entry === null) {
        sendJson(response, 400, { ok: false, error: { code: 'E_PARAMS', message: 'A valid symbol is required' } });
        return;
      }

      try {
        const cached = trendCache.get(entry.secid);
        let trend;
        if (cached !== undefined && Date.now() - cached.at < TREND_CACHE_TTL_MS) {
          trend = cached.trend;
        } else {
          trend = await fetchTrend(entry);
          trendCache.set(entry.secid, { at: Date.now(), trend });
          if (trendCache.size > 96) {
            const oldest = trendCache.keys().next();
            if (oldest.done === false) trendCache.delete(oldest.value);
          }
        }
        if (method === 'HEAD') {
          response.writeHead(200, RESPONSE_HEADERS);
          response.end();
          return;
        }
        sendJson(response, 200, {
          ok: true,
          symbol: entry.symbol,
          name: trend.name,
          prevClose: trend.prevClose,
          points: trend.points,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'trend request failed';
        if (method === 'HEAD') {
          response.writeHead(502, RESPONSE_HEADERS);
          response.end();
          return;
        }
        sendJson(response, 502, { ok: false, error: { code: 'E_TREND', message } });
      }
    },
  });

  ctx.effect(function ownRoutes() {
    return function disposeRoutes() {
      try {
        disposeTrend();
      } catch (_error) {
        /* Already released with its owning context. */
      }
      try {
        disposeSearch();
      } catch (_error) {
        /* Already released with its owning context. */
      }
      try {
        disposeQuotes();
      } catch (_error) {
        /* Already released with its owning context. */
      }
    };
  }, 'dsh-stock-panel: quote, search and trend routes');
}
