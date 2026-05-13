# Firefox Sidebar Helper

独立 Firefox WebExtension，用于生成邮箱、获取/复制验证码、设置 Firefox 代理、获取 Stripe PayURL，并在 Stripe 支付页填充卡片信息。

## 临时加载

1. Firefox 打开 `about:debugging#/runtime/this-firefox`
2. 点击 `Load Temporary Add-on...`
3. 选择本目录里的 `manifest.json`
4. 从 Firefox 侧边栏入口打开 `GPT Helper`

## 使用

- 点击 `生成` 会为内置 10 个域名生成同一随机前缀的邮箱。
- 选中邮箱后点击 `获取验证码`，会轮询 `https://getemail.nnai.website/api/code` 最多 3 次；取到后可点 `复制验证码`。
- 在代理分组先输入 `Webshare API Key`，再选择 `http` 或 `socks5` 协议；替换代理时可选择美国 `US` 或日本 `JP`。点击 `获取当前` 或 `替换代理` 后，扩展会直接调用 Webshare 官方接口，并按 Firefox `proxy.settings` 官方写法把 `host:port` 一起写入对应协议字段，端口使用接口返回的 `port`；如果接口没返回 `port`，会直接报错。`设置代理` 会重新应用当前缓存代理，`清除代理` 只会清除 Firefox 当前代理。
- 获取到代理后，页面会显示 `用户名`、`密码`、`city_name`、`country_code`；代理设置成功后会查询当前出口 IP 的 `address`、`city`、`state`、邮编，并支持整段或单项复制。
- 在已登录的 `https://chatgpt.com` 标签页点击 `获取并打开`，会读取 session accessToken，调用 `https://payurl.779.chat/api/request`，并打开返回的 Stripe 链接。
- 在 Stripe 支付页输入卡片文本后点击 `输出/填充`，会填入页面里的卡号、有效期、CVV、账单姓名和地址，并勾选服务条款。

卡片格式：

```text
card----年/月----cvv----phone----url----name----address,city state postcode,US
```

## 签名

`manifest.json` 已包含固定 Gecko ID：`gpt-auto-register-helper@example.local`，用于 Firefox 扩展签名时保持插件身份稳定。

签名需要 Mozilla Add-ons API 凭据，可用 `web-ext` 执行：

```bash
npx web-ext sign --source-dir firefox-extension --channel unlisted --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
```

## 订单接口数据转换

如果拿到的订单接口数据是 JSON 数组 txt 文件，可以用 `convert_order_txt.py` 转成一行一个账号信息：

```text
邮箱----密码----client_id----refresh_token
```

默认输出文件会生成在输入文件同目录，文件名为 `<原文件名>_converted.txt`。

```powershell
python .\convert_order_txt.py "order_19abca06-a0eb-40a2-b09a-43a1b0acff9e (1).txt"
```

也可以手动指定输出文件：

```powershell
python .\convert_order_txt.py "input.txt" -o "output.txt"
```
