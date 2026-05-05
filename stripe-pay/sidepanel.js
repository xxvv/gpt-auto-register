const API_URL = "https://payurl.779.chat/api/request";
const MAX_ATTEMPTS = 3;
const INJECT_MAX_ATTEMPTS = 10;
const INJECT_RETRY_DELAY_MS = 300;

const accountRowsInput = document.getElementById("accountRows");
const startButton = document.getElementById("startButton");
const injectMirrorButton = document.getElementById("injectMirrorButton");
const uninjectMirrorButton = document.getElementById("uninjectMirrorButton");
const clickAllSubmitButtonsButton = document.getElementById("clickAllSubmitButtonsButton");
const clearButton = document.getElementById("clearButton");
const proxyUrlInput = document.getElementById("proxyUrl");
const setProxyButton = document.getElementById("setProxyButton");
const clearProxyButton = document.getElementById("clearProxyButton");
const statusLog = document.getElementById("statusLog");

const counters = {
  total: document.getElementById("totalCount"),
  valid: document.getElementById("validCount"),
  success: document.getElementById("successCount"),
  failure: document.getElementById("failureCount"),
  formatError: document.getElementById("formatErrorCount")
};

let state = createState();

function createState() {
  return {
    total: 0,
    valid: 0,
    success: 0,
    failure: 0,
    formatError: 0,
    finalFailures: []
  };
}

function renderCounters() {
  counters.total.textContent = state.total;
  counters.valid.textContent = state.valid;
  counters.success.textContent = state.success;
  counters.failure.textContent = state.failure;
  counters.formatError.textContent = state.formatError;
}

function resetRun() {
  state = createState();
  statusLog.replaceChildren();
  renderCounters();
}

function appendLog(message, type = "info") {
  const entry = document.createElement("p");
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  statusLog.append(entry);
  statusLog.scrollTop = statusLog.scrollHeight;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function injectSyncScriptWithRetry(tabId) {
  for (let attempt = 1; attempt <= INJECT_MAX_ATTEMPTS; attempt += 1) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["input-sync-content.js"]
      });
      return;
    } catch (_error) {
      if (attempt === INJECT_MAX_ATTEMPTS) {
        throw _error;
      }
      await sleep(INJECT_RETRY_DELAY_MS);
    }
  }
}

function getDisplayAccount(account, lineNumber) {
  return account || `第 ${lineNumber} 行`;
}

function parseRows(rawText) {
  const nonEmptyLines = rawText
    .split(/\r?\n/)
    .map((line, index) => ({ raw: line, lineNumber: index + 1 }))
    .filter(({ raw }) => raw.trim() !== "");

  const validRows = [];

  state.total = nonEmptyLines.length;

  for (const line of nonEmptyLines) {
    const parts = line.raw.split("|").map((part) => part.trim());
    const account = parts[0] || "";
    const displayAccount = getDisplayAccount(account, line.lineNumber);

    if (parts.length < 4) {
      state.formatError += 1;
      appendLog(`${displayAccount}：格式错误，少于 4 段`, "error");
      continue;
    }

    const token = parts[3];

    if (!token) {
      state.formatError += 1;
      appendLog(`${displayAccount}：格式错误，token 为空`, "error");
      continue;
    }

    validRows.push({
      account: displayAccount,
      token,
      lineNumber: line.lineNumber
    });
  }

  state.valid = validRows.length;
  renderCounters();

  return validRows;
}

async function requestPayUrl(row, attempt = 1) {
  appendLog(`${row.account}：第 ${attempt} 次请求中`, attempt === 1 ? "info" : "warn");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        token: row.token,
        plus: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.status === "success" && data.Stripe_payurl) {
      const createdTab = await chrome.tabs.create({ url: data.Stripe_payurl });
      if (createdTab.id) {
        try {
          await injectSyncScriptWithRetry(createdTab.id);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          appendLog(`${row.account}：注入镜像脚本失败（${reason}）`, "warn");
        }
      }
      state.success += 1;
      renderCounters();
      appendLog(`${row.account}：成功，已打开 Stripe 链接`, "success");
      return;
    }

    const reason = data.message || data.error || "接口未返回成功状态或缺少 Stripe_payurl";
    throw new Error(reason);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    if (attempt < MAX_ATTEMPTS) {
      appendLog(`${row.account}：请求失败，准备重试（${reason}）`, "warn");
      return requestPayUrl(row, attempt + 1);
    }

    state.failure += 1;
    state.finalFailures.push(`${row.account}（${reason}）`);
    renderCounters();
    appendLog(`${row.account}：失败，已达到 ${MAX_ATTEMPTS} 次尝试（${reason}）`, "error");
  }
}

async function handleStart() {
  resetRun();

  const validRows = parseRows(accountRowsInput.value);
  appendLog(`解析完成：总行数 ${state.total}，有效 ${state.valid}，格式错误 ${state.formatError}`, "info");

  if (validRows.length === 0) {
    appendLog("没有可请求的有效 token", "warn");
    return;
  }

  startButton.disabled = true;
  clearButton.disabled = true;

  try {
    await Promise.all(validRows.map((row) => requestPayUrl(row)));

    if (state.finalFailures.length > 0) {
      appendLog(`3 次仍失败的账号：${state.finalFailures.join("；")}`, "error");
    } else {
      appendLog("没有 3 次仍失败的账号", "success");
    }

    appendLog(`处理完成：成功 ${state.success}，失败 ${state.failure}，格式错误 ${state.formatError}`, "info");
  } finally {
    startButton.disabled = false;
    clearButton.disabled = false;
  }
}

async function handleInjectMirrorAllTabs() {
  injectMirrorButton.disabled = true;
  appendLog("开始执行：向所有窗口的 http/https tab 注入镜像脚本", "info");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "INJECT_MIRROR_ALL_HTTP_TABS"
    });

    if (!response?.ok) {
      const reason = response?.error || "未知错误";
      appendLog(`镜像注入失败：${reason}`, "error");
      return;
    }

    appendLog(
      `镜像注入完成：总 tab ${response.totalTabs || 0}，HTTP ${response.httpTabs || 0}，成功 ${
        response.injectedTabs || 0
      }，跳过 ${response.skippedTabs || 0}，失败 ${response.failedTabs || 0}`,
      response.failedTabs ? "warn" : "success"
    );

    if (Array.isArray(response.failures) && response.failures.length > 0) {
      appendLog(`注入失败明细：${response.failures.slice(0, 5).join("；")}`, "warn");
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    appendLog(`镜像注入失败：${reason}`, "error");
  } finally {
    injectMirrorButton.disabled = false;
  }
}

async function handleUninjectMirrorAllTabs() {
  uninjectMirrorButton.disabled = true;
  appendLog("开始执行：取消所有已注入 tab 的镜像监听", "info");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "UNINJECT_MIRROR_ALL_TABS"
    });

    if (!response?.ok) {
      const reason = response?.error || "未知错误";
      appendLog(`取消注入失败：${reason}`, "error");
      return;
    }

    appendLog(
      `取消注入完成：处理 ${response.totalTargets || 0}，成功 ${response.uninjectedTabs || 0}，跳过 ${response.skippedTabs || 0}，失败 ${response.failedTabs || 0}`,
      response.failedTabs ? "warn" : "success"
    );

    if (!response.failedTabs && !response.skippedTabs) {
      appendLog("当前已注入 tab 的镜像监听都已移除", "success");
    }

    if (Array.isArray(response.failures) && response.failures.length > 0) {
      appendLog(`取消注入失败明细：${response.failures.slice(0, 5).join("；")}`, "warn");
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    appendLog(`取消注入失败：${reason}`, "error");
  } finally {
    uninjectMirrorButton.disabled = false;
  }
}

async function handleClickAllSubmitButtons() {
  clickAllSubmitButtonsButton.disabled = true;
  appendLog("开始执行：点击所有 tab 的 ConfirmPaymentButton--SubmitButton", "info");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CLICK_ALL_CONFIRM_SUBMIT_BUTTONS"
    });

    if (!response?.ok) {
      const reason = response?.error || "未知错误";
      appendLog(`执行失败：${reason}`, "error");
      return;
    }

    const clickedTabs = response.clickedTabs || 0;
    const noMatchTabs = response.noMatchTabs || 0;
    const skippedTabs = response.skippedTabs || 0;
    const totalTabs = response.totalTabs || 0;
    appendLog(
      `执行完成：总 tab ${totalTabs}，已点击 ${clickedTabs}，无匹配 ${noMatchTabs}，跳过 ${skippedTabs}`,
      "success"
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    appendLog(`执行失败：${reason}`, "error");
  } finally {
    clickAllSubmitButtonsButton.disabled = false;
  }
}

function setProxyControlsDisabled(disabled) {
  setProxyButton.disabled = disabled;
  clearProxyButton.disabled = disabled;
}

async function handleSetProxy() {
  const rawProxy = proxyUrlInput.value.trim();
  setProxyControlsDisabled(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: rawProxy ? "SET_GLOBAL_PROXY" : "CLEAR_GLOBAL_PROXY",
      proxyUrl: rawProxy
    });

    if (!response?.ok) {
      const reason = response?.error || "未知错误";
      appendLog(`代理设置失败：${reason}`, "error");
      return;
    }

    appendLog(response.message || (rawProxy ? "代理已设置" : "代理已清理"), "success");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    appendLog(`代理设置失败：${reason}`, "error");
  } finally {
    setProxyControlsDisabled(false);
  }
}

async function handleClearProxy() {
  proxyUrlInput.value = "";
  setProxyControlsDisabled(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CLEAR_GLOBAL_PROXY"
    });

    if (!response?.ok) {
      const reason = response?.error || "未知错误";
      appendLog(`代理清理失败：${reason}`, "error");
      return;
    }

    appendLog(response.message || "代理已清理，浏览器恢复直连", "success");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    appendLog(`代理清理失败：${reason}`, "error");
  } finally {
    setProxyControlsDisabled(false);
  }
}

function handleClear() {
  accountRowsInput.value = "";
  resetRun();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "MIRROR_ACTION_STATS") {
    return undefined;
  }

  const stats = message.stats || {};
  const actionType = message.actionType || "操作";
  const skippedTabs = stats.skippedTabs || 0;
  const failedTabs = stats.failedTabs || 0;
  const deliveredTabs = stats.deliveredTabs || 0;

  if (actionType === "input" && skippedTabs === 0 && failedTabs === 0) {
    return undefined;
  }

  appendLog(
    `镜像${actionType}：同步 ${deliveredTabs}，跳过 ${skippedTabs}，失败 ${failedTabs}`,
    skippedTabs || failedTabs ? "warn" : "info"
  );

  return undefined;
});

startButton.addEventListener("click", handleStart);
injectMirrorButton.addEventListener("click", handleInjectMirrorAllTabs);
uninjectMirrorButton.addEventListener("click", handleUninjectMirrorAllTabs);
clickAllSubmitButtonsButton.addEventListener("click", handleClickAllSubmitButtons);
clearButton.addEventListener("click", handleClear);
setProxyButton.addEventListener("click", handleSetProxy);
clearProxyButton.addEventListener("click", handleClearProxy);

renderCounters();
