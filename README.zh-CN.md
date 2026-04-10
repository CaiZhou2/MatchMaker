<p align="center">
  <img src="web/logo.png" alt="MatchMaker logo" width="200">
</p>

# MatchMaker

**Languages**: [English](README.md) · 简体中文

🔗 **在线访问**：**[CaiZhou2.github.io/MatchMaker](https://CaiZhou2.github.io/MatchMaker/)** —— 直接在手机浏览器打开，添加到主屏幕，开始用。

一个手机友好的 Progressive Web App，用于安排每周的团队杯赛。MatchMaker 维护持久化的选手名单，根据历史胜率自动抽取平衡的队伍，智能推荐合适的赛制，运行比赛，并跨周记录积分和消费 —— 完全在手机浏览器里运行，无需安装，无需账号。

> **仅限非商业用途。** 详见 [LICENSE](LICENSE)。

> ⭐ **如果 MatchMaker 对你的小组有帮助，恳请给项目点一个 star** —— 这是帮助其他组织者发现这个工具最简单的方式，对你没有任何成本。谢谢！

📖 **只是想用它办比赛？** 不用看下面的开发者文档，直接读 [**组织者快速上手指南**](docs/ORGANIZER_GUIDE.zh-CN.md) —— 写给非技术用户的，10 分钟从零跑完第一场比赛。

---

## 功能特性

- **多项目管理**：管理多个独立的比赛环境（如"周二羽毛球"、"周末篮球"），每个项目有独立的选手、历史和排行榜。支持一键导出/导入所有项目
- **每周杯赛流程**：选择参赛者 → 自动组队 → 比赛 → 录入结果 → 提交
- **平衡组队**：按胜率排名前 `N` 的选手作为队长，其余蛇形抽签 + 随机填充（[算法细节](docs/ARCHITECTURE.zh-CN.md)）
- **5 种比赛模式**：**自动**（推荐）、**小组赛 + 淘汰赛**、**纯循环赛**、**纯淘汰赛**、**纯友谊赛**（不计积分但更新胜率）
- **仅记录模式**：跳过组队，手动逐场添加比赛卡片，选队员，逐场选择是否计入积分。所有卡片在"完成 & 提交所有比赛"之前都可随时编辑
- **淘汰赛友谊场**：为淘汰队伍保留一个场地
- **积分榜 + 胜率榜**：`胜 = 3 分`，`平 = 1 分`，`负 = 0 分`
- **比赛预测**：选择两队选手，查看胜/平/负概率预测 —— 优先使用对位数据，不足时回退到综合胜率
- **消费追踪**：场地费均摊、累计消费、双确认清零 + 恢复
- **比赛安排分享**：一键复制文本到微信 / Telegram
- **历史归档**：每场完成的比赛都保存完整细节
- **数据导入/导出**：完整 JSON 备份/恢复
- **离线 PWA** · **多语言**（zh-CN / en-US）· **无后端**

## 快速开始

### 本地运行

```bash
git clone https://github.com/<your-user>/MatchMaker.git
cd MatchMaker/web
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

任何静态服务器都可以。

### 安装到手机（PWA）

**最简单的方式：** 在手机浏览器打开 **<https://CaiZhou2.github.io/MatchMaker/>**，然后按下面步骤安装。

<details>
<summary><strong>或者自己部署一份</strong></summary>

| 方案 | 费用 | 说明 |
| --- | --- | --- |
| **GitHub Pages** | 免费 | Fork 仓库，启用 Pages（Source = "GitHub Actions"）|
| **Cloudflare Pages** | 免费 | 连接 fork，输出目录 `web` |
| **Netlify / Vercel** | 免费 | 拖拽 `web/` 到控制台 |
| **局域网自建** | 免费 | 同 Wi-Fi 下 `python3 -m http.server` |

> ⚠️ PWA 需要 HTTPS（`localhost` 除外）。

</details>

**iOS（Safari）：** 分享 → 添加到主屏幕 → 从图标启动。
**Android（Chrome）：** ⋮ 菜单 → 安装应用 → 从图标启动。

---

## 文档

| 文档 | 面向 |
| --- | --- |
| [组织者快速上手指南](docs/ORGANIZER_GUIDE.zh-CN.md) | 非技术用户 |
| [架构与算法](docs/ARCHITECTURE.zh-CN.md) | 开发者 |

所有文档提供 [English](docs/) 和 [简体中文](docs/) 两种语言版本。

---

## 测试

使用 Node 内建的 `node:test` 运行器（Node 18+）—— 零依赖。

```bash
node --test tests/*.test.js
# 或：node --test
```

## 贡献

业余项目，欢迎非商业性的 bug 修复和功能改进。衍生作品必须保持非商业性。

## 许可证

[PolyForm Noncommercial License 1.0.0](LICENSE)。个人使用、业余项目、教育机构、慈善机构、公共研究组织都可使用。**禁止商业用途。**
