const PROXY_AUTH_KEY = "gptAutoRegisterProxyAuth";

let cachedProxyAuth = null;
let proxyAuthLoaded = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[PROXY_AUTH_KEY]) {
    return;
  }

  cachedProxyAuth = changes[PROXY_AUTH_KEY].newValue || null;
  proxyAuthLoaded = true;
});

async function getProxyAuth() {
  if (proxyAuthLoaded) {
    return cachedProxyAuth;
  }

  const saved = await chrome.storage.local.get(PROXY_AUTH_KEY);
  cachedProxyAuth = saved[PROXY_AUTH_KEY] || null;
  proxyAuthLoaded = true;
  return cachedProxyAuth;
}

if (chrome.webRequest?.onAuthRequired) {
  chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
      if (!details?.isProxy) {
        callback({});
        return;
      }

      getProxyAuth()
        .then((proxyAuth) => {
          if (!proxyAuth?.enabled || !proxyAuth.username) {
            callback({});
            return;
          }

          const challenger = details.challenger || {};
          if (proxyAuth.host && challenger.host && proxyAuth.host !== challenger.host) {
            callback({});
            return;
          }
          if (proxyAuth.port && challenger.port && Number(proxyAuth.port) !== Number(challenger.port)) {
            callback({});
            return;
          }

          callback({
            authCredentials: {
              username: proxyAuth.username,
              password: proxyAuth.password || ""
            }
          });
        })
        .catch(() => {
          callback({});
        });
    },
    { urls: ["<all_urls>"] },
    ["asyncBlocking"]
  );
}
