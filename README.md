# Steam Market Listings Group

在 Steam 市场饰品详情页聚合显示已上架物品，按上架日期与价格分组，替代 Steam 默认的列表 UI。

## 功能

- **上架汇总面板** — 表格展示每日上架数量及价格分布
- **分组详情视图** — 按日期 → 价格 → 单件物品三级展开，显示上架时间、资产 ID、买家价格与卖家收入
- **批量下架** — 按价格筛选并指定数量，一键批量下架，操作完成后面板自动刷新
- **面板折叠/展开** — 可自由收起汇总面板

## 安装

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)
2. 点击 [steam-market-listings-group.user.js](https://github.com/rayroad/-steam-market-listings-group/raw/master/steam-market-listings-group.user.js) 直接安装
3. 访问 Steam 社区市场饰品详情页即可生效

## 技术

- 单文件 IIFE 架构，无构建步骤，无外部依赖
- 通过 `unsafeWindow.SSR.loaderData` 读取 Steam SSR 数据，无需额外网络请求
- UI 适配 Steam 深色主题，界面语言为中文
- 内置 XSS 防护与面板被页面移除后的自动重注入机制

## 许可

MIT
