"""
配置加载模块
从 config.yaml 文件加载配置，支持动态更新

使用方法:
    from config import cfg
    
    # 访问配置项
    total = cfg.registration.total_accounts
    email_domains = cfg.email.domains
    
    # 或者直接导入常量（兼容旧代码）
    from config import TOTAL_ACCOUNTS, EMAIL_DOMAINS
"""

import os
import sys
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Dict, Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ACCOUNTS_FILE = "data/accounts/registered_accounts.txt"
DEFAULT_TOKEN_DIR = "data/tokens"
DEFAULT_TOKEN_EXPORT_DIR = "token_exports"
DEFAULT_EMAIL_DOMAINS = ["nnai.website"]
_ACTIVE_OUTPUT_BATCH_ID: str | None = None


def _resolve_project_path(path_value: str | Path) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def output_batch_id() -> str:
    """Return the active output batch id, allocating today's next batch if needed."""
    global _ACTIVE_OUTPUT_BATCH_ID
    if _ACTIVE_OUTPUT_BATCH_ID:
        return _ACTIVE_OUTPUT_BATCH_ID

    _ACTIVE_OUTPUT_BATCH_ID = allocate_output_batch_id()
    return _ACTIVE_OUTPUT_BATCH_ID


def set_output_batch_id(batch_id: str | None) -> None:
    """Set the active output batch id for the current batch task."""
    global _ACTIVE_OUTPUT_BATCH_ID
    _ACTIVE_OUTPUT_BATCH_ID = str(batch_id or "").strip() or None


def allocate_output_batch_id(date_str: str | None = None) -> str:
    """Allocate the next YYYYMMDD_NNN batch id across account/export folders."""
    date_part = date_str or datetime.now().strftime("%Y%m%d")
    search_dirs = [
        _resolve_project_path("data/accounts"),
        _resolve_project_path("data/cpa"),
        _resolve_project_path("data/sub2api"),
    ]
    max_batch = 0
    for directory in search_dirs:
        if not directory.exists():
            continue
        for path in directory.glob(f"{date_part}_*.txt"):
            suffix = path.stem.removeprefix(f"{date_part}_")
            if suffix.isdigit():
                max_batch = max(max_batch, int(suffix))
    return f"{date_part}_{max_batch + 1:03d}"


def dated_accounts_file_path(path_value: str | Path | None = None) -> Path:
    """Return the active batch accounts TXT path for the default accounts file."""
    path = Path(path_value or DEFAULT_ACCOUNTS_FILE)

    if path.name == Path(DEFAULT_ACCOUNTS_FILE).name:
        path = path.with_name(f"{output_batch_id()}.txt")

    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def batch_export_file_path(kind: str, batch_id: str | None = None) -> Path:
    """Return data/<kind>/YYYYMMDD_NNN.txt for CPA/sub2api style exports."""
    safe_kind = str(kind or "").strip().lower()
    if safe_kind not in {"cpa", "sub2api"}:
        raise ValueError(f"未知批次导出类型: {kind}")
    return PROJECT_ROOT / "data" / safe_kind / f"{batch_id or output_batch_id()}.txt"

# 尝试导入 yaml，如果未安装则提示
try:
    import yaml
except ImportError:
    print("❌ 缺少 PyYAML 依赖，请先安装:")
    print("   pip install pyyaml")
    sys.exit(1)


# ==============================================================
# 配置数据类定义
# ==============================================================

@dataclass
class RegistrationConfig:
    """注册配置"""
    total_accounts: int = 1
    min_age: int = 20
    max_age: int = 40


@dataclass
class EmailConfig:
    """邮箱服务配置 (NNAI Worker)"""
    wait_timeout: int = 30
    poll_interval: int = 3
    domains: list[str] = field(default_factory=lambda: list(DEFAULT_EMAIL_DOMAINS))


@dataclass
class BrowserConfig:
    """浏览器配置"""
    max_wait_time: int = 600
    short_wait_time: int = 120
    user_agent: str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


@dataclass
class PasswordConfig:
    """密码配置"""
    length: int = 16
    charset: str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%"


@dataclass
class RetryConfig:
    """重试配置"""
    http_max_retries: int = 5
    http_timeout: int = 30
    error_page_max_retries: int = 5
    button_click_max_retries: int = 3


@dataclass
class BatchConfig:
    """批量注册配置"""
    interval_min: int = 5
    interval_max: int = 15


@dataclass
class FilesConfig:
    """文件路径配置"""
    accounts_file: str = DEFAULT_ACCOUNTS_FILE


@dataclass
class OAuthConfig:
    """Codex OAuth 配置"""
    issuer: str = "https://auth.openai.com"
    client_id: str = "app_EMoamEEZ73f0CkXaXp7hrann"
    redirect_uri: str = "http://localhost:1455/auth/callback"
    ak_file: str = f"{DEFAULT_TOKEN_EXPORT_DIR}/ak.txt"
    rk_file: str = f"{DEFAULT_TOKEN_EXPORT_DIR}/rk.txt"
    token_json_dir: str = DEFAULT_TOKEN_DIR


@dataclass
class CpaConfig:
    """CPA 上传配置"""
    upload_api_url: str = ""
    upload_api_token: str = ""


@dataclass
class CliproxyConfig:
    """CLIProxyAPI Token 池配置"""
    enabled: bool = False
    api_url: str = "http://localhost:8317"
    api_key: str = ""
    auth_dir: str = "~/.cli-proxy-api"


@dataclass
class Custom2925Config:
    """2925 自有邮箱配置"""
    enabled: bool = False
    base_email: str = "your-main-mail@2925.com"
    domain: str = "2925.com"
    alias_prefix: str = "youralias"
    alias_separator: str = "b"
    start_index: int = 1
    imap_host: str = "imap.2925.com"
    imap_port: int = 993
    imap_ssl: bool = True
    imap_user: str = "your-main-mail@2925.com"
    imap_password: str = ""
    mailbox: str = "INBOX"
    lookback_seconds: int = 300
    counter_file: str = "data/state/custom2925_counter.json"


@dataclass
class GaggleConfig:
    """Gaggle 邮箱配置"""
    cookie_header: str = ""
    csrf_token: str = ""


@dataclass
class OutlookEmailConfig:
    """OutlookEmail 外部邮箱池配置"""
    base_url: str = "http://localhost:5000"
    api_key: str = ""
    group_id: str = ""
    account_email: str = ""
    use_aliases: bool = True
    allow_reuse: bool = False
    registered_file: str = "data/state/outlookemail_registered.json"


@dataclass
class PaymentConfig:
    """注册后支付流程配置"""
    enabled_default: bool = False
    webshare_api_key: str = ""
    webshare_plan_id: str = ""
    proxy_debug_mode: bool = False
    debug_proxy_type: str = "http"
    debug_proxy_host: str = ""
    debug_proxy_port: int = 8080
    debug_proxy_use_auth: bool = False
    debug_proxy_username: str = ""
    debug_proxy_password: str = ""
    card_debug_mode: bool = False
    debug_card_key: str = ""
    card_keys_file: str = "card-keys.txt"
    card_usage_file: str = "data/state/card_keys_usage.json"
    request_payurl_api: str = "https://payurl.779.chat/api/request"
    redeem_api: str = "https://cards.779.chat/web-api/redeem/submit"
    redeem_device_id: str = "749d7aaf-67e0-4341-b5e6-0ecdf5ea2fb0"
    http_timeout: int = 30
    payurl_max_retries: int = 5
    webshare_poll_interval: int = 5
    webshare_poll_timeout: int = 180


@dataclass
class AppConfig:
    """应用程序完整配置"""
    registration: RegistrationConfig = field(default_factory=RegistrationConfig)
    email: EmailConfig = field(default_factory=EmailConfig)
    browser: BrowserConfig = field(default_factory=BrowserConfig)
    password: PasswordConfig = field(default_factory=PasswordConfig)
    retry: RetryConfig = field(default_factory=RetryConfig)
    batch: BatchConfig = field(default_factory=BatchConfig)
    files: FilesConfig = field(default_factory=FilesConfig)
    oauth: OAuthConfig = field(default_factory=OAuthConfig)
    cpa: CpaConfig = field(default_factory=CpaConfig)
    cliproxy: CliproxyConfig = field(default_factory=CliproxyConfig)
    custom2925: Custom2925Config = field(default_factory=Custom2925Config)
    gaggle: GaggleConfig = field(default_factory=GaggleConfig)
    outlookemail: OutlookEmailConfig = field(default_factory=OutlookEmailConfig)
    payment: PaymentConfig = field(default_factory=PaymentConfig)


# ==============================================================
# 配置加载器
# ==============================================================

class ConfigLoader:
    """
    配置加载器
    支持从 YAML 文件加载配置，并合并默认值
    """
    
    # 配置文件搜索路径（按优先级排序）
    CONFIG_FILES = [
        "config.yaml",
        "config.yml",
        "config.local.yaml",
        "config.local.yml",
    ]
    
    def __init__(self, config_path: Optional[str] = None):
        """
        初始化配置加载器
        
        参数:
            config_path: 指定配置文件路径，如果为 None 则自动搜索
        """
        self.config_path = config_path
        self.raw_config: Dict[str, Any] = {}
        self.config = AppConfig()
        
        self._load_config()
    
    def _find_config_file(self) -> Optional[Path]:
        """查找配置文件"""
        base_dir = PROJECT_ROOT
        
        for filename in self.CONFIG_FILES:
            config_file = base_dir / filename
            if config_file.exists():
                return config_file
        
        return None
    
    def _load_config(self) -> None:
        """加载配置文件"""
        if self.config_path:
            config_file = Path(self.config_path)
        else:
            config_file = self._find_config_file()
        
        if config_file is None or not config_file.exists():
            print("⚠️ 未找到配置文件 config.yaml")
            print("   请复制 config.example.yaml 为 config.yaml 并修改配置")
            print("   使用默认配置继续运行...")
            return
        
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                self.raw_config = yaml.safe_load(f) or {}
            
            self.config_path = str(config_file)
            print(f"📄 已加载配置文件: {config_file.name}")
            
            # 解析配置到数据类
            self._parse_config()
            
        except yaml.YAMLError as e:
            print(f"❌ 配置文件格式错误: {e}")
            sys.exit(1)
        except Exception as e:
            print(f"❌ 加载配置文件失败: {e}")
            sys.exit(1)
    
    def _parse_config(self) -> None:
        """解析原始配置到数据类"""
        # 注册配置
        if 'registration' in self.raw_config:
            reg = self.raw_config['registration']
            self.config.registration = RegistrationConfig(
                total_accounts=reg.get('total_accounts', 1),
                min_age=reg.get('min_age', 20),
                max_age=reg.get('max_age', 40)
            )
        
        # 邮箱配置
        if 'email' in self.raw_config:
            email = self.raw_config['email']
            self.config.email = EmailConfig(
                wait_timeout=email.get('wait_timeout', 120),
                poll_interval=email.get('poll_interval', 3),
                domains=self._as_list(
                    os.environ.get('NNAI_EMAIL_DOMAINS', email.get('domains', DEFAULT_EMAIL_DOMAINS))
                ),
            )
        elif os.environ.get('NNAI_EMAIL_DOMAINS'):
            self.config.email = EmailConfig(
                wait_timeout=self.config.email.wait_timeout,
                poll_interval=self.config.email.poll_interval,
                domains=self._as_list(os.environ.get('NNAI_EMAIL_DOMAINS')),
            )
        
        # 浏览器配置
        if 'browser' in self.raw_config:
            browser = self.raw_config['browser']
            self.config.browser = BrowserConfig(
                max_wait_time=browser.get('max_wait_time', 600),
                short_wait_time=browser.get('short_wait_time', 120),
                user_agent=browser.get('user_agent', '')
            )
        
        # 密码配置
        if 'password' in self.raw_config:
            pwd = self.raw_config['password']
            self.config.password = PasswordConfig(
                length=pwd.get('length', 16),
                charset=pwd.get('charset', '')
            )
        
        # 重试配置
        if 'retry' in self.raw_config:
            retry = self.raw_config['retry']
            self.config.retry = RetryConfig(
                http_max_retries=retry.get('http_max_retries', 5),
                http_timeout=retry.get('http_timeout', 30),
                error_page_max_retries=retry.get('error_page_max_retries', 5),
                button_click_max_retries=retry.get('button_click_max_retries', 3)
            )
        
        # 批量配置
        if 'batch' in self.raw_config:
            batch = self.raw_config['batch']
            self.config.batch = BatchConfig(
                interval_min=batch.get('interval_min', 5),
                interval_max=batch.get('interval_max', 15)
            )
        
        # 文件配置
        if 'files' in self.raw_config:
            files = self.raw_config['files']
            self.config.files = FilesConfig(
                accounts_file=files.get('accounts_file', DEFAULT_ACCOUNTS_FILE)
            )

        # OAuth 配置
        oauth = self.raw_config.get('oauth', {})
        self.config.oauth = OAuthConfig(
            issuer=os.environ.get('OAUTH_ISSUER', oauth.get('issuer', 'https://auth.openai.com')),
            client_id=os.environ.get('OAUTH_CLIENT_ID', oauth.get('client_id', 'app_EMoamEEZ73f0CkXaXp7hrann')),
            redirect_uri=os.environ.get('OAUTH_REDIRECT_URI', oauth.get('redirect_uri', 'http://localhost:1455/auth/callback')),
            ak_file=os.environ.get('OAUTH_AK_FILE', oauth.get('ak_file', f'{DEFAULT_TOKEN_EXPORT_DIR}/ak.txt')),
            rk_file=os.environ.get('OAUTH_RK_FILE', oauth.get('rk_file', f'{DEFAULT_TOKEN_EXPORT_DIR}/rk.txt')),
            token_json_dir=os.environ.get('OAUTH_TOKEN_JSON_DIR', oauth.get('token_json_dir', DEFAULT_TOKEN_DIR)),
        )

        # CPA 上传配置
        cpa = self.raw_config.get('cpa', {})
        self.config.cpa = CpaConfig(
            upload_api_url=os.environ.get('CPA_UPLOAD_API_URL', cpa.get('upload_api_url', '')),
            upload_api_token=os.environ.get('CPA_UPLOAD_API_TOKEN', cpa.get('upload_api_token', '')),
        )

        # CLIProxyAPI Token 池配置
        cliproxy = self.raw_config.get('cliproxy', {})
        cliproxy_env_enabled = any(
            key in os.environ
            for key in ('CLIPROXY_API_URL', 'CLIPROXY_API_KEY', 'CLIPROXY_AUTH_DIR')
        )
        self.config.cliproxy = CliproxyConfig(
            enabled=self._as_bool(
                os.environ.get(
                    'CLIPROXY_ENABLED',
                    cliproxy.get('enabled', False) or cliproxy_env_enabled,
                )
            ),
            api_url=os.environ.get('CLIPROXY_API_URL', cliproxy.get('api_url', 'http://localhost:8317')),
            api_key=os.environ.get('CLIPROXY_API_KEY', cliproxy.get('api_key', '')),
            auth_dir=os.environ.get('CLIPROXY_AUTH_DIR', cliproxy.get('auth_dir', '~/.cli-proxy-api')),
        )

        # 2925 自有邮箱配置
        custom2925 = self.raw_config.get('custom2925', {})
        self.config.custom2925 = Custom2925Config(
            enabled=self._as_bool(os.environ.get('CUSTOM2925_ENABLED', custom2925.get('enabled', False))),
            base_email=os.environ.get('CUSTOM2925_BASE_EMAIL', custom2925.get('base_email', 'your-main-mail@2925.com')),
            domain=os.environ.get('CUSTOM2925_DOMAIN', custom2925.get('domain', '2925.com')),
            alias_prefix=os.environ.get('CUSTOM2925_ALIAS_PREFIX', custom2925.get('alias_prefix', 'youralias')),
            alias_separator=os.environ.get('CUSTOM2925_ALIAS_SEPARATOR', custom2925.get('alias_separator', 'b')),
            start_index=int(os.environ.get('CUSTOM2925_START_INDEX', custom2925.get('start_index', 1))),
            imap_host=os.environ.get('CUSTOM2925_IMAP_HOST', custom2925.get('imap_host', 'imap.2925.com')),
            imap_port=int(os.environ.get('CUSTOM2925_IMAP_PORT', custom2925.get('imap_port', 993))),
            imap_ssl=self._as_bool(os.environ.get('CUSTOM2925_IMAP_SSL', custom2925.get('imap_ssl', True))),
            imap_user=os.environ.get('CUSTOM2925_IMAP_USER', custom2925.get('imap_user', 'your-main-mail@2925.com')),
            imap_password=os.environ.get('CUSTOM2925_IMAP_PASSWORD', custom2925.get('imap_password', '')),
            mailbox=os.environ.get('CUSTOM2925_MAILBOX', custom2925.get('mailbox', 'INBOX')),
            lookback_seconds=int(os.environ.get('CUSTOM2925_LOOKBACK_SECONDS', custom2925.get('lookback_seconds', 300))),
            counter_file=os.environ.get('CUSTOM2925_COUNTER_FILE', custom2925.get('counter_file', 'data/state/custom2925_counter.json')),
        )

        # Gaggle 邮箱配置
        gaggle = self.raw_config.get('gaggle', {})
        self.config.gaggle = GaggleConfig(
            cookie_header=os.environ.get('GAGGLE_COOKIE_HEADER', gaggle.get('cookie_header', '')),
            csrf_token=os.environ.get('GAGGLE_CSRF_TOKEN', gaggle.get('csrf_token', '')),
        )

        # OutlookEmail 外部邮箱池配置
        outlookemail = self.raw_config.get('outlookemail', {})
        self.config.outlookemail = OutlookEmailConfig(
            base_url=os.environ.get('OUTLOOKEMAIL_BASE_URL', outlookemail.get('base_url', 'http://localhost:5000')),
            api_key=os.environ.get('OUTLOOKEMAIL_API_KEY', outlookemail.get('api_key', '')),
            group_id=str(os.environ.get('OUTLOOKEMAIL_GROUP_ID', outlookemail.get('group_id', '')) or ''),
            account_email=os.environ.get('OUTLOOKEMAIL_ACCOUNT_EMAIL', outlookemail.get('account_email', '')),
            use_aliases=self._as_bool(os.environ.get('OUTLOOKEMAIL_USE_ALIASES', outlookemail.get('use_aliases', True))),
            allow_reuse=self._as_bool(os.environ.get('OUTLOOKEMAIL_ALLOW_REUSE', outlookemail.get('allow_reuse', False))),
            registered_file=os.environ.get('OUTLOOKEMAIL_REGISTERED_FILE', outlookemail.get('registered_file', 'data/state/outlookemail_registered.json')),
        )

        # 注册后支付流程配置
        payment = self.raw_config.get('payment', {})
        self.config.payment = PaymentConfig(
            enabled_default=self._as_bool(os.environ.get('PAYMENT_ENABLED_DEFAULT', payment.get('enabled_default', False))),
            webshare_api_key=os.environ.get('WEBSHARE_API_KEY', payment.get('webshare_api_key', '')),
            webshare_plan_id=os.environ.get('WEBSHARE_PLAN_ID', payment.get('webshare_plan_id', '')),
            proxy_debug_mode=self._as_bool(os.environ.get('PAYMENT_PROXY_DEBUG_MODE', payment.get('proxy_debug_mode', False))),
            debug_proxy_type=os.environ.get('PAYMENT_DEBUG_PROXY_TYPE', payment.get('debug_proxy_type', 'http')),
            debug_proxy_host=os.environ.get('PAYMENT_DEBUG_PROXY_HOST', payment.get('debug_proxy_host', '')),
            debug_proxy_port=int(os.environ.get('PAYMENT_DEBUG_PROXY_PORT', payment.get('debug_proxy_port', 8080))),
            debug_proxy_use_auth=self._as_bool(os.environ.get('PAYMENT_DEBUG_PROXY_USE_AUTH', payment.get('debug_proxy_use_auth', False))),
            debug_proxy_username=os.environ.get('PAYMENT_DEBUG_PROXY_USERNAME', payment.get('debug_proxy_username', '')),
            debug_proxy_password=os.environ.get('PAYMENT_DEBUG_PROXY_PASSWORD', payment.get('debug_proxy_password', '')),
            card_debug_mode=self._as_bool(os.environ.get('PAYMENT_CARD_DEBUG_MODE', payment.get('card_debug_mode', False))),
            debug_card_key=os.environ.get('PAYMENT_DEBUG_CARD_KEY', payment.get('debug_card_key', '')),
            card_keys_file=os.environ.get('PAYMENT_CARD_KEYS_FILE', payment.get('card_keys_file', 'card-keys.txt')),
            card_usage_file=os.environ.get('PAYMENT_CARD_USAGE_FILE', payment.get('card_usage_file', 'data/state/card_keys_usage.json')),
            request_payurl_api=os.environ.get('PAYMENT_REQUEST_PAYURL_API', payment.get('request_payurl_api', 'https://payurl.779.chat/api/request')),
            redeem_api=os.environ.get('PAYMENT_REDEEM_API', payment.get('redeem_api', 'https://cards.779.chat/web-api/redeem/submit')),
            redeem_device_id=os.environ.get('PAYMENT_REDEEM_DEVICE_ID', payment.get('redeem_device_id', '749d7aaf-67e0-4341-b5e6-0ecdf5ea2fb0')),
            http_timeout=int(os.environ.get('PAYMENT_HTTP_TIMEOUT', payment.get('http_timeout', 30))),
            payurl_max_retries=int(os.environ.get('PAYMENT_PAYURL_MAX_RETRIES', payment.get('payurl_max_retries', 5))),
            webshare_poll_interval=int(os.environ.get('WEBSHARE_POLL_INTERVAL', payment.get('webshare_poll_interval', 5))),
            webshare_poll_timeout=int(os.environ.get('WEBSHARE_POLL_TIMEOUT', payment.get('webshare_poll_timeout', 180))),
        )

    @staticmethod
    def _as_bool(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}

    @staticmethod
    def _as_list(value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, (list, tuple, set)):
            items = value
        else:
            items = str(value).replace("\n", ",").split(",")
        return [str(item).strip() for item in items if str(item).strip()]
        
    def reload(self) -> None:
        """重新加载配置文件"""
        self._load_config()
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        获取原始配置值（支持点号路径）
        
        参数:
            key: 配置键，支持点号分隔的路径，如 'email.domain'
            default: 默认值
        
        返回:
            配置值或默认值
        """
        keys = key.split('.')
        value = self.raw_config
        
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        
        return value


# ==============================================================
# 全局配置实例
# ==============================================================

# 创建全局配置加载器
_loader = ConfigLoader()

# 配置对象（推荐使用）
cfg = _loader.config


# ==============================================================
# 兼容性导出（保持旧代码兼容）
# ==============================================================

# 注册配置
TOTAL_ACCOUNTS = cfg.registration.total_accounts
MIN_AGE = cfg.registration.min_age
MAX_AGE = cfg.registration.max_age

# 邮箱配置
EMAIL_WAIT_TIMEOUT = cfg.email.wait_timeout
EMAIL_POLL_INTERVAL = cfg.email.poll_interval
EMAIL_DOMAINS = cfg.email.domains

# 浏览器配置
MAX_WAIT_TIME = cfg.browser.max_wait_time
SHORT_WAIT_TIME = cfg.browser.short_wait_time
USER_AGENT = cfg.browser.user_agent

# 密码配置
PASSWORD_LENGTH = cfg.password.length
PASSWORD_CHARS = cfg.password.charset

# 重试配置
HTTP_MAX_RETRIES = cfg.retry.http_max_retries
HTTP_TIMEOUT = cfg.retry.http_timeout
ERROR_PAGE_MAX_RETRIES = cfg.retry.error_page_max_retries
BUTTON_CLICK_MAX_RETRIES = cfg.retry.button_click_max_retries

# 批量配置
BATCH_INTERVAL_MIN = cfg.batch.interval_min
BATCH_INTERVAL_MAX = cfg.batch.interval_max

# 文件配置
TXT_FILE = cfg.files.accounts_file

# OAuth 配置
OAUTH_ISSUER = cfg.oauth.issuer
OAUTH_CLIENT_ID = cfg.oauth.client_id
OAUTH_REDIRECT_URI = cfg.oauth.redirect_uri
OAUTH_AK_FILE = cfg.oauth.ak_file
OAUTH_RK_FILE = cfg.oauth.rk_file
OAUTH_TOKEN_JSON_DIR = cfg.oauth.token_json_dir

# CPA 配置
CPA_UPLOAD_API_URL = cfg.cpa.upload_api_url
CPA_UPLOAD_API_TOKEN = cfg.cpa.upload_api_token

# CLIProxyAPI 配置
CLIPROXY_ENABLED = cfg.cliproxy.enabled
CLIPROXY_API_URL = cfg.cliproxy.api_url
CLIPROXY_API_KEY = cfg.cliproxy.api_key
CLIPROXY_AUTH_DIR = cfg.cliproxy.auth_dir


# ==============================================================
# 工具函数
# ==============================================================

def reload_config() -> None:
    """
    重新加载配置文件
    注意：这不会更新已导入的常量，只会更新 cfg 对象
    """
    global cfg
    _loader.reload()
    cfg = _loader.config


def get_config() -> AppConfig:
    """获取当前配置对象"""
    return cfg


def print_config_summary() -> None:
    """打印配置摘要"""
    print("\n" + "=" * 50)
    print("📋 当前配置摘要")
    print("=" * 50)
    print(f"  注册账号数量: {cfg.registration.total_accounts}")
    print(f"  账号保存文件: {cfg.files.accounts_file}")
    print(f"  批量间隔: {cfg.batch.interval_min}-{cfg.batch.interval_max}秒")
    print("=" * 50 + "\n")


# 模块加载时打印一次配置信息（可选）
if __name__ == "__main__":
    print_config_summary()
