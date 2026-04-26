# GPT Auto Register

> ChatGPT 账号批量注册 + Codex Token 自动获取 + Token 池自动推送

基于 Python + Selenium 实现全流程自动化，内置 Web 管理面板，支持 8 个邮箱服务商、并行注册、Codex OAuth Token 自动获取，以及 CLIProxyAPI Token 池一键接入。

## 功能特性

- **全流程自动化** — 临时邮箱创建 → 注册表单填写 → 验证码获取 → 注册完成 → Codex Token 获取，全程无需手动操作
- **Web 控制台** — 可视化管理面板，实时日志、浏览器画面直播、账号管理
- **8 个邮箱服务商** — mail.tm / GPTMail / TempMail.lol / Temporam / Gaggle / 2925 自有邮箱 / OutlookEmail 邮箱池 / NNAI.website，多选时随机使用
- **并行加速** — 可配置并行数（1~10），多线程同时注册
- **Headless 模式** — 支持无界面运行，适合服务器部署
- **Codex OAuth** — 注册成功后自动获取 Codex `access_token` / `refresh_token`
- **CLIProxyAPI 集成** — Token 自动推送到 CLIProxyAPI Token 池（可选）
- **CPA 上传** — 可将生成的 token JSON 自动上传到 CPA 面板（可选）
- **从已有账号补取 Token** — 支持从已注册账号批量补取 Codex Token

## 环境要求

- **Python 3.13+**（通过 [uv](https://docs.astral.sh/uv/) 自动管理）
- **Google Chrome** 浏览器（版本 120+，自动检测）
- **操作系统** — macOS / Linux / Windows

## 快速开始

### 1. 安装 uv

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
irm https://astral.sh/uv/install.ps1 | iex
```

安装后需要将 `~/.local/bin` 加入 PATH（macOS/Linux）：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### 2. 克隆并安装

```bash
git clone https://github.com/xxvv/gpt-auto-register.git
cd gpt-auto-register
uv sync
```

> `uv sync` 会自动安装 Python 3.13 和所有依赖，约需 30 秒。

### 3. 配置

```bash
cp config.example.yaml config.yaml
```

编辑 `config.yaml`，按需调整配置（默认值可直接使用）。

### 4. 启动

```bash
uv run python server.py
```

浏览器打开 **http://localhost:8888** 即可使用。

### 导出到sub2api

uv run python scripts/export_refresh_tokens.py --output data/sub2api-refresh-tokens.txt

## 邮箱服务商

| 服务商            | 说明                                      | 默认启用 |    稳定性    |
| ----------------- | ----------------------------------------- | :------: | :----------: |
| **mail.tm**       | REST API，动态域名                        |    ✅    |    ⭐⭐⭐    |
| **GPTMail**       | mail.chatgpt.org.uk，Cookie+JWT           |    ✅    |    ⭐⭐⭐    |
| **TempMail.lol**  | api.tempmail.lol，纯 REST API             |    ✅    |     ⭐⭐     |
| **Temporam**      | temporam.com，Cookie 缓存                 |    ❌    |      ⭐      |
| **Gaggle**        | gaggle.email，需提供已登录 Cookie + token |    ❌    | 取决于登录态 |
| **2925 自有邮箱** | IMAP 收件箱 + alias                       |    ❌    |  取决于配置  |
| **OutlookEmail**  | 接入 `../outlookemail` 对外 API 邮箱池     |    ❌    |  取决于邮箱池 |
| **NNAI.website**  | nnai.website catch-all + Worker 验证码 API |    ❌    |  取决于收件 API |

在 Web 面板「邮箱服务」区域可勾选/取消，或通过 API：

```bash
# 查看当前
curl -s http://localhost:8888/api/providers

# 启用全部
curl -X POST http://localhost:8888/api/providers \
  -H 'Content-Type: application/json' \
  -d '{"selected":["mailtm","gptmail","tempmail_lol"]}'
```

启用 NNAI.website 渠道：

```bash
curl -X POST http://localhost:8888/api/providers \
  -H 'Content-Type: application/json' \
  -d '{"selected":["nnai"]}'
```

### OutlookEmail 渠道

先启动相邻的 `../outlookemail` 项目，并在其 Web 界面「设置 -> 对外 API Key」配置 API Key。然后在本项目 `config.yaml` 中配置：

```yaml
outlookemail:
  base_url: "http://localhost:5000"
  api_key: "your-api-key"
  group_id: ""         # 可选：只使用指定分组
  account_email: ""    # 可选：固定使用某个主邮箱或别名
  use_aliases: true     # 优先使用 outlookemail 账号别名
  allow_reuse: false    # false 时会跳过已注册邮箱
  registered_file: "data/state/outlookemail_registered.json"
```

注册成功后，本项目会把 OutlookEmail 渠道使用过且已完成注册的邮箱写入 `registered_file`；下次取邮箱时会同时检查该标记文件和 `data/accounts/registered_accounts.txt`，避免重复注册。

启用渠道：

```bash
curl -X POST http://localhost:8888/api/providers \
  -H 'Content-Type: application/json' \
  -d '{"selected":["outlookemail"]}'
```

## 代理配置

在 Web 面板「高级设置」→「代理设置」中配置，或通过 API：

```bash
curl -X POST http://localhost:8888/api/settings \
  -H 'Content-Type: application/json' \
  -d '{"proxy":{"enabled":true,"type":"http","host":"127.0.0.1","port":7897}}'
```

| 字段                    | 说明               |
| ----------------------- | ------------------ |
| `type`                  | `http` 或 `socks5` |
| `host`                  | 代理地址           |
| `port`                  | 代理端口           |
| `use_auth`              | 是否需要认证       |
| `username` / `password` | 认证信息（可选）   |

## CLIProxyAPI Token 池接入

注册成功后，Codex Token 可自动推送到 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 的 Token 池。

### 配置方式

**方式一：环境变量（推荐）**

```bash
export CLIPROXY_API_URL="http://localhost:8317"
export CLIPROXY_API_KEY="your-management-password"
export CLIPROXY_AUTH_DIR="~/.cli-proxy-api"
uv run python server.py
```

**方式二：写入 config.yaml**

```yaml
cliproxy:
  enabled: true
  api_url: "http://localhost:8317"
  api_key: "your-management-password"
  auth_dir: "~/.cli-proxy-api"
```

### 工作原理

1. 注册成功并获取 Codex Token 后，自动通过 HTTP POST 推送到 CLIProxyAPI
2. 若 HTTP 上传失败，会直接写入 CLIProxyAPI 的 auth 目录（watcher 自动检测加载）
3. 无需 CLIProxyAPI 也可正常运行（自动跳过）

## API 接口

| 接口                      | 方法     | 说明                     |
| ------------------------- | -------- | ------------------------ |
| `/`                       | GET      | Web 管理面板             |
| `/api/status`             | GET      | 任务状态 + 日志          |
| `/api/start`              | POST     | 启动注册 `{"count": N}`  |
| `/api/stop`               | POST     | 停止任务                 |
| `/api/settings`           | GET/POST | 代理 / 并行数 / Headless |
| `/api/providers`          | GET/POST | 邮箱服务商选择           |
| `/api/accounts`           | GET      | 已注册账号列表           |
| `/api/token-import/start` | POST     | 批量补取 Token           |

## 输出文件

```
data/
├── accounts/registered_accounts.txt   # 已注册账号（邮箱|密码|时间|状态|凭证|提供商）
└── tokens/codex-*.json               # Codex Token JSON
token_exports/<时间戳>/
├── ak.txt                             # access token（一行一个）
└── rk.txt                             # refresh token（一行一个）
```

## 命令行模式

不需要 Web 面板时可直接命令行运行：

```bash
uv run python main.py
```

## 从已有账号补取 Token

通过 Web 面板「Token 导入」功能，或 API：

```bash
curl -X POST http://localhost:8888/api/token-import/start \
  -H 'Content-Type: application/json' \
  -d '{"accounts_file":"data/accounts/registered_accounts.txt","output_dir":"data/tokens"}'
```

## 配置参考

完整配置字段见 [config.example.yaml](config.example.yaml)。

### 环境变量覆盖

| 环境变量                   | 对应配置                 | 说明                        |
| -------------------------- | ------------------------ | --------------------------- |
| `CLIPROXY_API_URL`         | cliproxy.api_url         | CLIProxyAPI 地址            |
| `CLIPROXY_API_KEY`         | cliproxy.api_key         | CLIProxyAPI 管理密钥        |
| `CLIPROXY_AUTH_DIR`        | cliproxy.auth_dir        | Token 文件目录              |
| `OAUTH_ENABLED`            | oauth.enabled            | 是否获取 Codex Token        |
| `OAUTH_REQUIRED`           | oauth.required           | Token 获取失败是否视为失败  |
| `CPA_UPLOAD_API_URL`       | cpa.upload_api_url       | CPA 上传地址                |
| `CPA_UPLOAD_API_TOKEN`     | cpa.upload_api_token     | CPA API Token               |
| `CUSTOM2925_IMAP_PASSWORD` | custom2925.imap_password | 2925 IMAP 密码              |
| `GAGGLE_COOKIE_HEADER`     | gaggle.cookie_header     | Gaggle 浏览器 Cookie Header |
| `GAGGLE_CSRF_TOKEN`        | gaggle.csrf_token        | Gaggle create-group token   |

## 项目结构

```
├── app/                        # 核心应用代码
│   ├── server.py               # Web 服务（Flask + Waitress）
│   ├── main.py                 # 注册核心逻辑
│   ├── browser.py              # 浏览器自动化（undetected-chromedriver）
│   ├── email_providers.py      # 邮箱服务注册表
│   ├── mailtm_service.py       # mail.tm 邮箱服务
│   ├── gptmail_service.py      # GPTMail 邮箱服务
│   ├── tempmail_lol_service.py # TempMail.lol 邮箱服务
│   ├── temporam_service.py     # Temporam 邮箱服务
│   ├── gaggle_service.py       # Gaggle 邮箱服务
│   ├── outlookemail_service.py # OutlookEmail 外部邮箱池服务
│   ├── custom2925_service.py   # 2925 自有邮箱服务
│   ├── nnai_service.py         # NNAI.website Worker 验证码服务
│   ├── oauth_service.py        # Codex OAuth + Token 保存 + CLIProxy 推送
│   ├── token_batch_service.py  # 批量 Token 补取
│   ├── stored_accounts.py      # 账号存储管理
│   ├── config.py               # 配置加载
│   └── utils.py                # 工具函数
├── scripts/
│   └── get_codex_token.py      # 为已有账号单独补取 token
├── static/                     # 前端资源
│   ├── index.html
│   ├── style.css
│   └── script.js
├── tests/                      # 测试
├── server.py                   # Web 启动入口
├── main.py                     # CLI 启动入口
├── config.example.yaml         # 配置模板
├── pyproject.toml              # 依赖定义
└── LICENSE                     # MIT License
```

## 注意事项

1. **注册间隔**建议不低于 25 秒，避免触发风控
2. **并行数**建议 2~3，过高可能导致资源不足
3. 运行期间**请勿手动操作浏览器窗口**
4. 首次使用 Temporam 会自动打开浏览器获取 Cookie
5. Chrome 版本自动检测，无需手动安装 ChromeDriver
6. `config.yaml` 包含个人配置，已加入 `.gitignore`

## 免责声明

本工具仅供教育机构内部使用，旨在辅助老师和学生快速开通 ChatGPT 账号用于教学和学习。使用者应遵守 OpenAI 的[使用条款](https://openai.com/policies/terms-of-use)，并自行承担使用本工具产生的任何后果。

## 致谢

本项目基于以下开源项目二次开发：

- [gpt-auto-register](https://github.com/7836246/gpt-auto-register) — 核心注册框架
- [MasterAlanLab/register](https://github.com/MasterAlanLab/register) — GPTMail / TempMail.lol 集成参考
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) — Token 池管理

## 开源协议

[MIT License](LICENSE)
