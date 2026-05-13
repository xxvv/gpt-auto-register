# Chrome Side Panel Helper

独立 Chrome 扩展，用于生成邮箱、获取/复制验证码、设置 Chrome 代理、获取 Stripe PayURL，并在 Stripe 支付页填充卡片信息。

## 临时加载

1. Chrome 打开 `chrome://extensions`
2. 打开右上角 `开发者模式`
3. 点击 `加载已解压的扩展程序`
4. 选择本目录 `chrome-extension`
5. 点击工具栏里的扩展图标打开 `GPT Helper` 侧边栏

## 使用

- 点击 `生成` 会为内置 10 个域名生成同一随机前缀的邮箱。
- 选中邮箱后点击 `获取验证码`，会轮询 `https://getemail.nnai.website/api/code` 最多 3 次；取到后可点 `复制验证码`。
- 在代理分组中点击 `获取当前` 或 `替换代理`，会调用本机 `http://127.0.0.1:8888` 的 Webshare 接口，并优先取 HTTP 鉴权代理后设置到 Chrome。`设置代理` 会重新应用当前缓存代理，`清除代理` 会清除 Chrome 代理和后端当前任务代理。
- 也可以在 `手动代理` 输入框直接粘贴 `http://username:password@host:port`，点击 `应用手动代理` 后会同时写入 Chrome 代理和本地任务代理，不依赖浏览器弹用户名密码框。
- 在已登录的 `https://chatgpt.com` 标签页点击 `获取并打开`，会读取 session accessToken，调用 `https://payurl.779.chat/api/request`，并打开返回的 Stripe 链接。
- 在 Stripe 支付页输入卡片文本后点击 `输出/填充`，会填入页面里的卡号、有效期、CVV、账单姓名和地址。

卡片格式：

```text
card----年/月----cvv----phone----url----name----address,city state postcode,US
```
