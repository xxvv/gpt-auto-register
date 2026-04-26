# Cloudflare 邮件 Worker

这个 Worker 用来接收 Cloudflare Email Routing 转发过来的邮件，并把邮件内容写入 D1 数据库：

- 数据库名称：`xxvv`
- 数据库 UUID：`e16842e6-73c6-4774-9d40-72d5d26d19e9`
- Worker 里的 D1 绑定名：`DB`

它同时提供一个邮件列表页面，以及一个获取最新邮件验证码的 API。

## 文件说明

- `src/index.js`：Worker 主脚本，包含邮件接收、页面展示和 HTTP API。
- `wrangler.toml`：Worker 配置文件，已经配置好 D1 数据库绑定。
- `schema.sql`：D1 建表和索引 SQL。
- `migrations/0001_email_messages.sql`：Wrangler migration 格式的建表 SQL。

## 部署步骤

```bash
cd cloudflare-email-worker
npm install
npm run schema:remote
npm run deploy
```

部署完成后，到 Cloudflare 控制台的 Email Routing 页面，把目标邮箱地址或 catch-all 地址转发到这个 Worker。

## 页面和接口

邮件列表页面：

```text
https://<worker-host>/inbox?email=xxx@mail.com
```

邮件列表 API：

```text
https://<worker-host>/api/messages?email=xxx@mail.com
```

邮件详情 API：

```text
https://<worker-host>/api/messages/<id>
```

获取 5 分钟内最新验证码，直接返回纯文本验证码：

```text
https://<worker-host>/api/code?email=xxx@mail.com
```

获取 5 分钟内最新验证码，返回 JSON：

```text
https://<worker-host>/api/code?email=xxx@mail.com&format=json
```

`/api/code` 只会检查当前邮箱最近 5 分钟内收到的邮件。如果没有找到验证码，会返回 `code_not_found`。

## 可选访问保护

如果不想让页面和 API 公开访问，可以给 Worker 设置一个 secret：

```bash
wrangler secret put ACCESS_TOKEN
```

设置后，访问页面或 API 时需要二选一：

```text
Authorization: Bearer <token>
```

或者：

```text
?token=<token>
```
