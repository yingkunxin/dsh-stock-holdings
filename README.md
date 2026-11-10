# dsh-stock-panel

在 DeepSeek Harness（dsh）里管理自选持仓：填写数量与成本价，自动获取行情，
实时看市值、盈亏、收益率和当日分时走势。

A holdings panel for DeepSeek Harness: enter shares and cost basis, get live
quotes, market value, profit and loss, and today's intraday chart.

## 功能 / Features

- **持仓管理**：代码/名称/拼音搜索（A 股、港股、美股），填写数量与成本价，随时编辑、删除
- **收益计算**：逐只与合计的市值、成本、盈亏、收益率；逐只与合计的今日盈亏（按昨收）
- **行情刷新**：手动刷新 + 自动刷新（1 秒 / 30 秒 / 1 分钟 / 2 分钟），1 秒轮询时请求不堆叠
- **今日分时**：每只持仓的当日走势迷你图，点击展开大图；纵轴以昨收为基准显示涨跌幅与对应股价；悬停显示时间、价格、涨跌幅与均价；展开图叠加日均价线
- **本地数据**：持仓与偏好只存在当前浏览器 localStorage，不上传、不写入会话
- **中英文界面**：跟随 dsh 语言设置

- Holdings search by code / name / pinyin (A-shares, HK, US), with shares and cost basis
- Per-row and total market value, cost, P/L, return, and today's P/L
- Manual and automatic refresh (1 s / 30 s / 1 min / 2 min)
- Today's intraday sparkline per holding; click for a larger chart with a
  previous-close baseline, percentage + price axis, hover crosshair, and the
  day-average line
- Holdings stay in this browser's localStorage; nothing is uploaded

## 安装 / Install

从 GitHub 仓库安装（把 `<owner>/<repo>` 换成实际仓库）：

```bash
dsh plugin add github:<owner>/<repo>
```

已发布到 npm 时也可以直接按包名安装：

```bash
dsh plugin add dsh-stock-panel
```

安装后在左侧栏打开「自选持仓」。

Install from the GitHub repository (`<owner>/<repo>` = this repo), or by package
name once it is published to npm. Then open **Portfolio** in the left sidebar.

## 数据来源 / Data source

- 行情与分时来自东方财富公开行情接口，由插件 Host 端在本机代理请求；页面不直连第三方站点
- 行情可能延迟，仅供参考，不构成投资建议
- Quotes and intraday series come from Eastmoney's public market endpoints,
  proxied by the plugin's Host half on this machine. Data may be delayed; for
  reference only, not investment advice.

## 隐私 / Privacy

- 持仓、数量、成本与界面偏好仅保存在浏览器 localStorage
- 插件不上传任何用户数据；对外请求只包含要查询的证券代码
- 无安装脚本、无运行时依赖

## 兼容性 / Compatibility

- 需要 dsh `>= 0.2.1-rc.5`（bundle manifest 版本 1）
- 纯 ESM，无需构建步骤

## 许可 / License

MIT
