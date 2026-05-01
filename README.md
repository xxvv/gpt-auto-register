# GPT Auto Register

> ChatGPT 账号批量注册 + 已有账号 Codex Token 补取 + Token 池推送

基于 Python + Selenium 实现注册自动化，内置 Web 管理面板，使用 NNAI.website 邮箱渠道、支持多个 catch-all 域名随机使用、并行注册、已有账号 Codex Token 补取，以及 CLIProxyAPI Token 池一键接入。

## 功能特性

- **注册自动化** — 临时邮箱创建 → 注册表单填写 → 验证码获取 → 注册完成，全程无需手动操作
- **Web 控制台** — 可视化管理面板，实时日志、浏览器画面直播、账号管理
- **NNAI 多域名邮箱** — 统一使用 NNAI.website Worker 验证码 API，可配置多个域名并随机生成邮箱
- **并行加速** — 可配置并行数（1~10），多线程同时注册
- **Headless 模式** — 支持无界面运行，适合服务器部署
- **CLIProxyAPI 集成** — 补取到的 Token 自动推送到 CLIProxyAPI Token 池（可选）
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

## 邮箱域名

当前只保留 NNAI.website 邮箱渠道。注册邮箱可以从多个 catch-all 域名中随机生成，验证码获取统一走 NNAI Worker API。

默认配置：

```yaml
email:
  wait_timeout: 120
  poll_interval: 3
  domains:
    - "nnai.website"
```

后续新增域名时，把域名加到 `email.domains` 即可，也可以用环境变量 `NNAI_EMAIL_DOMAINS=nnai.website,example.com` 覆盖。Web 面板「邮箱域名」区域可勾选多个域名，或通过 API：

```bash
# 查看当前
curl -s http://localhost:8888/api/email-domains

# 选择域名
curl -X POST http://localhost:8888/api/email-domains \
  -H 'Content-Type: application/json' \
  -d '{"selected":["nnai.website"]}'
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

从已有账号补取 Codex Token 后，可自动推送到 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 的 Token 池。

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

1. 补取 Codex Token 后，自动通过 HTTP POST 推送到 CLIProxyAPI
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
| `/api/providers`          | GET/POST | 固定返回 NNAI 渠道       |
| `/api/email-domains`      | GET/POST | NNAI 邮箱域名选择        |
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
| `NNAI_EMAIL_DOMAINS`       | email.domains            | NNAI 邮箱域名，逗号分隔     |
| `CPA_UPLOAD_API_URL`       | cpa.upload_api_url       | CPA 上传地址                |
| `CPA_UPLOAD_API_TOKEN`     | cpa.upload_api_token     | CPA API Token               |

## 项目结构

```
├── app/                        # 核心应用代码
│   ├── server.py               # Web 服务（Flask + Waitress）
│   ├── main.py                 # 注册核心逻辑
│   ├── browser.py              # 浏览器自动化（undetected-chromedriver）
│   ├── email_providers.py      # 邮箱渠道注册表（当前仅 NNAI）
│   ├── nnai_service.py         # NNAI.website Worker 验证码服务
│   ├── oauth_service.py        # 已有账号 Codex OAuth + Token 保存 + CLIProxy 推送
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
4. Chrome 版本自动检测，无需手动安装 ChromeDriver
5. `config.yaml` 包含个人配置，已加入 `.gitignore`

## 免责声明

本工具仅供教育机构内部使用，旨在辅助老师和学生快速开通 ChatGPT 账号用于教学和学习。使用者应遵守 OpenAI 的[使用条款](https://openai.com/policies/terms-of-use)，并自行承担使用本工具产生的任何后果。

## 致谢

本项目基于以下开源项目二次开发：

- [gpt-auto-register](https://github.com/7836246/gpt-auto-register) — 核心注册框架
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) — Token 池管理

## 开源协议

[MIT License](LICENSE)
