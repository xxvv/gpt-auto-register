# CPA 上传功能 - 快速配置指南

## 快速开始

### 第一步：编辑配置文件

打开 `config.yaml`，找到 `cpa` 部分，修改如下：

```yaml
cpa:
  enabled: true                                    # 改为 true 启用
  management_api_url: "你的管理API地址"              # 填写你的 CLIPROXY API 地址
  management_api_key: "你的API密钥"                 # 填写你的 API 密钥
  timeout: 30                                      # 超时时间，一般不需要改
```

### 第二步：运行测试

```bash
# 测试 CPA JSON 生成功能
python test_cpa_upload.py
```

如果看到 "✅ 所有测试通过！"，说明功能正常。

### 第三步：运行注册

```bash
# 正常运行注册流程
python -m app.main
```

注册成功后，会自动上传 CPA 数据到你的管理 API。

## 配置说明

### 必填项

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `enabled` | 是否启用 CPA 上传 | `true` 或 `false` |
| `management_api_url` | 管理 API 地址 | `https://api.example.com/accounts` |
| `management_api_key` | API 密钥 | `sk_live_1234567890` |

### 可选项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `timeout` | 上传超时时间（秒） | `30` |

## 日志说明

### 成功日志

```
📤 正在上传 CPA 数据到管理 API...
✅ CPA 上传成功: user@example.com
```

### 失败日志

```
📤 正在上传 CPA 数据到管理 API...
❌ CPA 上传失败: HTTP 401
   错误详情: {'error': 'Invalid API key'}
```

### 跳过日志

```
⚠️ 未配置 cpa.management_api_url，跳过 CPA 上传
```

或

```
⚠️ 未配置 cpa.management_api_key，跳过 CPA 上传
```

## CPA JSON 格式

上传到你的 API 的数据格式：

```json
{
  "type": "codex",
  "account_id": "账号UUID",
  "chatgpt_account_id": "账号UUID",
  "email": "邮箱地址",
  "name": "邮箱前缀",
  "plan_type": "plus 或 free",
  "chatgpt_plan_type": "plus 或 free",
  "id_token": "ID Token（可能为空）",
  "id_token_synthetic": false,
  "access_token": "访问令牌",
  "refresh_token": "刷新令牌（可能为空）",
  "session_token": "会话令牌（通常为空）",
  "last_refresh": "最后刷新时间",
  "expired": "过期时间",
  "disabled": false
}
```

## API 要求

你的管理 API 需要：

### 请求

- **方法**: POST
- **Content-Type**: `application/json`
- **认证**: `Authorization: Bearer {你的API密钥}`
- **Body**: CPA JSON 格式

### 响应

成功时返回 HTTP 200，并且 JSON 中包含：
- `"success": true` 或
- `"status": "success"`

失败时返回 4xx/5xx 状态码。

## 常见问题

### Q1: 如何测试 API 是否配置正确？

使用 curl 测试：

```bash
curl -X POST "你的API地址" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 你的API密钥" \
  -d '{
    "type": "codex",
    "email": "test@example.com",
    "access_token": "test_token"
  }'
```

### Q2: CPA 上传失败会影响注册吗？

不会。CPA 上传失败只会记录错误日志，不会影响账号注册流程。

### Q3: 如何临时禁用 CPA 上传？

将 `config.yaml` 中的 `enabled` 改为 `false`：

```yaml
cpa:
  enabled: false
```

### Q4: 可以同时启用 token_upload 和 CPA 上传吗？

可以。两个功能完全独立：
- `token_upload`: 上传简单的 access token
- `cpa`: 上传完整的 CPA 格式数据

### Q5: 如何使用环境变量配置？

```bash
export CPA_ENABLED=true
export CPA_MANAGEMENT_API_URL="https://api.example.com/accounts"
export CPA_MANAGEMENT_API_KEY="your-api-key"
```

环境变量优先级高于配置文件。

## 故障排查

### 问题：看不到上传日志

**原因**: `enabled` 未设置为 `true`

**解决**: 检查 `config.yaml` 中 `cpa.enabled` 是否为 `true`

### 问题：提示未配置 URL 或 API key

**原因**: 配置项为空

**解决**: 填写 `management_api_url` 和 `management_api_key`

### 问题：HTTP 401 错误

**原因**: API 密钥错误

**解决**: 检查 `management_api_key` 是否正确

### 问题：HTTP 404 错误

**原因**: API 地址错误

**解决**: 检查 `management_api_url` 是否正确

### 问题：超时错误

**原因**: 网络问题或 API 响应慢

**解决**: 增加 `timeout` 值，或检查网络连接

## 与 token_upload 的区别

| 特性 | token_upload | CPA 上传 |
|------|--------------|----------|
| 上传内容 | 仅 access token | 完整 CPA 格式 |
| 认证方式 | `X-API-Key` | `Authorization: Bearer` |
| 包含信息 | 只有 token | 账号ID、邮箱、计划类型等 |
| 用途 | 简单的 token 收集 | CLIPROXY 风格的账号管理 |

## 技术支持

如遇到问题：

1. 查看日志输出中的错误信息
2. 运行 `test_cpa_upload.py` 测试基本功能
3. 使用 curl 测试 API 连接
4. 检查配置文件格式是否正确

---

**文档版本**: 1.0
**更新时间**: 2026-05-15
