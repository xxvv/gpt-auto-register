(function () {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : chrome;
  const PROXY_ROUTE_STORAGE_KEY = "gptAutoRegisterProxyRoutes";
  const DEFAULT_PROXY_ROUTE_KEY = "__default__";
  const TAB_USER_AGENT_TTL_MS = 30 * 60 * 1000;

  let proxyRoutes = {};
  const tabUserAgents = new Map();

  ext.storage.local.get(PROXY_ROUTE_STORAGE_KEY).then((saved) => {
    proxyRoutes = normalizeProxyRoutes(saved && saved[PROXY_ROUTE_STORAGE_KEY]);
  });

  ext.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    if (changes[PROXY_ROUTE_STORAGE_KEY]) {
      proxyRoutes = normalizeProxyRoutes(changes[PROXY_ROUTE_STORAGE_KEY].newValue);
    }
  });

  ext.runtime.onMessage.addListener((message, sender) => {
    if (
      !message ||
      (
        message.type !== "gptAutoRegisterProxy" &&
        message.type !== "gptAutoRegisterUserAgent"
      )
    ) {
      return undefined;
    }

    if (message.type === "gptAutoRegisterUserAgent") {
      return handleUserAgentMessage(message, sender);
    }

    if (message.action === "assignRoute") {
      return assignProxyRoute(message);
    }
    if (message.action === "apply") {
      return assignProxyRoute({
        cookieStoreId: DEFAULT_PROXY_ROUTE_KEY,
        proxy: message.proxy
      });
    }
    if (message.action === "removeRoute") {
      return removeProxyRoute(message);
    }
    if (message.action === "clear") {
      return removeProxyRoute({ cookieStoreId: DEFAULT_PROXY_ROUTE_KEY });
    }
    if (message.action === "clearRoutes") {
      return clearProxyRoutes();
    }
    if (message.action === "getRoutes") {
      return Promise.resolve({ ok: true, routes: proxyRoutes });
    }
    return Promise.resolve({ ok: false, error: `Unknown proxy action: ${message.action || ""}` });
  });

  ext.proxy.onRequest.addListener(
    (details) => {
      const cookieStoreId = String(details && details.cookieStoreId || "");
      const route = proxyRoutes[cookieStoreId] || proxyRoutes[DEFAULT_PROXY_ROUTE_KEY];
      if (!route || !route.enabled) {
        return { type: "direct" };
      }
      return buildProxyInfo(route);
    },
    { urls: ["<all_urls>"] }
  );

  ext.webRequest.onAuthRequired.addListener(
    (details) => {
      const route = getProxyRouteForDetails(details);
      if (!route || !route.username) {
        return {};
      }
      return {
        authCredentials: {
          username: String(route.username || ""),
          password: String(route.password || "")
        }
      };
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
  );

  ext.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      const record = getTabUserAgentRecord(details && details.tabId);
      if (!record || !record.userAgent) {
        return {};
      }
      const requestHeaders = Array.isArray(details.requestHeaders) ? details.requestHeaders : [];
      const userAgentHeader = requestHeaders.find((header) => String(header.name || "").toLowerCase() === "user-agent");
      if (userAgentHeader) {
        userAgentHeader.value = record.userAgent;
      } else {
        requestHeaders.push({ name: "User-Agent", value: record.userAgent });
      }
      return { requestHeaders };
    },
    { urls: ["<all_urls>"] },
    ["blocking", "requestHeaders"]
  );

  if (ext.tabs && ext.tabs.onRemoved) {
    ext.tabs.onRemoved.addListener((tabId) => {
      tabUserAgents.delete(Number(tabId));
    });
  }

  function normalizeProxyRoutes(rawRoutes) {
    const input = rawRoutes && typeof rawRoutes === "object" ? rawRoutes : {};
    return Object.entries(input).reduce((acc, [cookieStoreId, route]) => {
      try {
        acc[String(cookieStoreId)] = requireRuntimeProxy(route);
      } catch (_) {}
      return acc;
    }, {});
  }

  async function saveProxyRoutes() {
    await ext.storage.local.set({ [PROXY_ROUTE_STORAGE_KEY]: proxyRoutes });
  }

  async function assignProxyRoute(message) {
    const cookieStoreId = String(message.cookieStoreId || "").trim();
    if (!cookieStoreId) {
      return { ok: false, error: "Missing cookieStoreId" };
    }
    const proxy = requireRuntimeProxy(message.proxy);
    proxyRoutes = {
      ...proxyRoutes,
      [cookieStoreId]: proxy
    };
    await saveProxyRoutes();
    return { ok: true, cookieStoreId, proxy };
  }

  async function removeProxyRoute(message) {
    const cookieStoreId = String(message.cookieStoreId || "").trim();
    if (!cookieStoreId) {
      return { ok: false, error: "Missing cookieStoreId" };
    }
    if (proxyRoutes[cookieStoreId]) {
      delete proxyRoutes[cookieStoreId];
      proxyRoutes = { ...proxyRoutes };
      await saveProxyRoutes();
    }
    return { ok: true, cookieStoreId };
  }

  async function clearProxyRoutes() {
    proxyRoutes = {};
    await ext.storage.local.remove(PROXY_ROUTE_STORAGE_KEY);
    return { ok: true };
  }

  function getProxyRouteForDetails(details) {
    if (!details) {
      return null;
    }
    const cookieStoreId = String(details.cookieStoreId || "");
    if (cookieStoreId && proxyRoutes[cookieStoreId]) {
      return proxyRoutes[cookieStoreId];
    }
    if (proxyRoutes[DEFAULT_PROXY_ROUTE_KEY]) {
      return proxyRoutes[DEFAULT_PROXY_ROUTE_KEY];
    }
    const challenger = details.challenger || {};
    const challengerHost = String(challenger.host || "").trim();
    const challengerPort = Number(challenger.port || 0);
    return Object.values(proxyRoutes).find((route) => {
      return route &&
        route.enabled &&
        String(route.host || "").trim() === challengerHost &&
        Number(route.port || 0) === challengerPort;
    }) || null;
  }

  function buildProxyInfo(route) {
    const proxyType = String(route.type || "http").toLowerCase();
    const result = {
      type: proxyType,
      host: route.host,
      port: Number(route.port || 0)
    };
    if (proxyType === "socks" || proxyType === "socks4" || proxyType === "socks5") {
      result.proxyDNS = proxyType !== "socks4";
      result.username = route.username || undefined;
      result.password = route.password || undefined;
    } else {
      result.username = route.username || undefined;
      result.password = route.password || undefined;
    }
    return result;
  }

  function handleUserAgentMessage(message, sender) {
    if (message.action === "prepare") {
      const tabId = Number(message.tabId || 0);
      if (tabId <= 0) {
        return Promise.resolve({ ok: false, error: "Missing tabId" });
      }
      const userAgent = generateRandomUserAgent();
      tabUserAgents.set(tabId, {
        userAgent,
        preparedAt: Date.now(),
        url: String(message.url || "")
      });
      return Promise.resolve({ ok: true, tabId, userAgent });
    }

    if (message.action === "get") {
      const tabId = Number(message.tabId || (sender && sender.tab && sender.tab.id) || 0);
      const record = getTabUserAgentRecord(tabId);
      return Promise.resolve({
        ok: Boolean(record && record.userAgent),
        tabId,
        userAgent: record && record.userAgent ? record.userAgent : ""
      });
    }

    return Promise.resolve({ ok: false, error: `Unknown userAgent action: ${message.action || ""}` });
  }

  function getTabUserAgentRecord(tabId) {
    const normalizedTabId = Number(tabId || 0);
    if (normalizedTabId <= 0) {
      return null;
    }
    const record = tabUserAgents.get(normalizedTabId);
    if (!record) {
      return null;
    }
    if (Date.now() - Number(record.preparedAt || 0) > TAB_USER_AGENT_TTL_MS) {
      tabUserAgents.delete(normalizedTabId);
      return null;
    }
    return record;
  }

  function generateRandomUserAgent() {
    const firefoxMajor = randomInt(123, 145);
    const platform = randomChoice([
      "Windows NT 10.0; Win64; x64",
      "Windows NT 10.0; WOW64",
      "Macintosh; Intel Mac OS X 10.15",
      "X11; Linux x86_64"
    ]);
    return `Mozilla/5.0 (${platform}; rv:${firefoxMajor}.0) Gecko/20100101 Firefox/${firefoxMajor}.0`;
  }

  function randomChoice(values) {
    return values[randomInt(0, values.length - 1)];
  }

  function randomInt(min, max) {
    const low = Math.ceil(Number(min) || 0);
    const high = Math.floor(Number(max) || low);
    return Math.floor(Math.random() * (high - low + 1)) + low;
  }

  function requireRuntimeProxy(proxy) {
    if (!proxy || !proxy.enabled) {
      throw new Error("代理数据缺少 enabled");
    }
    const host = String(proxy.host || "").trim();
    const port = Number(proxy.port || 0);
    if (!host || port <= 0) {
      throw new Error("代理数据缺少 host/port");
    }
    return {
      enabled: true,
      type: String(proxy.type || "http").toLowerCase(),
      host,
      port,
      username: String(proxy.username || ""),
      password: String(proxy.password || ""),
      use_auth: Boolean(proxy.use_auth || proxy.username),
      country_code: String(proxy.country_code || ""),
      city_name: String(proxy.city_name || "")
    };
  }
}());
