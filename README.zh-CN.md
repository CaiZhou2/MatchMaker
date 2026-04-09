# 🏆 MatchMaker

**Languages**: [English](README.md) · 简体中文

一个手机友好的 Progressive Web App，用于安排每周的团队杯赛。MatchMaker 维护持久化的选手名单，根据历史胜率自动抽取平衡的队伍，智能推荐合适的赛制，运行比赛，并跨周记录积分和消费 —— 完全在手机浏览器里运行，无需安装，无需账号。

> **仅限非商业用途。** 详见 [LICENSE](LICENSE)。

---

## 功能特性

- **每周杯赛流程**：选择参赛者 → 自动组队 → 比赛 → 录入结果 → 提交
- **平衡组队**：按胜率排名前 `N` 的选手作为队长（每队一名），其余选手随机轮询分配
- **赛制自动推荐**：优先小组赛 + 淘汰赛，队伍较少时回退到循环赛，自动尊重时间和场地预算
- **淘汰赛友谊场**：为淘汰队伍保留一个场地用于自由比赛，避免无聊
- **积分榜 + 胜率榜**：`胜 = 3 分`，`平 = 1 分`，`负 = 0 分`
- **消费追踪**：本周总花费自动均摊到参赛者；每人累计消费；双重确认清零 + 下次比赛前可恢复
- **比赛安排分享**：一键复制文本，可粘贴到微信 / Telegram / 其他聊天
- **历史归档**：每场完成的比赛都保存完整细节（队伍、结果、积分/消费变化、姓名快照）
- **数据导入/导出**：完整 JSON 备份/恢复
- **离线使用**：安装为 PWA 后支持离线运行
- **多语言**：自动检测浏览器语言（简体中文或美式英语），支持手动切换
- **无后端**：所有数据本地存储在 `localStorage`

## 快速开始

### 本地运行

只需要一个静态 HTTP 服务器 —— 无需构建，无依赖。

```bash
git clone https://github.com/<your-user>/MatchMaker.git
cd MatchMaker/web
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

任何静态服务器都可以（`python3 -m http.server`、`npx serve`、nginx、caddy、GitHub Pages、Netlify 等）。

### 安装到手机（PWA）

MatchMaker 是一个渐进式 Web 应用（PWA），可以从任何现代手机浏览器"安装"到主屏幕，像原生应用一样使用 —— 离线、全屏、带图标。

**首先，把 `web/` 文件夹部署到手机可以访问的地方。** 最简单的方式：

| 方案 | 费用 | 说明 |
| --- | --- | --- |
| **GitHub Pages** | 免费 | 把 `web/` 推到仓库，启用 Pages，自动提供 HTTPS |
| **Netlify / Vercel (拖拽)** | 免费 | 直接把 `web/` 拖到他们的网页控制台 |
| **本地自建 (局域网)** | 免费 | 在笔记本上跑 `python3 -m http.server`，手机连同一个 Wi-Fi |
| **Cloudflare Pages** | 免费 | 类似 Netlify |

> ⚠️ PWA 需要 **HTTPS**（`localhost` 除外）。GitHub Pages / Netlify / Vercel 都自动提供 HTTPS。

**然后在手机上安装：**

#### iOS（Safari）

1. 用 **Safari** 打开 MatchMaker 的 URL（不要用 Chrome —— iOS 只允许 Safari 安装 PWA）。
2. 点击底部的 **分享** 按钮（带上箭头的方框图标）。
3. 向下滚动，点 **添加到主屏幕**。
4. 输入名称，点 **添加**。
5. 从主屏幕图标启动。应用会全屏打开，没有浏览器外壳。

#### Android（Chrome / Edge / 三星浏览器）

1. 用 Chrome 打开 MatchMaker 的 URL。
2. 点右上角 **⋮** 菜单。
3. 点 **安装应用**（或 **添加到主屏幕**）。
4. 确认。图标会添加到主屏幕和应用抽屉。
5. 从图标启动。

**离线支持**：第一次访问后，Service Worker 会缓存全部资源，之后即使没网络也能使用 MatchMaker。

**数据位置**：所有数据存储在当前设备浏览器的 `localStorage` 里。用应用内的 **导出 JSON** 备份，用 **导入 JSON** 在新设备上恢复。

---

## 使用流程

### 1. 建立选手数据库

- 主页 → **选手数据库** → 输入姓名 → **添加**。
- 每个新选手只需添加一次，数据会跨周累积。

### 2. 开始本周比赛

- 主页 → **开始本周比赛**。
- 勾选本周参赛者。也可以在这里快速添加新选手。
- 设置：
  - **每队人数**
  - **场地数量**
  - **每场时长**（分钟）
  - **总时间限制**（分钟）
  - **本周消费**（¥）—— 提交时均摊到参赛者
- 点 **生成队伍**。

### 3. 审核队伍

- 队长（按胜率排序）带 👑 标记。
- 点 **🔄 重新随机** 再抽一次。
- 点 **🔀 手动调整** 交换两名选手。
- 会显示推荐的赛制（小组赛+淘汰赛，或循环赛）。
- 点 **📋 复制比赛安排** 分享到聊天群。
- 点 **开始比赛** 锁定方案。

### 4. 运行比赛

- 每个时段显示各场地的比赛。
- 点击 **A胜 / 平局 / B胜** 录入结果。
- 所有正赛都录入后，完成按钮会出现。
- 点 **完成比赛 & 更新积分** → 确认 → 积分和消费写入数据库。

### 5. 查看和管理

- 主页 **排行榜**（积分榜 / 胜率榜 / 消费榜 三个 Tab）
- **选手数据库** 查看/删除个人数据
- **历史记录** 展开查看过往比赛细节
- **消费统计** 卡片：总消费 + 清零（双重确认）+ 恢复（下次比赛提交前有效）
- **数据** → **导出 JSON** / **导入 JSON**

---

## 架构

```
MatchMaker/
├── algorithm/          Python 算法原型（算法验证）
│   └── scheduler.py
├── web/                实际应用（PWA）
│   ├── index.html      多视图 SPA 布局
│   ├── style.css
│   ├── i18n.js         翻译模块（zh-CN, en-US）+ 自动检测
│   ├── storage.js      localStorage CRUD + schema 迁移
│   ├── scheduler.js    组队 + 赛制推荐 + 赛程生成
│   ├── app.js          视图路由 + 所有 UI 交互
│   ├── manifest.json   PWA 清单
│   └── sw.js           Service Worker（离线缓存）
├── tests/              node:test 测试 + Python 测试
├── LICENSE             PolyForm Noncommercial 1.0.0
├── README.md           英文版
├── README.zh-CN.md     （本文件）
└── CLAUDE.md           给 AI 助手的项目指南
```

### 数据模型

localStorage 里的键 `matchmaker-data-v1`：

```jsonc
{
  "players": {
    "p_xxx": {
      "id": "p_xxx",
      "name": "张三",
      "points": 30, "wins": 10, "draws": 0, "losses": 0,
      "events": 5,
      "totalSpent": 160.00
    }
  },
  "currentEvent": null | { ... },         // 进行中的比赛
  "history": [ { ... } ],                 // 已完成的比赛（带完整快照）
  "expenseBackup": null | { "p_xxx": 40 } // 清零后的临时备份
}
```

向前迁移逻辑在 `Storage._migrate()` 里 —— 只做加字段，所以老版本数据会在加载时自动升级。

### 算法要点

- **平衡组队**：`T = floor(N / 每队人数)`；胜率前 `T` 名作为队长（一队一位）；其余选手 shuffle 后轮询分配。排序 tiebreaker：比赛场次降序，然后随机。
- **循环赛**：Berger/轮换法，按场地并行化。
- **小组赛 + 淘汰赛**：优先 4 人一组，退化到 3 人；每组前 2 名晋级；构建 2 的幂次淘汰表。淘汰赛时段有空余场地时保留一个用作友谊场。
- **赛制选择**：`T ≥ 4` 时优先小组赛 + 淘汰赛，否则循环赛。如果方案超出时间预算会回退。

## 测试

MatchMaker 使用 Node 内建的 `node:test` 运行器（Node 18+）测试 Web 代码，用纯 Python 测试算法原型 —— 零依赖。

```bash
# JS 单元测试（storage, scheduler, i18n）
node --test tests/*.test.js
# 或从项目根目录直接运行（Node 会自动发现测试文件）：
node --test

# Python 算法原型测试
python3 tests/test_scheduler.py
```

详见 [tests/](tests/)。

## 贡献

这是一个业余项目，但欢迎非商业性的 bug 修复和功能改进。注意许可证：衍生作品必须保持非商业性。

## 许可证

[PolyForm Noncommercial License 1.0.0](LICENSE)。个人使用、业余项目、教育机构、慈善机构、公共研究组织都可使用。**禁止商业用途。**
