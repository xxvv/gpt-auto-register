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
}());
