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

首次创建站长账号前，把 `.dev.vars.example` 复制为 `.dev.vars`，将
`OWNER_SETUP_TOKEN` 改成一个足够长的随机值，然后访问 `/register`。站长账号创建后，
注册入口会永久关闭；后续直接使用 `/login`。

## 通过 GitHub 部署到 Cloudflare

1. 在 Cloudflare 控制台创建名为 `monolog-db` 的 D1 数据库，把数据库 UUID 填入
   `wrangler.jsonc` 的 `database_id`，提交并推送到 GitHub 的 `main` 分支。

2. 在 Workers & Pages 中选择 **Create application → Import a repository**，连接该 GitHub
   仓库。Worker 名称必须为 `monolog`，与 `wrangler.jsonc` 中的 `name` 一致。

3. 使用以下构建设置：

   - Production branch：`main`
   - Root directory：`/`
   - Build command：`npm test && npm run typecheck`
   - Deploy command：`npm run deploy`

   `npm run deploy` 会依次应用尚未执行的远程 D1 迁移、构建前端并部署 Worker。

4. 在 Worker 的 Variables and Secrets 设置中添加加密 Secret：
   `OWNER_SETUP_TOKEN`。使用足够长的随机值，不要把真实值提交到 GitHub。

5. 首次部署完成后访问 `/register` 创建站长账号。确认可以登录后，在控制台删除
   `OWNER_SETUP_TOKEN`；数据库会继续阻止创建第二个账号。

## 技术说明

- 密码使用 Web Crypto PBKDF2-SHA256 加盐哈希，不保存明文。
- 登录令牌只放在 `HttpOnly`、`SameSite=Lax` Cookie 中；D1 只保存令牌摘要。
- 注册仅用于创建首个站长账号，并由 `OWNER_SETUP_TOKEN` 保护。
- 登录和初始化注册按来源地址限流。
- 草稿只能由作者读取，公开 API 只返回已发布文章。
- 文章正文按纯文本保存和展示，不执行用户输入的 HTML。
