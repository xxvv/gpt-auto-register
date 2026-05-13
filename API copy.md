# API 文档

## 基础信息

- **Base URL**: `https://free-team-redeem.111pengwei.workers.dev`
- **Content-Type**: `application/json`

## 认证方式

### 1. Session Token 认证（管理后台）
用于管理后台的 Web 界面，需要先登录获取 token。

**Header**: `Authorization: Bearer <token>`

### 2. API Key 认证（单个账号上传）
用于程序化调用，直接使用管理密码作为 API Key。

**Header**: `X-API-Key: <password>`

---

## 管理员接口

### 1. 登录

**POST** `/api/admin/login`

获取管理后台的 session token。

**请求体**:
```json
{
  "password": "aa102911"
}
```

**响应**:
```json
{
  "success": true,
  "token": "abc123..."
}
```

---

### 2. 生成卡密

**POST** `/api/admin/cards/generate`

**认证**: Session Token

**请求体**:
```json
{
  "quantity": 5,
  "accountQuota": 10
}
```

**响应**:
```json
{
  "success": true,
  "cards": [
    {
      "id": 1,
      "code": "ABCD-1234-EFGH-5678",
      "account_quota": 10,
      "is_consumed": false,
      "created_at": "2026-05-13T12:00:00.000Z",
      "consumed_at": null
    }
  ]
}
```

---

### 3. 批量上传账号

**POST** `/api/admin/accounts/upload`

**认证**: Session Token

**请求体**:
```json
{
  "tokens": [
    "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  ]
}
```

**响应**:
```json
{
  "success": true,
  "count": 2
}
```

---

### 4. 单个上传账号 ⭐ 新增

**POST** `/api/admin/account/add`

**认证**: API Key (X-API-Key header)

用于程序化调用，一次上传一个账号。

**Headers**:
```
Content-Type: application/json
X-API-Key: aa102911
```

**请求体**:
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应**:
```json
{
  "success": true,
  "message": "Account added successfully",
  "count": 1
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "Invalid API key"
}
```

**使用示例**:

```bash
# cURL
curl -X POST https://free-team-redeem.111pengwei.workers.dev/api/admin/account/add \
  -H "Content-Type: application/json" \
  -H "X-API-Key: aa102911" \
  -d '{"accessToken":"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."}'

# Python
import requests

url = "https://free-team-redeem.111pengwei.workers.dev/api/admin/account/add"
headers = {
    "Content-Type": "application/json",
    "X-API-Key": "aa102911"
}
data = {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}

response = requests.post(url, json=data, headers=headers)
print(response.json())

# JavaScript/Node.js
const response = await fetch('https://free-team-redeem.111pengwei.workers.dev/api/admin/account/add', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'aa102911'
  },
  body: JSON.stringify({
    accessToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
});

const result = await response.json();
console.log(result);
```

---

### 5. 获取统计信息

**GET** `/api/admin/stats`

**认证**: Session Token

**响应**:
```json
{
  "totalCards": 10,
  "consumedCards": 3,
  "totalAccounts": 100,
  "usedAccounts": 30,
  "availableAccounts": 70
}
```

---

## 用户兑换接口

### 1. 查询卡密

**POST** `/api/redeem/check`

**请求体**:
```json
{
  "cardCode": "ABCD-1234-EFGH-5678"
}
```

**响应**:
```json
{
  "valid": true,
  "accountQuota": 10,
  "isConsumed": false,
  "availableAccounts": 70
}
```

---

### 2. 导出账号

**POST** `/api/redeem/export`

**请求体**:
```json
{
  "cardCode": "ABCD-1234-EFGH-5678",
  "format": "sub2api"
}
```

**参数说明**:
- `format`: `"sub2api"` 或 `"cpa"`
  - `sub2api`: 返回 TXT 文件，每行一个 access token
  - `cpa`: 返回 ZIP 文件，包含多个 JSON 文件

**响应**: 
- Content-Type: `text/plain` (sub2api) 或 `application/zip` (cpa)
- Content-Disposition: `attachment; filename="<cardCode>.txt"` 或 `"<cardCode>.zip"`

---

## 错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 认证失败 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |

---

## 注意事项

1. **API Key 安全**: `X-API-Key` 使用的是管理密码，请妥善保管，不要泄露
2. **卡密一次性**: 卡密使用后立即消费，无法再次使用
3. **账号不重复**: 已导出的账号不会再次分配
4. **并发安全**: 系统使用事务保证并发情况下的数据一致性
5. **Session 过期**: Session token 有效期为 24 小时

---

## 批量上传脚本示例

如果你有大量账号需要上传，可以使用以下脚本：

```python
import requests
import time

API_URL = "https://free-team-redeem.111pengwei.workers.dev/api/admin/account/add"
API_KEY = "aa102911"

# 从文件读取 tokens
with open('tokens.txt', 'r') as f:
    tokens = [line.strip() for line in f if line.strip()]

success_count = 0
fail_count = 0

for i, token in enumerate(tokens, 1):
    try:
        response = requests.post(
            API_URL,
            json={"accessToken": token},
            headers={
                "Content-Type": "application/json",
                "X-API-Key": API_KEY
            }
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                success_count += 1
                print(f"[{i}/{len(tokens)}] ✓ 上传成功")
            else:
                fail_count += 1
                print(f"[{i}/{len(tokens)}] ✗ 失败: {result.get('error')}")
        else:
            fail_count += 1
            print(f"[{i}/{len(tokens)}] ✗ HTTP {response.status_code}")
        
        # 避免请求过快
        time.sleep(0.1)
        
    except Exception as e:
        fail_count += 1
        print(f"[{i}/{len(tokens)}] ✗ 异常: {str(e)}")

print(f"\n完成！成功: {success_count}, 失败: {fail_count}")
```

---

## 更新日志

### 2026-05-13
- ✨ 新增单个账号上传接口 `/api/admin/account/add`
- 🔐 支持 API Key 认证方式
- 📝 完善 API 文档
