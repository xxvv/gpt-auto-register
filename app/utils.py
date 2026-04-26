"""
工具函数模块
包含通用的辅助函数
"""

import random
import string
import os
import re
import time
from datetime import datetime
from typing import Callable
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .config import (
    cfg,
    PROJECT_ROOT,
    PASSWORD_LENGTH,
    PASSWORD_CHARS,
    HTTP_MAX_RETRIES,
    USER_AGENT,
    MIN_AGE,
    MAX_AGE
)

# 尝试导入 Faker 库
try:
    from faker import Faker
    # 创建多语言环境的 Faker 实例（英语为主，增加真实感）
    fake = Faker(['en_US', 'en_GB'])
    # 设置随机种子以确保可重复性（可选）
    # Faker.seed(0)
    FAKER_AVAILABLE = True
    print("✅ Faker 库已加载，将使用更真实的假数据")
except ImportError:
    FAKER_AVAILABLE = False
    print("⚠️ Faker 库未安装，将使用内置姓名列表")
    print("   安装命令: pip install Faker")

# ============================================================
# 常用英文名字库（用于随机生成用户姓名）
# ============================================================

FIRST_NAMES = [
    # 男性名字
    "James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph",
    "Thomas", "Charles", "Christopher", "Daniel", "Matthew", "Anthony", "Mark",
    "Donald", "Steven", "Paul", "Andrew", "Joshua", "Kenneth", "Kevin", "Brian",
    "George", "Timothy", "Ronald", "Edward", "Jason", "Jeffrey", "Ryan",
    # 女性名字
    "Mary", "Patricia", "Jennifer", "Linda", "Barbara", "Elizabeth", "Susan",
    "Jessica", "Sarah", "Karen", "Lisa", "Nancy", "Betty", "Margaret", "Sandra",
    "Ashley", "Kimberly", "Emily", "Donna", "Michelle", "Dorothy", "Carol",
    "Amanda", "Melissa", "Deborah", "Stephanie", "Rebecca", "Sharon", "Laura", "Cynthia"
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
    "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
    "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen",
    "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell"
]


def create_http_session():
    """
    创建带有重试机制的 HTTP Session
    
    返回:
        requests.Session: 配置好重试策略的 Session 对象
    """
    session = requests.Session()
    retry_strategy = Retry(
        total=HTTP_MAX_RETRIES,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "POST", "OPTIONS"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


# 创建全局 HTTP Session
http_session = create_http_session()

IP_DISCOVERY_ENDPOINTS = (
    {
        "url": "https://api.ipify.org?format=json",
        "kind": "json",
        "fields": ("ip",),
    },
    {
        "url": "https://api64.ipify.org?format=json",
        "kind": "json",
        "fields": ("ip",),
    },
    {
        "url": "https://ifconfig.me/all.json",
        "kind": "json",
        "fields": ("ip_addr", "ip"),
    },
    {
        "url": "https://icanhazip.com",
        "kind": "text",
        "fields": (),
    },
)

GEO_LOOKUP_ENDPOINTS = (
    {"url": "https://ipwho.is/{ip}", "provider": "ipwho.is"},
    {"url": "https://ipapi.co/{ip}/json/", "provider": "ipapi.co"},
)


def build_requests_proxies(proxy: dict) -> dict:
    """
    将代理配置字典转换为 requests 库的 proxies 参数格式。
    proxy 未启用时返回空字典（不使用代理）。
    """
    if not proxy or not proxy.get("enabled"):
        return {}
    host = proxy.get("host", "").strip()
    port = int(proxy.get("port", 8080))
    ptype = proxy.get("type", "http").lower()
    use_auth = proxy.get("use_auth", False)
    username = proxy.get("username", "")
    password = proxy.get("password", "")

    # socks5h 让代理服务器解析 DNS（避免 DNS 泄漏）
    scheme = "socks5h" if ptype == "socks5" else "http"
    if use_auth and username:
        proxy_url = f"{scheme}://{username}:{password}@{host}:{port}"
    else:
        proxy_url = f"{scheme}://{host}:{port}"

    return {"http": proxy_url, "https": proxy_url}


def describe_proxy(proxy: dict | None) -> str:
    """返回适合日志展示的代理描述。"""
    if not proxy or not proxy.get("enabled"):
        return "未启用代理"

    ptype = str(proxy.get("type", "http") or "http").lower()
    host = str(proxy.get("host", "") or "").strip() or "?"
    try:
        port = int(proxy.get("port", 0) or 0)
    except (TypeError, ValueError):
        port = 0

    auth_suffix = ""
    if proxy.get("use_auth") and proxy.get("username"):
        auth_suffix = " (auth)"

    port_suffix = f":{port}" if port > 0 else ""
    return f"{ptype}://{host}{port_suffix}{auth_suffix}"


def _build_probe_session(session_factory: Callable[[], requests.Session] | None = None):
    session = session_factory() if session_factory else requests.Session()
    if hasattr(session, "trust_env"):
        session.trust_env = False
    headers = getattr(session, "headers", None)
    if headers is not None:
        headers.setdefault("User-Agent", USER_AGENT)
        headers.setdefault("Accept", "application/json,text/plain;q=0.9,*/*;q=0.8")
    return session


def _extract_ip_from_response(response, endpoint: dict) -> str:
    if endpoint["kind"] == "json":
        try:
            payload = response.json()
        except Exception:
            payload = {}
        for field in endpoint.get("fields", ()):
            value = str(payload.get(field, "") or "").strip()
            if value:
                return value
        return ""

    text = str(getattr(response, "text", "") or "").strip()
    if not text:
        return ""
    return text.splitlines()[0].strip()


def _normalize_geo_payload(payload: dict, provider: str) -> dict:
    if provider == "ipwho.is":
        if payload.get("success") is False:
            return {
                "ok": False,
                "reason": str(payload.get("message") or "geo_lookup_failed"),
            }
        return {
            "ok": True,
            "country": str(payload.get("country", "") or ""),
            "country_code": str(payload.get("country_code", "") or "").upper(),
            "region": str(payload.get("region", "") or ""),
            "city": str(payload.get("city", "") or ""),
            "asn": str(payload.get("connection", {}).get("asn", "") or ""),
            "org": str(payload.get("connection", {}).get("org", "") or ""),
        }

    if payload.get("error"):
        reason = payload.get("reason") or payload.get("message") or "geo_lookup_failed"
        return {"ok": False, "reason": str(reason)}

    return {
        "ok": True,
        "country": str(payload.get("country_name", "") or payload.get("country", "") or ""),
        "country_code": str(payload.get("country_code", "") or "").upper(),
        "region": str(payload.get("region", "") or ""),
        "city": str(payload.get("city", "") or ""),
        "asn": str(payload.get("asn", "") or ""),
        "org": str(payload.get("org", "") or ""),
    }


def lookup_ip_geolocation(
    ip: str,
    timeout: int = 8,
    session_factory: Callable[[], requests.Session] | None = None,
):
    """
    查询出口 IP 的地理位置。
    查询失败时不抛异常，返回 {"ok": False, "reason": "..."}。
    """
    ip = str(ip or "").strip()
    if not ip:
        return {"ok": False, "reason": "missing_ip"}

    session = _build_probe_session(session_factory=session_factory)
    last_error = "geo_lookup_failed"

    for endpoint in GEO_LOOKUP_ENDPOINTS:
        url = endpoint["url"].format(ip=ip)
        started = time.perf_counter()
        try:
            resp = session.get(url, timeout=timeout)
            if resp.status_code != 200:
                last_error = f"{endpoint['provider']} HTTP {resp.status_code}"
                continue
            payload = resp.json()
            normalized = _normalize_geo_payload(payload, endpoint["provider"])
            if not normalized.get("ok"):
                last_error = str(normalized.get("reason") or "geo_lookup_failed")
                continue
            normalized.update(
                {
                    "ok": True,
                    "ip": ip,
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                    "source": endpoint["provider"],
                }
            )
            return normalized
        except Exception as exc:
            last_error = f"{endpoint['provider']} 请求失败: {exc}"

    return {"ok": False, "reason": last_error, "ip": ip}


def probe_proxy_connectivity(
    proxy: dict | None,
    timeout: int = 10,
    session_factory: Callable[[], requests.Session] | None = None,
    geo_lookup: Callable[[str, int], dict] | None = None,
    endpoints: tuple[dict, ...] | None = None,
):
    """
    用 requests 通过代理探测出口 IP、延迟和国家信息。
    """
    if not proxy or not proxy.get("enabled"):
        return {
            "ok": True,
            "skipped": True,
            "reason": "proxy_disabled",
            "proxy": describe_proxy(proxy),
        }

    host = str(proxy.get("host", "") or "").strip()
    try:
        port = int(proxy.get("port", 0) or 0)
    except (TypeError, ValueError):
        port = 0

    proxy_label = describe_proxy(proxy)
    if not host or port <= 0:
        return {
            "ok": False,
            "proxy": proxy_label,
            "reason": "代理已启用，但 host/port 配置无效",
        }

    session = _build_probe_session(session_factory=session_factory)
    proxies = build_requests_proxies(proxy)
    if hasattr(session, "proxies"):
        session.proxies = proxies

    last_error = "未获取到出口 IP"
    errors = []

    probe_endpoints = endpoints or IP_DISCOVERY_ENDPOINTS

    for endpoint in probe_endpoints:
        started = time.perf_counter()
        try:
            resp = session.get(
                endpoint["url"],
                timeout=timeout,
                headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
            )
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            if resp.status_code != 200:
                last_error = f"{endpoint['url']} 返回 HTTP {resp.status_code}"
                errors.append(last_error)
                continue

            ip = _extract_ip_from_response(resp, endpoint)
            if not ip:
                last_error = f"{endpoint['url']} 响应中未解析到出口 IP"
                errors.append(last_error)
                continue

            result = {
                "ok": True,
                "proxy": proxy_label,
                "ip": ip,
                "latency_ms": elapsed_ms,
                "ip_source": endpoint["url"],
            }

            geo_result = (
                geo_lookup(ip, min(timeout, 8))
                if geo_lookup
                else lookup_ip_geolocation(ip, timeout=min(timeout, 8))
            )
            if geo_result.get("ok"):
                result.update(
                    {
                        "country": geo_result.get("country", ""),
                        "country_code": geo_result.get("country_code", ""),
                        "region": geo_result.get("region", ""),
                        "city": geo_result.get("city", ""),
                        "geo_source": geo_result.get("source", ""),
                        "geo_latency_ms": geo_result.get("latency_ms"),
                    }
                )
            else:
                result["geo_reason"] = geo_result.get("reason", "geo_lookup_failed")

            return result
        except requests.exceptions.ProxyError as exc:
            last_error = f"代理握手失败: {exc}"
        except requests.exceptions.ConnectTimeout:
            last_error = f"连接代理超时（>{timeout}s）"
        except requests.exceptions.ReadTimeout:
            last_error = f"代理响应超时（>{timeout}s）"
        except requests.exceptions.RequestException as exc:
            last_error = f"代理请求失败: {exc}"
        except Exception as exc:
            last_error = f"代理探测异常: {exc}"

        errors.append(last_error)

    return {
        "ok": False,
        "proxy": proxy_label,
        "reason": last_error,
        "errors": errors,
    }


def format_probe_location(details: dict) -> str:
    country = str(details.get("country", "") or "").strip()
    country_code = str(details.get("country_code", "") or "").strip().upper()
    city = str(details.get("city", "") or "").strip()

    parts = []
    if country:
        if country_code and country_code not in country:
            parts.append(f"{country} ({country_code})")
        else:
            parts.append(country)
    elif country_code:
        parts.append(country_code)

    if city:
        parts.append(city)

    return " / ".join(parts) or "未知地区"


def ensure_proxy_ready(proxy: dict | None, purpose: str = "代理链路", timeout: int = 10):
    """
    代理启用时执行预检；失败则抛出 RuntimeError。
    """
    result = probe_proxy_connectivity(proxy, timeout=timeout)
    if result.get("skipped"):
        return result

    print(f"🩺 代理预检（{purpose}）...")
    print(f"  🌐 代理配置: {result.get('proxy', 'unknown')}")

    if not result.get("ok"):
        print(f"  ❌ 代理预检失败: {result.get('reason', 'unknown_error')}")
        raise RuntimeError(f"{purpose} 失败：{result.get('reason', 'unknown_error')}")

    print(
        f"  ✅ 请求链路可用: {result.get('ip', 'unknown')} | "
        f"{format_probe_location(result)} | {result.get('latency_ms', '?')} ms"
    )
    if result.get("geo_reason"):
        print(f"  ℹ️ 出口地区识别失败: {result['geo_reason']}")
    return result


def configure_http_proxy(proxy: dict):
    """更新全局 http_session 的代理设置（影响 mailtm 等所有 requests 调用）。"""
    proxies = build_requests_proxies(proxy)
    if proxies:
        http_session.proxies.update(proxies)
        print(f"  🌐 HTTP Session 已配置代理: {list(proxies.values())[0]}")
    else:
        http_session.proxies.clear()


def get_user_agent():
    """
    获取 User-Agent 字符串
    
    返回:
        str: User-Agent
    """
    return USER_AGENT


def generate_random_password(length=None):
    """
    生成随机密码
    确保密码包含大写字母、小写字母、数字和特殊字符
    
    参数:
        length: 密码长度，默认使用配置文件中的值
    
    返回:
        str: 生成的密码
    """
    if length is None:
        length = PASSWORD_LENGTH
    
    # 先随机生成指定长度的密码
    password = ''.join(random.choice(PASSWORD_CHARS) for _ in range(length))
    
    # 确保包含各类字符（替换前4位）
    password = (
        random.choice(string.ascii_uppercase) +   # 大写字母
        random.choice(string.ascii_lowercase) +   # 小写字母
        random.choice(string.digits) +            # 数字
        random.choice("!@#$%") +                  # 特殊字符
        password[4:]                              # 剩余部分
    )
    
    print(f"✅ 已生成密码: {password}")
    return password


def save_to_txt(email: str, password: str = None, status="已注册",
               mailtm_password: str = None, provider: str = "mailtm"):
    """
    保存账号信息到 TXT 文件
    格式: 邮箱|ChatGPT密码|时间|状态|临时邮箱凭证|提供商
    如果账号已存在，则更新其信息
    """
    try:
        file_path = cfg.files.accounts_file
        if not os.path.isabs(file_path):
            file_path = os.path.join(PROJECT_ROOT, file_path)
        os.makedirs(os.path.dirname(file_path) or ".", exist_ok=True)
        current_date = datetime.now().strftime("%Y%m%d_%H%M%S")

        # 读取现有内容
        lines = []
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

        # 检查是否已存在，存在则更新
        found = False
        credential = mailtm_password or ''
        new_line_content = f"{email}|{password or 'N/A'}|{current_date}|{status}|{credential}|{provider}\n"

        for i, line in enumerate(lines):
            if line.startswith(f"{email}|"):
                parts = line.strip().split("|")
                final_password = password if password else (parts[1] if len(parts) > 1 else 'N/A')
                final_cred = credential if credential else (parts[4] if len(parts) > 4 else '')
                final_provider = provider if provider else (parts[5] if len(parts) > 5 else 'mailtm')
                lines[i] = f"{email}|{final_password}|{current_date}|{status}|{final_cred}|{final_provider}\n"
                found = True
                break

        if not found:
            lines.append(new_line_content)

        # 写回文件
        with open(file_path, "w", encoding="utf-8") as f:
            f.writelines(lines)

        print(f"💾 账号状态已更新: {status}")

    except Exception as e:
        print(f"❌ 保存/更新账号信息失败: {e}")


def update_account_status(email: str, new_status: str, password: str = None, provider: str = "mailtm"):
    """更新账号状态"""
    save_to_txt(email, password, new_status, provider=provider)


def extract_verification_code(content: str):
    """
    从邮件内容中提取 6 位数字验证码
    
    参数:
        content: 邮件内容（HTML 或纯文本）
    
    返回:
        str: 提取到的验证码，未找到返回 None
    """
    if not content:
        return None
    
    # 验证码匹配模式（按优先级排列）
    patterns = [
        r'代码为\s*(\d{6})',                   # 中文格式
        r'code is\s*(\d{6})',                  # 英文格式
        r'verification code[:\s]*(\d{6})',     # 完整英文格式
        r'your code[:\s]*(\d{6})',             # "Your code: XXXXXX"
        r'(?:^|\s|>)(\d{6})(?:\s|<|$)',       # 独立出现的 6 位数（带边界）
    ]

    # 过滤掉明显不是验证码的数字（年月、版权年等）
    false_positives = {
        "202601", "202602", "202603", "202604", "202605", "202606",
        "202607", "202608", "202609", "202610", "202611", "202612",
        "202501", "202512", "123456", "000000", "100000",
    }

    for pattern in patterns:
        matches = re.findall(pattern, content, re.IGNORECASE)
        for code in matches:
            if code not in false_positives:
                print(f"  ✅ 提取到验证码: {code}")
                return code

    return None


def generate_random_name():
    """
    生成随机英文姓名
    
    使用 Faker 库生成更真实的姓名，如果 Faker 不可用则回退到内置列表
    
    返回:
        str: 格式为 "FirstName LastName" 的随机姓名
    """
    if FAKER_AVAILABLE:
        # 使用 Faker 直接生成名和姓，避免前缀后缀问题
        # 随机选择生成男性或女性名字
        if random.choice([True, False]):
            first_name = fake.first_name_male()
        else:
            first_name = fake.first_name_female()
        
        last_name = fake.last_name()
        full_name = f"{first_name} {last_name}"
    else:
        # 回退到内置列表
        first_name = random.choice(FIRST_NAMES)
        last_name = random.choice(LAST_NAMES)
        full_name = f"{first_name} {last_name}"
    
    print(f"✅ 已生成随机姓名: {full_name}")
    return full_name


def generate_random_birthday():
    """
    生成随机生日
    确保年龄在配置的范围内（MIN_AGE 到 MAX_AGE）
    
    使用 Faker 库生成更真实的生日日期
    
    返回:
        tuple: (年份字符串, 月份字符串, 日期字符串)
               例如: ("1995", "03", "15")
    """
    if FAKER_AVAILABLE:
        # 使用 Faker 生成符合年龄范围的生日
        birthday = fake.date_of_birth(minimum_age=MIN_AGE, maximum_age=MAX_AGE)
        year_str = str(birthday.year)
        month_str = str(birthday.month).zfill(2)
        day_str = str(birthday.day).zfill(2)
    else:
        # 回退到原始逻辑
        from datetime import datetime as dt
        today = dt.now()
        
        min_birth_year = today.year - MAX_AGE
        max_birth_year = today.year - MIN_AGE
        birth_year = random.randint(min_birth_year, max_birth_year)
        birth_month = random.randint(1, 12)
        
        if birth_month in [1, 3, 5, 7, 8, 10, 12]:
            max_day = 31
        elif birth_month in [4, 6, 9, 11]:
            max_day = 30
        else:
            if (birth_year % 4 == 0 and birth_year % 100 != 0) or (birth_year % 400 == 0):
                max_day = 29
            else:
                max_day = 28
        
        birth_day = random.randint(1, max_day)
        
        year_str = str(birth_year)
        month_str = str(birth_month).zfill(2)
        day_str = str(birth_day).zfill(2)
    
    print(f"✅ 已生成随机生日: {year_str}/{month_str}/{day_str}")
    return year_str, month_str, day_str


def generate_user_info():
    """
    生成完整的随机用户信息
    
    返回:
        dict: 包含姓名和生日的字典
              {
                  'name': 'John Smith',
                  'year': '1995',
                  'month': '03',
                  'day': '15'
              }
    """
    name = generate_random_name()
    year, month, day = generate_random_birthday()
    
    return {
        'name': name,
        'year': year,
        'month': month,
        'day': day
    }


def generate_japan_address():
    """
    生成随机日本地址
    使用 Faker 生成更真实多样的日本地址
    """
    if FAKER_AVAILABLE:
        # 日本主要城市的区域信息
        tokyo_wards = [
            {"ward": "Chiyoda-ku", "zip_prefix": "100"},
            {"ward": "Shibuya-ku", "zip_prefix": "150"},
            {"ward": "Shinjuku-ku", "zip_prefix": "160"},
            {"ward": "Minato-ku", "zip_prefix": "105"},
            {"ward": "Meguro-ku", "zip_prefix": "153"},
            {"ward": "Setagaya-ku", "zip_prefix": "154"},
            {"ward": "Nakano-ku", "zip_prefix": "164"},
            {"ward": "Toshima-ku", "zip_prefix": "170"},
        ]
        
        osaka_areas = [
            {"area": "Kita-ku", "zip_prefix": "530"},
            {"area": "Chuo-ku", "zip_prefix": "540"},
            {"area": "Nishi-ku", "zip_prefix": "550"},
            {"area": "Tennoji-ku", "zip_prefix": "543"},
        ]
        
        # 随机选择城市
        if random.random() < 0.7:  # 70% 东京
            ward_info = random.choice(tokyo_wards)
            addr = {
                "zip": f"{ward_info['zip_prefix']}-{random.randint(1000, 9999)}",
                "state": "Tokyo",
                "city": ward_info["ward"],
                "address1": f"{random.randint(1, 9)}-{random.randint(1, 30)}-{random.randint(1, 20)}"
            }
        else:  # 30% 大阪
            area_info = random.choice(osaka_areas)
            addr = {
                "zip": f"{area_info['zip_prefix']}-{random.randint(1000, 9999)}",
                "state": "Osaka",
                "city": area_info["area"],
                "address1": f"{random.randint(1, 9)}-{random.randint(1, 30)}-{random.randint(1, 20)}"
            }
    else:
        # 回退到旧的固定地址列表
        addresses = [
            {"zip": "100-0005", "state": "Tokyo", "city": "Chiyoda-ku", "address1": "1-1 Marunouchi"},
            {"zip": "160-0022", "state": "Tokyo", "city": "Shinjuku-ku", "address1": "3-14-1 Shinjuku"},
            {"zip": "150-0002", "state": "Tokyo", "city": "Shibuya-ku", "address1": "2-21-1 Shibuya"},
            {"zip": "530-0001", "state": "Osaka", "city": "Osaka-shi", "address1": "1-1 Umeda"},
        ]
        addr = random.choice(addresses)
        random_suffix = f"{random.randint(1, 9)}-{random.randint(1, 20)}"
        addr["address1"] = f"{addr['address1']} {random_suffix}"
    
    print(f"✅ 已生成日本地址: {addr['state']} {addr['city']} {addr['address1']}")
    return addr


def generate_us_address():
    """
    生成随机美国地址
    使用 Faker 生成真实风格的美国地址
    """
    if FAKER_AVAILABLE:
        # 使用美国 Faker
        fake_us = Faker('en_US')
        
        # 常见的免税或低税州（对支付友好）
        states = [
            {"name": "Delaware", "code": "DE", "cities": ["Wilmington", "Dover", "Newark"]},
            {"name": "Oregon", "code": "OR", "cities": ["Portland", "Salem", "Eugene"]},
            {"name": "Montana", "code": "MT", "cities": ["Billings", "Missoula", "Helena"]},
            {"name": "New Hampshire", "code": "NH", "cities": ["Manchester", "Nashua", "Concord"]},
        ]
        
        state_info = random.choice(states)
        city = random.choice(state_info["cities"])
        
        # 生成街道地址
        street_number = random.randint(100, 9999)
        street_names = ["Main St", "Oak Ave", "Maple Dr", "Cedar Ln", "Park Blvd", 
                       "Washington St", "Lincoln Ave", "Jefferson Dr", "Madison Ln"]
        street = random.choice(street_names)
        
        addr = {
            "zip": fake_us.zipcode_in_state(state_info["code"]) if hasattr(fake_us, 'zipcode_in_state') else f"{random.randint(10000, 99999)}",
            "state": state_info["name"],
            "city": city,
            "address1": f"{street_number} {street}"
        }
    else:
        # 回退到固定地址
        addr = {
            "zip": "10001",
            "state": "New York",
            "city": "New York",
            "address1": f"{random.randint(100, 999)} Main St"
        }
    
    print(f"✅ 已生成美国地址: {addr['city']}, {addr['state']} {addr['zip']}")
    return addr


def generate_billing_info(country="JP"):
    """
    生成完整的支付账单信息（姓名 + 地址）
    
    参数:
        country: 国家代码，"JP" 或 "US"
    
    返回:
        dict: 包含姓名和地址的完整账单信息
    """
    # 生成姓名
    name = generate_random_name()
    
    # 根据国家生成地址
    if country.upper() == "US":
        address = generate_us_address()
    else:
        address = generate_japan_address()
    
    billing_info = {
        "name": name,
        "zip": address["zip"],
        "state": address["state"],
        "city": address["city"],
        "address1": address["address1"],
        "country": country.upper()
    }
    
    print("📋 完整账单信息已生成:")
    print(f"   姓名: {billing_info['name']}")
    print(f"   地址: {billing_info['address1']}, {billing_info['city']}")
    print(f"   州/省: {billing_info['state']}, 邮编: {billing_info['zip']}")
    
    return billing_info
