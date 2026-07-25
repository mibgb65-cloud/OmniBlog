# MonoLog

一个运行在 Cloudflare Workers + D1 上的轻量个人博客，包含注册登录、会话认证、文章草稿、发布、编辑和删除。前端为 React 单页应用，静态资源和 API 由同一个 Worker 提供。

## 本地运行

需要 Node.js 22+。

```bash
npm install
npm run db:migrate
npm run dev
```

打开终端显示的本地地址。`npm run dev` 会先构建前端，再启动带本地 D1 的 Worker。

## 部署到 Cloudflare

1. 登录并创建 D1：

   ```bash
   npx wrangler login
   npx wrangler d1 create monolog-db
   ```

2. 把命令返回的 `database_id` 填入 `wrangler.jsonc`。

3. 执行远程迁移并部署：

   ```bash
   npm run db:migrate:remote
   npm run deploy
   ```

部署完成后，Wrangler 会输出 `workers.dev` 地址。也可以在 Cloudflare 控制台为 Worker 绑定自定义域名。

## 技术说明

- 密码使用 Web Crypto PBKDF2-SHA256 加盐哈希，不保存明文。
- 登录令牌只放在 `HttpOnly`、`SameSite=Lax` Cookie 中；D1 只保存令牌摘要。
- 草稿只能由作者读取，公开 API 只返回已发布文章。
- 文章正文按纯文本保存和展示，不执行用户输入的 HTML。
