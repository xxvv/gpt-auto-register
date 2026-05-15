#!/usr/bin/env python3
"""
测试 CPA 上传功能
"""
import json
from app.utils import generate_cpa_json

# 模拟一个真实的 access token（示例格式）
# 这是一个示例 JWT token 结构，实际使用时需要真实的 token
sample_access_token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik1UaEVOVUpHTkVNMVFURTRNMEZCTWpkQ05UZzVNRFUxUlRVd1FVSkRNRU13UmtGRVFrRXpSZyJ9.eyJodHRwczovL2FwaS5vcGVuYWkuY29tL3Byb2ZpbGUiOnsiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWV9LCJodHRwczovL2FwaS5vcGVuYWkuY29tL2F1dGgiOnsiY2hhdGdwdF9hY2NvdW50X2lkIjoiMTIzNDU2NzgtYWJjZC0xMjM0LTU2NzgtYWJjZGVmMTIzNDU2IiwiY2hhdGdwdF9wbGFuX3R5cGUiOiJwbHVzIiwiY2hhdGdwdF91c2VyX2lkIjoidXNlci0xMjM0NTY3OCIsInVzZXJfaWQiOiJ1c2VyLTEyMzQ1Njc4In0sImlzcyI6Imh0dHBzOi8vYXV0aC5vcGVuYWkuY29tLyIsInN1YiI6ImF1dGgwfDEyMzQ1Njc4IiwiYXVkIjpbImh0dHBzOi8vYXBpLm9wZW5haS5jb20vdjEiLCJodHRwczovL29wZW5haS5vcGVuYWkuYXV0aDBhcHAuY29tL3VzZXJpbmZvIl0sImlhdCI6MTcxNTc2MDAwMCwiZXhwIjoxNzIzNTM2MDAwLCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIG1vZGVsLnJlYWQgbW9kZWwucmVxdWVzdCBvcmdhbml6YXRpb24ucmVhZCBvcmdhbml6YXRpb24ud3JpdGUgb2ZmbGluZV9hY2Nlc3MifQ.signature"

def test_generate_cpa_json():
    """测试 CPA JSON 生成"""
    print("=" * 60)
    print("测试 CPA JSON 生成功能")
    print("=" * 60)

    # 构建 token_data
    token_data = {
        "access_token": sample_access_token,
        "refresh_token": "rt_1234567890abcdef",
        "id_token": "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20ifQ.",
        "expired": "2026-08-06T12:34:56.789Z",
        "last_refresh": "2026-05-15T12:34:56.789Z",
    }

    email = "test@example.com"

    try:
        cpa_data = generate_cpa_json(token_data, email)

        print("\n✅ CPA JSON 生成成功！\n")
        print(json.dumps(cpa_data, indent=2, ensure_ascii=False))

        # 验证必需字段
        required_fields = [
            "type", "account_id", "chatgpt_account_id", "email", "name",
            "plan_type", "chatgpt_plan_type", "id_token", "id_token_synthetic",
            "access_token", "refresh_token", "session_token", "last_refresh",
            "expired", "disabled"
        ]

        print("\n" + "=" * 60)
        print("字段验证:")
        print("=" * 60)

        all_present = True
        for field in required_fields:
            present = field in cpa_data
            status = "✅" if present else "❌"
            print(f"{status} {field}: {present}")
            if not present:
                all_present = False

        if all_present:
            print("\n✅ 所有必需字段都存在！")
        else:
            print("\n❌ 缺少某些必需字段！")

        # 验证字段值
        print("\n" + "=" * 60)
        print("字段值验证:")
        print("=" * 60)

        checks = [
            ("type", cpa_data.get("type") == "codex", "type 应该是 'codex'"),
            ("email", cpa_data.get("email") == email, f"email 应该是 '{email}'"),
            ("name", cpa_data.get("name") == email.split("@")[0], "name 应该是邮箱前缀"),
            ("plan_type", cpa_data.get("plan_type") == "plus", "plan_type 应该是 'plus'"),
            ("account_id", cpa_data.get("account_id") == "12345678-abcd-1234-5678-abcdef123456", "account_id 应该从 JWT 中提取"),
            ("id_token_synthetic", cpa_data.get("id_token_synthetic") == False, "id_token_synthetic 应该是 False"),
            ("disabled", cpa_data.get("disabled") == False, "disabled 应该是 False"),
        ]

        for field, passed, description in checks:
            status = "✅" if passed else "❌"
            print(f"{status} {description}")

        return True

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_empty_token():
    """测试空 token 的处理"""
    print("\n" + "=" * 60)
    print("测试空 token 处理")
    print("=" * 60)

    token_data = {
        "access_token": "",
        "refresh_token": "",
        "id_token": "",
    }

    email = "empty@example.com"

    try:
        cpa_data = generate_cpa_json(token_data, email)

        print("\n✅ 空 token 处理成功！\n")
        print(json.dumps(cpa_data, indent=2, ensure_ascii=False))

        # 验证默认值
        print("\n" + "=" * 60)
        print("默认值验证:")
        print("=" * 60)

        checks = [
            ("account_id", cpa_data.get("account_id") == "", "account_id 应该是空字符串"),
            ("plan_type", cpa_data.get("plan_type") == "free", "plan_type 应该默认为 'free'"),
            ("expired", cpa_data.get("expired") == "", "expired 应该是空字符串"),
        ]

        for field, passed, description in checks:
            status = "✅" if passed else "❌"
            print(f"{status} {description}")

        return True

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("CPA 上传功能测试")
    print("=" * 60 + "\n")

    test1 = test_generate_cpa_json()
    test2 = test_empty_token()

    print("\n" + "=" * 60)
    print("测试总结")
    print("=" * 60)

    if test1 and test2:
        print("✅ 所有测试通过！")
    else:
        print("❌ 部分测试失败！")
