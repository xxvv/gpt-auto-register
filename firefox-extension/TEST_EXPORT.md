# Export Functionality Test Guide

## Setup
1. Load the extension in Firefox (about:debugging -> Load Temporary Add-on)
2. Open the sidebar (View -> Sidebar -> GPT Helper)

## Test Cases

### Test 1: Single Token Export (Sub2API)
**Steps:**
1. Paste a valid ChatGPT access token into the "Access Tokens" textarea
2. Select "Sub2API" format
3. Click "导出 ZIP"

**Expected Result:**
- Success message: "成功导出 1 个账号到 sub2api_export_YYYY-MM-DDTHH-MM-SS.zip"
- ZIP file downloads automatically
- Extract ZIP and verify it contains one JSON file
- JSON structure should match:
```json
{
  "exported_at": "2026-05-17T...",
  "proxies": [],
  "accounts": [
    {
      "name": "email@example.com",
      "platform": "openai",
      "type": "oauth",
      "concurrency": 10,
      "priority": 1,
      "credentials": {
        "access_token": "eyJ...",
        "chatgpt_account_id": "...",
        "chatgpt_user_id": "...",
        "email": "email@example.com",
        "expires_at": "...",
        "expires_in": 123456,
        "plan_type": "free"
      },
      "extra": {
        "email": "email@example.com",
        "email_key": "email_example_com",
        "name": "email@example.com",
        "auth_provider": "openai",
        "source": "chatgpt_web_session",
        "last_refresh": "..."
      }
    }
  ]
}
```

### Test 2: Multiple Tokens Export (Sub2API)
**Steps:**
1. Paste 3 valid tokens (one per line) into the textarea
2. Select "Sub2API" format
3. Click "导出 ZIP"

**Expected Result:**
- Success message: "成功导出 3 个账号到 sub2api_export_YYYY-MM-DDTHH-MM-SS.zip"
- ZIP contains 3 JSON files with unique filenames

### Test 3: CPA Format Export
**Steps:**
1. Paste a valid token
2. Select "CPA" format
3. Click "导出 ZIP"

**Expected Result:**
- Success message with CPA format
- JSON structure should match:
```json
{
  "type": "codex",
  "account_id": "...",
  "chatgpt_account_id": "...",
  "email": "email@example.com",
  "name": "email@example.com",
  "plan_type": "free",
  "chatgpt_plan_type": "free",
  "id_token": "eyJ....",
  "id_token_synthetic": true,
  "access_token": "eyJ...",
  "refresh_token": "",
  "session_token": "",
  "last_refresh": "...",
  "expired": "...",
  "disabled": false
}
```

### Test 4: Fetch from ChatGPT
**Steps:**
1. Open a ChatGPT tab (https://chatgpt.com)
2. Make sure you're logged in
3. In the sidebar, click "从 ChatGPT 获取"

**Expected Result:**
- Success message: "已添加当前 ChatGPT token"
- Token appears in the textarea
- Click again, verify token is appended (not replaced)

### Test 5: Error Handling - Empty Input
**Steps:**
1. Clear the textarea
2. Click "导出 ZIP"

**Expected Result:**
- Error message: "请输入至少一个 access token"
- No download triggered

### Test 6: Error Handling - Invalid Token
**Steps:**
1. Enter "invalid-token-format" in textarea
2. Click "导出 ZIP"

**Expected Result:**
- Export may succeed but JSON will have empty/null fields
- Or error during parsing

### Test 7: State Persistence
**Steps:**
1. Enter tokens and select format
2. Close and reopen the sidebar

**Expected Result:**
- Tokens and format selection are restored

### Test 8: UI Consistency
**Steps:**
1. Click "导出 ZIP"
2. Observe button state during export

**Expected Result:**
- Button shows busy state (disabled) during export
- Output messages use correct colors (info=yellow, success=green, error=red)

## Sample Token for Testing

You can get a real token by:
1. Opening ChatGPT (https://chatgpt.com)
2. Opening DevTools (F12)
3. Going to Application -> Cookies
4. Finding the session cookie
5. Or using the "从 ChatGPT 获取" button in the extension

## Verification Checklist

- [ ] Sub2API export works with single token
- [ ] Sub2API export works with multiple tokens
- [ ] CPA export works
- [ ] Fetch from ChatGPT works
- [ ] Empty input shows error
- [ ] State persists across sidebar reloads
- [ ] Button states work correctly
- [ ] Output messages display correctly
- [ ] ZIP files extract properly
- [ ] JSON structure matches expected format
- [ ] Filenames are sanitized correctly
- [ ] Timestamps in filenames are unique

## Known Limitations

1. Invalid tokens will still generate JSON files but with empty/null fields
2. No validation of token format before export
3. No preview of parsed token data
4. CDN dependency on fflate library (requires internet connection)
