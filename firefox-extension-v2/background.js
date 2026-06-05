(function () {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : chrome;
  const PROXY_AUTH_KEY = "gptAutoRegisterProxyAuth";
  const TAB_USER_AGENT_TTL_MS = 30 * 60 * 1000;
  let proxyAuth = {};
  const tabUserAgents = new Map();

  ext.storage.local.get(PROXY_AUTH_KEY).then((saved) => {
    proxyAuth = saved && saved[PROXY_AUTH_KEY] ? saved[PROXY_AUTH_KEY] : {};
  });

  ext.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[PROXY_AUTH_KEY]) {
      return;
    }
    proxyAuth = changes[PROXY_AUTH_KEY].newValue || {};
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

    if (message.action === "apply") {
      return applyFirefoxProxy(message.proxy);
    }
    if (message.action === "clear") {
      return clearFirefoxProxy();
    }
    return Promise.resolve({ ok: false, error: `Unknown proxy action: ${message.action || ""}` });
  });

  ext.webRequest.onAuthRequired.addListener(
    (details) => {
      if (!shouldUseProxyAuth(details)) {
        return {};
      }

      return {
        authCredentials: {
          username: String(proxyAuth.username || ""),
          password: String(proxyAuth.password || "")
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

  function shouldUseProxyAuth(details) {
    if (!details || !details.isProxy || !proxyAuth || !proxyAuth.enabled) {
      return false;
    }

    const username = String(proxyAuth.username || "");
    if (!username) {
      return false;
    }

    const authHost = String(proxyAuth.host || "").trim();
    const authPort = Number(proxyAuth.port || 0);
    const challenger = details.challenger || {};
    const challengerHost = String(challenger.host || "").trim();
    const challengerPort = Number(challenger.port || 0);

    if (authHost && challengerHost && authHost !== challengerHost) {
      return false;
    }

    if (authPort > 0 && challengerPort > 0 && authPort !== challengerPort) {
      return false;
    }

    return true;
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

  async function applyFirefoxProxy(proxy) {
    const runtimeProxy = requireRuntimeProxy(proxy);
    const proxyType = String(runtimeProxy.type || "http").toLowerCase();
    if (!["http", "https", "socks", "socks4", "socks5"].includes(proxyType)) {
      throw new Error(`Firefox 不支持的代理类型: ${runtimeProxy.type}`);
    }

    if (!ext.proxy || !ext.proxy.settings || typeof ext.proxy.settings.set !== "function") {
      throw new Error("Firefox proxy API 不可用，请确认已重新加载扩展并授予 proxy 权限");
    }

    await ext.storage.local.set({
      [PROXY_AUTH_KEY]: {
        enabled: Boolean(runtimeProxy.username),
        host: runtimeProxy.host,
        port: runtimeProxy.port,
        username: runtimeProxy.username || "",
        password: runtimeProxy.password || ""
      }
    });

    const proxyAddress = `${runtimeProxy.host}:${runtimeProxy.port}`;
    const settingsValue = {
      proxyType: "manual",
      passthrough: "localhost, 127.0.0.1, ::1"
    };

    if (proxyType === "http") {
      settingsValue.http = proxyAddress;
      settingsValue.httpProxyAll = true;
    } else if (proxyType === "https") {
      settingsValue.ssl = proxyAddress;
    } else {
      settingsValue.socks = proxyAddress;
      settingsValue.socksVersion = proxyType === "socks4" ? 4 : 5;
      settingsValue.proxyDNS = proxyType !== "socks4";
    }

    await ext.proxy.settings.set({ value: settingsValue, scope: "regular" });
    return { ok: true };
  }

  async function clearFirefoxProxy() {
    if (!ext.proxy || !ext.proxy.settings || typeof ext.proxy.settings.clear !== "function") {
      throw new Error("Firefox proxy API 不可用，请确认已重新加载扩展并授予 proxy 权限");
    }
    await ext.proxy.settings.clear({});
    await ext.storage.local.remove(PROXY_AUTH_KEY);
    return { ok: true };
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
    return proxy;
  }
}());
