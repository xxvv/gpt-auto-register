# 创建邮箱

## 请求curl

curl 'https://gaggle.email/create-group' \
 -H 'accept: _/_' \
 -H 'accept-language: zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6' \
 -H 'content-type: application/x-www-form-urlencoded; charset=UTF-8' \
 -b '\_clck=8j1rtc%5E2%5Eg5c%5E0%5E2300; session=eyJhbGciOiJSUzI1NiIsImtpZCI6InU5VmJ5USJ9.eyJpc3MiOiJodHRwczovL3Nlc3Npb24uZmlyZWJhc2UuZ29vZ2xlLmNvbS9nYWdnbGUtbWFpbCIsIm5hbWUiOiJ4eCB2diIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NLYmhId2puMUZhYXA1clBRZFlwdGtuT0dKQTd2Zm1wOE9TeWduTVZFOHpDUU4yY1pRXHUwMDNkczk2LWMiLCJhdWQiOiJnYWdnbGUtbWFpbCIsImF1dGhfdGltZSI6MTc3NjU3NDg1MCwidXNlcl9pZCI6InFCWkh3dnZrVmRlNWhQR3M1Z3B2ZXNKS3dzQjIiLCJzdWIiOiJxQlpId3Z2a1ZkZTVoUEdzNWdwdmVzSkt3c0IyIiwiaWF0IjoxNzc2NTc0ODUxLCJleHAiOjE3Nzc3ODQ0NTEsImVtYWlsIjoiMTExcGVuZ3dlaUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJnb29nbGUuY29tIjpbIjExNzcxMzQyNDg1ODYyMTE1NDY3OSJdLCJlbWFpbCI6WyIxMTFwZW5nd2VpQGdtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6Imdvb2dsZS5jb20ifX0.QY-lKnSY2g-u_zV7DbSEPSNvIYwyU2MsZycKFsDffBEjtSER21-oy-P34jP40MJLNse8aNnPaoPDqIm00Orof36Mu0PSlKsx4ooVjGQxjtCZ_fcEKhxt9unk61naRHhRx81M7wkVO5QWTuKEyL6845XqZNTMrFYAHY3hOEAhwLOjF2jknyGzA2_pBNfbDwUAjfx_DJnVE_0bIPlGYoIZ1Wolj-1XVitV2cjfu9WMYKj9X3L2w5RHuZCg65lAlOF3l1xRRGcc6zKQk35qsmu8HQV807kc56kqR2reeX8kotbOwLerEKRF4wtvPbkfnZFkMqMvS2T7_uv_57mBKirzFg; GAGGLE_REFERER_KEY="{\"cookie_id\": \"Ig7v6cyU7j4khLuAODwbj1dqloHjXSd3\"\054 \"has_account\": true}"; **stripe_mid=f0a597e2-c074-436b-b6ca-55f728fcf0597797c5; **stripe_sid=cab0930c-2b1e-4ffe-a009-99157e6892ac0267bb; lastDashboardTab=/home/dashboard; \_clsk=10xy243%5E1776575885452%5E17%5E1%5Ez.clarity.ms%2Fcollect' \
 -H 'origin: https://gaggle.email' \
 -H 'priority: u=1, i' \
 -H 'referer: https://gaggle.email/home/dashboard' \
 -H 'sec-ch-ua: "Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"' \
 -H 'sec-ch-ua-mobile: ?0' \
 -H 'sec-ch-ua-platform: "macOS"' \
 -H 'sec-fetch-dest: empty' \
 -H 'sec-fetch-mode: cors' \
 -H 'sec-fetch-site: same-origin' \
 -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0' \
 -H 'x-requested-with: XMLHttpRequest' \
 --data-raw 'newGroupName=ccssqq&newGroupAddress=ccssqq&token=43b05017a190aba44161c094536f0684&firstEverGroup=false&sendWelcome=false'

## 参数说明

创建新的邮箱时，传递 newGroupName，newGroupAddress 一致

创建成功后，需要继续调用下面的“修改邮箱状态”接口，把 `whoCanSend` 改成 `anyone`。
否则新邮箱可能收不到 OpenAI 等发件人的验证码邮件。

## 响应

success: false 为错误
{
"groups": [
{
"color_theme": null,
"customDomain": "",
"customer_id": null,
"description": "",
"displayEmail": "luyis@gaggle.email",
"email": "luyis@gaggle.email",
"expires_days_left": 0,
"group_id": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6KO6xb8IDA",
"isProMemberDontEnforce": false,
"isProMemberEnforceAll": false,
"isProMemberEnforceExceptSend": false,
"isProMemberInCountdown": false,
"isWithinRangeOfCountdown": false,
"is_admin": true,
"is_linked_group_admin": false,
"is_member_manager": false,
"is_moderator": false,
"is_on_trial": true,
"is_trial": true,
"is_valid": true,
"last_message": null,
"last_payment": null,
"linked_group_id": null,
"linked_group_name": null,
"listId": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6KO6xb8IDA",
"logo_hash": null,
"logo_link": null,
"max_members": 20000,
"member_count": 1,
"message_archive": true,
"moderation_required": false,
"name": "luyis",
"number_awaiting_moderation": 0,
"openRateTrackingEnabled": true,
"payer_email": null,
"payment_interval": null,
"percent_off": 0,
"proMemberCountdownDate": null,
"sales_tax_rate": null,
"send_welcome_message": false,
"status": 0,
"sub_groups": [],
"subscription_breakdown": null,
"subscription_id": null,
"subscription_name": null,
"subscription_name_display": null,
"trial_days_left": 28,
"trial_ends": "2026-05-17T09:05:33.609954",
"useCustomDomain": false,
"valid_until": null
},
{
"color_theme": null,
"customDomain": "",
"customer_id": null,
"description": "",
"displayEmail": "ccssqq@gaggle.email",
"email": "ccssqq@gaggle.email",
"expires_days_left": 0,
"group_id": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6OOYj_QIDA",
"isProMemberDontEnforce": false,
"isProMemberEnforceAll": false,
"isProMemberEnforceExceptSend": false,
"isProMemberInCountdown": false,
"isWithinRangeOfCountdown": false,
"is_admin": true,
"is_linked_group_admin": false,
"is_member_manager": false,
"is_moderator": false,
"is_on_trial": true,
"is_trial": true,
"is_valid": true,
"last_message": null,
"last_payment": null,
"linked_group_id": null,
"linked_group_name": null,
"listId": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6OOYj_QIDA",
"logo_hash": null,
"logo_link": null,
"max_members": 20000,
"member_count": 1,
"message_archive": true,
"moderation_required": false,
"name": "ccssqq",
"number_awaiting_moderation": 0,
"openRateTrackingEnabled": true,
"payer_email": null,
"payment_interval": null,
"percent_off": 0,
"proMemberCountdownDate": null,
"sales_tax_rate": null,
"send_welcome_message": false,
"status": 0,
"sub_groups": [],
"subscription_breakdown": null,
"subscription_id": null,
"subscription_name": null,
"subscription_name_display": null,
"trial_days_left": 29,
"trial_ends": "2026-05-19T05:18:14.519378",
"useCustomDomain": false,
"valid_until": null
},
{
"color_theme": null,
"customDomain": "",
"customer_id": null,
"description": "",
"displayEmail": "sdf@gaggle.email",
"email": "sdf@gaggle.email",
"expires_days_left": 0,
"group_id": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6P3nrZgJDA",
"isProMemberDontEnforce": false,
"isProMemberEnforceAll": false,
"isProMemberEnforceExceptSend": false,
"isProMemberInCountdown": false,
"isWithinRangeOfCountdown": false,
"is_admin": true,
"is_linked_group_admin": false,
"is_member_manager": false,
"is_moderator": false,
"is_on_trial": true,
"is_trial": true,
"is_valid": true,
"last_message": null,
"last_payment": null,
"linked_group_id": null,
"linked_group_name": null,
"listId": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6P3nrZgJDA",
"logo_hash": null,
"logo_link": null,
"max_members": 20000,
"member_count": 1,
"message_archive": true,
"moderation_required": false,
"name": "sdf",
"number_awaiting_moderation": 0,
"openRateTrackingEnabled": true,
"payer_email": null,
"payment_interval": null,
"percent_off": 0,
"proMemberCountdownDate": null,
"sales_tax_rate": null,
"send_welcome_message": false,
"status": 0,
"sub_groups": [],
"subscription_breakdown": null,
"subscription_id": null,
"subscription_name": null,
"subscription_name_display": null,
"trial_days_left": 29,
"trial_ends": "2026-05-19T05:02:36.196076",
"useCustomDomain": false,
"valid_until": null
},
{
"color_theme": null,
"customDomain": "",
"customer_id": null,
"description": "",
"displayEmail": "ssniu@gaggle.email",
"email": "ssniu@gaggle.email",
"expires_days_left": 0,
"group_id": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6OPq2cMJDA",
"isProMemberDontEnforce": false,
"isProMemberEnforceAll": false,
"isProMemberEnforceExceptSend": false,
"isProMemberInCountdown": false,
"isWithinRangeOfCountdown": false,
"is_admin": true,
"is_linked_group_admin": false,
"is_member_manager": false,
"is_moderator": false,
"is_on_trial": true,
"is_trial": true,
"is_valid": true,
"last_message": null,
"last_payment": null,
"linked_group_id": null,
"linked_group_name": null,
"listId": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6OPq2cMJDA",
"logo_hash": null,
"logo_link": null,
"max_members": 20000,
"member_count": 1,
"message_archive": true,
"moderation_required": false,
"name": "ssniu",
"number_awaiting_moderation": 0,
"openRateTrackingEnabled": true,
"payer_email": null,
"payment_interval": null,
"percent_off": 0,
"proMemberCountdownDate": null,
"sales_tax_rate": null,
"send_welcome_message": false,
"status": 0,
"sub_groups": [],
"subscription_breakdown": null,
"subscription_id": null,
"subscription_name": null,
"subscription_name_display": null,
"trial_days_left": 28,
"trial_ends": "2026-05-17T11:58:25.109892",
"useCustomDomain": false,
"valid_until": null
},
{
"color_theme": null,
"customDomain": "",
"customer_id": null,
"description": "",
"displayEmail": "x-x-d-deng@gaggle.email",
"email": "x-x-d-deng@gaggle.email",
"expires_days_left": 0,
"group_id": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6P3l5c0JDA",
"isProMemberDontEnforce": false,
"isProMemberEnforceAll": false,
"isProMemberEnforceExceptSend": false,
"isProMemberInCountdown": false,
"isWithinRangeOfCountdown": false,
"is_admin": true,
"is_linked_group_admin": false,
"is_member_manager": false,
"is_moderator": false,
"is_on_trial": true,
"is_trial": true,
"is_valid": true,
"last_message": null,
"last_payment": null,
"linked_group_id": null,
"linked_group_name": null,
"listId": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6P3l5c0JDA",
"logo_hash": null,
"logo_link": null,
"max_members": 20000,
"member_count": 1,
"message_archive": true,
"moderation_required": false,
"name": "xxddeng",
"number_awaiting_moderation": 0,
"openRateTrackingEnabled": true,
"payer_email": null,
"payment_interval": null,
"percent_off": 0,
"proMemberCountdownDate": null,
"sales_tax_rate": null,
"send_welcome_message": false,
"status": 0,
"sub_groups": [],
"subscription_breakdown": null,
"subscription_id": null,
"subscription_name": null,
"subscription_name_display": null,
"trial_days_left": 29,
"trial_ends": "2026-05-18T06:27:29.132254",
"useCustomDomain": false,
"valid_until": null
},
{
"color_theme": null,
"customDomain": "",
"customer_id": null,
"description": "",
"displayEmail": "fdfdf@gaggle.email",
"email": "fdfdf@gaggle.email",
"expires_days_left": 0,
"group_id": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6KOu_8MKDA",
"isProMemberDontEnforce": false,
"isProMemberEnforceAll": false,
"isProMemberEnforceExceptSend": false,
"isProMemberInCountdown": false,
"isWithinRangeOfCountdown": false,
"is_admin": true,
"is_linked_group_admin": false,
"is_member_manager": false,
"is_moderator": false,
"is_on_trial": true,
"is_trial": true,
"is_valid": true,
"last_message": null,
"last_payment": null,
"linked_group_id": null,
"linked_group_name": null,
"listId": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6KOu_8MKDA",
"logo_hash": null,
"logo_link": null,
"max_members": 20000,
"member_count": 1,
"message_archive": true,
"moderation_required": false,
"name": "fdfdf",
"number_awaiting_moderation": 0,
"openRateTrackingEnabled": true,
"payer_email": null,
"payment_interval": null,
"percent_off": 0,
"proMemberCountdownDate": null,
"sales_tax_rate": null,
"send_welcome_message": false,
"status": 0,
"sub_groups": [],
"subscription_breakdown": null,
"subscription_id": null,
"subscription_name": null,
"subscription_name_display": null,
"trial_days_left": 29,
"trial_ends": "2026-05-19T05:14:10.791824",
"useCustomDomain": false,
"valid_until": null
}
],
"linkGroups": [],
"newMembership": {
"customDomain": "",
"daily_digest": false,
"displayEmail": "ccssqq@gaggle.email",
"email": "ccssqq@gaggle.email",
"last_message": null,
"link": "dj6Jii4y4znh",
"linked_group_color_theme": null,
"linked_group_id": null,
"linked_group_logo_hash": null,
"linked_group_mnemonic": null,
"linked_group_name": null,
"listId": "ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6OOYj_QIDA",
"listStatus": 0,
"member_access_member_list": false,
"member_access_message_archive": true,
"member_can_send": true,
"membershipId": "ag1zfmdhZ2dsZS1tYWlschMLEgZNZW1iZXIYgIDow6KdnAkM",
"name": "ccssqq",
"send_immediately": true,
"status": 0,
"useCustomDomain": false
},
"success": true
}

# 获取邮箱信息列表，用来获取登录code

## 请求curl

curl 'https://gaggle.email/list/activity?list=luyis%40gaggle.email&stats=false&type=&filter=&offset=0&count=25' \
 -H 'accept: application/json, text/javascript, _/_; q=0.01' \
 -H 'accept-language: zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6' \
 -b '\_clck=8j1rtc%5E2%5Eg5c%5E0%5E2300; session=eyJhbGciOiJSUzI1NiIsImtpZCI6InU5VmJ5USJ9.eyJpc3MiOiJodHRwczovL3Nlc3Npb24uZmlyZWJhc2UuZ29vZ2xlLmNvbS9nYWdnbGUtbWFpbCIsIm5hbWUiOiJ4eCB2diIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NLYmhId2puMUZhYXA1clBRZFlwdGtuT0dKQTd2Zm1wOE9TeWduTVZFOHpDUU4yY1pRXHUwMDNkczk2LWMiLCJhdWQiOiJnYWdnbGUtbWFpbCIsImF1dGhfdGltZSI6MTc3NjU3NDg1MCwidXNlcl9pZCI6InFCWkh3dnZrVmRlNWhQR3M1Z3B2ZXNKS3dzQjIiLCJzdWIiOiJxQlpId3Z2a1ZkZTVoUEdzNWdwdmVzSkt3c0IyIiwiaWF0IjoxNzc2NTc0ODUxLCJleHAiOjE3Nzc3ODQ0NTEsImVtYWlsIjoiMTExcGVuZ3dlaUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJnb29nbGUuY29tIjpbIjExNzcxMzQyNDg1ODYyMTE1NDY3OSJdLCJlbWFpbCI6WyIxMTFwZW5nd2VpQGdtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6Imdvb2dsZS5jb20ifX0.QY-lKnSY2g-u_zV7DbSEPSNvIYwyU2MsZycKFsDffBEjtSER21-oy-P34jP40MJLNse8aNnPaoPDqIm00Orof36Mu0PSlKsx4ooVjGQxjtCZ_fcEKhxt9unk61naRHhRx81M7wkVO5QWTuKEyL6845XqZNTMrFYAHY3hOEAhwLOjF2jknyGzA2_pBNfbDwUAjfx_DJnVE_0bIPlGYoIZ1Wolj-1XVitV2cjfu9WMYKj9X3L2w5RHuZCg65lAlOF3l1xRRGcc6zKQk35qsmu8HQV807kc56kqR2reeX8kotbOwLerEKRF4wtvPbkfnZFkMqMvS2T7_uv_57mBKirzFg; GAGGLE_REFERER_KEY="{\"cookie_id\": \"Ig7v6cyU7j4khLuAODwbj1dqloHjXSd3\"\054 \"has_account\": true}"; **stripe_mid=f0a597e2-c074-436b-b6ca-55f728fcf0597797c5; **stripe_sid=cab0930c-2b1e-4ffe-a009-99157e6892ac0267bb; lastDashboardTab=/home/dashboard; \_clsk=10xy243%5E1776575850222%5E15%5E1%5Ez.clarity.ms%2Fcollect' \
 -H 'priority: u=1, i' \
 -H 'referer: https://gaggle.email/g/luyis@gaggle.email/activity' \
 -H 'sec-ch-ua: "Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"' \
 -H 'sec-ch-ua-mobile: ?0' \
 -H 'sec-ch-ua-platform: "macOS"' \
 -H 'sec-fetch-dest: empty' \
 -H 'sec-fetch-mode: cors' \
 -H 'sec-fetch-site: same-origin' \
 -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0' \
 -H 'x-requested-with: XMLHttpRequest'

## 参数

传递 list 设置对应的邮箱来获取数据

## 响应

{
"date": "2026-04-19T05:17:34.548396",
"events": [
[
"2026-04-17T09:08:52.032552",
"38",
"Your ChatGPT code is 013646",
"noreply@tm.openai.com",
"",
"Sender does not have permission to send to group"
],
[
"2026-04-17T09:06:54.947574",
"38",
"你的 ChatGPT 代码为 642496",
"noreply@tm.openai.com",
"",
"Sender does not have permission to send to group"
],
[
"2026-04-17T09:05:34.745854",
"0",
"111pengwei@gmail.com",
"xx vv",
"",
""
]
],
"offset": 3,
"query": null
}

解析里面"Your ChatGPT code is 013646", 的数值当作验证码code

# 删除临时邮箱

## curl 请求

curl 'https://gaggle.email/list/delete' \
 -H 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,_/_;q=0.8,application/signed-exchange;v=b3;q=0.7' \
 -H 'accept-language: zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6' \
 -H 'cache-control: max-age=0' \
 -H 'content-type: application/x-www-form-urlencoded' \
 -b '\_clck=8j1rtc%5E2%5Eg5c%5E0%5E2300; session=eyJhbGciOiJSUzI1NiIsImtpZCI6InU5VmJ5USJ9.eyJpc3MiOiJodHRwczovL3Nlc3Npb24uZmlyZWJhc2UuZ29vZ2xlLmNvbS9nYWdnbGUtbWFpbCIsIm5hbWUiOiJ4eCB2diIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NLYmhId2puMUZhYXA1clBRZFlwdGtuT0dKQTd2Zm1wOE9TeWduTVZFOHpDUU4yY1pRXHUwMDNkczk2LWMiLCJhdWQiOiJnYWdnbGUtbWFpbCIsImF1dGhfdGltZSI6MTc3NjU3NDg1MCwidXNlcl9pZCI6InFCWkh3dnZrVmRlNWhQR3M1Z3B2ZXNKS3dzQjIiLCJzdWIiOiJxQlpId3Z2a1ZkZTVoUEdzNWdwdmVzSkt3c0IyIiwiaWF0IjoxNzc2NTc0ODUxLCJleHAiOjE3Nzc3ODQ0NTEsImVtYWlsIjoiMTExcGVuZ3dlaUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJnb29nbGUuY29tIjpbIjExNzcxMzQyNDg1ODYyMTE1NDY3OSJdLCJlbWFpbCI6WyIxMTFwZW5nd2VpQGdtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6Imdvb2dsZS5jb20ifX0.QY-lKnSY2g-u_zV7DbSEPSNvIYwyU2MsZycKFsDffBEjtSER21-oy-P34jP40MJLNse8aNnPaoPDqIm00Orof36Mu0PSlKsx4ooVjGQxjtCZ_fcEKhxt9unk61naRHhRx81M7wkVO5QWTuKEyL6845XqZNTMrFYAHY3hOEAhwLOjF2jknyGzA2_pBNfbDwUAjfx_DJnVE_0bIPlGYoIZ1Wolj-1XVitV2cjfu9WMYKj9X3L2w5RHuZCg65lAlOF3l1xRRGcc6zKQk35qsmu8HQV807kc56kqR2reeX8kotbOwLerEKRF4wtvPbkfnZFkMqMvS2T7_uv_57mBKirzFg; GAGGLE_REFERER_KEY="{\"cookie_id\": \"Ig7v6cyU7j4khLuAODwbj1dqloHjXSd3\"\054 \"has_account\": true}"; **stripe_mid=f0a597e2-c074-436b-b6ca-55f728fcf0597797c5; lastDashboardTab=/home/dashboard; **stripe_sid=f457b2ae-ec7e-4f97-b6cf-97a509c968335581ea; \_clsk=xgziyp%5E1776579366257%5E5%5E1%5Ez.clarity.ms%2Fcollect' \
 -H 'origin: https://gaggle.email' \
 -H 'priority: u=0, i' \
 -H 'referer: https://gaggle.email/g/ccssqq@gaggle.email/settings' \
 -H 'sec-ch-ua: "Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"' \
 -H 'sec-ch-ua-arch: "arm"' \
 -H 'sec-ch-ua-bitness: "64"' \
 -H 'sec-ch-ua-full-version-list: "Not:A-Brand";v="99.0.0.0", "Microsoft Edge";v="145.0.3800.70", "Chromium";v="145.0.7632.110"' \
 -H 'sec-ch-ua-mobile: ?0' \
 -H 'sec-ch-ua-model: ""' \
 -H 'sec-ch-ua-platform: "macOS"' \
 -H 'sec-ch-ua-platform-version: "26.2.0"' \
 -H 'sec-ch-ua-wow64: ?0' \
 -H 'sec-fetch-dest: document' \
 -H 'sec-fetch-mode: navigate' \
 -H 'sec-fetch-site: same-origin' \
 -H 'sec-fetch-user: ?1' \
 -H 'upgrade-insecure-requests: 1' \
 -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0' \
 --data-raw 'listId=ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6OOYj_QIDA'

# 修改邮箱状态，谁发的邮件都可以接受

## 参数

listid 是groups，列表下，邮箱一样的item里的listid。
把 新增邮箱返回的listid 替换掉 ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6JPOy8QIDA

## curl

curl 'https://gaggle.email/list/settings/ag1zfmdhZ2dsZS1tYWlschELEgRMaXN0GICA6JPOy8QIDA' \
 -X 'PATCH' \
 -H 'accept: application/json, text/javascript, _/_; q=0.01' \
 -H 'accept-language: zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6' \
 -H 'content-type: application/json' \
 -b '_clck=8j1rtc%5E2%5Eg5c%5E0%5E2300; **stripe_mid=f0a597e2-c074-436b-b6ca-55f728fcf0597797c5; **stripe_sid=b1c76897-93ef-4bdb-9ca0-c77c53d733d930d595; GAGGLE_REFERER_KEY="{\"cookie_id\": \"Ig7v6cyU7j4khLuAODwbj1dqloHjXSd3\"\054 \"has_account\": true}"; session=eyJhbGciOiJSUzI1NiIsImtpZCI6InU5VmJ5USJ9.eyJpc3MiOiJodHRwczovL3Nlc3Npb24uZmlyZWJhc2UuZ29vZ2xlLmNvbS9nYWdnbGUtbWFpbCIsIm5hbWUiOiJ4eCB2diIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NLYmhId2puMUZhYXA1clBRZFlwdGtuT0dKQTd2Zm1wOE9TeWduTVZFOHpDUU4yY1pRXHUwMDNkczk2LWMiLCJhdWQiOiJnYWdnbGUtbWFpbCIsImF1dGhfdGltZSI6MTc3NjYxMTEyMywidXNlcl9pZCI6InFCWkh3dnZrVmRlNWhQR3M1Z3B2ZXNKS3dzQjIiLCJzdWIiOiJxQlpId3Z2a1ZkZTVoUEdzNWdwdmVzSkt3c0IyIiwiaWF0IjoxNzc2NjExMTI1LCJleHAiOjE3Nzc4MjA3MjUsImVtYWlsIjoiMTExcGVuZ3dlaUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJnb29nbGUuY29tIjpbIjExNzcxMzQyNDg1ODYyMTE1NDY3OSJdLCJlbWFpbCI6WyIxMTFwZW5nd2VpQGdtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6Imdvb2dsZS5jb20ifX0.mCBgeRlyu6NxiFUvGIqafSG0hRmem7qi9wZ9W6bBtwvrAlHDh4wf_XW_Pl8pR-QJ0ukBJ6AwVirzI1STIjR02Oxat4UVmh3OcXcHy8nW3aAQy-lLDe2aWAmaVYiVIaMB7ZoC6wct9g4Kpb9A5zSYxWVxojSbgG50vRIIhgTO7JElbbJHcrW80Ght1brhM7J2dJSJQnpqt7T6L9A6Jhd4HI7LQ0hRc149Cvb4iYzO1RAmE91TvwpPfY2JSDW4C7SMDIiUf3u7ijVq9OdRKRUxItmVwFVihz30s0ERZ430SH_d1-BJeD6OF1GRXn9TdKwyhHjNquIYMeN_-tjCnAhgmg; lastDashboardTab=/org/xxvv/dashboard; \_clsk=9vsty1%5E1776611926694%5E43%5E1%5Ev.clarity.ms%2Fcollect' \
 -H 'origin: https://gaggle.email' \
 -H 'priority: u=1, i' \
 -H 'referer: https://gaggle.email/g/ssss12@gaggle.email/settings' \
 -H 'sec-ch-ua: "Not:A-Brand";v="99", "Microsoft Edge";v="145", "Chromium";v="145"' \
 -H 'sec-ch-ua-mobile: ?0' \
 -H 'sec-ch-ua-platform: "macOS"' \
 -H 'sec-fetch-dest: empty' \
 -H 'sec-fetch-mode: cors' \
 -H 'sec-fetch-site: same-origin' \
 -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0' \
 -H 'x-requested-with: XMLHttpRequest' \
 --data-raw '{"whoCanSend":"anyone"}'




4859540167669109 ---- 03/30 ---- 786 ---- +12056095738 ---- http://a.62-us.com/api/get_sms?key=1f7fde01e95fbf71fcec2fcf7d449709 ---- JOSHUA HABERS ---- 1114 CAMELOT PLACE, HOLLAND MI 49423, US