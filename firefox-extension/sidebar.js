(function () {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : chrome;

  const DOMAINS = [
    "minima.edu.kg",
    "watermelon.edu.kg",
    "ciat.edu.kg",
    "cars.edu.kg",
    "damahou.edu.kg",
    "nnai.website",
    "dxdxdagege.shop",
    "dalongma.shop",
    "sadfsdddds.shop",
    "jianjuebudnm.shop"
  ];

  const CODE_API = "https://getemail.nnai.website/api/code";
  const PAYURL_API = "https://payurl.779.chat/api/request";
  const WEBSHARE_LIST_API = "https://proxy.webshare.io/api/v2/proxy/list/";
  const WEBSHARE_REPLACE_API = "https://proxy.webshare.io/api/v3/proxy/replace/";
  const STORAGE_KEY = "gptAutoRegisterSidebarState";
  const PROXY_AUTH_KEY = "gptAutoRegisterProxyAuth";
  const US_ZIP3_STATE_RANGES_PATH = "us_zip3_state_ranges.json";
  const POLL_ATTEMPTS = 3;
  const POLL_DELAY_MS = 2500;
  const DEFAULT_FILL_SETTINGS = Object.freeze({
    phoneSelector: "#phone",
    cardNumberSelector: "#cardNumber",
    cardExpirySelector: "#cardExpiry",
    cardCvvSelector: "#cardCvv",
    firstNameSelector: "#firstName",
    lastNameSelector: "#lastName",
    billingLine1Selector: "#billingLine1",
    billingCitySelector: "#billingCity",
    billingStateSelector: "#billingState",
    billingPostalCodeSelector: "#billingPostalCode",
    passwordSelector: "#password",
    passwordValue: "Bb02911ss"
  });

  const elements = {
    currentTabText: document.getElementById("currentTabText"),
    refreshTabButton: document.getElementById("refreshTabButton"),
    generateEmailsButton: document.getElementById("generateEmailsButton"),
    emailList: document.getElementById("emailList"),
    copyEmailButton: document.getElementById("copyEmailButton"),
    fetchCodeButton: document.getElementById("fetchCodeButton"),
    copyCodeButton: document.getElementById("copyCodeButton"),
    codeOutput: document.getElementById("codeOutput"),
    phoneKeyInput: document.getElementById("phoneKeyInput"),
    phonePreview: document.getElementById("phonePreview"),
    copyPhoneButton: document.getElementById("copyPhoneButton"),
    fetchPhoneCodeButton: document.getElementById("fetchPhoneCodeButton"),
    copyPhoneCodeButton: document.getElementById("copyPhoneCodeButton"),
    phoneCodeOutput: document.getElementById("phoneCodeOutput"),
    refreshProxyButton: document.getElementById("refreshProxyButton"),
    proxyStatus: document.getElementById("proxyStatus"),
    webshareApiKeyInput: document.getElementById("webshareApiKeyInput"),
    proxyProtocolSelect: document.getElementById("proxyProtocolSelect"),
    getWebshareProxyButton: document.getElementById("getWebshareProxyButton"),
    setProxyButton: document.getElementById("setProxyButton"),
    replaceProxyButton: document.getElementById("replaceProxyButton"),
    clearProxyButton: document.getElementById("clearProxyButton"),
    proxyOutput: document.getElementById("proxyOutput"),
    fetchPayUrlButton: document.getElementById("fetchPayUrlButton"),
    payUrlOutput: document.getElementById("payUrlOutput"),
    cardInput: document.getElementById("cardInput"),
    toggleFillSettingsButton: document.getElementById("toggleFillSettingsButton"),
    fillCardButton: document.getElementById("fillCardButton"),
    cardPreview: document.getElementById("cardPreview"),
    removeElementSelectorInput: document.getElementById("removeElementSelectorInput"),
    removeElementButton: document.getElementById("removeElementButton"),
    fillSettingsPanel: document.getElementById("fillSettingsPanel"),
    phoneSelectorInput: document.getElementById("phoneSelectorInput"),
    cardNumberSelectorInput: document.getElementById("cardNumberSelectorInput"),
    cardExpirySelectorInput: document.getElementById("cardExpirySelectorInput"),
    cardCvvSelectorInput: document.getElementById("cardCvvSelectorInput"),
    firstNameSelectorInput: document.getElementById("firstNameSelectorInput"),
    lastNameSelectorInput: document.getElementById("lastNameSelectorInput"),
    billingLine1SelectorInput: document.getElementById("billingLine1SelectorInput"),
    billingCitySelectorInput: document.getElementById("billingCitySelectorInput"),
    billingStateSelectorInput: document.getElementById("billingStateSelectorInput"),
    billingPostalCodeSelectorInput: document.getElementById("billingPostalCodeSelectorInput"),
    passwordSelectorInput: document.getElementById("passwordSelectorInput"),
    passwordValueInput: document.getElementById("passwordValueInput"),
    resetFillSettingsButton: document.getElementById("resetFillSettingsButton"),
    fillOutput: document.getElementById("fillOutput")
  };

  const state = {
    emails: [],
    selectedEmail: "",
    lastCode: "",
    phoneKeyInput: "",
    phoneKey: null,
    lastPhoneCode: "",
    currentProxy: null,
    webshareApiKey: "",
    proxyProtocol: "http",
    removeElementSelector: "",
    fillSettings: createDefaultFillSettings(),
    fillSettingsExpanded: false,
    currentTab: null,
    busy: new Set()
  };
  let usZip3StateRangesPromise = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    await ensureUsZip3StateRanges();
    await restoreState();
    await refreshCurrentTab();
    renderEmails();
    renderPhonePreview();
    renderProxyStatus();
    await renderCardPreview();
  }

  function bindEvents() {
    elements.refreshTabButton.addEventListener("click", refreshCurrentTab);
    elements.generateEmailsButton.addEventListener("click", generateEmails);
    elements.copyEmailButton.addEventListener("click", copySelectedEmail);
    elements.fetchCodeButton.addEventListener("click", fetchVerificationCode);
    elements.copyCodeButton.addEventListener("click", copyLastCode);
    elements.phoneKeyInput.addEventListener("input", handlePhoneKeyInput);
    elements.copyPhoneButton.addEventListener("click", copyPhoneNumber);
    elements.fetchPhoneCodeButton.addEventListener("click", fetchPhoneVerificationCode);
    elements.copyPhoneCodeButton.addEventListener("click", copyLastPhoneCode);
    elements.refreshProxyButton.addEventListener("click", refreshProxyStatus);
    elements.getWebshareProxyButton.addEventListener("click", getCurrentWebshareProxy);
    elements.setProxyButton.addEventListener("click", setCurrentProxy);
    elements.replaceProxyButton.addEventListener("click", replaceWebshareProxy);
    elements.clearProxyButton.addEventListener("click", clearProxy);
    elements.fetchPayUrlButton.addEventListener("click", fetchPayUrl);
    elements.toggleFillSettingsButton.addEventListener("click", toggleFillSettingsPanel);
    elements.resetFillSettingsButton.addEventListener("click", resetFillSettings);
    elements.fillCardButton.addEventListener("click", fillCardInCurrentTab);
    elements.removeElementButton.addEventListener("click", removeElementInCurrentTab);
    elements.cardPreview.addEventListener("click", handleCardPreviewCopy);
    elements.webshareApiKeyInput.addEventListener("input", () => {
      state.webshareApiKey = elements.webshareApiKeyInput.value;
      persistState();
    });
    elements.proxyProtocolSelect.addEventListener("change", () => {
      state.proxyProtocol = normalizeProxyProtocol(elements.proxyProtocolSelect.value);
      persistState();
    });
    elements.removeElementSelectorInput.addEventListener("input", () => {
      state.removeElementSelector = String(elements.removeElementSelectorInput.value || "").trim();
      persistState();
    });
    elements.cardInput.addEventListener("input", () => {
      renderCardPreview();
      persistState();
    });
    bindFillSettingsInputs();
  }

  async function restoreState() {
    try {
      const saved = await ext.storage.local.get(STORAGE_KEY);
      const data = saved && saved[STORAGE_KEY] ? saved[STORAGE_KEY] : {};
      state.emails = Array.isArray(data.emails) ? data.emails.filter(Boolean) : [];
      state.selectedEmail = typeof data.selectedEmail === "string" ? data.selectedEmail : "";
      state.lastCode = typeof data.lastCode === "string" ? data.lastCode : "";
      state.phoneKeyInput = typeof data.phoneKeyInput === "string" ? data.phoneKeyInput : "";
      state.lastPhoneCode = typeof data.lastPhoneCode === "string" ? data.lastPhoneCode : "";
      state.currentProxy = isRuntimeProxy(data.currentProxy) ? data.currentProxy : null;
      state.webshareApiKey = typeof data.webshareApiKey === "string" ? data.webshareApiKey : "";
      state.proxyProtocol = normalizeProxyProtocol(data.proxyProtocol);
      state.removeElementSelector = typeof data.removeElementSelector === "string" ? data.removeElementSelector : "";
      state.fillSettings = sanitizeFillSettings(data.fillSettings);
      state.fillSettingsExpanded = Boolean(data.fillSettingsExpanded);
      elements.phoneKeyInput.value = state.phoneKeyInput;
      elements.webshareApiKeyInput.value = state.webshareApiKey;
      elements.proxyProtocolSelect.value = state.proxyProtocol;
      elements.removeElementSelectorInput.value = state.removeElementSelector;
      elements.cardInput.value = typeof data.cardInput === "string" ? data.cardInput : "";
      state.phoneKey = parsePhoneKeyInput(state.phoneKeyInput, { allowEmpty: true });
      renderFillSettings();
    } catch (error) {
      showOutput(elements.codeOutput, "error", `读取本地状态失败：${formatError(error)}`);
    }

    if (!state.emails.length) {
      createEmailSet();
    }
    if (!state.selectedEmail || !state.emails.includes(state.selectedEmail)) {
      state.selectedEmail = state.emails[0] || "";
    }
  }

  async function persistState() {
    try {
      await ext.storage.local.set({
        [STORAGE_KEY]: {
          emails: state.emails,
          selectedEmail: state.selectedEmail,
          lastCode: state.lastCode,
          phoneKeyInput: state.phoneKeyInput,
          lastPhoneCode: state.lastPhoneCode,
          currentProxy: state.currentProxy,
          webshareApiKey: state.webshareApiKey,
          proxyProtocol: state.proxyProtocol,
          removeElementSelector: state.removeElementSelector,
          cardInput: elements.cardInput.value,
          fillSettings: state.fillSettings,
          fillSettingsExpanded: state.fillSettingsExpanded
        }
      });
    } catch (error) {
      console.warn("Failed to persist sidebar state", error);
    }
  }

  async function refreshCurrentTab() {
    try {
      const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
      state.currentTab = tab || null;
      if (!tab) {
        elements.currentTabText.textContent = "未找到当前标签页";
        return null;
      }
      const url = tab.url || "";
      elements.currentTabText.textContent = url ? shortUrl(url) : "当前标签页无 URL";
      return tab;
    } catch (error) {
      state.currentTab = null;
      elements.currentTabText.textContent = `标签页状态失败：${formatError(error)}`;
      return null;
    }
  }

  function generateEmails() {
    createEmailSet();
    state.selectedEmail = state.emails[0] || "";
    renderEmails();
    showOutput(elements.codeOutput, "success", `已生成 ${state.emails.length} 个邮箱`);
    persistState();
  }

  function createEmailSet() {
    const localPart = generateLocalPart();
    state.emails = DOMAINS.map((domain) => `${localPart}@${domain}`);
  }

  function generateLocalPart() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let randomPart = "";
    const cryptoObj = globalThis.crypto;
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      const values = new Uint8Array(12);
      cryptoObj.getRandomValues(values);
      randomPart = Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
    } else {
      for (let index = 0; index < 12; index += 1) {
        randomPart += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
    return `${month}${day}${randomPart}`;
  }

  function renderEmails() {
    elements.emailList.textContent = "";
    state.emails.forEach((email) => {
      const label = document.createElement("label");
      label.className = `email-item${email === state.selectedEmail ? " selected" : ""}`;
      label.setAttribute("role", "listitem");

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "selectedEmail";
      radio.value = email;
      radio.checked = email === state.selectedEmail;
      radio.addEventListener("change", () => {
        state.selectedEmail = email;
        renderEmails();
        persistState();
      });

      const text = document.createElement("span");
      text.className = "email-text";
      text.textContent = email;

      label.append(radio, text);
      elements.emailList.append(label);
    });
  }

  async function copySelectedEmail() {
    const email = getSelectedEmail();
    if (!email) {
      showOutput(elements.codeOutput, "error", "请先生成邮箱");
      return;
    }
    try {
      await writeClipboard(email);
      showOutput(elements.codeOutput, "success", `已复制：${email}`);
    } catch (error) {
      showOutput(elements.codeOutput, "error", `复制失败：${formatError(error)}`);
    }
  }

  async function fetchVerificationCode() {
    const email = getSelectedEmail();
    if (!email) {
      showOutput(elements.codeOutput, "error", "请先生成邮箱");
      return;
    }

    setBusy("code", true);
    showOutput(elements.codeOutput, "info", `正在获取验证码：${email}`);

    let lastError = "";
    try {
      for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
        try {
          const url = `${CODE_API}?email=${encodeURIComponent(email)}&format=json`;
          const response = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store"
          });
          const data = await readJsonResponse(response, "验证码接口");
          const code = String(data.code || "").trim();
          if (response.ok && code) {
            state.lastCode = code;
            await persistState();
            showOutput(elements.codeOutput, "success", formatCodeResult(data, code));
            return;
          }
          lastError = code ? `HTTP ${response.status}` : "响应缺少 code";
        } catch (error) {
          lastError = formatError(error);
        }

        if (attempt < POLL_ATTEMPTS) {
          showOutput(elements.codeOutput, "info", `第 ${attempt}/${POLL_ATTEMPTS} 次未取到，继续轮询`);
          await delay(POLL_DELAY_MS);
        }
      }
      showOutput(elements.codeOutput, "error", `获取验证码失败，已轮询 ${POLL_ATTEMPTS} 次：${lastError || "没有返回 code"}`);
    } finally {
      setBusy("code", false);
    }
  }

  async function copyLastCode() {
    const code = String(state.lastCode || "").trim();
    if (!code) {
      showOutput(elements.codeOutput, "error", "请先获取验证码");
      return;
    }
    try {
      await writeClipboard(code);
      showOutput(elements.codeOutput, "success", `已复制验证码：${code}`);
    } catch (error) {
      showOutput(elements.codeOutput, "error", `复制验证码失败：${formatError(error)}`);
    }
  }

  function handlePhoneKeyInput() {
    state.phoneKeyInput = String(elements.phoneKeyInput.value || "").trim();
    state.lastPhoneCode = "";
    try {
      state.phoneKey = parsePhoneKeyInput(state.phoneKeyInput, { allowEmpty: true });
      renderPhonePreview();
      if (state.phoneKeyInput && state.phoneKey) {
        showOutput(
          elements.phoneCodeOutput,
          "success",
          `已识别手机：${state.phoneKey.phone}\n短信地址：${state.phoneKey.smsUrl}`
        );
      } else {
        elements.phoneCodeOutput.textContent = "";
        elements.phoneCodeOutput.className = "result-output";
      }
    } catch (error) {
      state.phoneKey = null;
      renderPhonePreview();
      showOutput(elements.phoneCodeOutput, "error", formatError(error));
    }
    persistState();
  }

  async function copyPhoneNumber() {
    let phoneKey;
    try {
      phoneKey = requirePhoneKey();
    } catch (error) {
      showOutput(elements.phoneCodeOutput, "error", formatError(error));
      return;
    }

    try {
      await writeClipboard(phoneKey.phone);
      showOutput(elements.phoneCodeOutput, "success", `已复制手机：${phoneKey.phone}`);
    } catch (error) {
      showOutput(elements.phoneCodeOutput, "error", `复制手机失败：${formatError(error)}`);
    }
  }

  async function fetchPhoneVerificationCode() {
    let phoneKey;
    try {
      phoneKey = requirePhoneKey();
    } catch (error) {
      showOutput(elements.phoneCodeOutput, "error", formatError(error));
      return;
    }

    setBusy("phoneCode", true);
    showOutput(elements.phoneCodeOutput, "info", `正在获取短信验证码：${phoneKey.phone}`);

    let lastError = "";
    try {
      for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
        try {
          const response = await fetch(phoneKey.smsUrl, {
            method: "GET",
            cache: "no-store",
            headers: { Accept: "text/plain,application/json,text/html,*/*" }
          });
          const body = await response.text();
          const code = extractSixDigitCode(body);
          if (response.ok && code) {
            state.lastPhoneCode = code;
            await persistState();
            showOutput(
              elements.phoneCodeOutput,
              "success",
              `短信验证码：${code}\n手机：${phoneKey.phone}\n来源：${phoneKey.smsUrl}`
            );
            return;
          }
          lastError = response.ok
            ? "响应里没有匹配到 6 位验证码"
            : `HTTP ${response.status} ${body.slice(0, 120)}`;
        } catch (error) {
          lastError = formatError(error);
        }

        if (attempt < POLL_ATTEMPTS) {
          showOutput(elements.phoneCodeOutput, "info", `第 ${attempt}/${POLL_ATTEMPTS} 次未取到短信码，继续轮询`);
          await delay(POLL_DELAY_MS);
        }
      }
      showOutput(
        elements.phoneCodeOutput,
        "error",
        `获取短信验证码失败，已轮询 ${POLL_ATTEMPTS} 次：${lastError || "没有匹配到 6 位验证码"}`
      );
    } finally {
      setBusy("phoneCode", false);
    }
  }

  async function copyLastPhoneCode() {
    const code = String(state.lastPhoneCode || "").trim();
    if (!code) {
      showOutput(elements.phoneCodeOutput, "error", "请先获取短信验证码");
      return;
    }
    try {
      await writeClipboard(code);
      showOutput(elements.phoneCodeOutput, "success", `已复制短信验证码：${code}`);
    } catch (error) {
      showOutput(elements.phoneCodeOutput, "error", `复制短信验证码失败：${formatError(error)}`);
    }
  }

  async function refreshProxyStatus() {
    setBusy("proxy", true);
    showOutput(elements.proxyOutput, "info", "正在读取 Firefox 代理状态");
    try {
      renderProxyStatus();
      await persistState();
      showOutput(elements.proxyOutput, "success", `当前 Firefox 代理：${formatProxy(state.currentProxy)}`);
    } catch (error) {
      showOutput(elements.proxyOutput, "error", `读取代理状态失败：${formatError(error)}`);
      renderProxyStatus();
    } finally {
      setBusy("proxy", false);
    }
  }

  async function getCurrentWebshareProxy() {
    await fetchAndApplyProxy({
      busyLabel: "正在获取当前 Webshare 代理",
      action: "current",
      successPrefix: "已获取并设置 Firefox 代理"
    });
  }

  async function replaceWebshareProxy() {
    await fetchAndApplyProxy({
      busyLabel: "正在替换 Webshare 代理",
      action: "replace",
      successPrefix: "已替换并设置 Firefox 代理"
    });
  }

  async function fetchAndApplyProxy({ busyLabel, action, successPrefix }) {
    const webshareApiKey = requireWebshareApiKey();
    setBusy("proxy", true);
    showOutput(elements.proxyOutput, "info", busyLabel);
    try {
      const proxy = action === "replace"
        ? await replaceWebshareProxyDirect(webshareApiKey)
        : await getCurrentWebshareProxyDirect(webshareApiKey);
      await applyFirefoxProxy(proxy);
      state.currentProxy = proxy;
      renderProxyStatus();
      await persistState();
      showOutput(
        elements.proxyOutput,
        "success",
        `${successPrefix}：${formatProxy(proxy)}\n用户名: ${proxy.username || "-"}\n密码: ${proxy.password || "-"}`
      );
    } catch (error) {
      showOutput(elements.proxyOutput, "error", `${busyLabel}失败：${formatError(error)}`);
    } finally {
      setBusy("proxy", false);
    }
  }

  async function setCurrentProxy() {
    if (!isRuntimeProxy(state.currentProxy)) {
      await refreshProxyStatus();
    }
    if (!isRuntimeProxy(state.currentProxy)) {
      showOutput(elements.proxyOutput, "error", "没有可设置的代理，请先获取当前 Webshare 代理");
      return;
    }

    setBusy("proxy", true);
    showOutput(elements.proxyOutput, "info", "正在设置 Firefox 代理");
    try {
      await applyFirefoxProxy(state.currentProxy);
      renderProxyStatus();
      showOutput(
        elements.proxyOutput,
        "success",
        `已设置 Firefox 代理：${formatProxy(state.currentProxy)}\n用户名: ${state.currentProxy.username || "-"}\n密码: ${state.currentProxy.password || "-"}`
      );
    } catch (error) {
      showOutput(elements.proxyOutput, "error", `设置代理失败：${formatError(error)}`);
    } finally {
      setBusy("proxy", false);
    }
  }

  async function clearProxy() {
    setBusy("proxy", true);
    showOutput(elements.proxyOutput, "info", "正在清除 Firefox 代理");
    try {
      await ext.proxy.settings.clear({});
      await ext.storage.local.remove(PROXY_AUTH_KEY);
      state.currentProxy = null;
      renderProxyStatus();
      await persistState();
      showOutput(elements.proxyOutput, "success", "已清除 Firefox 代理");
    } catch (error) {
      showOutput(elements.proxyOutput, "error", `清除代理失败：${formatError(error)}`);
    } finally {
      setBusy("proxy", false);
    }
  }

  async function applyFirefoxProxy(proxy) {
    const runtimeProxy = requireRuntimeProxy(proxy);
    const proxyType = String(runtimeProxy.type || "http").toLowerCase();
    if (!["http", "https", "socks", "socks4", "socks5"].includes(proxyType)) {
      throw new Error(`Firefox 不支持的代理类型：${runtimeProxy.type}`);
    }

    await ext.storage.local.set({
      [PROXY_AUTH_KEY]: {
        enabled: false,
        host: runtimeProxy.host,
        port: runtimeProxy.port,
        username: runtimeProxy.username || "",
        password: runtimeProxy.password || ""
      }
    });

    const settingsValue = {
      proxyType: "manual",
      http: runtimeProxy.host,
      httpProxyPort: runtimeProxy.port,
      ssl: runtimeProxy.host,
      sslProxyPort: runtimeProxy.port,
      passthrough: "localhost, 127.0.0.1, ::1"
    };

    if (proxyType === "socks" || proxyType === "socks4" || proxyType === "socks5") {
      settingsValue.socks = runtimeProxy.host;
      settingsValue.socksProxyPort = runtimeProxy.port;
      settingsValue.socksVersion = proxyType === "socks4" ? 4 : 5;
      delete settingsValue.http;
      delete settingsValue.httpProxyPort;
      delete settingsValue.ssl;
      delete settingsValue.sslProxyPort;
    }

    await ext.proxy.settings.set({ value: settingsValue, scope: "regular" });
  }

  function requireRuntimeProxy(proxy) {
    if (!isRuntimeProxy(proxy)) {
      throw new Error("代理数据缺少 host/port");
    }
    return proxy;
  }

  function isRuntimeProxy(proxy) {
    if (!proxy || !proxy.enabled) {
      return false;
    }
    const host = String(proxy.host || "").trim();
    const port = Number(proxy.port || 0);
    return Boolean(host && port > 0);
  }

  function renderProxyStatus() {
    const proxy = state.currentProxy;
    if (!isRuntimeProxy(proxy)) {
      elements.proxyStatus.textContent = "未启用";
      return;
    }

    const lines = [
      `类型: ${String(proxy.type || "http").toLowerCase()}`,
      `地址: ${proxy.host}`,
      `端口: ${proxy.port}`,
      `用户名: ${proxy.username || "-"}`,
      `密码: ${proxy.password || "-"}`,
      "鉴权: 手动输入"
    ];
    elements.proxyStatus.textContent = lines.join("\n");
  }

  function formatProxy(proxy) {
    if (!isRuntimeProxy(proxy)) {
      return "未启用";
    }
    const type = String(proxy.type || "http").toLowerCase();
    const auth = proxy.use_auth && proxy.username ? ` (auth: ${proxy.username})` : "";
    return `${type}://${proxy.host}:${proxy.port}${auth}`;
  }

  function requireWebshareApiKey() {
    const apiKey = String(elements.webshareApiKeyInput.value || "").trim();
    if (!apiKey) {
      throw new Error("请先输入 Webshare API Key");
    }
    state.webshareApiKey = apiKey;
    return apiKey;
  }

  async function getCurrentWebshareProxyDirect(apiKey) {
    const items = await fetchWebshareProxyList(apiKey);
    const proxy = mapWebshareItemToProxy(items[0], state.proxyProtocol);
    return requireRuntimeProxy(proxy);
  }

  async function replaceWebshareProxyDirect(apiKey) {
    const currentItems = await fetchWebshareProxyList(apiKey);
    const currentProxy = mapWebshareItemToProxy(currentItems[0], state.proxyProtocol);
    const response = await fetch(WEBSHARE_REPLACE_API, {
      method: "POST",
      headers: buildWebshareHeaders(apiKey),
      body: JSON.stringify({
        to_replace: { type: "ip_address", ip_addresses: [currentProxy.host] },
        replace_with: [{ type: "country", country_code: "US", count: 1 }],
        dry_run: false
      })
    });
    const payload = await readJsonResponse(response, "Webshare 替换接口");
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || payload.message || `HTTP ${response.status}`);
    }

    const replacementId = String(
      payload.id ||
      payload.uuid ||
      payload.replacement_id ||
      ((payload.data || {}).id) ||
      ((payload.data || {}).uuid) ||
      ((payload.data || {}).replacement_id) ||
      ""
    ).trim();
    if (!replacementId) {
      throw new Error("Webshare 替换响应缺少任务 ID");
    }

    const deadline = Date.now() + 30000;
    let lastStatus = normalizeWebshareStatus(payload);
    while (Date.now() < deadline) {
      if (isWebshareTerminalSuccess(lastStatus)) {
        break;
      }
      if (isWebshareTerminalFailure(lastStatus)) {
        throw new Error(`Webshare 代理替换失败: status=${lastStatus || "unknown"}`);
      }

      await delay(1200);
      const detailResponse = await fetch(`${WEBSHARE_REPLACE_API}${replacementId}/`, {
        method: "GET",
        headers: buildWebshareHeaders(apiKey)
      });
      const detailPayload = await readJsonResponse(detailResponse, "Webshare 替换查询接口");
      if (!detailResponse.ok) {
        throw new Error(detailPayload.detail || detailPayload.error || detailPayload.message || `HTTP ${detailResponse.status}`);
      }
      lastStatus = normalizeWebshareStatus(detailPayload);
    }

    if (!isWebshareTerminalSuccess(lastStatus)) {
      throw new Error(`Webshare 代理替换超时: status=${lastStatus || "unknown"}`);
    }

    return getCurrentWebshareProxyDirect(apiKey);
  }

  async function fetchWebshareProxyList(apiKey) {
    const response = await fetch(`${WEBSHARE_LIST_API}?mode=direct&page=1&page_size=25`, {
      method: "GET",
      headers: buildWebshareHeaders(apiKey),
      cache: "no-store"
    });
    const payload = await readJsonResponse(response, "Webshare 代理列表");
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || payload.message || `HTTP ${response.status}`);
    }
    const items = extractWebshareItems(payload);
    if (!items.length) {
      throw new Error("Webshare 代理列表为空");
    }
    return items;
  }

  function buildWebshareHeaders(apiKey) {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Token ${apiKey}`
    };
  }

  function extractWebshareItems(payload) {
    let rawItems = payload && payload.results;
    if (rawItems === undefined || rawItems === null) {
      rawItems = (payload && (payload.items || payload.data)) || [];
    }
    if (rawItems && typeof rawItems === "object" && !Array.isArray(rawItems)) {
      rawItems = rawItems.results || rawItems.items || [];
    }
    return Array.isArray(rawItems) ? rawItems.filter((item) => item && typeof item === "object") : [];
  }

  function mapWebshareItemToProxy(item, protocol) {
    if (!item || typeof item !== "object") {
      throw new Error("Webshare 代理数据无效");
    }
    const host = String(item.proxy_address || item.host || item.ip || item.ip_address || "").trim();
    if (!host) {
      throw new Error("Webshare 代理缺少 host");
    }
    const portValue = item.port || 0;
    const port = Number(portValue || 0);
    if (!port || port <= 0) {
      throw new Error("Webshare 代理缺少有效的 port");
    }
    const username = String(item.username || item.user || "");
    const password = String(item.password || "");
    return {
      enabled: true,
      type: normalizeProxyProtocol(protocol),
      host,
      port,
      use_auth: Boolean(username),
      username: username || "",
      password: username ? password : ""
    };
  }

  function normalizeProxyProtocol(value) {
    return String(value || "").toLowerCase() === "socks5" ? "socks5" : "http";
  }

  function normalizeWebshareStatus(payload) {
    return String(
      (payload && (payload.state || payload.status)) ||
      ((payload && payload.data && (payload.data.state || payload.data.status)) || "")
    ).trim().toLowerCase();
  }

  function isWebshareTerminalSuccess(status) {
    return ["completed", "complete", "succeeded", "success", "done"].includes(String(status || "").toLowerCase());
  }

  function isWebshareTerminalFailure(status) {
    return ["failed", "failure", "error", "cancelled", "canceled"].includes(String(status || "").toLowerCase());
  }

  async function fetchPayUrl() {
    setBusy("payurl", true);
    showOutput(elements.payUrlOutput, "info", "正在读取 ChatGPT session");

    try {
      const tab = await requireCurrentTab("chatgpt.com");
      const accessToken = await fetchAccessTokenFromTab(tab.id);
      showOutput(elements.payUrlOutput, "info", "已读取 accessToken，正在请求 PayURL");
      const payUrl = await requestPayUrl(accessToken);
      showOutput(elements.payUrlOutput, "success", `PayURL：${payUrl}`);
      await ext.tabs.create({ url: payUrl, active: true });
    } catch (error) {
      showOutput(elements.payUrlOutput, "error", `获取 PayURL 失败：${formatError(error)}`);
    } finally {
      setBusy("payurl", false);
    }
  }

  async function fetchAccessTokenFromTab(tabId) {
    const code = `(${readChatGptSession.toString()})()`;
    const results = await ext.tabs.executeScript(tabId, {
      code,
      allFrames: false,
      runAt: "document_idle"
    });
    const result = Array.isArray(results) ? results[0] : results;
    if (!result || !result.ok) {
      throw new Error((result && (result.error || result.detail)) || "session 接口返回异常");
    }
    const accessToken = String(result.accessToken || "").trim();
    if (!accessToken) {
      throw new Error("session JSON 缺少 accessToken");
    }
    return accessToken;
  }

  function readChatGptSession() {
    return fetch("https://chatgpt.com/api/auth/session", {
      cache: "no-store",
      credentials: "include"
    })
      .then((response) => response.text().then((text) => {
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch (error) {
          return {
            ok: false,
            status: response.status,
            error: "session_json_parse_failed",
            detail: text.slice(0, 500)
          };
        }
        const accessToken = String(data.accessToken || data.access_token || data.token || "").trim();
        return {
          ok: response.ok && Boolean(accessToken),
          status: response.status,
          accessToken,
          error: response.ok ? "" : `HTTP ${response.status}`,
          detail: accessToken ? "" : "missing_accessToken"
        };
      }))
      .catch((error) => ({
        ok: false,
        status: 0,
        error: error && error.message ? error.message : "session_fetch_failed"
      }));
  }

  async function requestPayUrl(accessToken) {
    let lastError = "";
    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(PAYURL_API, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ token: accessToken, plus: true })
        });
        const data = await readJsonResponse(response, "PayURL 接口");
        const payUrl = String(data.Stripe_payurl || data.pay_url || data.payUrl || "").trim();
        if (response.ok && data.status === "success" && payUrl) {
          return payUrl;
        }
        lastError = payUrl ? `HTTP ${response.status}: ${data.status || "unknown_status"}` : "响应缺少 Stripe_payurl";
      } catch (error) {
        lastError = formatError(error);
      }
      if (attempt < POLL_ATTEMPTS) {
        showOutput(elements.payUrlOutput, "info", `第 ${attempt}/${POLL_ATTEMPTS} 次 PayURL 请求失败，继续重试`);
        await delay(POLL_DELAY_MS);
      }
    }
    throw new Error(`已重试 ${POLL_ATTEMPTS} 次：${lastError || "unknown_error"}`);
  }

  async function fillCardInCurrentTab() {
    let card;
    try {
      card = await parseCardInput(elements.cardInput.value);
    } catch (error) {
      showOutput(elements.fillOutput, "error", formatError(error));
      await renderCardPreview(null);
      return;
    }

    await renderCardPreview(card);
    setBusy("fill", true);
    showOutput(elements.fillOutput, "info", "正在填充当前支付页面");

    try {
      const tab = await requireCurrentTab();
      await ext.tabs.executeScript(tab.id, {
        file: "content-script.js",
        allFrames: true,
        runAt: "document_idle"
      });
      const payload = {
        card,
        phone: getFillPhoneNumber(card),
        settings: state.fillSettings
      };
      const code = `window.__gptAutoRegisterFillForm && window.__gptAutoRegisterFillForm(${JSON.stringify(payload)})`;
      const results = await ext.tabs.executeScript(tab.id, {
        code,
        allFrames: true,
        runAt: "document_idle"
      });
      const summary = summarizeFillResults(results);
      if (!summary.success) {
        throw new Error(summary.message);
      }
      showOutput(elements.fillOutput, "success", summary.message);
      await persistState();
    } catch (error) {
      showOutput(elements.fillOutput, "error", `填充失败：${formatError(error)}`);
    } finally {
      setBusy("fill", false);
    }
  }

  async function removeElementInCurrentTab() {
    const selector = String(elements.removeElementSelectorInput.value || "").trim();
    if (!selector) {
      showOutput(elements.fillOutput, "error", "请先输入要删除的 selector");
      return;
    }

    state.removeElementSelector = selector;
    setBusy("removeElement", true);
    showOutput(elements.fillOutput, "info", `正在删除元素：${selector}`);

    try {
      const tab = await requireCurrentTab();
      await ext.tabs.executeScript(tab.id, {
        file: "content-script.js",
        allFrames: true,
        runAt: "document_idle"
      });
      const code = `window.__gptAutoRegisterRemoveElement && window.__gptAutoRegisterRemoveElement(${JSON.stringify({ selector })})`;
      const results = await ext.tabs.executeScript(tab.id, {
        code,
        allFrames: true,
        runAt: "document_idle"
      });
      const summary = summarizeRemoveElementResults(results, selector);
      if (!summary.success) {
        throw new Error(summary.message);
      }
      await persistState();
      showOutput(elements.fillOutput, "success", summary.message);
    } catch (error) {
      showOutput(elements.fillOutput, "error", `删除失败：${formatError(error)}`);
    } finally {
      setBusy("removeElement", false);
    }
  }

  async function parseCardInput(rawInput) {
    const text = String(rawInput || "").trim();
    const parts = text.split("----").map((part) => part.trim());
    if (parts.length !== 6 && parts.length !== 7) {
      throw new Error("卡片格式错误，必须是 card----年/月----cvv----url----name----address,city postcode,US");
    }

    const hasEmbeddedPhone = parts.length === 7;
    const [card, expiry, cvv] = parts;
    const phone = hasEmbeddedPhone ? parts[3] : "";
    const url = hasEmbeddedPhone ? parts[4] : parts[3];
    const name = hasEmbeddedPhone ? parts[5] : parts[4];
    const addressBlob = hasEmbeddedPhone ? parts[6] : parts[5];
    const normalizedCard = String(card || "").replace(/\s+/g, "");
    const expiryInfo = parseExpiry(expiry);
    const addressInfo = await parseAddressBlob(addressBlob);

    const parsed = {
      card: normalizedCard,
      year: expiryInfo.year,
      month: expiryInfo.month,
      cvv,
      phone: normalizeUsPhone(phone),
      url,
      name,
      firstName: extractFirstName(name),
      lastName: extractLastName(name),
      address: addressInfo.address,
      city: addressInfo.city,
      state: addressInfo.state,
      postcode: addressInfo.postcode,
      country: addressInfo.country,
      expiryDisplay: expiryInfo.display,
      expiryInput: expiryInfo.input
    };

    const required = ["card", "year", "month", "cvv", "name", "address", "city", "state", "postcode"];
    const missing = required.filter((key) => !String(parsed[key] || "").trim());
    if (missing.length) {
      throw new Error(`卡片字段为空：${missing.join(", ")}`);
    }
    return parsed;
  }

  function rsplit(value, separator, limit) {
    const parts = String(value).split(separator);
    if (parts.length <= limit + 1) {
      return parts;
    }
    const head = parts.slice(0, parts.length - limit).join(separator);
    return [head].concat(parts.slice(parts.length - limit));
  }

  async function renderCardPreview(card) {
    let parsed = card;
    if (!parsed) {
      try {
        parsed = elements.cardInput.value.trim() ? await parseCardInput(elements.cardInput.value) : null;
      } catch (error) {
        parsed = null;
      }
    }

    elements.cardPreview.textContent = "";
    elements.cardPreview.classList.toggle("visible", Boolean(parsed));
    if (!parsed) {
      return;
    }

    [
      ["卡号", parsed.card],
      ["有效期", parsed.expiryDisplay],
      ["CVV", parsed.cvv],
      ["First Name", parsed.firstName],
      ["Last Name", parsed.lastName],
      ["Address", parsed.address],
      ["City", parsed.city],
      ["State", parsed.state],
      ["Postcode", parsed.postcode],
      ["Country", parsed.country]
    ].forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "preview-row";
      const labelNode = document.createElement("span");
      labelNode.className = "preview-label";
      labelNode.textContent = label;
      const valueNode = document.createElement("span");
      valueNode.className = "preview-value";
      valueNode.textContent = value;
      const copyButton = document.createElement("button");
      copyButton.className = "preview-copy-button";
      copyButton.type = "button";
      copyButton.textContent = "复制";
      copyButton.dataset.copyLabel = label;
      copyButton.dataset.copyValue = String(value || "");
      copyButton.disabled = !String(value || "").trim();
      row.append(labelNode, valueNode, copyButton);
      elements.cardPreview.append(row);
    });
  }

  async function handleCardPreviewCopy(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest(".preview-copy-button");
    if (!button) {
      return;
    }
    const value = String(button.dataset.copyValue || "");
    const label = String(button.dataset.copyLabel || "字段");
    if (!value.trim()) {
      return;
    }
    try {
      await writeClipboard(value);
      showOutput(elements.fillOutput, "success", `已复制${label}：${value}`);
    } catch (error) {
      showOutput(elements.fillOutput, "error", `复制${label}失败：${formatError(error)}`);
    }
  }

  function renderPhonePreview() {
    const phoneKey = state.phoneKey;
    elements.phonePreview.textContent = "";
    elements.phonePreview.classList.toggle("visible", Boolean(phoneKey));
    if (!phoneKey) {
      return;
    }

    [
      ["手机", phoneKey.phone],
      ["短信地址", phoneKey.smsUrl]
    ].forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "preview-row";
      const labelNode = document.createElement("span");
      labelNode.className = "preview-label";
      labelNode.textContent = label;
      const valueNode = document.createElement("span");
      valueNode.className = "preview-value";
      valueNode.textContent = value;
      row.append(labelNode, valueNode);
      elements.phonePreview.append(row);
    });
  }

  async function requireCurrentTab(expected) {
    const tab = await refreshCurrentTab();
    if (!tab || !tab.id) {
      throw new Error("未找到当前标签页");
    }
    const url = String(tab.url || "");
    if (expected === "chatgpt.com" && !/^https:\/\/chatgpt\.com\//i.test(url)) {
      throw new Error("请先切换到已登录的 https://chatgpt.com 页面");
    }
    return tab;
  }

  function bindFillSettingsInputs() {
    const entries = [
      ["phoneSelectorInput", "phoneSelector"],
      ["cardNumberSelectorInput", "cardNumberSelector"],
      ["cardExpirySelectorInput", "cardExpirySelector"],
      ["cardCvvSelectorInput", "cardCvvSelector"],
      ["firstNameSelectorInput", "firstNameSelector"],
      ["lastNameSelectorInput", "lastNameSelector"],
      ["billingLine1SelectorInput", "billingLine1Selector"],
      ["billingCitySelectorInput", "billingCitySelector"],
      ["billingStateSelectorInput", "billingStateSelector"],
      ["billingPostalCodeSelectorInput", "billingPostalCodeSelector"],
      ["passwordSelectorInput", "passwordSelector"],
      ["passwordValueInput", "passwordValue"]
    ];

    entries.forEach(([elementKey, stateKey]) => {
      elements[elementKey].addEventListener("input", () => {
        state.fillSettings[stateKey] = String(elements[elementKey].value || "").trim();
        persistState();
      });
    });
  }

  function toggleFillSettingsPanel() {
    state.fillSettingsExpanded = !state.fillSettingsExpanded;
    renderFillSettings();
    persistState();
  }

  function resetFillSettings() {
    state.fillSettings = createDefaultFillSettings();
    renderFillSettings();
    persistState();
    showOutput(elements.fillOutput, "success", "已恢复默认填充设置");
  }

  function renderFillSettings() {
    const settings = sanitizeFillSettings(state.fillSettings);
    state.fillSettings = settings;
    elements.fillSettingsPanel.hidden = !state.fillSettingsExpanded;
    elements.toggleFillSettingsButton.setAttribute("aria-expanded", String(state.fillSettingsExpanded));
    elements.toggleFillSettingsButton.textContent = state.fillSettingsExpanded ? "收起" : "设置";
    elements.phoneSelectorInput.value = settings.phoneSelector;
    elements.cardNumberSelectorInput.value = settings.cardNumberSelector;
    elements.cardExpirySelectorInput.value = settings.cardExpirySelector;
    elements.cardCvvSelectorInput.value = settings.cardCvvSelector;
    elements.firstNameSelectorInput.value = settings.firstNameSelector;
    elements.lastNameSelectorInput.value = settings.lastNameSelector;
    elements.billingLine1SelectorInput.value = settings.billingLine1Selector;
    elements.billingCitySelectorInput.value = settings.billingCitySelector;
    elements.billingStateSelectorInput.value = settings.billingStateSelector;
    elements.billingPostalCodeSelectorInput.value = settings.billingPostalCodeSelector;
    elements.passwordSelectorInput.value = settings.passwordSelector;
    elements.passwordValueInput.value = settings.passwordValue;
  }

  function createDefaultFillSettings() {
    return { ...DEFAULT_FILL_SETTINGS };
  }

  function sanitizeFillSettings(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    return {
      phoneSelector: normalizeSelector(input.phoneSelector, DEFAULT_FILL_SETTINGS.phoneSelector),
      cardNumberSelector: normalizeSelector(input.cardNumberSelector, DEFAULT_FILL_SETTINGS.cardNumberSelector),
      cardExpirySelector: normalizeSelector(input.cardExpirySelector, DEFAULT_FILL_SETTINGS.cardExpirySelector),
      cardCvvSelector: normalizeSelector(input.cardCvvSelector, DEFAULT_FILL_SETTINGS.cardCvvSelector),
      firstNameSelector: normalizeSelector(input.firstNameSelector, DEFAULT_FILL_SETTINGS.firstNameSelector),
      lastNameSelector: normalizeSelector(input.lastNameSelector, DEFAULT_FILL_SETTINGS.lastNameSelector),
      billingLine1Selector: normalizeSelector(input.billingLine1Selector, DEFAULT_FILL_SETTINGS.billingLine1Selector),
      billingCitySelector: normalizeSelector(input.billingCitySelector, DEFAULT_FILL_SETTINGS.billingCitySelector),
      billingStateSelector: normalizeSelector(input.billingStateSelector, DEFAULT_FILL_SETTINGS.billingStateSelector),
      billingPostalCodeSelector: normalizeSelector(input.billingPostalCodeSelector, DEFAULT_FILL_SETTINGS.billingPostalCodeSelector),
      passwordSelector: normalizeSelector(input.passwordSelector, DEFAULT_FILL_SETTINGS.passwordSelector),
      passwordValue: String(input.passwordValue || DEFAULT_FILL_SETTINGS.passwordValue).trim() || DEFAULT_FILL_SETTINGS.passwordValue
    };
  }

  function normalizeSelector(value, fallback) {
    const normalized = String(value || "").trim();
    return normalized || fallback;
  }

  function normalizeUsPhone(phone) {
    let normalized = String(phone || "").trim();
    if (normalized.startsWith("+1")) {
      normalized = normalized.slice(2).trim();
    }
    normalized = normalized.replace(/\D+/g, "");
    return normalized;
  }

  function getFillPhoneNumber(card) {
    if (state.phoneKey && state.phoneKey.phone) {
      return state.phoneKey.phone;
    }

    const rawPhoneInput = String(elements.phoneKeyInput.value || "").trim();
    if (rawPhoneInput) {
      try {
        const phoneKey = parsePhoneKeyInput(rawPhoneInput, { allowEmpty: true });
        if (phoneKey && phoneKey.phone) {
          state.phoneKey = phoneKey;
          state.phoneKeyInput = phoneKey.raw;
          renderPhonePreview();
          return phoneKey.phone;
        }
      } catch (error) {
        console.warn("Failed to parse phone key for fill", error);
      }
    }

    return normalizeUsPhone(card && card.phone ? card.phone : "");
  }

  function parseExpiry(rawExpiry) {
    const parts = String(rawExpiry || "").split("/", 2).map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error("年/月格式错误");
    }

    const [left, right] = parts;
    let year = "";
    let month = "";

    if (/^\d{4}$/.test(left) && /^\d{1,2}$/.test(right)) {
      year = left;
      month = right;
    } else if (/^\d{1,2}$/.test(left) && /^\d{2,4}$/.test(right)) {
      month = left;
      year = right.length === 2 ? `20${right}` : right;
    } else {
      throw new Error("年/月格式错误");
    }

    const monthNumber = Number(month);
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      throw new Error("月份格式错误");
    }

    const yearDigits = String(year).replace(/\D+/g, "");
    if (yearDigits.length !== 4) {
      throw new Error("年份格式错误");
    }

    const shortYear = yearDigits.slice(-2);
    return {
      year: yearDigits,
      month: String(monthNumber),
      display: `${monthNumber}/${shortYear}`,
      input: `${String(monthNumber).padStart(2, "0")}${shortYear}`
    };
  }

  async function parseAddressBlob(addressBlob) {
    const addressParts = addressBlob.rsplit ? addressBlob.rsplit(",", 2) : rsplit(addressBlob, ",", 2);
    const normalizedAddressParts = addressParts.map((part) => part.trim());
    if (normalizedAddressParts.length !== 3) {
      throw new Error("地址格式错误，必须是 address,city state postcode,US");
    }

    const [address, cityStatePostcode, country] = normalizedAddressParts;
    const normalizedCityBlob = String(cityStatePostcode || "").replace(/\s+/g, " ").trim();
    const withStateMatch = normalizedCityBlob.match(
      /^(?<city>.+?)\s+(?<state>[A-Za-z]{2})\s+(?<postcode>\d{5}(?:-\d{4})?)$/
    );
    const withoutStateMatch = normalizedCityBlob.match(
      /^(?<city>.+?)\s+(?<postcode>\d{5}(?:-\d{4})?)$/
    );

    if (withStateMatch && withStateMatch.groups) {
      return {
        address,
        city: String(withStateMatch.groups.city || "").trim(),
        state: String(withStateMatch.groups.state || "").trim().toUpperCase(),
        postcode: normalizeUsPostcode(withStateMatch.groups.postcode),
        country: normalizeCountry(country)
      };
    }

    if (withoutStateMatch && withoutStateMatch.groups) {
      const postcode = normalizeUsPostcode(withoutStateMatch.groups.postcode);
      return {
        address,
        city: String(withoutStateMatch.groups.city || "").trim(),
        state: await lookupUsStateFromPostcode(postcode),
        postcode,
        country: normalizeCountry(country)
      };
    }

    throw new Error("city state postcode 格式错误");
  }

  function normalizeCountry(country) {
    return String(country || "").trim().toUpperCase();
  }

  function normalizeUsPostcode(postcode) {
    const normalized = String(postcode || "").trim();
    const matched = normalized.match(/^(\d{5})(?:-\d{4})?$/);
    if (!matched) {
      throw new Error(`无效的美国邮编：${postcode}`);
    }
    return matched[1];
  }

  async function lookupUsStateFromPostcode(postcode) {
    const zip5 = normalizeUsPostcode(postcode);
    const prefix = Number(zip5.slice(0, 3));
    const ranges = await ensureUsZip3StateRanges();
    const matched = ranges.find((item) => prefix >= item.start && prefix <= item.end);
    if (!matched) {
      throw new Error(`无法根据美国邮编匹配州：${postcode}`);
    }
    return matched.state;
  }

  async function ensureUsZip3StateRanges() {
    if (!usZip3StateRangesPromise) {
      usZip3StateRangesPromise = fetch(ext.runtime.getURL(US_ZIP3_STATE_RANGES_PATH), {
        cache: "no-store"
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const payload = await response.json();
          if (!Array.isArray(payload) || !payload.length) {
            throw new Error("empty_ranges");
          }
          return payload
            .map((item) => ({
              start: Number(item && item.start),
              end: Number(item && item.end),
              state: String((item && item.state) || "").trim().toUpperCase()
            }))
            .filter((item) => Number.isInteger(item.start) && Number.isInteger(item.end) && item.state);
        })
        .catch((error) => {
          usZip3StateRangesPromise = null;
          throw new Error(`读取美国邮编映射失败：${formatError(error)}`);
        });
    }
    return usZip3StateRangesPromise;
  }

  function parsePhoneKeyInput(rawInput, options = {}) {
    const allowEmpty = Boolean(options.allowEmpty);
    const text = String(rawInput || "").trim();
    if (!text) {
      if (allowEmpty) {
        return null;
      }
      throw new Error("请先输入手机区");
    }

    const parts = text.split("|");
    if (parts.length !== 2) {
      throw new Error("手机区格式错误，必须是 +14484490908|http://a.62-us.com/api/get_sms?key=...");
    }

    const rawPhone = String(parts[0] || "").trim();
    const smsUrl = String(parts[1] || "").trim();
    if (!rawPhone || !smsUrl) {
      throw new Error("手机区格式错误，手机号和短信地址都不能为空");
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(smsUrl);
    } catch (error) {
      throw new Error("短信地址不是有效 URL");
    }
    if (!/^https?:$/i.test(parsedUrl.protocol)) {
      throw new Error("短信地址只支持 http 或 https");
    }

    const phone = normalizeUsPhone(rawPhone);
    if (!/^\d{10,15}$/.test(phone)) {
      throw new Error("手机号格式不正确");
    }

    return {
      raw: text,
      rawPhone,
      phone,
      smsUrl: parsedUrl.toString()
    };
  }

  function requirePhoneKey() {
    const phoneKey = state.phoneKey || parsePhoneKeyInput(elements.phoneKeyInput.value);
    state.phoneKey = phoneKey;
    state.phoneKeyInput = phoneKey.raw;
    renderPhonePreview();
    return phoneKey;
  }

  function extractSixDigitCode(text) {
    const match = String(text || "").match(/(?:^|\D)(\d{6})(?!\d)/);
    return match ? match[1] : "";
  }

  function extractFirstName(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    return parts[0] || "";
  }

  function extractLastName(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      return "";
    }
    return parts.slice(1).join(" ");
  }

  async function readJsonResponse(response, label) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error(`${label}返回不是 JSON：HTTP ${response.status} ${text.slice(0, 200)}`);
    }
  }

  function summarizeFillResults(results) {
    const validResults = (Array.isArray(results) ? results : [results]).filter(Boolean);
    const successful = validResults.filter((result) => result && result.ok);
    if (!successful.length) {
      const errors = validResults
        .filter((result) => result && result.error)
        .map((result) => result.error);
      return {
        success: false,
        message: errors[0] || "没有在当前页面找到可填充的 Stripe 表单"
      };
    }

    const aggregate = successful.reduce((acc, result) => {
      acc.filled += Number(result.filled || 0);
      acc.checked += Number(result.checked || 0);
      result.missing.forEach((selector) => acc.missing.add(selector));
      return acc;
    }, { filled: 0, checked: 0, missing: new Set() });

    if (aggregate.missing.size) {
      return {
        success: true,
        message: `已填充 ${aggregate.filled} 项，已勾选 ${aggregate.checked} 项；未找到：${Array.from(aggregate.missing).join(", ")}`
      };
    }
    return {
      success: true,
      message: `已填充 ${aggregate.filled} 项，已勾选 ${aggregate.checked} 项`
    };
  }

  function summarizeRemoveElementResults(results, selector) {
    const validResults = (Array.isArray(results) ? results : [results]).filter(Boolean);
    const errors = validResults
      .filter((result) => result && result.error)
      .map((result) => result.error);
    if (errors.length) {
      return {
        success: false,
        message: errors[0]
      };
    }

    const removedCount = validResults.filter((result) => result && result.removed).length;
    if (!removedCount) {
      return {
        success: false,
        message: `没有找到元素：${selector}`
      };
    }

    return {
      success: true,
      message: `已删除 ${removedCount} 个匹配元素：${selector}`
    };
  }

  function getSelectedEmail() {
    return state.selectedEmail || state.emails[0] || "";
  }

  function setBusy(name, busy) {
    if (busy) {
      state.busy.add(name);
    } else {
      state.busy.delete(name);
    }

    elements.fetchCodeButton.disabled = state.busy.has("code");
    elements.copyCodeButton.disabled = state.busy.has("code");
    elements.copyPhoneButton.disabled = state.busy.has("phoneCode");
    elements.fetchPhoneCodeButton.disabled = state.busy.has("phoneCode");
    elements.copyPhoneCodeButton.disabled = state.busy.has("phoneCode");
    elements.refreshProxyButton.disabled = state.busy.has("proxy");
    elements.getWebshareProxyButton.disabled = state.busy.has("proxy");
    elements.setProxyButton.disabled = state.busy.has("proxy");
    elements.replaceProxyButton.disabled = state.busy.has("proxy");
    elements.clearProxyButton.disabled = state.busy.has("proxy");
    elements.fetchPayUrlButton.disabled = state.busy.has("payurl");
    elements.fillCardButton.disabled = state.busy.has("fill");
    elements.removeElementButton.disabled = state.busy.has("removeElement");
  }

  function showOutput(element, type, message) {
    element.textContent = message;
    element.className = `result-output visible ${type}`;
  }

  function formatCodeResult(data, code) {
    const lines = [`验证码：${code}`];
    if (data.email) {
      lines.push(`邮箱：${data.email}`);
    }
    if (data.subject) {
      lines.push(`主题：${data.subject}`);
    }
    if (data.received_at) {
      const date = new Date(Number(data.received_at));
      lines.push(`时间：${Number.isNaN(date.getTime()) ? data.received_at : date.toLocaleString()}`);
    }
    return lines.join("\n");
  }

  function maskCard(card) {
    const compact = String(card || "").replace(/\s+/g, "");
    if (compact.length <= 8) {
      return compact;
    }
    return `${compact.slice(0, 6)}••••••${compact.slice(-4)}`;
  }

  function shortUrl(url) {
    if (url.length <= 96) {
      return url;
    }
    return `${url.slice(0, 54)}…${url.slice(-34)}`;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function writeClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }

    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "readonly");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) {
      throw new Error("clipboard_write_failed");
    }
  }

  function formatError(error) {
    if (!error) {
      return "unknown_error";
    }
    return error.message || String(error);
  }
}());
