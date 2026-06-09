(function () {
  "use strict";

  const ext = chrome;
  const PROXY_AUTH_KEY = "gptAutoRegisterProxyAuth";
  const ICLOUD_CLIENT_STATE_KEY = "gptAutoRegisterICloudClientState";
  const ICLOUD_DEFAULT_SETUP_URL = "https://setup.icloud.com/setup/ws/1";
  const ICLOUD_CN_SETUP_URL = "https://setup.icloud.com.cn/setup/ws/1";
  const ICLOUD_HME_NOTE = "Generated through GPT Auto Register v2";
  let proxyAuth = {};

  storageGet(PROXY_AUTH_KEY).then((saved) => {
    proxyAuth = saved && saved[PROXY_AUTH_KEY] ? saved[PROXY_AUTH_KEY] : {};
  });

  ext.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[PROXY_AUTH_KEY]) {
      return;
    }
    proxyAuth = changes[PROXY_AUTH_KEY].newValue || {};
  });

  ext.runtime.onInstalled.addListener(configureSidePanel);
  ext.runtime.onStartup.addListener(configureSidePanel);
  ext.runtime.onInstalled.addListener(configureICloudHeaderRules);
  ext.runtime.onStartup.addListener(configureICloudHeaderRules);
  configureICloudHeaderRules().catch(() => {});
  if (ext.sidePanel && ext.sidePanel.setPanelBehavior) {
    callOptionalAsync(ext.sidePanel.setPanelBehavior, ext.sidePanel, { openPanelOnActionClick: true }).catch(() => {});
  }
  ext.action.onClicked.addListener(async (tab) => {
    try {
      if (ext.sidePanel && ext.sidePanel.open) {
        await callOptionalAsync(ext.sidePanel.open, ext.sidePanel, { windowId: tab && tab.windowId });
      }
    } catch (_) {}
  });

  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      !message ||
      (
        message.type !== "gptAutoRegisterProxy" &&
        message.type !== "gptAutoRegisterICloudHme"
      )
    ) {
      return undefined;
    }

    const task = message.type === "gptAutoRegisterICloudHme"
      ? handleICloudHmeMessage(message)
      : handleProxyMessage(message);
    task.then(sendResponse, (error) => {
      sendResponse({ ok: false, error: formatBackgroundError(error) });
    });
    return true;
  });

  ext.webRequest.onAuthRequired.addListener(
    (details, callback) => {
      if (!shouldUseProxyAuth(details)) {
        callback({});
        return;
      }
      callback({
        authCredentials: {
          username: String(proxyAuth.username || ""),
          password: String(proxyAuth.password || "")
        }
      });
    },
    { urls: ["<all_urls>"] },
    ["asyncBlocking"]
  );

  async function configureSidePanel() {
    if (!ext.sidePanel || !ext.sidePanel.setOptions) {
      return;
    }
    try {
      await callOptionalAsync(ext.sidePanel.setOptions, ext.sidePanel, {
        path: "sidebar.html",
        enabled: true
      });
    } catch (_) {}
  }

  async function configureICloudHeaderRules() {
    if (!ext.declarativeNetRequest || !ext.declarativeNetRequest.updateDynamicRules) {
      return;
    }
    await updateDynamicRules({
      removeRuleIds: [1001, 1002],
      addRules: [
        {
          id: 1001,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "Origin", operation: "set", value: "https://www.icloud.com" },
              { header: "Referer", operation: "set", value: "https://www.icloud.com/" }
            ]
          },
          condition: {
            regexFilter: "^https://([^/]+\\.)?icloud\\.com/",
            resourceTypes: ["xmlhttprequest"]
          }
        },
        {
          id: 1002,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "Origin", operation: "set", value: "https://www.icloud.com.cn" },
              { header: "Referer", operation: "set", value: "https://www.icloud.com.cn/" }
            ]
          },
          condition: {
            regexFilter: "^https://([^/]+\\.)?icloud\\.com\\.cn/",
            resourceTypes: ["xmlhttprequest"]
          }
        }
      ]
    });
  }

  async function handleProxyMessage(message) {
    if (message.action === "apply") {
      return applyChromeProxy(message.proxy);
    }
    if (message.action === "clear") {
      return clearChromeProxy();
    }
    return { ok: false, error: `Unknown proxy action: ${message.action || ""}` };
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

  async function getAuthenticatedICloudClientState() {
    const saved = await storageGet(ICLOUD_CLIENT_STATE_KEY);
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
        await storageSet({ [ICLOUD_CLIENT_STATE_KEY]: clientState });
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
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
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

  async function applyChromeProxy(proxy) {
    const runtimeProxy = requireRuntimeProxy(proxy);
    const proxyType = String(runtimeProxy.type || "http").toLowerCase();
    if (!["http", "https", "socks", "socks4", "socks5"].includes(proxyType)) {
      throw new Error(`Chrome 不支持的代理类型: ${runtimeProxy.type}`);
    }
    if (!ext.proxy || !ext.proxy.settings || typeof ext.proxy.settings.set !== "function") {
      throw new Error("Chrome proxy API 不可用，请确认已重新加载扩展并授予 proxy 权限");
    }

    await storageSet({
      [PROXY_AUTH_KEY]: {
        enabled: Boolean(runtimeProxy.username),
        host: runtimeProxy.host,
        port: runtimeProxy.port,
        username: runtimeProxy.username || "",
        password: runtimeProxy.password || ""
      }
    });

    const scheme = normalizeChromeProxyScheme(proxyType);
    const server = {
      scheme,
      host: runtimeProxy.host,
      port: runtimeProxy.port
    };
    const rules = {
      bypassList: ["localhost", "127.0.0.1", "::1"]
    };
    if (scheme === "http" || scheme === "https") {
      rules.singleProxy = server;
    } else {
      rules.singleProxy = server;
    }

    await proxySettingsSet({
      value: {
        mode: "fixed_servers",
        rules
      },
      scope: "regular"
    });
    return { ok: true };
  }

  async function clearChromeProxy() {
    if (!ext.proxy || !ext.proxy.settings || typeof ext.proxy.settings.clear !== "function") {
      throw new Error("Chrome proxy API 不可用，请确认已重新加载扩展并授予 proxy 权限");
    }
    await proxySettingsClear({ scope: "regular" });
    await storageRemove(PROXY_AUTH_KEY);
    return { ok: true };
  }

  function normalizeChromeProxyScheme(proxyType) {
    if (proxyType === "socks4") {
      return "socks4";
    }
    if (proxyType === "socks" || proxyType === "socks5") {
      return "socks5";
    }
    if (proxyType === "https") {
      return "https";
    }
    return "http";
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

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      ext.storage.local.get(keys, (result) => {
        const error = ext.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve(result || {});
        }
      });
    });
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      ext.storage.local.set(values, () => {
        const error = ext.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve();
        }
      });
    });
  }

  function storageRemove(keys) {
    return new Promise((resolve, reject) => {
      ext.storage.local.remove(keys, () => {
        const error = ext.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve();
        }
      });
    });
  }

  function proxySettingsSet(details) {
    return new Promise((resolve, reject) => {
      ext.proxy.settings.set(details, () => {
        const error = ext.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve();
        }
      });
    });
  }

  function proxySettingsClear(details) {
    return new Promise((resolve, reject) => {
      ext.proxy.settings.clear(details, () => {
        const error = ext.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve();
        }
      });
    });
  }

  function updateDynamicRules(details) {
    return new Promise((resolve, reject) => {
      ext.declarativeNetRequest.updateDynamicRules(details, () => {
        const error = ext.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve();
        }
      });
    });
  }

  function callOptionalAsync(fn, thisArg, ...args) {
    return new Promise((resolve, reject) => {
      let result;
      try {
        result = fn.call(thisArg, ...args);
      } catch (error) {
        reject(error);
        return;
      }
      if (result && typeof result.then === "function") {
        result.then(resolve, reject);
        return;
      }
      setTimeout(() => {
        const error = ext.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve(result);
        }
      }, 0);
    });
  }
}());
