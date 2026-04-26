"""
基于本地代理文件维护可用代理池。

说明：
  - 代理地址只从项目内的手工文件读取
  - 支持手动刷新、缓存和单个代理应用入口
  - 支持基于缓存结果为批量注册任务做顺序轮换分配
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from threading import Lock
from typing import Any

from .config import PROJECT_ROOT
from .utils import IP_DISCOVERY_ENDPOINTS, probe_proxy_connectivity

US_PROXY_CACHE_PATH = PROJECT_ROOT / "data" / "cache" / "us_proxy_pool.json"
MANUAL_PROXY_SOURCES = (
    {
        "path": PROJECT_ROOT / "data" / "socks" / "Webshare 10 proxies.txt",
        "type": "socks5",
        "label": "Webshare 10 proxies",
    },
)


def _manual_source_url() -> str:
    labels = []
    for source in MANUAL_PROXY_SOURCES:
        path = Path(source["path"])
        try:
            display = str(path.relative_to(PROJECT_ROOT))
        except ValueError:
            display = str(path)
        labels.append(display)
    return "file://" + ",".join(labels)


US_PROXY_SOURCE_URL = _manual_source_url()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _default_cache() -> dict[str, Any]:
    return {
        "source_url": _manual_source_url(),
        "fetched_at": "",
        "raw_row_count": 0,
        "working_count": 0,
        "proxies": [],
    }


def _cache_source_matches(payload: dict[str, Any] | None) -> bool:
    return str((payload or {}).get("source_url", "") or "") == _manual_source_url()


def _proxy_key(proxy: dict[str, Any] | None) -> tuple[str, str, int, str, str] | None:
    if not proxy or not proxy.get("enabled"):
        return None

    ptype = str(proxy.get("type", "http") or "http").lower()
    host = str(proxy.get("host", "") or "").strip()
    if not host:
        return None

    try:
        port = int(proxy.get("port", 0) or 0)
    except (TypeError, ValueError):
        return None

    if port <= 0:
        return None

    use_auth = bool(proxy.get("use_auth"))
    username = str(proxy.get("username", "") or "").strip() if use_auth else ""
    password = str(proxy.get("password", "") or "") if use_auth else ""
    return (ptype, host, port, username, password)


def pool_item_to_runtime_proxy(item: dict[str, Any]) -> dict[str, Any] | None:
    host = str(item.get("host", "") or "").strip()
    if not host:
        return None

    try:
        port = int(item.get("port", 0) or 0)
    except (TypeError, ValueError):
        return None

    if port <= 0:
        return None

    ptype = str(item.get("type", "http") or "http").lower()
    if ptype not in {"http", "socks5"}:
        ptype = "http"

    username = str(item.get("username", "") or "")
    password = str(item.get("password", "") or "")
    use_auth = bool(item.get("use_auth")) or bool(username)

    return {
        "enabled": True,
        "type": ptype,
        "host": host,
        "port": port,
        "use_auth": use_auth,
        "username": username,
        "password": password,
    }


def _normalize_pool_item(item: dict[str, Any]) -> dict[str, Any] | None:
    runtime_proxy = pool_item_to_runtime_proxy(item)
    if not runtime_proxy:
        return None

    return {
        **item,
        "type": runtime_proxy["type"],
        "use_auth": runtime_proxy["use_auth"],
        "username": runtime_proxy["username"],
        "password": runtime_proxy["password"],
    }


def _file_mtime_iso(path: Path) -> str:
    try:
        return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).replace(microsecond=0).isoformat()
    except OSError:
        return _utc_now_iso()


def _parse_manual_proxy_line(
    line: str,
    *,
    proxy_type: str,
    source_label: str,
    checked_at: str,
) -> dict[str, Any] | None:
    text = line.strip()
    if not text or text.startswith("#"):
        return None

    parts = text.split(":")
    if len(parts) == 2:
        host, port_text = parts
        username = ""
        password = ""
    elif len(parts) == 4:
        host, port_text, username, password = parts
    else:
        return None

    host = host.strip()
    port_text = port_text.strip()
    username = username.strip()
    password = password.strip()
    if not host or not port_text:
        return None

    try:
        port = int(port_text)
    except ValueError:
        return None

    if port <= 0:
        return None

    use_auth = bool(username)
    return {
        "host": host,
        "port": port,
        "type": proxy_type,
        "code": "",
        "country": "",
        "anonymity": "authenticated" if use_auth else "manual",
        "google": "",
        "https": "",
        "last_checked": f"manual: {source_label}",
        "source": source_label,
        "ok": True,
        "use_auth": use_auth,
        "username": username,
        "password": password,
        "detected_ip": "",
        "detected_country": "",
        "detected_country_code": "",
        "detected_city": "",
        "latency_ms": None,
        "checked_at": checked_at,
    }


def _load_manual_proxy_items() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for source in MANUAL_PROXY_SOURCES:
        path = Path(source["path"])
        if not path.exists():
            continue

        checked_at = _file_mtime_iso(path)
        with open(path, "r", encoding="utf-8") as handle:
            for line in handle:
                item = _parse_manual_proxy_line(
                    line,
                    proxy_type=str(source.get("type", "http") or "http").lower(),
                    source_label=str(source.get("label", path.name) or path.name),
                    checked_at=checked_at,
                )
                if item:
                    items.append(item)
    return items


def _merge_pool_items(
    base_items: list[dict[str, Any]] | None,
    extra_items: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str, int, str, str]] = set()

    for raw_item in (base_items or []) + (extra_items or []):
        item = _normalize_pool_item(raw_item)
        if not item:
            continue

        key = _proxy_key(
            {
                "enabled": True,
                "type": item["type"],
                "host": item["host"],
                "port": item["port"],
                "use_auth": item["use_auth"],
                "username": item["username"],
                "password": item["password"],
            }
        )
        if not key or key in seen:
            continue

        seen.add(key)
        merged.append(item)

    return merged


class ProxyRotation:
    """按代理池顺序循环分配代理。"""

    def __init__(self, proxies: list[dict[str, Any]] | None, start_proxy: dict[str, Any] | None = None):
        self._lock = Lock()
        self._proxies: list[dict[str, Any]] = []
        self.available_count = 0
        self.start_index = 0
        self.matched_start = False

        seen: set[tuple[str, str, int, str, str]] = set()
        for item in proxies or []:
            proxy = pool_item_to_runtime_proxy(item)
            key = _proxy_key(proxy)
            if not proxy or not key or key in seen:
                continue
            seen.add(key)
            self._proxies.append(proxy)

        self.available_count = len(self._proxies)

        start_key = _proxy_key(start_proxy)
        if start_key is not None:
            for idx, proxy in enumerate(self._proxies):
                if _proxy_key(proxy) == start_key:
                    self.start_index = idx
                    self.matched_start = True
                    break

        self.enabled = self.available_count > 0 and self.matched_start
        self._cursor = self.start_index if self.enabled else 0

    def next_proxy(self) -> dict[str, Any] | None:
        if not self.enabled:
            return None

        with self._lock:
            proxy = dict(self._proxies[self._cursor])
            self._cursor = (self._cursor + 1) % self.available_count
            return proxy

    @property
    def starting_proxy(self) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        return dict(self._proxies[self.start_index])


class _UsProxyTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self._in_list_section = False
        self._target_table_found = False
        self._in_target_table = False
        self._in_header = False
        self._in_body = False
        self._current_cell: list[str] | None = None
        self._current_row: list[str] | None = None
        self.headers: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(self, tag, attrs):
        attrs_map = dict(attrs)

        if tag == "section" and attrs_map.get("id") == "list":
            self._in_list_section = True
            return

        if not self._in_list_section:
            return

        if tag == "table" and not self._target_table_found:
            self._target_table_found = True
            self._in_target_table = True
            return

        if not self._in_target_table:
            return

        if tag == "thead":
            self._in_header = True
            return

        if tag == "tbody":
            self._in_body = True
            return

        if tag == "tr":
            self._current_row = []
            return

        if tag in {"th", "td"}:
            self._current_cell = []

    def handle_endtag(self, tag):
        if tag == "section" and self._in_list_section:
            self._in_list_section = False
            return

        if not self._in_target_table:
            return

        if tag == "thead":
            self._in_header = False
            return

        if tag == "tbody":
            self._in_body = False
            return

        if tag in {"th", "td"} and self._current_cell is not None and self._current_row is not None:
            value = " ".join("".join(self._current_cell).split())
            self._current_row.append(value)
            self._current_cell = None
            return

        if tag == "tr" and self._current_row:
            if self._in_header and not self.headers:
                self.headers = list(self._current_row)
            elif self._in_body:
                self.rows.append(list(self._current_row))
            self._current_row = None
            return

        if tag == "table" and self._in_target_table:
            self._in_target_table = False

    def handle_data(self, data):
        if self._current_cell is not None:
            self._current_cell.append(data)


def parse_us_proxy_table(html: str) -> list[dict[str, str]]:
    parser = _UsProxyTableParser()
    parser.feed(html)
    headers = parser.headers
    if not headers:
        raise RuntimeError("未解析到代理表头")

    records = []
    for row in parser.rows:
        if not row:
            continue
        padded = list(row[: len(headers)]) + [""] * max(0, len(headers) - len(row))
        record = {headers[idx]: padded[idx].strip() for idx in range(len(headers))}
        if record.get("Code", "").upper() == "US":
            records.append(record)
    return records


def fetch_us_proxy_rows(source_url: str | None = None, timeout: int = 20) -> list[dict[str, str]]:
    del source_url, timeout

    rows: list[dict[str, str]] = []
    for item in _load_manual_proxy_items():
        rows.append(
            {
                "IP Address": str(item.get("host", "") or ""),
                "Port": str(item.get("port", "") or ""),
                "Code": str(item.get("code", "") or "").upper(),
                "Country": str(item.get("country", "") or ""),
                "Anonymity": str(item.get("anonymity", "") or ""),
                "Google": str(item.get("google", "") or ""),
                "Https": str(item.get("https", "") or ""),
                "Last Checked": str(item.get("last_checked", "") or ""),
                "Type": str(item.get("type", "http") or "http").lower(),
                "Use Auth": "yes" if item.get("use_auth") else "no",
                "Username": str(item.get("username", "") or ""),
                "Password": str(item.get("password", "") or ""),
                "Source": str(item.get("source", "") or ""),
            }
        )
    return rows


def _normalize_candidate(row: dict[str, str]) -> dict[str, Any] | None:
    host = str(row.get("IP Address", "") or "").strip()
    port_text = str(row.get("Port", "") or "").strip()
    if not host or not port_text:
        return None

    try:
        port = int(port_text)
    except ValueError:
        return None

    proxy_type = str(row.get("Type", "http") or "http").strip().lower()
    if proxy_type not in {"http", "socks5"}:
        proxy_type = "http"

    username = str(row.get("Username", "") or "")
    password = str(row.get("Password", "") or "")
    use_auth_text = str(row.get("Use Auth", "") or "").strip().lower()
    use_auth = use_auth_text in {"1", "true", "yes", "y", "on"} or bool(username)

    return {
        "host": host,
        "port": port,
        "type": proxy_type,
        "code": str(row.get("Code", "") or "").upper(),
        "country": str(row.get("Country", "") or ""),
        "anonymity": str(row.get("Anonymity", "") or ""),
        "google": str(row.get("Google", "") or ""),
        "https": str(row.get("Https", "") or ""),
        "last_checked": str(row.get("Last Checked", "") or ""),
        "source": str(row.get("Source", "") or ""),
        "use_auth": use_auth,
        "username": username,
        "password": password,
    }


def _candidate_sort_key(item: dict[str, Any]):
    https_rank = 0 if str(item.get("https", "")).lower() == "yes" else 1
    anonymity = str(item.get("anonymity", "")).lower()
    anonymity_rank = {
        "elite proxy": 0,
        "anonymous": 1,
        "transparent": 2,
    }.get(anonymity, 3)
    latency = int(item.get("latency_ms", 999999) or 999999)
    return (https_rank, anonymity_rank, latency, item.get("host", ""), item.get("port", 0))


def _test_proxy_candidate(candidate: dict[str, Any], timeout: int = 4) -> dict[str, Any]:
    proxy = pool_item_to_runtime_proxy(candidate)
    if not proxy:
        return {
            **candidate,
            "ok": False,
            "reason": "invalid_proxy_config",
            "checked_at": _utc_now_iso(),
        }

    result = probe_proxy_connectivity(
        proxy,
        timeout=timeout,
        endpoints=IP_DISCOVERY_ENDPOINTS[:2],
        geo_lookup=lambda ip, geo_timeout: {
            "ok": False,
            "reason": "skipped_for_pool_refresh",
            "ip": ip,
        },
    )

    if not result.get("ok"):
        return {
            **candidate,
            "ok": False,
            "reason": result.get("reason", "connectivity_failed"),
            "checked_at": _utc_now_iso(),
        }

    return {
        **candidate,
        "type": proxy["type"],
        "use_auth": proxy["use_auth"],
        "username": proxy["username"],
        "password": proxy["password"],
        "ok": True,
        "detected_ip": result.get("ip", ""),
        "detected_country": result.get("country", ""),
        "detected_country_code": result.get("country_code", ""),
        "detected_city": result.get("city", ""),
        "latency_ms": result.get("latency_ms"),
        "checked_at": _utc_now_iso(),
    }


def refresh_us_proxy_pool(
    *,
    workers: int = 16,
    timeout: int = 4,
    source_url: str | None = None,
) -> dict[str, Any]:
    resolved_source_url = source_url or _manual_source_url()
    rows = fetch_us_proxy_rows(source_url=resolved_source_url)

    candidates = []
    seen: set[tuple[str, str, int, str, str]] = set()
    for row in rows:
        candidate = _normalize_candidate(row)
        if not candidate:
            continue
        key = _proxy_key(pool_item_to_runtime_proxy(candidate))
        if not key or key in seen:
            continue
        seen.add(key)
        candidates.append(candidate)

    checked: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        future_map = {
            executor.submit(_test_proxy_candidate, candidate, timeout): candidate
            for candidate in candidates
        }
        for future in as_completed(future_map):
            checked.append(future.result())

    working = [item for item in checked if item.get("ok")]
    working.sort(key=_candidate_sort_key)

    payload = {
        "source_url": resolved_source_url,
        "fetched_at": _utc_now_iso(),
        "raw_row_count": len(rows),
        "working_count": len(working),
        "proxies": working,
    }
    save_us_proxy_pool(payload)
    return payload


def _filter_cached_pool_by_manual_sources(
    cached_items: list[dict[str, Any]] | None,
    manual_items: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    manual_map: dict[tuple[str, str, int, str, str], dict[str, Any]] = {}
    for item in manual_items or []:
        key = _proxy_key(pool_item_to_runtime_proxy(item))
        if key:
            manual_map[key] = item

    filtered: list[dict[str, Any]] = []
    seen: set[tuple[str, str, int, str, str]] = set()
    for item in cached_items or []:
        normalized = _normalize_pool_item(item)
        key = _proxy_key(pool_item_to_runtime_proxy(normalized)) if normalized else None
        if not normalized or not key or key not in manual_map or key in seen:
            continue
        seen.add(key)
        filtered.append({**manual_map[key], **normalized})
    return filtered


def load_us_proxy_pool() -> dict[str, Any]:
    manual_items = _merge_pool_items([], _load_manual_proxy_items())

    if not US_PROXY_CACHE_PATH.exists():
        result = _default_cache()
        result["raw_row_count"] = len(manual_items)
        result["proxies"] = manual_items
        result["working_count"] = len(result["proxies"])
        return result

    try:
        with open(US_PROXY_CACHE_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        result = _default_cache()
        result["raw_row_count"] = len(manual_items)
        result["proxies"] = manual_items
        result["working_count"] = len(result["proxies"])
        return result

    if not _cache_source_matches(payload):
        result = _default_cache()
        result["raw_row_count"] = len(manual_items)
        result["proxies"] = manual_items
        result["working_count"] = len(result["proxies"])
        return result

    result = _default_cache()
    result.update(payload or {})
    result["source_url"] = _manual_source_url()
    result["raw_row_count"] = len(manual_items)
    result["proxies"] = _filter_cached_pool_by_manual_sources(
        list(result.get("proxies", [])),
        manual_items,
    )
    result["working_count"] = len(result["proxies"])
    return result


def save_us_proxy_pool(payload: dict[str, Any]) -> Path:
    US_PROXY_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(US_PROXY_CACHE_PATH, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    return US_PROXY_CACHE_PATH
