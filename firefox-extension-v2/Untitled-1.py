D:\code\gpt-auto-register\firefox-extension-v2 第3步和第5步 支持美国和日本，现在是美国的流程。
添加一个选择框支持美国和日本
现在新的日本流程是
第三步的时候 
#billingCountry 是select 选择JP
#billingPostalCode输入 150-0002
#billingAdministrativeArea 是select 选择 京都府
#billingLocality 输入 京都市
#billingAddressLine1 渋谷2丁目21番1号


第5步
#country 选择JP
#billingPostalCode 输入 150-0002
#billingState 是select 选择 京都府
#billingLine1 渋谷2丁目21番1号
#billingCity 输入 京都市
#dateOfBirth 输入 1991/10/28
#firstName ミン
#lastName リー
#countrySpecificFirstName タロウ
#countrySpecificLastName ヤマダ
1. 手机号码获取
post https://sms.oapi.vip/api.php?action=check_cdk
body {"code":"SMS-6WA3-MUJH-5FAT"}
输出
{
    "ok": true,
    "cdk": {
        "code": "SMS-6WA3-MUJH-5FAT",
        "status": "active",
        "max_uses": 0,
        "used_count": 0,
        "remaining": -1,
        "expires_at": "2026-06-29T06:45:01.000Z",
        "project_name": "日本PayPal",
        "project_slug": "日本PayPal-30天-单次",
        "country_code": "+81"
    },
    "session": {
        "id": 6891,
        "phone_number": "7094692680",
        "status": "waiting",
        "sms_code": null,
        "sms_text": null,
        "assigned_at": "2026-05-30T07:25:31.571Z",
        "last_check_at": null,
        "phone_expires_at": "2026-06-29T06:43:22.000Z"
    },
    "pending_review": null,
    "last_rejection": null,
    "sms_history": []
}

2. 获取验证码
POST
	https://sms.oapi.vip/api.php?action=get_sms
body {"code":"SMS-6WA3-MUJH-5FAT"}

失败的{"ok":false,"error":"暂时未收到验证码，请稍后重试或重新发送验证码","last_check_at":"2026-05-30T07:43:33.134Z"}
成功收到验证码的 {"ok":true,"sms":"516139","code":"516139","remaining":-1,"synced_at":"2026-05-30T07:55:07.345Z"}