(function () {
  "use strict";

  const STORAGE_KEY = "roxy_server.panel.v1";
  const state = {
    lastConsumedCount: 0,
    polling: null,
  };

  const el = {
    roxyToken: document.getElementById("roxyTokenInput"),
    windowId: document.getElementById("windowIdInput"),
    workspaceId: document.getElementById("workspaceIdInput"),
    urlQueue: document.getElementById("urlQueueInput"),
    phoneQueue: document.getElementById("phoneQueueInput"),
    health: document.getElementById("healthButton"),
    start: document.getElementById("startButton"),
    stop: document.getElementById("stopButton"),
    clearLogs: document.getElementById("clearLogsButton"),
    badge: document.getElementById("runBadge"),
    total: document.getElementById("totalStat"),
    completed: document.getElementById("completedStat"),
    success: document.getElementById("successStat"),
    fail: document.getElementById("failStat"),
    currentUrl: document.getElementById("currentUrlText"),
    log: document.getElementById("logOutput"),
    autoScrollLogs: document.getElementById("autoScrollLogsInput"),
  };

  function loadSettings() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (_) {
      saved = {};
    }
    el.roxyToken.value = saved.roxyToken || "";
    el.windowId.value = saved.windowId || "";
    el.workspaceId.value = saved.workspaceId || "";
    el.urlQueue.value = saved.urlQueueText || "";
    el.phoneQueue.value = saved.phoneQueueText || "";
    el.autoScrollLogs.checked = saved.autoScrollLogs !== false;
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      roxyToken: el.roxyToken.value,
      windowId: el.windowId.value,
      workspaceId: el.workspaceId.value,
      urlQueueText: el.urlQueue.value,
      phoneQueueText: el.phoneQueue.value,
      autoScrollLogs: el.autoScrollLogs.checked,
    }));
  }

  function payload() {
    saveSettings();
    return {
      roxyToken: el.roxyToken.value.trim(),
      windowId: el.windowId.value.trim(),
      workspaceId: el.workspaceId.value.trim(),
      urlQueueText: el.urlQueue.value,
      phoneQueueText: el.phoneQueue.value,
    };
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  async function refreshStatus() {
    const response = await fetch("/api/status");
    const data = await response.json();
    if (data && data.ok) {
      renderStatus(data.status);
    }
  }

  function renderStatus(status) {
    const running = Boolean(status && status.running);
    el.badge.textContent = running ? "运行中" : "空闲";
    el.badge.classList.toggle("running", running);
    el.start.disabled = running;
    el.stop.disabled = !running;
    el.total.textContent = String(status.total || 0);
    el.completed.textContent = String(status.completed || 0);
    el.success.textContent = String(status.success || 0);
    el.fail.textContent = String(status.fail || 0);
    el.currentUrl.textContent = status.current_url ? `当前: ${status.current_url}` : "";
    el.log.textContent = (status.logs || []).join("\n");
    if (el.autoScrollLogs.checked) {
      el.log.scrollTop = el.log.scrollHeight;
    }
    removeConsumedUrls(status.consumed_urls || []);
  }

  function removeConsumedUrls(consumedUrls) {
    const fresh = consumedUrls.slice(state.lastConsumedCount);
    if (!fresh.length) {
      return;
    }
    state.lastConsumedCount = consumedUrls.length;
    const lines = el.urlQueue.value.split(/\r?\n/);
    fresh.forEach((url) => {
      const target = String(url).trim();
      const index = lines.findIndex((line) => String(line).trim() === target);
      if (index >= 0) {
        lines.splice(index, 1);
      }
    });
    el.urlQueue.value = lines.join("\n");
    saveSettings();
  }

  function startPolling() {
    if (state.polling) {
      clearInterval(state.polling);
    }
    state.polling = setInterval(refreshStatus, 1500);
  }

  ["input", "change"].forEach((eventName) => {
    [el.roxyToken, el.windowId, el.workspaceId, el.urlQueue, el.phoneQueue, el.autoScrollLogs].forEach((node) => {
      node.addEventListener(eventName, saveSettings);
    });
  });

  el.health.addEventListener("click", async () => {
    try {
      await postJson("/api/health", payload());
      alert("Roxy API 检查成功");
    } catch (error) {
      alert(`Roxy API 检查失败: ${error.message}`);
    }
  });

  el.start.addEventListener("click", async () => {
    try {
      state.lastConsumedCount = 0;
      const result = await postJson("/api/run", payload());
      renderStatus(result.status);
      startPolling();
    } catch (error) {
      alert(`启动失败: ${error.message}`);
    }
  });

  el.stop.addEventListener("click", async () => {
    try {
      const result = await postJson("/api/stop", {});
      renderStatus(result.status);
    } catch (error) {
      alert(`停止失败: ${error.message}`);
    }
  });

  el.clearLogs.addEventListener("click", () => {
    el.log.textContent = "";
  });

  loadSettings();
  el.stop.disabled = true;
  refreshStatus();
  startPolling();
})();
