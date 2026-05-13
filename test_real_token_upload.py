#!/usr/bin/env python3
"""
使用真实 access token 测试上传功能
"""

import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from app.utils import upload_access_token
from app.config import cfg

def test_real_token_upload():
    """使用真实 token 测试上传功能"""

    print("=" * 60)
    print("真实 Token 上传测试")
    print("=" * 60)

    # 显示当前配置
    print("\n📋 当前配置:")
    print(f"  启用状态: {cfg.token_upload.enabled}")
    print(f"  API URL: {cfg.token_upload.api_url}")
    api_key_display = cfg.token_upload.api_key if cfg.token_upload.api_key else "(未设置)"
    print(f"  API Key: {api_key_display}")
    print(f"  超时时间: {cfg.token_upload.timeout}秒")

    # 从账户文件读取真实 token
    real_token = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE5MzQ0ZTY1LWJiYzktNDRkMS1hOWQwLWY5NTdiMDc5YmQwZSIsInR5cCI6IkpXVCJ9.eyJhdWQiOlsiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MSJdLCJjbGllbnRfaWQiOiJhcHBfWDh6WTZ2VzJwUTl0UjNkRTduSzFqTDVnSCIsImV4cCI6MTc3OTUzODE0MSwiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS9hdXRoIjp7ImNoYXRncHRfYWNjb3VudF9pZCI6IjBmYjJhNTYwLTdiNTItNGUxYi04MmU3LTE2ZGM0NzQ2M2RkNyIsImNoYXRncHRfYWNjb3VudF91c2VyX2lkIjoidXNlci1TZ2h4bktVSGhycU93NVFVUENKNlF6eTRfXzBmYjJhNTYwLTdiNTItNGUxYi04MmU3LTE2ZGM0NzQ2M2RkNyIsImNoYXRncHRfY29tcHV0ZV9yZXNpZGVuY3kiOiJub19jb25zdHJhaW50IiwiY2hhdGdwdF9wbGFuX3R5cGUiOiJmcmVlX3dvcmtzcGFjZSIsImNoYXRncHRfdXNlcl9pZCI6InVzZXItU2doeG5LVUhocnFPdzVRVVBDSjZRenk0IiwiaXNfc2lnbnVwIjp0cnVlLCJ1c2VyX2lkIjoidXNlci1TZ2h4bktVSGhycU93NVFVUENKNlF6eTQifSwiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS9wcm9maWxlIjp7ImVtYWlsIjoiYmFpZHUtM0AyMDI0MDEyNS54eXoiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZX0sImlhdCI6MTc3ODY3NDE0MCwiaXNzIjoiaHR0cHM6Ly9hdXRoLm9wZW5haS5jb20iLCJqdGkiOiJlZTg4MTQ5MC0zMTNkLTRmMGYtYjM0YS05ZmM5ZGUyNjIyZDMiLCJuYmYiOjE3Nzg2NzQxNDAsInB3ZF9hdXRoX3RpbWUiOjE3Nzg2NzQxMzU2MTQsInNjcCI6WyJvcGVuaWQiLCJlbWFpbCIsInByb2ZpbGUiLCJvZmZsaW5lX2FjY2VzcyIsIm1vZGVsLnJlcXVlc3QiLCJtb2RlbC5yZWFkIiwib3JnYW5pemF0aW9uLnJlYWQiLCJvcmdhbml6YXRpb24ud3JpdGUiXSwic2Vzc2lvbl9pZCI6ImF1dGhzZXNzX3dFdTg0T3M4emxmM0N4bm9qamRiU2U0UCIsInNsIjp0cnVlLCJzdWIiOiJhdXRoMHw2alg2blp2SmxxZ2d5SktXa3doWVdDZXUifQ.1hvzoUr5DVv9lk3oxkaZ4Kbjobez_vgFKaOdSbaiRqdHt5cfMMOzDQMsY6mChz1_42UYXGNhxsb2sQfXtupzRy8W3s6wekEfFsd350o3q5ZU1sWj8BcF73aVAXdU_-rMHBis5mbWdMOPDdByA4peiBK6FlMW0Esgn_EP2RO5WPfuI1h_ynOWG95eS5ZTI7ef-IlHrvLzJpixM8tGEi90tzOPJvO8fXOM2uJ0JzSZfTS0jXv4F7frHnesmbKDuh-DZRqSb48UXgAR00XachmtZX0nnmobsavkmzT9nJ00U7FB-aYd4-ZwvidqHH0NJ8fIdNRjjWe3cHz7EtCzXQqN6I1UOpuP8bH9Z-PqXUr4rL67xZdL4m6Q6KZGqXs0apXOM6VoDP_y4E2B2F7oWrhrY70_RXj07BEV3Z3OEtXc-2Y-oKu1hMs7O-6LsNPwit4fT3ltM0w82qjukSvAppRJ12Kx1MuJ7iM2_klf12VB_MTB1J2qkI7gn21CNsUDUFNx95cVKiQMnf_9PSOjv7Odz51VuQu4k6EvK4VUgyzrU5G8td-Q0zaNCrZ6UPg3eJSdCNPcYfaZGRUI7Pc8--kdfl05hmjfGo_1PvGJr3gHAuyWJ3HKUXFqD0Uyl9wKlAfhK9iTWzyhuDYrwS2zFiPGUGCxDUw-MnBspbfKlOqnyPI"

    print("\n🧪 测试场景:")
    print(f"  使用真实 Token: {real_token[:80]}...")
    print(f"  Token 长度: {len(real_token)} 字符")

    # 解析 token 中的邮箱信息
    try:
        import json
        import base64
        # JWT 的 payload 部分（第二段）
        payload_part = real_token.split('.')[1]
        # 添加必要的 padding
        padding = 4 - len(payload_part) % 4
        if padding != 4:
            payload_part += '=' * padding
        payload_json = base64.urlsafe_b64decode(payload_part)
        payload = json.loads(payload_json)
        email = payload.get('https://api.openai.com/profile', {}).get('email', 'unknown')
        print(f"  Token 对应邮箱: {email}")
    except Exception as e:
        print(f"  无法解析 Token 邮箱信息: {e}")

    # 执行上传测试
    print("\n🚀 开始真实 API 调用...")
    print("-" * 60)

    try:
        result = upload_access_token(real_token)

        print("-" * 60)
        print("\n📊 测试结果:")
        if result:
            print("  ✅ 真实 Token 上传成功")
            print("  ✅ API 接口工作正常")
            print("  ✅ 认证和数据处理正常")
        else:
            print("  ❌ 真实 Token 上传失败")
            print("  ℹ️ 可能原因:")
            print("     - API 拒绝了该 Token")
            print("     - Token 已过期或无效")
            print("     - API Key 权限不足")

        return result

    except Exception as e:
        print("-" * 60)
        print(f"\n💥 测试过程中发生异常: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("\n")
    success = test_real_token_upload()
    print("\n" + "=" * 60)
    if success:
        print("✅ 真实 Token 上传测试通过")
        print("✅ API 接口完全正常工作")
    else:
        print("❌ 真实 Token 上传测试失败")
        print("ℹ️ 请检查 API 配置和网络连接")
    print("=" * 60 + "\n")

    sys.exit(0 if success else 1)
