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
      if (!details || !details.isProxy) {
        return {};
      }

      if (!proxyAuth.enabled || !proxyAuth.username) {
        return {};
      }

      const challenger = details.challenger || {};
      if (proxyAuth.host && challenger.host && proxyAuth.host !== challenger.host) {
        return {};
      }
      if (proxyAuth.port && challenger.port && Number(proxyAuth.port) !== Number(challenger.port)) {
        return {};
      }

      return {
        authCredentials: {
          username: proxyAuth.username,
          password: proxyAuth.password || ""
        }
      };
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
  );
}());
