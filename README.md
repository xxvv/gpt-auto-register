# GPT 辅助开通工具

面向教育场景的 ChatGPT 账号辅助开通工具，帮助老师和学生快速批量创建 ChatGPT 账号，降低重复操作的时间成本。

基于 Python + Selenium 实现全流程自动化，内置 Web 管理面板，支持实时监控与账号管理。

## 功能特性

- **一键开通**：自动创建临时邮箱 → 填写注册表单 → 获取验证码 → 完成注册，全程无需手动操作
- **Web 控制台**：可视化管理面板，实时日志、浏览器画面直播、账号管理
- **批量开通**：支持设置数量，一次性为班级/课题组批量开通账号
- **并行加速**：可配置并行数（1~10），多线程同时开通
- **Headless 模式**：支持无界面运行，适合服务器部署
- **多邮箱源**：内置 mail.tm 和 Temporam 两个临时邮箱服务，可同时启用

## 环境要求

- Python 3.13+
- Google Chrome 浏览器（版本 120+）
- macOS / Linux / Windows

## 快速开始

### 1. 安装 uv

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# 或通过 pip
pip install uv
```

### 2. 安装依赖

```bash
cd gpt-auto-register
uv sync
```

### 3. 启动

```bash
uv run server.py
```

浏览器打开 **http://localhost:8888** 即可使用。

## Web 控制台

| 区域 | 功能 |
|------|------|
| 仪表盘 | 当前步骤、成功/失败计数、浏览器实时画面、终端日志 |
| 账号管理 | 已开通账号列表，支持搜索，可查看邮箱/密码/状态 |
| 邮箱服务 | 勾选 mail.tm / Temporam，多选时随机使用 |
| 高级设置 | 并行数、Headless 无界面模式 |

## 配置

编辑 `config.yaml`（默认值可直接使用）：

```yaml
registration:
  min_age: 20            # 随机生日最小年龄
  max_age: 40            # 随机生日最大年龄

email:
  wait_timeout: 120      # 等待验证邮件超时（秒）
  poll_interval: 3       # 轮询邮件间隔（秒）

password:
  length: 16             # 密码长度

files:
  accounts_file: "registered_accounts.txt"
```

## 输出

开通成功的账号保存在 `registered_accounts.txt`：

```
邮箱|密码|时间|状态|临时邮箱凭证|提供商
user@dollicons.com|Abc1!xyz|20260301_030238|已注册|token|mailtm
user@nooboy.com|Def2@abc|20260301_032123|已注册||temporam
```

## 项目结构

```
├── server.py              # Web 服务端（Flask + Waitress）
├── main.py                # 开通核心逻辑
├── browser.py             # 浏览器自动化（undetected-chromedriver）
├── email_providers.py     # 邮箱服务注册表
├── mailtm_service.py      # mail.tm 邮箱服务
├── temporam_service.py    # Temporam 邮箱服务
├── config.py              # 配置加载
├── utils.py               # 工具函数
├── config.yaml            # 运行时配置
├── pyproject.toml         # 依赖定义
└── static/                # 前端资源
    ├── index.html
    ├── style.css
    └── script.js
```

## 命令行模式

不需要 Web 面板时，也可以直接通过命令行运行：

```bash
uv run main.py
```

## 注意事项

1. 运行期间请勿手动操作浏览器窗口
2. 建议间隔一定时间分批开通，避免触发风控
3. 并行数建议 2~3，过高可能导致资源不足
4. 首次使用 Temporam 邮箱时会自动打开浏览器获取 Cookie，后续纯 API 收信

## 免责声明

本工具仅供教育机构内部使用，旨在辅助老师和学生快速开通 ChatGPT 账号用于教学和学习。使用者应遵守 OpenAI 的[使用条款](https://openai.com/policies/terms-of-use)，并自行承担使用本工具产生的任何后果。本项目不提供任何形式的担保。
