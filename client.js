/**
 * Client half of the stock panel bundle.
 *
 * One root-scoped `main` panel plus its sidebar row. Holdings and cost basis
 * live only in this browser's local storage; quotes are fetched from the Host
 * half's same-origin endpoint, which proxies a public market data source so the
 * page never depends on third-party CORS headers.
 */
window.__ModuleLoader__.load({
  id: 'dsh-stock-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const useCallback = React.useCallback;
    const useEffect = React.useEffect;
    const useMemo = React.useMemo;
    const useRef = React.useRef;
    const useState = React.useState;

    const NS = 'stock-panel';
    const PANEL_ID = 'stock-panel';
    const SIDEBAR_ORDER = 20;
    const QUOTE_ENDPOINT = '/stock-panel/quotes';
    const SEARCH_ENDPOINT = '/stock-panel/search';
    const TREND_ENDPOINT = '/stock-panel/trend';
    // One intraday series per symbol is enough for the whole day's shape; the
    // live price from the quote poll replaces its last point on every tick.
    const TREND_REFRESH_MS = 60000;
    const STORE_KEY = 'dsh-stock-panel.holdings.v1';
    const PREFS_KEY = 'dsh-stock-panel.prefs.v1';
    const AUTO_CHOICES = [0, 1000, 30000, 60000, 120000];
    // Mirrors the Host route's per-request symbol cap so the panel can explain
    // the limit instead of leaving rows past it permanently unpriced.
    const MAX_HOLDINGS = 60;

    const ZH = {
      'nav.label': '自选持仓',
      'title': '股票持仓收益',
      'subtitle': '填写持仓数量与成本价，行情自动刷新，盈亏实时计算',
      'auto.label': '自动刷新',
      'auto.off': '关闭',
      'auto.1': '1 秒',
      'auto.30': '30 秒',
      'auto.60': '60 秒',
      'auto.120': '2 分钟',
      'auto.hint': '行情源约 3 秒更新一次，1 秒刷新属于高频拉取',
      'action.refresh': '刷新',
      'action.edit': '编辑',
      'action.remove': '删除',
      'action.removeConfirm': '确定删除这条持仓吗？',
      'summary.marketValue': '总市值',
      'summary.cost': '总成本',
      'summary.pnl': '总盈亏',
      'summary.today': '今日盈亏',
      'summary.partial': '部分持仓暂无行情',
      'form.add': '添加持仓',
      'form.editing': '修改持仓',
      'form.symbol': '代码/名称',
      'form.symbolPlaceholder': '输入代码或名称，如 茅台 / 600519 / AAPL',
      'form.shares': '数量',
      'form.cost': '成本价',
      'form.submit': '添加',
      'form.save': '保存',
      'form.cancel': '取消',
      'table.name': '名称',
      'table.price': '现价',
      'table.changePct': '涨跌幅',
      'table.todayPnl': '今日盈亏',
      'table.trend': '今日走势',
      'table.shares': '数量',
      'table.cost': '成本价',
      'table.marketValue': '市值',
      'table.pnl': '盈亏',
      'table.return': '收益率',
      'table.actions': '操作',
      'state.loading': '获取行情…',
      'state.updated': '更新于 {time}',
      'state.error': '行情获取失败：{detail}',
      'state.retry': '重试',
      'state.emptyTitle': '还没有持仓',
      'state.emptyHint': '在上方填入股票代码、持仓数量和成本价，点击“添加”。持仓只保存在本浏览器中。',
      'state.noQuote': '暂无行情',
      'state.count': '共 {n} 只',
      'state.foot': '行情来自公开行情接口，可能延迟，仅供自选参考，不构成投资建议。红涨绿跌。',
      'state.tooMany': '持仓过多：一次刷新最多查询 {max} 只，请减少持仓或拆成多个列表。',
      'invalid.symbol': '请填写或选择一只证券',
      'invalid.shares': '数量需为大于 0 的数字',
      'invalid.cost': '成本价需为不小于 0 的数字',
      'search.searching': '搜索中…',
      'search.empty': '没有匹配的证券',
      'search.error': '搜索暂不可用，可直接输入代码',
      'trend.expand': '展开今日分时',
      'trend.collapse': '收起今日分时',
      'trend.none': '暂无走势',
      'trend.stats': '昨收 {prev} · 最高 {high} · 最低 {low} · 均价 {avg}',
      'trend.axisPrev': '昨',
      'trend.legendPrice': '价格',
      'trend.legendAvg': '日均价',
      'trend.avgShort': '均',
      'trend.hint': '点击走势图展开今日分时',
    };

    const EN = {
      'nav.label': 'Portfolio',
      'title': 'Stock portfolio',
      'subtitle': 'Enter shares and cost basis; quotes refresh automatically and profit and loss updates live',
      'auto.label': 'Auto refresh',
      'auto.off': 'Off',
      'auto.1': '1 s',
      'auto.30': '30 s',
      'auto.60': '60 s',
      'auto.120': '2 min',
      'auto.hint': 'The quote feed updates about every 3 s; 1 s is a high-frequency fetch',
      'action.refresh': 'Refresh',
      'action.edit': 'Edit',
      'action.remove': 'Delete',
      'action.removeConfirm': 'Delete this holding?',
      'summary.marketValue': 'Market value',
      'summary.cost': 'Cost basis',
      'summary.pnl': 'Profit / loss',
      'summary.today': 'Today',
      'summary.partial': 'Some holdings have no quote',
      'form.add': 'Add holding',
      'form.editing': 'Edit holding',
      'form.symbol': 'Symbol / name',
      'form.symbolPlaceholder': 'Code or name, e.g. 600519 / AAPL',
      'form.shares': 'Shares',
      'form.cost': 'Cost',
      'form.submit': 'Add',
      'form.save': 'Save',
      'form.cancel': 'Cancel',
      'table.name': 'Name',
      'table.price': 'Price',
      'table.changePct': 'Change',
      'table.todayPnl': 'Today P / L',
      'table.trend': 'Today',
      'table.shares': 'Shares',
      'table.cost': 'Cost',
      'table.marketValue': 'Value',
      'table.pnl': 'P / L',
      'table.return': 'Return',
      'table.actions': 'Actions',
      'state.loading': 'Loading quotes…',
      'state.updated': 'Updated {time}',
      'state.error': 'Quote request failed: {detail}',
      'state.retry': 'Retry',
      'state.emptyTitle': 'No holdings yet',
      'state.emptyHint': 'Enter a symbol, share count and cost above, then press Add. Holdings stay in this browser only.',
      'state.noQuote': 'No quote',
      'state.count': '{n} holdings',
      'state.foot': 'Quotes come from a public market data feed and may be delayed. For reference only, not investment advice.',
      'state.tooMany': 'Too many holdings: at most {max} quotes per refresh. Remove some or split the list.',
      'invalid.symbol': 'Enter or pick a security',
      'invalid.shares': 'Shares must be a number greater than 0',
      'invalid.cost': 'Cost must be a number of 0 or more',
      'search.searching': 'Searching…',
      'search.empty': 'No matching security',
      'search.error': 'Search unavailable; you can type the code directly',
      'trend.expand': "Show today's intraday",
      'trend.collapse': "Hide today's intraday",
      'trend.none': 'No intraday data',
      'trend.stats': 'Prev {prev} · High {high} · Low {low} · Avg {avg}',
      'trend.axisPrev': 'Prev',
      'trend.legendPrice': 'Price',
      'trend.legendAvg': 'Day average',
      'trend.avgShort': 'Avg',
      'trend.hint': "Click the chart for today's intraday detail",
    };

    const STYLE = [
      '.sp-root{box-sizing:border-box;height:100%;min-height:100%;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:24px 28px 48px;font-size:13px;line-height:1.5}',
      '.sp-wrap{max-width:1040px;margin:0 auto;display:flex;flex-direction:column;gap:16px}',
      '.sp-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}',
      '.sp-title{margin:0;font-size:18px;font-weight:600}',
      '.sp-sub{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.sp-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.sp-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 12px;font-size:12px;font-family:inherit;cursor:pointer;transition:background .15s ease,border-color .15s ease,color .15s ease}',
      '.sp-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.sp-btn:disabled{opacity:.55;cursor:default}',
      '.sp-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.sp-btn-primary{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.sp-btn-ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary);padding:4px 6px}',
      '.sp-btn-ghost:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.sp-btn-danger:hover{color:var(--dsw-alias-state-error-primary)}',
      '.sp-field{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.sp-select{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;color:var(--dsw-alias-label-primary);padding:5px 8px;font-size:12px;font-family:inherit}',
      '.sp-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}',
      '.sp-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:6px}',
      '.sp-card-label{color:var(--dsw-alias-label-secondary);font-size:12px;display:flex;align-items:center;gap:6px}',
      '.sp-card-value{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}',
      '.sp-up{color:var(--dsw-alias-state-error-primary)}',
      '.sp-down{color:var(--dsw-alias-state-success-primary)}',
      '.sp-flat{color:var(--dsw-alias-label-secondary)}',
      '.sp-panel{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden}',
      '.sp-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.sp-form{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.sp-input{box-sizing:border-box;width:110px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;color:var(--dsw-alias-label-primary);padding:6px 8px;font-size:13px;font-family:inherit;font-variant-numeric:tabular-nums}',
      '.sp-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}',
      '.sp-input-symbol{width:210px}',
      '.sp-input-symbol:read-only{color:var(--dsw-alias-label-secondary)}',
      '.sp-combo{position:relative}',
      '.sp-combo-list{position:absolute;z-index:30;top:calc(100% + 4px);left:0;min-width:300px;max-height:280px;overflow:auto;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px}',
      '.sp-combo-option{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer}',
      '.sp-combo-option[data-active=true]{background:var(--dsw-alias-bg-layer-2)}',
      '.sp-combo-name{font-weight:500}',
      '.sp-combo-code{color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums}',
      '.sp-combo-badge{margin-left:auto;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.sp-combo-empty{padding:8px;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.sp-form-error{color:var(--dsw-alias-state-error-primary);font-size:12px}',
      '.sp-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}',
      '.sp-table th{padding:8px 12px;text-align:right;font-weight:500;font-size:12px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}',
      '.sp-table th:first-child,.sp-table td:first-child{text-align:left}',
      '.sp-table td{padding:10px 12px;text-align:right;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}',
      '.sp-table tr:last-child td{border-bottom:none}',
      '.sp-table tbody tr:hover td{background:var(--dsw-alias-bg-layer-2)}',
      '.sp-name{display:flex;flex-direction:column;gap:2px}',
      '.sp-name-text{font-weight:500}',
      '.sp-name-code{color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.sp-actions{white-space:nowrap}',
      '.sp-trend-cell{width:160px}',
      '.sp-trend-btn{appearance:none;padding:0;border:0;background:transparent;cursor:pointer;display:block;width:100%;line-height:0;border-radius:4px}',
      '.sp-trend-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.sp-spark{display:block;width:100%;overflow:visible}',
      '.sp-spark-line{fill:none;stroke:currentColor;stroke-width:1.6;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}',
      '.sp-spark-avg{fill:none;stroke:var(--dsw-alias-label-secondary);stroke-width:1.2;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round;opacity:.9}',
      '.sp-trend-legend{display:flex;gap:14px;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.sp-legend-item{display:inline-flex;align-items:center;gap:5px}',
      '.sp-legend-line{display:inline-block;width:16px;border-top:2px solid currentColor}',
      '.sp-legend-avg{color:var(--dsw-alias-label-secondary);border-top-style:dashed}',
      '.sp-spark-base{stroke:var(--dsw-alias-border-l2);stroke-width:1;stroke-dasharray:2 3;vector-effect:non-scaling-stroke}',
      '.sp-spark-dot{fill:currentColor}',
      '.sp-spark-up{color:var(--dsw-alias-state-error-primary)}',
      '.sp-spark-down{color:var(--dsw-alias-state-success-primary)}',
      '.sp-spark-flat{color:var(--dsw-alias-label-secondary)}',
      '.sp-expanded-cell{padding:12px 14px 16px;background:var(--dsw-alias-bg-layer-2);text-align:left;white-space:normal}',
      '.sp-trend-detail{display:flex;flex-direction:column;gap:8px}',
      '.sp-trend-stats{color:var(--dsw-alias-label-secondary);font-size:12px;font-variant-numeric:tabular-nums}',
      '.sp-trend-plot{display:flex;align-items:flex-start;gap:10px}',
      '.sp-trend-scale{position:relative;flex:none;width:116px;height:150px;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums}',
      '.sp-trend-scale span{position:absolute;right:0;transform:translateY(-50%);white-space:nowrap;line-height:1.1}',
      '.sp-trend-canvas{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}',
      '.sp-trend-chart{position:relative;height:150px}',
      '.sp-guide{stroke:var(--dsw-alias-border-l2);stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}',
      '.sp-guide-dot{fill:var(--dsw-alias-label-primary)}',
      '.sp-guide-tip{position:absolute;z-index:2;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:3px 7px;font-size:11px;line-height:1.3;color:var(--dsw-alias-label-primary);white-space:nowrap;pointer-events:none;font-variant-numeric:tabular-nums}',
      '.sp-trend-axis{display:flex;justify-content:space-between;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums}',
      '.sp-empty{padding:40px 16px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.sp-empty-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;margin-bottom:6px}',
      '.sp-empty-hint{font-size:12px;max-width:520px;margin:0 auto}',
      '.sp-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:10px;padding:10px 14px;color:var(--dsw-alias-state-error-primary);font-size:12px}',
      '.sp-foot{color:var(--dsw-alias-label-secondary);font-size:11px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}',
      '.sp-scroll{overflow-x:auto}',
      '.sp-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}',
    ].join('\n');

    function isFiniteNumber(value) {
      return typeof value === 'number' && Number.isFinite(value);
    }

    function formatNumber(value, digits) {
      if (!isFiniteNumber(value)) return '—';
      return value.toLocaleString('zh-CN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    }

    function formatFlexible(value, maxDigits) {
      if (!isFiniteNumber(value)) return '—';
      return value.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: maxDigits });
    }

    function formatSigned(value, digits) {
      if (!isFiniteNumber(value)) return '—';
      return (value > 0 ? '+' : value < 0 ? '-' : '') + formatNumber(Math.abs(value), digits);
    }

    function formatPercent(value) {
      if (!isFiniteNumber(value)) return '—';
      return (value > 0 ? '+' : value < 0 ? '-' : '') + Math.abs(value).toFixed(2) + '%';
    }

    /** A-share convention: rising values read red, falling values read green. */
    function tone(value) {
      if (!isFiniteNumber(value) || value === 0) return 'sp-flat';
      return value > 0 ? 'sp-up' : 'sp-down';
    }

    function withCount(template, count) {
      return String(template).split('{n}').join(String(count));
    }

    function fillDetail(template, detail) {
      return String(template).split('{detail}').join(String(detail));
    }

    function fillMax(template, max) {
      return String(template).split('{max}').join(String(max));
    }

    function createTranslator(props) {
      const bound = typeof props.t === 'function' ? props.t : null;
      if (bound !== null) {
        return function translate(key) {
          const text = bound(key);
          if (typeof text === 'string' && text.length > 0 && text !== key) return text;
          return typeof ZH[key] === 'string' ? ZH[key] : key;
        };
      }
      return function fallback(key) {
        return typeof ZH[key] === 'string' ? ZH[key] : key;
      };
    }

    // ---- local storage ---------------------------------------------------

    function readStored(key) {
      try {
        const raw = window.localStorage.getItem(key);
        if (typeof raw !== 'string' || raw === '') return null;
        const parsed = JSON.parse(raw);
        return parsed !== null && typeof parsed === 'object' ? parsed : null;
      } catch (_error) {
        return null;
      }
    }

    function writeStored(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (_error) {
        /* Storage can be unavailable (private mode, quota); the panel still works. */
      }
    }

    function loadHoldings() {
      const stored = readStored(STORE_KEY);
      const list = stored !== null && Array.isArray(stored.items) ? stored.items : [];
      const out = [];
      const seen = new Set();
      for (const item of list) {
        if (item === null || typeof item !== 'object') continue;
        const symbol = typeof item.symbol === 'string' ? item.symbol.trim().toUpperCase() : '';
        const shares = Number(item.shares);
        const cost = Number(item.cost);
        if (symbol === '') continue;
        if (!Number.isFinite(shares) || shares <= 0) continue;
        if (!Number.isFinite(cost) || cost < 0) continue;
        // `sid` is the canonical feed id when the row came from search; entries
        // written before search existed only carry the display code.
        const sid = typeof item.sid === 'string' && item.sid.trim() !== '' ? item.sid.trim().toUpperCase() : symbol;
        if (seen.has(sid)) continue;
        seen.add(sid);
        out.push({ sid, symbol, shares, cost });
      }
      return out;
    }

    function saveHoldings(holdings) {
      writeStored(STORE_KEY, { version: 1, items: holdings });
    }

    function loadAutoRefresh() {
      const stored = readStored(PREFS_KEY);
      const value = stored !== null ? Number(stored.autoRefreshMs) : Number.NaN;
      return AUTO_CHOICES.indexOf(value) >= 0 ? value : 30000;
    }

    function saveAutoRefresh(autoRefreshMs) {
      writeStored(PREFS_KEY, { autoRefreshMs });
    }

    function formatClock(ms) {
      try {
        return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });
      } catch (_error) {
        return String(ms);
      }
    }

    /**
     * Geometry for one intraday line. `livePrice` replaces the last sampled
     * point so the shape follows the quote poll without re-downloading the day.
     * The previous close is always inside the value range, so the dashed
     * baseline stays visible on a strongly trending day.
     */
    function sparkGeometry(points, prevClose, livePrice, width, height) {
      if (!Array.isArray(points) || points.length === 0) return null;
      const values = [];
      const labels = [];
      const averages = [];
      for (const point of points) {
        if (!Array.isArray(point)) continue;
        const price = point[1];
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue;
        values.push(price);
        labels.push(typeof point[0] === 'string' ? point[0] : '');
        // The feed's third value is the day's running average price (VWAP).
        averages.push(typeof point[2] === 'number' && Number.isFinite(point[2]) && point[2] > 0 ? point[2] : null);
      }
      if (values.length === 0) return null;
      const lastIndex = values.length - 1;
      if (typeof livePrice === 'number' && Number.isFinite(livePrice) && livePrice > 0) {
        values[lastIndex] = livePrice;
      }
      const baseline = typeof prevClose === 'number' && Number.isFinite(prevClose) && prevClose > 0 ? prevClose : null;
      const all = baseline === null ? values.slice() : values.concat([baseline]);
      let min = Math.min.apply(null, all);
      let max = Math.max.apply(null, all);
      if (baseline !== null) {
        // Symmetric around the previous close: the dashed baseline is always the
        // middle of the box, so a rise and a fall of the same size read equally
        // on either side of it.
        const distance = Math.max(Math.abs(max - baseline), Math.abs(baseline - min));
        const half = distance > 0 ? distance : Math.max(Math.abs(baseline) * 0.001, 0.01);
        min = baseline - half;
        max = baseline + half;
      }
      if (!(max > min)) max = min + Math.max(Math.abs(min) * 0.001, 0.01);
      const pad = (max - min) * (baseline === null ? 0.1 : 0.06);
      min -= pad;
      max += pad;
      const span = max - min;
      const x = function xAt(index) {
        return values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      };
      const y = function yAt(value) {
        return height - ((value - min) / span) * height;
      };
      const coords = [];
      const positions = [];
      for (let index = 0; index < values.length; index += 1) {
        const pointX = x(index);
        const pointY = y(values[index]);
        coords.push(pointX.toFixed(2) + ',' + pointY.toFixed(2));
        positions.push({ v: values[index], x: pointX, y: pointY, label: labels[index], avg: averages[index] });
      }
      // The average line is drawn in segments so a missing sample leaves a gap
      // instead of inventing a straight jump.
      const avgSegments = [];
      let segment = [];
      for (let index = 0; index < averages.length; index += 1) {
        const average = averages[index];
        if (average === null) {
          if (segment.length > 1) avgSegments.push(segment.join(' '));
          segment = [];
          continue;
        }
        segment.push(x(index).toFixed(2) + ',' + y(average).toFixed(2));
      }
      if (segment.length > 1) avgSegments.push(segment.join(' '));
      return {
        path: coords.join(' '),
        positions,
        avgSegments,
        baseY: baseline === null ? null : y(baseline),
        lastX: x(lastIndex),
        lastY: y(values[lastIndex]),
        last: values[lastIndex],
        baseline,
        high: Math.max.apply(null, values),
        low: Math.min.apply(null, values),
        highY: y(Math.max.apply(null, values)),
        lowY: y(Math.min.apply(null, values)),
      };
    }

    function sparkToneClass(geometry) {
      if (geometry === null || geometry.baseline === null) return 'sp-spark-flat';
      const delta = geometry.last - geometry.baseline;
      if (delta > 0) return 'sp-spark-up';
      if (delta < 0) return 'sp-spark-down';
      return 'sp-spark-flat';
    }

    /** Tooltip placement that keeps the label inside the chart box. */
    function tooltipTransform(ratio) {
      if (ratio < 0.15) return 'translate(-8%, -130%)';
      if (ratio > 0.85) return 'translate(-92%, -130%)';
      return 'translate(-50%, -130%)';
    }

    /**
     * One intraday line. The expanded chart adds a hover crosshair: vertical
     * and horizontal guides plus a label with that moment's time and price.
     */
    function TrendChart(props) {
      const [hoverIndex, setHoverIndex] = useState(null);
      const svgRef = useRef(null);
      const geometry = sparkGeometry(props.points, props.prevClose, props.livePrice, props.width, props.height);
      if (geometry === null) return null;
      const width = props.width;
      const height = props.height;
      const interactive = props.expanded === true;
      const hovered =
        interactive === true && hoverIndex !== null && hoverIndex >= 0 && hoverIndex < geometry.positions.length
          ? geometry.positions[hoverIndex]
          : null;

      function handleMove(event) {
        const svg = svgRef.current;
        if (svg === null || typeof svg.getBoundingClientRect !== 'function') return;
        const rect = svg.getBoundingClientRect();
        if (!(rect.width > 0)) return;
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        const index = Math.round(ratio * (geometry.positions.length - 1));
        setHoverIndex(index);
      }

      function handleLeave() {
        setHoverIndex(null);
      }

      const svg = h(
        'svg',
        {
          ref: svgRef,
          className: 'sp-spark ' + sparkToneClass(geometry),
          width: '100%',
          height: String(height),
          viewBox: '0 0 ' + String(width) + ' ' + String(height),
          preserveAspectRatio: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
          onMouseMove: interactive === true ? handleMove : undefined,
          onMouseLeave: interactive === true ? handleLeave : undefined,
        },
        geometry.baseY === null
          ? null
          : h('line', {
              className: 'sp-spark-base',
              x1: 0,
              y1: geometry.baseY.toFixed(2),
              x2: String(width),
              y2: geometry.baseY.toFixed(2),
            }),
        hovered === null
          ? null
          : h('line', {
              className: 'sp-guide',
              x1: hovered.x.toFixed(2),
              y1: 0,
              x2: hovered.x.toFixed(2),
              y2: String(height),
            }),
        hovered === null
          ? null
          : h('line', {
              className: 'sp-guide',
              x1: 0,
              y1: hovered.y.toFixed(2),
              x2: String(width),
              y2: hovered.y.toFixed(2),
            }),
        // The day-average line belongs to the expanded detail view only; the
        // list sparkline stays a single uncluttered price line.
        props.expanded === true
          ? geometry.avgSegments.map(function avgLine(points, index) {
              return h('polyline', { key: 'avg-' + String(index), className: 'sp-spark-avg', points: points });
            })
          : null,
        h('polyline', { className: 'sp-spark-line', points: geometry.path }),
        h('circle', {
          className: 'sp-spark-dot',
          cx: geometry.lastX.toFixed(2),
          cy: geometry.lastY.toFixed(2),
          r: props.expanded === true ? 2.8 : 2,
        }),
        hovered === null
          ? null
          : h('circle', {
              className: 'sp-guide-dot',
              cx: hovered.x.toFixed(2),
              cy: hovered.y.toFixed(2),
              r: 2.8,
            }),
      );

      if (interactive !== true) return svg;
      return h(
        React.Fragment,
        null,
        svg,
        hovered === null
          ? null
          : h(
              'div',
              {
                className: 'sp-guide-tip',
                style: {
                  left: ((hovered.x / width) * 100).toFixed(2) + '%',
                  top: ((hovered.y / height) * 100).toFixed(2) + '%',
                  transform: tooltipTransform(hovered.x / width),
                },
              },
              hovered.label === '' ? '' : hovered.label + ' · ',
              formatFlexible(hovered.v, 3),
              geometry.baseline === null
                ? ''
                : ' · ' + formatPercent(((hovered.v - geometry.baseline) / geometry.baseline) * 100),
              hovered.avg === null || hovered.avg === undefined
                ? ''
                : ' · ' + (typeof props.avgLabel === 'string' ? props.avgLabel : '均') + ' ' + formatNumber(hovered.avg, 2),
            ),
      );
    }

    /** Day statistics and axis labels for the expanded chart. */
    function trendSummary(trend, livePrice) {
      if (trend === null || trend === undefined) return null;
      const points = trend.points;
      if (!Array.isArray(points) || points.length === 0) return null;
      const geometry = sparkGeometry(points, trend.prevClose, livePrice, 1, 1);
      if (geometry === null) return null;
      const lastPoint = points[points.length - 1];
      const average = Array.isArray(lastPoint) && typeof lastPoint[2] === 'number' ? lastPoint[2] : null;
      const firstPoint = points[0];
      const midPoint = points[Math.floor(points.length / 2)];
      return {
        prev: formatFlexible(geometry.baseline, 3),
        high: formatFlexible(geometry.high, 3),
        low: formatFlexible(geometry.low, 3),
        avg: formatFlexible(average, 3),
        firstLabel: Array.isArray(firstPoint) ? String(firstPoint[0]) : '',
        midLabel: Array.isArray(midPoint) ? String(midPoint[0]) : '',
        lastLabel: Array.isArray(lastPoint) ? String(lastPoint[0]) : '',
      };
    }

    function fillTrendStats(template, summary) {
      return String(template)
        .split('{prev}').join(summary === null ? '—' : summary.prev)
        .split('{high}').join(summary === null ? '—' : summary.high)
        .split('{low}').join(summary === null ? '—' : summary.low)
        .split('{avg}').join(summary === null ? '—' : summary.avg);
    }

    function clampPercent(percent) {
      if (percent < 8) return 8;
      if (percent > 92) return 92;
      return percent;
    }

    /**
     * Price scale for the expanded chart. With a previous close the axis reads
     * the day's percentage swing at that level next to the price it corresponds
     * to (`+7.83% · 12.40`); without one it falls back to the raw price range.
     */
    function trendAxisLabels(trend, livePrice, height, t) {
      const geometry = sparkGeometry(trend.points, trend.prevClose, livePrice, 1, height);
      if (geometry === null) return [];
      const percentText = function percentText(value) {
        if (geometry.baseline === null) return formatFlexible(value, 3);
        return formatPercent(((value - geometry.baseline) / geometry.baseline) * 100) + ' · ' + formatNumber(value, 2);
      };
      const highTop = clampPercent((geometry.highY / height) * 100);
      const lowTop = clampPercent((geometry.lowY / height) * 100);
      const labels = [{ key: 'high', top: highTop, text: percentText(geometry.high) }];
      if (geometry.baseY !== null) {
        const baseTop = (geometry.baseY / height) * 100;
        if (Math.abs(baseTop - highTop) > 7 && Math.abs(baseTop - lowTop) > 7) {
          labels.push({
            key: 'base',
            top: clampPercent(baseTop),
            text:
              t('trend.axisPrev') + ' ' +
              (geometry.baseline === null
                ? formatFlexible(geometry.baseline, 3)
                : formatPercent(0) + ' · ' + formatNumber(geometry.baseline, 2)),
          });
        }
      }
      labels.push({ key: 'low', top: lowTop, text: percentText(geometry.low) });
      return labels;
    }

    // ---- views -----------------------------------------------------------

    /** Host row glyph: a rising trend line, following the row's currentColor. */
    function SidebarIcon(props) {
      let size = props !== null && typeof props.size === 'number' && Number.isFinite(props.size) ? props.size : 16;
      if (size < 12) size = 12;
      if (size > 24) size = 24;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': 'true',
          focusable: 'false',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        h('path', { d: 'M2 12.2 5.6 8.6 8.4 10.6 12.2 5.2 14 6.8' }),
        h('path', { d: 'M2 14.4h12' }),
      );
    }

    function SummaryCard(labelText, valueText, valueTone, extra) {
      return h(
        'div',
        { className: 'sp-card', key: labelText },
        h('span', { className: 'sp-card-label' }, labelText),
        h('span', { className: 'sp-card-value ' + valueTone }, valueText),
        extra !== undefined && extra !== null ? h('span', { className: 'sp-foot' }, extra) : null,
      );
    }

    function StockPanel(props) {
      const t = createTranslator(props);
      const [holdings, setHoldings] = useState(loadHoldings);
      const [quotes, setQuotes] = useState({});
      const [status, setStatus] = useState('idle');
      const [errorText, setErrorText] = useState(null);
      const [updatedAt, setUpdatedAt] = useState(0);
      const [autoMs, setAutoMs] = useState(loadAutoRefresh);
      const [draft, setDraft] = useState({ symbol: '', shares: '', cost: '' });
      const [editing, setEditing] = useState(null);
      const [formError, setFormError] = useState(null);
      // The search picker: `picked` remembers the canonical feed id of the
      // selected row, so a code that also names another market (000001 is both
      // 平安银行 and 上证指数) can never be re-interpreted on submit.
      const [picked, setPicked] = useState(null);
      const [suggestions, setSuggestions] = useState([]);
      const [suggestStatus, setSuggestStatus] = useState('idle');
      const [suggestOpen, setSuggestOpen] = useState(false);
      const [activeIndex, setActiveIndex] = useState(-1);
      // sid -> { status, points, prevClose, at } for the intraday sparkline.
      const [trends, setTrends] = useState({});
      const [expandedSid, setExpandedSid] = useState(null);

      const aliveRef = useRef(true);
      const inFlightRef = useRef(false);
      const requestedSignatureRef = useRef('');
      const searchTokenRef = useRef(0);
      const sharesRef = useRef(null);
      const trendInflightRef = useRef({});
      const holdingsRef = useRef(holdings);
      holdingsRef.current = holdings;
      const trendsRef = useRef(trends);
      trendsRef.current = trends;

      const symbolSignature = holdings
        .map(function symbolOf(item) {
          return item.sid;
        })
        .join(',');

      useEffect(
        function trackAlive() {
          aliveRef.current = true;
          return function cleanupAlive() {
            aliveRef.current = false;
          };
        },
        [],
      );

      useEffect(
        function persistHoldings() {
          saveHoldings(holdings);
        },
        [holdings],
      );

      useEffect(
        function persistAutoRefresh() {
          saveAutoRefresh(autoMs);
        },
        [autoMs],
      );

      const refresh = useCallback(function refresh() {
        const list = holdingsRef.current;
        if (list.length === 0) {
          setQuotes({});
          setStatus('idle');
          setErrorText(null);
          return Promise.resolve();
        }
        if (list.length > MAX_HOLDINGS) {
          // The Host route refuses a batch above its cap; surface that instead of
          // leaving the rows past the cap silently unpriced.
          setStatus('too-many');
          return Promise.resolve();
        }
        if (inFlightRef.current === true) return Promise.resolve();
        inFlightRef.current = true;
        setStatus('loading');
        setErrorText(null);
        const symbols = list
          .map(function symbolOf(item) {
            return item.sid;
          })
          .join(',');
        requestedSignatureRef.current = symbols;
        return fetch(QUOTE_ENDPOINT + '?symbols=' + encodeURIComponent(symbols), {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/json' },
        })
          .then(function readBody(response) {
            return response.json().then(
              function toBody(body) {
                if (response.ok === true && body !== null && typeof body === 'object' && body.ok === true) {
                  return body;
                }
                const detail =
                  body !== null &&
                  typeof body === 'object' &&
                  body.error !== null &&
                  typeof body.error === 'object' &&
                  typeof body.error.message === 'string'
                    ? body.error.message
                    : 'HTTP ' + String(response.status);
                throw new Error(detail);
              },
              function badJson() {
                throw new Error('HTTP ' + String(response.status));
              },
            );
          })
          .then(function apply(body) {
            if (aliveRef.current !== true) return;
            const next = {};
            const items = Array.isArray(body.items) ? body.items : [];
            for (const item of items) {
              if (item !== null && typeof item === 'object' && typeof item.input === 'string') {
                next[item.input] = item;
              }
            }
            setQuotes(next);
            setUpdatedAt(typeof body.updatedAt === 'number' ? body.updatedAt : Date.now());
            setStatus('ok');
          })
          .catch(function failed(error) {
            if (aliveRef.current !== true) return;
            setStatus('error');
            setErrorText(error instanceof Error ? error.message : String(error));
          })
          .then(function release() {
            inFlightRef.current = false;
            const current = holdingsRef.current
              .map(function symbolOf(item) {
                return item.sid;
              })
              .join(',');
            // A holdings change made while this request was in flight was never
            // fetched (the request carried the old symbol list): run once more so
            // the new row is priced without waiting for an auto-refresh tick.
            if (aliveRef.current === true && current !== '' && current !== requestedSignatureRef.current) {
              refresh();
            }
          });
      }, []);

      useEffect(
        function refreshOnListChange() {
          if (symbolSignature === '') {
            setQuotes({});
            setStatus('idle');
            return;
          }
          refresh();
        },
        [symbolSignature, refresh],
      );

      useEffect(
        function autoRefreshTick() {
          if (autoMs <= 0 || symbolSignature === '') return function noTick() {};
          const timer = setInterval(function tick() {
            refresh();
          }, autoMs);
          return function stopTick() {
            clearInterval(timer);
          };
        },
        [autoMs, symbolSignature, refresh],
      );

      useEffect(
        function searchOnType() {          if (editing !== null) return function noSearch() {};
          const query = draft.symbol.trim();
          if (picked !== null && picked.code === query.toUpperCase()) return function noSearch() {};
          if (query === '') {
            searchTokenRef.current += 1;
            setSuggestions([]);
            setSuggestStatus('idle');
            setSuggestOpen(false);
            setActiveIndex(-1);
            return function noSearch() {};
          }
          const token = searchTokenRef.current + 1;
          searchTokenRef.current = token;
          setSuggestStatus('loading');
          const timer = setTimeout(function runSearch() {
            fetch(SEARCH_ENDPOINT + '?q=' + encodeURIComponent(query), {
              method: 'GET',
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { accept: 'application/json' },
            })
              .then(function readSearch(response) {
                return response.json().then(function toSearchBody(body) {
                  if (response.ok === true && body !== null && typeof body === 'object' && body.ok === true) return body;
                  throw new Error('HTTP ' + String(response.status));
                });
              })
              .then(function applySearch(body) {
                if (aliveRef.current !== true || searchTokenRef.current !== token) return;
                const items = (Array.isArray(body.items) ? body.items : []).filter(function usable(item) {
                  return item !== null && typeof item === 'object' && typeof item.sid === 'string' && typeof item.code === 'string';
                });
                setSuggestions(items);
                setSuggestStatus(items.length > 0 ? 'ok' : 'empty');
                setSuggestOpen(true);
                setActiveIndex(-1);
              })
              .catch(function searchFailed() {
                if (aliveRef.current !== true || searchTokenRef.current !== token) return;
                setSuggestions([]);
                setSuggestStatus('error');
                setSuggestOpen(true);
              });
          }, 250);
          return function cancelSearch() {
            clearTimeout(timer);
          };
        },
        [draft.symbol, editing, picked],
      );

      function chooseSuggestion(item) {
        setDraft(function next(prev) {
          return { symbol: item.code, shares: prev.shares, cost: prev.cost };
        });
        setPicked({ sid: item.sid, code: item.code });
        setSuggestions([]);
        setSuggestStatus('idle');
        setSuggestOpen(false);
        setActiveIndex(-1);
        const field = sharesRef.current;
        if (field !== null && field !== undefined && typeof field.focus === 'function') field.focus();
      }

      function onSymbolChange(event) {
        setPicked(null);
        setDraft({ symbol: event.target.value, shares: draft.shares, cost: draft.cost });
      }

      function onSymbolFocus() {
        if (draft.symbol.trim() !== '' && suggestions.length > 0 && picked === null && editing === null) {
          setSuggestOpen(true);
        }
      }

      function onSymbolBlur() {
        // Let an option's mousedown win the race before the list unmounts.
        setTimeout(function closeList() {
          if (aliveRef.current === true) setSuggestOpen(false);
        }, 140);
      }

      function onSymbolKeyDown(event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (suggestions.length > 0) {
            setSuggestOpen(true);
            setActiveIndex(function forward(index) {
              return index + 1 >= suggestions.length ? 0 : index + 1;
            });
          }
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          if (suggestions.length > 0) {
            setSuggestOpen(true);
            setActiveIndex(function back(index) {
              return index <= 0 ? suggestions.length - 1 : index - 1;
            });
          }
          return;
        }
        if (event.key === 'Escape') {
          setSuggestOpen(false);
          setActiveIndex(-1);
          return;
        }
        if (event.key === 'Enter' && suggestOpen === true && activeIndex >= 0 && activeIndex < suggestions.length) {
          event.preventDefault();
          chooseSuggestion(suggestions[activeIndex]);
        }
      }

      const loadTrend = useCallback(function loadTrend(sid) {
        if (trendInflightRef.current[sid] === true) return;
        trendInflightRef.current[sid] = true;
        fetch(TREND_ENDPOINT + '?symbol=' + encodeURIComponent(sid), {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { accept: 'application/json' },
        })
          .then(function readTrend(response) {
            return response.json().then(function toTrendBody(body) {
              if (response.ok === true && body !== null && typeof body === 'object' && body.ok === true) return body;
              throw new Error('HTTP ' + String(response.status));
            });
          })
          .then(function applyTrend(body) {
            if (aliveRef.current !== true) return;
            const points = Array.isArray(body.points)
              ? body.points.filter(function usable(point) {
                  return Array.isArray(point) && point.length >= 2 && typeof point[1] === 'number' && point[1] > 0;
                })
              : [];
            if (points.length === 0) throw new Error('no points');
            setTrends(function next(prev) {
              const copy = Object.assign({}, prev);
              copy[sid] = {
                status: 'ok',
                name: typeof body.name === 'string' ? body.name : '',
                prevClose: typeof body.prevClose === 'number' ? body.prevClose : null,
                points: points,
                at: Date.now(),
              };
              return copy;
            });
          })
          .catch(function trendFailed() {
            if (aliveRef.current !== true) return;
            setTrends(function next(prev) {
              // Keep a series that already loaded: the chart is still the best
              // available picture when one refresh fails.
              if (prev[sid] !== undefined && prev[sid].status === 'ok') return prev;
              const copy = Object.assign({}, prev);
              copy[sid] = { status: 'error', name: '', prevClose: null, points: null, at: Date.now() };
              return copy;
            });
          })
          .then(function releaseTrend() {
            delete trendInflightRef.current[sid];
          });
      }, []);

      useEffect(
        function loadTrends() {
          if (symbolSignature === '') return function noTrends() {};
          // One request per symbol: above the panel's cap the list is already
          // showing the limit banner, so skip the extra fan-out.
          if (holdingsRef.current.length > MAX_HOLDINGS) return function noTrends() {};
          function loadStale() {
            const now = Date.now();
            for (const item of holdingsRef.current) {
              const current = trendsRef.current[item.sid];
              if (current !== undefined && current.status === 'ok' && now - current.at < TREND_REFRESH_MS - 5000) continue;
              loadTrend(item.sid);
            }
          }
          loadStale();
          const timer = setInterval(loadStale, TREND_REFRESH_MS);
          return function stopTrends() {
            clearInterval(timer);
          };
        },
        [symbolSignature, loadTrend],
      );

      const rows = useMemo(
        function buildRows() {
          return holdings.map(function toRow(item) {
            const quote = quotes[item.sid];
            const found = quote !== undefined && quote.ok === true;
            const price = found && isFiniteNumber(quote.price) ? quote.price : null;
            const prevClose = found && isFiniteNumber(quote.prevClose) ? quote.prevClose : null;
            const changePct = found && isFiniteNumber(quote.changePct) ? quote.changePct : null;
            const costValue = item.cost * item.shares;
            const marketValue = price === null ? null : price * item.shares;
            const pnl = marketValue === null ? null : marketValue - costValue;
            const pnlPct = pnl === null ? null : costValue > 0 ? (pnl / costValue) * 100 : null;
            const todayPnl = price === null || prevClose === null ? null : (price - prevClose) * item.shares;
            const name = found && typeof quote.name === 'string' && quote.name.length > 0 ? quote.name : null;
            const missing = quote === undefined ? 'pending' : found ? null : quote.reason || 'not-found';
            const trend = trends[item.sid] !== undefined && trends[item.sid].status === 'ok' ? trends[item.sid] : null;
            return {
              sid: item.sid,
              symbol: item.symbol,
              shares: item.shares,
              cost: item.cost,
              price,
              changePct,
              marketValue,
              costValue,
              pnl,
              pnlPct,
              todayPnl,
              name,
              missing,
              trend,
            };
          });
        },
        [holdings, quotes, trends],
      );

      const totals = useMemo(
        function sumRows() {
          let marketValue = 0;
          let costValue = 0;
          let pricedCost = 0;
          let pnl = 0;
          let today = 0;
          let priced = 0;
          let complete = true;
          let todayComplete = true;
          for (const row of rows) {
            costValue += row.costValue;
            if (row.marketValue === null) {
              complete = false;
              continue;
            }
            priced += 1;
            pricedCost += row.costValue;
            marketValue += row.marketValue;
            if (row.pnl !== null) pnl += row.pnl;
            if (row.todayPnl === null) todayComplete = false;
            else today += row.todayPnl;
          }
          const anyPrice = priced > 0;
          // Every computed card shares one cost basis so `market value - cost =
          // profit` always holds: with a partial quote set the cost card reports
          // the priced holdings' cost and the panel shows the partial note. With
          // no quote at all, unknown totals stay unknown instead of printing 0.00.
          const partial = anyPrice === true && complete === false;
          return {
            marketValue: anyPrice === true ? marketValue : null,
            costBasis: partial === true ? pricedCost : costValue,
            pnl: anyPrice === true ? pnl : null,
            today: anyPrice === true && todayComplete === true ? today : null,
            pnlPct: anyPrice === true && pricedCost > 0 ? (pnl / pricedCost) * 100 : null,
            complete,
            partial,
          };
        },
        [rows],
      );

      function startEdit(row) {
        setEditing(row.sid);
        setDraft({ symbol: row.symbol, shares: String(row.shares), cost: String(row.cost) });
        setPicked({ sid: row.sid, code: row.symbol });
        setSuggestions([]);
        setSuggestStatus('idle');
        setSuggestOpen(false);
        setActiveIndex(-1);
        setFormError(null);
      }

      function cancelEdit() {
        setEditing(null);
        setDraft({ symbol: '', shares: '', cost: '' });
        setPicked(null);
        setSuggestions([]);
        setSuggestStatus('idle');
        setSuggestOpen(false);
        setActiveIndex(-1);
        setFormError(null);
      }

      function removeHolding(sid) {
        let confirmed = true;
        try {
          if (typeof window.confirm === 'function') confirmed = window.confirm(t('action.removeConfirm'));
        } catch (_error) {
          confirmed = true;
        }
        if (confirmed !== true) return;
        setHoldings(function drop(current) {
          return current.filter(function keep(item) {
            return item.sid !== sid;
          });
        });
        if (expandedSid === sid) setExpandedSid(null);
        if (editing === sid) cancelEdit();
      }

      function submit(event) {
        if (event !== null && event !== undefined && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        const symbol = String(draft.symbol || '').trim().toUpperCase();
        const sharesText = String(draft.shares || '').replace(/,/g, '').trim();
        const costText = String(draft.cost || '').replace(/,/g, '').trim();
        const shares = Number(sharesText);
        const cost = Number(costText);
        if (symbol === '') {
          setFormError(t('invalid.symbol'));
          return;
        }
        if (!Number.isFinite(shares) || shares <= 0) {
          setFormError(t('invalid.shares'));
          return;
        }
        if (!Number.isFinite(cost) || cost < 0) {
          setFormError(t('invalid.cost'));
          return;
        }
        // A picked suggestion carries the canonical feed id; typing a code by
        // hand falls back to the code itself.
        const sid = picked !== null && picked.code === symbol ? picked.sid : symbol;
        setFormError(null);
        setHoldings(function merge(current) {
          const next = current.slice();
          const at = next.findIndex(function same(item) {
            return item.sid === sid || item.symbol === symbol;
          });
          if (at >= 0) next[at] = { sid, symbol, shares, cost };
          else next.push({ sid, symbol, shares, cost });
          return next;
        });
        setEditing(null);
        setDraft({ symbol: '', shares: '', cost: '' });
        setPicked(null);
        setSuggestions([]);
        setSuggestStatus('idle');
        setSuggestOpen(false);
        setActiveIndex(-1);
      }

      const loading = status === 'loading';
      // A 1-second poll keeps the request in flight most of the time; only the
      // first quote load should read as "loading" in the panel header.
      const initialLoading = loading === true && Object.keys(quotes).length === 0;
      const empty = holdings.length === 0;
      const editedRow = editing !== null ? editing : null;

      const partialNote = totals.partial === true ? t('summary.partial') : null;
      const pnlText =
        totals.pnl === null ? '—' : formatSigned(totals.pnl, 2) + '  ' + formatPercent(totals.pnlPct);

      const summary = h(
        'div',
        { className: 'sp-summary' },
        SummaryCard(t('summary.marketValue'), formatNumber(totals.marketValue, 2), '', partialNote),
        SummaryCard(t('summary.cost'), formatNumber(totals.costBasis, 2), '', partialNote),
        SummaryCard(t('summary.pnl'), pnlText, tone(totals.pnl), null),
        SummaryCard(t('summary.today'), formatSigned(totals.today, 2), tone(totals.today), null),
      );

      const form = h(
        'form',
        { className: 'sp-form', onSubmit: submit },
        h(
          'label',
          { className: 'sp-field' },
          h('span', null, t('form.symbol')),
          h(
            'div',
            { className: 'sp-combo' },
            h('input', {
              className: 'sp-input sp-input-symbol',
              type: 'text',
              value: draft.symbol,
              placeholder: t('form.symbolPlaceholder'),
              autoComplete: 'off',
              spellCheck: false,
              readOnly: editedRow !== null,
              role: 'combobox',
              'aria-label': t('form.symbol'),
              'aria-expanded': suggestOpen === true ? 'true' : 'false',
              'aria-controls': 'sp-suggest-list',
              'aria-autocomplete': 'list',
              'aria-activedescendant': suggestOpen === true && activeIndex >= 0 ? 'sp-suggest-' + String(activeIndex) : undefined,
              onChange: onSymbolChange,
              onFocus: onSymbolFocus,
              onBlur: onSymbolBlur,
              onKeyDown: onSymbolKeyDown,
            }),
            suggestOpen === true && editedRow === null
              ? h(
                  'div',
                  { className: 'sp-combo-list', id: 'sp-suggest-list', role: 'listbox' },
                  suggestStatus === 'loading'
                    ? h('div', { className: 'sp-combo-empty' }, t('search.searching'))
                    : suggestStatus === 'error'
                      ? h('div', { className: 'sp-combo-empty' }, t('search.error'))
                      : suggestions.length === 0
                        ? h('div', { className: 'sp-combo-empty' }, t('search.empty'))
                        : suggestions.map(function renderOption(item, index) {
                            return h(
                              'div',
                              {
                                key: item.sid,
                                id: 'sp-suggest-' + String(index),
                                role: 'option',
                                'aria-selected': index === activeIndex ? 'true' : 'false',
                                'data-active': index === activeIndex ? 'true' : 'false',
                                className: 'sp-combo-option',
                                onMouseDown: function pick(event) {
                                  event.preventDefault();
                                  chooseSuggestion(item);
                                },
                                onMouseEnter: function hover() {
                                  setActiveIndex(index);
                                },
                              },
                              h('span', { className: 'sp-combo-name' }, item.name),
                              h('span', { className: 'sp-combo-code' }, item.code),
                              typeof item.kind === 'string' && item.kind !== ''
                                ? h('span', { className: 'sp-combo-badge' }, item.kind)
                                : null,
                            );
                          }),
                )
              : null,
          ),
        ),
        h(
          'label',
          { className: 'sp-field' },
          h('span', null, t('form.shares')),
          h('input', {
            className: 'sp-input',
            type: 'number',
            min: '0',
            step: 'any',
            inputMode: 'decimal',
            value: draft.shares,
            placeholder: '100',
            ref: sharesRef,
            'aria-label': t('form.shares'),
            onChange: function changeShares(event) {
              setDraft({ symbol: draft.symbol, shares: event.target.value, cost: draft.cost });
            },
          }),
        ),
        h(
          'label',
          { className: 'sp-field' },
          h('span', null, t('form.cost')),
          h('input', {
            className: 'sp-input',
            type: 'number',
            min: '0',
            step: 'any',
            inputMode: 'decimal',
            value: draft.cost,
            placeholder: '10.00',
            'aria-label': t('form.cost'),
            onChange: function changeCost(event) {
              setDraft({ symbol: draft.symbol, shares: draft.shares, cost: event.target.value });
            },
          }),
        ),
        h('button', { type: 'submit', className: 'sp-btn sp-btn-primary' }, editedRow !== null ? t('form.save') : t('form.submit')),
        editedRow !== null
          ? h('button', { type: 'button', className: 'sp-btn', onClick: cancelEdit }, t('form.cancel'))
          : null,
        formError !== null ? h('span', { className: 'sp-form-error', role: 'alert' }, formError) : null,
      );

      const thead = h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, t('table.name')),
          h('th', null, t('table.price')),
          h('th', null, t('table.changePct')),
          h('th', null, t('table.todayPnl')),
          h('th', null, t('table.trend')),
          h('th', null, t('table.shares')),
          h('th', null, t('table.cost')),
          h('th', null, t('table.marketValue')),
          h('th', null, t('table.pnl')),
          h('th', null, t('table.return')),
          h('th', null, t('table.actions')),
        ),
      );

      const tbody = h(
        'tbody',
        null,
        rows.map(function renderRow(row) {
          const noQuote = row.missing === null ? null : t('state.noQuote');
          const expanded = expandedSid === row.sid;
          const summary = row.trend !== null ? trendSummary(row.trend, row.price) : null;
          const hasAvg = row.trend !== null && Array.isArray(row.trend.points) && row.trend.points.some(function withAverage(point) {
            return Array.isArray(point) && typeof point[2] === 'number' && point[2] > 0;
          });
          const trendTitle = summary === null ? t('trend.none') : fillTrendStats(t('trend.stats'), summary);
          const cells = h(
            'tr',
            { key: row.sid },
            h(
              'td',
              null,
              h(
                'span',
                { className: 'sp-name' },
                h('span', { className: 'sp-name-text' }, row.name !== null ? row.name : row.symbol),
                h('span', { className: 'sp-name-code' }, noQuote === null ? row.symbol : row.symbol + ' · ' + noQuote),
              ),
            ),
            h('td', { className: tone(row.changePct) }, row.price === null ? '—' : formatNumber(row.price, 2)),
            h('td', { className: tone(row.changePct) }, formatPercent(row.changePct)),
            h('td', { className: tone(row.todayPnl) }, formatSigned(row.todayPnl, 2)),
            h(
              'td',
              { className: 'sp-trend-cell' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'sp-trend-btn',
                  title: trendTitle,
                  'aria-label': expanded === true ? t('trend.collapse') : t('trend.expand'),
                  'aria-expanded': expanded === true ? 'true' : 'false',
                  onClick: function toggleTrend() {
                    setExpandedSid(expanded === true ? null : row.sid);
                  },
                },
                row.trend !== null
                  ? h(TrendChart, {
                      points: row.trend.points,
                      prevClose: row.trend.prevClose,
                      livePrice: row.price,
                      width: 150,
                      height: 32,
                      expanded: false,
                      avgLabel: t('trend.avgShort'),
                    })
                  : h('span', { className: 'sp-muted' }, t('trend.none')),
              ),
            ),
            h('td', null, formatFlexible(row.shares, 4)),
            h('td', null, formatFlexible(row.cost, 4)),
            h('td', null, formatNumber(row.marketValue, 2)),
            h('td', { className: tone(row.pnl) }, formatSigned(row.pnl, 2)),
            h('td', { className: tone(row.pnlPct) }, formatPercent(row.pnlPct)),
            h(
              'td',
              { className: 'sp-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'sp-btn sp-btn-ghost',
                  onClick: function onEdit() {
                    startEdit(row);
                  },
                },
                t('action.edit'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sp-btn sp-btn-ghost sp-btn-danger',
                  onClick: function onRemove() {
                    removeHolding(row.sid);
                  },
                },
                t('action.remove'),
              ),
            ),
          );
          if (expanded === false) return cells;
          const detailTone = row.trend !== null
            ? sparkToneClass(sparkGeometry(row.trend.points, row.trend.prevClose, row.price, 1, 150))
            : 'sp-spark-flat';
          return h(
            React.Fragment,
            { key: row.sid + ':detail' },
            cells,
            h(
              'tr',
              { className: 'sp-expanded-row' },
              h(
                'td',
                { className: 'sp-expanded-cell', colSpan: 11 },
                h(
                  'div',
                  { className: 'sp-trend-detail' },
                  h('div', { className: 'sp-trend-stats' }, fillTrendStats(t('trend.stats'), summary)),
                  row.trend !== null
                    ? h(
                        'div',
                        { className: 'sp-trend-legend' },
                        h(
                          'span',
                          { className: 'sp-legend-item' },
                          h('span', { className: 'sp-legend-line ' + detailTone }),
                          t('trend.legendPrice'),
                        ),
                        hasAvg === true
                          ? h(
                              'span',
                              { className: 'sp-legend-item' },
                              h('span', { className: 'sp-legend-line sp-legend-avg' }),
                              t('trend.legendAvg'),
                            )
                          : null,
                      )
                    : null,                  row.trend !== null
                    ? h(
                        'div',
                        { className: 'sp-trend-plot' },
                        h(
                          'div',
                          { className: 'sp-trend-scale' },
                          trendAxisLabels(row.trend, row.price, 150, t).map(function renderLabel(label) {
                            return h('span', { key: label.key, style: { top: label.top.toFixed(2) + '%' } }, label.text);
                          }),
                        ),
                        h(
                          'div',
                          { className: 'sp-trend-canvas' },
                          h(
                            'div',
                            { className: 'sp-trend-chart' },
                            h(TrendChart, {
                              points: row.trend.points,
                              prevClose: row.trend.prevClose,
                              livePrice: row.price,
                              width: 640,
                              height: 150,
                              expanded: true,
                              avgLabel: t('trend.avgShort'),
                            }),
                          ),
                          summary !== null
                            ? h(
                                'div',
                                { className: 'sp-trend-axis' },
                                h('span', null, summary.firstLabel),
                                h('span', null, summary.midLabel),
                                h('span', null, summary.lastLabel),
                              )
                            : null,
                        ),
                      )
                    : h('span', { className: 'sp-muted' }, t('trend.none')),
                ),
              ),
            ),
          );
        }),
      );

      const body = empty
        ? h(
            'div',
            { className: 'sp-empty' },
            h('div', { className: 'sp-empty-title' }, t('state.emptyTitle')),
            h('p', { className: 'sp-empty-hint' }, t('state.emptyHint')),
          )
        : h('div', { className: 'sp-scroll' }, h('table', { className: 'sp-table' }, thead, tbody));

      return h(
        'div',
        { className: 'sp-root' },
        h('style', null, STYLE),
        h(
          'div',
          { className: 'sp-wrap' },
          h(
            'header',
            { className: 'sp-header' },
            h('div', null, h('h1', { className: 'sp-title' }, t('title')), h('p', { className: 'sp-sub' }, t('subtitle'))),
            h(
              'div',
              { className: 'sp-toolbar' },
              h(
                'label',
                { className: 'sp-field' },
                h('span', null, t('auto.label')),
                h(
                  'select',
                  {
                    className: 'sp-select',
                    value: String(autoMs),
                    title: t('auto.hint'),
                    'aria-label': t('auto.label'),
                    onChange: function changeAuto(event) {
                      const next = Number(event.target.value);
                      setAutoMs(AUTO_CHOICES.indexOf(next) >= 0 ? next : 0);
                    },
                  },
                  h('option', { value: '0' }, t('auto.off')),
                  h('option', { value: '1000' }, t('auto.1')),
                  h('option', { value: '30000' }, t('auto.30')),
                  h('option', { value: '60000' }, t('auto.60')),
                  h('option', { value: '120000' }, t('auto.120')),
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'sp-btn',
                  disabled: loading,
                  title: t('action.refresh'),
                  onClick: function onRefresh() {
                    refresh();
                  },
                },
                t('action.refresh'),
              ),
            ),
          ),
          status === 'too-many' || holdings.length > MAX_HOLDINGS
            ? h(
                'div',
                { className: 'sp-banner', role: 'alert' },
                h('span', null, fillMax(t('state.tooMany'), MAX_HOLDINGS)),
              )
            : status === 'error'
              ? h(
                  'div',
                  { className: 'sp-banner', role: 'alert' },
                  h('span', null, fillDetail(t('state.error'), errorText === null ? '' : errorText)),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'sp-btn',
                      onClick: function onRetry() {
                        refresh();
                      },
                    },
                    t('state.retry'),
                  ),
                )
              : null,
          summary,
          h(
            'section',
            { className: 'sp-panel' },
            h(
              'div',
              { className: 'sp-panel-head' },
              h('span', null, editedRow !== null ? t('form.editing') : t('form.add')),
              h(
                'span',
                null,
                initialLoading === true ? t('state.loading') : withCount(t('state.count'), holdings.length),
              ),
            ),
            form,
            body,
          ),
          h(
            'footer',
            { className: 'sp-foot' },
            h('span', null, t('state.foot')),
            h('span', null, updatedAt > 0 ? t('state.updated').split('{time}').join(formatClock(updatedAt)) : ''),
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          function registerDictionaries() {
            try {
              return ctx.locale.register(NS, { zh: ZH, en: EN });
            } catch (_error) {
              return function noopDictionaries() {};
            }
          },
          'dsh-stock-panel: dictionaries',
        );

        let boundText = null;
        function sidebarLabel() {
          try {
            if (boundText === null) boundText = ctx.locale.bind(NS);
            const text = boundText('nav.label');
            if (typeof text === 'string' && text.length > 0 && text !== 'nav.label') return text;
          } catch (_error) {
            /* Fall back to the literal user-facing label. */
          }
          return '自选持仓';
        }

        // One `main` declaration lifetime owns the panel; the sidebar row is a
        // separate declaration lifetime so either seat can appear on its own
        // without ever leaving a row that points at a missing panel.
        function acquirePanel() {
          let mainDispose = null;
          try {
            mainDispose = ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, StockPanel);
          } catch (_error) {
            return function noopPanel() {};
          }
          let sidebarController = null;
          try {
            sidebarController = ctx.slots.inject('sidebar.panellist', function acquireRow() {
              let rowDispose = null;
              try {
                rowDispose = ctx.slots.register(
                  { name: 'sidebar.panellist', id: PANEL_ID, order: SIDEBAR_ORDER, label: sidebarLabel, locale: NS },
                  SidebarIcon,
                );
              } catch (_error) {
                return function noopRow() {};
              }
              return function disposeRow() {
                try {
                  rowDispose();
                } catch (_error) {
                  /* Already disposed with its declaration. */
                }
              };
            });
          } catch (_error) {
            sidebarController = null;
          }
          return function disposePanel() {
            if (sidebarController !== null) {
              try {
                sidebarController();
              } catch (_error) {
                /* Ignore a declaration that already collapsed. */
              }
            }
            try {
              mainDispose();
            } catch (_error) {
              /* Ignore a declaration that already collapsed. */
            }
          };
        }

        try {
          ctx.slots.inject('main', acquirePanel);
        } catch (_error) {
          /* The seat is unavailable in this shell; nothing to render. */
        }
      },
    };
  },
});
