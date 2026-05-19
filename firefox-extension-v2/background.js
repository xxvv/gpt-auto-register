(function () {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : chrome;
  const PROXY_AUTH_KEY = "gptAutoRegisterProxyAuth";
  let proxyAuth = {};

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
    if (!message || message.type !== "gptAutoRegisterProxy") {
      return undefined;
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
