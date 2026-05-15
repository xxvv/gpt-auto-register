# CPA 上传功能实现完成

## 功能概述

已成功添加 CPA (Codex Proxy Account) 格式的 JSON 上传功能到您的 Python 项目中。该功能可以在账号注册成功后，自动生成符合 Chrome 扩展 `GPTSession2CPA-Extension` 格式的 CPA JSON，并上传到您指定的 CLIPROXY 管理 API。

## 实现的功能

### 1. 配置系统更新

**文件:** `app/config.py`

新增配置字段：
- `enabled`: 是否启用 CPA 上传（默认 `false`）
- `management_api_url`: CLIPROXY 管理 API 地址
- `management_api_key`: 管理 API 密钥
- `timeout`: 上传超时时间（默认 30 秒）

支持环境变量：
- `CPA_ENABLED`
- `CPA_MANAGEMENT_API_URL`
- `CPA_MANAGEMENT_API_KEY`
- `CPA_TIMEOUT`

### 2. CPA JSON 生成

**文件:** `app/utils.py`

新增函数 `generate_cpa_json(token_data, email)`：
- 从 access token 中解析 JWT payload
- 提取账号信息：`account_id`, `plan_type`, `expired`
- 生成符合 Chrome 扩展格式的 CPA JSON
- 处理缺失字段（使用空字符串）

生成的 CPA JSON 格式：
```json
{
  "type": "codex",
  "account_id": "UUID",
  "chatgpt_account_id": "UUID",
  "email": "user@example.com",
  "name": "user",
  "plan_type": "plus",
  "chatgpt_plan_type": "plus",
  "id_token": "",
  "id_token_synthetic": false,
  "access_token": "eyJ...",
  "refresh_token": "",
  "session_token": "",
  "last_refresh": "2026-05-15T12:34:56.789Z",
  "expired": "2026-08-06T12:34:56.789Z",
  "disabled": false
}
```

### 3. CPA 上传功能

**文件:** `app/utils.py`

新增函数 `upload_cpa_json(cpa_data, api_url, api_key, timeout)`：
- 使用 `Authorization: Bearer {api_key}` 认证方式
- POST 请求发送 CPA JSON
- 完整的错误处理和日志输出
- 复用现有的 `http_session` 和重试策略

### 4. 注册流程集成

**文件:** `app/main.py`

在两个注册函数中集成 CPA 上传：
- `register_one_account()` - 标准注册流程
- `register_one_account_with_playwright()` - Playwright 注册流程

上传时机：
- 在 `upload_access_token()` 之后
- 在 `save_to_txt()` 之前
- 独立于 token 上传（不依赖 token 上传是否成功）

### 5. OAuth 流程集成

**文件:** `app/oauth_service.py`

在 `save_codex_tokens()` 函数中集成 CPA 上传：
- 在 CLIProxyAPI 上传之后
- 使用完整的 token 数据（包含 refresh_token 和 id_token）

## 配置方法

### 方式 1: 修改 config.yaml

```yaml
cpa:
  enabled: true                                    # 启用 CPA 上传
  management_api_url: "https://your-api.com/accounts"  # 您的管理 API 地址
  management_api_key: "your-api-key-here"         # 您的 API 密钥
  timeout: 30                                      # 超时时间（秒）
```

### 方式 2: 使用环境变量

```bash
export CPA_ENABLED=true
export CPA_MANAGEMENT_API_URL="https://your-api.com/accounts"
export CPA_MANAGEMENT_API_KEY="your-api-key-here"
export CPA_TIMEOUT=30
```

## 使用示例

### 1. 启用 CPA 上传

编辑 `config.yaml`：

```yaml
cpa:
  enabled: true
  management_api_url: "https://cliproxy.example.com/api/v1/accounts"
  management_api_key: "sk_live_1234567890abcdef"
  timeout: 30
```

### 2. 运行注册流程

```bash
python -m app.main
```

### 3. 查看日志输出

成功时：
```
📤 正在上传 CPA 数据到管理 API...
✅ CPA 上传成功: user@example.com
```

失败时：
```
📤 正在上传 CPA 数据到管理 API...
❌ CPA 上传失败: HTTP 401
   错误详情: {'error': 'Invalid API key'}
```

## 测试

已创建测试脚本 `test_cpa_upload.py`：

```bash
# 运行测试
python test_cpa_upload.py
```

测试内容：
- ✅ CPA JSON 生成功能
- ✅ 所有必需字段验证
- ✅ JWT 解析和字段提取
- ✅ 空 token 处理
- ✅ 默认值验证

## API 要求

您的 CLIPROXY 管理 API 应该：

### 请求格式

```http
POST /api/v1/accounts HTTP/1.1
Host: your-api.com
Content-Type: application/json
Authorization: Bearer your-api-key-here

{
  "type": "codex",
  "account_id": "...",
  "email": "...",
  "access_token": "...",
  ...
}
```

### 响应格式

成功（HTTP 200）：
```json
{
  "success": true
}
```

或：
```json
{
  "status": "success"
}
```

失败（HTTP 4xx/5xx）：
```json
{
  "error": "错误描述",
  "message": "详细信息"
}
```

## 错误处理

所有错误都是非阻塞的，不会影响账号注册流程：

1. **配置缺失**: 跳过上传，输出警告
2. **网络超时**: 记录超时错误，继续执行
3. **HTTP 错误**: 记录错误详情，继续执行
4. **JWT 解析失败**: 使用默认值，继续上传
5. **异常错误**: 捕获并记录，继续执行

## 文件修改清单

1. ✅ `app/config.py` - 添加 CPA 配置字段
2. ✅ `app/utils.py` - 添加 CPA 生成和上传函数
3. ✅ `app/main.py` - 集成到注册流程
4. ✅ `app/oauth_service.py` - 集成到 OAuth 流程
5. ✅ `config.yaml` - 更新配置文件
6. ✅ `config.example.yaml` - 更新配置模板
7. ✅ `test_cpa_upload.py` - 创建测试脚本

## 特性

- ✅ 独立于 token 上传功能
- ✅ 使用 Bearer Token 认证
- ✅ 缺失字段发送空字符串
- ✅ 复用现有 HTTP 会话和重试策略
- ✅ 完整的错误处理和日志
- ✅ 支持环境变量配置
- ✅ 向后兼容旧版配置

## 下一步

1. **配置 API 地址和密钥**：
   - 编辑 `config.yaml` 中的 `cpa` 部分
   - 或设置环境变量

2. **测试上传功能**：
   - 运行 `test_cpa_upload.py` 验证 JSON 生成
   - 注册一个测试账号验证完整流程

3. **监控日志输出**：
   - 查看 "📤 正在上传 CPA 数据到管理 API..." 消息
   - 确认 "✅ CPA 上传成功" 或排查错误

## 技术细节

### JWT 解析

使用现有的 `_decode_jwt_payload()` 函数：
- 从 `https://api.openai.com/auth` 提取账号信息
- 从 `exp` 字段提取过期时间
- 转换为 ISO 8601 格式

### 时间格式

- `last_refresh`: 当前 UTC 时间
- `expired`: 从 JWT `exp` 字段提取
- 格式: `2026-05-15T12:34:56.789Z`

### 认证方式

使用 `Authorization: Bearer {api_key}` 头部，与 CLIProxyAPI 保持一致。

## 支持

如有问题，请检查：
1. 配置文件中的 URL 和 API key 是否正确
2. API 端点是否可访问
3. 日志输出中的错误详情
4. 运行 `test_cpa_upload.py` 验证基本功能

---

**实现完成时间**: 2026-05-15
**测试状态**: ✅ 所有测试通过
