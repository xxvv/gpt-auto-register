(function () {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : chrome;

  const DOMAINS = [
    "xvmit.edu.kg",
    "ciat.edu.kg",
    "cars.edu.kg",
    "xymit.edu.kg"
  ];
  const CODE_API = "https://getemail.nnai.uk/api/code";
  const THIRD_PARTY_ACCOUNTS_API = "https://gpt2.nnai.uk/api/third-party/accounts";
  const THIRD_PARTY_ACCOUNTS_DELETE_API = `${THIRD_PARTY_ACCOUNTS_API}/delete`;
  const THIRD_PARTY_API_KEY = "aa102911";
  const WEBSHARE_LIST_API = "https://proxy.webshare.io/api/v2/proxy/list/";
  const WEBSHARE_REPLACE_API = "https://proxy.webshare.io/api/v3/proxy/replace/";
  const IPAPI_LOCATION_API = "https://ipapi.co/json/?token=T6UkBSJpmZgNZELN7QsJk5uCZTF8c6aVHUYZiLwEsHnUQqqeJg";
  const STORAGE_KEY = "gptAutoRegisterV2State";
  const CONTENT_CALL_STORAGE_KEY = "__gptAutoRegisterContentCall";
  const PROXY_AUTH_KEY = "gptAutoRegisterProxyAuth";
  const US_ZIP3_STATE_RANGES_PATH = "us_zip3_state_ranges.json";
  const POLL_ATTEMPTS = 20;
  const POLL_DELAY_MS = 5000;
  const PASSKEY_ENROLL_URL_PREFIX = "https://auth.openai.com/create-account-enroll-passkey";
  const PASSKEY_ENROLL_SKIP_SELECTOR = '[data-dd-action-name="skip create account enroll passkey"]';
  const DEFAULT_RUN_COUNT = 1;
  const DEFAULT_FLOW_COUNTRY = "US";
  const DEFAULT_PAY_URL_MODE = "long";
  const PAY_URL_OFFICIAL_REGION_ORDER = Object.freeze(["DE", "IE", "US"]);
  const DEFAULT_JP_SMS_CDK = "";
  const OAPI_SMS_API = "https://sms.oapi.vip/api.php";
  const AUTOMATION_WINDOW_CLOSE_DELAY_MS = 10000;
  const DEFAULT_FILL_SETTINGS = Object.freeze({
    phoneSelector: ["#phone", ""],
    cardNumberSelector: ["#cardNumber", ""],
    cardExpirySelector: ["#cardExpiry", ""],
    cardCvvSelector: ["#cardCvv", "#cardCvc"],
    billingNameSelector: ["#billingName", ""],
    firstNameSelector: ["#firstName", ""],
    lastNameSelector: ["#lastName", ""],
    billingLine1Selector: ["#billingLine1", "#billingAddressLine1"],
    billingCitySelector: ["#billingCity", "#billingLocality"],
    billingStateSelector: ["#billingState", ""],
    billingPostalCodeSelector: ["#billingPostalCode", ""],
    countrySelector: ["#country", "#billingCountry"],
    passwordSelector: ["#password", ""],
    passwordValue: "Bb02911ss"
  });

  const state = {
    fillSettings: createDefaultFillSettings(),
    fillSettingsExpanded: false,
    randomCardEnabled: false,
    useCurrentIpLocation: false,
    specifiedAccountInput: "",
    deleteThirdPartyAccountEnabled: true,
    phoneKeyInput: "",
    phoneKey: null,
    flowCountry: DEFAULT_FLOW_COUNTRY,
    payUrlMode: DEFAULT_PAY_URL_MODE,
    lastLongPayUrl: "",
    lastShortPayUrl: "",
    jpSmsCdk: DEFAULT_JP_SMS_CDK,
    lastPhoneCode: "",
    lastPaypalEmail: "",
    proxyEnabled: true,
    webshareApiKey: "",
    proxyProtocol: "http",
    step1ProxyCountry: "US",
    step3ProxyCountry: "US",
    currentProxy: null,
    currentIpLocation: null,
    automationBatchRunning: false,
    cancelAutomationBatchRequested: false,
    payUrlBatchRunning: false,
    runStats: {
      total: 0,
      completed: 0,
      success: 0,
      fail: 0
    }
  };
  let usZip3StateRangesPromise = null;

  function randomDelayMs(minMs = 3000, maxMs = 5000) {
    const min = Math.ceil(Number(minMs) || 3000);
    const max = Math.floor(Number(maxMs) || 5000);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function delay(ms) {
    const waitMs = Number.isFinite(Number(ms)) ? Number(ms) : randomDelayMs();
    return new Promise((resolve) => setTimeout(resolve, waitMs));
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
      for (let i = 0; i < 12; i++) {
        randomPart += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
    return `${month}${day}${randomPart}`;
  }

  function generateGmailAddress() {
    return `${generateLocalPart()}@gmail.com`;
  }

  function generateRandomName() {
    const firstNames = ["James", "Emma", "Liam", "Olivia", "Noah", "Ava", "Mia", "Lucas"];
    const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones"];
    return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
  }

  function generateRandomAge() {
    return Math.floor(Math.random() * 34) + 22;
  }

  function generateRandomBirthday() {
    const year = Math.floor(Math.random() * 15) + 1981;
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function logMessage(message) {
    const logDiv = document.getElementById("logOutput");
    if (!logDiv) return;
    const time = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.className = "log-line";
    line.textContent = `[${time}] ${message}`;
    logDiv.appendChild(line);
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  function resetRunStats(total) {
    state.runStats = {
      total: Math.max(0, Number(total) || 0),
      completed: 0,
      success: 0,
      fail: 0
    };
    renderRunStats();
  }

  function updateRunStats(result) {
    state.runStats.completed += 1;
    if (result === "success") {
      state.runStats.success += 1;
    } else if (result === "fail") {
      state.runStats.fail += 1;
    }
    renderRunStats();
  }

  function renderRunStats() {
    const stats = state.runStats || { total: 0, completed: 0, success: 0, fail: 0 };
    const completedEl = document.getElementById("runStatsCompleted");
    const successEl = document.getElementById("runStatsSuccess");
    const failEl = document.getElementById("runStatsFail");
    if (completedEl) completedEl.textContent = `${stats.completed}/${stats.total}`;
    if (successEl) successEl.textContent = String(stats.success);
    if (failEl) failEl.textContent = String(stats.fail);
  }

  function setActiveStep(stepNumber) {
    for (let i = 1; i <= 5; i += 1) {
      const step = document.getElementById(`step${i}`);
      if (step) {
        step.classList.toggle("active", i === stepNumber);
      }
    }
  }

  async function ensureProxyForStage(stage) {
    if (!isProxyEnabled()) {
      logMessage(`代理未开启，跳过${stage}代理设置`);
      return false;
    }

    const country = stage === "第一步" ? getStep1ProxyCountry() : getStep3ProxyCountry();
    if (stage === "第三步" && country === "KEEP_STEP1") {
      logMessage(`${stage}: 选择不修改代理，沿用第一步当前代理`);
      if (isCurrentIpLocationEnabled()) {
        await refreshIpLocation(`${stage}: `);
      }
      return false;
    }
    if (country === "NONE") {
      logMessage(`${stage}: 代理国家设置为'无'，跳过代理设置`);
      return false;
    }

    const protocol = getProxyProtocol();
    const apiKey = requireWebshareApiKey();
    logMessage(`${stage}: 正在设置代理，国家 ${country}，协议 ${protocol}`);
    logMessage(`${stage}: 正在先清除当前 Firefox 代理`);
    await clearFirefoxProxyState();
    state.currentProxy = null;
    renderProxyStatus();
    await persistState();
    logMessage(`${stage}: 当前 Firefox 代理已清除，开始替换对应国家代理`);
    const proxy = await replaceWebshareProxyDirect(apiKey, country, protocol);
    await applyFirefoxProxy(proxy);
    state.currentProxy = proxy;
    if (stage === "第三步" && isCurrentIpLocationEnabled()) {
      await refreshIpLocation(`${stage}: `);
    } else {
      state.currentIpLocation = null;
    }
    renderProxyStatus();
    await persistState();
    logMessage(`${stage}: 代理设置成功，Firefox 已写入 ${formatProxy(proxy)}`);
    return true;
  }

  async function getCurrentWebshareProxy() {
    try {
      const apiKey = requireWebshareApiKey();
      const proxy = await getCurrentWebshareProxyDirect(apiKey, getProxyProtocol());
      state.currentProxy = proxy;
      renderProxyStatus();
      await persistState();
      logMessage(`已获取当前 Webshare 代理: ${formatProxy(proxy)}`);
    } catch (error) {
      logMessage(`获取当前 Webshare 代理失败: ${formatError(error)}`);
    }
  }

  async function setCurrentProxy() {
    try {
      if (!isRuntimeProxy(state.currentProxy)) {
        const apiKey = requireWebshareApiKey();
        state.currentProxy = await getCurrentWebshareProxyDirect(apiKey, getProxyProtocol());
      }
      await applyFirefoxProxy(state.currentProxy);
      renderProxyStatus();
      await persistState();
      logMessage(`代理设置成功，Firefox 已写入 ${formatProxy(state.currentProxy)}`);
    } catch (error) {
      logMessage(`设置代理失败: ${formatError(error)}`);
    }
  }

  async function replaceWebshareProxy() {
    try {
      const country = getStep3ProxyCountry();
      if (country === "KEEP_STEP1") {
        logMessage("第三步代理选择为不修改，已跳过替换代理");
        return;
      }
      const apiKey = requireWebshareApiKey();
      const proxy = await replaceWebshareProxyDirect(apiKey, country, getProxyProtocol());
      await applyFirefoxProxy(proxy);
      state.currentProxy = proxy;
      renderProxyStatus();
      await persistState();
      logMessage(`已替换并设置代理: 国家 ${country}，${formatProxy(proxy)}`);
    } catch (error) {
      logMessage(`替换代理失败: ${formatError(error)}`);
    }
  }

  async function clearProxy() {
    try {
      await clearFirefoxProxyState();
      state.currentProxy = null;
      state.currentIpLocation = null;
      renderProxyStatus();
      await persistState();
      logMessage("已清除 Firefox 代理");
    } catch (error) {
      logMessage(`清除代理失败: ${formatError(error)}`);
    }
  }

  async function cleanupAutomationProxy(reason) {
    try {
      await clearFirefoxProxyState();
      state.currentProxy = null;
      state.currentIpLocation = null;
      renderProxyStatus();
      await persistState();
      logMessage(`${reason || "任务结束"}，已清理 Firefox 代理`);
    } catch (error) {
      logMessage(`${reason || "任务结束"}，清理代理失败: ${formatError(error)}`);
    }
  }

  async function applyFirefoxProxy(proxy) {
    const runtimeProxy = requireRuntimeProxy(proxy);
    const proxyType = String(runtimeProxy.type || "http").toLowerCase();
    if (!["http", "https", "socks", "socks4", "socks5"].includes(proxyType)) {
      throw new Error(`Firefox 不支持的代理类型: ${runtimeProxy.type}`);
    }

    await sendProxyMessage({ action: "apply", proxy: runtimeProxy });
  }

  async function clearFirefoxProxyState() {
    await sendProxyMessage({ action: "clear" });
  }

  async function sendProxyMessage(payload) {
    const response = await ext.runtime.sendMessage({
      type: "gptAutoRegisterProxy",
      ...payload
    });
    if (!response || !response.ok) {
      throw new Error((response && response.error) || "background 代理设置失败");
    }
    return response;
  }

  async function getCurrentWebshareProxyDirect(apiKey, protocol) {
    const items = await fetchWebshareProxyList(apiKey);
    return requireRuntimeProxy(mapWebshareItemToProxy(items[0], protocol));
  }

  async function replaceWebshareProxyDirect(apiKey, country, protocol) {
    const currentItems = await fetchWebshareProxyList(apiKey);
    const currentProxy = mapWebshareItemToProxy(currentItems[0], protocol);
    const response = await fetch(WEBSHARE_REPLACE_API, {
      method: "POST",
      headers: buildWebshareHeaders(apiKey),
      body: JSON.stringify({
        to_replace: { type: "ip_address", ip_addresses: [currentProxy.host] },
        replace_with: [{ type: "country", country_code: normalizeProxyCountry(country), count: 1 }],
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

    return getCurrentWebshareProxyDirect(apiKey, protocol);
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
    const port = Number(item.port || 0);
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
      city_name: String(item.city_name || item.city || ""),
      country_code: String(item.country_code || item.country || "").toUpperCase(),
      use_auth: Boolean(username),
      username: username || "",
      password: username ? password : ""
    };
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
    const proxyStatus = document.getElementById("proxyStatus");
    if (!proxyStatus) return;
    const proxy = state.currentProxy;
    if (!isRuntimeProxy(proxy)) {
      proxyStatus.classList.add("empty");
      proxyStatus.textContent = "代理状态: 未设置";
      return;
    }
    proxyStatus.classList.remove("empty");
    proxyStatus.textContent = [
      `代理状态: 已设置`,
      `类型: ${String(proxy.type || "http").toLowerCase()}`,
      `地址: ${proxy.host}:${proxy.port}`,
      `国家: ${String(proxy.country_code || proxy.country || "-").toUpperCase()}`,
      `用户名: ${proxy.username || "-"}`
    ].join("\n");
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
    const apiKey = String(document.getElementById("webshareApiKeyInput").value || "").trim();
    if (!apiKey) {
      throw new Error("请先输入 Webshare API Key");
    }
    state.webshareApiKey = apiKey;
    return apiKey;
  }

  function isProxyEnabled() {
    const input = document.getElementById("proxyEnabledCheckbox");
    state.proxyEnabled = input ? Boolean(input.checked) : true;
    return state.proxyEnabled;
  }

  function getProxyProtocol() {
    const value = document.getElementById("proxyProtocolSelect").value;
    state.proxyProtocol = normalizeProxyProtocol(value);
    return state.proxyProtocol;
  }

  function getStep1ProxyCountry() {
    const value = document.getElementById("step1ProxyCountrySelect").value;
    state.step1ProxyCountry = normalizeProxyCountry(value);
    return state.step1ProxyCountry;
  }

  function getStep3ProxyCountry() {
    const value = document.getElementById("step3ProxyCountrySelect").value;
    state.step3ProxyCountry = normalizeProxyCountry(value);
    return state.step3ProxyCountry;
  }

  function normalizeProxyProtocol(value) {
    return String(value || "").toLowerCase() === "socks5" ? "socks5" : "http";
  }

  function normalizeProxyCountry(value) {
    const country = String(value || "").trim().toUpperCase();
    if (country === "KEEP_STEP1") return "KEEP_STEP1";
    if (country === "CA") return "CA";
    if (country === "DE") return "DE";
    if (country === "JP") return "JP";
    if (country === "SG") return "SG";
    if (country === "NONE") return "NONE";
    return "US";
  }

  function normalizeFlowCountry(value) {
    const country = String(value || "").trim().toUpperCase();
    return country === "JP" ? "JP" : "US";
  }

  function normalizePayUrlMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "short") return "short";
    return DEFAULT_PAY_URL_MODE;
  }

  function getFlowCountry() {
    const input = document.getElementById("flowCountrySelect");
    state.flowCountry = normalizeFlowCountry(input ? input.value : state.flowCountry);
    return state.flowCountry;
  }

  function getPayUrlMode() {
    const input = document.getElementById("payUrlModeSelect");
    state.payUrlMode = normalizePayUrlMode(input ? input.value : state.payUrlMode);
    return state.payUrlMode;
  }

  function isDeleteThirdPartyAccountEnabled() {
    const input = document.getElementById("deleteThirdPartyAccountCheckbox");
    state.deleteThirdPartyAccountEnabled = input ? Boolean(input.checked) : true;
    return state.deleteThirdPartyAccountEnabled;
  }

  function getJpSmsCdkInput() {
    const input = document.getElementById("jpSmsCdkInput");
    const value = String(input ? input.value : state.jpSmsCdk || "").trim();
    state.jpSmsCdk = value;
    return value;
  }

  function pickRandomJpSmsCdk() {
    const cdks = getJpSmsCdkInput()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return cdks.length ? cdks[Math.floor(Math.random() * cdks.length)] : "";
  }

  function normalizeWebshareStatus(payload) {
    return String(
      (payload && (payload.state || payload.status)) ||
      ((payload && payload.data && (payload.data.state || payload.data.status)) || "")
    ).trim().toLowerCase();
  }

  function isWebshareTerminalSuccess(status) {
    return ["completed", "complete", "success", "succeeded", "done"].includes(String(status || "").toLowerCase());
  }

  function isWebshareTerminalFailure(status) {
    return ["failed", "failure", "error", "cancelled", "canceled"].includes(String(status || "").toLowerCase());
  }

  async function readJsonResponse(response, label) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error(`${label}返回不是 JSON: HTTP ${response.status} ${text.slice(0, 200)}`);
    }
  }

  async function refreshIpLocation(logPrefix = "") {
    try {
      const location = await fetchCurrentIpLocation();
      state.currentIpLocation = location;
      logMessage(`${logPrefix}当前 IP 定位: ${formatIpLocation(location)}`);
      return location;
    } catch (error) {
      state.currentIpLocation = null;
      logMessage(`${logPrefix}获取当前 IP 定位失败: ${formatError(error)}`);
      return null;
    }
  }

  async function fetchCurrentIpLocation() {
    const response = await fetch(IPAPI_LOCATION_API, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    const payload = await readJsonResponse(response, "IP 定位接口");
    if (!response.ok || payload.error) {
      throw new Error(payload.reason || payload.message || `HTTP ${response.status}`);
    }
    return normalizeIpLocation(payload);
  }

  function normalizeIpLocation(payload) {
    const city = String(payload && payload.city || "").trim();
    const region = String(payload && payload.region || "").trim();
    const regionCode = String(payload && payload.region_code || "").trim().toUpperCase();
    const countryCode = String(payload && (payload.country_code || payload.country) || "").trim().toUpperCase();
    const postal = String(payload && payload.postal || "").trim();
    if (!city || (!regionCode && !region)) {
      throw new Error("IP 定位缺少城市或州信息");
    }
    return {
      ip: String(payload && payload.ip || "").trim(),
      city,
      region,
      regionCode,
      countryCode,
      postal,
      timezone: String(payload && payload.timezone || "").trim()
    };
  }

  async function applyCurrentIpLocationToPrepared(prepared) {
    if (!prepared || !prepared.card) {
      return;
    }
    if (!isCurrentIpLocationEnabled()) {
      logMessage("未启用当前 IP 定位填表，继续使用默认卡片地址");
      return;
    }
    const location = await refreshIpLocation();
    const changed = applyIpLocationToCard(prepared.card, location);
    if (changed) {
      logMessage(`已按当前 IP 定位更新卡片地址: ${formatIpLocation(location)}`);
    } else {
      logMessage("未获取到可用 IP 定位，继续使用卡片原地址");
    }
  }

  function isCurrentIpLocationEnabled() {
    const input = document.getElementById("useCurrentIpLocationCheckbox");
    state.useCurrentIpLocation = input ? Boolean(input.checked) : false;
    return state.useCurrentIpLocation;
  }

  function applyIpLocationToCard(card, location) {
    if (!card || !location || !location.city || (!location.regionCode && !location.region)) {
      return false;
    }
    card.city = location.city;
    card.state = location.regionCode || location.region;
    if (location.postal) {
      card.postcode = normalizeLocationPostcode(location.postal);
    }
    if (location.countryCode) {
      card.country = location.countryCode;
    }
    return true;
  }

  function normalizeLocationPostcode(postal) {
    const normalized = String(postal || "").trim();
    const usMatch = normalized.match(/^(\d{5})(?:-\d{4})?$/);
    return usMatch ? usMatch[1] : normalized;
  }

  function formatIpLocation(location) {
    if (!location) {
      return "未知";
    }
    const stateLabel = location.regionCode || location.region || "-";
    const postalLabel = location.postal ? ` ${location.postal}` : "";
    const countryLabel = location.countryCode || "-";
    const ipLabel = location.ip ? ` (${location.ip})` : "";
    return `${location.city}, ${stateLabel}${postalLabel}, ${countryLabel}${ipLabel}`;
  }

  function normalizeSavedIpLocation(location) {
    if (!location || typeof location !== "object") {
      return null;
    }
    const city = String(location.city || "").trim();
    const region = String(location.region || "").trim();
    const regionCode = String(location.regionCode || location.region_code || "").trim().toUpperCase();
    if (!city || (!regionCode && !region)) {
      return null;
    }
    return {
      ip: String(location.ip || "").trim(),
      city,
      region,
      regionCode,
      countryCode: String(location.countryCode || location.country_code || location.country || "").trim().toUpperCase(),
      postal: String(location.postal || "").trim(),
      timezone: String(location.timezone || "").trim()
    };
  }

  async function fetchVerificationCode(email) {
    try {
      const resp = await fetch(`${CODE_API}?email=${encodeURIComponent(email)}&format=json`);
      const data = await resp.json();
      if (data && data.code) return data.code;
    } catch (e) {}
    return null;
  }

  const regionConfig = {
    CA: { country: "CA", currency: "CAD", paymentLocale: "en-CA" },
    ID: { country: "ID", currency: "IDR", paymentLocale: "en-ID" },
    IE: { country: "IE", currency: "EUR", paymentLocale: "en-IE" },
    JP: { country: "JP", currency: "JPY", paymentLocale: "ja-JP" },
    BR: { country: "BR", currency: "BRL", paymentLocale: "pt-BR" },
    US: { country: "US", currency: "USD", paymentLocale: "en-US" },
    DE: { country: "DE", currency: "EUR", paymentLocale: "de-DE" }
  };

  async function requestChatGptCheckoutLinkOnly(checkoutRegion, payUrlMode) {
    try {
      const selectedPayUrlMode = String(payUrlMode || "").trim().toLowerCase() === "short" ? "short" : "long";
      const checkoutRegionConfig = {
        CA: { country: "CA", currency: "CAD", paymentLocale: "en-CA" },
        ID: { country: "ID", currency: "IDR", paymentLocale: "en-ID" },
        IE: { country: "IE", currency: "EUR", paymentLocale: "en-IE" },
        JP: { country: "JP", currency: "JPY", paymentLocale: "ja-JP" },
        BR: { country: "BR", currency: "BRL", paymentLocale: "pt-BR" },
        US: { country: "US", currency: "USD", paymentLocale: "en-US" },
        DE: { country: "DE", currency: "EUR", paymentLocale: "de-DE" }
      };
      const session = await fetch("https://chatgpt.com/api/auth/session", {
        cache: "no-store",
        credentials: "include"
      }).then((r) => r.json());
      const accessToken = session && session.accessToken;
      if (!accessToken) return { ok: false, error: "accessToken: null" };

      const config = checkoutRegionConfig[checkoutRegion] || checkoutRegionConfig.ID;
      const md5Hex = (value) => {
        const rotateLeft = (num, cnt) => (num << cnt) | (num >>> (32 - cnt));
        const addUnsigned = (a, b) => {
          const lsw = (a & 0xffff) + (b & 0xffff);
          const msw = (a >>> 16) + (b >>> 16) + (lsw >>> 16);
          return (msw << 16) | (lsw & 0xffff);
        };
        const cmn = (q, a, b, x, s, t) => addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, q), addUnsigned(x, t)), s), b);
        const ff = (a, b, c, d, x, s, t) => cmn((b & c) | ((~b) & d), a, b, x, s, t);
        const gg = (a, b, c, d, x, s, t) => cmn((b & d) | (c & (~d)), a, b, x, s, t);
        const hh = (a, b, c, d, x, s, t) => cmn(b ^ c ^ d, a, b, x, s, t);
        const ii = (a, b, c, d, x, s, t) => cmn(c ^ (b | (~d)), a, b, x, s, t);
        const text = unescape(encodeURIComponent(String(value || "")));
        const words = [];
        for (let i = 0; i < text.length; i += 1) {
          words[i >> 2] = words[i >> 2] || 0;
          words[i >> 2] |= text.charCodeAt(i) << ((i % 4) * 8);
        }
        const bitLength = text.length * 8;
        words[bitLength >> 5] = words[bitLength >> 5] || 0;
        words[bitLength >> 5] |= 0x80 << (bitLength % 32);
        words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;

        let a = 0x67452301;
        let b = 0xefcdab89;
        let c = 0x98badcfe;
        let d = 0x10325476;
        for (let i = 0; i < words.length; i += 16) {
          const aa = a;
          const bb = b;
          const cc = c;
          const dd = d;
          a = ff(a, b, c, d, words[i + 0] || 0, 7, 0xd76aa478);
          d = ff(d, a, b, c, words[i + 1] || 0, 12, 0xe8c7b756);
          c = ff(c, d, a, b, words[i + 2] || 0, 17, 0x242070db);
          b = ff(b, c, d, a, words[i + 3] || 0, 22, 0xc1bdceee);
          a = ff(a, b, c, d, words[i + 4] || 0, 7, 0xf57c0faf);
          d = ff(d, a, b, c, words[i + 5] || 0, 12, 0x4787c62a);
          c = ff(c, d, a, b, words[i + 6] || 0, 17, 0xa8304613);
          b = ff(b, c, d, a, words[i + 7] || 0, 22, 0xfd469501);
          a = ff(a, b, c, d, words[i + 8] || 0, 7, 0x698098d8);
          d = ff(d, a, b, c, words[i + 9] || 0, 12, 0x8b44f7af);
          c = ff(c, d, a, b, words[i + 10] || 0, 17, 0xffff5bb1);
          b = ff(b, c, d, a, words[i + 11] || 0, 22, 0x895cd7be);
          a = ff(a, b, c, d, words[i + 12] || 0, 7, 0x6b901122);
          d = ff(d, a, b, c, words[i + 13] || 0, 12, 0xfd987193);
          c = ff(c, d, a, b, words[i + 14] || 0, 17, 0xa679438e);
          b = ff(b, c, d, a, words[i + 15] || 0, 22, 0x49b40821);
          a = gg(a, b, c, d, words[i + 1] || 0, 5, 0xf61e2562);
          d = gg(d, a, b, c, words[i + 6] || 0, 9, 0xc040b340);
          c = gg(c, d, a, b, words[i + 11] || 0, 14, 0x265e5a51);
          b = gg(b, c, d, a, words[i + 0] || 0, 20, 0xe9b6c7aa);
          a = gg(a, b, c, d, words[i + 5] || 0, 5, 0xd62f105d);
          d = gg(d, a, b, c, words[i + 10] || 0, 9, 0x02441453);
          c = gg(c, d, a, b, words[i + 15] || 0, 14, 0xd8a1e681);
          b = gg(b, c, d, a, words[i + 4] || 0, 20, 0xe7d3fbc8);
          a = gg(a, b, c, d, words[i + 9] || 0, 5, 0x21e1cde6);
          d = gg(d, a, b, c, words[i + 14] || 0, 9, 0xc33707d6);
          c = gg(c, d, a, b, words[i + 3] || 0, 14, 0xf4d50d87);
          b = gg(b, c, d, a, words[i + 8] || 0, 20, 0x455a14ed);
          a = gg(a, b, c, d, words[i + 13] || 0, 5, 0xa9e3e905);
          d = gg(d, a, b, c, words[i + 2] || 0, 9, 0xfcefa3f8);
          c = gg(c, d, a, b, words[i + 7] || 0, 14, 0x676f02d9);
          b = gg(b, c, d, a, words[i + 12] || 0, 20, 0x8d2a4c8a);
          a = hh(a, b, c, d, words[i + 5] || 0, 4, 0xfffa3942);
          d = hh(d, a, b, c, words[i + 8] || 0, 11, 0x8771f681);
          c = hh(c, d, a, b, words[i + 11] || 0, 16, 0x6d9d6122);
          b = hh(b, c, d, a, words[i + 14] || 0, 23, 0xfde5380c);
          a = hh(a, b, c, d, words[i + 1] || 0, 4, 0xa4beea44);
          d = hh(d, a, b, c, words[i + 4] || 0, 11, 0x4bdecfa9);
          c = hh(c, d, a, b, words[i + 7] || 0, 16, 0xf6bb4b60);
          b = hh(b, c, d, a, words[i + 10] || 0, 23, 0xbebfbc70);
          a = hh(a, b, c, d, words[i + 13] || 0, 4, 0x289b7ec6);
          d = hh(d, a, b, c, words[i + 0] || 0, 11, 0xeaa127fa);
          c = hh(c, d, a, b, words[i + 3] || 0, 16, 0xd4ef3085);
          b = hh(b, c, d, a, words[i + 6] || 0, 23, 0x04881d05);
          a = hh(a, b, c, d, words[i + 9] || 0, 4, 0xd9d4d039);
          d = hh(d, a, b, c, words[i + 12] || 0, 11, 0xe6db99e5);
          c = hh(c, d, a, b, words[i + 15] || 0, 16, 0x1fa27cf8);
          b = hh(b, c, d, a, words[i + 2] || 0, 23, 0xc4ac5665);
          a = ii(a, b, c, d, words[i + 0] || 0, 6, 0xf4292244);
          d = ii(d, a, b, c, words[i + 7] || 0, 10, 0x432aff97);
          c = ii(c, d, a, b, words[i + 14] || 0, 15, 0xab9423a7);
          b = ii(b, c, d, a, words[i + 5] || 0, 21, 0xfc93a039);
          a = ii(a, b, c, d, words[i + 12] || 0, 6, 0x655b59c3);
          d = ii(d, a, b, c, words[i + 3] || 0, 10, 0x8f0ccc92);
          c = ii(c, d, a, b, words[i + 10] || 0, 15, 0xffeff47d);
          b = ii(b, c, d, a, words[i + 1] || 0, 21, 0x85845dd1);
          a = ii(a, b, c, d, words[i + 8] || 0, 6, 0x6fa87e4f);
          d = ii(d, a, b, c, words[i + 15] || 0, 10, 0xfe2ce6e0);
          c = ii(c, d, a, b, words[i + 6] || 0, 15, 0xa3014314);
          b = ii(b, c, d, a, words[i + 13] || 0, 21, 0x4e0811a1);
          a = ii(a, b, c, d, words[i + 4] || 0, 6, 0xf7537e82);
          d = ii(d, a, b, c, words[i + 11] || 0, 10, 0xbd3af235);
          c = ii(c, d, a, b, words[i + 2] || 0, 15, 0x2ad7d2bb);
          b = ii(b, c, d, a, words[i + 9] || 0, 21, 0xeb86d391);
          a = addUnsigned(a, aa);
          b = addUnsigned(b, bb);
          c = addUnsigned(c, cc);
          d = addUnsigned(d, dd);
        }
        const wordToHex = (num) => {
          let hex = "";
          for (let i = 0; i <= 3; i += 1) {
            hex += (`0${((num >>> (i * 8)) & 0xff).toString(16)}`).slice(-2);
          }
          return hex;
        };
        return `${wordToHex(a)}${wordToHex(b)}${wordToHex(c)}${wordToHex(d)}`;
      };
      const basePayload = {
        plan_name: "chatgptplusplan",
        billing_details: { country: config.country, currency: config.currency },
        cancel_url: "https://chatgpt.com/#pricing",
        promo_campaign: { promo_campaign_id: "plus-1-month-free", is_coupon_from_query_param: false }
      };

      const requestCheckout = async (payload) => {
        const resp = await fetch("https://chatgpt.com/backend-api/payments/checkout", {
          method: "POST",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        let data = null;
        try {
          data = await resp.json();
        } catch (error) {
          data = null;
        }
        return { resp, data };
      };
      const requestShortCheckout = async () => {
        const resp = await fetch("https://pay.chatai.codes/api/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            accessToken,
            tokenHash: md5Hex(accessToken),
            timestamp: btoa(String(Date.now())),
            planName: "chatgptplusplan",
            uiMode: "custom",
            region: config.country,
            workspaceName: "MyTeam",
            seatQuantity: 5
          })
        });
        let data = null;
        try {
          data = await resp.json();
        } catch (error) {
          data = null;
        }
        const link = String(data && data.link || "").trim();
        return { resp, data, link };
      };

      let hostedCheckout = null;
      let paymentLink = "";
      let shortCheckout = null;
      let shortPaymentLink = "";

      if (selectedPayUrlMode === "short") {
        shortCheckout = await requestShortCheckout();
        shortPaymentLink = shortCheckout.link;
      } else {
        hostedCheckout = await requestCheckout({
          ...basePayload,
          checkout_ui_mode: "hosted"
        });
        paymentLink = hostedCheckout.data && (
          hostedCheckout.data.url ||
          hostedCheckout.data.stripe_hosted_url ||
          hostedCheckout.data.checkout_url
        ) || "";
      }

      const ok = selectedPayUrlMode === "short"
        ? Boolean(shortCheckout && shortCheckout.resp.ok && shortPaymentLink)
        : Boolean(hostedCheckout && hostedCheckout.resp.ok && paymentLink);
      const error = ok
        ? ""
        : selectedPayUrlMode === "short"
          ? `short HTTP ${shortCheckout ? shortCheckout.resp.status : "not requested"}`
          : `hosted HTTP ${hostedCheckout ? hostedCheckout.resp.status : "not requested"}`;

      return {
        ok,
        accessToken,
        paymentLink,
        longPaymentLink: paymentLink,
        checkoutSessionId: "",
        shortPaymentLink,
        error
      };
    } catch (e) {
      return { ok: false, error: e.message || "checkout failed" };
    }
  }


  async function submitThirdPartyAccount(accountInfo) {
    try {
      const resp = await fetch(THIRD_PARTY_ACCOUNTS_API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": THIRD_PARTY_API_KEY
        },
        body: JSON.stringify({
          account: accountInfo.account,
          accessToken: accountInfo.accessToken,
          payurl: accountInfo.payurl
        })
      });
      let data = null;
      try {
        data = await resp.json();
      } catch (_) {}
      return {
        ok: resp.ok,
        status: resp.status,
        data,
        error: resp.ok ? "" : `HTTP ${resp.status}`
      };
    } catch (e) {
      return { ok: false, status: 0, data: null, error: e.message || "third-party submit failed" };
    }
  }

  function extractThirdPartyError(resp, data) {
    if (resp.ok) {
      return "";
    }
    if (data && typeof data === "object") {
      const message = data.message || data.error || data.reason;
      if (message) {
        return `HTTP ${resp.status}: ${message}`;
      }
    }
    return `HTTP ${resp.status}`;
  }

  async function deleteThirdPartyAccount(account) {
    try {
      const resp = await fetch(THIRD_PARTY_ACCOUNTS_DELETE_API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": THIRD_PARTY_API_KEY
        },
        body: JSON.stringify({ account })
      });
      let data = null;
      try {
        data = await resp.json();
      } catch (_) {}
      return {
        ok: resp.ok,
        status: resp.status,
        data,
        error: extractThirdPartyError(resp, data)
      };
    } catch (e) {
      return { ok: false, status: 0, data: null, error: e.message || "third-party delete failed" };
    }
  }

  async function runRegistration(tabId, specifiedAccountEmail = "") {
    setActiveStep(1);
    logMessage("等待 chatgpt.com 页面加载完成...");
    const pageLoaded = await waitForPageComplete(tabId, 90000);
    if (!pageLoaded) {
      logMessage("错误: chatgpt.com 页面加载超时");
      return { ok: false };
    }
    logMessage("等待注册按钮...");
    const clickRegisterCode = `
      (function() {
        function simulateClick(el) {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          el.focus();
          const rect = el.getBoundingClientRect();
          const clientX = rect.left + rect.width / 2;
          const clientY = rect.top + rect.height / 2;
          ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX,
              clientY,
              button: 0,
              buttons: type === 'mousedown' ? 1 : 0
            }));
          });
        }
        const btns = Array.from(document.querySelectorAll('button'));
        const regBtn = btns.find(b => /注册|Sign up|Create account/i.test(b.textContent || ''));
        if (regBtn) { simulateClick(regBtn); return true; }
        return false;
      })();
    `;
    await scrollTabToBottom(tabId);
    await executePageFunction(tabId, "__gptAutoRegisterClickButtonByText", {
      pattern: "注册|Sign up|Create account"
    }, {
      loadTimeoutMs: 15000
    });
    logMessage("已点击注册按钮，等待 3 秒...");
    await delay(3000);

    logMessage("等待 #email 输入框...");
    const waitEmailCode = `
      (async function() {
        const start = Date.now();
        while (Date.now() - start < 60000) {
          if (document.querySelector('#email')) return true;
          await new Promise(r => setTimeout(r, 1000));
        }
        return false;
      })();
    `;
    const hasEmailResult = await executePageFunction(tabId, "__gptAutoRegisterWaitForSelector", {
      selector: "#email",
      timeoutMs: 60000
    });
    const hasEmail = Boolean(hasEmailResult && hasEmailResult.ok);
    if (!hasEmail) {
      logMessage("错误: #email 未出现，超时");
      return { ok: false };
    }

    const normalizedSpecifiedEmail = String(specifiedAccountEmail || "").trim();
    const email = normalizedSpecifiedEmail || `${generateLocalPart()}@${DOMAINS[Math.floor(Math.random() * DOMAINS.length)]}`;
    const randomName = generateRandomName();
    const randomAge = generateRandomAge();
    const randomBirthday = generateRandomBirthday();
    logMessage(normalizedSpecifiedEmail ? `使用指定注册邮箱: ${email}` : `生成注册邮箱: ${email}`);

    const fillEmailCode = `
      (function() {
        function simulateType(el, text) {
          if (!el) return;
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, '');
          for (const ch of text) {
            setter.call(el, el.value + ch);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        function setValue(el, text) {
          if (!el) return;
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, text);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function fillAgeOrBirthday(ageValue, birthdayValue) {
          const ageInput = document.querySelector('input[name="age"]');
          const birthdayInput = document.querySelector('input[name="birthday"]');
          if (ageInput) {
            setValue(ageInput, Number(ageValue));
            return true;
          }
          if (birthdayInput) {
            setValue(birthdayInput, String(birthdayValue));
            return true;
          }
          return false;
        }
        const input = document.querySelector('#email');
        const nameInput = document.querySelector('input[name="name"]');
        if (input) simulateType(input, ${JSON.stringify(email)});
        if (nameInput) simulateType(nameInput, ${JSON.stringify(randomName)});
        const ageOrBirthday = fillAgeOrBirthday(${JSON.stringify(randomAge)}, ${JSON.stringify(randomBirthday)});
        return { email: Boolean(input), nameAge: Boolean(nameInput && ageOrBirthday) };
      })();
    `;
    const fillEmailResult = await executePageFunction(tabId, "__gptAutoRegisterFillRegistrationEmail", {
      email,
      randomName,
      randomAge,
      randomBirthday
    }) || {};
    const nameAgeFilledOnEmailPage = Boolean(fillEmailResult.nameAge);
    if (fillEmailResult.nameAge) {
      logMessage("检测到姓名和年龄输入框，已一起填写");
    }
    await delay(3000);

    const fillNameAgeCode = `
      (async function() {
        function delay(ms) {
          return new Promise(r => setTimeout(r, ms));
        }
        function simulateType(el, text) {
          if (!el) return;
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, '');
          for (const ch of text) {
            setter.call(el, el.value + ch);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        function setValue(el, text) {
          if (!el) return;
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, text);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        function fillAgeOrBirthday(ageValue, birthdayValue) {
          const ageInput = document.querySelector('input[name="age"]');
          const birthdayInput = document.querySelector('input[name="birthday"]');
          if (ageInput) {
            setValue(ageInput, Number(ageValue));
            return true;
          }
          if (birthdayInput) {
            setValue(birthdayInput, String(birthdayValue));
            return true;
          }
          return false;
        }
        const start = Date.now();
        while (Date.now() - start < 60000) {
          const nameInput = document.querySelector('input[name="name"]');
          const ageInput = document.querySelector('input[name="age"]');
          const birthdayInput = document.querySelector('input[name="birthday"]');
          if (nameInput && (ageInput || birthdayInput)) {
            simulateType(nameInput, ${JSON.stringify(randomName)});
            fillAgeOrBirthday(${JSON.stringify(randomAge)}, ${JSON.stringify(randomBirthday)});
            return { ok: true };
          }
          await delay(1000);
        }
        return { ok: false };
      })();
    `;
    const clickTryAgainCode = `
      (async function() {
        function delay(ms) {
          return new Promise(r => setTimeout(r, ms));
        }
        function simulateClick(el) {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          el.focus();
          const rect = el.getBoundingClientRect();
          const clientX = rect.left + rect.width / 2;
          const clientY = rect.top + rect.height / 2;
          ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX,
              clientY,
              button: 0,
              buttons: type === 'mousedown' ? 1 : 0
            }));
          });
        }
        const start = Date.now();
        while (Date.now() - start < 15000) {
          const tryAgain = document.querySelector('[data-dd-action-name="Try again"]');
          if (tryAgain) {
            simulateClick(tryAgain);
            return true;
          }
          await delay(1000);
        }
        return false;
      })();
    `;

    const clickSubmitCode = `
      (function() {
        function simulateClick(el) {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          el.focus();
          const rect = el.getBoundingClientRect();
          const clientX = rect.left + rect.width / 2;
          const clientY = rect.top + rect.height / 2;
          ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX,
              clientY,
              button: 0,
              buttons: type === 'mousedown' ? 1 : 0
            }));
          });
        }
        const submit = document.querySelector('button[type="submit"]');
        if (submit) { simulateClick(submit); return true; }
        return false;
      })();
    `;
    await scrollTabToBottom(tabId);
    await executePageFunction(tabId, "__gptAutoRegisterClick", {
      selector: 'button[type="submit"]',
      timeoutMs: 15000
    }, {
      loadTimeoutMs: 15000
    });
    if (nameAgeFilledOnEmailPage) {
      await delay(3000);
      const clickedTryAgain = await clickAboutYouTryAgainIfPresent(tabId);
      if (clickedTryAgain) {
        logMessage("邮箱页提交后仍在 about-you 页面，检测到 Try again，已点击后重新填写姓名和年龄");
        const nameAgeSubmitted = await submitNameAgeWithTryAgainRetry(tabId, randomName, randomAge, randomBirthday);
        if (!nameAgeSubmitted) {
          return { ok: false };
        }
      }
    }
    logMessage("已提交邮箱，轮询验证码...");

    let code = null;
    for (let i = 0; i < 25; i += 1) {
      code = await fetchVerificationCode(email);
      if (code) break;
      await delay(2500);
    }

    if (!code) {
      logMessage("错误: 未获取到验证码");
      return { ok: false };
    }

    const fillCodeOnly = `
      (function() {
        function simulateType(el, text) {
          if (!el) return;
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, '');
          for (const ch of text) {
            setter.call(el, el.value + ch);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        const codeInput = document.querySelector('input[name="code"]');
        if (codeInput) {
          simulateType(codeInput, ${JSON.stringify(code)});
          return true;
        }
        return false;
      })();
    `;
    await executePageFunction(tabId, "__gptAutoRegisterSetValue", {
      selector: 'input[name="code"]',
      value: code,
      timeoutMs: 30000
    });
    await delay(3000);

    const submitCodeBtn = `
      (function() {
        function simulateClick(el) {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          el.focus();
          const rect = el.getBoundingClientRect();
          const clientX = rect.left + rect.width / 2;
          const clientY = rect.top + rect.height / 2;
          ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX,
              clientY,
              button: 0,
              buttons: type === 'mousedown' ? 1 : 0
            }));
          });
        }
        const submit = document.querySelector('button[type="submit"], button[data-testid="submit"]');
        if (submit) { simulateClick(submit); return true; }
        return false;
      })();
    `;
    await scrollTabToBottom(tabId);
    await executePageFunction(tabId, "__gptAutoRegisterClick", {
      selector: 'button[type="submit"], button[data-testid="submit"]',
      timeoutMs: 15000
    }, {
      loadTimeoutMs: 15000
    });

    if (!nameAgeFilledOnEmailPage) {
      logMessage("验证码已提交，等待姓名和年龄输入框...");
      const nameAgeSubmitted = await submitNameAgeWithTryAgainRetry(tabId, randomName, randomAge, randomBirthday);
      if (!nameAgeSubmitted) {
        return { ok: false };
      }
    } else {
      logMessage("验证码已提交，等待进入 chatgpt.com");
    }
    return { ok: true, email };
  }

  async function submitNameAgeWithTryAgainRetry(tabId, randomName, randomAge, randomBirthday) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const fillNameAgeResult = await executePageFunction(tabId, "__gptAutoRegisterFillRegistrationNameAge", {
        randomName,
        randomAge,
        randomBirthday,
        timeoutMs: 60000
      }) || {};
      if (!fillNameAgeResult.ok) {
        logMessage("错误: 姓名和年龄输入框未出现，超时");
        return false;
      }

      await delay(1000);
      await scrollTabToBottom(tabId);
      await executePageFunction(tabId, "__gptAutoRegisterClick", {
        selector: 'button[type="submit"], button[data-testid="submit"]',
        timeoutMs: 15000
      }, {
        loadTimeoutMs: 15000
      });
      logMessage(attempt === 1 ? "姓名和年龄已提交，等待进入 chatgpt.com" : `姓名和年龄已重新提交，第 ${attempt} 次，等待进入 chatgpt.com`);
      await delay(3000);

      const clickedTryAgain = await clickAboutYouTryAgainIfPresent(tabId);
      if (!clickedTryAgain) {
        return true;
      }

      logMessage(`仍在 about-you 页面，检测到 Try again，已点击后准备重新填写（第 ${attempt}/5 次）`);
      await delay(1500);
    }

    logMessage("错误: about-you 页面 Try again 重试次数已达上限");
    return false;
  }

  async function clickAboutYouTryAgainIfPresent(tabId) {
    const tab = await ext.tabs.get(tabId);
    const currentUrl = String(tab.url || "");
    if (!currentUrl.startsWith("https://auth.openai.com/about-you")) {
      return false;
    }
    const result = await executePageFunction(tabId, "__gptAutoRegisterClickTryAgain", {
      timeoutMs: 15000
    }, {
      loadTimeoutMs: 15000
    });
    return Boolean(result && result.ok);
  }

  async function getCurrentWindowActiveTab() {
    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  async function createPrivateAutomationWindow(url) {
    const createdWindow = await ext.windows.create({
      url: "about:blank",
      incognito: true,
      focused: true
    });
    const tab = createdWindow && createdWindow.tabs && createdWindow.tabs[0];
    if (!createdWindow || createdWindow.id === undefined || !tab || !tab.id) {
      throw new Error("创建隐私窗口失败，请确认扩展已允许在隐私窗口运行");
    }
    const preparedUserAgent = await prepareRandomUserAgentForTab(tab.id, url);
    await ext.tabs.update(tab.id, { url, active: true });
    logTabUserAgentAfterNavigation(tab.id, preparedUserAgent, "隐私窗口新 URL");
    return {
      windowId: createdWindow.id,
      tab: await ext.tabs.get(tab.id)
    };
  }

  async function closeAutomationWindow(windowId, options = {}) {
    if (windowId === undefined || windowId === null) {
      return;
    }
    try {
      if (!options.immediate) {
        await delay(AUTOMATION_WINDOW_CLOSE_DELAY_MS);
      }
      await ext.windows.remove(windowId);
    } catch (error) {
      console.warn("Failed to close automation private window", error);
    }
  }

  async function requestChatGptCheckoutLinkFromTab(tabId, checkoutRegion, payUrlMode) {
    try {
      const result = await executePageFunction(tabId, "__gptAutoRegisterCheckoutLink", {
        checkoutRegion,
        payUrlMode
      }, {
        loadTimeoutMs: 45000
      });
      logMessage("隐私窗口支付链接任务结果", JSON.stringify(result));
      return result || { ok: false, error: "隐私窗口未返回支付链接任务结果" };
    } catch (error) {
      return {
        ok: false,
        error: "隐私窗口支付链接任务失败: " + formatError(error)
      };
    }
  }

  async function requestCheckoutLinkWithOfficialRegionRetry(requestLinkForRegion, primaryRegion) {
    const officialRegions = PAY_URL_OFFICIAL_REGION_ORDER;
    let lastAccessToken = "";
    let lastPrimaryResult = null;
    const primaryErrors = [];

    for (const region of officialRegions) {
      logMessage(`尝试获取支付链接，地区: ${region}`);
      const primaryResult = await requestLinkForRegion(region);
      lastPrimaryResult = primaryResult;
      if (primaryResult && primaryResult.accessToken) {
        lastAccessToken = primaryResult.accessToken;
      }
      if (primaryResult && primaryResult.ok && hasCheckoutPaymentLink(primaryResult)) {
        primaryResult.checkoutRegion = region;
        return primaryResult;
      }
      const regionError = primaryResult && primaryResult.error ? primaryResult.error : "未知错误";
      primaryErrors.push(`${region}: ${regionError}`);
      logMessage(`官方支付链接获取失败，地区 ${region}: ${regionError}`);
    }

    const primaryError = primaryErrors.join("; ") || "未知错误";
    logMessage(`官方支付链接全部失败: ${primaryError}`);
    return {
      ok: false,
      accessToken: lastAccessToken || (lastPrimaryResult && lastPrimaryResult.accessToken) || "",
      error: `官方支付链接失败: ${primaryError}`
    };
  }

  function getCheckoutLongPaymentLink(result) {
    return String(result && (result.longPaymentLink || result.paymentLink) || "").trim();
  }

  function getCheckoutShortPaymentLink(result) {
    return String(result && result.shortPaymentLink || "").trim();
  }

  function hasCheckoutPaymentLink(result) {
    return Boolean(getCheckoutLongPaymentLink(result) || getCheckoutShortPaymentLink(result));
  }

  function choosePaymentLinkForMode(result, mode) {
    const normalizedMode = normalizePayUrlMode(mode);
    const longLink = getCheckoutLongPaymentLink(result);
    const shortLink = getCheckoutShortPaymentLink(result);
    if (normalizedMode === "short") {
      return shortLink;
    }
    return longLink;
  }

  function chooseStoredPaymentLinkForMode(mode) {
    const normalizedMode = normalizePayUrlMode(mode);
    const longLink = String(state.lastLongPayUrl || "").trim();
    const shortLink = String(state.lastShortPayUrl || "").trim();
    if (normalizedMode === "short") {
      return shortLink;
    }
    return longLink;
  }

  async function applyCheckoutLinkResult(result, options = {}) {
    const mode = normalizePayUrlMode(options.mode || getPayUrlMode());
    const longLink = getCheckoutLongPaymentLink(result);
    const shortLink = getCheckoutShortPaymentLink(result);
    const selectedLink = choosePaymentLinkForMode(result, mode);
    if (!selectedLink) {
      throw new Error(mode === "short" ? "支付链接响应缺少短链" : "支付链接响应缺少长链");
    }

    state.lastLongPayUrl = longLink;
    state.lastShortPayUrl = shortLink;
    state.payUrlMode = mode;
    document.getElementById("payUrlInput").value = selectedLink;
    await persistState();
    if (mode === "short") {
      logMessage(`支付链接获取成功，已选择短链: ${selectedLink}`);
    } else {
      logMessage(`支付链接获取成功，已选择长链: ${selectedLink}`);
    }
    return selectedLink;
  }

  async function requestCheckoutLinkFromNewAutomationWindow(countrySel, closeReason, payUrlMode = getPayUrlMode()) {
    let automationWindowId = null;
    try {
      const automationWindow = await createPrivateAutomationWindow("https://chatgpt.com");
      automationWindowId = automationWindow.windowId;
      const tab = automationWindow.tab;
      logMessage("已打开窗口，准备在打开的窗口里获取支付链接");

      if (!(await waitForChatGptAfterRegistration(tab.id))) {
        return { ok: false, error: "打开的窗口未成功到达 chatgpt.com" };
      }

      return await requestCheckoutLinkWithOfficialRegionRetry(
        (region) => requestChatGptCheckoutLinkFromTab(tab.id, region, payUrlMode),
        countrySel
      );
    } finally {
      await closeAutomationWindow(automationWindowId);
      if (closeReason) {
        logMessage(closeReason);
      }
    }
  }

  async function createTabInActiveWindow(url) {
    let tab = null;
    try {
      const currentTab = await getCurrentWindowActiveTab();
      if (currentTab && currentTab.windowId !== undefined) {
        tab = await ext.tabs.create({ windowId: currentTab.windowId, active: true });
      }
    } catch (error) {
      console.warn("Failed to get active browser window", error);
    }
    if (!tab) {
      tab = await ext.tabs.create({ active: true });
    }
    const preparedUserAgent = await prepareRandomUserAgentForTab(tab.id, url);
    await ext.tabs.update(tab.id, { url, active: true });
    logTabUserAgentAfterNavigation(tab.id, preparedUserAgent, "新标签页 URL");
    return ext.tabs.get(tab.id);
  }

  async function prepareRandomUserAgentForTab(tabId, url) {
    try {
      const response = await ext.runtime.sendMessage({
        type: "gptAutoRegisterUserAgent",
        action: "prepare",
        tabId,
        url
      });
      if (response && response.userAgent) {
        logMessage(`请求头 User-Agent 已设置: ${response.userAgent}`);
        return response.userAgent;
      }
      logMessage("请求头 User-Agent 设置未返回有效结果");
    } catch (error) {
      console.warn("Failed to prepare random User-Agent", error);
      logMessage("User-Agent 随机化失败: " + formatError(error));
    }
    return "";
  }

  async function logTabUserAgentAfterNavigation(tabId, preparedUserAgent, label) {
    if (preparedUserAgent) {
      logMessage(`${label || "页面"} 请求头 User-Agent: ${preparedUserAgent}`);
    }
    try {
      await waitForScriptableTab(tabId, 15000);
      const loaded = await waitForPageComplete(tabId, 45000);
      if (!loaded) {
        logMessage(`${label || "页面"} 页面仍在加载，继续读取 navigator.userAgent`);
      }
      const pageUserAgentResult = await executePageFunction(tabId, "__gptAutoRegisterGetNavigatorUserAgent", {}, {
        loadTimeoutMs: 15000
      });
      const pageUserAgent = pageUserAgentResult && pageUserAgentResult.userAgent;
      logMessage(`${label || "页面"} window navigator.userAgent: ${pageUserAgent || ""}`);
    } catch (error) {
      logMessage(`${label || "页面"} window navigator.userAgent 读取失败: ${formatError(error)}`);
    }
  }

  function getRunCount() {
    const input = document.getElementById("runCountInput");
    const value = Math.floor(Number(input && input.value));
    if (Number.isFinite(value) && value >= 1) {
      return value;
    }
    if (input) {
      input.value = String(DEFAULT_RUN_COUNT);
    }
    return DEFAULT_RUN_COUNT;
  }

  function renderAutomationBatchControls() {
    const startButton = document.getElementById("startBtn");
    const cancelButton = document.getElementById("cancelBatchBtn");
    const startPayUrlButton = document.getElementById("startPayUrlBtn");
    if (startButton) {
      startButton.disabled = state.automationBatchRunning || state.payUrlBatchRunning;
    }
    if (startPayUrlButton) {
      startPayUrlButton.disabled = state.automationBatchRunning || state.payUrlBatchRunning;
    }
    if (cancelButton) {
      cancelButton.disabled = !state.automationBatchRunning || state.cancelAutomationBatchRequested;
      cancelButton.textContent = state.cancelAutomationBatchRequested ? "取消中" : "取消";
    }
  }

  function requestCancelAutomationBatch() {
    if (!state.automationBatchRunning) {
      logMessage("当前没有正在执行的完整流程");
      return;
    }
    if (state.cancelAutomationBatchRequested) {
      logMessage("已请求取消，当前流程结束后会停止");
      return;
    }
    state.cancelAutomationBatchRequested = true;
    renderAutomationBatchControls();
    logMessage("已请求取消，当前流程执行完后不再执行后续次数");
  }

  async function runAutomationBatch() {
    if (state.automationBatchRunning) {
      logMessage("完整流程正在执行中");
      return;
    }
    state.automationBatchRunning = true;
    state.cancelAutomationBatchRequested = false;
    renderAutomationBatchControls();
    let runCount = getRunCount();
    const specifiedAccounts = getSpecifiedAccountEntries();
    if (specifiedAccounts.length) {
      const invalidAccount = specifiedAccounts.find((account) => !isValidSpecifiedAccountEmail(account));
      if (invalidAccount) {
        logMessage(`指定注册账号格式无效，流程终止: ${invalidAccount}`);
        state.automationBatchRunning = false;
        state.cancelAutomationBatchRequested = false;
        renderAutomationBatchControls();
        return;
      }
      if (runCount > specifiedAccounts.length) {
        logMessage(`指定注册账号只有 ${specifiedAccounts.length} 个，本次完整流程执行次数调整为 ${specifiedAccounts.length}`);
        runCount = specifiedAccounts.length;
      }
    }
    resetRunStats(runCount);
    let completedCount = 0;
    let successCount = 0;
    let failCount = 0;
    try {
      logMessage(`准备连续执行 ${runCount} 次完整流程`);
      for (let index = 1; index <= runCount; index += 1) {
        logMessage(`===== 第 ${index}/${runCount} 次开始 =====`);
        try {
          const result = await startAutomation();
          completedCount = index;
          if (result && result.ok) {
            successCount += 1;
            updateRunStats("success");
            logMessage(`===== 第 ${index}/${runCount} 次结束 =====`);
          } else {
            failCount += 1;
            updateRunStats("fail");
            logMessage(`第 ${index}/${runCount} 次失败结束`);
          }
        } catch (error) {
          completedCount = index;
          failCount += 1;
          updateRunStats("fail");
          logMessage(`第 ${index}/${runCount} 次异常结束: ${formatError(error)}`);
        }
        if (state.cancelAutomationBatchRequested) {
          logMessage(`已取消后续任务，停止在第 ${completedCount}/${runCount} 次之后`);
          break;
        }
      }
      if (state.cancelAutomationBatchRequested && completedCount < runCount) {
        logMessage(
          `连续执行已取消，已完成 ${completedCount} 次，成功 ${successCount} 次，失败 ${failCount} 次，剩余 ${runCount - completedCount} 次未执行`
        );
      } else {
        logMessage(`连续执行完成，共 ${completedCount} 次，成功 ${successCount} 次，失败 ${failCount} 次`);
      }
    } finally {
      state.automationBatchRunning = false;
      state.cancelAutomationBatchRequested = false;
      renderAutomationBatchControls();
    }
  }

  async function startAutomation() {
    const countrySel = document.getElementById("country").value;
    let specifiedAccountEntry;
    try {
      specifiedAccountEntry = getNextSpecifiedAccountEntry();
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return { ok: false };
    }
    let prepared;
    try {
      prepared = await preparePaymentInputs(false);
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return { ok: false };
    }

    logMessage("开始完整自动化流程...");
    let automationWindowId = null;
    let uploadedThirdPartyAccount = null;
    let automationSucceeded = false;
    try {
      try {
        await ensureProxyForStage("第一步");
      } catch (error) {
        logMessage("第一步代理设置失败，流程终止: " + formatError(error));
        return { ok: false };
      }
      const automationWindow = await createPrivateAutomationWindow("https://chatgpt.com");
      automationWindowId = automationWindow.windowId;
      const tab = automationWindow.tab;
      logMessage("步骤1: 打开 chatgpt.com");

      let registration;
      try {
        registration = await runRegistration(tab.id, specifiedAccountEntry ? specifiedAccountEntry.email : null);
      } catch (error) {
        logMessage("注册异常，流程终止: " + formatError(error));
        keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }
      if (!registration.ok) {
        logMessage("注册失败，流程终止");
        keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }

      if (!(await waitForChatGptAfterRegistration(tab.id))) {
        logMessage("错误: 未成功到达 chatgpt.com");
        keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }

      setActiveStep(2);
      logMessage("步骤2: 获取支付链接");
      const payUrlMode = getPayUrlMode();
      const result = await requestCheckoutLinkWithOfficialRegionRetry(
        (region) => requestChatGptCheckoutLinkFromTab(tab.id, region, payUrlMode),
        countrySel
      );
      if (!result.ok || !hasCheckoutPaymentLink(result)) {
        logMessage("获取支付链接失败: " + (result.error || "未知错误"));
        keepSpecifiedAccountAfterCheckoutLinkFailure(specifiedAccountEntry);
        return { ok: false };
      }

      const selectedPaymentLink = await applyCheckoutLinkResult(result, { mode: payUrlMode });
      logMessage("支付链接已写入，准备提交第三方接口并进入支付流程");
      try {
        logSpecifiedAccountCreated(specifiedAccountEntry, registration.email);
      } catch (error) {
        logMessage("指定账号创建日志记录失败，继续支付流程: " + formatError(error));
      }
      try {
        logMessage("正在提交到第三方接口...");
        const thirdPartyResult = await submitThirdPartyAccount({
          account: registration.email,
          accessToken: result.accessToken,
          payurl: selectedPaymentLink
        });
        if (thirdPartyResult.ok) {
          uploadedThirdPartyAccount = registration.email;
          logMessage("第三方接口提交成功");
        } else {
          logMessage("第三方接口提交失败，继续支付流程: " + (thirdPartyResult.error || "未知错误"));
        }
      } catch (error) {
        logMessage("第三方接口提交异常，继续支付流程: " + formatError(error));
      }

      prepared.payUrl = selectedPaymentLink;
      prepared.longPayUrl = state.lastLongPayUrl;
      prepared.shortPayUrl = state.lastShortPayUrl;
      prepared.payUrlMode = state.payUrlMode;
      let payFlowResult = false;
      try {
        payFlowResult = await runPayPalFlowWithCaptchaWindowRetry(tab.id, prepared, {
          currentWindowId: automationWindowId,
          onWindowReopened: (nextWindow) => {
            automationWindowId = nextWindow.windowId;
          }
        });
      } catch (error) {
        logMessage("支付流程异常，按支付失败处理: " + formatError(error));
        payFlowResult = false;
      }
      automationSucceeded = Boolean(payFlowResult);
      if (automationSucceeded) {
        await removeSpecifiedAccountAfterPaymentSuccess(specifiedAccountEntry, registration.email);
        await removeUsedCardInput(prepared);
      } else {
        await removeSpecifiedAccountAfterPaymentFailure(specifiedAccountEntry);
      }
      return { ok: automationSucceeded };
    } finally {
      await cleanupAutomationProxy("完整流程任务已关闭");
      if (!automationSucceeded && uploadedThirdPartyAccount) {
        const cleanupReason = specifiedAccountEntry
          ? "指定账号完整流程失败，正在删除第三方账号"
          : prepared && prepared.payUrlAmountNonZero
            ? "PayURL 金额不是 0，正在删除第三方未绑定账号"
            : "获取到 PayURL 后流程失败，正在删除第三方账号";
        await deleteUploadedThirdPartyAccountAfterFailure(uploadedThirdPartyAccount, cleanupReason);
      }
      await closeAutomationWindow(automationWindowId);
    }
  }

  async function startToStep2() {
    const countrySel = document.getElementById("country").value;
    let specifiedAccountEntry;
    try {
      specifiedAccountEntry = getNextSpecifiedAccountEntry();
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return { ok: false };
    }

    logMessage("开始执行到第2步...");
    let automationWindowId = null;
    try {
      try {
        await ensureProxyForStage("第一步");
      } catch (error) {
        logMessage("第一步代理设置失败，流程终止: " + formatError(error));
        return { ok: false };
      }
      const automationWindow = await createPrivateAutomationWindow("https://chatgpt.com");
      automationWindowId = automationWindow.windowId;
      const tab = automationWindow.tab;
      logMessage("步骤1: 打开 chatgpt.com");

      let registration;
      try {
        registration = await runRegistration(tab.id, specifiedAccountEntry ? specifiedAccountEntry.email : null);
      } catch (error) {
        logMessage("注册异常，流程终止: " + formatError(error));
        keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }
      if (!registration.ok) {
        logMessage("注册失败，流程终止");
        keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }

      if (!(await waitForChatGptAfterRegistration(tab.id))) {
        logMessage("错误: 未成功到达 chatgpt.com");
        keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }

      setActiveStep(2);
      logMessage("步骤2: 获取支付链接");
      const payUrlMode = getPayUrlMode();
      const result = await requestCheckoutLinkWithOfficialRegionRetry(
        (region) => requestChatGptCheckoutLinkFromTab(tab.id, region, payUrlMode),
        countrySel
      );
      if (!result.ok || !hasCheckoutPaymentLink(result)) {
        logMessage("获取支付链接失败: " + (result.error || "未知错误"));
        keepSpecifiedAccountAfterCheckoutLinkFailure(specifiedAccountEntry);
        return { ok: false };
      }

      const selectedPaymentLink = await applyCheckoutLinkResult(result, { mode: payUrlMode });
      await markSpecifiedAccountCreated(specifiedAccountEntry, registration.email);
      logMessage("已执行到第2步，流程停止");
      return { ok: true, email: registration.email, paymentLink: selectedPaymentLink };
    } finally {
      await cleanupAutomationProxy("执行到第2步任务已关闭");
      await closeAutomationWindow(automationWindowId);
    }
  }

  async function getPayUrlFromCurrentTab() {
    const countrySel = document.getElementById("country").value;
    const payUrlMode = getPayUrlMode();

    setActiveStep(2);
    logMessage(`主动获取支付链接，国家: ${countrySel}`);
    const result = await requestCheckoutLinkFromNewAutomationWindow(countrySel, "获取支付链接窗口已关闭", payUrlMode);
    if (!result.ok || !hasCheckoutPaymentLink(result)) {
      logMessage("获取支付链接失败: " + (result.error || "未知错误"));
      return { ok: false };
    }

    const selectedPaymentLink = await applyCheckoutLinkResult(result, { mode: payUrlMode });
    return { ok: true, paymentLink: selectedPaymentLink };
  }

  async function startFromPayUrl() {
    if (state.payUrlBatchRunning) {
      logMessage("PayURL 队列正在执行中");
      return;
    }

    const totalPayUrls = getPayUrlEntries().length;
    if (!totalPayUrls) {
      logMessage("错误: 请输入 PayURL");
      return;
    }

    state.payUrlBatchRunning = true;
    renderAutomationBatchControls();
    resetRunStats(totalPayUrls);
    let completedCount = 0;
    let successCount = 0;
    let failCount = 0;
    try {
      logMessage(`准备按顺序执行 ${totalPayUrls} 条 PayURL`);
      for (let index = 1; index <= totalPayUrls; index += 1) {
        logMessage(`===== PayURL 第 ${index}/${totalPayUrls} 条开始 =====`);
        let result = { ok: false };
        try {
          result = await runSinglePayUrlPayment();
        } catch (error) {
          logMessage(`PayURL 第 ${index}/${totalPayUrls} 条异常结束: ${formatError(error)}`);
        }
        completedCount = index;
        if (result && result.ok) {
          successCount += 1;
          updateRunStats("success");
          logMessage(`===== PayURL 第 ${index}/${totalPayUrls} 条成功结束 =====`);
        } else {
          failCount += 1;
          updateRunStats("fail");
          logMessage(`PayURL 第 ${index}/${totalPayUrls} 条失败，保留当前 PayURL 并停止队列`);
          break;
        }
      }
      logMessage(`PayURL 队列执行完成，已处理 ${completedCount}/${totalPayUrls} 条，成功 ${successCount} 条，失败 ${failCount} 条`);
    } finally {
      state.payUrlBatchRunning = false;
      renderAutomationBatchControls();
    }
  }

  async function runSinglePayUrlPayment() {
    let prepared;
    try {
      prepared = await preparePaymentInputs(true);
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return { ok: false };
    }

    logMessage(`从 PayURL 开始支付流程: ${prepared.payUrl}`);
    let automationWindowId = null;
    try {
      try {
        await ensureProxyForStage("第三步");
      } catch (error) {
        logMessage("第三步代理设置失败，流程终止: " + formatError(error));
        return { ok: false };
      }
      const automationWindow = await createPrivateAutomationWindow(prepared.payUrl);
      automationWindowId = automationWindow.windowId;
      const payFlowResult = await runPayPalFlowWithCaptchaWindowRetry(automationWindow.tab.id, prepared, {
        proxyReady: true,
        currentWindowId: automationWindowId,
        onWindowReopened: (nextWindow) => {
          automationWindowId = nextWindow.windowId;
        }
      });
      if (payFlowResult) {
        await removeUsedCardInput(prepared);
        await removeUsedPayUrlInput(prepared);
      }
      return { ok: Boolean(payFlowResult) };
    } finally {
      await cleanupAutomationProxy("PayURL 任务已关闭");
      await closeAutomationWindow(automationWindowId);
    }
  }

  async function startFromStep3() {
    let prepared;
    try {
      prepared = await preparePaymentInputs(false);
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return;
    }

    const tab = await getCurrentWindowActiveTab();
    if (!tab || !tab.id) {
      logMessage("错误: 未找到当前标签页");
      return;
    }

    logMessage("从当前页面第3步开始支付流程...");
    let retryAutomationWindowId = null;
    try {
      try {
        await ensureProxyForStage("第三步");
      } catch (error) {
        logMessage("第三步代理设置失败，流程终止: " + formatError(error));
        return;
      }
      await applyCurrentIpLocationToPrepared(prepared);
      if (!prepared.payUrl) {
        prepared.payUrl = String(tab.url || "").trim();
      }
      const payFlowResult = await runPayPalFlowWithCaptchaWindowRetry(tab.id, prepared, {
        proxyReady: true,
        currentWindowId: tab.incognito ? tab.windowId : null,
        onWindowReopened: (nextWindow) => {
          retryAutomationWindowId = nextWindow.windowId;
        }
      });
      if (payFlowResult) {
        await removeUsedCardInput(prepared);
      }
    } finally {
      await cleanupAutomationProxy("第3步任务已关闭");
      await closeAutomationWindow(retryAutomationWindowId);
    }
  }

  async function manualFillStep5Form() {
    let prepared;
    try {
      prepared = await preparePaymentInputs(false, { reusePaypalEmail: true });
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return;
    }

    const tab = await getCurrentWindowActiveTab();
    if (!tab || !tab.id) {
      logMessage("错误: 未找到当前标签页");
      return;
    }

    setActiveStep(5);
    logMessage("手动填充第5步 PayPal signup 表单...");
    await applyCurrentIpLocationToPrepared(prepared);
    await fillPayPalSignupForm(tab.id, prepared);
    logMessage("第5步表单已填充，未自动提交");
  }

  async function preparePaymentInputs(requirePayUrl, options = {}) {
    const cardEntry = getNextCardInputEntry(document.getElementById("cardInput").value);
    const payUrlEntry = getNextPayUrlInputEntry(document.getElementById("payUrlInput").value);
    const payUrl = payUrlEntry ? payUrlEntry.url : "";
    if (!cardEntry) {
      throw new Error("请输入卡片信息");
    }
    const card = await parseCardInput(cardEntry.line);
    if (state.randomCardEnabled) {
      const generatedCardNumber = generateRandomLuhnCardNumber(card.card);
      card.card = generatedCardNumber;
      logMessage(`已为本次流程临时随机生成 Luhn 有效卡号: ${generatedCardNumber}`);
    }
    if (requirePayUrl && !payUrl) {
      throw new Error("请输入 PayURL");
    }
    if (payUrl) {
      try {
        new URL(payUrl);
      } catch (error) {
        throw new Error("PayURL 不是有效 URL");
      }
    }
    const payUrlMode = getPayUrlMode();
    const storedLongPayUrl = String(state.lastLongPayUrl || "").trim();
    const storedShortPayUrl = String(state.lastShortPayUrl || "").trim();
    const payUrlMatchesStoredCheckout = Boolean(payUrl && (payUrl === storedLongPayUrl || payUrl === storedShortPayUrl));
    const flowCountry = getFlowCountry();
    logMessage(`准备第3/5步流程国家: ${flowCountry}`);
    const phoneKey = await preparePhoneKeyForFlow(flowCountry);
    state.phoneKey = phoneKey;
    const preparedPhone = phoneKey && phoneKey.phone ? phoneKey.phone : getFillPhoneNumber(card);
    if (!preparedPhone) {
      throw new Error(flowCountry === "JP"
        ? "未准备好日本手机号，请填写日本短信 CDK，或在手机区域填写 phone----smsUrl"
        : "未准备好手机号，请检查手机区域格式是否为 +1手机号|短信接口URL");
    }
    logMessage(`已准备手机号: ${preparedPhone}`);
    const paypalEmail = options.reusePaypalEmail && state.lastPaypalEmail
      ? state.lastPaypalEmail
      : generateGmailAddress();
    state.lastPaypalEmail = paypalEmail;
    await persistState();
    return {
      card,
      cardInputLine: cardEntry.line,
      flowCountry,
      phoneKey,
      phone: preparedPhone,
      payUrl,
      payUrlInputLine: payUrlEntry ? payUrlEntry.line : "",
      longPayUrl: payUrlMatchesStoredCheckout ? storedLongPayUrl : payUrl,
      shortPayUrl: payUrlMatchesStoredCheckout ? storedShortPayUrl : "",
      payUrlMode,
      settings: sanitizeFillSettings(state.fillSettings),
      paypalEmail,
      randomCardEnabled: Boolean(state.randomCardEnabled)
    };
  }

  function getNextCardInputEntry(rawInput) {
    const lines = String(rawInput || "").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (trimmed) {
        return { line: trimmed };
      }
    }
    return null;
  }

  function getPayUrlEntries(rawInput) {
    const input = rawInput === undefined
      ? document.getElementById("payUrlInput").value
      : rawInput;
    return String(input || "")
      .split(/\r?\n/)
      .map((line) => String(line || "").trim())
      .filter(Boolean);
  }

  function getNextPayUrlInputEntry(rawInput) {
    const payUrls = getPayUrlEntries(rawInput);
    if (!payUrls.length) {
      return null;
    }
    const payUrl = payUrls[0];
    try {
      new URL(payUrl);
    } catch (error) {
      throw new Error(`PayURL 不是有效 URL: ${payUrl}`);
    }
    return {
      line: payUrl,
      url: payUrl
    };
  }

  function getSpecifiedAccountEntries(rawInput) {
    const input = rawInput === undefined
      ? document.getElementById("specifiedAccountInput").value
      : rawInput;
    return String(input || "")
      .split(/\r?\n/)
      .map((line) => String(line || "").trim())
      .filter(Boolean);
  }

  function isValidSpecifiedAccountEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function getNextSpecifiedAccountEntry() {
    const accounts = getSpecifiedAccountEntries();
    if (!accounts.length) {
      return null;
    }
    const email = accounts[0];
    if (!isValidSpecifiedAccountEmail(email)) {
      throw new Error(`指定注册账号格式无效: ${email}`);
    }
    return {
      line: email,
      email
    };
  }

  function logSpecifiedAccountCreated(accountEntry, fallbackEmail) {
    if (!accountEntry || !accountEntry.line) {
      return;
    }
    const email = accountEntry.email || String(fallbackEmail || "").trim();
    if (email) {
      logMessage(`指定账号创建成功: ${email}`);
    }
  }

  async function markSpecifiedAccountCreated(accountEntry, fallbackEmail) {
    logSpecifiedAccountCreated(accountEntry, fallbackEmail);
    await removeSpecifiedAccountInput(accountEntry);
  }

  function keepSpecifiedAccountAfterCheckoutLinkFailure(accountEntry) {
    if (!accountEntry || !accountEntry.line) {
      return;
    }
    logMessage(`指定注册账号获取支付链接失败，保留对应账号: ${accountEntry.email || accountEntry.line}`);
  }

  function keepSpecifiedAccountAfterRegistrationFailure(accountEntry) {
    if (!accountEntry || !accountEntry.line) {
      return;
    }
    logMessage(`指定注册账号注册失败，保留对应账号: ${accountEntry.email || accountEntry.line}`);
  }

  async function removeSpecifiedAccountAfterPaymentSuccess(accountEntry, fallbackEmail) {
    if (!accountEntry || !accountEntry.line) {
      return;
    }
    const email = accountEntry.email || String(fallbackEmail || "").trim();
    logMessage(`指定注册账号支付成功，删除对应账号: ${email || accountEntry.line}`);
    await removeSpecifiedAccountInput(accountEntry);
  }

  async function removeSpecifiedAccountAfterPaymentFailure(accountEntry) {
    if (!accountEntry || !accountEntry.line) {
      return;
    }
    logMessage(`指定注册账号支付流程失败，删除对应账号: ${accountEntry.email || accountEntry.line}`);
    await removeSpecifiedAccountInput(accountEntry);
  }

  async function deleteUploadedThirdPartyAccountAfterFailure(account, reason) {
    if (!account) {
      return;
    }
    if (!isDeleteThirdPartyAccountEnabled()) {
      logMessage(`已关闭失败删除第三方账号，保留: ${account}`);
      return;
    }
    logMessage(`${reason}: ${account}`);
    const deleteResult = await deleteThirdPartyAccount(account);
    if (deleteResult.ok) {
      logMessage(`第三方账号删除请求成功: ${account}`);
    } else {
      logMessage(`第三方账号删除请求失败: ${account}，${deleteResult.error || "未知错误"}`);
    }
  }

  async function waitForChatGptAfterRegistration(tabId) {
    for (let i = 0; i < 45; i += 1) {
      try {
        const tab = await ext.tabs.get(tabId);
        const currentUrl = String(tab.url || "");
        if (currentUrl.startsWith("https://chatgpt.com")) {
          return true;
        }
        if (currentUrl.startsWith(PASSKEY_ENROLL_URL_PREFIX)) {
          const clicked = await clickPasskeyEnrollSkipIfPresent(tabId);
          if (clicked) {
            logMessage("检测到 passkey 注册页面，已点击跳过");
          }
        }
      } catch (_) {}
      await delay(1500);
    }
    return false;
  }

  async function clickPasskeyEnrollSkipIfPresent(tabId) {
    const tab = await ext.tabs.get(tabId);
    const currentUrl = String(tab.url || "");
    if (!currentUrl.startsWith(PASSKEY_ENROLL_URL_PREFIX)) {
      return false;
    }
    const result = await executePageFunction(tabId, "__gptAutoRegisterClick", {
      selector: PASSKEY_ENROLL_SKIP_SELECTOR,
      timeoutMs: 15000
    }, {
      loadTimeoutMs: 15000
    });
    return Boolean(result && result.ok);
  }

  async function removeSpecifiedAccountInput(accountEntry) {
    const usedLine = String(accountEntry && accountEntry.line || "").trim();
    if (!usedLine) {
      return;
    }
    const accountInput = document.getElementById("specifiedAccountInput");
    const lines = String(accountInput.value || "").split(/\r?\n/);
    const remainingLines = [];
    let removed = false;
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (!removed && trimmed === usedLine) {
        removed = true;
        continue;
      }
      if (trimmed) {
        remainingLines.push(trimmed);
      }
    }
    if (!removed) {
      logMessage("未找到本次使用的指定注册账号，账号列表未修改");
      return;
    }
    accountInput.value = remainingLines.join("\n");
    state.specifiedAccountInput = accountInput.value.trim();
    await persistState();
    logMessage(`已从指定注册账号列表删除: ${usedLine}`);
  }

  async function removeUsedCardInput(prepared) {
    if (prepared && prepared.randomCardEnabled) {
      logMessage("已勾选随机生成卡片，保留原始卡片信息");
      return;
    }
    const usedLine = String(prepared && prepared.cardInputLine || "").trim();
    if (!usedLine) {
      return;
    }
    const cardInput = document.getElementById("cardInput");
    const lines = String(cardInput.value || "").split(/\r?\n/);
    const remainingLines = [];
    let removed = false;
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (!removed && trimmed === usedLine) {
        removed = true;
        continue;
      }
      if (trimmed) {
        remainingLines.push(trimmed);
      }
    }
    if (!removed) {
      logMessage("未找到本次使用的卡片信息，卡片列表未修改");
      return;
    }
    cardInput.value = remainingLines.join("\n");
    await persistState();
    logMessage("注册成功，已删除本次使用的卡片信息");
  }

  async function removeUsedPayUrlInput(prepared) {
    const usedLine = String(prepared && prepared.payUrlInputLine || prepared && prepared.payUrl || "").trim();
    if (!usedLine) {
      return;
    }
    const payUrlInput = document.getElementById("payUrlInput");
    const lines = String(payUrlInput.value || "").split(/\r?\n/);
    const remainingLines = [];
    let removed = false;
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (!removed && trimmed === usedLine) {
        removed = true;
        continue;
      }
      if (trimmed) {
        remainingLines.push(trimmed);
      }
    }
    if (!removed) {
      logMessage("未找到本次使用的 PayURL，PayURL 列表未修改");
      return;
    }
    payUrlInput.value = remainingLines.join("\n");
    await persistState();
    logMessage(`支付成功，已删除本次使用的 PayURL: ${usedLine}`);
  }

  async function removeInvalidPhoneKeyInput(prepared, reason) {
    const usedLine = String(prepared && prepared.phoneKey && prepared.phoneKey.raw || "").trim();
    if (!usedLine) {
      return false;
    }
    const phoneInput = document.getElementById("phoneKeyInput");
    const lines = String(phoneInput.value || "").split(/\r?\n/);
    const remainingLines = [];
    let removedCount = 0;
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (trimmed === usedLine) {
        removedCount += 1;
        continue;
      }
      if (trimmed) {
        remainingLines.push(trimmed);
      }
    }
    if (!removedCount) {
      logMessage("未找到本次使用的手机号，手机号列表未修改");
      return false;
    }
    phoneInput.value = remainingLines.join("\n");
    state.phoneKeyInput = phoneInput.value.trim();
    try {
      state.phoneKey = pickRandomPhoneKey(state.phoneKeyInput, { allowEmpty: true });
    } catch (_) {
      state.phoneKey = null;
    }
    await persistState();
    logMessage(`${reason || "PayPal 返回 genericError"}，已删除本次使用的手机号，标记为无法继续使用`);
    return true;
  }

  class PayPalCaptchaButtonNotFoundError extends Error {
    constructor(message) {
      super(message);
      this.name = "PayPalCaptchaButtonNotFoundError";
    }
  }

  function isPayPalCaptchaButtonNotFoundError(error) {
    return error instanceof PayPalCaptchaButtonNotFoundError ||
      (error && error.name === "PayPalCaptchaButtonNotFoundError");
  }

  async function runPayPalFlowWithCaptchaWindowRetry(tabId, prepared, options = {}) {
    let activeTabId = tabId;
    let retryWindowId = null;
    try {
      return await runPayPalFlow(activeTabId, prepared, options);
    } catch (error) {
      if (!isPayPalCaptchaButtonNotFoundError(error) || options.captchaWindowRetry === false) {
        throw error;
      }
      logMessage("滑块验证码后找不到点击按钮，关闭窗口并重新打开窗口进行第三步");
      if (options.currentWindowId !== undefined && options.currentWindowId !== null) {
        await closeAutomationWindow(options.currentWindowId, { immediate: true });
      }
      const automationWindow = await createPrivateAutomationWindow(prepared.payUrl);
      retryWindowId = automationWindow.windowId;
      if (typeof options.onWindowReopened === "function") {
        options.onWindowReopened(automationWindow);
      }
      activeTabId = automationWindow.tab.id;
      return await runPayPalFlow(activeTabId, prepared, {
        ...options,
        currentWindowId: retryWindowId,
        proxyReady: true,
        captchaWindowRetry: false
      });
    }
  }

  async function runPayPalFlow(tabId, prepared, options = {}) {
    if (!prepared.payUrl) {
      throw new Error("PayURL 不能为空");
    }
    if (!options.proxyReady) {
      try {
        await ensureProxyForStage("第三步");
      } catch (error) {
        logMessage("第三步代理设置失败，流程终止: " + formatError(error));
        return false;
      }
    }
    await applyCurrentIpLocationToPrepared(prepared);
    await updateTabUrl(tabId, prepared.payUrl);
    return runPayPalFlowFromCurrentPayUrl(tabId, prepared);
  }

  async function runPayPalFlowFromCurrentPayUrl(tabId, prepared) {
    const payUrlReady = await runPayUrlPage(tabId, prepared);
    if (!payUrlReady) {
      return false;
    }
    await runPayPalLoginPage(tabId, prepared);
    await runPayPalSignupPage(tabId, prepared);
    logMessage("PayPal 步骤已完成，短信验证码已输入");
    return true;
  }

  function parseCurrencyAmountText(text) {
    const normalized = String(text || "").replace(/\s+/g, "");
    const numericText = normalized.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
    const amount = Number(numericText);
    return Number.isFinite(amount) ? amount : null;
  }

  function isZeroCurrencyAmount(text) {
    const amount = parseCurrencyAmountText(text);
    return amount !== null && Math.abs(amount) < 0.000001;
  }

  async function getPayUrlCurrencyAmountText(tabId) {
    const results = await executePageFunction(tabId, "__gptAutoRegisterGetText", {
      selector: ".CurrencyAmount",
      timeoutMs: 10000
    }, {
      allFrames: true
    });
    const matched = (Array.isArray(results) ? results : [results])
      .filter(Boolean)
      .find((result) => result.ok && String(result.text || "").trim());
    return matched ? String(matched.text || "").trim() : "";
  }

  async function ensurePayUrlAmountIsZero(tabId, prepared) {
    logMessage("等待 PayURL 页面加载完成后检查 1 Month Free");
    const pageLoaded = await waitForPageComplete(tabId, 120000);
    if (!pageLoaded) {
      if (prepared) {
        prepared.payUrlAmountZero = false;
        prepared.payUrlAmountNonZero = true;
        prepared.payUrlAmountText = "";
      }
      logMessage("PayURL 页面未加载完成，停止当前任务");
      return false;
    }
    logMessage("PayURL 页面已加载完成，检查是否包含 1 Month Free");
    const results = await executePageFunction(tabId, "__gptAutoRegisterBodyContainsText", {
      text: "1 Month Free"
    }, {
      allFrames: true
    });
    const hasOneMonthFree = (Array.isArray(results) ? results : [results]).some((result) => result && result.ok);
    if (!hasOneMonthFree) {
      if (prepared) {
        prepared.payUrlAmountZero = false;
        prepared.payUrlAmountNonZero = true;
        prepared.payUrlAmountText = "";
      }
      logMessage("PayURL 未找到 1 Month Free，停止当前任务");
      return false;
    }
    if (prepared) {
      prepared.payUrlAmountZero = true;
      prepared.payUrlAmountNonZero = false;
      prepared.payUrlAmountText = "1 Month Free";
    }
    logMessage("PayURL 已找到 1 Month Free，继续第三步");
    return true;
  }

  function isChatGptShortCheckoutUrl(url) {
    try {
      const parsed = new URL(String(url || ""));
      return parsed.hostname === "chatgpt.com" &&
        parsed.pathname.replace(/\/+$/, "").startsWith("/checkout");
    } catch (_) {
      return false;
    }
  }

  function isShortPayUrlFlow(prepared) {
    return normalizePayUrlMode(prepared && prepared.payUrlMode) === "short" ||
      isChatGptShortCheckoutUrl(prepared && prepared.payUrl);
  }

  async function runShortCheckoutBillingPage(tabId, prepared) {
    logMessage("检测到 ChatGPT 短链 checkout，等待页面加载完成");
    await waitForUrlPrefix(tabId, "https://chatgpt.com/checkout", 120000);
    const pageLoaded = await waitForPageComplete(tabId, 120000);
    if (!pageLoaded) {
      logMessage("短链 checkout 页面未加载完成，停止当前任务");
      return false;
    }
    await ensureContentScript(tabId);
    await delay(2000);
    const waitForShortCheckoutSelector = async (selector, label, timeoutMs = 60000) => {
      const start = Date.now();
      let lastError = "";
      while (Date.now() - start < timeoutMs) {
        const result = await executePageFunction(tabId, "__gptAutoRegisterWaitForSelector", {
          selector,
          timeoutMs: 1000
        }, {
          allFrames: true,
          loadTimeoutMs: 10000,
          scriptableTimeoutMs: 10000
        }).catch((error) => {
          lastError = formatError(error);
          return null;
        });
        const found = (Array.isArray(result) ? result : [result]).some((item) => item && item.ok);
        if (found) {
          return true;
        }
        await delay(500);
      }
      logMessage(`${label} 等待超时${lastError ? `: ${lastError}` : ""}`);
      return false;
    };
    logMessage("短链 checkout 页面已加载完成，等待 PayPal tab");
    const paypalTabExists = await waitForShortCheckoutSelector("#paypal-tab", "短链 checkout PayPal tab", 60000);
    if (paypalTabExists) {
      const paypalTabResult = await executePageFunction(tabId, "__gptAutoRegisterClick", {
        selector: "#paypal-tab",
        timeoutMs: 3000
      }, { allFrames: true }).catch((error) => {
        logMessage(`短链 checkout PayPal tab 点击跳过: ${formatError(error)}`);
        return null;
      });
      logMessage("短链 点击 PayPal tab");
      const paypalTabClicked = (Array.isArray(paypalTabResult) ? paypalTabResult : [paypalTabResult])
        .some((result) => result && result.ok);
      if (!paypalTabClicked) {
        logMessage("短链 checkout PayPal tab 已出现但点击失败，继续填写账单表单");
      }
    } else {
      logMessage("短链 checkout 未找到 PayPal tab，继续填写账单表单");
    }
    await delay(2000);
    logMessage("短链 开始填写账单表单");
    const billingName = String(prepared && prepared.card && (
      prepared.card.billingName ||
      prepared.card.name ||
      [prepared.card.firstName, prepared.card.lastName].filter(Boolean).join(" ")
    ) || "").trim() || generateRandomName();
    const fillShortCheckoutField = async (functionName, payload, label) => {
      const selector = String((payload && payload.selector) || "").trim();
      if (selector) {
        const exists = await waitForShortCheckoutSelector(selector, label, 60000);
        if (!exists) {
          logMessage(`${label} 未找到，继续`);
          return false;
        }
      }
      const result = await executePageFunction(tabId, functionName, {
        ...payload,
        timeoutMs: 3000
      }, { allFrames: true }).catch((error) => {
        logMessage(`${label} 跳过: ${formatError(error)}`);
        return null;
      });
      const filled = (Array.isArray(result) ? result : [result]).some((item) => item && item.ok);
      if (!filled) {
        logMessage(`${label} 未找到，继续`);
      }
      return filled;
    };
    await fillShortCheckoutField("__gptAutoRegisterSetValue", {
      selector: "#billingAddress-nameInput",
      value: billingName,
      payUrlStyle: true
    }, "短链 checkout 账单姓名字段");
    await fillShortCheckoutField("__gptAutoRegisterSetSelectIfNeeded", {
      selector: "#billingAddress-countryInput",
      value: "JP"
    }, "短链 checkout 国家字段");
    await fillShortCheckoutField("__gptAutoRegisterSetValue", {
      selector: "#billingAddress-postalCodeInput",
      value: "150-0001",
      payUrlStyle: true
    }, "短链 checkout 邮编字段");
    await delay(2000);
    await fillShortCheckoutField("__gptAutoRegisterSetSelectIfNeeded", {
      selector: "#billingAddress-administrativeAreaInput",
      value: "Tokyo"
    }, "短链 checkout 都道府县字段");
    await fillShortCheckoutField("__gptAutoRegisterSetValue", {
      selector: "#billingAddress-localityInput",
      value: "Shibuya",
      payUrlStyle: true
    }, "短链 checkout 市区町村字段");
    await fillShortCheckoutField("__gptAutoRegisterSetValue", {
      selector: "#billingAddress-addressLine1Input",
      value: "Jingumae",
      payUrlStyle: true
    }, "短链 checkout 账单地址字段");
    await delay();
    logMessage("短链 checkout 表单已尝试填充，尝试点击提交");
    const submitResult = await executePageFunction(tabId, "__gptAutoRegisterClick", {
      selector: 'button[type="submit"]',
      timeoutMs: 30000
    }, { allFrames: true }).catch((error) => {
      logMessage(`短链 checkout 提交按钮点击跳过: ${formatError(error)}`);
      return null;
    });
    const submitClicked = (Array.isArray(submitResult) ? submitResult : [submitResult])
      .some((result) => result && result.ok);
    logMessage(submitClicked ? "短链 checkout 已点击提交按钮" : "短链 checkout 未找到提交按钮，继续");
    return true;
  }

  async function runPayUrlPage(tabId, prepared) {
    setActiveStep(3);
    logMessage("步骤3: 等待 PayURL 页面 PayPal 选项");
    await ensureContentScript(tabId);
    await delay(10000)
    const currentTab = await ext.tabs.get(tabId);
    if (isChatGptShortCheckoutUrl(currentTab && currentTab.url) || isChatGptShortCheckoutUrl(prepared && prepared.payUrl)) {
      return runShortCheckoutBillingPage(tabId, prepared);
    }
    const shouldContinue = await ensurePayUrlAmountIsZero(tabId, prepared);
    if (!shouldContinue) {
      return false;
    }
    await clickPageElement(tabId, {
      selector: 'button[data-testid="paypal-accordion-item-button"]',
      timeoutMs: 60000
    }, "未找到 PayPal 支付选项");
    logMessage("已选择 PayPal，填充卡片信息");
    await delay();
    await fillCurrentPage(tabId, prepared, createPayUrlFillOptions(prepared, { type: true }));
    await scrollTabToBottom(tabId);
    const termsCheckboxResult = await executePageFunction(tabId, "__gptAutoRegisterCheck", {
      selector: "#termsOfServiceConsentCheckbox",
      timeoutMs: 5000
    });
    if (!termsCheckboxResult || !termsCheckboxResult.ok) {
      logMessage("未找到服务条款复选框，继续提交流程");
    }
    const submitDelayMs = randomDelayMs();
    logMessage(`表单已填充，等待 ${(submitDelayMs / 1000).toFixed(1)} 秒后提交`);
    await delay(submitDelayMs);
    await clickPageElement(tabId, {
      selector: 'button[type="submit"]',
      timeoutMs: 30000
    }, "未找到提交按钮");
    logMessage("PayURL 页面已提交");
    return true;
  }

  async function runPayPalLoginPage(tabId, prepared) {
    setActiveStep(4);
    logMessage("步骤4: 等待进入 paypal.com");
    await waitForUrlPrefix(tabId, "https://www.paypal.com", 30000);
    await delay();
    await ensureContentScript(tabId);
    await delay();
    logMessage("检测是否有滑块验证码");
    const captchaChecks = await executePageFunction(tabId, "__gptAutoRegisterCheckCaptcha", {
      timeoutMs: 5000
    }, {
      allFrames: true
    });
    const captchaCheck = (Array.isArray(captchaChecks) ? captchaChecks : [captchaChecks])
      .filter(Boolean)
      .find((result) => result.hasCaptcha);
    let captchaSolved = false;
    if (captchaCheck) {
      logMessage("检测到滑块验证码，正在处理...");
      const captchaResults = await executePageFunction(tabId, "__gptAutoRegisterSolveCaptcha", {
        distance: 280,
        timeoutMs: 10000,
        onlyIfPresent: true
      }, {
        allFrames: true
      });
      const captchaResult = (Array.isArray(captchaResults) ? captchaResults : [captchaResults])
        .filter(Boolean)
        .find((result) => result.hasCaptcha || result.ok);
      if (captchaResult && captchaResult.ok) {
        captchaSolved = true;
        logMessage("滑块验证码已完成");
        await delay();
      } else {
        logMessage(`滑块验证码处理失败: ${captchaResult ? captchaResult.error : "未知错误"}`);
      }
    } else {
      logMessage("没有滑块")
    }

    logMessage("等待点击");
    try {
      await clickPageElement(tabId, {
        selector: '#createAccount, #startOnboardingFlow, button[data-atomic-wait-intent="Pay_With_Card"]',
        timeoutMs: 30000
      }, "PayPal 页面未找到提交按钮");
    } catch (error) {
      if (captchaSolved) {
        throw new PayPalCaptchaButtonNotFoundError(formatError(error));
      }
      throw error;
    }
    logMessage("点击了按钮");
    await delay();
    
    logMessage("等待插件邮箱输入框");
    const loginEmailResult = await executePageFunction(tabId, "__gptAutoRegisterSetValue", {
      selector: '#login_email, #onboardingFlowEmail',
      value: prepared.paypalEmail,
      type: true,
      timeoutMs: 10000
    });
    if (loginEmailResult && loginEmailResult.ok) {
      logMessage(`已输入 PayPal 邮箱: ${prepared.paypalEmail}`);
      try {
        await clickPageElement(tabId, {
          selector: "button",
          timeoutMs: 30000
        }, "PayPal 页面未找到下一步按钮");
      } catch (error) {
        logMessage("PayPal 下一步按钮未找到，跳过: " + formatError(error));
      }
    } else {
      logMessage("未找到 PayPal login_email，跳过邮箱输入");
    }
  }

  async function runPayPalSignupPage(tabId, prepared) {
    setActiveStep(5);
    logMessage("步骤5: 等待 PayPal signup 页面");
    await waitForUrlPrefix(tabId, "https://www.paypal.com/checkoutweb/signup", 120000);
    const stopCaptchaCleaner = startCaptchaCleaner(tabId, "#captchaComponent");
    try {
      while (true) {
        await fillPayPalSignupForm(tabId, prepared);
        await delay();

        const previousSmsCode = await fetchCurrentPhoneVerificationCode(prepared.phoneKey);
        logMessage(`提交前短信验证码基线: ${previousSmsCode || "null"}`);
        await submitSignupForm(tabId);
        logMessage("已提交 signup，等待短信验证码输入框");
        await refillSignupFormIfCleared(tabId, prepared);
        const otpReady = await waitForSmsOtpInput(tabId, 120000);
        if (otpReady) {
          prepared.previousSmsCode = previousSmsCode;
          break;
        }

        logMessage("未找到短信验证码输入框，可能手机号被风控，准备删除当前手机号并换新号码重试");
        const switched = await replaceRiskedSignupPhone(tabId, prepared);
        if (!switched) {
          throw new Error("未找到短信验证码输入框，已删除当前手机号，但手机区域没有可用的新手机号");
        }
      }
      const smsCode = await fetchPhoneVerificationCode(prepared.phoneKey, {
        tabId,
        previousCode: prepared.previousSmsCode
      });
      logMessage("开始输入短信验证码");
      await requirePageResult(tabId, "__gptAutoRegisterSetOtpDigits", {
        selectors: [
          "#ci-ciBasic-0",
          "#ci-ciBasic-1",
          "#ci-ciBasic-2",
          "#ci-ciBasic-3",
          "#ci-ciBasic-4",
          "#ci-ciBasic-5"
        ],
        value: smsCode,
        timeoutMs: 30000
      }, "短信验证码输入失败");
      logMessage(`短信验证码已输入: ${smsCode}`);
      if (prepared.randomCardEnabled) {
        await finishPayPalConsent(tabId, prepared);
      } else {
        await waitForChatGptReturn(tabId);
      }
    } finally {
      stopCaptchaCleaner();
    }
  }

  async function waitForSmsOtpInput(tabId, timeoutMs) {
    const result = await executePageFunction(tabId, "__gptAutoRegisterWaitForSelector", {
      selector: "#ci-ciBasic-0",
      timeoutMs
    });
    return Boolean(result && result.ok);
  }

  async function replaceRiskedSignupPhone(tabId, prepared) {
    const removed = await removeInvalidPhoneKeyInput(prepared, "PayPal 未出现短信验证码输入框，可能手机号被风控");
    await closePayPalRiskDialog(tabId);
    if (!removed) {
      return false;
    }

    const nextPhoneKey = await preparePhoneKeyForFlow(prepared.flowCountry);
    const nextPhone = nextPhoneKey && nextPhoneKey.phone ? nextPhoneKey.phone : "";
    if (!nextPhone) {
      return false;
    }

    prepared.phoneKey = nextPhoneKey;
    prepared.phone = nextPhone;
    state.phoneKey = nextPhoneKey;
    await persistState();
    logMessage(`已切换新手机号: ${nextPhone}`);
    return true;
  }

  async function closePayPalRiskDialog(tabId) {
    const results = await executePageFunction(tabId, "__gptAutoRegisterClick", {
      selector: 'button[title="Close"]',
      timeoutMs: 10000
    }, {
      allFrames: true
    });
    const result = (Array.isArray(results) ? results : [results]).find((item) => item && item.ok);
    if (result && result.ok) {
      logMessage('已点击 PayPal Close 按钮');
      await delay();
      return true;
    }
    logMessage('未找到 PayPal Close 按钮，继续尝试重填手机号');
    return false;
  }

  async function waitForChatGptReturn(tabId) {
    logMessage("未勾选随机生成卡片，跳过 PayPal Hermes 授权等待，直接等待返回 ChatGPT");
    const finalUrl = await waitForUrlExact(tabId, "https://chatgpt.com", 120000);
    logMessage(`支付流程成功，已进入 ChatGPT: ${finalUrl}`);
  }

  async function finishPayPalConsent(tabId, prepared) {
    logMessage("等待 PayPal Hermes 授权页面...");
    await waitForPayPalHermesPage(tabId, 120000);
    logMessage("已进入 Hermes 页面，等待点击授权按钮");
    await delay();
    await clickPageElement(tabId, {
      selector: "#consentButton",
      timeoutMs: 30000
    }, "未找到 PayPal 授权按钮 #consentButton");
    logMessage("已点击 PayPal 授权按钮，等待返回 ChatGPT");
    const finalUrl = await waitForChatGptOrPayPalGenericError(tabId, 120000);
    if (String(finalUrl || "").startsWith("https://www.paypal.com/checkoutweb/genericError")) {
      await removeInvalidPhoneKeyInput(prepared);
      throw new Error(`PayPal Hermes 授权失败，进入错误页面: ${finalUrl}`);
    }
    await delay(20000)
    const finalUrlAfterDelay = finalUrl.startsWith("https://chatgpt.com")
      ? finalUrl
      : await waitForUrlExact(tabId, "https://chatgpt.com", 120000);
    logMessage(`支付流程成功，已返回 ChatGPT: ${finalUrlAfterDelay}`);
  }

  function isPayPalMoneyFlowAccountsNewUrl(url) {
    try {
      const parsed = new URL(String(url || ""));
      if (!parsed.hostname.endsWith("paypal.com")) {
        return false;
      }
      const pathname = parsed.pathname.replace(/\/+$/, "");
      return pathname === "/myaccount/money/flow/accounts/new" ||
        pathname.endsWith("/myaccount/money/flow/accounts/new");
    } catch (_) {
      return false;
    }
  }

  function isPayPalGenericErrorUrl(url) {
    return String(url || "").startsWith("https://www.paypal.com/checkoutweb/genericError");
  }

  async function waitForPayPalHermesPage(tabId, timeoutMs) {
    logMessage("等待 PayPal 页面加载完成...");
    
    await delay(30000);
    const hermesPrefix = "https://www.paypal.com/webapps/hermes";
    const hermes2= "https://www.paypal.com/checkoutweb/billingwithoutpurchase"
    const start = Date.now();
    let lastLoggedUrl = "";
    let model =false
    let btn = false
    while (Date.now() - start < timeoutMs) {
      const tab = await ext.tabs.get(tabId);
      const url = String(tab.url || "");
      if (url.startsWith(hermesPrefix) || url.startsWith(hermes2)) {
        return url;
      }
      if (!btn &&isPayPalGenericErrorUrl(url) ) {
        logMessage("检测到 PayPal genericError 页面，点击 a.btn.full 继续");
        await requirePageResult(tabId, "__gptAutoRegisterClick", {
          selector: "a.btn.full",
          timeoutMs: 30000
        }, "未找到 PayPal genericError 继续按钮 a.btn.full");
        logMessage("已点击 PayPal genericError 继续按钮，继续等待 Hermes 页面");
        btn = true
        await delay(1000);
        continue;
      }
      if (!model && isPayPalMoneyFlowAccountsNewUrl(url)) {
        logMessage("检测到 PayPal money-flow 中间页，先关闭弹窗 #modalClose");
        await delay();
        await requirePageResult(tabId, "__gptAutoRegisterClick", {
          selector: "#modalClose",
          timeoutMs: 10000
        }, "未找到 PayPal money-flow 关闭按钮 #modalClose");
        logMessage("已点击 PayPal money-flow 关闭按钮，继续等待 Hermes 页面");
        model = true
        await delay(1000);
        continue;
      }
      await delay(1000);
    }
    logMessage('??????')
    throw new Error(`等待 URL 超时: ${hermesPrefix}`);
  }

  async function waitForChatGptOrPayPalGenericError(tabId, timeoutMs) {
    const errorPrefix = "https://www.paypal.com/checkoutweb/genericError";
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const tab = await ext.tabs.get(tabId);
      const url = String(tab.url || "");
      if (url.startsWith("https://chatgpt.com")) {
        return url;
      }
      if (url.startsWith(errorPrefix)) {
        return url;
      }
      await delay(1000);
    }
    throw new Error("等待 PayPal 授权结果超时");
  }

  async function fillPayPalSignupForm(tabId, prepared) {
    await ensureContentScript(tabId);
    await delay();
    const flowCountry = normalizeFlowCountry(prepared && prepared.flowCountry);
    logMessage(`步骤5: 判断国家是否是 ${flowCountry}`);
    const countrySelectors = normalizeSelectorList(
      prepared.settings && prepared.settings.countrySelector,
      DEFAULT_FILL_SETTINGS.countrySelector
    );
    const countryResult = await requirePageResult(tabId, "__gptAutoRegisterSetSelectIfNeeded", {
      selectors: countrySelectors,
      value: flowCountry,
      timeoutMs: 60000
    }, "未找到国家字段");
    if (countryResult.changed) {
      logMessage(`国家已改为 ${flowCountry}，等待 3 秒`);
      await delay();
    } else {
      logMessage(`步骤5: 国家为 ${flowCountry} 不用修改`);
    }

    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: "#email",
      value: prepared.paypalEmail,
      payUrlStyle: true,
      timeoutMs: 30000
    }, "未找到 signup 邮箱字段");
    logMessage(`手机号：${prepared.phone}`)
    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: "#phone",
      value: prepared.phone,
      payUrlStyle: true,
      timeoutMs: 30000
    }, "未找到手机号字段");
    await fillCurrentPage(tabId, prepared, createSignupFillOptions(prepared));
  }

  async function submitSignupForm(tabId) {
    await clickPageElement(tabId, {
      selector: 'button[type="submit"]',
      timeoutMs: 30000
    }, "未找到 signup 提交按钮");
  }

  async function refillSignupFormIfCleared(tabId, prepared) {
    const clearedFields = await getClearedSignupFields(tabId, prepared);
    if (!clearedFields.length) {
      return;
    }

    logMessage(`检测到 signup 表单数据被清空: ${clearedFields.join(", ")}，重新填入并提交`);
    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: "#email",
      value: prepared.paypalEmail,
      payUrlStyle: true,
      timeoutMs: 30000
    }, "未找到 signup 邮箱字段");
    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: "#phone",
      value: prepared.phone,
      payUrlStyle: true,
      timeoutMs: 30000
    }, "未找到手机号字段");
    await fillCurrentPage(tabId, prepared, createSignupFillOptions(prepared));
    await delay();
    await submitSignupForm(tabId);
    logMessage("signup 表单已重新提交");
  }

  async function getClearedSignupFields(tabId, prepared) {
    const cleared = [];
    const emailValue = await readFirstPageValue(tabId, "#email");
    if (emailValue !== null && String(emailValue || "").trim().toLowerCase() !== String(prepared.paypalEmail || "").trim().toLowerCase()) {
      cleared.push("邮箱");
    }

    const phoneValue = await readFirstPageValue(tabId, "#phone");
    if (phoneValue !== null && normalizeUsPhone(phoneValue) !== normalizeUsPhone(prepared.phone)) {
      cleared.push("手机号");
    }
    return cleared;
  }

  async function readFirstPageValue(tabId, selector) {
    const results = await executePageFunction(tabId, "__gptAutoRegisterGetValue", {
      selector
    }, {
      allFrames: true
    });
    const matched = (Array.isArray(results) ? results : [results])
      .filter(Boolean)
      .find((result) => result.ok);
    return matched ? String(matched.value || "") : null;
  }

  function startCaptchaCleaner(tabId, selector) {
    let stopped = false;
    let running = false;
    logMessage(`开始轮询移除 ${selector}`);

    const tick = async () => {
      if (stopped || running) {
        return;
      }
      running = true;
      try {
        const results = await executePageFunction(tabId, "__gptAutoRegisterRemoveAll", {
          selector
        }, {
          allFrames: true
        });
        const removed = (Array.isArray(results) ? results : [results])
          .filter(Boolean)
          .reduce((sum, result) => sum + Number(result.removed || 0), 0);
        if (removed > 0) {
          logMessage(`已移除 ${selector}: ${removed} 个`);
        }
      } catch (error) {
        console.warn("Failed to remove captcha component", error);
      } finally {
        running = false;
      }
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => {
      stopped = true;
      clearInterval(intervalId);
      logMessage(`停止轮询移除 ${selector}`);
    };
  }

  async function updateTabUrl(tabId, url) {
    const tab = await ext.tabs.get(tabId);
    if (!String(tab.url || "").startsWith(url)) {
      const preparedUserAgent = await prepareRandomUserAgentForTab(tabId, url);
      await ext.tabs.update(tabId, { url, active: true });
      logTabUserAgentAfterNavigation(tabId, preparedUserAgent, "更新标签页 URL");
    }
    const loaded = await waitForPageComplete(tabId, 45000);
    if (!loaded) {
      logMessage("页面仍在加载，继续尝试执行第3步脚本");
      await delay(1500);
    }
  }

  async function waitForUrlPrefix(tabId, prefix, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const tab = await ext.tabs.get(tabId);
      if (String(tab.url || "").startsWith(prefix)) {
        return tab.url;
      }
      await delay(1000);
    }
    throw new Error(`等待 URL 超时: ${prefix}`);
  }

  async function waitForUrlExact(tabId, expectedUrl, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const tab = await ext.tabs.get(tabId);
      if (String(tab.url || "") === expectedUrl) {
        return tab.url;
      }
      await delay(1000);
    }
    throw new Error(`绛夊緟 URL 瓒呮椂: ${expectedUrl}`);
  }

  async function waitForPageComplete(tabId, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const tab = await ext.tabs.get(tabId);
        let readyState = "";
        try {
          const readyStateResults = await executeContentFunctionRaw(tabId, "__gptAutoRegisterGetReadyState", {}, {}, "读取页面 readyState");
          const readyStateResult = Array.isArray(readyStateResults) ? readyStateResults[0] : readyStateResults;
          readyState = String(readyStateResult && readyStateResult.readyState || "");
        } catch (_) {}
        if ((!tab.status || tab.status === "complete") && (!readyState || readyState === "complete")) {
          return true;
        }
      } catch (_) {}
      await delay(500);
    }
    return false;
  }

  async function executePageFunction(tabId, functionName, payload, options = {}) {
    await waitForScriptableTab(tabId, Number(options.scriptableTimeoutMs) || 15000);
    const loaded = await waitForPageComplete(tabId, Number(options.loadTimeoutMs) || 45000);
    if (!loaded) {
      logMessage(`${functionName || "页面函数"}: 页面仍在加载，继续尝试调用`);
    }
    const results = await executeContentFunctionRaw(tabId, functionName, payload, options, functionName);
    return options.allFrames ? results : (Array.isArray(results) ? results[0] : results);
  }

  function storageSet(values) {
    const result = ext.storage.local.set(values);
    if (result && typeof result.then === "function") {
      return result;
    }
    return new Promise((resolve) => ext.storage.local.set(values, resolve));
  }

  function storageRemove(key) {
    const result = ext.storage.local.remove(key);
    if (result && typeof result.then === "function") {
      return result;
    }
    return new Promise((resolve) => ext.storage.local.remove(key, resolve));
  }

  async function executeContentFunctionRaw(tabId, functionName, payload, options = {}, label = "") {
    const callId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await storageSet({
      [CONTENT_CALL_STORAGE_KEY]: {
        id: callId,
        functionName,
        payload: payload || {}
      }
    });
    try {
      const details = {
        allFrames: Boolean(options.allFrames),
        runAt: "document_idle"
      };
      await executeScriptWithRetry(tabId, {
        ...details,
        file: "content-script.js"
      }, `${label || functionName || "页面函数"} content-script`);
      return await executeScriptWithRetry(tabId, {
        ...details,
        file: "content-call-runner.js"
      }, label || functionName || "页面函数");
    } finally {
      try {
        await storageRemove(CONTENT_CALL_STORAGE_KEY);
      } catch (_) {}
    }
  }

  async function executeScriptAfterPageReady(tabId, details, label, options = {}) {
    await waitForScriptableTab(tabId, Number(options.scriptableTimeoutMs) || 15000);
    const loaded = await waitForPageComplete(tabId, Number(options.loadTimeoutMs) || 45000);
    if (!loaded) {
      logMessage(`${label || "页面脚本"}: 页面仍在加载，继续尝试注入`);
    }
    return executeScriptWithRetry(tabId, details, label);
  }

  async function waitForScriptableTab(tabId, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const tab = await ext.tabs.get(tabId);
        const url = String(tab.url || "");
        if (url && !url.startsWith("about:") && !url.startsWith("moz-extension:")) {
          return tab;
        }
      } catch (_) {}
      await delay(500);
    }
    return ext.tabs.get(tabId);
  }

  async function executeScriptWithRetry(tabId, details, label) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await ext.tabs.executeScript(tabId, details);
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await delay(1000);
        }
      }
    }

    let url = "";
    try {
      const tab = await ext.tabs.get(tabId);
      url = String(tab.url || "");
    } catch (_) {}
    throw new Error(`${label || "页面脚本"} 执行失败: ${formatError(lastError)}${url ? `，当前 URL: ${url}` : ""}`);
  }

  async function scrollTabToBottom(tabId) {
    try {
      await executePageFunction(tabId, "__gptAutoRegisterScrollToBottom", {}, {
        loadTimeoutMs: 15000
      });
    } catch (_) {}
  }

  async function clickPageElement(tabId, payload, errorMessage) {
    await scrollTabToBottom(tabId);
    return requirePageResult(tabId, "__gptAutoRegisterClick", payload, errorMessage);
  }

  async function requirePageResult(tabId, functionName, payload, errorMessage, options = {}) {
    const result = await executePageFunction(tabId, functionName, payload, options);
    if (Array.isArray(result)) {
      const successful = result.find((item) => item && item.ok);
      if (successful) {
        return successful;
      }
      const failed = result.find((item) => item && item.error);
      throw new Error((failed && failed.error) || errorMessage);
    }
    if (!result || !result.ok) {
      throw new Error((result && result.error) || errorMessage);
    }
    return result;
  }

  function createPayUrlFillOptions(prepared, inputOptions = {}) {
    const options = {
      payUrlStyle: true,
      skipFields: ["password"]
    };
    if (inputOptions && inputOptions.type) {
      options.type = true;
      options.typeDelayMinMs = 140;
      options.typeDelayMaxMs = 320;
    }
    if (prepared && normalizeFlowCountry(prepared.flowCountry) === "JP") {
      options.countryOverrides = createJapanPayUrlOverrides();
    }
    return options;
  }

  function createSignupFillOptions(prepared) {
    const options = {
      ...createPayUrlFillOptions(prepared),
      skipFields: ["country"]
    };
    if (prepared && normalizeFlowCountry(prepared.flowCountry) === "JP") {
      options.countryOverrides = createJapanSignupOverrides();
    }
    return options;
  }

  function createJapanPayUrlOverrides() {
    return {
      country: "JP",
      billingPostalCode: "150-0002",
      billingAdministrativeArea: "京都府",
      billingCity: "京都市",
      billingLine1: "渋谷2丁目21番1号"
    };
  }

  function createJapanSignupOverrides() {
    return {
      country: "JP",
      billingPostalCode: "150-0002",
      billingState: "京都府",
      billingLine1: "渋谷2丁目21番1号",
      billingCity: "京都市",
      dateOfBirth: "1991/10/28",
      firstName: "ミン",
      lastName: "リー",
      countrySpecificFirstName: "タロウ",
      countrySpecificLastName: "ヤマダ"
    };
  }

  async function fillCurrentPage(tabId, prepared, fillOptions = {}) {
    const probes = await executePageFunction(tabId, "__gptAutoRegisterProbe", {}, {
      allFrames: true
    });
    const result = await executePageFunction(tabId, "__gptAutoRegisterFillForm", {
      card: prepared.card,
      phone: prepared.phone,
      settings: prepared.settings,
      fillOptions
    }, {
      allFrames: true
    });
    const summary = summarizeFillResults(result, probes);
    // if (!summary.success) {
    //   throw new Error(summary.message);
    // }
    if (summary.missing.length) {
      logMessage(`已填充 ${summary.filled} 项，未找到: ${summary.missing.join(", ")}`);
    } else {
      logMessage(`已填充 ${summary.filled} 项`);
    }
  }

  async function ensureContentScript(tabId, allFrames = false) {
    try {
      await executeScriptAfterPageReady(tabId, {
        file: "content-script.js",
        allFrames,
        runAt: "document_idle"
      }, "content-script 注入");
    } catch (error) {
      logMessage("注入 content-script 失败: " + formatError(error));
    }
  }

  function summarizeFillResults(results, probes) {
    const validResults = (Array.isArray(results) ? results : [results]).filter(Boolean);
    const successful = validResults.filter((result) => result && result.ok);
    if (!successful.length) {
      const errors = validResults
        .filter((result) => result && result.error)
        .map((result) => result.error);
      const probeResults = (Array.isArray(probes) ? probes : [probes]).filter(Boolean);
      const loadedFrames = probeResults.filter((probe) => probe && probe.ok);
      const inputCount = loadedFrames.reduce((sum, probe) => sum + Number(probe.inputs || 0), 0);
      const missing = validResults
        .flatMap((result) => result && Array.isArray(result.missing) ? result.missing : [])
        .slice(0, 6);
      if (!loadedFrames.length) {
        return {
          success: false,
          filled: 0,
          missing: [],
          message: "content-script 未在当前页面或 iframe 中加载成功，请刷新页面或重新加载扩展后重试"
        };
      }
      return {
        success: false,
        filled: 0,
        missing: [],
        message: errors[0] || `content-script 已加载 ${loadedFrames.length} 个 frame，扫描到 ${inputCount} 个输入控件，但没有匹配到可填充字段${missing.length ? `；未命中: ${missing.join(", ")}` : ""}`
      };
    }

    const aggregate = successful.reduce((acc, result) => {
      acc.filled += Number(result.filled || 0);
      (result.missing || []).forEach((selector) => acc.missing.add(selector));
      return acc;
    }, { filled: 0, missing: new Set() });

    return {
      success: true,
      filled: aggregate.filled,
      missing: Array.from(aggregate.missing),
      message: ""
    };
  }

  async function fetchPhoneVerificationCode(phoneKey, options = {}) {
    if (phoneKey && phoneKey.provider === "oapi") {
      return fetchOapiPhoneVerificationCode(phoneKey, options);
    }
    if (phoneKey && phoneKey.country === "JP") {
      return fetchJapanLegacyPhoneVerificationCode(phoneKey, options);
    }
    const seenCodes = createSeenSmsCodes(phoneKey, options.previousCode);
    let lastError = "";
    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
      const result = await fetchCurrentPhoneVerificationCodeResult(phoneKey);
      if (result.code) {
        const isNewCode = !seenCodes.has(result.code);
        logObservedSmsCode(phoneKey, result.code);
        seenCodes.add(result.code);
        if (isNewCode) {
          state.lastPhoneCode = result.code;
          await persistState();
          return result.code;
        }
        lastError = `验证码 ${result.code} 与提交前验证码重复，继续等待新验证码`;
      } else {
        lastError = result.error || "没有匹配到 6 位验证码";
      }
      if (attempt < POLL_ATTEMPTS) {
        logMessage(`第 ${attempt}/${POLL_ATTEMPTS} 次未取到新短信码，继续轮询: ${lastError}`);
        await delay(POLL_DELAY_MS);
      }
    }
    throw new Error(`获取短信验证码失败，已轮询 ${POLL_ATTEMPTS} 次: ${lastError || "没有匹配到 6 位验证码"}`);
  }

  async function fetchJapanLegacyPhoneVerificationCode(phoneKey, options = {}) {
    const seenCodes = createSeenSmsCodes(phoneKey, options.previousCode);
    let lastError = "";

    async function pollJapanLegacySmsCode(roundLabel) {
      for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
        const result = await fetchCurrentPhoneVerificationCodeResult(phoneKey);
        if (result.code) {
          const isNewCode = !seenCodes.has(result.code);
          logObservedSmsCode(phoneKey, result.code);
          seenCodes.add(result.code);
          if (isNewCode) {
            state.lastPhoneCode = result.code;
            await persistState();
            return result.code;
          }
          lastError = `验证码 ${result.code} 与提交前验证码重复，继续等待新验证码`;
        } else {
          lastError = result.error || "没有匹配到 6 位验证码";
        }
        if (attempt < POLL_ATTEMPTS) {
          logMessage(`日本短信${roundLabel}第 ${attempt}/${POLL_ATTEMPTS} 次未取到新验证码，继续轮询: ${lastError}`);
          await delay(POLL_DELAY_MS);
        }
      }
      return null;
    }

    const firstCode = await pollJapanLegacySmsCode("");
    if (firstCode) {
      return firstCode;
    }

    await clickJapanSmsResendButton(options.tabId);

    const resentCode = await pollJapanLegacySmsCode("重发后");
    if (resentCode) {
      return resentCode;
    }

    throw new Error(`获取日本短信验证码失败，重发前后各轮询 ${POLL_ATTEMPTS} 次: ${lastError || "没有匹配到新验证码"}`);
  }

  async function clickJapanSmsResendButton(tabId) {
    if (!tabId) {
      throw new Error("获取日本短信验证码失败，首次轮询未取到验证码，且缺少 tabId，无法点击重发按钮");
    }
    logMessage("日本短信首次轮询未获取到验证码，点击重发按钮后继续轮询");
    await clickPageElement(tabId, {
      selector: 'button[data-testid="resend-link"]',
      timeoutMs: 30000
    }, '未找到短信验证码重发按钮 button[data-testid="resend-link"]');
    logMessage("已点击短信验证码重发按钮，继续轮询验证码");
  }

  async function fetchOapiPhoneVerificationCode(phoneKey, options = {}) {
    const code = String(phoneKey && phoneKey.code || "").trim();
    if (!code) {
      throw new Error("日本短信 CDK 为空");
    }
    const seenCodes = createSeenSmsCodes(phoneKey, options.previousCode);
    let lastError = "";
    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
      const result = await fetchCurrentPhoneVerificationCodeResult(phoneKey);
      if (result.code) {
        const isNewCode = !seenCodes.has(result.code);
        logObservedSmsCode(phoneKey, result.code);
        seenCodes.add(result.code);
        if (isNewCode) {
          state.lastPhoneCode = result.code;
          await persistState();
          return result.code;
        }
        lastError = `验证码 ${result.code} 与提交前验证码重复，继续等待新验证码`;
      } else {
        lastError = result.error || "日本短信响应里没有匹配到 6 位验证码";
      }
      if (attempt < POLL_ATTEMPTS) {
        logMessage(`日本短信第 ${attempt}/${POLL_ATTEMPTS} 次未取到新验证码，继续轮询: ${lastError}`);
        await delay(POLL_DELAY_MS);
      }
    }
    throw new Error(`获取日本短信验证码失败，已轮询 ${POLL_ATTEMPTS} 次: ${lastError || "没有匹配到 6 位验证码"}`);
  }

  async function fetchCurrentPhoneVerificationCode(phoneKey) {
    const result = await fetchCurrentPhoneVerificationCodeResult(phoneKey);
    return result.code || null;
  }

  async function fetchCurrentPhoneVerificationCodeResult(phoneKey) {
    if (phoneKey && phoneKey.provider === "oapi") {
      return fetchCurrentOapiPhoneVerificationCodeResult(phoneKey);
    }
    try {
      const response = await fetch(phoneKey.smsUrl, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "text/plain,application/json,text/html,*/*" }
      });
      const body = await response.text();
      const code = extractSmsCodeFromResponseBody(phoneKey, body);
      if (response.ok && code) {
        return { code, error: "" };
      }
      return {
        code: "",
        error: response.ok ? "响应里没有匹配到 6 位验证码" : `HTTP ${response.status} ${body.slice(0, 120)}`
      };
    } catch (error) {
      return { code: "", error: formatError(error) };
    }
  }

  async function fetchCurrentOapiPhoneVerificationCodeResult(phoneKey) {
    const code = String(phoneKey && phoneKey.code || "").trim();
    if (!code) {
      return { code: "", error: "日本短信 CDK 为空" };
    }
    try {
      const payload = await postOapiSms("get_sms", { code });
      const smsCode = String((payload && (payload.code || payload.sms)) || "").trim();
      const matchedCode = extractSixDigitCode(smsCode);
      if (payload && payload.ok && matchedCode) {
        return { code: matchedCode, error: "" };
      }
      return {
        code: "",
        error: payload && payload.error ? payload.error : "日本短信响应里没有匹配到 6 位验证码"
      };
    } catch (error) {
      return { code: "", error: formatError(error) };
    }
  }

  function createSeenSmsCodes(phoneKey, previousCode = null) {
    const codes = [];
    const normalizedPreviousCode = String(previousCode || "").trim();
    if (normalizedPreviousCode) {
      codes.push(normalizedPreviousCode);
    }
    return new Set(codes);
  }

  function logObservedSmsCode(phoneKey, code) {
    if (!phoneKey) {
      return;
    }
    if (!Array.isArray(phoneKey.smsCodeHistory)) {
      phoneKey.smsCodeHistory = [];
    }
    const normalizedCode = String(code || "").trim();
    phoneKey.smsCodeHistory.push({
      code: normalizedCode,
      checkedAt: new Date().toISOString()
    });
    const last = phoneKey.smsCodeHistory[phoneKey.smsCodeHistory.length - 2];
    if (last && String(last.code || "") === normalizedCode) {
      logMessage(`短信验证码记录: ${normalizedCode}，与上一次重复`);
    } else {
      logMessage(`短信验证码记录: ${normalizedCode}`);
    }
  }

  async function parseCardInput(rawInput) {
    const text = String(rawInput || "").trim();
    const parts = text.split("----").map((part) => part.trim());
    if (parts.length !== 6 && parts.length !== 7) {
      throw new Error("卡片格式错误，必须是 card----年/月----cvv----url----name----address,city state postcode,US");
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
    const firstName = extractFirstName(name);
    const lastName = extractLastName(name);
    const billingName = [firstName, lastName].filter(Boolean).join(" ");

    const parsed = {
      card: normalizedCard,
      year: expiryInfo.year,
      month: expiryInfo.month,
      cvv,
      phone: normalizeUsPhone(phone),
      url,
      name,
      billingName,
      firstName,
      lastName,
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
      throw new Error(`卡片字段为空: ${missing.join(", ")}`);
    }
    return parsed;
  }

  function generateRandomLuhnCardNumber(sourceCard) {
    const normalizedSource = String(sourceCard || "").replace(/\D+/g, "");
    const length = normalizedSource.length || 16;
    if (length < 2) {
      throw new Error("卡号长度太短，无法生成 Luhn 校验位");
    }

    const bodyLength = length - 1;
    const prefixLength = Math.min(Math.max(6, bodyLength - 10), bodyLength);
    const prefix = normalizedSource.slice(0, prefixLength).padEnd(prefixLength, "0");
    let body = prefix;
    while (body.length < bodyLength) {
      body += String(randomDigit());
    }
    return body + calculateLuhnCheckDigit(body);
  }

  function calculateLuhnCheckDigit(body) {
    const digits = String(body || "").replace(/\D+/g, "");
    let sum = 0;
    let shouldDouble = true;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let digit = Number(digits[i]);
      if (!Number.isInteger(digit)) {
        throw new Error("卡号包含非数字字符，无法计算 Luhn 校验位");
      }
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return String((10 - (sum % 10)) % 10);
  }

  function randomDigit() {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      const value = new Uint8Array(1);
      cryptoObj.getRandomValues(value);
      return value[0] % 10;
    }
    return Math.floor(Math.random() * 10);
  }

  async function generateRandomCardInputNumber() {
    const cardInput = document.getElementById("cardInput");
    const rawInput = String(cardInput && cardInput.value || "");
    const lines = rawInput.split(/\r?\n/);
    const firstIndex = lines.findIndex((line) => String(line || "").trim());
    if (firstIndex < 0) {
      throw new Error("请输入卡片信息后再生成随机卡号");
    }

    const originalLine = String(lines[firstIndex] || "");
    const parts = originalLine.split("----");
    if (parts.length !== 6 && parts.length !== 7) {
      throw new Error("卡片格式错误，必须是 card----年/月----cvv----url----name----address,city state postcode,US");
    }

    const originalCard = String(parts[0] || "").trim();
    const generatedCard = generateRandomLuhnCardNumber(originalCard);
    parts[0] = generatedCard;
    lines[firstIndex] = parts.join("----");
    cardInput.value = lines.join("\n");
    await persistState();
    logMessage(`已生成随机 Luhn 有效卡号并写入卡片信息: ${generatedCard}`);
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
    const addressParts = rsplit(addressBlob, ",", 2).map((part) => part.trim());
    if (addressParts.length !== 3) {
      throw new Error("地址格式错误，必须是 address,city state postcode,US");
    }
    const [address, cityStatePostcode, country] = addressParts;
    const normalizedCityBlob = String(cityStatePostcode || "").replace(/\s+/g, " ").trim();
    const withStateMatch = normalizedCityBlob.match(/^(?<city>.+?)\s+(?<state>[A-Za-z]{2})\s+(?<postcode>\d{5}(?:-\d{4})?)$/);
    const withoutStateMatch = normalizedCityBlob.match(/^(?<city>.+?)\s+(?<postcode>\d{5}(?:-\d{4})?)$/);

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

  function rsplit(value, separator, limit) {
    const parts = String(value).split(separator);
    if (parts.length <= limit + 1) {
      return parts;
    }
    const head = parts.slice(0, parts.length - limit).join(separator);
    return [head].concat(parts.slice(parts.length - limit));
  }

  function normalizeCountry(country) {
    return String(country || "").trim().toUpperCase();
  }

  function normalizeUsPostcode(postcode) {
    const normalized = String(postcode || "").trim();
    const matched = normalized.match(/^(\d{5})(?:-\d{4})?$/);
    if (!matched) {
      throw new Error(`无效的美国邮编: ${postcode}`);
    }
    return matched[1];
  }

  async function lookupUsStateFromPostcode(postcode) {
    const zip5 = normalizeUsPostcode(postcode);
    const prefix = Number(zip5.slice(0, 3));
    const ranges = await ensureUsZip3StateRanges();
    const matched = ranges.find((item) => prefix >= item.start && prefix <= item.end);
    if (!matched) {
      throw new Error(`无法根据美国邮编匹配州: ${postcode}`);
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
          throw new Error(`读取美国邮编映射失败: ${formatError(error)}`);
        });
    }
    return usZip3StateRangesPromise;
  }

  function pickRandomPhoneKey(rawInput, options = {}) {
    const allowEmpty = Boolean(options.allowEmpty);
    const text = String(rawInput || "").trim();
    if (!text) {
      if (allowEmpty) {
        return null;
      }
      return parsePhoneKeyInput(rawInput, options);
    }
    const phoneKeys = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parsePhoneKeyInput(line));
    if (!phoneKeys.length) {
      return null;
    }
    return phoneKeys[Math.floor(Math.random() * phoneKeys.length)];
  }

  async function preparePhoneKeyForFlow(flowCountry) {
    if (normalizeFlowCountry(flowCountry) === "JP") {
      const cdk = pickRandomJpSmsCdk();
      if (cdk) {
        return fetchJapanPhoneKey(cdk);
      }
      return pickRandomJapanPhoneKeyFromPhoneInput();
    }
    const phoneInput = document.getElementById("phoneKeyInput");
    state.phoneKeyInput = phoneInput ? phoneInput.value.trim() : "";
    return pickRandomPhoneKey(state.phoneKeyInput);
  }

  function pickRandomJapanPhoneKeyFromPhoneInput() {
    const phoneInput = document.getElementById("phoneKeyInput");
    state.phoneKeyInput = phoneInput ? phoneInput.value.trim() : "";
    const text = String(state.phoneKeyInput || "").trim();
    if (!text) {
      throw new Error("日本短信 CDK 为空，请在日本短信 CDK 输入框填写 CDK，或在手机区域填写 phone----smsUrl");
    }
    const phoneKeys = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseJapanPhoneKeyInput(line));
    if (!phoneKeys.length) {
      throw new Error("手机区域没有可用的日本手机号记录");
    }
    const picked = phoneKeys[Math.floor(Math.random() * phoneKeys.length)];
    logMessage(`日本短信使用手机区域记录: ${picked.phone}`);
    return picked;
  }

  async function fetchJapanPhoneKey(cdk) {
    const code = String(cdk || "").trim();
    if (!code) {
      throw new Error("请输入日本短信 CDK");
    }
    const payload = await postOapiSms("check_cdk", { code });
    if (!payload || !payload.ok) {
      throw new Error(payload && payload.error ? payload.error : "日本短信 CDK 校验失败");
    }
    const session = payload.session || {};
    const phone = String(session.phone_number || "").trim();
    if (!phone) {
      throw new Error("日本短信接口未返回手机号");
    }
    logMessage(`日本短信手机号获取成功: ${phone}，CDK: ${maskSmsCdk(code)}`);
    return {
      provider: "oapi",
      raw: code,
      code,
      phone,
      countryCode: String(payload.cdk && payload.cdk.country_code || "+81").trim(),
      sessionId: session.id || null,
      status: String(session.status || "").trim()
    };
  }

  function maskSmsCdk(cdk) {
    const value = String(cdk || "").trim();
    if (value.length <= 8) {
      return value ? "***" : "";
    }
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
  }

  async function postOapiSms(action, body) {
    const url = `${OAPI_SMS_API}?action=${action}`;
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    });
    const payload = await readJsonResponse(response, "日本短信接口");
    if (!response.ok) {
      throw new Error(payload && payload.error ? payload.error : `HTTP ${response.status}`);
    }
    return payload;
  }

  function parsePhoneKeyInput(rawInput, options = {}) {
    const allowEmpty = Boolean(options.allowEmpty);
    const text = String(rawInput || "").trim();
    if (!text) {
      if (allowEmpty) {
        return null;
      }
      throw new Error("请先输入手机区域");
    }

    const parts = text.split("|");
    if (parts.length !== 2) {
      throw new Error("手机区域格式错误，必须是 +14484490908|http://a.62-us.com/api/get_sms?key=...");
    }
    const rawPhone = String(parts[0] || "").trim();
    const smsUrl = String(parts[1] || "").trim();
    if (!rawPhone || !smsUrl) {
      throw new Error("手机区域格式错误，手机号和短信地址都不能为空");
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
      provider: "legacy",
      country: "JP",
      raw: text,
      rawPhone,
      phone,
      smsUrl: parsedUrl.toString()
    };
  }

  function parseJapanPhoneKeyInput(rawInput) {
    const text = String(rawInput || "").trim();
    const parts = text.split("----");
    if (parts.length !== 2) {
      throw new Error("日本手机区域格式错误，必须是 7092756860----https://...");
    }
    const rawPhone = String(parts[0] || "").trim();
    const smsUrl = String(parts[1] || "").trim();
    if (!rawPhone || !smsUrl) {
      throw new Error("日本手机区域格式错误，手机号和短信地址都不能为空");
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(smsUrl);
    } catch (error) {
      throw new Error("日本短信地址不是有效 URL");
    }
    if (!/^https?:$/i.test(parsedUrl.protocol)) {
      throw new Error("日本短信地址只支持 http 或 https");
    }
    const phone = rawPhone.replace(/\D+/g, "");
    if (!/^\d{8,15}$/.test(phone)) {
      throw new Error("日本手机号格式不正确");
    }
    return {
      provider: "legacy",
      raw: text,
      rawPhone,
      phone,
      smsUrl: parsedUrl.toString()
    };
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
    const rawPhoneInput = String(document.getElementById("phoneKeyInput").value || "").trim();
    if (rawPhoneInput) {
      try {
        const phoneKey = pickRandomPhoneKey(rawPhoneInput, { allowEmpty: true });
        if (phoneKey && phoneKey.phone) {
          state.phoneKey = phoneKey;
          state.phoneKeyInput = rawPhoneInput;
          return phoneKey.phone;
        }
      } catch (error) {
        console.warn("Failed to parse phone key for fill", error);
      }
    }
    return normalizeUsPhone(card && card.phone ? card.phone : "");
  }

  function extractSixDigitCode(text) {
    const match = String(text || "").match(/(?:^|\D)(\d{6})(?!\d)/);
    return match ? match[1] : "";
  }

  function extractSmsCodeFromResponseBody(phoneKey, body) {
    if (isEduaiEasySmsUrl(phoneKey && phoneKey.smsUrl)) {
      return extractEduaiEasyMessageCode(body);
    }
    return extractSixDigitCode(body);
  }

  function isEduaiEasySmsUrl(smsUrl) {
    try {
      const url = new URL(String(smsUrl || ""));
      return url.hostname.toLowerCase() === "s.eduaieasy.indevs.in";
    } catch (_) {
      return false;
    }
  }

  function extractEduaiEasyMessageCode(body) {
    try {
      const payload = JSON.parse(String(body || ""));
      return extractSixDigitCode(payload && payload.message);
    } catch (_) {
      return extractSixDigitCode("");
    }
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

  function createDefaultFillSettings() {
    return {
      phoneSelector: DEFAULT_FILL_SETTINGS.phoneSelector.slice(),
      cardNumberSelector: DEFAULT_FILL_SETTINGS.cardNumberSelector.slice(),
      cardExpirySelector: DEFAULT_FILL_SETTINGS.cardExpirySelector.slice(),
      cardCvvSelector: DEFAULT_FILL_SETTINGS.cardCvvSelector.slice(),
      billingNameSelector: DEFAULT_FILL_SETTINGS.billingNameSelector.slice(),
      firstNameSelector: DEFAULT_FILL_SETTINGS.firstNameSelector.slice(),
      lastNameSelector: DEFAULT_FILL_SETTINGS.lastNameSelector.slice(),
      billingLine1Selector: DEFAULT_FILL_SETTINGS.billingLine1Selector.slice(),
      billingCitySelector: DEFAULT_FILL_SETTINGS.billingCitySelector.slice(),
      billingStateSelector: DEFAULT_FILL_SETTINGS.billingStateSelector.slice(),
      billingPostalCodeSelector: DEFAULT_FILL_SETTINGS.billingPostalCodeSelector.slice(),
      countrySelector: DEFAULT_FILL_SETTINGS.countrySelector.slice(),
      passwordSelector: DEFAULT_FILL_SETTINGS.passwordSelector.slice(),
      passwordValue: DEFAULT_FILL_SETTINGS.passwordValue
    };
  }

  function normalizeSelectorList(value, fallback) {
    const fallbackList = Array.isArray(fallback) ? fallback : [String(fallback || ""), ""];
    const rawList = Array.isArray(value) ? value : value ? [value] : [];
    const normalized = [0, 1].map((index) => {
      const candidate = index < rawList.length ? rawList[index] : "";
      return String(candidate || fallbackList[index] || "").trim();
    });
    if (!normalized[0]) {
      normalized[0] = String(fallbackList[0] || "").trim();
    }
    return normalized;
  }

  function sanitizeFillSettings(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    return {
      phoneSelector: normalizeSelectorList(input.phoneSelector, DEFAULT_FILL_SETTINGS.phoneSelector),
      cardNumberSelector: normalizeSelectorList(input.cardNumberSelector, DEFAULT_FILL_SETTINGS.cardNumberSelector),
      cardExpirySelector: normalizeSelectorList(input.cardExpirySelector, DEFAULT_FILL_SETTINGS.cardExpirySelector),
      cardCvvSelector: normalizeSelectorList(input.cardCvvSelector, DEFAULT_FILL_SETTINGS.cardCvvSelector),
      billingNameSelector: normalizeSelectorList(input.billingNameSelector, DEFAULT_FILL_SETTINGS.billingNameSelector),
      firstNameSelector: normalizeSelectorList(input.firstNameSelector, DEFAULT_FILL_SETTINGS.firstNameSelector),
      lastNameSelector: normalizeSelectorList(input.lastNameSelector, DEFAULT_FILL_SETTINGS.lastNameSelector),
      billingLine1Selector: normalizeSelectorList(input.billingLine1Selector, DEFAULT_FILL_SETTINGS.billingLine1Selector),
      billingCitySelector: normalizeSelectorList(input.billingCitySelector, DEFAULT_FILL_SETTINGS.billingCitySelector),
      billingStateSelector: normalizeSelectorList(input.billingStateSelector, DEFAULT_FILL_SETTINGS.billingStateSelector),
      billingPostalCodeSelector: normalizeSelectorList(input.billingPostalCodeSelector, DEFAULT_FILL_SETTINGS.billingPostalCodeSelector),
      countrySelector: normalizeSelectorList(input.countrySelector, DEFAULT_FILL_SETTINGS.countrySelector),
      passwordSelector: normalizeSelectorList(input.passwordSelector, DEFAULT_FILL_SETTINGS.passwordSelector),
      passwordValue: String(input.passwordValue || DEFAULT_FILL_SETTINGS.passwordValue).trim() || DEFAULT_FILL_SETTINGS.passwordValue
    };
  }

  function bindFillSettingsInputs() {
    const entries = [
      ["phoneSelectorInput", "phoneSelector", 0],
      ["phoneSelectorAltInput", "phoneSelector", 1],
      ["cardNumberSelectorInput", "cardNumberSelector", 0],
      ["cardNumberSelectorAltInput", "cardNumberSelector", 1],
      ["cardExpirySelectorInput", "cardExpirySelector", 0],
      ["cardExpirySelectorAltInput", "cardExpirySelector", 1],
      ["cardCvvSelectorInput", "cardCvvSelector", 0],
      ["cardCvvSelectorAltInput", "cardCvvSelector", 1],
      ["billingNameSelectorInput", "billingNameSelector", 0],
      ["billingNameSelectorAltInput", "billingNameSelector", 1],
      ["firstNameSelectorInput", "firstNameSelector", 0],
      ["firstNameSelectorAltInput", "firstNameSelector", 1],
      ["lastNameSelectorInput", "lastNameSelector", 0],
      ["lastNameSelectorAltInput", "lastNameSelector", 1],
      ["billingLine1SelectorInput", "billingLine1Selector", 0],
      ["billingLine1SelectorAltInput", "billingLine1Selector", 1],
      ["billingCitySelectorInput", "billingCitySelector", 0],
      ["billingCitySelectorAltInput", "billingCitySelector", 1],
      ["billingStateSelectorInput", "billingStateSelector", 0],
      ["billingStateSelectorAltInput", "billingStateSelector", 1],
      ["billingPostalCodeSelectorInput", "billingPostalCodeSelector", 0],
      ["billingPostalCodeSelectorAltInput", "billingPostalCodeSelector", 1],
      ["countrySelectorInput", "countrySelector", 0],
      ["countrySelectorAltInput", "countrySelector", 1],
      ["passwordSelectorInput", "passwordSelector", 0],
      ["passwordSelectorAltInput", "passwordSelector", 1],
      ["passwordValueInput", "passwordValue"]
    ];

    entries.forEach(([elementKey, stateKey, selectorIndex]) => {
      const element = document.getElementById(elementKey);
      element.addEventListener("input", () => {
        if (typeof selectorIndex === "number") {
          const nextSelectors = normalizeSelectorList(state.fillSettings[stateKey], DEFAULT_FILL_SETTINGS[stateKey]);
          nextSelectors[selectorIndex] = String(element.value || "").trim();
          state.fillSettings[stateKey] = nextSelectors;
        } else {
          state.fillSettings[stateKey] = String(element.value || "").trim();
        }
        persistState();
      });
    });
  }

  function renderFillSettings() {
    const settings = sanitizeFillSettings(state.fillSettings);
    state.fillSettings = settings;
    document.getElementById("fillSettingsPanel").hidden = !state.fillSettingsExpanded;
    document.getElementById("toggleFillSettingsButton").setAttribute("aria-expanded", String(state.fillSettingsExpanded));
    document.getElementById("toggleFillSettingsButton").textContent = state.fillSettingsExpanded ? "收起" : "设置";
    document.getElementById("phoneSelectorInput").value = settings.phoneSelector[0];
    document.getElementById("phoneSelectorAltInput").value = settings.phoneSelector[1];
    document.getElementById("cardNumberSelectorInput").value = settings.cardNumberSelector[0];
    document.getElementById("cardNumberSelectorAltInput").value = settings.cardNumberSelector[1];
    document.getElementById("cardExpirySelectorInput").value = settings.cardExpirySelector[0];
    document.getElementById("cardExpirySelectorAltInput").value = settings.cardExpirySelector[1];
    document.getElementById("cardCvvSelectorInput").value = settings.cardCvvSelector[0];
    document.getElementById("cardCvvSelectorAltInput").value = settings.cardCvvSelector[1];
    document.getElementById("billingNameSelectorInput").value = settings.billingNameSelector[0];
    document.getElementById("billingNameSelectorAltInput").value = settings.billingNameSelector[1];
    document.getElementById("firstNameSelectorInput").value = settings.firstNameSelector[0];
    document.getElementById("firstNameSelectorAltInput").value = settings.firstNameSelector[1];
    document.getElementById("lastNameSelectorInput").value = settings.lastNameSelector[0];
    document.getElementById("lastNameSelectorAltInput").value = settings.lastNameSelector[1];
    document.getElementById("billingLine1SelectorInput").value = settings.billingLine1Selector[0];
    document.getElementById("billingLine1SelectorAltInput").value = settings.billingLine1Selector[1];
    document.getElementById("billingCitySelectorInput").value = settings.billingCitySelector[0];
    document.getElementById("billingCitySelectorAltInput").value = settings.billingCitySelector[1];
    document.getElementById("billingStateSelectorInput").value = settings.billingStateSelector[0];
    document.getElementById("billingStateSelectorAltInput").value = settings.billingStateSelector[1];
    document.getElementById("billingPostalCodeSelectorInput").value = settings.billingPostalCodeSelector[0];
    document.getElementById("billingPostalCodeSelectorAltInput").value = settings.billingPostalCodeSelector[1];
    document.getElementById("countrySelectorInput").value = settings.countrySelector[0];
    document.getElementById("countrySelectorAltInput").value = settings.countrySelector[1];
    document.getElementById("passwordSelectorInput").value = settings.passwordSelector[0];
    document.getElementById("passwordSelectorAltInput").value = settings.passwordSelector[1];
    document.getElementById("passwordValueInput").value = settings.passwordValue;
  }

  function restoreState() {
    ext.storage.local.get([STORAGE_KEY], (result) => {
      const saved = result[STORAGE_KEY] || {};
      if (saved.country) document.getElementById("country").value = saved.country;
      const runCountInput = document.getElementById("runCountInput");
      if (runCountInput) {
        const savedRunCount = Math.floor(Number(saved.runCount));
        runCountInput.value = String(Number.isFinite(savedRunCount) && savedRunCount >= 1 ? savedRunCount : DEFAULT_RUN_COUNT);
      }
      if (saved.cardInput) document.getElementById("cardInput").value = saved.cardInput;
      if (saved.payUrlInput) document.getElementById("payUrlInput").value = saved.payUrlInput;
      state.payUrlMode = normalizePayUrlMode(saved.payUrlMode);
      document.getElementById("payUrlModeSelect").value = state.payUrlMode;
      state.lastLongPayUrl = typeof saved.lastLongPayUrl === "string" ? saved.lastLongPayUrl : "";
      state.lastShortPayUrl = typeof saved.lastShortPayUrl === "string" ? saved.lastShortPayUrl : "";
      state.specifiedAccountInput = typeof saved.specifiedAccountInput === "string" ? saved.specifiedAccountInput : "";
      document.getElementById("specifiedAccountInput").value = state.specifiedAccountInput;
      state.deleteThirdPartyAccountEnabled = saved.deleteThirdPartyAccountEnabled === undefined ? true : Boolean(saved.deleteThirdPartyAccountEnabled);
      document.getElementById("deleteThirdPartyAccountCheckbox").checked = state.deleteThirdPartyAccountEnabled;
      if (saved.phoneKeyInput) document.getElementById("phoneKeyInput").value = saved.phoneKeyInput;
      state.flowCountry = normalizeFlowCountry(saved.flowCountry);
      document.getElementById("flowCountrySelect").value = state.flowCountry;
      state.jpSmsCdk = typeof saved.jpSmsCdk === "string" && saved.jpSmsCdk.trim() ? saved.jpSmsCdk.trim() : DEFAULT_JP_SMS_CDK;
      document.getElementById("jpSmsCdkInput").value = state.jpSmsCdk;
      state.proxyEnabled = saved.proxyEnabled === undefined ? true : Boolean(saved.proxyEnabled);
      document.getElementById("proxyEnabledCheckbox").checked = state.proxyEnabled;
      state.webshareApiKey = typeof saved.webshareApiKey === "string" ? saved.webshareApiKey : "";
      document.getElementById("webshareApiKeyInput").value = state.webshareApiKey;
      state.proxyProtocol = normalizeProxyProtocol(saved.proxyProtocol);
      document.getElementById("proxyProtocolSelect").value = state.proxyProtocol;
      state.step1ProxyCountry = normalizeProxyCountry(saved.step1ProxyCountry);
      document.getElementById("step1ProxyCountrySelect").value = state.step1ProxyCountry;
      state.step3ProxyCountry = normalizeProxyCountry(saved.step3ProxyCountry);
      document.getElementById("step3ProxyCountrySelect").value = state.step3ProxyCountry;
      state.currentProxy = isRuntimeProxy(saved.currentProxy) ? saved.currentProxy : null;
      state.currentIpLocation = normalizeSavedIpLocation(saved.currentIpLocation);
      renderProxyStatus();
      state.randomCardEnabled = Boolean(saved.randomCardEnabled);
      document.getElementById("randomCardCheckbox").checked = state.randomCardEnabled;
      state.useCurrentIpLocation = Boolean(saved.useCurrentIpLocation);
      document.getElementById("useCurrentIpLocationCheckbox").checked = state.useCurrentIpLocation;
      state.phoneKeyInput = typeof saved.phoneKeyInput === "string" ? saved.phoneKeyInput : "";
      try {
        state.phoneKey = pickRandomPhoneKey(state.phoneKeyInput, { allowEmpty: true });
      } catch (_) {
        state.phoneKey = null;
      }
      state.fillSettings = sanitizeFillSettings(saved.fillSettings);
      state.fillSettingsExpanded = Boolean(saved.fillSettingsExpanded);
      state.lastPaypalEmail = typeof saved.lastPaypalEmail === "string" ? saved.lastPaypalEmail : "";
      renderFillSettings();
    });
  }

  function persistState() {
    const nextState = {
      country: document.getElementById("country").value,
      flowCountry: normalizeFlowCountry(document.getElementById("flowCountrySelect").value),
      jpSmsCdk: getJpSmsCdkInput(),
      runCount: getRunCount(),
      cardInput: document.getElementById("cardInput").value,
      randomCardEnabled: document.getElementById("randomCardCheckbox").checked,
      useCurrentIpLocation: document.getElementById("useCurrentIpLocationCheckbox").checked,
      specifiedAccountInput: document.getElementById("specifiedAccountInput").value,
      deleteThirdPartyAccountEnabled: document.getElementById("deleteThirdPartyAccountCheckbox").checked,
      payUrlInput: document.getElementById("payUrlInput").value,
      payUrlMode: normalizePayUrlMode(document.getElementById("payUrlModeSelect").value),
      lastLongPayUrl: state.lastLongPayUrl,
      lastShortPayUrl: state.lastShortPayUrl,
      phoneKeyInput: document.getElementById("phoneKeyInput").value,
      proxyEnabled: document.getElementById("proxyEnabledCheckbox").checked,
      webshareApiKey: document.getElementById("webshareApiKeyInput").value,
      proxyProtocol: normalizeProxyProtocol(document.getElementById("proxyProtocolSelect").value),
      step1ProxyCountry: normalizeProxyCountry(document.getElementById("step1ProxyCountrySelect").value),
      step3ProxyCountry: normalizeProxyCountry(document.getElementById("step3ProxyCountrySelect").value),
      currentProxy: state.currentProxy,
      currentIpLocation: state.currentIpLocation,
      fillSettings: sanitizeFillSettings(state.fillSettings),
      fillSettingsExpanded: state.fillSettingsExpanded,
      lastPhoneCode: state.lastPhoneCode,
      lastPaypalEmail: state.lastPaypalEmail
    };
    return ext.storage.local.set({ [STORAGE_KEY]: nextState });
  }

  function bindEvents() {
    document.getElementById("startBtn").addEventListener("click", () => runWithErrorHandling(runAutomationBatch));
    document.getElementById("startToStep2Btn").addEventListener("click", () => runWithErrorHandling(startToStep2));
    document.getElementById("cancelBatchBtn").addEventListener("click", requestCancelAutomationBatch);
    document.getElementById("getPayUrlBtn").addEventListener("click", () => runWithErrorHandling(getPayUrlFromCurrentTab));
    document.getElementById("startPayUrlBtn").addEventListener("click", () => runWithErrorHandling(startFromPayUrl));
    document.getElementById("startStep3Btn").addEventListener("click", () => runWithErrorHandling(startFromStep3));
    document.getElementById("fillStep5FormBtn").addEventListener("click", () => runWithErrorHandling(manualFillStep5Form));
    document.getElementById("getWebshareProxyButton").addEventListener("click", () => runWithErrorHandling(getCurrentWebshareProxy));
    document.getElementById("setProxyButton").addEventListener("click", () => runWithErrorHandling(setCurrentProxy));
    document.getElementById("replaceProxyButton").addEventListener("click", () => runWithErrorHandling(replaceWebshareProxy));
    document.getElementById("clearProxyButton").addEventListener("click", () => runWithErrorHandling(clearProxy));
    document.getElementById("proxyEnabledCheckbox").addEventListener("change", () => {
      state.proxyEnabled = document.getElementById("proxyEnabledCheckbox").checked;
      persistState();
      logMessage(state.proxyEnabled ? "代理已开启" : "代理已关闭");
    });
    document.getElementById("webshareApiKeyInput").addEventListener("input", () => {
      state.webshareApiKey = document.getElementById("webshareApiKeyInput").value.trim();
      persistState();
    });
    document.getElementById("proxyProtocolSelect").addEventListener("change", () => {
      document.getElementById("proxyProtocolSelect").value = getProxyProtocol();
      persistState();
    });
    document.getElementById("step1ProxyCountrySelect").addEventListener("change", () => {
      document.getElementById("step1ProxyCountrySelect").value = getStep1ProxyCountry();
      persistState();
    });
    document.getElementById("step3ProxyCountrySelect").addEventListener("change", () => {
      document.getElementById("step3ProxyCountrySelect").value = getStep3ProxyCountry();
      persistState();
    });
    document.getElementById("country").addEventListener("change", persistState);
    document.getElementById("specifiedAccountInput").addEventListener("input", () => {
      state.specifiedAccountInput = document.getElementById("specifiedAccountInput").value.trim();
      persistState();
    });
    document.getElementById("deleteThirdPartyAccountCheckbox").addEventListener("change", () => {
      state.deleteThirdPartyAccountEnabled = document.getElementById("deleteThirdPartyAccountCheckbox").checked;
      persistState();
      logMessage(state.deleteThirdPartyAccountEnabled ? "失败时将删除第三方账号" : "失败时将保留第三方账号");
    });
    document.getElementById("flowCountrySelect").addEventListener("change", () => {
      document.getElementById("flowCountrySelect").value = getFlowCountry();
      persistState();
    });
    document.getElementById("payUrlModeSelect").addEventListener("change", () => {
      const mode = getPayUrlMode();
      const selectedLink = chooseStoredPaymentLinkForMode(mode);
      if (selectedLink && getPayUrlEntries().length <= 1) {
        document.getElementById("payUrlInput").value = selectedLink;
        logMessage(`支付链接类型已切换，当前 PayURL 已更新为${mode === "short" ? "短链" : "长链"}`);
      } else if (selectedLink) {
        logMessage("支付链接类型已切换，当前 PayURL 队列保持不变");
      }
      persistState();
    });
    document.getElementById("jpSmsCdkInput").addEventListener("input", () => {
      state.jpSmsCdk = getJpSmsCdkInput();
      persistState();
    });
    document.getElementById("runCountInput").addEventListener("input", persistState);
    document.getElementById("cardInput").addEventListener("input", persistState);
    document.getElementById("randomCardCheckbox").addEventListener("change", () => {
      state.randomCardEnabled = document.getElementById("randomCardCheckbox").checked;
      persistState();
    });
    document.getElementById("generateRandomCardButton").addEventListener("click", () => runWithErrorHandling(generateRandomCardInputNumber));
    document.getElementById("useCurrentIpLocationCheckbox").addEventListener("change", () => {
      state.useCurrentIpLocation = document.getElementById("useCurrentIpLocationCheckbox").checked;
      persistState();
      logMessage(state.useCurrentIpLocation ? "已启用当前 IP 定位填表" : "已关闭当前 IP 定位填表，将使用默认卡片地址");
    });
    document.getElementById("payUrlInput").addEventListener("input", persistState);
    document.getElementById("phoneKeyInput").addEventListener("input", () => {
      state.phoneKeyInput = document.getElementById("phoneKeyInput").value.trim();
      try {
        state.phoneKey = pickRandomPhoneKey(state.phoneKeyInput, { allowEmpty: true });
      } catch (_) {
        state.phoneKey = null;
      }
      persistState();
    });
    document.getElementById("toggleFillSettingsButton").addEventListener("click", () => {
      state.fillSettingsExpanded = !state.fillSettingsExpanded;
      renderFillSettings();
      persistState();
    });
    document.getElementById("resetFillSettingsButton").addEventListener("click", () => {
      state.fillSettings = createDefaultFillSettings();
      renderFillSettings();
      persistState();
      logMessage("已恢复默认填充设置");
    });
    bindFillSettingsInputs();
  }

  async function runWithErrorHandling(task) {
    try {
      await task();
    } catch (error) {
      logMessage("错误: " + formatError(error));
    }
  }

  function formatError(error) {
    return error && error.message ? error.message : String(error);
  }

  function init() {
    bindEvents();
    renderAutomationBatchControls();
    renderRunStats();
    restoreState();
    renderFillSettings();
    logMessage("扩展已加载，准备开始");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());
