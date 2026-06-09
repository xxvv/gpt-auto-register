(function () {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : chrome;
  const PROXY_AUTH_KEY = "gptAutoRegisterProxyAuth";
  const ICLOUD_CLIENT_STATE_KEY = "gptAutoRegisterICloudClientState";
  const ICLOUD_DEFAULT_SETUP_URL = "https://setup.icloud.com/setup/ws/1";
  const ICLOUD_CN_SETUP_URL = "https://setup.icloud.com.cn/setup/ws/1";
  const ICLOUD_HME_NOTE = "Generated through GPT Auto Register v2";
  let proxyAuth = {};
  const automationUserAgentsByWindowId = new Map();

  ext.storage.local.get(PROXY_AUTH_KEY).then((saved) => {
    proxyAuth = saved && saved[PROXY_AUTH_KEY] ? saved[PROXY_AUTH_KEY] : {};
  });

  ext.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[PROXY_AUTH_KEY]) {
      return;
    }
    proxyAuth = changes[PROXY_AUTH_KEY].newValue || {};
  });

  ext.runtime.onMessage.addListener((message) => {
    if (
      !message ||
      (
        message.type !== "gptAutoRegisterProxy" &&
        message.type !== "gptAutoRegisterICloudHme" &&
        message.type !== "gptAutoRegisterAutomationHeaders"
      )
    ) {
      return undefined;
    }

    if (message.type === "gptAutoRegisterAutomationHeaders") {
      return handleAutomationHeadersMessage(message);
    }

    if (message.type === "gptAutoRegisterICloudHme") {
      return handleICloudHmeMessage(message);
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
      const requestHeaders = Array.isArray(details.requestHeaders) ? details.requestHeaders : [];
      let modified = false;

      if (applyICloudSimulationHeaders(details, requestHeaders)) {
        modified = true;
      }

      if (applyAutomationUserAgentHeader(details, requestHeaders)) {
        modified = true;
      }

      return modified ? { requestHeaders } : {};
    },
    { urls: ["<all_urls>"] },
    ["blocking", "requestHeaders"]
  );

  if (ext.windows && ext.windows.onRemoved) {
    ext.windows.onRemoved.addListener((windowId) => {
      automationUserAgentsByWindowId.delete(Number(windowId));
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

  async function handleICloudHmeMessage(message) {
    if (message.action !== "generateAndReserve") {
      return { ok: false, error: `Unknown iCloud action: ${message.action || ""}` };
    }

    const label = String(message.label || (message.data && message.data.label) || "chatgpt.com").trim() || "chatgpt.com";
    try {
      const clientState = await getAuthenticatedICloudClientState();
      const hme = await generateICloudHme(clientState);
      await reserveICloudHme(clientState, hme, label);
      return { ok: true, email: hme };
    } catch (error) {
      return { ok: false, error: formatBackgroundError(error) };
    }
  }

  function handleAutomationHeadersMessage(message) {
    const action = String(message && message.action || "");
    const windowId = Number(message && message.windowId);
    if (!Number.isInteger(windowId) || windowId < 0) {
      return Promise.resolve({ ok: false, error: "缺少有效 windowId" });
    }
    if (action === "apply") {
      const userAgent = String(message.userAgent || "").trim();
      if (!userAgent) {
        return Promise.resolve({ ok: false, error: "缺少 User-Agent" });
      }
      automationUserAgentsByWindowId.set(windowId, userAgent);
      return Promise.resolve({ ok: true });
    }
    if (action === "clear") {
      automationUserAgentsByWindowId.delete(windowId);
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve({ ok: false, error: `Unknown automation headers action: ${action}` });
  }

  async function getAuthenticatedICloudClientState() {
    const saved = await ext.storage.local.get(ICLOUD_CLIENT_STATE_KEY);
    const savedState = saved && saved[ICLOUD_CLIENT_STATE_KEY] ? saved[ICLOUD_CLIENT_STATE_KEY] : null;
    const setupUrls = uniqueValues([
      savedState && savedState.setupUrl,
      ICLOUD_DEFAULT_SETUP_URL,
      ICLOUD_CN_SETUP_URL
    ].filter(Boolean));
    let lastError = null;

    for (const setupUrl of setupUrls) {
      try {
        const webservices = await validateICloudToken(setupUrl);
        const clientState = { setupUrl, webservices };
        await ext.storage.local.set({ [ICLOUD_CLIENT_STATE_KEY]: clientState });
        return clientState;
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`iCloud 未登录或登录态不可用: ${formatBackgroundError(lastError)}`);
  }

  async function validateICloudToken(setupUrl) {
    const response = await requestICloud("POST", `${setupUrl}/validate`);
    const webservices = response && response.webservices;
    if (!webservices || !webservices.premiummailsettings || !webservices.premiummailsettings.url) {
      throw new Error("iCloud validate 未返回 premiummailsettings 服务地址");
    }
    return webservices;
  }

  async function generateICloudHme(clientState) {
    const baseUrl = `${getPremiumMailSettingsUrl(clientState)}/v1`;
    const response = await requestICloud("POST", `${baseUrl}/hme/generate`);
    if (!response || response.success !== true || !response.result || !response.result.hme) {
      throw new Error(extractICloudError(response, "iCloud 生成隐藏邮箱失败"));
    }
    return String(response.result.hme || "").trim();
  }

  async function reserveICloudHme(clientState, hme, label) {
    const baseUrl = `${getPremiumMailSettingsUrl(clientState)}/v1`;
    const response = await requestICloud("POST", `${baseUrl}/hme/reserve`, {
      data: {
        hme,
        label,
        note: ICLOUD_HME_NOTE
      }
    });
    if (!response || response.success !== true) {
      throw new Error(extractICloudError(response, "iCloud 保留隐藏邮箱失败"));
    }
  }

  function getPremiumMailSettingsUrl(clientState) {
    const service = clientState && clientState.webservices && clientState.webservices.premiummailsettings;
    const url = service && service.url ? String(service.url) : "";
    if (!url) {
      throw new Error("缺少 iCloud premiummailsettings 服务地址");
    }
    return url.replace(/\/+$/, "");
  }

  async function requestICloud(method, url, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    const response = await fetch(url, {
      method,
      headers,
      credentials: "include",
      body: options.data === undefined ? undefined : JSON.stringify(options.data)
    });
    if (!response.ok) {
      throw new Error(`iCloud request ${method} ${url} failed with status ${response.status}`);
    }
    return await response.json();
  }

  function extractICloudError(response, fallback) {
    return String(response && response.error && response.error.errorMessage || fallback);
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
  }

  function formatBackgroundError(error) {
    if (!error) {
      return "未知错误";
    }
    return error.message || String(error);
  }

  function applyICloudSimulationHeaders(details, requestHeaders) {
    if (!details || !details.url) {
      return false;
    }
    if (details.type && details.type !== "xmlhttprequest") {
      return false;
    }
    let url;
    try {
      url = new URL(details.url);
    } catch (_) {
      return false;
    }
    const hostname = String(url.hostname || "").toLowerCase();
    if (hostname === "icloud.com" || hostname.endsWith(".icloud.com")) {
      setRequestHeader(requestHeaders, "Origin", "https://www.icloud.com");
      setRequestHeader(requestHeaders, "Referer", "https://www.icloud.com/");
      return true;
    }
    if (hostname === "icloud.com.cn" || hostname.endsWith(".icloud.com.cn")) {
      setRequestHeader(requestHeaders, "Origin", "https://www.icloud.com.cn");
      setRequestHeader(requestHeaders, "Referer", "https://www.icloud.com.cn/");
      return true;
    }
    return false;
  }

  function applyAutomationUserAgentHeader(details, requestHeaders) {
    if (!details || details.windowId === undefined || details.windowId === null) {
      return false;
    }
    const userAgent = automationUserAgentsByWindowId.get(Number(details.windowId));
    if (!userAgent) {
      return false;
    }
    setRequestHeader(requestHeaders, "User-Agent", userAgent);
    return true;
  }

  function setRequestHeader(requestHeaders, name, value) {
    const header = requestHeaders.find((item) => String(item.name || "").toLowerCase() === String(name).toLowerCase());
    if (header) {
      header.value = value;
    } else {
      requestHeaders.push({ name, value });
    }
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
