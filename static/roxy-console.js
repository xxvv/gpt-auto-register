let logIndex = 0;
let running = false;
const STORAGE_KEY = "roxyConsoleAllSettings";
const ACTION_BUTTONS = {
  getWebshareProxyButton: "proxy.current",
  setProxyButton: "proxy.apply",
  replaceProxyButton: "proxy.replace",
  clearProxyButton: "proxy.clear",
  startToStep2Btn: "flow.to_step2",
  startTeamRegistrationBtn: "flow.team_registration",
  startBtn: "flow.full",
  cancelBatchBtn: "flow.cancel",
  getPayUrlBtn: "payment.get_payurl",
  startPayUrlBtn: "payment.from_payurl",
  startStep3Btn: "payment.from_step3",
  startStep4Btn: "payment.from_step4",
  fillStep5FormBtn: "payment.fill_step5",
  continueBrazilPixPaymentBtn: "payment.continue_pix",
  authorizeCurrentAccountButton: "authorization.current",
  generateRandomCardButton: "card.generate_random",
  resetFillSettingsButton: "selectors.reset_defaults"
};
const DEFAULT_SELECTOR_VALUES = {
  phoneSelectorInput: "#phone",
  phoneSelectorAltInput: "",
  cardNumberSelectorInput: "#cardNumber",
  cardNumberSelectorAltInput: "",
  cardExpirySelectorInput: "#cardExpiry",
  cardExpirySelectorAltInput: "",
  cardCvvSelectorInput: "#cardCvv",
  cardCvvSelectorAltInput: "#cardCvc",
  billingNameSelectorInput: "#billingName",
  billingNameSelectorAltInput: "",
  firstNameSelectorInput: "#firstName",
  firstNameSelectorAltInput: "",
  lastNameSelectorInput: "#lastName",
  lastNameSelectorAltInput: "",
  billingLine1SelectorInput: "#billingLine1",
  billingLine1SelectorAltInput: "#billingAddressLine1",
  billingCitySelectorInput: "#billingCity",
  billingCitySelectorAltInput: "#billingLocality",
  billingStateSelectorInput: "#billingState",
  billingStateSelectorAltInput: "",
  billingPostalCodeSelectorInput: "#billingPostalCode",
  billingPostalCodeSelectorAltInput: "",
  countrySelectorInput: "#country",
  countrySelectorAltInput: "#billingCountry",
  passwordSelectorInput: "#password",
  passwordSelectorAltInput: "",
  passwordValueInput: "Bb02911ss"
};

const $ = (id) => document.getElementById(id);

function parseProxyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new URL(raw.includes("://") ? raw : `http://${raw}`);
  if (!parsed.hostname || !parsed.port) {
    throw new Error("Proxy URL must include host and port");
  }
  return {
    enabled: true,
    type: parsed.protocol.replace(":", "") || "http",
    host: parsed.hostname,
    port: Number(parsed.port),
    use_auth: Boolean(parsed.username),
    username: decodeURIComponent(parsed.username || ""),
    password: decodeURIComponent(parsed.password || "")
  };
}

function readProxyConfig() {
  const enabled = $("proxyEnabledCheckbox") ? $("proxyEnabledCheckbox").checked : false;
  if (!enabled) {
    return { enabled: false, type: "http", host: "", port: 0, use_auth: false, username: "", password: "" };
  }
  const manual = $("proxyUrlInput") ? parseProxyUrl($("proxyUrlInput").value) : null;
  if (manual) {
    return manual;
  }
  return null;
}

function formatProxy(proxy) {
  if (!proxy || !proxy.enabled || !proxy.host) {
    return "Proxy: disabled";
  }
  const auth = proxy.use_auth && proxy.username ? `${proxy.username}@` : "";
  return `Proxy: ${proxy.type || "http"}://${auth}${proxy.host}:${proxy.port}`;
}

document.addEventListener("DOMContentLoaded", () => {
  loadSavedConfig();
  bindEvents();
  pollStatus();
  setInterval(pollStatus, 1000);
});

function bindEvents() {
  $("btnHealth").addEventListener("click", healthCheck);
  $("btnOpen").addEventListener("click", openSession);
  $("btnNavigate").addEventListener("click", navigate);
  $("btnRunJs").addEventListener("click", runJs);
  $("btnSmoke").addEventListener("click", smokeTest);
  $("btnDisconnect").addEventListener("click", disconnect);
  $("btnClearLogs").addEventListener("click", clearLogs);
  const toggleFillSettingsButton = $("toggleFillSettingsButton");
  if (toggleFillSettingsButton) {
    toggleFillSettingsButton.addEventListener("click", toggleFillSettings);
  }
  const countrySelect = $("country");
  if (countrySelect) {
    countrySelect.addEventListener("change", renderConditionalPanels);
  }
  document.addEventListener("click", (event) => {
    const button = event.target && event.target.closest ? event.target.closest("button[id]") : null;
    if (!button || !ACTION_BUTTONS[button.id]) return;
    event.preventDefault();
    runV2Action(ACTION_BUTTONS[button.id]);
  });
  document.addEventListener("input", saveConfigFromEvent);
  document.addEventListener("change", saveConfigFromEvent);
  window.addEventListener("beforeunload", saveConfig);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveConfig();
  });
}

function readConfig() {
  return {
    settings: readAllSettings(),
    proxy: readProxyConfig(),
    api_host: $("apiHost").value.trim() || "http://127.0.0.1:50000",
    token: $("token").value.trim(),
    workspace_id: Number($("workspaceId").value || 0),
    dir_id: $("dirId").value.trim(),
    force_open: $("forceOpen").checked,
    headless: $("headless").checked,
    url: $("targetUrl").value.trim() || "https://chatgpt.com",
    script: $("scriptInput").value,
    close_roxy_window: $("closeRoxyWindow").checked
  };
}

function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readAllSettings()));
    localStorage.setItem(`${STORAGE_KEY}:savedAt`, new Date().toISOString());
  } catch (error) {
    appendLog(`本地缓存失败: ${error.message || error}`);
  }
}

function saveConfigFromEvent(event) {
  const target = event.target;
  if (!target || !target.matches || !target.matches("input[id], select[id], textarea[id]")) {
    return;
  }
  saveConfig();
}

function loadSavedConfig() {
  try {
    applyDefaultSelectorValues();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    Object.entries(saved).forEach(([id, value]) => {
      const element = $(id);
      if (!element) return;
      if (element.type === "checkbox") {
        element.checked = Boolean(value);
      } else {
        element.value = value;
      }
    });
    renderFillSettings();
    renderConditionalPanels();
  } catch (_) {}
}

function toggleFillSettings() {
  const panel = $("fillSettingsPanel");
  if (!panel) return;
  panel.hidden = !panel.hidden;
  renderFillSettings();
  saveConfig();
}

function renderFillSettings() {
  const panel = $("fillSettingsPanel");
  const button = $("toggleFillSettingsButton");
  if (!panel || !button) return;
  button.setAttribute("aria-expanded", String(!panel.hidden));
  button.textContent = panel.hidden ? "设置" : "收起";
}

function renderConditionalPanels() {
  const pixPanel = $("pixCdkPanel");
  const countrySelect = $("country");
  if (pixPanel && countrySelect) {
    pixPanel.hidden = countrySelect.value !== "BR";
  }
}

function applyDefaultSelectorValues() {
  Object.entries(DEFAULT_SELECTOR_VALUES).forEach(([id, value]) => {
    const element = $(id);
    if (element && !element.value) element.value = value;
  });
}

function readAllSettings() {
  const settings = {};
  document.querySelectorAll("input[id], select[id], textarea[id]").forEach((element) => {
    settings[element.id] = element.type === "checkbox" ? element.checked : element.value;
  });
  return settings;
}

async function postJson(url, body = {}) {
  saveConfig();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function healthCheck() {
  await guarded(() => postJson("/api/roxy/health", readConfig()));
}

async function openSession() {
  await guarded(() => postJson("/api/roxy/open", readConfig()));
}

async function navigate() {
  await guarded(() => postJson("/api/roxy/navigate", {
    url: $("targetUrl").value.trim(),
    settings: readAllSettings()
  }));
}

async function runJs() {
  await guarded(() => postJson("/api/roxy/run-js", {
    script: $("scriptInput").value,
    settings: readAllSettings()
  }));
}

async function runV2Action(action) {
  if (action === "selectors.reset_defaults") {
    Object.entries(DEFAULT_SELECTOR_VALUES).forEach(([id, value]) => {
      const element = $(id);
      if (element) element.value = value;
    });
    saveConfig();
  }
  await guarded(() => postJson("/api/roxy/action", {
    action,
    ...readConfig()
  }));
}

async function smokeTest() {
  await guarded(() => postJson("/api/roxy/smoke-test", readConfig()));
}

async function disconnect() {
  await guarded(() => postJson("/api/roxy/disconnect", {
    close_roxy_window: $("closeRoxyWindow").checked
  }));
}

async function clearLogs() {
  await postJson("/api/roxy/clear-logs");
  logIndex = 0;
  $("logOutput").innerHTML = '<div class="placeholder">日志已清空</div>';
}

async function guarded(action) {
  try {
    await action();
    await pollStatus();
  } catch (error) {
    appendLog(`前端错误: ${error.message || error}`);
  }
}

async function pollStatus() {
  try {
    const response = await fetch(`/api/roxy/status?log_index=${logIndex}`);
    const data = await response.json();
    running = Boolean(data.running);
    renderStatus(data);
    renderLogs(data.logs || []);
  } catch (error) {
    console.error(error);
  }
}

function renderStatus(data) {
  $("connectionStatus").textContent = data.connected ? "已连接" : "未连接";
  const badge = $("runningBadge");
  badge.textContent = data.running ? "运行中" : "空闲";
  badge.classList.toggle("running", Boolean(data.running));

  const snapshot = data.snapshot || {};
  $("pageTitle").textContent = snapshot.title || "-";
  $("pageUrl").textContent = snapshot.url || "-";
  const handles = snapshot.window_handles || [];
  $("windowCount").textContent = Array.isArray(handles) && handles.length ? String(handles.length) : "-";
  $("jsResult").textContent = snapshot.js_result === undefined ? "-" : JSON.stringify(snapshot.js_result);
  const proxyStatus = $("proxyStatus");
  if (proxyStatus) {
    proxyStatus.textContent = formatProxy(data.current_proxy);
    proxyStatus.classList.toggle("empty", !(data.current_proxy && data.current_proxy.enabled));
  }

  ["btnOpen", "btnNavigate", "btnRunJs", "btnSmoke"].forEach((id) => {
    const element = $(id);
    if (element) element.disabled = running;
  });
  ["startBtn", "startToStep2Btn", "startTeamRegistrationBtn", "startPayUrlBtn", "startStep3Btn", "startStep4Btn"].forEach((id) => {
    const element = $(id);
    if (element) element.disabled = running;
  });
  const cancelButton = $("cancelBatchBtn");
  if (cancelButton) cancelButton.disabled = !running;
}

function renderLogs(lines) {
  if (!lines.length) return;
  const output = $("logOutput");
  const placeholder = output.querySelector(".placeholder");
  if (placeholder) placeholder.remove();
  lines.forEach((line) => appendLog(line));
  logIndex += lines.length;
  output.scrollTop = output.scrollHeight;
}

function appendLog(line) {
  const output = $("logOutput");
  const placeholder = output.querySelector(".placeholder");
  if (placeholder) placeholder.remove();
  const div = document.createElement("div");
  div.className = "log-line";
  div.textContent = line;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}
