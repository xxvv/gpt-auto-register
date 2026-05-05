const MIRROR_TAB_IDS_KEY = "mirrorTabIds";
const PROXY_AUTH_KEY = "proxyAuth";
const SUPPORTED_PROXY_SCHEMES = new Set(["http", "https", "socks4", "socks5"]);

let cachedProxyAuth = null;
let proxyAuthLoaded = false;
let mirrorTabIdsQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

function isHttpTab(tab) {
  return Boolean(tab.id && tab.url && /^https?:\/\//.test(tab.url));
}

async function getMirrorTabIds() {
  const data = await chrome.storage.session.get(MIRROR_TAB_IDS_KEY);
  const ids = Array.isArray(data[MIRROR_TAB_IDS_KEY]) ? data[MIRROR_TAB_IDS_KEY] : [];
  return new Set(ids.filter((id) => Number.isInteger(id)));
}

async function saveMirrorTabIds(tabIds) {
  await chrome.storage.session.set({
    [MIRROR_TAB_IDS_KEY]: Array.from(tabIds)
  });
}

async function withMirrorTabIdsLock(task) {
  const run = mirrorTabIdsQueue.then(task, task);
  mirrorTabIdsQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function addMirrorTabId(tabId) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  await withMirrorTabIdsLock(async () => {
    const tabIds = await getMirrorTabIds();
    tabIds.add(tabId);
    await saveMirrorTabIds(tabIds);
  });
}

async function removeMirrorTabId(tabId) {
  await withMirrorTabIdsLock(async () => {
    const tabIds = await getMirrorTabIds();
    if (!tabIds.delete(tabId)) {
      return;
    }
    await saveMirrorTabIds(tabIds);
  });
}

async function clearMirrorTabIds() {
  await chrome.storage.session.remove(MIRROR_TAB_IDS_KEY);
}

async function clickAllConfirmSubmitButtons() {
  const tabs = await chrome.tabs.query({});

  const stats = {
    ok: true,
    totalTabs: tabs.length,
    clickedTabs: 0,
    noMatchTabs: 0,
    skippedTabs: 0
  };

  await Promise.all(
    tabs.map(async (tab) => {
      if (!isHttpTab(tab)) {
        stats.skippedTabs += 1;
        return;
      }

      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const button = document.querySelector(".ConfirmPaymentButton--SubmitButton");
            if (!button) {
              return { clicked: false, noMatch: true };
            }
            button.click();
            return { clicked: true, noMatch: false };
          }
        });

        if (result?.result?.clicked) {
          stats.clickedTabs += 1;
          return;
        }

        stats.noMatchTabs += 1;
      } catch (_error) {
        stats.skippedTabs += 1;
      }
    })
  );

  return stats;
}

async function injectMirrorAllHttpTabs() {
  const tabs = await chrome.tabs.query({});
  const stats = {
    ok: true,
    totalTabs: tabs.length,
    httpTabs: 0,
    injectedTabs: 0,
    skippedTabs: 0,
    failedTabs: 0,
    failures: []
  };

  await Promise.all(
    tabs.map(async (tab) => {
      if (!isHttpTab(tab)) {
        stats.skippedTabs += 1;
        return;
      }

      stats.httpTabs += 1;

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["input-sync-content.js"]
        });
        await addMirrorTabId(tab.id);
        stats.injectedTabs += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        stats.failedTabs += 1;
        stats.failures.push(`${tab.title || tab.url || tab.id}（${reason}）`);
      }
    })
  );
  return stats;
}

async function uninjectMirrorAllTabs() {
  const mirrorTabIds = await getMirrorTabIds();
  const targetTabIds = Array.from(mirrorTabIds);
  const stats = {
    ok: true,
    totalTargets: targetTabIds.length,
    uninjectedTabs: 0,
    skippedTabs: 0,
    failedTabs: 0,
    failures: []
  };

  await Promise.all(
    targetTabIds.map(async (tabId) => {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "MIRROR_DETACH"
        });

        if (response?.detached) {
          stats.uninjectedTabs += 1;
          return;
        }

        stats.skippedTabs += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        stats.failedTabs += 1;
        stats.failures.push(`${tabId}（${reason}）`);
      }
    })
  );

  await clearMirrorTabIds();
  return stats;
}

async function notifyMirrorStats(actionType, stats) {
  try {
    await chrome.runtime.sendMessage({
      type: "MIRROR_ACTION_STATS",
      actionType,
      stats
    });
  } catch (_error) {
    // The side panel may be closed; mirrored actions should keep working.
  }
}

async function broadcastMirrorAction(sourceTabId, payload) {
  return withMirrorTabIdsLock(async () => {
    const mirrorTabIds = await getMirrorTabIds();
    mirrorTabIds.add(sourceTabId);

    const targetTabIds = Array.from(mirrorTabIds).filter((tabId) => tabId !== sourceTabId);
    const stats = {
      ok: true,
      targetTabs: targetTabIds.length,
      deliveredTabs: 0,
      skippedTabs: 0,
      failedTabs: 0,
      removedTabs: 0
    };

    await Promise.all(
      targetTabIds.map(async (tabId) => {
        try {
          const response = await chrome.tabs.sendMessage(tabId, {
            type: "MIRROR_ACTION_APPLY",
            payload
          });

          if (response?.applied) {
            stats.deliveredTabs += 1;
            return;
          }

          stats.skippedTabs += 1;
        } catch (_error) {
          mirrorTabIds.delete(tabId);
          stats.failedTabs += 1;
          stats.removedTabs += 1;
        }
      })
    );

    await saveMirrorTabIds(mirrorTabIds);
    await notifyMirrorStats(payload?.actionType || "操作", stats);
    return stats;
  });
}

function normalizeProxyUrl(rawProxyUrl) {
  const trimmed = String(rawProxyUrl || "").trim();
  if (!trimmed) {
    throw new Error("代理地址为空");
  }
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function parseProxyUrl(rawProxyUrl) {
  let url;
  try {
    url = new URL(normalizeProxyUrl(rawProxyUrl));
  } catch (_error) {
    throw new Error("代理格式错误，请使用 scheme://user:pass@host:port");
  }

  const scheme = url.protocol.replace(":", "").toLowerCase();
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  const port = Number(url.port);

  if (!SUPPORTED_PROXY_SCHEMES.has(scheme)) {
    throw new Error("不支持的代理协议，请使用 http、https、socks4 或 socks5");
  }

  if (!host) {
    throw new Error("代理地址缺少 host");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("代理地址缺少有效端口");
  }

  return {
    server: {
      scheme,
      host,
      port
    },
    auth: url.username
      ? {
          username: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password)
        }
      : null
  };
}

async function setGlobalProxy(rawProxyUrl) {
  const { server, auth } = parseProxyUrl(rawProxyUrl);

  await chrome.proxy.settings.set({
    scope: "regular",
    value: {
      mode: "fixed_servers",
      rules: {
        singleProxy: server,
        bypassList: []
      }
    }
  });

  cachedProxyAuth = auth;
  proxyAuthLoaded = true;
  await chrome.storage.session.set({ [PROXY_AUTH_KEY]: auth });

  const authText = auth ? "，已保存代理账号密码" : "";
  return {
    ok: true,
    message: `代理已设置：${server.scheme}://${server.host}:${server.port}${authText}`
  };
}

async function clearGlobalProxy() {
  await chrome.proxy.settings.set({
    scope: "regular",
    value: {
      mode: "direct"
    }
  });

  cachedProxyAuth = null;
  proxyAuthLoaded = true;
  await chrome.storage.session.remove(PROXY_AUTH_KEY);

  return {
    ok: true,
    message: "代理已清理，浏览器恢复直连"
  };
}

async function getProxyAuth() {
  if (proxyAuthLoaded) {
    return cachedProxyAuth;
  }

  const data = await chrome.storage.session.get(PROXY_AUTH_KEY);
  cachedProxyAuth = data[PROXY_AUTH_KEY] || null;
  proxyAuthLoaded = true;
  return cachedProxyAuth;
}

if (chrome.webRequest?.onAuthRequired) {
  chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
      if (!details.isProxy) {
        callback({});
        return;
      }

      getProxyAuth()
        .then((auth) => {
          callback(auth ? { authCredentials: auth } : {});
        })
        .catch(() => {
          callback({});
        });
    },
    { urls: ["<all_urls>"] },
    ["asyncBlocking"]
  );
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void removeMirrorTabId(tabId).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CLICK_ALL_CONFIRM_SUBMIT_BUTTONS") {
    clickAllConfirmSubmitButtons()
      .then((stats) => sendResponse?.(stats))
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        sendResponse?.({
          ok: false,
          error: reason
        });
      });

    return true;
  }

  if (message?.type === "INJECT_MIRROR_ALL_HTTP_TABS") {
    injectMirrorAllHttpTabs()
      .then((stats) => sendResponse?.(stats))
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        sendResponse?.({
          ok: false,
          error: reason
        });
      });

    return true;
  }

  if (message?.type === "UNINJECT_MIRROR_ALL_TABS") {
    uninjectMirrorAllTabs()
      .then((stats) => sendResponse?.(stats))
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        sendResponse?.({
          ok: false,
          error: reason
        });
      });

    return true;
  }

  if (message?.type === "MIRROR_CONTENT_READY") {
    const sourceTabId = sender.tab?.id;
    if (Number.isInteger(sourceTabId)) {
      addMirrorTabId(sourceTabId)
        .then(() => sendResponse?.({ ok: true }))
        .catch((error) => {
          const reason = error instanceof Error ? error.message : String(error);
          sendResponse?.({ ok: false, error: reason });
        });
      return true;
    }

    sendResponse?.({ ok: false });
    return undefined;
  }

  if (message?.type === "MIRROR_ACTION_BROADCAST") {
    const sourceTabId = sender.tab?.id;
    if (!Number.isInteger(sourceTabId) || !message.payload) {
      sendResponse?.({ ok: false, error: "缺少源 tab 或镜像内容" });
      return undefined;
    }

    broadcastMirrorAction(sourceTabId, message.payload)
      .then((stats) => sendResponse?.(stats))
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        sendResponse?.({
          ok: false,
          error: reason
        });
      });

    return true;
  }

  if (message?.type === "SET_GLOBAL_PROXY") {
    setGlobalProxy(message.proxyUrl)
      .then((result) => sendResponse?.(result))
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        sendResponse?.({
          ok: false,
          error: reason
        });
      });

    return true;
  }

  if (message?.type === "CLEAR_GLOBAL_PROXY") {
    clearGlobalProxy()
      .then((result) => sendResponse?.(result))
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error);
        sendResponse?.({
          ok: false,
          error: reason
        });
      });

    return true;
  }

  return undefined;
});
