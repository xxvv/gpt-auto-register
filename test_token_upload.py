#!/usr/bin/env python3
"""
测试 token_upload 功能
"""

import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from app.utils import upload_access_token
from app.config import cfg

def test_token_upload():
    """测试 token 上传功能"""

    print("=" * 60)
    print("Token Upload 功能测试")
    print("=" * 60)

    # 显示当前配置
    print("\n📋 当前配置:")
    print(f"  启用状态: {cfg.token_upload.enabled}")
    print(f"  API URL: {cfg.token_upload.api_url}")
    print(f"  API Key: {cfg.token_upload.api_key[:8]}..." if cfg.token_upload.api_key else "  API Key: (未设置)")
    print(f"  超时时间: {cfg.token_upload.timeout}秒")

    # 测试用的假 token（JWT 格式，以 eyJ 开头）
    # 这是一个无效的 token，仅用于测试 API 连接
    test_token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik1UaEVOVUpHTkVNMVFURTRNMEZCTWpkQ05UZzVNRFUxUlRVd1FVSkRNRU13UmtGRVFrRXpSZyJ9.eyJodHRwczovL2FwaS5vcGVuYWkuY29tL3Byb2ZpbGUiOnsiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWV9LCJodHRwczovL2FwaS5vcGVuYWkuY29tL2F1dGgiOnsicG9pZCI6Im9yZy1UZXN0T3JnSWQxMjM0NTYiLCJ1c2VyX2lkIjoidXNlci1UZXN0VXNlcklkMTIzNDU2In0sImlzcyI6Imh0dHBzOi8vYXV0aDAub3BlbmFpLmNvbS8iLCJzdWIiOiJhdXRoMHx0ZXN0MTIzNDU2Nzg5MCIsImF1ZCI6WyJodHRwczovL2FwaS5vcGVuYWkuY29tL3YxIiwiaHR0cHM6Ly9vcGVuYWkub3BlbmFpLmF1dGgwYXBwLmNvbS91c2VyaW5mbyJdLCJpYXQiOjE3MzY3NTAwMDAsImV4cCI6MTczNjgzNjQwMCwiYXpwIjoiVGRKSWNiZTE2V29USHROOTVueXl3aDVFNHlPbzZJdEciLCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIG1vZGVsLnJlYWQgbW9kZWwucmVxdWVzdCBvcmdhbml6YXRpb24ucmVhZCBvcmdhbml6YXRpb24ud3JpdGUgb2ZmbGluZV9hY2Nlc3MifQ.test_signature_for_testing_only"

    print("\n🧪 测试场景:")
    print(f"  使用测试 Token: {test_token[:50]}...")
    print(f"  Token 长度: {len(test_token)} 字符")

    # 执行上传测试
    print("\n🚀 开始测试上传...")
    print("-" * 60)

    try:
        result = upload_access_token(test_token)

        print("-" * 60)
        print("\n📊 测试结果:")
        if result:
            print("  ✅ 上传成功")
        else:
            print("  ❌ 上传失败")

        return result

    except Exception as e:
        print("-" * 60)
        print(f"\n💥 测试过程中发生异常: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("\n")
    success = test_token_upload()
    print("\n" + "=" * 60)
    if success:
        print("✅ Token Upload 功能测试通过")
    else:
        print("❌ Token Upload 功能测试失败")
    print("=" * 60 + "\n")

    sys.exit(0 if success else 1)
