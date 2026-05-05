# Firefox Sidebar Helper

独立 Firefox WebExtension，用于生成邮箱、获取验证码、获取 Stripe PayURL，并在 Stripe 支付页填充卡片信息。

## 临时加载

1. Firefox 打开 `about:debugging#/runtime/this-firefox`
2. 点击 `Load Temporary Add-on...`
3. 选择本目录里的 `manifest.json`
4. 从 Firefox 侧边栏入口打开 `GPT Helper`

## 使用

- 点击 `生成` 会为内置 10 个域名生成同一随机前缀的邮箱。
- 选中邮箱后点击 `获取验证码`，会轮询 `https://getemail.nnai.website/api/code` 最多 3 次。
- 在已登录的 `https://chatgpt.com` 标签页点击 `获取并打开`，会读取 session accessToken，调用 `https://payurl.779.chat/api/request`，并打开返回的 Stripe 链接。
- 在 Stripe 支付页输入卡片文本后点击 `输出/填充`，会填入页面里的卡号、有效期、CVV、账单姓名和地址，并勾选服务条款。

卡片格式：

```text
card----年/月----cvv----phone----url----name----address,city state postcode,US
```
