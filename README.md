# OmniBlog / 万象志

一个基于项目内 Apple Editorial 设计规范实现的双语个人博客。使用 React、React Router、Markdown、GSAP 与 Cloudflare Workers Static Assets。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mibgb65-cloud/OmniBlog)

点击按钮会在你的 GitHub 账户中创建一份仓库副本，并通过 Workers Builds 部署；D1 与 R2 会在配置过程中创建。部署页面会要求填写 `STUDIO_TOKEN`，`ADMIN_TOKEN` 仅在需要从命令行上传图片时配置。请为它们使用不同的随机长密码。

## 本地运行

```bash
npm install
npm run dev
```

包含 D1 订阅接口与 R2 图片接口的完整 Cloudflare 本地环境：

```bash
Copy-Item .dev.vars.example .dev.vars
# 将 .dev.vars 中的 STUDIO_TOKEN 与 ADMIN_TOKEN 换成不同的随机长密码
npm run cf:dev
```

生产构建：

```bash
npm run build
npm run preview
```

## 路由

- `/zh`、`/en`：首页
- `/zh/stories`、`/en/stories`：文章索引与全文搜索
- `/:locale/stories/category/:categoryId`：分类文章
- `/:locale/stories/:slug`：文章详情
- `/zh/about`、`/en/about`：关于
- `/studio`：由 Worker Token 登录保护的写作台，不会进入搜索引擎，也不会出现在公开导航中

语言放在 URL 中，便于分享和深链接。亮暗主题保存在浏览器 `localStorage` 中，并默认跟随系统主题。

## 添加文章

目前采用“Markdown 文件即文章”的方式，不需要数据库或后台。最短发布流程是：

1. 使用 `npm run cf:dev` 或已部署域名打开 `/studio`，输入 `STUDIO_TOKEN` 后新建草稿。`npm run dev` 只启动 Vite，不包含 Worker 登录鉴权。
2. 填写发布信息和中文正文，英文版本可以以后补。
3. 在写作台处理封面与正文图片；草稿和图片会一起保存在当前浏览器的 IndexedDB 中，刷新后自动恢复。
4. 点击“下载完整发布包”，得到包含 Markdown、封面和正文图片的 ZIP；把其中的 `content` 与 `public` 目录合并到项目根目录。
5. 运行 `npm run build` 检查；确认后提交到 GitHub，或执行 `npm run deploy` 发布。

写作台侧栏可以备份或恢复全部草稿与图片。浏览器存储不是跨设备云同步，建议定期下载备份 ZIP。

每篇文章可以只有中文，也可以同时提供中英文：

```text
content/articles/my-story.zh.md
content/articles/my-story.en.md
```

Markdown 文件格式：

```md
---
slug: my-story
locale: zh
date: "2026-08-09"
category: design
readMinutes: 6
title: "文章标题"
summary: "文章摘要。"
cover: "/images/articles/my-story/cover.webp"
coverAlt: "准确描述封面内容的替代文字"
---

文章正文。

## 小标题

![图片的替代文字](/images/articles/my-story/detail.webp)
```

有两种语言时，两个文件的 `slug`、`date`、`category` 和 `cover` 必须一致。只有中文时，英文页面会显示明确的原文提示并设置为 `noindex`，等英文文件补齐后会自动恢复完整双语 SEO。

正文支持常用 Markdown 语法：`##` 二级标题会自动进入文章目录，`![替代文字](图片路径)` 会插入正文图片，也可以使用链接、列表、引用和代码块。

可选的标签与系列写在 Front Matter 中：

```yaml
tags: ["界面设计", "注意力"]
series: "界面与注意力"
```

标签和系列会自动生成筛选入口，并用于计算相关文章。

## 添加文章图片

把图片放在：

```text
public/images/articles/<文章 slug>/
```

然后通过 Front Matter 的 `cover` 或标准 Markdown 图片语法引用。支持 SVG、WebP、AVIF、JPEG 和 PNG；摄影图片优先使用 WebP/AVIF，封面建议至少 1600px 宽、比例为 16:9 或 16:10。每张图片都应填写有意义的替代文字。

写作台会在浏览器内自动生成：

- `cover.webp`：1600 × 1000
- `thumbnail.webp`：800 × 500
- `og.webp`：1200 × 630
- 正文图片：最长边不超过 1600px 的 WebP

可以逐个下载、打入完整发布包，也可以在 `npm run cf:dev` 或部署环境中使用当前写作台登录会话直接上传到 R2。

## 添加分类

在 `content/categories.json` 中增加一项：

```json
{
  "id": "photography",
  "name": { "zh": "摄影", "en": "Photography" },
  "description": {
    "zh": "关于影像与观看方式的记录。",
    "en": "Notes on images and ways of seeing."
  }
}
```

然后在文章 Front Matter 中设置 `category: photography`。分类会自动进入筛选导航和中英文分类路由。

## 站点与 SEO 配置

在 `content/site.json` 中替换真实域名、作者和邮箱。`npm run build` 会自动生成：

- 每个中英文页面的独立 HTML 元数据
- Canonical 与 hreflang
- Open Graph、Twitter Card 和 BlogPosting 结构化数据
- `sitemap.xml`
- `rss.xml`
- `robots.txt`

这些生成文件不需要手动维护。

## 部署到 Cloudflare Workers

### 一键部署

使用 README 顶部的 Deploy to Cloudflare 按钮。该方式要求源仓库保持公开，Cloudflare 会读取 `wrangler.jsonc`，配置 Worker，并自动创建所需的 D1 数据库与 R2 存储桶。Secret 只在 Cloudflare 配置页面填写，不会写回公开仓库。

### 命令行部署

首次部署先登录：

```bash
npx wrangler login
npx wrangler secret put STUDIO_TOKEN
npx wrangler secret put ADMIN_TOKEN
```

然后执行：

```bash
npm run deploy
```

`STUDIO_TOKEN` 用于写作台登录并签发 12 小时的 HttpOnly 会话；`ADMIN_TOKEN` 仅保留给命令行或其他工具通过 Bearer Token 上传图片。两者都应使用独立的高强度随机值，不要写入 `wrangler.jsonc` 或提交到仓库。

## 公开仓库安全

- 不要提交 `.dev.vars`、`.env`、API Token、私钥或 Cloudflare 本地状态。
- 仓库只保留 `.dev.vars.example` 中的占位符；真实值使用 Cloudflare Secrets、Workers Builds Secrets 或 GitHub Actions Secrets。
- 提交前运行 `git status`，确认 `.dev.vars`、`.wrangler`、`dist` 和本地备份文件没有进入暂存区。
- 如果 Token 曾出现在提交历史中，应立即在对应平台撤销并重新生成；仅删除文件并不能让旧 Token 失效。

`wrangler.jsonc` 已将 `dist` 配置为 Workers Static Assets，使用自动 HTML 路由并保留 SPA 回退；`/studio`、`/api/*` 与 `/media/*` 会优先进入 Worker，以便在静态页面前完成鉴权。配置方式对应 Cloudflare 的 [Static Assets binding](https://developers.cloudflare.com/workers/static-assets/binding/) 与 [SPA 部署文档](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)。

配置中声明了 `DB`（D1）与 `MEDIA`（R2）绑定但没有写死资源 ID。新版 Wrangler 会在首次部署时自动配置资源，并把资源 ID 写回配置文件。订阅表会在第一次有效订阅时创建。

查看订阅者：

```bash
npx wrangler d1 execute DB --remote --command "SELECT email, locale, created_at FROM subscribers WHERE status = 'active' ORDER BY created_at DESC"
```

Cloudflare Email Service 适合事务邮件，不用于批量营销邮件；订阅者数据已经真实保存，后续发送 Newsletter 时应接入专门的邮件营销服务。

## 访问统计

如果站点已由 Cloudflare 代理，可以直接在 Cloudflare 控制台启用 Web Analytics。也可以把控制台提供的 token 写入 `content/site.json`：

```json
"analytics": {
  "cloudflareToken": "你的 Web Analytics token"
}
```

构建会自动注入 Cloudflare Beacon，并自动跟踪 React Router 的 SPA 路由变化。token 为空时不会加载任何统计脚本。
