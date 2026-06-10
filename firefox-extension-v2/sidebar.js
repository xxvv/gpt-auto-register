(function () {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : chrome;

  const DOMAINS = [
    "xvmit.edu.kg",
    "ciat.edu.kg",
    "cars.edu.kg",
    "xymit.edu.kg",
  ];
  const DEFAULT_TEAM_PROVIDER_DOMAIN = "xperiabox.shop";
  const TEAM_REGISTRATION_INVITE_CODE = "6f904cb02f70390ab6bcad916d63b3d8e86f698f6d2ccb8d466b5e1cef6417a8";
  const TEAM_SSO_URL_PREFIX = "https://auth.openai.com/sso";
  const TEAM_SIGNIN_CONSENT_URL_PREFIX = "https://external.auth.openai.com/sso/signin-consent";
  const TEAM_PROVIDER_DEFINITIONS = Object.freeze({
    "xperiabox.shop": Object.freeze({
      domain: "xperiabox.shop",
      authorizeUrlPrefix: "https://2add0d82.r7.vip.cpolar.cn/authorize",
      type: "invite"
    }),
    "edu.pilipala.store": Object.freeze({
      domain: "edu.pilipala.store",
      authorizeUrlPrefix: "https://sso.pilipala.store/authorize",
      type: "pilipala",
      password: "ciallo"
    }),
    "lty.pilipala.store": Object.freeze({
      domain: "lty.pilipala.store",
      authorizeUrlPrefix: "https://sso2.pilipala.store/authorize",
      type: "pilipala",
      password: "ciallo"
    }),
    "gpt.edu.sixoner.com": Object.freeze({
      domain: "gpt.edu.sixoner.com",
      authorizeUrlPrefix: "https://sso.sixoner.com/authorize",
      type: "emailOnly",
      submitSelector: "#submit"
    })
  });
  const CODE_API = "https://getemail.nnai.uk/api/code";
  const HERO_SMS_API = "https://hero-sms.com/stubs/handler_api.php";
  const THIRD_PARTY_ACCOUNTS_API = "https://gpt2.nnai.uk/api/third-party/accounts";
  const THIRD_PARTY_ACCOUNTS_DELETE_API = `${THIRD_PARTY_ACCOUNTS_API}/delete`;
  const THIRD_PARTY_ACCOUNTS_UPDATE_API = `${THIRD_PARTY_ACCOUNTS_API}/update`;
  const THIRD_PARTY_API_KEY = "aa102911";
  const ROXY_PUSH_API = "http://127.0.0.1:8765/api/push";
  const ROXY_PUSH_TOKEN = "6d0ea1fa0dfa0c6ff8b13cc7b1c5dd3f";
  const ROXY_PUSH_WORKSPACE_ID = "122926";
  const ROXY_PUSH_WINDOW_ID = "4e51f65e12163f8edff39944a1ac2410";
  const CODEX_OAUTH_ISSUER = "https://auth.openai.com";
  const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
  const CODEX_OAUTH_REDIRECT_URI = "http://localhost:1455/auth/callback";
  const CODEX_OAUTH_SCOPE = "openid email profile offline_access";
  const CODEX_PHONE_API_BASE = "https://getcodex.nnai.uk";
  const CODEX_PHONE_VERIFY_ATTEMPTS = 3;
  const CODEX_SMS_WAIT_MS = 120000;
  const CODEX_AUTH_TIMEOUT_MS = 480000;
  const WEBSHARE_LIST_API = "https://proxy.webshare.io/api/v2/proxy/list/";
  const WEBSHARE_REPLACE_API = "https://proxy.webshare.io/api/v3/proxy/replace/";
  const IPAPI_LOCATION_API = "https://ipapi.co/json/?token=T6UkBSJpmZgNZELN7QsJk5uCZTF8c6aVHUYZiLwEsHnUQqqeJg";
  const STORAGE_KEY = "gptAutoRegisterV2State";
  const CONTENT_CALL_STORAGE_KEY = "__gptAutoRegisterContentCall";
  const PROXY_AUTH_KEY = "gptAutoRegisterProxyAuth";
  const US_ZIP3_STATE_RANGES_PATH = "us_zip3_state_ranges.json";
  const EMAIL_CODE_POLL_ATTEMPTS = 10;
  const POLL_ATTEMPTS = 20;
  const POLL_DELAY_MS = 5000;
  const PASSKEY_ENROLL_URL_PREFIX = "https://auth.openai.com/create-account-enroll-passkey";
  const PASSKEY_ENROLL_SKIP_SELECTOR = '[data-dd-action-name="skip create account enroll passkey"]';
  const DEFAULT_RUN_COUNT = 1;
  const DEFAULT_REGISTRATION_METHOD = "email";
  const PHONE_REGISTRATION_PASSWORD = "Aa123456789..";
  const HERO_DEFAULT_SERVICE = "dr";
  const HERO_SMS_POLL_TIMEOUT_MS = 90000;
  const DEFAULT_FLOW_COUNTRY = "US";
  const DEFAULT_PAY_URL_MODE = "long";
  const DEFAULT_PAYMENT_METHOD = "default";
  const DEFAULT_PHONE_FAILURE_COOLDOWN_MINUTES = 30;
  const CHECKOUT_REGION_CODES = Object.freeze(["CA", "ID", "IE", "AU", "NZ", "JP", "BR", "US", "DE"]);
  const PAY_URL_OFFICIAL_REGION_ORDER = Object.freeze(["AU", "NZ", "DE", "IE", "US"]);
  const BRAZIL_PIX_API_BASE = "https://scan.youyushen.icu";
  const BRAZIL_PIX_GENERATE_API = "https://payment.nuo.cm/api/pix-generate";
  const BRAZIL_PIX_POLL_INTERVAL_MS = 4000;
  const BRAZIL_PIX_POLL_TIMEOUT_MS = 300000;
  const BRAZIL_PIX_FAILED_STATUSES = new Set(["failed", "expired", "canceled"]);
  const PROTOCOL_PAYMENT_JOBS_API = "https://plus.iceaix.com/api/jobs";
  const TRIAL_PAYMENT_CHECK_API = "https://plus.iceaix.com/api/trial/check";
  const PROTOCOL_PAYMENT_PPLINK_RETRY = 3;
  const PROTOCOL_PAYMENT_OTP_TIMEOUT_SECONDS = 180;
  const AUTOMATION_WINDOW_CLOSE_DELAY_MS = 10000;
  const AUTOMATION_RESPONSIVE_VIEWPORT_WIDTH = 430;
  const AUTOMATION_RESPONSIVE_WINDOW_HEIGHT = 932;
  const AUTOMATION_USER_AGENT = "Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/14.2 Chrome/146.0.0.0 Mobile Safari/537.36";
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
    randomCardEnabled: true,
    useCurrentIpLocation: false,
    registrationMethod: DEFAULT_REGISTRATION_METHOD,
    heroApiKey: "",
    heroService: HERO_DEFAULT_SERVICE,
    heroCountry: "",
    heroCountrySearch: "",
    heroMaxPrice: "",
    specifiedAccountInput: "",
    teamProviderDomain: DEFAULT_TEAM_PROVIDER_DOMAIN,
    deleteThirdPartyAccountEnabled: true,
    paymentFlowEnabled: true,
    stopAfterThirdPartySubmitEnabled: false,
    continueAuthorizationEnabled: false,
    codexSmsVoucherCode: "",
    lastSuccessfulAuthorizationAccount: null,
    authorizationRunning: false,
    lastAuthorizationStatus: "",
    debugModeEnabled: false,
    phoneKeyInput: "",
    pixCdkInput: "",
    protocolCdkInput: "",
    phoneKey: null,
    phoneKeyCursor: 0,
    phoneFailureCooldownMinutes: DEFAULT_PHONE_FAILURE_COOLDOWN_MINUTES,
    phoneFailureCooldowns: {},
    flowCountry: DEFAULT_FLOW_COUNTRY,
    payUrlMode: DEFAULT_PAY_URL_MODE,
    paymentMethod: DEFAULT_PAYMENT_METHOD,
    lastLongPayUrl: "",
    lastShortPayUrl: "",
    lastCheckoutRegion: "",
    lastPhoneCode: "",
    lastPaypalEmail: "",
    proxyEnabled: true,
    webshareApiKey: "",
    proxyProtocol: "http",
    step1ProxyCountry: "US",
    step3ProxyCountry: "US",
    step4ProxyCountry: "KEEP_STEP3",
    currentProxy: null,
    currentIpLocation: null,
    automationBatchRunning: false,
    cancelAutomationBatchRequested: false,
    payUrlBatchRunning: false,
    brazilPixContinueRunning: false,
    teamRegistrationRunning: false,
    brazilPixResume: null,
    runStats: {
      total: 0,
      completed: 0,
      success: 0,
      fail: 0
    }
  };
  let usZip3StateRangesPromise = null;
  let heroCountryOptions = [];
  let heroCountriesPromise = null;

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

  function generateDomainEmail() {
    return `${generateLocalPart()}@${DOMAINS[Math.floor(Math.random() * DOMAINS.length)]}`;
  }

  function normalizeTeamProviderDomain(value) {
    const domain = String(value || "").trim().toLowerCase();
    return TEAM_PROVIDER_DEFINITIONS[domain] ? domain : DEFAULT_TEAM_PROVIDER_DOMAIN;
  }

  function getTeamProviderDefinition(domain) {
    return TEAM_PROVIDER_DEFINITIONS[normalizeTeamProviderDomain(domain)];
  }

  function inferTeamProviderDomainFromEmail(email) {
    const match = String(email || "").trim().toLowerCase().match(/@([^@\s]+)$/);
    return match && TEAM_PROVIDER_DEFINITIONS[match[1]] ? match[1] : "";
  }

  function getTeamProviderDomain() {
    const input = document.getElementById("teamProviderSelect");
    state.teamProviderDomain = normalizeTeamProviderDomain(input ? input.value : state.teamProviderDomain);
    return state.teamProviderDomain;
  }

  function getTeamProviderDomainForAccount(accountContext) {
    const context = accountContext && typeof accountContext === "object" ? accountContext : {};
    return normalizeTeamProviderDomain(
      context.teamProviderDomain ||
      context.providerDomain ||
      inferTeamProviderDomainFromEmail(context.account || context.email) ||
      getTeamProviderDomain()
    );
  }

  function getEmailPrefix(email) {
    return String(email || "").trim().split("@")[0] || "";
  }

  function generateTeamRegistrationEmail(providerDomain = getTeamProviderDomain()) {
    return `${generateLocalPart()}@${normalizeTeamProviderDomain(providerDomain)}`;
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

  function normalizePhoneCooldownMinutes(value) {
    const minutes = Math.floor(Number(value));
    if (!Number.isFinite(minutes) || minutes < 0) {
      return DEFAULT_PHONE_FAILURE_COOLDOWN_MINUTES;
    }
    return minutes;
  }

  function getPhoneFailureCooldownMinutes() {
    const input = document.getElementById("phoneFailureCooldownMinutesInput");
    state.phoneFailureCooldownMinutes = normalizePhoneCooldownMinutes(
      input ? input.value : state.phoneFailureCooldownMinutes
    );
    if (input) {
      input.value = String(state.phoneFailureCooldownMinutes);
    }
    return state.phoneFailureCooldownMinutes;
  }

  function getPhoneCooldownKey(phoneKey) {
    return String(phoneKey && (phoneKey.raw || phoneKey.phone || phoneKey.code) || "").trim();
  }

  function pruneExpiredPhoneCooldowns(nowMs = Date.now()) {
    const cooldowns = state.phoneFailureCooldowns || {};
    for (const [key, entry] of Object.entries(cooldowns)) {
      const untilMs = Number(entry && entry.untilMs);
      if (!Number.isFinite(untilMs) || untilMs <= nowMs) {
        delete cooldowns[key];
      }
    }
    state.phoneFailureCooldowns = cooldowns;
  }

  function getPhoneCooldownEntry(phoneKey, nowMs = Date.now()) {
    pruneExpiredPhoneCooldowns(nowMs);
    const key = getPhoneCooldownKey(phoneKey);
    return key ? state.phoneFailureCooldowns[key] || null : null;
  }

  function isPhoneKeyCoolingDown(phoneKey, nowMs = Date.now()) {
    const entry = getPhoneCooldownEntry(phoneKey, nowMs);
    return Boolean(entry && Number(entry.untilMs) > nowMs);
  }

  function formatCooldownTime(untilMs) {
    const date = new Date(Number(untilMs));
    return Number.isFinite(date.getTime()) ? date.toLocaleTimeString() : "未知时间";
  }

  function readPhoneKeyEntriesForStatus() {
    const flowCountry = normalizeFlowCountry(state.flowCountry || (document.getElementById("flowCountrySelect") || {}).value);
    const text = String((document.getElementById("phoneKeyInput") || {}).value || state.phoneKeyInput || "").trim();
    if (!text) {
      return [];
    }
    try {
      return parsePhoneKeyLines(text, flowCountry === "JP" ? parseJapanPhoneKeyInput : parsePhoneKeyInput);
    } catch (_) {
      return [];
    }
  }

  function getNextPhoneStatusText() {
    const phoneKeys = readPhoneKeyEntriesForStatus();
    if (!phoneKeys.length) {
      return "下一次手机号: 未设置";
    }
    const cursor = Number.isInteger(state.phoneKeyCursor) && state.phoneKeyCursor >= 0
      ? state.phoneKeyCursor % phoneKeys.length
      : 0;
    let earliestUntilMs = 0;
    for (let offset = 0; offset < phoneKeys.length; offset += 1) {
      const index = (cursor + offset) % phoneKeys.length;
      const picked = phoneKeys[index];
      const cooldown = getPhoneCooldownEntry(picked);
      if (cooldown && Number(cooldown.untilMs) > Date.now()) {
        earliestUntilMs = earliestUntilMs
          ? Math.min(earliestUntilMs, Number(cooldown.untilMs))
          : Number(cooldown.untilMs);
        continue;
      }
      return `下一次手机号: ${picked.phone || picked.rawPhone || picked.raw}（下标 ${index + 1}/${phoneKeys.length}）`;
    }
    return `下一次手机号: 全部冷却中，最早 ${formatCooldownTime(earliestUntilMs)} 可用（当前下标 ${cursor + 1}/${phoneKeys.length}）`;
  }

  async function advancePhoneCursorAfterSuccess(phoneKey) {
    if (!phoneKey) {
      return;
    }
    if (Number.isInteger(phoneKey.phoneCursorIndex) && Number.isInteger(phoneKey.phoneCursorTotal) && phoneKey.phoneCursorTotal > 0) {
      state.phoneKeyCursor = (phoneKey.phoneCursorIndex + 1) % phoneKey.phoneCursorTotal;
    }
    await persistState();
    renderNextPhoneStatus();
    if (phoneKey.phone) {
      logMessage(`手机号支付成功，轮询下标已推进到下一位: ${phoneKey.phone}`);
    }
  }

  function renderNextPhoneStatus() {
    const node = document.getElementById("nextPhoneStatus");
    if (!node) {
      return;
    }
    const text = getNextPhoneStatusText();
    node.textContent = text;
    node.classList.toggle("empty", text.includes("未设置"));
  }

  async function waitForPhoneCooldown(untilMs, label) {
    const targetMs = Number(untilMs);
    if (!Number.isFinite(targetMs)) {
      throw new Error(`${label || "手机号"}全部处于冷却期，等待时间无效`);
    }
    let remainingMs = Math.max(0, targetMs - Date.now());
    logMessage(`${label || "手机号"}全部处于冷却期，暂停任务轮询，预计 ${formatCooldownTime(targetMs)} 恢复`);
    while (remainingMs > 0) {
      if (state.cancelAutomationBatchRequested) {
        throw new Error("任务已取消，停止等待手机号冷却");
      }
      await delay(Math.min(remainingMs, 15000));
      remainingMs = Math.max(0, targetMs - Date.now());
    }
    pruneExpiredPhoneCooldowns();
    await persistState();
    renderNextPhoneStatus();
    logMessage(`${label || "手机号"}冷却结束，继续任务`);
  }

  function startPhoneFailureCooldown(phoneKey, reason) {
    const key = getPhoneCooldownKey(phoneKey);
    if (!key) {
      return null;
    }
    const minutes = getPhoneFailureCooldownMinutes();
    const untilMs = Date.now() + minutes * 60 * 1000;
    state.phoneFailureCooldowns[key] = {
      untilMs,
      phone: String(phoneKey && phoneKey.phone || "").trim(),
      reason: String(reason || "支付流程失败").slice(0, 500)
    };
    persistState();
    renderNextPhoneStatus();
    return { untilMs, minutes };
  }

  function logPaymentFailurePhone(phoneKey, reason) {
    const phone = String(phoneKey && phoneKey.phone || "").trim();
    if (!phone) {
      return;
    }
    if (phoneKey.paymentFailureLogged) {
      return;
    }
    phoneKey.paymentFailureLogged = true;
    const detail = String(reason || "支付流程失败").trim();
    const cooldown = startPhoneFailureCooldown(phoneKey, detail);
    const cooldownText = cooldown
      ? `，冷却 ${cooldown.minutes} 分钟，至 ${formatCooldownTime(cooldown.untilMs)}`
      : "";
    const message = `支付失败手机号: ${phone}${cooldownText}，原因: ${detail}`;
    const logDiv = document.getElementById("paymentFailureLogOutput");
    if (logDiv) {
      const placeholder = logDiv.querySelector(".log-line");
      if (placeholder && placeholder.textContent.includes("等待支付失败手机号")) {
        placeholder.remove();
      }
      const line = document.createElement("div");
      line.className = "log-line";
      line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
      logDiv.appendChild(line);
      logDiv.scrollTop = logDiv.scrollHeight;
    }
    logMessage(message);
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

    const country = getProxyCountryForStage(stage);
    if (stage === "第三步" && country === "KEEP_STEP1") {
      logMessage(`${stage}: 选择不修改代理，沿用第一步当前代理`);
      if (isCurrentIpLocationEnabled()) {
        await refreshIpLocation(`${stage}: `);
      }
      return false;
    }
    if (stage === "第四步" && country === "KEEP_STEP3") {
      logMessage(`${stage}: 选择不修改代理，沿用第三步当前代理`);
      if (isCurrentIpLocationEnabled()) {
        await refreshIpLocation(`${stage}: `);
      }
      return false;
    }
    if (country === "NONE") {
      if (isRuntimeProxy(state.currentProxy)) {
        logMessage(`${stage}: 代理国家设置为'无'，正在清除当前 Firefox 代理`);
        await clearFirefoxProxyState();
        state.currentProxy = null;
        state.currentIpLocation = null;
        renderProxyStatus();
        await persistState();
        logMessage(`${stage}: 当前 Firefox 代理已清除`);
      } else {
        logMessage(`${stage}: 代理国家设置为'无'，跳过代理设置`);
      }
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

  function parseWebshareApiKeys(rawValue) {
    return String(rawValue || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function requireWebshareApiKey() {
    const apiKeys = parseWebshareApiKeys(document.getElementById("webshareApiKeyInput").value);
    const apiKey = apiKeys[0] || "";
    if (!apiKey) {
      throw new Error("请先输入 Webshare API Key");
    }
    state.webshareApiKey = document.getElementById("webshareApiKeyInput").value;
    return apiKey;
  }

  function requireProtocolWebshareApiKeys() {
    const rawValue = document.getElementById("webshareApiKeyInput").value || "";
    const apiKeys = parseWebshareApiKeys(rawValue);
    if (apiKeys.length < 2) {
      throw new Error("协议支付需要至少两行 Webshare API Key：第1行用于日本，第2行用于美国");
    }
    state.webshareApiKey = rawValue;
    return {
      japanApiKey: apiKeys[0],
      usApiKey: apiKeys[1]
    };
  }

  function formatProxyUrlForProtocol(proxy, protocol, options = {}) {
    const runtimeProxy = requireRuntimeProxy(proxy);
    const proxyType = normalizeProxyProtocol(protocol || runtimeProxy.type);
    const host = String(runtimeProxy.host || "").trim();
    const port = Number(runtimeProxy.port || 0);
    if (!host || !port) {
      throw new Error("协议代理缺少 host/port");
    }
    const username = String(runtimeProxy.username || "").trim();
    const password = String(runtimeProxy.password || "").trim();
    const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";
    const suffix = options.trailingSlash ? "/" : "";
    return `${proxyType}://${auth}${host}:${port}${suffix}`;
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

  function getStep4ProxyCountry() {
    const value = document.getElementById("step4ProxyCountrySelect").value;
    state.step4ProxyCountry = normalizeProxyCountry(value);
    return state.step4ProxyCountry;
  }

  function getProxyCountryForStage(stage) {
    if (stage === "第一步") return getStep1ProxyCountry();
    if (stage === "第四步") return getStep4ProxyCountry();
    return getStep3ProxyCountry();
  }

  function normalizeProxyProtocol(value) {
    return String(value || "").toLowerCase() === "socks5" ? "socks5" : "http";
  }

  function normalizeProxyCountry(value) {
    const country = String(value || "").trim().toUpperCase();
    if (country === "KEEP_STEP1") return "KEEP_STEP1";
    if (country === "KEEP_STEP3") return "KEEP_STEP3";
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

  function normalizePaymentMethod(value) {
    return String(value || "").trim().toLowerCase() === "protocol" ? "protocol" : DEFAULT_PAYMENT_METHOD;
  }

  function getPaymentMethod() {
    const input = document.getElementById("paymentMethodSelect");
    state.paymentMethod = normalizePaymentMethod(input ? input.value : state.paymentMethod);
    if (input) {
      input.value = state.paymentMethod;
    }
    return state.paymentMethod;
  }

  function isProtocolPaymentMethod() {
    return getPaymentMethod() === "protocol";
  }

  function normalizeCheckoutRegion(value) {
    const region = String(value || "").trim().toUpperCase();
    return CHECKOUT_REGION_CODES.includes(region) ? region : "ID";
  }

  function normalizeOptionalCheckoutRegion(value) {
    const region = String(value || "").trim().toUpperCase();
    return CHECKOUT_REGION_CODES.includes(region) ? region : "";
  }

  function normalizeBrazilPixResumeContext(context) {
    if (!context || typeof context !== "object") {
      return null;
    }
    const tabId = Number(context.tabId);
    if (!Number.isInteger(tabId) || tabId < 0) {
      return null;
    }
    const rawWindowId = Number(context.windowId);
    const specifiedAccountEntry = context.specifiedAccountEntry && context.specifiedAccountEntry.line
      ? {
          line: String(context.specifiedAccountEntry.line || "").trim(),
          email: String(context.specifiedAccountEntry.email || context.registrationAccount || "").trim()
        }
      : null;
    return {
      tabId,
      windowId: Number.isInteger(rawWindowId) && rawWindowId >= 0 ? rawWindowId : null,
      thirdPartyAccount: String(context.thirdPartyAccount || "").trim(),
      registrationAccount: String(context.registrationAccount || "").trim(),
      sessionEmail: String(context.sessionEmail || "").trim(),
      registrationMethod: normalizeRegistrationMethod(context.registrationMethod || (context.phoneRegistration ? "phone" : "email")),
      specifiedAccountEntry: specifiedAccountEntry && specifiedAccountEntry.line ? specifiedAccountEntry : null,
      phoneRegistration: Boolean(context.phoneRegistration),
      proxy: isRuntimeProxy(context.proxy) ? { ...context.proxy } : null,
      createdAt: Number(context.createdAt) || Date.now()
    };
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

  function isPaymentFlowEnabled() {
    const input = document.getElementById("paymentFlowEnabledCheckbox");
    state.paymentFlowEnabled = input ? Boolean(input.checked) : true;
    return state.paymentFlowEnabled;
  }

  function isStopAfterThirdPartySubmitEnabled() {
    const input = document.getElementById("stopAfterThirdPartySubmitCheckbox");
    state.stopAfterThirdPartySubmitEnabled = input ? Boolean(input.checked) : false;
    return state.stopAfterThirdPartySubmitEnabled;
  }

  function isDebugModeEnabled() {
    const input = document.getElementById("debugModeCheckbox");
    state.debugModeEnabled = input ? Boolean(input.checked) : false;
    return state.debugModeEnabled;
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

  async function executeScriptInTab(tabId, fn, ...args) {
    if (typeof fn !== "function") {
      throw new Error("页面脚本必须是函数");
    }
    const results = await executeScriptAfterPageReady(tabId, {
      code: `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`,
      runAt: "document_idle"
    }, "页面脚本");
    return Array.isArray(results) ? results[0] : results;
  }

  function readPixCdkCodes() {
    const input = document.getElementById("pixCdkInput");
    return String(input && input.value || state.pixCdkInput || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function getNextProtocolCdkEntry() {
    const input = document.getElementById("protocolCdkInput");
    const lines = String(input && input.value || state.protocolCdkInput || "").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = String(line || "").trim();
      if (trimmed) {
        return { line: trimmed, cdk: trimmed };
      }
    }
    throw new Error("请输入协议 CDK，一行一个");
  }

  async function removeUsedProtocolCdk(cdkEntry) {
    const usedLine = String(cdkEntry && cdkEntry.line || cdkEntry && cdkEntry.cdk || "").trim();
    if (!usedLine) {
      return;
    }
    const input = document.getElementById("protocolCdkInput");
    if (!input) {
      return;
    }
    const lines = String(input.value || "").split(/\r?\n/);
    let removed = false;
    const remainingLines = [];
    for (const line of lines) {
      if (!removed && String(line || "").trim() === usedLine) {
        removed = true;
        continue;
      }
      remainingLines.push(line);
    }
    if (!removed) {
      logMessage("未找到本次使用的协议 CDK，协议 CDK 列表未修改");
      return;
    }
    input.value = remainingLines.join("\n");
    state.protocolCdkInput = input.value;
    await persistState();
    logMessage(`协议支付成功，已删除本次使用的协议 CDK: ${usedLine}`);
  }

  function updatePixCdkVisibility() {
    const panel = document.getElementById("pixCdkPanel");
    const country = document.getElementById("country").value;
    if (panel) {
      panel.hidden = country !== "BR";
    }
  }

  async function getChatGptSessionFromTab(tabId) {
    const result = await executeScriptInTab(tabId, async () => {
      const response = await fetch("https://chatgpt.com/api/auth/session", {
        cache: "no-store",
        credentials: "include"
      });
      const data = await response.json();
      const account = data && data.account && typeof data.account === "object" ? data.account : {};
      return {
        accessToken: data && data.accessToken || "",
        userEmail: data && data.user && data.user.email || "",
        accountPlanType: account.planType || ""
      };
    });
    return result || {};
  }

  async function getChatGptSessionUserEmailFromTab(tabId) {
    const session = await getChatGptSessionFromTab(tabId);
    const email = String(session && session.userEmail || "").trim();
    if (!email) {
      throw new Error("ChatGPT session user.email: null");
    }
    return email;
  }

  async function getChatGptAccessTokenFromTab(tabId) {
    const session = await getChatGptSessionFromTab(tabId);
    const result = session && session.accessToken || "";
    const accessToken = String(result || "").trim();
    if (!accessToken) {
      throw new Error("accessToken: null");
    }
    return accessToken;
  }

  async function generateBrazilPixCode(accessToken) {
    logMessage("巴西 PIX: 正在生成 PIX 付款码");
    let response;
    try {
      response = await fetch(BRAZIL_PIX_GENERATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken })
      });
    } catch (error) {
      throw new Error(
        `生成 PIX 付款码网络错误: ${formatError(error)}。请检查 ${BRAZIL_PIX_GENERATE_API} 的 HTTPS 证书、CORS、代理或网络连通性`
      );
    }
    const payload = await readJsonResponse(response, "生成 PIX 付款码");
    if (!response.ok) {
      throw new Error(payload.message || `生成 PIX 付款码失败: HTTP ${response.status}`);
    }
    const qrCodeData = String(payload && payload.qrCodeData || "").trim();
    if (!qrCodeData) {
      throw new Error("生成 PIX 付款码响应缺少 qrCodeData");
    }
    logMessage("巴西 PIX: PIX 付款码已生成");
    return qrCodeData;
  }

  async function checkTrialPaymentEligibility(accessToken, proxyJp) {
    const token = String(accessToken || "").trim();
    if (!token) {
      throw new Error("支付资格检查缺少 accessToken");
    }
    logMessage("支付资格检查: 正在调用 trial/check");
    let response;
    try {
      response = await fetch(TRIAL_PAYMENT_CHECK_API, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          token,
          proxy_jp: String(proxyJp || "").trim()
        })
      });
    } catch (error) {
      throw new Error(`支付资格检查网络错误: ${formatError(error)}`);
    }
    const data = await readJsonResponse(response, "支付资格检查");
    const amountCents = Number(data && data.amount_cents);
    const hasAmountCents = data && data.amount_cents !== undefined && data.amount_cents !== null && Number.isFinite(amountCents);
    const eligible = hasAmountCents && amountCents === 0;
    const status = String(data && data.status || "").trim();
    const currency = String(data && data.currency || "").trim();
    logMessage(`支付资格检查响应: amount_cents=${Number.isFinite(amountCents) ? amountCents : "null"}${currency ? ` ${currency}` : ""}, eligible=${data && data.eligible}, blocked=${data && data.blocked}, status=${status || "-"}`);
    if (!response.ok || data.ok === false) {
      return {
        ok: false,
        data,
        amountCents,
        error: data.error || data.message || `HTTP ${response.status}`
      };
    }
    return {
      ok: true,
      eligible,
      data,
      amountCents,
      currency,
      status
    };
  }

  async function findUsableBrazilPixCdk(codes) {
    let lastMessage = "";
    for (let index = 0; index < codes.length; index += 1) {
      const code = codes[index];
      logMessage(`巴西 PIX: 查询 CDK ${index + 1}/${codes.length}`);
      const response = await fetch(`${BRAZIL_PIX_API_BASE}/buyer/api/code-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const payload = await readJsonResponse(response, "查询 PIX CDK");
      if (!response.ok) {
        lastMessage = payload.message || `HTTP ${response.status}`;
        logMessage(`巴西 PIX: CDK 查询失败，继续下一条 (${lastMessage})`);
        continue;
      }
      const remaining = Number(payload.remaining || 0);
      if (payload.ok === true && remaining > 0) {
        logMessage(`巴西 PIX: CDK 可用，剩余额度 ${remaining}`);
        return code;
      }
      lastMessage = payload.message || `remaining=${remaining}`;
      logMessage(`巴西 PIX: CDK 不可用，继续下一条 (${lastMessage})`);
    }
    throw new Error(`没有可用 PIX CDK${lastMessage ? `: ${lastMessage}` : ""}`);
  }

  async function submitBrazilPixOrder(code, pixCode) {
    const response = await fetch(`${BRAZIL_PIX_API_BASE}/buyer/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, pix_code: pixCode })
    });
    const payload = await readJsonResponse(response, "提交 PIX 订单");
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.message || `提交 PIX 订单失败: HTTP ${response.status}`);
    }
    const ticketId = String(payload.ticket_id || "").trim();
    if (!ticketId) {
      throw new Error("提交 PIX 订单响应缺少 ticket_id");
    }
    return { ticketId, payload };
  }

  async function waitBrazilPixOrderPaid(ticketId) {
    const deadline = Date.now() + BRAZIL_PIX_POLL_TIMEOUT_MS;
    while (Date.now() <= deadline) {
      const response = await fetch(`${BRAZIL_PIX_API_BASE}/buyer/api/order-status?ticket_id=${encodeURIComponent(ticketId)}`, {
        method: "GET",
        cache: "no-store"
      });
      const payload = await readJsonResponse(response, "查询 PIX 订单状态");
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || `查询 PIX 订单状态失败: HTTP ${response.status}`);
      }
      const status = String(payload.status || "").trim().toLowerCase();
      logMessage(`巴西 PIX: 当前订单状态 ${status || "unknown"}`);
      if (status === "paid") {
        return payload;
      }
      if (BRAZIL_PIX_FAILED_STATUSES.has(status)) {
        throw new Error(`PIX 订单失败: ${payload.last_error || payload.message || status}`);
      }
      await delay(BRAZIL_PIX_POLL_INTERVAL_MS);
    }
    throw new Error(`PIX 订单轮询超时: ${ticketId}`);
  }

  async function runBrazilPixPaymentFlow(tabId) {
    const codes = readPixCdkCodes();
    if (!codes.length) {
      throw new Error("请输入 PIX CDK，一行一个");
    }
    setActiveStep(3);
    logMessage("巴西 PIX: 开始接口支付流程");
    const selectedCode = await findUsableBrazilPixCdk(codes);
    const accessToken = await getChatGptAccessTokenFromTab(tabId);
    const pixCode = await generateBrazilPixCode(accessToken);
    setActiveStep(4);
    logMessage("巴西 PIX: 正在提交订单");
    const { ticketId } = await submitBrazilPixOrder(selectedCode, pixCode);
    setActiveStep(5);
    logMessage(`巴西 PIX: 订单已提交，ticket_id=${ticketId}`);
    await waitBrazilPixOrderPaid(ticketId);
    logMessage("巴西 PIX: 支付成功，流程结束");
    return { ok: true, ticketId, code: selectedCode, accessToken };
  }

  async function prepareProtocolPaymentPhoneKey() {
    const firstStepCountry = getStep1ProxyCountry();
    const phoneKey = await preparePhoneKeyForFlow(firstStepCountry === "JP" ? "JP" : getFlowCountry());
    if (!phoneKey || !phoneKey.phone || !phoneKey.smsUrl) {
      throw new Error("协议支付未准备好手机区域手机号和短信地址");
    }
    state.phoneKey = phoneKey;
    await persistState();
    logMessage(`协议支付已准备手机号: ${phoneKey.phone}`);
    return phoneKey;
  }

  async function prepareProtocolPaymentProxies(registrationProxy) {
    const keys = requireProtocolWebshareApiKeys();
    const firstStepCountry = getStep1ProxyCountry();
    let japanProxy = null;
    if (firstStepCountry === "JP" && isRuntimeProxy(registrationProxy)) {
      japanProxy = {
        ...registrationProxy,
        type: "socks5"
      };
      logMessage(`协议支付: 日本代理沿用第一步代理 ${formatProxy(japanProxy)}`);
    } else {
      logMessage("协议支付: 第一步不是日本，使用第1行 Webshare Key 获取日本代理");
      japanProxy = await replaceWebshareProxyDirect(keys.japanApiKey, "JP", "socks5");
      logMessage(`协议支付: 日本代理已准备 ${formatProxy(japanProxy)}`);
    }

    logMessage("协议支付: 使用第2行 Webshare Key 获取美国代理");
    const usProxy = await replaceWebshareProxyDirect(keys.usApiKey, "US", "http");
    await applyFirefoxProxy(usProxy);
    state.currentProxy = usProxy;
    state.currentIpLocation = null;
    renderProxyStatus();
    await persistState();
    logMessage(`协议支付: 美国代理已写入 Firefox ${formatProxy(usProxy)}`);

    return {
      proxyJp: formatProxyUrlForProtocol(japanProxy, "socks5"),
      proxyUs: formatProxyUrlForProtocol(usProxy, "http", { trailingSlash: true }),
      japanProxy,
      usProxy
    };
  }

  async function createProtocolPaymentJob(payload) {
    const response = await fetch(PROTOCOL_PAYMENT_JOBS_API, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await readJsonResponse(response, "协议支付创建任务");
    logMessage(`协议支付创建任务响应: ${JSON.stringify(data)}`);
    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }
    const jobId = String(data.job_id || data.id || "").trim();
    if (!jobId) {
      throw new Error("协议支付创建任务响应缺少 job_id");
    }
    return jobId;
  }

  async function submitProtocolPaymentOtp(jobId, pin) {
    const response = await fetch(`${PROTOCOL_PAYMENT_JOBS_API}/${encodeURIComponent(jobId)}/otp`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ pin })
    });
    const data = await readJsonResponse(response, "协议支付设置短信");
    logMessage(`协议支付设置短信响应: ${JSON.stringify(data)}`);
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }
    return data;
  }

  function parseSseEventLines(lines) {
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    const dataText = dataLines.length
      ? dataLines.join("\n").trim()
      : lines
        .filter((line) => line && !line.startsWith(":") && !/^[a-z]+:/i.test(line))
        .join("\n")
        .trim();
    if (!dataText || dataText === "[DONE]") {
      return null;
    }
    try {
      return JSON.parse(dataText);
    } catch (error) {
      logMessage(`协议支付 SSE 事件不是 JSON: ${dataText}`);
      return null;
    }
  }

  async function readProtocolPaymentEvents(jobId, phoneKey) {
    const response = await fetch(`${PROTOCOL_PAYMENT_JOBS_API}/${encodeURIComponent(jobId)}/events`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "text/event-stream"
      }
    });
    if (!response.ok || !response.body) {
      throw new Error(`协议支付 SSE 连接失败: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let otpSubmitted = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        const event = parseSseEventLines(chunk.split(/\r?\n/));
        if (!event) {
          continue;
        }
        logMessage(`协议支付 SSE: ${JSON.stringify(event)}`);
        if (event.type === "otp_needed") {
          if (otpSubmitted) {
            logMessage("协议支付: 已提交过短信验证码，忽略重复 otp_needed");
            continue;
          }
          logMessage("协议支付: 收到 otp_needed，开始自动获取短信验证码");
          const pin = await fetchPhoneVerificationCode(phoneKey, {
            timeoutMs: PROTOCOL_PAYMENT_OTP_TIMEOUT_SECONDS * 1000
          });
          logMessage(`协议支付: 已获取短信验证码 ${pin}`);
          await submitProtocolPaymentOtp(jobId, pin);
          otpSubmitted = true;
        }
        if (event.type === "result") {
          const result = event.result && typeof event.result === "object" ? event.result : {};
          if (result.success === true) {
            return { ok: true, event, result };
          }
          return {
            ok: false,
            event,
            result,
            error: result.error || result.stage || "协议支付任务失败"
          };
        }
      }
    }
    throw new Error("协议支付 SSE 已结束但未收到 result");
  }

  async function runProtocolPaymentFlow(context) {
    const accessToken = String(context && context.accessToken || "").trim();
    if (!accessToken) {
      throw new Error("协议支付缺少 ChatGPT accessToken");
    }
    const phoneKey = await prepareProtocolPaymentPhoneKey();
    const proxies = await prepareProtocolPaymentProxies(context && context.registrationProxy);
    const cdkEntry = getNextProtocolCdkEntry();
    const payload = {
      input: accessToken,
      cdk: cdkEntry.cdk,
      proxy: proxies.proxyUs,
      proxy_jp: proxies.proxyJp,
      phone: phoneKey.phone,
      email: "",
      sms_api: "",
      otp: "",
      pplink_retry: PROTOCOL_PAYMENT_PPLINK_RETRY,
      otp_timeout: PROTOCOL_PAYMENT_OTP_TIMEOUT_SECONDS
    };
    logMessage(`协议支付创建任务请求: ${JSON.stringify({
      ...payload,
      input: `${accessToken.slice(0, 12)}...`
    })}`);
    const jobId = await createProtocolPaymentJob(payload);
    logMessage(`协议支付任务已创建: ${jobId}`);
    const result = await readProtocolPaymentEvents(jobId, phoneKey);
    if (result.ok) {
      await advancePhoneCursorAfterSuccess(phoneKey);
      await removeUsedProtocolCdk(cdkEntry);
      logMessage("协议支付任务成功");
    } else {
      logMessage(`协议支付任务失败: ${result.error || "未知错误"}`);
    }
    return {
      ...result,
      phoneKey,
      cdkEntry,
      jobId
    };
  }

  async function saveBrazilPixResumeContext(context) {
    state.brazilPixResume = normalizeBrazilPixResumeContext(context);
    await persistState();
    renderAutomationBatchControls();
  }

  async function clearBrazilPixResumeContext() {
    state.brazilPixResume = null;
    await persistState();
    renderAutomationBatchControls();
  }

  function isChatGptTab(tab) {
    const url = String(tab && tab.url || "");
    return url.startsWith("https://chatgpt.com");
  }

  async function getUsableBrazilPixTab(context) {
    const resumeContext = normalizeBrazilPixResumeContext(context);
    if (resumeContext) {
      try {
        const savedTab = await ext.tabs.get(resumeContext.tabId);
        if (isChatGptTab(savedTab)) {
          return savedTab;
        }
      } catch (_) {}
    }

    const activeTab = await getCurrentWindowActiveTab();
    if (isChatGptTab(activeTab)) {
      return activeTab;
    }

    const tabs = await ext.tabs.query({ url: "https://chatgpt.com/*" });
    return tabs && tabs.length ? tabs[tabs.length - 1] : null;
  }

  async function getCurrentBrowserChatGptSessionTab() {
    const activeTab = await getCurrentWindowActiveTab();
    if (isChatGptTab(activeTab)) {
      return activeTab;
    }

    try {
      const currentWindowTabs = await ext.tabs.query({
        currentWindow: true,
        url: "https://chatgpt.com/*"
      });
      if (currentWindowTabs && currentWindowTabs.length) {
        return currentWindowTabs[currentWindowTabs.length - 1];
      }
    } catch (_) {}

    const tabs = await ext.tabs.query({ url: "https://chatgpt.com/*" });
    if (tabs && tabs.length) {
      return tabs[tabs.length - 1];
    }

    logMessage("未找到 ChatGPT 标签页，正在打开 chatgpt.com 读取当前浏览器登录账号");
    const createdTab = await ext.tabs.create({
      url: "https://chatgpt.com",
      active: true
    });
    if (!createdTab || !createdTab.id) {
      throw new Error("打开 ChatGPT 标签页失败");
    }
    await waitForPageComplete(createdTab.id, 90000);
    return ext.tabs.get(createdTab.id);
  }

  async function finalizeBrazilPixPaymentSuccess(pixResult, context, options = {}) {
    const resumeContext = normalizeBrazilPixResumeContext(context);
    const thirdPartyAccount = resumeContext ? resumeContext.thirdPartyAccount : "";
    let thirdPartySubmitted = false;
    if (thirdPartyAccount) {
      try {
        logMessage("巴西 PIX 支付成功，正在提交到第三方接口...");
        const thirdPartyResult = await submitThirdPartyAccount({
          account: thirdPartyAccount,
          accessToken: pixResult.accessToken,
          payurl: ""
        });
        if (thirdPartyResult.ok) {
          thirdPartySubmitted = true;
          logMessage("第三方接口提交成功（巴西 PIX，支付链接为空）");
        } else {
          logMessage("第三方接口提交失败，账号仍按 PIX 支付成功处理: " + (thirdPartyResult.error || "未知错误"));
        }
      } catch (error) {
        logMessage("第三方接口提交异常，账号仍按 PIX 支付成功处理: " + formatError(error));
      }
    } else {
      logMessage("巴西 PIX: 未记录第三方账号，跳过第三方接口提交");
    }

    if (!options.skipSpecifiedAccountRemoval && resumeContext && !resumeContext.phoneRegistration && resumeContext.specifiedAccountEntry) {
      await removeSpecifiedAccountAfterPaymentSuccess(resumeContext.specifiedAccountEntry, resumeContext.registrationAccount);
    }
    return { thirdPartySubmitted };
  }

  async function continueBrazilPixPayment() {
    if (state.brazilPixContinueRunning) {
      logMessage("继续支付正在执行中");
      return { ok: false };
    }
    state.brazilPixContinueRunning = true;
    renderAutomationBatchControls();
    let nextContext = null;
    try {
      const resumeContext = normalizeBrazilPixResumeContext(state.brazilPixResume);
      const tab = await getUsableBrazilPixTab(resumeContext);
      if (!tab || !tab.id) {
        logMessage("错误: 未找到可继续支付的 ChatGPT 标签页，请切换到保留的 chatgpt.com 窗口后重试");
        return { ok: false };
      }

      nextContext = normalizeBrazilPixResumeContext({
        ...(resumeContext || {}),
        tabId: tab.id,
        windowId: tab.windowId,
        createdAt: Date.now()
      });
      if (nextContext) {
        await saveBrazilPixResumeContext(nextContext);
      }

      logMessage("继续巴西 PIX 支付流程...");
      const pixResult = await runBrazilPixPaymentFlow(tab.id);
      const stopAfterThirdPartySubmit = isStopAfterThirdPartySubmitEnabled();
      const finalizeResult = await finalizeBrazilPixPaymentSuccess(pixResult, nextContext, {
        skipSpecifiedAccountRemoval: stopAfterThirdPartySubmit
      });
      await clearBrazilPixResumeContext();
      if (finalizeResult && finalizeResult.thirdPartySubmitted && stopAfterThirdPartySubmit) {
        await finishAfterThirdPartySubmit(nextContext);
      } else if (nextContext && nextContext.thirdPartyAccount) {
        await handleSuccessfulAccountAuthorization({
          tabId: tab.id,
          sessionEmail: nextContext.sessionEmail,
          registrationMethod: nextContext.registrationMethod || (nextContext.phoneRegistration ? "phone" : "email"),
          proxy: nextContext.proxy
        });
      }
      logMessage("继续支付完成");
      return { ok: true };
    } catch (error) {
      if (nextContext) {
        await saveBrazilPixResumeContext(nextContext);
      }
      logMessage("继续支付失败，可修复接口/网络后再次点击继续支付: " + formatError(error));
      return { ok: false };
    } finally {
      state.brazilPixContinueRunning = false;
      renderAutomationBatchControls();
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
    AU: { country: "AU", currency: "AUD", paymentLocale: "en-AU" },
    NZ: { country: "NZ", currency: "NZD", paymentLocale: "en-NZ" },
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
        AU: { country: "AU", currency: "AUD", paymentLocale: "en-AU" },
        NZ: { country: "NZ", currency: "NZD", paymentLocale: "en-NZ" },
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

  async function submitThirdPartyAccountForPayment(accountInfo, label) {
    const submitLabel = label ? `（${label}）` : "";
    try {
      logMessage(`正在提交到第三方接口${submitLabel}...`);
      const thirdPartyResult = await submitThirdPartyAccount(accountInfo);
      if (thirdPartyResult.ok) {
        logMessage(`第三方接口提交成功${submitLabel}`);
        return true;
      }
      logMessage(`第三方接口提交失败${submitLabel}，继续支付流程: ${thirdPartyResult.error || "未知错误"}`);
      return false;
    } catch (error) {
      logMessage(`第三方接口提交异常${submitLabel}，继续支付流程: ${formatError(error)}`);
      return false;
    }
  }

  function getRoxyPhoneQueueText(prepared) {
    const phoneKey = prepared && prepared.phoneKey ? prepared.phoneKey : null;
    const raw = String(phoneKey && phoneKey.raw || "").trim();
    if (raw) {
      return raw;
    }
    const phone = String(phoneKey && phoneKey.phone || prepared && prepared.phone || "").trim();
    const smsUrl = String(phoneKey && phoneKey.smsUrl || "").trim();
    if (phone && smsUrl) {
      return `${phone}|${smsUrl}`;
    }
    return "";
  }

  async function pushRoxyPaymentTask(paypalUrl, prepared) {
    const urlQueueText = String(paypalUrl || "").trim();
    const phoneQueueText = getRoxyPhoneQueueText(prepared);
    if (!urlQueueText) {
      logMessage("Roxy 任务推送跳过: PayPal URL 为空");
      return false;
    }
    if (!phoneQueueText) {
      logMessage("Roxy 任务推送跳过: 当前手机号任务为空");
      return false;
    }
    try {
      logMessage("正在推送 Roxy 任务...");
      const resp = await fetch(ROXY_PUSH_API, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          roxyToken: ROXY_PUSH_TOKEN,
          workspaceId: ROXY_PUSH_WORKSPACE_ID,
          windowId: ROXY_PUSH_WINDOW_ID,
          urlQueueText,
          phoneQueueText
        })
      });
      let data = null;
      try {
        data = await resp.json();
      } catch (_) {}
      if (resp.ok && (!data || data.ok !== false)) {
        logMessage(`Roxy 任务推送成功: HTTP ${resp.status}${data && data.status ? "，已返回状态" : ""}`);
        return true;
      }
      const error = data && (data.error || data.message) ? (data.error || data.message) : `HTTP ${resp.status}`;
      logMessage(`Roxy 任务推送失败，继续支付流程: ${error}`);
      return false;
    } catch (error) {
      logMessage(`Roxy 任务推送异常，继续支付流程: ${formatError(error)}`);
      return false;
    }
  }

  async function finishAfterThirdPartySubmit(options) {
    const context = options && typeof options === "object" ? options : {};
    logMessage("已开启第三方接口提交成功后结束流程，本次流程按成功结束");
    if (!context.phoneRegistration && context.specifiedAccountEntry) {
      await removeSpecifiedAccountAfterPaymentSuccess(context.specifiedAccountEntry, context.registrationAccount);
    }
    const account = String(context.sessionEmail || context.registrationAccount || "").trim();
    if (account) {
      await rememberSuccessfulAuthorizationAccount({
        account,
        email: account,
        registrationMethod: context.registrationMethod,
        proxy: context.proxy
      });
    }
    return { ok: true, thirdPartySubmitOnly: true };
  }

  class ThirdPartySubmitOnlyComplete extends Error {
    constructor() {
      super("第三方接口提交成功后结束流程");
      this.name = "ThirdPartySubmitOnlyComplete";
    }
  }

  function isThirdPartySubmitOnlyComplete(error) {
    return error instanceof ThirdPartySubmitOnlyComplete ||
      (error && error.name === "ThirdPartySubmitOnlyComplete");
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

  async function updateThirdPartyRtToken(account, rtToken) {
    try {
      const resp = await fetch(THIRD_PARTY_ACCOUNTS_UPDATE_API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": THIRD_PARTY_API_KEY
        },
        body: JSON.stringify({
          account,
          rt_token: rtToken
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
        error: extractThirdPartyError(resp, data)
      };
    } catch (e) {
      return { ok: false, status: 0, data: null, error: e.message || "third-party rt_token update failed" };
    }
  }

  function getCodexSmsVoucherCode() {
    const input = document.getElementById("codexSmsVoucherInput");
    state.codexSmsVoucherCode = String(input && input.value || state.codexSmsVoucherCode || "").trim();
    return state.codexSmsVoucherCode;
  }

  function isContinueAuthorizationEnabled() {
    const input = document.getElementById("continueAuthorizationCheckbox");
    state.continueAuthorizationEnabled = input ? Boolean(input.checked) : false;
    return state.continueAuthorizationEnabled;
  }

  function normalizeAccountPlanType(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isTeamAuthorizationAccount(value) {
    const context = value && typeof value === "object" ? value : {};
    return normalizeAccountPlanType(context.planType || context.accountPlanType) === "team";
  }

  function normalizeAuthorizationAccount(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const account = String(value.account || value.email || "").trim();
    if (!account) {
      return null;
    }
    const registrationMethod = normalizeRegistrationMethod(value.registrationMethod);
    return {
      account,
      email: String(value.email || account).trim(),
      registrationMethod,
      planType: normalizeAccountPlanType(value.planType || value.accountPlanType),
      teamProviderDomain: normalizeTeamProviderDomain(
        value.teamProviderDomain ||
        value.providerDomain ||
        inferTeamProviderDomainFromEmail(account)
      ),
      proxy: isRuntimeProxy(value.proxy) ? { ...value.proxy } : null,
      createdAt: Number(value.createdAt) || Date.now()
    };
  }

  function cloneRuntimeProxy(proxy) {
    return isRuntimeProxy(proxy) ? { ...proxy } : null;
  }

  async function rememberSuccessfulAuthorizationAccount(context) {
    const account = normalizeAuthorizationAccount({
      ...context,
      createdAt: Date.now()
    });
    if (!account) {
      return null;
    }
    state.lastSuccessfulAuthorizationAccount = account;
    await persistState();
    renderAuthorizationControls();
    logMessage(`已记录最近成功账号，可执行 Codex 授权: ${account.account}`);
    return account;
  }

  function getAuthorizationPassword(accountContext) {
    const context = normalizeAuthorizationAccount(accountContext) || {};
    if (context.registrationMethod === "phone") {
      return PHONE_REGISTRATION_PASSWORD;
    }
    const settings = sanitizeFillSettings(state.fillSettings);
    return String(settings.passwordValue || DEFAULT_FILL_SETTINGS.passwordValue).trim() || DEFAULT_FILL_SETTINGS.passwordValue;
  }

  function setAuthorizationStatus(message, options = {}) {
    state.lastAuthorizationStatus = String(message || "");
    renderAuthorizationControls();
    if (options.persist) {
      persistState();
    }
  }

  function renderAuthorizationControls() {
    const checkbox = document.getElementById("continueAuthorizationCheckbox");
    const voucherInput = document.getElementById("codexSmsVoucherInput");
    const button = document.getElementById("authorizeCurrentAccountButton");
    const status = document.getElementById("authorizationStatus");
    if (checkbox) {
      checkbox.checked = Boolean(state.continueAuthorizationEnabled);
    }
    if (voucherInput && document.activeElement !== voucherInput) {
      voucherInput.value = state.codexSmsVoucherCode || "";
    }
    if (button) {
      const running = state.automationBatchRunning || state.authorizationRunning || state.teamRegistrationRunning;
      button.disabled = running;
      button.textContent = state.authorizationRunning ? "授权中" : "授权";
    }
    if (status) {
      const account = normalizeAuthorizationAccount(state.lastSuccessfulAuthorizationAccount);
      const statusText = state.lastAuthorizationStatus || "未执行";
      status.classList.toggle("empty", !state.lastAuthorizationStatus);
      status.textContent = [
        `授权状态: ${statusText}`,
        `最近账号: ${account ? account.account : "无"}`
      ].join("\n");
    }
  }

  function base64UrlFromBytes(bytes) {
    let binary = "";
    Array.from(bytes).forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  async function createPkcePair() {
    const random = new Uint8Array(64);
    globalThis.crypto.getRandomValues(random);
    const verifier = base64UrlFromBytes(random);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return {
      verifier,
      challenge: base64UrlFromBytes(new Uint8Array(digest))
    };
  }

  function createOauthState() {
    const random = new Uint8Array(24);
    globalThis.crypto.getRandomValues(random);
    return base64UrlFromBytes(random);
  }

  function buildCodexAuthorizeUrl(oauthState, challenge) {
    const params = new URLSearchParams({
      client_id: CODEX_OAUTH_CLIENT_ID,
      response_type: "code",
      redirect_uri: CODEX_OAUTH_REDIRECT_URI,
      scope: CODEX_OAUTH_SCOPE,
      state: oauthState,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "login",
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true"
    });
    return `${CODEX_OAUTH_ISSUER}/oauth/authorize?${params.toString()}`;
  }

  function parseOauthCallbackUrl(url, expectedState) {
    const text = String(url || "");
    if (!text.includes("/auth/callback") && !text.includes("code=") && !text.includes("error=")) {
      return null;
    }
    let parsed;
    try {
      parsed = new URL(text);
    } catch (_) {
      return null;
    }
    const code = String(parsed.searchParams.get("code") || "").trim();
    const resultState = String(parsed.searchParams.get("state") || "").trim();
    const error = String(parsed.searchParams.get("error") || "").trim();
    const errorDescription = String(parsed.searchParams.get("error_description") || "").trim();
    if (resultState && resultState !== expectedState) {
      return { error: "invalid_state", errorDescription: `expected ${expectedState}, got ${resultState}`, state: resultState };
    }
    if (error) {
      return { error, errorDescription, state: resultState };
    }
    if (code) {
      return { code, state: resultState };
    }
    return null;
  }

  async function exchangeCodexOAuthCode(code, verifier) {
    const response = await fetch(`${CODEX_OAUTH_ISSUER}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CODEX_OAUTH_CLIENT_ID,
        code,
        redirect_uri: CODEX_OAUTH_REDIRECT_URI,
        code_verifier: verifier
      })
    });
    let data = null;
    try {
      data = await response.json();
    } catch (_) {}
    if (!response.ok) {
      throw new Error(`Codex token 交换失败: HTTP ${response.status}`);
    }
    const refreshToken = String(data && data.refresh_token || "").trim();
    if (!refreshToken) {
      throw new Error("Codex token 响应缺少 refresh_token");
    }
    return data;
  }

  async function getOAuthPageState(tabId) {
    try {
      const result = await executePageFunction(tabId, "__gptAutoRegisterOAuthPageState", {}, {
        loadTimeoutMs: 12000,
        scriptableTimeoutMs: 12000
      });
      return result || {};
    } catch (error) {
      return { ok: false, error: formatError(error) };
    }
  }

  async function setFirstOAuthValue(tabId, selectors, value, label) {
    const result = await executePageFunction(tabId, "__gptAutoRegisterSetFirstValue", {
      selectors,
      value,
      timeoutMs: 15000
    }, {
      loadTimeoutMs: 15000
    });
    if (!result || !result.ok) {
      throw new Error(`${label || "授权输入"}失败: ${(result && result.error) || "未找到输入框"}`);
    }
    return result;
  }

  async function clickOAuthContinue(tabId, label) {
    const result = await executePageFunction(tabId, "__gptAutoRegisterClickOauthContinue", {
      timeoutMs: 15000
    }, {
      loadTimeoutMs: 15000
    });
    if (!result || !result.ok) {
      throw new Error(`${label || "授权继续按钮"}点击失败: ${(result && result.error) || "未找到按钮"}`);
    }
    return result;
  }

  async function clickChooseAccountSession(tabId) {
    const result = await executePageFunction(tabId, "__gptAutoRegisterClickChooseAccountSession", {
      timeoutMs: 15000
    }, {
      loadTimeoutMs: 15000
    });
    if (!result || !result.ok) {
      throw new Error(`选择已登录账号失败: ${(result && result.error) || "未找到 session_id"}`);
    }
    return result;
  }

  async function fillOAuthCode(tabId, code, label) {
    const result = await executePageFunction(tabId, "__gptAutoRegisterFillGenericOtp", {
      value: code,
      timeoutMs: 30000
    }, {
      loadTimeoutMs: 15000
    });
    if (!result || !result.ok) {
      throw new Error(`${label || "验证码"}输入失败: ${(result && result.error) || "未找到验证码输入框"}`);
    }
    return result;
  }

  async function redeemCodexPhone(voucherCode) {
    const response = await fetch(`${CODEX_PHONE_API_BASE}/api/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: voucherCode })
    });
    const payload = await readJsonResponse(response, "Codex 接码券兑换");
    if (!response.ok || payload.ok === false) {
      const message = payload.error || payload.message || `HTTP ${response.status}`;
      throw new Error(`Codex 接码券兑换失败: ${message}`);
    }
    const activationId = String(payload.activationId || payload.activation_id || "").trim();
    const phoneNumber = String(payload.phoneNumber || payload.phone_number || "").trim();
    if (!activationId || !phoneNumber) {
      throw new Error("Codex 接码券兑换响应缺少 activationId 或 phoneNumber");
    }
    return {
      activationId,
      phoneNumber,
      cancelAvailableAt: payload.cancelAvailableAt || payload.cancel_available_at || null
    };
  }

  function extractCodexSmsCode(payload) {
    const candidates = [];
    const pushCandidate = (value) => {
      if (value !== undefined && value !== null) {
        candidates.push(String(value));
      }
    };
    pushCandidate(payload && payload.code);
    pushCandidate(payload && payload.smsCode);
    pushCandidate(payload && payload.sms_code);
    pushCandidate(payload && payload.text);
    const activation = payload && payload.activation;
    if (activation && typeof activation === "object") {
      pushCandidate(activation.code);
      pushCandidate(activation.smsCode);
      pushCandidate(activation.sms_code);
      pushCandidate(activation.text);
      const activationSms = activation.sms;
      if (activationSms && typeof activationSms === "object") {
        pushCandidate(activationSms.code);
        pushCandidate(activationSms.text);
      }
    }
    for (const candidate of candidates) {
      const exact = candidate.trim();
      if (/^\d{4,8}$/.test(exact)) {
        return exact;
      }
      const match = candidate.match(/\b(\d{4,8})\b/);
      if (match) {
        return match[1];
      }
    }
    return "";
  }

  async function waitCodexSmsCode(activationId, timeoutMs) {
    const deadline = Date.now() + (Number(timeoutMs) || CODEX_SMS_WAIT_MS);
    while (Date.now() <= deadline) {
      const response = await fetch(`${CODEX_PHONE_API_BASE}/api/activations/${encodeURIComponent(activationId)}/status`, {
        method: "GET",
        cache: "no-store"
      });
      const payload = await readJsonResponse(response, "Codex 短信状态");
      if (!response.ok) {
        throw new Error(`Codex 短信状态查询失败: HTTP ${response.status}`);
      }
      const code = extractCodexSmsCode(payload);
      if (code) {
        return code;
      }
      await delay(5000);
    }
    throw new Error("Codex 短信验证码等待超时");
  }

  async function cancelCodexPhoneActivation(activation) {
    if (!activation || !activation.activationId) {
      return;
    }
    try {
      const response = await fetch(`${CODEX_PHONE_API_BASE}/api/activations/${encodeURIComponent(activation.activationId)}/cancel`, {
        method: "POST"
      });
      if (response.status === 400) {
        let payload = {};
        try {
          payload = await response.json();
        } catch (_) {}
        const remainingMs = Number(payload && payload.remainingMs);
        if (Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= 15000) {
          await delay(remainingMs + 1000);
          await fetch(`${CODEX_PHONE_API_BASE}/api/activations/${encodeURIComponent(activation.activationId)}/cancel`, {
            method: "POST"
          });
        }
      }
    } catch (error) {
      logMessage(`Codex 手机号取消失败，继续流程: ${formatError(error)}`);
    }
  }

  async function handleCodexPhoneVerification(tabId, voucherCode) {
    if (!String(voucherCode || "").trim()) {
      throw new Error("缺少 Codex 接码券，无法完成手机号验证");
    }
    for (let attempt = 1; attempt <= CODEX_PHONE_VERIFY_ATTEMPTS; attempt += 1) {
      let activation = null;
      try {
        logMessage(`Codex 授权手机号验证: 兑换手机号 ${attempt}/${CODEX_PHONE_VERIFY_ATTEMPTS}`);
        activation = await redeemCodexPhone(voucherCode);
        await setFirstOAuthValue(tabId, ["#tel", 'input[type="tel"]'], activation.phoneNumber, "手机号");
        await executePageFunction(tabId, "__gptAutoRegisterClickSmsRadioIfPresent", {}, {
          loadTimeoutMs: 5000
        }).catch(() => null);
        await clickOAuthContinue(tabId, "手机号提交");
        await delay(3000);
        let pageState = await getOAuthPageState(tabId);
        if (pageState && (pageState.phoneSubmitError || pageState.telInvalid)) {
          throw new Error("手机号被页面拒绝");
        }
        logMessage("Codex 授权手机号已提交，等待短信验证码");
        const smsCode = await waitCodexSmsCode(activation.activationId, CODEX_SMS_WAIT_MS);
        await fillOAuthCode(tabId, smsCode, "短信验证码");
        await clickOAuthContinue(tabId, "短信验证码提交");
        await delay(3000);
        pageState = await getOAuthPageState(tabId);
        if (pageState && pageState.telInvalid) {
          throw new Error("短信验证码被页面拒绝");
        }
        logMessage("Codex 授权手机号验证已提交");
        return true;
      } catch (error) {
        logMessage(`Codex 授权手机号验证失败 ${attempt}/${CODEX_PHONE_VERIFY_ATTEMPTS}: ${formatError(error)}`);
        await cancelCodexPhoneActivation(activation);
        if (attempt >= CODEX_PHONE_VERIFY_ATTEMPTS) {
          throw error;
        }
        try {
          await ext.tabs.goBack(tabId);
          await delay(3000);
        } catch (_) {}
        try {
          await executePageFunction(tabId, "__gptAutoRegisterClick", {
            selector: 'button[value="resend"]',
            timeoutMs: 5000
          }, {
            loadTimeoutMs: 5000
          });
          await delay(3000);
        } catch (_) {}
      }
    }
    return false;
  }

  async function pollCodexEmailCode(email, triedCodes, timeoutMs) {
    const deadline = Date.now() + (Number(timeoutMs) || 120000);
    while (Date.now() <= deadline) {
      const code = await fetchVerificationCode(email);
      const normalized = String(code || "").trim();
      if (/^\d{6}$/.test(normalized) && !triedCodes.has(normalized)) {
        triedCodes.add(normalized);
        return normalized;
      }
      await delay(3000);
    }
    return "";
  }

  async function driveCodexOAuthTab(tabId, context, oauthState, voucherCode) {
    const email = String(context.account || context.email || "").trim();
    const password = getAuthorizationPassword(context);
    const teamAuthorization = isTeamAuthorizationAccount(context);
    const teamProviderDomain = getTeamProviderDomainForAccount(context);
    const teamProvider = getTeamProviderDefinition(teamProviderDomain);
    const triedEmailCodes = new Set();
    const deadline = Date.now() + CODEX_AUTH_TIMEOUT_MS;
    let lastAction = "";

    while (Date.now() <= deadline) {
      const tab = await ext.tabs.get(tabId);
      const currentUrl = String(tab && tab.url || "");
      const callback = parseOauthCallbackUrl(currentUrl, oauthState);
      if (callback) {
        if (callback.error) {
          throw new Error(`OAuth callback error: ${callback.errorDescription || callback.error}`);
        }
        if (!callback.code) {
          throw new Error("OAuth callback 缺少 authorization code");
        }
        return callback.code;
      }

      const pageState = await getOAuthPageState(tabId);
      const href = String(pageState.href || currentUrl || "");
      if (parseOauthCallbackUrl(href, oauthState)) {
        continue;
      }

      if (teamAuthorization && href.startsWith(teamProvider.authorizeUrlPrefix)) {
        lastAction = "team_invite";
        await submitTeamProviderAuthorizeForm(tabId, email, teamProviderDomain, "Codex Team 授权");
        await delay(3000);
        continue;
      }

      if (pageState.hasPhoneInput || href.toLowerCase().includes("add-phone") || href.toLowerCase().includes("phone-verification")) {
        if (teamAuthorization) {
          throw new Error("Codex Team 授权不应进入 add-phone/phone-verification 页面");
        }
        lastAction = "phone";
        await handleCodexPhoneVerification(tabId, voucherCode);
        await delay(2000);
        continue;
      }

      if (pageState.hasChooseAccountSession || href.toLowerCase().includes("/choose-an-account")) {
        lastAction = "choose_account";
        logMessage("Codex 授权: 检测到 choose-an-account，点击已登录账号");
        await clickChooseAccountSession(tabId);
        await delay(3000);
        continue;
      }

      if (pageState.hasEmailInput) {
        lastAction = "email";
        logMessage(`Codex 授权: 输入邮箱 ${email}`);
        await setFirstOAuthValue(tabId, [
          "#email",
          'input[type="email"]',
          'input[name="username"]',
          'input[name="email"]',
          'input[autocomplete="username"]'
        ], email, "邮箱");
        await clickOAuthContinue(tabId, "邮箱提交");
        await delay(3000);
        continue;
      }

      if (pageState.hasPasswordInput) {
        lastAction = "password";
        logMessage("Codex 授权: 输入密码");
        await setFirstOAuthValue(tabId, [
          'input[type="password"]',
          'input[name="password"]',
          'input[name="current-password"]',
          "#password"
        ], password, "密码");
        await clickOAuthContinue(tabId, "密码提交");
        await delay(3000);
        continue;
      }

      if (pageState.hasCodeInput) {
        lastAction = "email_otp";
        logMessage("Codex 授权: 等待邮箱验证码");
        const code = await pollCodexEmailCode(email, triedEmailCodes, 120000);
        if (!code) {
          throw new Error("Codex 授权未获取到邮箱验证码");
        }
        await fillOAuthCode(tabId, code, "邮箱验证码");
        await clickOAuthContinue(tabId, "邮箱验证码提交");
        await delay(3000);
        continue;
      }

      if (pageState.isConsent || pageState.hasContinueButton) {
        lastAction = "continue";
        logMessage("Codex 授权: 点击继续/确认");
        await clickOAuthContinue(tabId, "继续/确认");
        await delay(3000);
        continue;
      }

      await delay(1500);
    }

    throw new Error(`等待 Codex OAuth callback 超时${lastAction ? `，最后动作: ${lastAction}` : ""}`);
  }

  async function authorizeCodexAccount(accountContext, options = {}) {
    const context = normalizeAuthorizationAccount(accountContext);
    if (!context) {
      throw new Error("没有可授权的最近成功账号");
    }
    const voucherCode = String(options.smsVoucherCode || getCodexSmsVoucherCode()).trim();
    const teamAuthorization = isTeamAuthorizationAccount(context);
    if (!voucherCode && !teamAuthorization) {
      throw new Error("请输入 Codex 接码券");
    }
    if (state.authorizationRunning && !options.allowConcurrent) {
      throw new Error("授权正在执行中");
    }

    state.authorizationRunning = true;
    setAuthorizationStatus(`授权中: ${context.account}`, { persist: true });
    renderAutomationBatchControls();

    let proxyAppliedForAuthorization = false;
    try {
      if (isRuntimeProxy(context.proxy)) {
        await applyFirefoxProxy(context.proxy);
        state.currentProxy = cloneRuntimeProxy(context.proxy);
        proxyAppliedForAuthorization = true;
        renderProxyStatus();
        await persistState();
        logMessage(`Codex 授权: 已切换到注册时代理 ${formatProxy(context.proxy)}`);
      } else {
        await clearFirefoxProxyState();
        state.currentProxy = null;
        state.currentIpLocation = null;
        renderProxyStatus();
        await persistState();
        logMessage("Codex 授权: 注册时未使用代理，已清除当前 Firefox 代理");
      }
      const pkce = await createPkcePair();
      const oauthState = createOauthState();
      const authorizeUrl = buildCodexAuthorizeUrl(oauthState, pkce.challenge);
      const oauthTab = await updatePrivateAuthorizationTab(authorizeUrl, options);
      logMessage(`Codex 授权: 已在当前隐私窗口打开授权页面 ${context.account}`);
      const code = await driveCodexOAuthTab(oauthTab.id, context, oauthState, voucherCode);
      logMessage("Codex 授权: 已获取 authorization code，交换 token");
      const tokens = await exchangeCodexOAuthCode(code, pkce.verifier);
      const refreshToken = String(tokens.refresh_token || "").trim();
      logMessage("Codex 授权: token 获取成功，正在更新第三方 rt_token");
      const updateResult = await updateThirdPartyRtToken(context.account, refreshToken);
      if (!updateResult.ok) {
        throw new Error(`第三方 rt_token 更新失败: ${updateResult.error || `HTTP ${updateResult.status}`}`);
      }
      setAuthorizationStatus(`成功: ${context.account}`, { persist: true });
      logMessage(`Codex 授权成功，已更新第三方 rt_token: ${context.account}`);
      return { ok: true, account: context.account };
    } catch (error) {
      setAuthorizationStatus(`失败: ${context.account}，${formatError(error)}`, { persist: true });
      throw error;
    } finally {
      if (proxyAppliedForAuthorization && options.cleanupProxyAfter) {
        await cleanupAutomationProxy("授权任务已关闭");
      }
      state.authorizationRunning = false;
      renderAuthorizationControls();
      renderAutomationBatchControls();
      await persistState();
    }
  }

  async function authorizeCurrentBrowserSessionAccount() {
    if (state.automationBatchRunning) {
      logMessage("完整流程运行中，暂不执行手动授权");
      return { ok: false };
    }
    try {
      const sessionTab = await getCurrentBrowserChatGptSessionTab();
      const session = await getChatGptSessionFromTab(sessionTab.id);
      const sessionEmail = String(session && session.userEmail || "").trim();
      if (!sessionEmail) {
        throw new Error("ChatGPT session user.email: null");
      }
      const planType = normalizeAccountPlanType(session && session.accountPlanType);
      const voucherCode = getCodexSmsVoucherCode();
      if (!voucherCode && planType !== "team") {
        logMessage("错误: 请输入 Codex 接码券");
        return { ok: false };
      }
      logMessage(`手动授权账号取自当前浏览器 ChatGPT session user.email: ${sessionEmail}${planType ? `，planType=${planType}` : ""}`);
      const account = await rememberSuccessfulAuthorizationAccount({
        account: sessionEmail,
        email: sessionEmail,
        registrationMethod: "email",
        planType,
        teamProviderDomain: getTeamProviderDomainForAccount({ account: sessionEmail, email: sessionEmail }),
        proxy: cloneRuntimeProxy(state.currentProxy)
      });
      return await authorizeCodexAccount(account, {
        smsVoucherCode: voucherCode,
        cleanupProxyAfter: true,
        tabId: sessionTab.id,
        windowId: sessionTab.windowId
      });
    } catch (error) {
      logMessage("Codex 授权失败: " + formatError(error));
      return { ok: false, error: formatError(error) };
    }
  }

  async function handleSuccessfulAccountAuthorization(context) {
    try {
      const tabId = Number(context && context.tabId);
      const cachedSessionEmail = String(context && context.sessionEmail || "").trim();
      if (!cachedSessionEmail && (!Number.isInteger(tabId) || tabId < 0)) {
        throw new Error("缺少 ChatGPT 标签页，无法读取 session user.email");
      }
      let session = null;
      if (Number.isInteger(tabId) && tabId >= 0) {
        try {
          session = await getChatGptSessionFromTab(tabId);
        } catch (error) {
          logMessage(`读取 ChatGPT session planType 失败，继续使用已有授权上下文: ${formatError(error)}`);
        }
      }
      const sessionEmail = cachedSessionEmail || String(session && session.userEmail || "").trim();
      if (!sessionEmail) {
        throw new Error("ChatGPT session user.email: null");
      }
      const planType = normalizeAccountPlanType(
        (context && (context.planType || context.accountPlanType)) ||
        (session && session.accountPlanType)
      );
      logMessage(`Codex 授权账号取自 ChatGPT session user.email: ${sessionEmail}${planType ? `，planType=${planType}` : ""}`);
      const account = await rememberSuccessfulAuthorizationAccount({
        ...context,
        account: sessionEmail,
        email: sessionEmail,
        planType,
        teamProviderDomain: getTeamProviderDomainForAccount({
          ...context,
          account: sessionEmail,
          email: sessionEmail
        })
      });
      if (!account || !isContinueAuthorizationEnabled()) {
        return;
      }
      const voucherCode = getCodexSmsVoucherCode();
      if (!voucherCode && !isTeamAuthorizationAccount(account)) {
        logMessage("继续授权已开启，但未填写 Codex 接码券，跳过自动授权");
        setAuthorizationStatus(`跳过: ${account.account}，缺少接码券`, { persist: true });
        return;
      }
      await authorizeCodexAccount(account, {
        smsVoucherCode: voucherCode,
        cleanupProxyAfter: false,
        tabId,
        windowId: context && context.windowId
      });
    } catch (error) {
      logMessage(`Codex 授权收尾失败，注册/支付成功仍保留: ${formatError(error)}`);
    }
  }

  async function prepareRegistrationEmail(specifiedAccountEntry) {
    const specifiedEmail = specifiedAccountEntry && specifiedAccountEntry.email
      ? String(specifiedAccountEntry.email || "").trim()
      : "";
    if (specifiedEmail) {
      logMessage(`使用指定注册邮箱: ${specifiedEmail}`);
      return specifiedEmail;
    }

    try {
      const response = await ext.runtime.sendMessage({
        type: "gptAutoRegisterICloudHme",
        action: "generateAndReserve",
        label: "chatgpt.com"
      });
      const email = response && response.ok ? String(response.email || "").trim() : "";
      if (email) {
        logMessage(`主窗口已获取 iCloud 隐藏邮箱: ${email}`);
        return email;
      }
      throw new Error((response && response.error) || "background 未返回 iCloud 邮箱");
    } catch (error) {
      const fallbackEmail = generateDomainEmail();
      logMessage(`iCloud 隐藏邮箱获取失败，使用域名邮箱兜底: ${fallbackEmail}，原因: ${formatError(error)}`);
      return fallbackEmail;
    }
  }

  async function runRegistration(tabId, preparedEmail = "") {
    setActiveStep(1);
    const email = String(preparedEmail || "").trim();
    if (!email) {
      logMessage("错误: 注册邮箱为空");
      return { ok: false };
    }
    logMessage("等待 chatgpt.com 页面加载完成...");
    const pageLoaded = await waitForPageComplete(tabId, 90000);
    if (!pageLoaded) {
      logMessage("错误: chatgpt.com 页面加载超时");
      return { ok: false };
    }
    logMessage("等待注册按钮...");
    const clickRegisterCode = `
      (function() {
        const regBtn = document.querySelector('button[data-testid="login-button"]');
        if (regBtn) { regBtn.click(); return true; }
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

    const randomName = generateRandomName();
    const randomAge = generateRandomAge();
    const randomBirthday = generateRandomBirthday();
    logMessage(`注册窗口填入邮箱: ${email}`);

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
    for (let i = 0; i < EMAIL_CODE_POLL_ATTEMPTS; i += 1) {
      code = await fetchVerificationCode(email);
      if (code) break;
      await delay(POLL_DELAY_MS);
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
    return { ok: true, email, account: email, registrationMethod: "email" };
  }

  async function runPhoneRegistration(tabId) {
    setActiveStep(1);
    const heroNumber = await getHeroNumber();
    let activationShouldCancel = true;
    const phoneNumber = heroNumber.phoneNumber;
    const activationId = heroNumber.activationId;
    const randomName = generateRandomName();
    const randomAge = generateRandomAge();
    const randomBirthday = generateRandomBirthday();
    try {
      logMessage("等待 chatgpt.com 页面加载完成...");
      const pageLoaded = await waitForPageComplete(tabId, 90000);
      if (!pageLoaded) {
        throw new Error("chatgpt.com 页面加载超时");
      }

      logMessage("等待注册按钮...");
      await scrollTabToBottom(tabId);
      await requirePageResult(tabId, "__gptAutoRegisterClickButtonByText", {
        pattern: "注册|登录|Sign up|Create account"
      }, "注册按钮点击失败", {
        loadTimeoutMs: 15000
      });
      logMessage("已点击注册按钮，等待账号入口...");
      await delay(3000);

      await requirePageResult(tabId, "__gptAutoRegisterClickByIndex", {
        selector: "form[novalidate] button",
        index: 2,
        timeoutMs: 30000
      }, "未找到手机号注册入口按钮");
      logMessage("已切换到手机号注册入口");
      await delay();

      await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
        selector: 'input[type="tel"]',
        value: '+' + phoneNumber,
        timeoutMs: 30000
      }, "未找到手机号输入框");
      logMessage(`已输入注册手机号: ${phoneNumber}`);
      await delay(1000);
      await clickPageElement(tabId, {
        selector: 'button[type="submit"]',
        timeoutMs: 30000
      }, "手机号提交按钮点击失败");
      await delay();
      await requirePageResult(tabId, "__gptAutoRegisterWaitForUrlPrefix", {
        prefix: "https://auth.openai.com/create-account/password",
        timeoutMs: 90000
      }, "未进入密码设置页面");
      await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
        selector: 'input[name="new-password"]',
        value: PHONE_REGISTRATION_PASSWORD,
        timeoutMs: 30000
      }, "未找到新密码输入框");
      logMessage("已输入手机号注册固定密码");
      logMessage("点击提交");
      await clickPageElement(tabId, {
        selector: 'button[type="submit"]',
        timeoutMs: 10000
      }, "密码提交按钮点击失败");
      logMessage("已经点击提交");
      await delay();
      // await requirePageResult(tabId, "__gptAutoRegisterWaitForUrlPrefix", {
      //   prefix: "https://auth.openai.com/contact-verification",
      //   timeoutMs: 90000
      // }, "未进入联系方式验证页面");
      logMessage("开始获取手机号验证码");
      const smsCode = await pollHeroSmsCode(activationId);
      await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
        selector: 'input[name="code"]',
        value: smsCode,
        timeoutMs: 30000
      }, "未找到短信验证码输入框");
      logMessage("已输入手机号短信验证码");
      await clickPageElement(tabId, {
        selector: 'button[type="submit"]',
        timeoutMs: 30000
      }, "未找到完成验证按钮");
      await setHeroSmsStatus(activationId, 6);
      activationShouldCancel = false;
      logMessage("手机号联系方式验证已提交");
      logMessage("等待 about-you 页面，准备填写姓名和年龄");
      const nameAgeSubmitted = await submitNameAgeWithTryAgainRetry(tabId, randomName, randomAge, randomBirthday);
      if (!nameAgeSubmitted) {
        throw new Error("手机号注册 about-you 姓名和年龄提交失败");
      }
      return {
        ok: true,
        account: phoneNumber,
        phone: phoneNumber,
        activationId,
        registrationMethod: "phone"
      };
    } catch (error) {
      if (activationShouldCancel) {
        await setHeroSmsStatus(activationId, 8);
      }
      throw error;
    }
  }

  async function runSelectedRegistration(tabId, specifiedAccountEntry) {
    if (isPhoneRegistrationMethod()) {
      logMessage("第一步代理处理完成，开始手机号注册");
      return runPhoneRegistration(tabId);
    }
    logMessage("第一步代理处理完成，开始获取注册邮箱");
    const registrationEmail = await prepareRegistrationEmail(specifiedAccountEntry);
    return runRegistration(tabId, registrationEmail);
  }

  async function completePhoneRegistrationPromoEmailVerification(tabId, registration) {
    if (!registration || registration.registrationMethod !== "phone") {
      return registration;
    }
    const email = await prepareRegistrationEmail(null);
    logMessage(`手机号注册后绑定邮箱: ${email}`);
    await updateTabUrl(tabId, "https://chatgpt.com/?promo_campaign=plus-1-month-free#pricing");
    await delay(3000);
    await requirePageResult(tabId, "__gptAutoRegisterClick", {
      selector: "button.btn-purple.btn-large.w-full",
      timeoutMs: 60000
    }, "未找到 Plus promo 按钮");
    logMessage("已点击 Plus promo 按钮，等待邮箱输入框");
    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: "#email",
      value: email,
      timeoutMs: 60000
    }, "未找到邮箱输入框");
    await clickPageElement(tabId, {
      selector: 'button[type="submit"]',
      timeoutMs: 30000
    }, "邮箱提交按钮点击失败");

    logMessage("已提交绑定邮箱，轮询邮箱验证码...");
    let code = null;
    for (let i = 0; i < EMAIL_CODE_POLL_ATTEMPTS; i += 1) {
      code = await fetchVerificationCode(email);
      if (code) break;
      await delay(POLL_DELAY_MS);
    }
    if (!code) {
      throw new Error("手机号注册后绑定邮箱未获取到验证码");
    }

    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: "#otp",
      value: code,
      timeoutMs: 60000
    }, "未找到邮箱验证码输入框");
    await clickPageElement(tabId, {
      selector: 'button[type="submit"]',
      timeoutMs: 30000
    }, "邮箱验证码提交按钮点击失败");
    logMessage("手机号注册后邮箱验证码已提交");
    logMessage("邮箱验证后主动打开 chatgpt.com");
    await updateTabUrl(tabId, "https://chatgpt.com");
    await delay(20000)
    return {
      ...registration,
      email,
      account: registration.account || registration.phone || email
    };
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
      await delay(1000);
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

  async function preparePrivateAutomationDebugView(windowId) {
    if (windowId === undefined || windowId === null) {
      return;
    }
    try {
      const response = await ext.runtime.sendMessage({
        type: "gptAutoRegisterAutomationHeaders",
        action: "apply",
        windowId,
        userAgent: AUTOMATION_USER_AGENT
      });
      if (!response || response.ok !== true) {
        throw new Error(response && response.error ? response.error : "background 未确认 User-Agent 设置");
      }
      logMessage("隐私窗口 User-Agent 已设置为 SamsungBrowser Android");
    } catch (error) {
      logMessage("隐私窗口 User-Agent 设置失败: " + formatError(error));
    }

    try {
      const responsiveWindowWidth = AUTOMATION_RESPONSIVE_VIEWPORT_WIDTH + 870;
      await ext.windows.update(windowId, {
        focused: true,
        width: responsiveWindowWidth,
        height: AUTOMATION_RESPONSIVE_WINDOW_HEIGHT
      });
      logMessage(`隐私窗口已调整为响应式尺寸 ${responsiveWindowWidth}x${AUTOMATION_RESPONSIVE_WINDOW_HEIGHT}，其中页面目标宽度 ${AUTOMATION_RESPONSIVE_VIEWPORT_WIDTH}`);
    } catch (error) {
      logMessage("隐私窗口响应式尺寸调整失败: " + formatError(error));
    }

    logMessage("Firefox 扩展无法直接打开原生 DevTools/响应式设计模式；如需工具箱，请在隐私窗口按 Ctrl+Shift+I，再按 Ctrl+Shift+M");
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
    await ext.tabs.update(tab.id, { url, active: true });
    await preparePrivateAutomationDebugView(createdWindow.id);
    return {
      windowId: createdWindow.id,
      tab: await ext.tabs.get(tab.id)
    };
  }

  async function closeAutomationWindow(windowId, options = {}) {
    if (windowId === undefined || windowId === null) {
      return false;
    }
    if (options.keepOpen) {
      logMessage("已保留自动化窗口");
      return false;
    }
    if (isDebugModeEnabled()) {
      logMessage("调试模式已开启，保留自动化窗口");
      return false;
    }
    try {
      if (!options.immediate) {
        await delay(AUTOMATION_WINDOW_CLOSE_DELAY_MS);
      }
      await ext.windows.remove(windowId);
      await clearPrivateAutomationHeaders(windowId);
      return true;
    } catch (error) {
      console.warn("Failed to close automation private window", error);
      return false;
    }
  }

  async function clearPrivateAutomationHeaders(windowId) {
    if (windowId === undefined || windowId === null) {
      return;
    }
    try {
      await ext.runtime.sendMessage({
        type: "gptAutoRegisterAutomationHeaders",
        action: "clear",
        windowId
      });
    } catch (error) {
      console.warn("Failed to clear automation headers", error);
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
    const primary = normalizeCheckoutRegion(primaryRegion);
    const officialRegions = [primary].concat(PAY_URL_OFFICIAL_REGION_ORDER.filter((region) => region !== primary));
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
    state.lastCheckoutRegion = normalizeCheckoutRegion(result && result.checkoutRegion);
    state.payUrlMode = mode;
    document.getElementById("payUrlInput").value = selectedLink;
    await persistState();
    if (mode === "short") {
      logMessage(`支付链接获取成功，实际地区 ${state.lastCheckoutRegion}，已选择短链: ${selectedLink}`);
    } else {
      logMessage(`支付链接获取成功，实际地区 ${state.lastCheckoutRegion}，已选择长链: ${selectedLink}`);
    }
    return selectedLink;
  }

  async function requestCheckoutLinkFromNewAutomationWindow(countrySel, closeReason, payUrlMode = getPayUrlMode()) {
    let automationWindowId = null;
    let checkoutLinkSucceeded = false;
    try {
      const automationWindow = await createPrivateAutomationWindow("https://chatgpt.com");
      automationWindowId = automationWindow.windowId;
      const tab = automationWindow.tab;
      logMessage("已打开窗口，准备在打开的窗口里获取支付链接");

      if (!(await waitForChatGptAfterRegistration(tab.id))) {
        return { ok: false, error: "打开的窗口未成功到达 chatgpt.com" };
      }

      const result = await requestCheckoutLinkWithOfficialRegionRetry(
        (region) => requestChatGptCheckoutLinkFromTab(tab.id, region, payUrlMode),
        countrySel
      );
      checkoutLinkSucceeded = Boolean(result && result.ok && hasCheckoutPaymentLink(result));
      return result;
    } finally {
      const windowClosed = await closeAutomationWindow(automationWindowId, { failed: !checkoutLinkSucceeded });
      if (closeReason && windowClosed) {
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
    await ext.tabs.update(tab.id, { url, active: true });
    return ext.tabs.get(tab.id);
  }

  async function getActiveTabInWindow(windowId) {
    const activeTabs = await ext.tabs.query({ windowId, active: true });
    if (activeTabs && activeTabs[0]) {
      return activeTabs[0];
    }
    const tabs = await ext.tabs.query({ windowId });
    return tabs && tabs[0] ? tabs[0] : null;
  }

  async function findOpenPrivateWindow() {
    const windows = await ext.windows.getAll({ populate: true });
    const privateWindows = (windows || []).filter((item) => item && item.incognito);
    if (!privateWindows.length) {
      return null;
    }
    return privateWindows.find((item) => item.focused) || privateWindows[privateWindows.length - 1];
  }

  async function updatePrivateAuthorizationTab(url, options = {}) {
    let tab = null;
    const optionTabId = Number(options && options.tabId);
    const optionWindowId = Number(options && options.windowId);

    if (Number.isInteger(optionTabId) && optionTabId >= 0) {
      try {
        const candidate = await ext.tabs.get(optionTabId);
        if (candidate && candidate.id !== undefined && candidate.incognito) {
          tab = candidate;
        }
      } catch (error) {
        console.warn("Failed to get authorization tab", error);
      }
    }

    if (!tab && Number.isInteger(optionWindowId) && optionWindowId >= 0) {
      try {
        const windowInfo = await ext.windows.get(optionWindowId);
        if (windowInfo && windowInfo.incognito) {
          tab = await getActiveTabInWindow(optionWindowId);
        }
      } catch (error) {
        console.warn("Failed to get authorization window", error);
      }
    }

    if (!tab) {
      const privateWindow = await findOpenPrivateWindow();
      if (!privateWindow || privateWindow.id === undefined) {
        throw new Error("未找到已打开的隐私窗口，请先打开隐私窗口再执行授权");
      }
      tab = await getActiveTabInWindow(privateWindow.id);
      if (!tab && privateWindow.id !== undefined) {
        tab = await ext.tabs.create({ windowId: privateWindow.id, active: true });
      }
    }

    if (!tab || tab.id === undefined || !tab.incognito) {
      throw new Error("未找到可用于授权的隐私标签页");
    }

    if (tab.windowId !== undefined) {
      try {
        await ext.windows.update(tab.windowId, { focused: true });
      } catch (_) {}
    }
    await ext.tabs.update(tab.id, { url, active: true });
    return ext.tabs.get(tab.id);
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
    const startToStep2Button = document.getElementById("startToStep2Btn");
    const startTeamRegistrationButton = document.getElementById("startTeamRegistrationBtn");
    const cancelButton = document.getElementById("cancelBatchBtn");
    const startPayUrlButton = document.getElementById("startPayUrlBtn");
    const continueBrazilPixPaymentButton = document.getElementById("continueBrazilPixPaymentBtn");
    const running = state.automationBatchRunning || state.payUrlBatchRunning || state.brazilPixContinueRunning || state.teamRegistrationRunning;
    if (startButton) {
      startButton.disabled = running;
    }
    if (startToStep2Button) {
      startToStep2Button.disabled = running;
    }
    if (startTeamRegistrationButton) {
      startTeamRegistrationButton.disabled = running;
      startTeamRegistrationButton.textContent = state.teamRegistrationRunning ? "Team 注册中" : "注册 Team";
    }
    if (startPayUrlButton) {
      startPayUrlButton.disabled = running;
    }
    if (continueBrazilPixPaymentButton) {
      continueBrazilPixPaymentButton.disabled = running;
    }
    renderAuthorizationControls();
    if (cancelButton) {
      const cancellableBatchRunning = state.automationBatchRunning || state.teamRegistrationRunning;
      cancelButton.disabled = !cancellableBatchRunning || state.cancelAutomationBatchRequested;
      cancelButton.textContent = state.cancelAutomationBatchRequested ? "取消中" : "取消";
    }
  }

  function requestCancelAutomationBatch() {
    if (!state.automationBatchRunning && !state.teamRegistrationRunning) {
      logMessage("当前没有正在执行的连续流程");
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

  async function waitForChatGptSessionWithAccessToken(tabId, timeoutMs = 60000) {
    const start = Date.now();
    let lastError = "";
    while (Date.now() - start < timeoutMs) {
      try {
        const session = await getChatGptSessionFromTab(tabId);
        const accessToken = String(session && session.accessToken || "").trim();
        if (accessToken) {
          return session;
        }
        lastError = "accessToken 为空";
      } catch (error) {
        lastError = formatError(error);
      }
      await delay(2000);
    }
    throw new Error(`等待 ChatGPT session accessToken 超时${lastError ? `: ${lastError}` : ""}`);
  }

  async function waitForAnyUrlPrefix(tabId, prefixes, timeoutMs) {
    const prefixList = (Array.isArray(prefixes) ? prefixes : [prefixes])
      .map((prefix) => String(prefix || "").trim())
      .filter(Boolean);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const tab = await ext.tabs.get(tabId);
      const url = String(tab && tab.url || "");
      const matchedPrefix = prefixList.find((prefix) => prefix && url.startsWith(prefix));
      if (matchedPrefix) {
        return { url, prefix: matchedPrefix };
      }
      await delay(1000);
    }
    throw new Error(`等待 URL 超时: ${prefixList.join(" 或 ")}`);
  }

  async function submitTeamProviderAuthorizeForm(tabId, email, providerDomain, label = "Team") {
    const provider = getTeamProviderDefinition(providerDomain);
    const prefix = getEmailPrefix(email);
    if (!prefix) {
      throw new Error(`${label}: 邮箱前缀为空`);
    }

    logMessage(`${label}: 等待进入 ${provider.authorizeUrlPrefix}`);
    await waitForUrlPrefix(tabId, provider.authorizeUrlPrefix, 120000);
    logMessage(`${label}: 使用 provider ${provider.domain}`);

    if (provider.type === "pilipala") {
      await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
        selector: "#prefix",
        value: prefix,
        timeoutMs: 60000
      }, `${label}: prefix 输入失败`);
      await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
        selector: "#password",
        value: provider.password,
        timeoutMs: 30000
      }, `${label}: password 输入失败`);
    } else if (provider.type === "emailOnly") {
      await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
        selector: 'input[name="email"]',
        value: email,
        timeoutMs: 60000
      }, `${label}: 邮箱输入失败`);
    } else {
      await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
        selector: 'input[name="email"]',
        value: email,
        timeoutMs: 60000
      }, `${label}: invite 邮箱输入失败`);
      await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
        selector: 'input[name="invite_code"]',
        value: TEAM_REGISTRATION_INVITE_CODE,
        timeoutMs: 30000
      }, `${label}: invite_code 输入失败`);
    }

    await clickPageElement(tabId, {
      selector: provider.submitSelector || 'button[type="submit"]',
      timeoutMs: 30000
    }, `${label}: provider 表单提交失败`);
  }

  async function completeTeamRegistrationProviderFlow(tabId, email, providerDomain) {
    await submitTeamProviderAuthorizeForm(tabId, email, providerDomain, "Team 注册");
    logMessage("Team 注册: 等待 signin-consent 或返回 ChatGPT");
    const nextUrl = await waitForAnyUrlPrefix(tabId, [TEAM_SIGNIN_CONSENT_URL_PREFIX, "https://chatgpt.com"], 120000);
    if (nextUrl.prefix === TEAM_SIGNIN_CONSENT_URL_PREFIX) {
      logMessage("Team 注册: 提交 signin consent，等待返回 ChatGPT");
      await clickPageElement(tabId, {
        selector: 'button[type="submit"]',
        timeoutMs: 60000
      }, "Team 注册 signin consent 提交失败");
      await waitForUrlPrefix(tabId, "https://chatgpt.com", 180000);
    }
  }

  async function runTeamRegistrationBatch() {
    if (
      state.automationBatchRunning ||
      state.payUrlBatchRunning ||
      state.brazilPixContinueRunning ||
      state.teamRegistrationRunning ||
      state.authorizationRunning
    ) {
      logMessage("已有流程正在执行中，暂不启动 Team 注册");
      return { ok: false };
    }

    state.teamRegistrationRunning = true;
    state.cancelAutomationBatchRequested = false;
    renderAutomationBatchControls();

    const runCount = getRunCount();
    resetRunStats(runCount);
    let completedCount = 0;
    let successCount = 0;
    let failCount = 0;
    try {
      logMessage(`准备连续执行 ${runCount} 次 Team 注册`);
      for (let index = 1; index <= runCount; index += 1) {
        logMessage(`===== Team 注册第 ${index}/${runCount} 次开始 =====`);
        try {
          const result = await runSingleTeamRegistrationFlow();
          completedCount = index;
          if (result && result.ok) {
            successCount += 1;
            updateRunStats("success");
            logMessage(`===== Team 注册第 ${index}/${runCount} 次结束 =====`);
          } else {
            failCount += 1;
            updateRunStats("fail");
            logMessage(`Team 注册第 ${index}/${runCount} 次失败结束`);
          }
        } catch (error) {
          completedCount = index;
          failCount += 1;
          updateRunStats("fail");
          logMessage(`Team 注册第 ${index}/${runCount} 次异常结束: ${formatError(error)}`);
        }
        if (state.cancelAutomationBatchRequested) {
          logMessage(`已取消后续 Team 注册，停止在第 ${completedCount}/${runCount} 次之后`);
          break;
        }
      }
      if (state.cancelAutomationBatchRequested && completedCount < runCount) {
        logMessage(
          `Team 注册连续执行已取消，已完成 ${completedCount} 次，成功 ${successCount} 次，失败 ${failCount} 次，剩余 ${runCount - completedCount} 次未执行`
        );
      } else {
        logMessage(`Team 注册连续执行完成，共 ${completedCount} 次，成功 ${successCount} 次，失败 ${failCount} 次`);
      }
    } finally {
      state.teamRegistrationRunning = false;
      state.cancelAutomationBatchRequested = false;
      renderAutomationBatchControls();
    }
  }

  async function runSingleTeamRegistrationFlow() {
    setActiveStep(1);

    const teamProviderDomain = getTeamProviderDomain();
    const email = generateTeamRegistrationEmail(teamProviderDomain);
    let automationWindowId = null;
    let uploadedThirdPartyAccount = "";
    let automationSucceeded = false;

    try {
      logMessage(`Team 注册: 使用 provider ${teamProviderDomain}，随机邮箱 ${email}`);
      try {
        await ensureProxyForStage("第一步");
      } catch (error) {
        throw new Error(`第一步代理设置失败: ${formatError(error)}`);
      }

      const automationWindow = await createPrivateAutomationWindow("https://chatgpt.com/");
      automationWindowId = automationWindow.windowId;
      const tab = automationWindow.tab;
      logMessage("Team 注册: 已打开 chatgpt.com");

      const pageLoaded = await waitForPageComplete(tab.id, 90000);
      if (!pageLoaded) {
        throw new Error("chatgpt.com 页面加载超时");
      }
      await delay();
      logMessage("Team 注册: 点击登录");
      await clickPageElement(tab.id, {
        selector: 'button[data-testid="signup-button"]',
        timeoutMs: 60000
      }, "Team 注册登录按钮点击失败");
      await delay(3000);

      logMessage(`Team 注册: 输入邮箱 ${email}`);
      await setFirstOAuthValue(tab.id, [
        "#email",
        'input[type="email"]',
        'input[name="username"]',
        'input[name="email"]',
        'input[autocomplete="username"]'
      ], email, "Team 登录邮箱");

      logMessage("Team 注册: 提交邮箱，等待进入 SSO");
      await clickPageElement(tab.id, {
        selector: 'button[type="submit"]',
        timeoutMs: 30000
      }, "Team 注册邮箱提交按钮点击失败");
      await waitForUrlPrefix(tab.id, TEAM_SSO_URL_PREFIX, 120000);

      logMessage("Team 注册: 点击 SSO connection");
      await clickPageElement(tab.id, {
        selector: 'button[name="ssoConnection"]',
        timeoutMs: 60000
      }, "Team 注册 SSO connection 按钮点击失败");

      await completeTeamRegistrationProviderFlow(tab.id, email, teamProviderDomain);
      await waitForPageComplete(tab.id, 60000);

      const session = await waitForChatGptSessionWithAccessToken(tab.id, 60000);
      const accessToken = String(session && session.accessToken || "").trim();
      const sessionEmail = String(session && session.userEmail || "").trim();
      if (sessionEmail && sessionEmail.toLowerCase() !== email.toLowerCase()) {
        logMessage(`Team 注册: ChatGPT session user.email=${sessionEmail}，第三方账号仍使用生成邮箱 ${email}`);
      } else if (sessionEmail) {
        logMessage(`Team 注册: ChatGPT session user.email=${sessionEmail}`);
      }

      logMessage("Team 注册: 正在上传第三方账号");
      const thirdPartyResult = await submitThirdPartyAccount({
        account: email,
        accessToken,
        payurl: ""
      });
      if (!thirdPartyResult.ok) {
        throw new Error(`Team 注册第三方接口提交失败: ${thirdPartyResult.error || `HTTP ${thirdPartyResult.status}`}`);
      }
      uploadedThirdPartyAccount = email;
      logMessage("Team 注册: 第三方接口提交成功（支付链接为空）");

      const authorizationAccount = await rememberSuccessfulAuthorizationAccount({
        account: email,
        email,
        registrationMethod: "email",
        planType: normalizeAccountPlanType(session && session.accountPlanType) || "team",
        teamProviderDomain,
        proxy: cloneRuntimeProxy(state.currentProxy)
      });
      if (isContinueAuthorizationEnabled()) {
        logMessage("Team 注册: 已勾选继续授权，开始 Codex 授权");
        await authorizeCodexAccount(authorizationAccount, {
          smsVoucherCode: getCodexSmsVoucherCode(),
          cleanupProxyAfter: false,
          tabId: tab.id,
          windowId: automationWindowId
        });
      } else {
        logMessage("Team 注册: 未勾选继续授权，跳过 Codex 授权");
      }

      automationSucceeded = true;
      logMessage(`Team 注册成功: ${email}`);
      return { ok: true, email };
    } catch (error) {
      logMessage(`Team 注册失败: ${formatError(error)}`);
      if (uploadedThirdPartyAccount) {
        await deleteUploadedThirdPartyAccountAfterFailure(
          uploadedThirdPartyAccount,
          "Team 注册后续失败，正在删除第三方账号"
        );
      }
      return { ok: false, email, error: formatError(error) };
    } finally {
      await cleanupAutomationProxy("Team 注册任务已关闭");
      await closeAutomationWindow(automationWindowId, {
        failed: !automationSucceeded
      });
    }
  }

  async function runAutomationBatch() {
    if (state.automationBatchRunning) {
      logMessage("完整流程正在执行中");
      return;
    }
    state.automationBatchRunning = true;
    state.cancelAutomationBatchRequested = false;
    renderAutomationBatchControls();
    try {
      validateRegistrationSettings();
      if (isContinueAuthorizationEnabled() && !getCodexSmsVoucherCode()) {
        throw new Error("继续授权已开启，请填写 Codex 接码券");
      }
      if (isPaymentFlowEnabled() && isProtocolPaymentMethod()) {
        requireProtocolWebshareApiKeys();
        getNextProtocolCdkEntry();
      }
    } catch (error) {
      logMessage("错误: " + formatError(error));
      state.automationBatchRunning = false;
      state.cancelAutomationBatchRequested = false;
      renderAutomationBatchControls();
      return;
    }
    let runCount = getRunCount();
    const phoneRegistration = isPhoneRegistrationMethod();
    const specifiedAccounts = phoneRegistration ? [] : getSpecifiedAccountEntries();
    if (phoneRegistration && getSpecifiedAccountEntries().length) {
      logMessage("手机号注册模式已选择，将忽略指定注册账号列表");
    }
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
            if (result && result.canResumeBrazilPix) {
              logMessage("巴西 PIX 支付可继续，已停止后续任务；修复接口/网络后点击继续支付");
              break;
            }
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
    const phoneRegistration = isPhoneRegistrationMethod();
    const paymentFlowEnabled = isPaymentFlowEnabled();
    const stopAfterThirdPartySubmit = isStopAfterThirdPartySubmitEnabled();
    const protocolPayment = paymentFlowEnabled && isProtocolPaymentMethod();
    let specifiedAccountEntry = null;
    try {
      specifiedAccountEntry = phoneRegistration ? null : getNextSpecifiedAccountEntry();
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return { ok: false };
    }
    let prepared = null;
    if (paymentFlowEnabled && !protocolPayment) {
      try {
        prepared = await preparePaymentInputs(false);
      } catch (error) {
        logMessage("错误: " + formatError(error));
        return { ok: false };
      }
    } else if (protocolPayment) {
      logMessage("已选择协议支付，本次流程不要求卡片和 PayURL");
    } else {
      logMessage("已关闭支付流程，本次完整流程将在账号注册成功后结束");
    }

    logMessage("开始完整自动化流程...");
    let automationWindowId = null;
    let uploadedThirdPartyAccount = null;
    let automationSucceeded = false;
    let keepAutomationWindowForBrazilPixResume = false;
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
        registration = await runSelectedRegistration(tab.id, specifiedAccountEntry);
      } catch (error) {
        logMessage("注册异常，流程终止: " + formatError(error));
        if (!phoneRegistration) keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }
      if (!registration.ok) {
        logMessage("注册失败，流程终止");
        if (!phoneRegistration) keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }
      const registrationAccount = String(registration.account || registration.email || registration.phone || "").trim();
      const registrationProxy = cloneRuntimeProxy(state.currentProxy);

      if (!(await waitForChatGptAfterRegistration(tab.id))) {
        logMessage("错误: 未成功到达 chatgpt.com");
        if (!phoneRegistration) keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }
      if (phoneRegistration) {
        try {
          registration = await completePhoneRegistrationPromoEmailVerification(tab.id, registration);
        } catch (error) {
          logMessage("手机号注册后邮箱验证失败，流程终止: " + formatError(error));
          return { ok: false };
        }
      }
      const thirdPartyAccount = String(
        phoneRegistration
          ? registration.email || registration.account || registration.phone || ""
          : registrationAccount
      ).trim();
      let chatGptSessionEmail = "";
      let trialCheckAccessToken = "";
      try {
        const chatGptSession = await getChatGptSessionFromTab(tab.id);
        chatGptSessionEmail = String(chatGptSession && chatGptSession.userEmail || "").trim();
        trialCheckAccessToken = String(chatGptSession && chatGptSession.accessToken || "").trim();
        if (!chatGptSessionEmail) {
          throw new Error("ChatGPT session user.email: null");
        }
        logMessage(`ChatGPT session user.email: ${chatGptSessionEmail}`);
      } catch (error) {
        logMessage(`读取 ChatGPT session user.email 失败，授权收尾时会重试: ${formatError(error)}`);
      }

      if (!paymentFlowEnabled) {
        automationSucceeded = true;
        try {
          if (!phoneRegistration) await markSpecifiedAccountCreated(specifiedAccountEntry, registrationAccount);
        } catch (error) {
          logMessage("指定账号创建日志记录失败，继续注册成功收尾: " + formatError(error));
        }
        logMessage("支付流程已关闭，账号注册成功，本次完整流程按成功结束");
        await handleSuccessfulAccountAuthorization({
          tabId: tab.id,
          sessionEmail: chatGptSessionEmail,
          registrationMethod: registration.registrationMethod || (phoneRegistration ? "phone" : "email"),
          proxy: registrationProxy
        });
        return { ok: true, paymentSkipped: true };
      }

      if (protocolPayment) {
        setActiveStep(2);
        logMessage("步骤2: 已选择协议支付，跳过 PayURL/PayPal");
        try {
          if (!phoneRegistration) logSpecifiedAccountCreated(specifiedAccountEntry, registrationAccount);
        } catch (error) {
          logMessage("指定账号创建日志记录失败，继续协议支付: " + formatError(error));
        }

        const accessToken = trialCheckAccessToken || await getChatGptAccessTokenFromTab(tab.id);
        try {
          const trialCheck = await checkTrialPaymentEligibility(accessToken, "");
          if (!trialCheck.ok) {
            logMessage("协议支付资格检查失败，流程终止: " + (trialCheck.error || "未知错误"));
            if (!phoneRegistration) keepSpecifiedAccountAfterCheckoutLinkFailure(specifiedAccountEntry);
            return { ok: false };
          }
          if (!trialCheck.eligible) {
            const amountText = Number.isFinite(trialCheck.amountCents)
              ? `${trialCheck.amountCents}${trialCheck.currency ? ` ${trialCheck.currency}` : ""}`
              : "未知";
            logMessage(`协议支付资格检查未通过，amount_cents=${amountText}，只有 amount_cents 为 0 才继续协议支付流程`);
            if (!phoneRegistration) keepSpecifiedAccountAfterCheckoutLinkFailure(specifiedAccountEntry);
            return { ok: false };
          }
          logMessage("协议支付资格检查通过，amount_cents=0，继续协议支付流程");
        } catch (error) {
          logMessage("协议支付资格检查异常，流程终止: " + formatError(error));
          if (!phoneRegistration) keepSpecifiedAccountAfterCheckoutLinkFailure(specifiedAccountEntry);
          return { ok: false };
        }
        try {
          logMessage("正在提交到第三方接口（协议支付，支付链接为空）...");
          const thirdPartyResult = await submitThirdPartyAccount({
            account: thirdPartyAccount,
            accessToken,
            payurl: ""
          });
          if (thirdPartyResult.ok) {
            uploadedThirdPartyAccount = thirdPartyAccount;
            logMessage("第三方接口提交成功（协议支付）");
            if (stopAfterThirdPartySubmit) {
              automationSucceeded = true;
              return finishAfterThirdPartySubmit({
                tabId: tab.id,
                sessionEmail: chatGptSessionEmail,
                registrationMethod: registration.registrationMethod || (phoneRegistration ? "phone" : "email"),
                proxy: registrationProxy,
                phoneRegistration,
                specifiedAccountEntry,
                registrationAccount
              });
            }
          } else {
            logMessage("第三方接口提交失败，继续协议支付: " + (thirdPartyResult.error || "未知错误"));
          }
        } catch (error) {
          logMessage("第三方接口提交异常，继续协议支付: " + formatError(error));
        }

        let protocolResult = null;
        try {
          protocolResult = await runProtocolPaymentFlow({
            accessToken,
            registrationProxy
          });
          automationSucceeded = Boolean(protocolResult && protocolResult.ok);
        } catch (error) {
          logMessage("协议支付流程异常，按支付失败处理: " + formatError(error));
          if (state.phoneKey) {
            logPaymentFailurePhone(state.phoneKey, formatError(error));
          }
          automationSucceeded = false;
        }

        if (automationSucceeded) {
          if (!phoneRegistration) await removeSpecifiedAccountAfterPaymentSuccess(specifiedAccountEntry, registrationAccount);
          await handleSuccessfulAccountAuthorization({
            tabId: tab.id,
            sessionEmail: chatGptSessionEmail,
            registrationMethod: registration.registrationMethod || (phoneRegistration ? "phone" : "email"),
            proxy: registrationProxy
          });
        } else {
          if (protocolResult && protocolResult.phoneKey) {
            logPaymentFailurePhone(protocolResult.phoneKey, protocolResult.error || "协议支付流程失败");
          } else if (state.phoneKey) {
            logPaymentFailurePhone(state.phoneKey, "协议支付流程失败");
          }
          if (!phoneRegistration) await removeSpecifiedAccountAfterPaymentFailure(specifiedAccountEntry);
        }
        return { ok: automationSucceeded };
      }

      setActiveStep(2);
      if (countrySel === "BR") {
        logMessage("步骤2: 已选择巴西 PIX，跳过 PayURL/PayPal");
        try {
          if (!phoneRegistration) logSpecifiedAccountCreated(specifiedAccountEntry, registrationAccount);
        } catch (error) {
          logMessage("指定账号创建日志记录失败，继续 PIX 流程: " + formatError(error));
        }
        const pixResumeContext = {
          tabId: tab.id,
          windowId: automationWindowId,
          thirdPartyAccount,
          registrationAccount,
          sessionEmail: chatGptSessionEmail,
          registrationMethod: registration.registrationMethod || (phoneRegistration ? "phone" : "email"),
          specifiedAccountEntry,
          phoneRegistration,
          proxy: registrationProxy,
          createdAt: Date.now()
        };
        await saveBrazilPixResumeContext(pixResumeContext);
        try {
          const pixResult = await runBrazilPixPaymentFlow(tab.id);
          automationSucceeded = Boolean(pixResult && pixResult.ok);
          if (automationSucceeded) {
            const finalizeResult = await finalizeBrazilPixPaymentSuccess(pixResult, pixResumeContext, {
              skipSpecifiedAccountRemoval: stopAfterThirdPartySubmit
            });
            await clearBrazilPixResumeContext();
            if (finalizeResult && finalizeResult.thirdPartySubmitted && stopAfterThirdPartySubmit) {
              return finishAfterThirdPartySubmit({
                tabId: tab.id,
                sessionEmail: chatGptSessionEmail,
                registrationMethod: registration.registrationMethod || (phoneRegistration ? "phone" : "email"),
                proxy: registrationProxy,
                phoneRegistration,
                specifiedAccountEntry,
                registrationAccount
              });
            } else {
              await handleSuccessfulAccountAuthorization({
                tabId: tab.id,
                sessionEmail: chatGptSessionEmail,
                registrationMethod: registration.registrationMethod || (phoneRegistration ? "phone" : "email"),
                proxy: registrationProxy
              });
            }
          }
        } catch (error) {
          await saveBrazilPixResumeContext(pixResumeContext);
          keepAutomationWindowForBrazilPixResume = true;
          logMessage("巴西 PIX 支付失败，已保留当前账号和窗口，可点击继续支付重试: " + formatError(error));
          return { ok: false, canResumeBrazilPix: true };
        }
        return { ok: automationSucceeded };
      }

      logMessage("步骤2: 获取支付链接");
      const payUrlMode = getPayUrlMode();
      const result = await requestCheckoutLinkWithOfficialRegionRetry(
        (region) => requestChatGptCheckoutLinkFromTab(tab.id, region, payUrlMode),
        countrySel
      );
      if (!result.ok || !hasCheckoutPaymentLink(result)) {
        logMessage("获取支付链接失败: " + (result.error || "未知错误"));
        if (!phoneRegistration) keepSpecifiedAccountAfterCheckoutLinkFailure(specifiedAccountEntry);
        return { ok: false };
      }

      const selectedPaymentLink = await applyCheckoutLinkResult(result, { mode: payUrlMode });
      const isShortMode = normalizePayUrlMode(payUrlMode) === "short";
      logMessage(isShortMode
        ? "支付链接已写入，短链模式将在第四步获取真实支付 URL 后提交第三方接口"
        : "支付链接已写入，准备提交第三方接口并进入支付流程");
      try {
        if (!phoneRegistration) logSpecifiedAccountCreated(specifiedAccountEntry, registrationAccount);
      } catch (error) {
        logMessage("指定账号创建日志记录失败，继续支付流程: " + formatError(error));
      }
      if (!isShortMode) {
        const submitted = await submitThirdPartyAccountForPayment({
          account: thirdPartyAccount,
          accessToken: result.accessToken,
          payurl: selectedPaymentLink
        });
        if (submitted) {
          uploadedThirdPartyAccount = thirdPartyAccount;
          if (stopAfterThirdPartySubmit) {
            automationSucceeded = true;
            return finishAfterThirdPartySubmit({
              tabId: tab.id,
              sessionEmail: chatGptSessionEmail,
              registrationMethod: registration.registrationMethod || (phoneRegistration ? "phone" : "email"),
              proxy: registrationProxy,
              phoneRegistration,
              specifiedAccountEntry,
              registrationAccount
            });
          }
        }
      }

      prepared.payUrl = selectedPaymentLink;
      prepared.longPayUrl = state.lastLongPayUrl;
      prepared.shortPayUrl = state.lastShortPayUrl;
      prepared.checkoutRegion = state.lastCheckoutRegion;
      prepared.payUrlMode = state.payUrlMode;
      prepared.thirdPartyAccount = thirdPartyAccount;
      prepared.thirdPartyAccessToken = result.accessToken;
      let payFlowResult = false;
      try {
        payFlowResult = await runPayPalFlowWithCaptchaWindowRetry(tab.id, prepared, {
          currentWindowId: automationWindowId,
          onPayPalUrlReady: isShortMode
            ? async (paypalUrl) => {
              if (uploadedThirdPartyAccount) {
                return;
              }
              const submitted = await submitThirdPartyAccountForPayment({
                account: thirdPartyAccount,
                accessToken: result.accessToken,
                payurl: paypalUrl
              }, "短链真实支付链接");
              if (submitted) {
                await pushRoxyPaymentTask(paypalUrl, prepared);
                uploadedThirdPartyAccount = thirdPartyAccount;
                if (stopAfterThirdPartySubmit) {
                  throw new ThirdPartySubmitOnlyComplete();
                }
              }
            }
            : null
        });
      } catch (error) {
        if (isThirdPartySubmitOnlyComplete(error)) {
          automationSucceeded = true;
          return finishAfterThirdPartySubmit({
            tabId: tab.id,
            sessionEmail: chatGptSessionEmail,
            registrationMethod: registration.registrationMethod || (phoneRegistration ? "phone" : "email"),
            proxy: registrationProxy,
            phoneRegistration,
            specifiedAccountEntry,
            registrationAccount
          });
        }
        logMessage("支付流程异常，按支付失败处理: " + formatError(error));
        if (prepared && prepared.smsCodeEntered) {
          logPaymentFailurePhone(prepared.phoneKey, formatError(error));
        }
        payFlowResult = false;
      }
      automationSucceeded = Boolean(payFlowResult);
      if (automationSucceeded) {
        if (!phoneRegistration) await removeSpecifiedAccountAfterPaymentSuccess(specifiedAccountEntry, registrationAccount);
        await removeUsedCardInput(prepared);
        await handleSuccessfulAccountAuthorization({
          tabId: tab.id,
          sessionEmail: chatGptSessionEmail,
          registrationMethod: registration.registrationMethod || (phoneRegistration ? "phone" : "email"),
          proxy: registrationProxy
        });
      } else {
        if (prepared && prepared.smsCodeEntered) {
          logPaymentFailurePhone(prepared.phoneKey, "支付流程失败");
        }
        if (!phoneRegistration) await removeSpecifiedAccountAfterPaymentFailure(specifiedAccountEntry);
      }
      return { ok: automationSucceeded };
    } finally {
      await cleanupAutomationProxy("完整流程任务已关闭");
      if (!automationSucceeded && uploadedThirdPartyAccount) {
        const cleanupReason = specifiedAccountEntry
          ? "指定账号完整流程失败，正在删除第三方账号"
          : protocolPayment
            ? "协议支付流程失败，正在删除第三方账号"
          : prepared && prepared.payUrlAmountNonZero
            ? "PayURL 金额不是 0，正在删除第三方未绑定账号"
            : "获取到 PayURL 后流程失败，正在删除第三方账号";
        await deleteUploadedThirdPartyAccountAfterFailure(uploadedThirdPartyAccount, cleanupReason);
      }
      await closeAutomationWindow(automationWindowId, {
        failed: !automationSucceeded,
        keepOpen: keepAutomationWindowForBrazilPixResume
      });
    }
  }

  async function startToStep2() {
    const countrySel = document.getElementById("country").value;
    const phoneRegistration = isPhoneRegistrationMethod();
    try {
      validateRegistrationSettings();
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return { ok: false };
    }
    let specifiedAccountEntry = null;
    try {
      specifiedAccountEntry = phoneRegistration ? null : getNextSpecifiedAccountEntry();
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return { ok: false };
    }

    logMessage("开始执行到第2步...");
    let automationWindowId = null;
    let step2Succeeded = false;
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
        registration = await runSelectedRegistration(tab.id, specifiedAccountEntry);
      } catch (error) {
        logMessage("注册异常，流程终止: " + formatError(error));
        if (!phoneRegistration) keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }
      if (!registration.ok) {
        logMessage("注册失败，流程终止");
        if (!phoneRegistration) keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }
      const registrationAccount = String(registration.account || registration.email || registration.phone || "").trim();

      if (!(await waitForChatGptAfterRegistration(tab.id))) {
        logMessage("错误: 未成功到达 chatgpt.com");
        if (!phoneRegistration) keepSpecifiedAccountAfterRegistrationFailure(specifiedAccountEntry);
        return { ok: false };
      }
      if (phoneRegistration) {
        try {
          registration = await completePhoneRegistrationPromoEmailVerification(tab.id, registration);
        } catch (error) {
          logMessage("手机号注册后邮箱验证失败，流程终止: " + formatError(error));
          return { ok: false };
        }
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
        if (!phoneRegistration) keepSpecifiedAccountAfterCheckoutLinkFailure(specifiedAccountEntry);
        return { ok: false };
      }

      const selectedPaymentLink = await applyCheckoutLinkResult(result, { mode: payUrlMode });
      if (!phoneRegistration) await markSpecifiedAccountCreated(specifiedAccountEntry, registrationAccount);
      logMessage("已执行到第2步，流程停止");
      step2Succeeded = true;
      return { ok: true, account: registrationAccount, email: registration.email || "", phone: registration.phone || "", paymentLink: selectedPaymentLink };
    } finally {
      await cleanupAutomationProxy("执行到第2步任务已关闭");
      await closeAutomationWindow(automationWindowId, { failed: !step2Succeeded });
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
    let paymentSucceeded = false;
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
        currentWindowId: automationWindowId
      });
      paymentSucceeded = Boolean(payFlowResult);
      if (payFlowResult) {
        await removeUsedCardInput(prepared);
        await removeUsedPayUrlInput(prepared);
      } else if (prepared && prepared.smsCodeEntered) {
        logPaymentFailurePhone(prepared.phoneKey, "支付流程失败");
      }
      return { ok: Boolean(payFlowResult) };
    } catch (error) {
      if (prepared && prepared.smsCodeEntered) {
        logPaymentFailurePhone(prepared.phoneKey, formatError(error));
      }
      logMessage("支付流程异常，按支付失败处理: " + formatError(error));
      return { ok: false };
    } finally {
      await cleanupAutomationProxy("PayURL 任务已关闭");
      await closeAutomationWindow(automationWindowId, { failed: !paymentSucceeded });
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
        currentWindowId: tab.incognito ? tab.windowId : null
      });
      if (payFlowResult) {
        await removeUsedCardInput(prepared);
      } else if (prepared && prepared.smsCodeEntered) {
        logPaymentFailurePhone(prepared.phoneKey, "支付流程失败");
      }
    } catch (error) {
      if (prepared && prepared.smsCodeEntered) {
        logPaymentFailurePhone(prepared.phoneKey, formatError(error));
      }
      logMessage("支付流程异常，按支付失败处理: " + formatError(error));
    } finally {
      await cleanupAutomationProxy("第3步任务已关闭");
      await closeAutomationWindow(retryAutomationWindowId);
    }
  }

  async function startFromStep4() {
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

    logMessage("从当前页面第4步开始执行 PayPal 流程...");
    try {
      try {
        await ensureProxyForStage("第四步");
      } catch (error) {
        logMessage("第四步代理设置失败，流程终止: " + formatError(error));
        return;
      }
      await applyCurrentIpLocationToPrepared(prepared);
      await runPayPalLoginPage(tab.id, prepared);
      await runPayPalSignupPage(tab.id, prepared);
      await advancePhoneCursorAfterSuccess(prepared.phoneKey);
      logMessage("第4步开始流程已完成，短信验证码已输入");
    } catch (error) {
      if (prepared && prepared.smsCodeEntered) {
        logPaymentFailurePhone(prepared.phoneKey, formatError(error));
      }
      logMessage("第4步开始流程异常，按支付失败处理: " + formatError(error));
    } finally {
      await cleanupAutomationProxy("第4步任务已关闭");
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
    const payUrlEntry = getNextPayUrlInputEntry(document.getElementById("payUrlInput").value);
    const payUrl = payUrlEntry ? payUrlEntry.url : "";
    const randomCardEnabled = true;
    state.randomCardEnabled = true;
    const flowCountry = getFlowCountry();
    const card = createRandomPaymentCard(flowCountry);
    logMessage(`已为本次流程随机生成完整卡片信息: ${card.card}`);
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
    logMessage(`准备第3/5步流程国家: ${flowCountry}`);
    const phoneKey = await preparePhoneKeyForFlow(flowCountry);
    state.phoneKey = phoneKey;
    const preparedPhone = phoneKey && phoneKey.phone ? phoneKey.phone : getFillPhoneNumber(card);
    if (!preparedPhone) {
      throw new Error(flowCountry === "JP"
        ? "未准备好日本手机号，请在手机区域填写 phone----smsUrl"
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
      cardInputLine: "",
      flowCountry,
      phoneKey,
      phone: preparedPhone,
      payUrl,
      payUrlInputLine: payUrlEntry ? payUrlEntry.line : "",
      longPayUrl: payUrlMatchesStoredCheckout ? storedLongPayUrl : payUrl,
      shortPayUrl: payUrlMatchesStoredCheckout ? storedShortPayUrl : "",
      checkoutRegion: payUrlMatchesStoredCheckout ? state.lastCheckoutRegion : "",
      payUrlMode,
      settings: sanitizeFillSettings(state.fillSettings),
      paypalEmail,
      randomCardEnabled
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

  function normalizeRegistrationMethod(value) {
    return String(value || "").trim().toLowerCase() === "phone" ? "phone" : "email";
  }

  function getRegistrationMethod() {
    const input = document.getElementById("registrationMethodSelect");
    state.registrationMethod = normalizeRegistrationMethod(input ? input.value : state.registrationMethod);
    if (input) {
      input.value = state.registrationMethod;
    }
    return state.registrationMethod;
  }

  function isPhoneRegistrationMethod() {
    return getRegistrationMethod() === "phone";
  }

  function validateRegistrationSettings() {
    if (!isPhoneRegistrationMethod()) {
      return;
    }
    const settings = getHeroSettings();
    if (!settings.apiKey) {
      throw new Error("手机号注册需要填写 Hero SMS API Key");
    }
  }

  function parseHeroCountries(payload) {
    const source = Array.isArray(payload)
      ? payload.map((item, index) => [String(index), item])
      : Object.entries(payload && typeof payload === "object" ? payload : {});
    return source
      .map(([key, item]) => {
        const country = item && typeof item === "object" ? item : {};
        const id = String(country.id || key || "").trim();
        if (!id || String(country.visible) === "0") {
          return null;
        }
        const chn = String(country.chn || "").trim();
        const eng = String(country.eng || "").trim();
        const rus = String(country.rus || "").trim();
        const primaryName = chn || eng || rus || `国家 ${id}`;
        const label = eng && eng !== primaryName ? `${primaryName} (${eng}) - ${id}` : `${primaryName} - ${id}`;
        return {
          id,
          label,
          searchText: [id, chn, eng, rus].join(" ").toLowerCase()
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  }

  function renderHeroCountryOptions() {
    const select = document.getElementById("heroCountrySelect");
    if (!select) {
      return;
    }
    const selectedCountry = String(state.heroCountry || select.value || "").trim();
    const query = String((document.getElementById("heroCountrySearchInput") || {}).value || state.heroCountrySearch || "")
      .trim()
      .toLowerCase();
    const matchedCountries = query
      ? heroCountryOptions.filter((country) => country.searchText.includes(query))
      : heroCountryOptions;
    select.textContent = "";
    select.appendChild(new Option("不指定国家", ""));
    if (selectedCountry && !heroCountryOptions.some((country) => country.id === selectedCountry)) {
      select.appendChild(new Option(`当前保存: ${selectedCountry}`, selectedCountry));
    }
    matchedCountries.forEach((country) => {
      select.appendChild(new Option(country.label, country.id));
    });
    if (selectedCountry) {
      select.value = selectedCountry;
      if (select.value !== selectedCountry) {
        select.appendChild(new Option(`当前筛选外: ${selectedCountry}`, selectedCountry));
        select.value = selectedCountry;
      }
    }
  }

  async function loadHeroCountries() {
    if (heroCountriesPromise) {
      return heroCountriesPromise;
    }
    heroCountriesPromise = (async () => {
      const url = new URL(HERO_SMS_API);
      url.searchParams.set("action", "getCountries");
      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store"
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Hero SMS 国家列表 HTTP ${response.status}: ${text.slice(0, 160) || response.statusText}`);
      }
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (_) {
        throw new Error("Hero SMS 国家列表响应不是有效 JSON");
      }
      heroCountryOptions = parseHeroCountries(payload);
      renderHeroCountryOptions();
      logMessage(`Hero SMS: 已加载 ${heroCountryOptions.length} 个国家`);
      return heroCountryOptions;
    })().catch((error) => {
      heroCountriesPromise = null;
      renderHeroCountryOptions();
      logMessage("Hero SMS 国家列表加载失败: " + formatError(error));
      return [];
    });
    return heroCountriesPromise;
  }

  function getHeroSettings() {
    const apiKeyInput = document.getElementById("heroApiKeyInput");
    const countrySelect = document.getElementById("heroCountrySelect");
    const maxPriceInput = document.getElementById("heroMaxPriceInput");
    const apiKey = String(apiKeyInput ? apiKeyInput.value : state.heroApiKey || "").trim();
    const service = HERO_DEFAULT_SERVICE;
    const country = String(countrySelect ? countrySelect.value : state.heroCountry || "").trim();
    const maxPrice = String(maxPriceInput ? maxPriceInput.value : state.heroMaxPrice || "").trim();
    state.heroApiKey = apiKey;
    state.heroService = service;
    state.heroCountry = country;
    state.heroMaxPrice = maxPrice;
    return { apiKey, service, country, maxPrice };
  }

  function buildHeroSmsUrl(action, params = {}) {
    const settings = getHeroSettings();
    if (!settings.apiKey) {
      throw new Error("Hero SMS API Key 为空");
    }
    const url = new URL(HERO_SMS_API);
    url.searchParams.set("action", action);
    url.searchParams.set("api_key", settings.apiKey);
    Object.entries(params).forEach(([key, value]) => {
      const text = String(value === undefined || value === null ? "" : value).trim();
      if (text) {
        url.searchParams.set(key, text);
      }
    });
    return url.toString();
  }

  async function fetchHeroSms(action, params = {}) {
    const response = await fetch(buildHeroSmsUrl(action, params), {
      method: "GET",
      cache: "no-store"
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {}
    if (!response.ok) {
      throw new Error(`Hero SMS ${action} HTTP ${response.status}: ${text.slice(0, 160) || response.statusText}`);
    }
    return { text: String(text || "").trim(), json };
  }

  function heroValue(payload, keys) {
    if (!payload || typeof payload !== "object") {
      return "";
    }
    for (const key of keys) {
      const value = payload[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return "";
  }

  function parseHeroNumberResult(result) {
    const data = result && result.json && typeof result.json === "object" ? result.json : null;
    if (data) {
      const activationId = heroValue(data, ["activationId", "activation_id", "id", "tzid"]);
      const phoneNumber = heroValue(data, ["phoneNumber", "phone_number", "phone", "number"]);
      if (activationId && phoneNumber) {
        return { activationId, phoneNumber: phoneNumber.replace(/[^\d+]/g, "") };
      }
      const error = heroValue(data, ["error", "message", "msg"]);
      if (error) {
        throw new Error(`Hero SMS 获取手机号失败: ${error}`);
      }
    }

    const text = String(result && result.text || "").trim();
    const accessMatch = text.match(/^ACCESS_NUMBER:([^:]+):(.+)$/i);
    if (accessMatch) {
      return {
        activationId: accessMatch[1].trim(),
        phoneNumber: accessMatch[2].trim().replace(/[^\d+]/g, "")
      };
    }
    throw new Error(`Hero SMS 获取手机号失败: ${text || "空响应"}`);
  }

  async function getHeroNumber() {
    const settings = getHeroSettings();
    if (!settings.apiKey) {
      throw new Error("手机号注册需要填写 Hero SMS API Key");
    }
    logMessage(`Hero SMS: 获取手机号，service=${settings.service}${settings.country ? `, country=${settings.country}` : ""}${settings.maxPrice ? `, maxPrice=${settings.maxPrice}` : ""}`);
    const params = { service: settings.service };
    if (settings.country) params.country = settings.country;
    if (settings.maxPrice) params.maxPrice = settings.maxPrice;
    const number = parseHeroNumberResult(await fetchHeroSms("getNumberV2", params));
    if (!number.phoneNumber || !number.activationId) {
      throw new Error("Hero SMS 获取手机号响应缺少手机号或激活 ID");
    }
    logMessage(`Hero SMS: 已获取手机号 ${number.phoneNumber}，激活 ID ${number.activationId}`);
    return number;
  }

  function extractHeroSmsCode(result) {
    const data = result && result.json && typeof result.json === "object" ? result.json : null;
    const codeFromText = (value) => {
      const match = String(value || "").match(/\b\d{4,10}\b/);
      return match ? match[0] : "";
    };
    const codeFromPayload = (payload) => {
      if (!payload || typeof payload !== "object") {
        return "";
      }
      const directCode = heroValue(payload, ["code", "smsCode", "sms_code"]);
      if (/^\d{4,10}$/.test(directCode)) {
        return directCode;
      }
      return codeFromText(heroValue(payload, ["text", "message", "sms"]));
    };
    if (data) {
      const nestedCode = codeFromPayload(data.sms) || codeFromPayload(data.call);
      if (nestedCode) {
        return nestedCode;
      }
      const directCode = codeFromPayload(data);
      if (directCode) {
        return directCode;
      }
      const status = heroValue(data, ["status"]);
      if (/^\d{4,10}$/.test(status)) {
        return status;
      }
    }

    const text = String(result && result.text || "").trim();
    const statusOk = text.match(/^STATUS_OK:(\d{4,10})$/i);
    if (statusOk) {
      return statusOk[1];
    }
    return codeFromText(text);
  }

  async function setHeroSmsStatus(activationId, status) {
    if (!activationId) {
      return false;
    }
    try {
      await fetchHeroSms("setStatus", { id: activationId, status });
      logMessage(`Hero SMS: 已设置激活 ${activationId} 状态为 ${status}`);
      return true;
    } catch (error) {
      logMessage(`Hero SMS: 设置激活状态失败 ${activationId}/${status}: ${formatError(error)}`);
      return false;
    }
  }

  async function pollHeroSmsCode(activationId) {
    const deadline = Date.now() + HERO_SMS_POLL_TIMEOUT_MS;
    let attempt = 0;
    let lastStatus = "";
    while (Date.now() <= deadline) {
      attempt += 1;
      const result = await fetchHeroSms("getStatusV2", { id: activationId });
      const code = extractHeroSmsCode(result);
      if (code) {
        logMessage(`Hero SMS: 已获取短信验证码 ${code}`);
        return code;
      }
      lastStatus = result.text || (result.json ? JSON.stringify(result.json).slice(0, 120) : "");
      logMessage(`Hero SMS: 第 ${attempt} 次未取到验证码，继续等待${lastStatus ? ` (${lastStatus})` : ""}`);
      await delay(POLL_DELAY_MS);
    }
    await setHeroSmsStatus(activationId, 8);
    throw new Error(`Hero SMS 2 分钟未获取到验证码，已取消激活${lastStatus ? `，最后状态: ${lastStatus}` : ""}`);
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
    if (!cardInput) {
      return;
    }
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
      state.phoneKey = peekFirstPhoneKey(state.phoneKeyInput, { allowEmpty: true });
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
    return runPayPalFlow(tabId, prepared, options);
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
    return runPayPalFlowFromCurrentPayUrl(tabId, prepared, options);
  }

  async function runPayPalFlowFromCurrentPayUrl(tabId, prepared, options = {}) {
    const payUrlReady = await runPayUrlPage(tabId, prepared);
    if (!payUrlReady) {
      return false;
    }
    await ensureProxyForStage("第四步");
    await runPayPalLoginPage(tabId, prepared, options);
    await runPayPalSignupPage(tabId, prepared);
    await advancePhoneCursorAfterSuccess(prepared.phoneKey);
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

  function getShortCheckoutBillingAddress(prepared) {
    const checkoutRegion = normalizeOptionalCheckoutRegion(
      prepared && (prepared.checkoutRegion || (prepared.card && prepared.card.country))
    ) || "ID";
    const card = prepared && prepared.card ? prepared.card : {};
    const cardCountry = normalizeCheckoutRegion(card.country);
    if (cardCountry === checkoutRegion && card.address && card.city && card.postcode) {
      return {
        country: checkoutRegion,
        postalCode: card.postcode,
        administrativeArea: card.state || defaultShortCheckoutAddress(checkoutRegion).administrativeArea,
        locality: card.city,
        addressLine1: card.address
      };
    }
    return defaultShortCheckoutAddress(checkoutRegion);
  }

  function defaultShortCheckoutAddress(region) {
    const addresses = {
      JP: { country: "JP", postalCode: "101-8656", administrativeArea: "Tokyo", locality: "Tokyo", addressLine1: "666 Main St" },
      AU: { country: "AU", postalCode: "2000", administrativeArea: "NSW", locality: "Sydney", addressLine1: "123 George St" },
      NZ: { country: "NZ", postalCode: "1010", administrativeArea: "Auckland", locality: "Auckland", addressLine1: "123 Queen St" },
      BR: { country: "BR", postalCode: "01310-100", administrativeArea: "SP", locality: "Sao Paulo", addressLine1: "Avenida Paulista 1000" },
      // US: { country: "US", postalCode: "10001", administrativeArea: "NY", locality: "New York", addressLine1: "350 5th Ave" },
    };
    return addresses[normalizeCheckoutRegion(region)] || addresses.JP;
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
    const billingAddress = getShortCheckoutBillingAddress(prepared);
    const shortCheckoutAddress = billingAddress.country === "JP"
      ? defaultShortCheckoutAddress("JP")
      : billingAddress;
    logMessage(`短链 checkout 账单国家: ${shortCheckoutAddress.country}`);
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
        timeoutMs: 2000
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
      payUrlStyle: true,
    }, "短链 checkout 账单姓名字段");
    await fillShortCheckoutField("__gptAutoRegisterSetSelectIfNeeded", {
      selector: "#billingAddress-countryInput",
      value: shortCheckoutAddress.country
    }, "短链 checkout 国家字段");
    await delay(2000);
    await fillShortCheckoutField("__gptAutoRegisterSetValue", {
      selector: "#billingAddress-postalCodeInput",
      value: shortCheckoutAddress.postalCode,
      payUrlStyle: true,
    }, "短链 checkout 邮编字段");
    await fillShortCheckoutField("__gptAutoRegisterSetSelectIfNeeded", {
      selector: "#billingAddress-administrativeAreaInput",
      value: shortCheckoutAddress.administrativeArea
    }, "短链 checkout 都道府县字段");
    await fillShortCheckoutField("__gptAutoRegisterSetValue", {
      selector: "#billingAddress-localityInput",
      value: shortCheckoutAddress.locality,
      payUrlStyle: true,
    }, "短链 checkout 市区町村字段");
    await fillShortCheckoutField("__gptAutoRegisterSetValue", {
      selector: "#billingAddress-addressLine1Input",
      value: shortCheckoutAddress.addressLine1,
      payUrlStyle: true,
    }, "短链 checkout 账单地址字段");
    await delay();
    logMessage("短链 checkout 表单已尝试填充，尝试点击提交");
    const submitResult = await executePageFunction(tabId, "__gptAutoRegisterClick", {
      selector: 'button[type="submit"]',
      timeoutMs: 10000
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

  async function runCaptcha (tabId) {
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
    return captchaSolved;
  }

  async function runPayPalLoginPage(tabId, prepared, options = {}) {
    setActiveStep(4);
    logMessage("步骤4: 等待进入 paypal.com");
    const paypalUrl = await waitForUrlPrefix(tabId, "https://www.paypal.com", 30000);
    prepared.step4PaymentUrl = paypalUrl;
    if (typeof options.onPayPalUrlReady === "function") {
      await options.onPayPalUrlReady(paypalUrl);
    }
    await delay();
    await ensureContentScript(tabId);
    await delay();
    const captchaSolved = await runCaptcha(tabId);

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
    
    const loginEmailSelector = '#login_email, #onboardingFlowEmail';
    logMessage("等待插件邮箱输入框");
    await executePageFunction(tabId, "__gptAutoRegisterClick", {
      selector: loginEmailSelector,
      timeoutMs: 10000
    });
    await delay(500);
    const loginEmailResult = await executePageFunction(tabId, "__gptAutoRegisterSetValue", {
      selector: loginEmailSelector,
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
    await runCaptcha(tabId);
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
      prepared.smsCodeEntered = true;
      prepared.smsCodePhone = prepared.phone;
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
    await waitForPayPalHermesPage(tabId, prepared, 120000);
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

  async function waitForPayPalHermesPage(tabId, prepared, timeoutMs) {
    logMessage("等待 PayPal 页面加载完成...");
    
    // const hermesPrefix = "https://www.paypal.com/webapps/hermes";
    const hermes2= "https://www.paypal.com/checkoutweb/billingwithoutpurchase"
    const start = Date.now();
    let lastLoggedUrl = "";
    while (Date.now() - start < timeoutMs) {
      const tab = await ext.tabs.get(tabId);
      const url = String(tab.url || "");
      if (url.startsWith(hermes2)) {
        return url;
      }
      if (isPayPalGenericErrorUrl(url) ) {
        logMessage("检测到 PayPal genericError 页面，支付失败，停止当前流程");
        await removeInvalidPhoneKeyInput(prepared);
        throw new Error(`PayPal 支付失败，进入错误页面: ${url}`);
      }
      if (isPayPalMoneyFlowAccountsNewUrl(url)) {
        logMessage("检测到 PayPal money-flow 中间页，先关闭弹窗 #modalClose");
        await delay();
        await executePageFunction(tabId, "__gptAutoRegisterClick", {
          selector: "#modalClose",
          timeoutMs: 10000
        }, "未找到 PayPal money-flow 关闭按钮 #modalClose");
        logMessage("已点击 PayPal money-flow 关闭按钮，继续等待 Hermes 页面");
        
        await delay(5000);
        continue;
      }
      await delay(1000);
    }
    logMessage('??????')
    throw new Error(`等待 URL 超时: ${hermes2}`);
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
      type: true,
      timeoutMs: 30000
    }, "未找到 signup 邮箱字段");
    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: "#phone",
      value: prepared.phone,
      payUrlStyle: true,
      type: true,
      timeoutMs: 30000
    }, "未找到手机号字段");
    await fillCurrentPage(tabId, prepared, createSignupFillOptions(prepared, { type: true }));
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
      await ext.tabs.update(tabId, { url, active: true });
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

  function createSignupFillOptions(prepared, inputOptions = {}) {
    const options = {
      ...createPayUrlFillOptions(prepared, inputOptions),
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
    if (phoneKey && phoneKey.country === "JP") {
      return fetchJapanLegacyPhoneVerificationCode(phoneKey, options);
    }
    const seenCodes = createSeenSmsCodes(phoneKey, options.previousCode);
    let lastError = "";
    const maxAttempts = normalizeSmsPollAttempts(options.timeoutMs);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
      if (attempt < maxAttempts) {
        logMessage(`第 ${attempt}/${maxAttempts} 次未取到新短信码，继续轮询: ${lastError}`);
        await delay(POLL_DELAY_MS);
      }
    }
    throw new Error(`获取短信验证码失败，已轮询 ${maxAttempts} 次: ${lastError || "没有匹配到 6 位验证码"}`);
  }

  async function fetchJapanLegacyPhoneVerificationCode(phoneKey, options = {}) {
    const seenCodes = createSeenSmsCodes(phoneKey, options.previousCode);
    let lastError = "";
    const maxAttempts = normalizeSmsPollAttempts(options.timeoutMs);

    async function pollJapanLegacySmsCode(roundLabel) {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
        if (attempt < maxAttempts) {
          logMessage(`日本短信${roundLabel}第 ${attempt}/${maxAttempts} 次未取到新验证码，继续轮询: ${lastError}`);
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

    throw new Error(`获取日本短信验证码失败，重发前后各轮询 ${maxAttempts} 次: ${lastError || "没有匹配到新验证码"}`);
  }

  function normalizeSmsPollAttempts(timeoutMs) {
    const timeout = Number(timeoutMs);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      return POLL_ATTEMPTS;
    }
    return Math.max(1, Math.ceil(timeout / POLL_DELAY_MS));
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

  async function fetchCurrentPhoneVerificationCode(phoneKey) {
    const result = await fetchCurrentPhoneVerificationCodeResult(phoneKey);
    return result.code || null;
  }

  async function fetchCurrentPhoneVerificationCodeResult(phoneKey) {
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

  function createRandomPaymentCard(flowCountry = getFlowCountry()) {
    const expiryInfo = createRandomCardExpiry();
    const name = generateRandomName();
    const firstName = extractFirstName(name);
    const lastName = extractLastName(name);
    const billingName = [firstName, lastName].filter(Boolean).join(" ");
    const address = createDefaultCardAddress(flowCountry);
    return {
      card: generateRandomLuhnCardNumber("4242420000000000"),
      year: expiryInfo.year,
      month: expiryInfo.month,
      cvv: createRandomCardCvv(),
      phone: "",
      url: "",
      name,
      billingName,
      firstName,
      lastName,
      address: address.address,
      city: address.city,
      state: address.state,
      postcode: address.postcode,
      country: address.country,
      expiryDisplay: expiryInfo.display,
      expiryInput: expiryInfo.input
    };
  }

  function createRandomCardExpiry() {
    const now = new Date();
    const monthOffset = 24 + Math.floor(Math.random() * 48);
    const expiryDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    return parseExpiry(`${expiryDate.getMonth() + 1}/${expiryDate.getFullYear()}`);
  }

  function createRandomCardCvv() {
    return String(100 + Math.floor(Math.random() * 900));
  }

  function createDefaultCardAddress(flowCountry) {
    if (normalizeFlowCountry(flowCountry) === "JP") {
      return {
        address: "666 Main St",
        city: "Tokyo",
        state: "Tokyo",
        postcode: "101-8656",
        country: "JP"
      };
    }
    return {
      address: "350 5th Ave",
      city: "New York",
      state: "NY",
      postcode: "10001",
      country: "US"
    };
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

  function parsePhoneKeyLines(rawInput, parser = parsePhoneKeyInput) {
    return String(rawInput || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parser(line));
  }

  async function pickNextPhoneKey(rawInput, options = {}) {
    const allowEmpty = Boolean(options.allowEmpty);
    while (true) {
      const text = String(rawInput || "").trim();
      if (!text) {
        if (allowEmpty) {
          return null;
        }
        return parsePhoneKeyInput(rawInput, options);
      }
      const phoneKeys = parsePhoneKeyLines(text);
      if (!phoneKeys.length) {
        return null;
      }
      const startIndex = Number.isInteger(state.phoneKeyCursor)
        ? state.phoneKeyCursor % phoneKeys.length
        : 0;
      let earliestUntilMs = 0;
      for (let offset = 0; offset < phoneKeys.length; offset += 1) {
        const index = (startIndex + offset) % phoneKeys.length;
        const picked = phoneKeys[index];
        const cooldown = getPhoneCooldownEntry(picked);
        if (cooldown && Number(cooldown.untilMs) > Date.now()) {
          earliestUntilMs = earliestUntilMs
            ? Math.min(earliestUntilMs, Number(cooldown.untilMs))
            : Number(cooldown.untilMs);
          continue;
        }
        picked.phoneCursorIndex = index;
        picked.phoneCursorTotal = phoneKeys.length;
        return picked;
      }
      await waitForPhoneCooldown(earliestUntilMs, "手机区域手机号");
    }
  }

  function peekFirstPhoneKey(rawInput, options = {}) {
    const allowEmpty = Boolean(options.allowEmpty);
    const text = String(rawInput || "").trim();
    if (!text) {
      if (allowEmpty) {
        return null;
      }
      return parsePhoneKeyInput(rawInput, options);
    }
    const phoneKeys = parsePhoneKeyLines(text);
    return phoneKeys.length ? phoneKeys[0] : null;
  }

  function peekFirstAvailablePhoneKey(rawInput, options = {}) {
    const allowEmpty = Boolean(options.allowEmpty);
    const text = String(rawInput || "").trim();
    if (!text) {
      if (allowEmpty) {
        return null;
      }
      return parsePhoneKeyInput(rawInput, options);
    }
    const phoneKeys = parsePhoneKeyLines(text);
    return phoneKeys.find((phoneKey) => !isPhoneKeyCoolingDown(phoneKey)) || null;
  }

  async function preparePhoneKeyForFlow(flowCountry) {
    if (normalizeFlowCountry(flowCountry) === "JP") {
      return pickNextJapanPhoneKeyFromPhoneInput();
    }
    const phoneInput = document.getElementById("phoneKeyInput");
    state.phoneKeyInput = phoneInput ? phoneInput.value.trim() : "";
    return pickNextPhoneKey(state.phoneKeyInput);
  }

  async function pickNextJapanPhoneKeyFromPhoneInput() {
    while (true) {
      const phoneInput = document.getElementById("phoneKeyInput");
      state.phoneKeyInput = phoneInput ? phoneInput.value.trim() : "";
      const text = String(state.phoneKeyInput || "").trim();
      if (!text) {
        throw new Error("日本手机号为空，请在手机区域填写 phone----smsUrl");
      }
      const phoneKeys = parsePhoneKeyLines(text, parseJapanPhoneKeyInput);
      if (!phoneKeys.length) {
        throw new Error("手机区域没有可用的日本手机号记录");
      }
      const startIndex = Number.isInteger(state.phoneKeyCursor)
        ? state.phoneKeyCursor % phoneKeys.length
        : 0;
      let earliestUntilMs = 0;
      for (let offset = 0; offset < phoneKeys.length; offset += 1) {
        const index = (startIndex + offset) % phoneKeys.length;
        const picked = phoneKeys[index];
        const cooldown = getPhoneCooldownEntry(picked);
        if (cooldown && Number(cooldown.untilMs) > Date.now()) {
          earliestUntilMs = earliestUntilMs
            ? Math.min(earliestUntilMs, Number(cooldown.untilMs))
            : Number(cooldown.untilMs);
          continue;
        }
        picked.phoneCursorIndex = index;
        picked.phoneCursorTotal = phoneKeys.length;
        logMessage(`日本短信使用手机区域记录: ${picked.phone}`);
        return picked;
      }
      await waitForPhoneCooldown(earliestUntilMs, "手机区域日本手机号");
    }
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
        const phoneKey = peekFirstAvailablePhoneKey(rawPhoneInput, { allowEmpty: true });
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
      if (!element) {
        return;
      }
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
    const panel = document.getElementById("fillSettingsPanel");
    const toggleButton = document.getElementById("toggleFillSettingsButton");
    if (panel) {
      panel.hidden = !state.fillSettingsExpanded;
    }
    if (toggleButton) {
      toggleButton.setAttribute("aria-expanded", String(state.fillSettingsExpanded));
      toggleButton.textContent = state.fillSettingsExpanded ? "收起" : "设置";
    }
    setInputValue("phoneSelectorInput", settings.phoneSelector[0]);
    setInputValue("phoneSelectorAltInput", settings.phoneSelector[1]);
    setInputValue("cardNumberSelectorInput", settings.cardNumberSelector[0]);
    setInputValue("cardNumberSelectorAltInput", settings.cardNumberSelector[1]);
    setInputValue("cardExpirySelectorInput", settings.cardExpirySelector[0]);
    setInputValue("cardExpirySelectorAltInput", settings.cardExpirySelector[1]);
    setInputValue("cardCvvSelectorInput", settings.cardCvvSelector[0]);
    setInputValue("cardCvvSelectorAltInput", settings.cardCvvSelector[1]);
    setInputValue("billingNameSelectorInput", settings.billingNameSelector[0]);
    setInputValue("billingNameSelectorAltInput", settings.billingNameSelector[1]);
    setInputValue("firstNameSelectorInput", settings.firstNameSelector[0]);
    setInputValue("firstNameSelectorAltInput", settings.firstNameSelector[1]);
    setInputValue("lastNameSelectorInput", settings.lastNameSelector[0]);
    setInputValue("lastNameSelectorAltInput", settings.lastNameSelector[1]);
    setInputValue("billingLine1SelectorInput", settings.billingLine1Selector[0]);
    setInputValue("billingLine1SelectorAltInput", settings.billingLine1Selector[1]);
    setInputValue("billingCitySelectorInput", settings.billingCitySelector[0]);
    setInputValue("billingCitySelectorAltInput", settings.billingCitySelector[1]);
    setInputValue("billingStateSelectorInput", settings.billingStateSelector[0]);
    setInputValue("billingStateSelectorAltInput", settings.billingStateSelector[1]);
    setInputValue("billingPostalCodeSelectorInput", settings.billingPostalCodeSelector[0]);
    setInputValue("billingPostalCodeSelectorAltInput", settings.billingPostalCodeSelector[1]);
    setInputValue("countrySelectorInput", settings.countrySelector[0]);
    setInputValue("countrySelectorAltInput", settings.countrySelector[1]);
    setInputValue("passwordSelectorInput", settings.passwordSelector[0]);
    setInputValue("passwordSelectorAltInput", settings.passwordSelector[1]);
    setInputValue("passwordValueInput", settings.passwordValue);
  }

  function setInputValue(elementId, value) {
    const input = document.getElementById(elementId);
    if (input) {
      input.value = value;
    }
  }

  function restoreState() {
    ext.storage.local.get([STORAGE_KEY], (result) => {
      const saved = result[STORAGE_KEY] || {};
      if (saved.country) document.getElementById("country").value = saved.country;
      state.pixCdkInput = typeof saved.pixCdkInput === "string" ? saved.pixCdkInput : "";
      document.getElementById("pixCdkInput").value = state.pixCdkInput;
      state.protocolCdkInput = typeof saved.protocolCdkInput === "string" ? saved.protocolCdkInput : "";
      document.getElementById("protocolCdkInput").value = state.protocolCdkInput;
      updatePixCdkVisibility();
      const runCountInput = document.getElementById("runCountInput");
      if (runCountInput) {
        const savedRunCount = Math.floor(Number(saved.runCount));
        runCountInput.value = String(Number.isFinite(savedRunCount) && savedRunCount >= 1 ? savedRunCount : DEFAULT_RUN_COUNT);
      }
      const cardInput = document.getElementById("cardInput");
      if (saved.cardInput && cardInput) cardInput.value = saved.cardInput;
      if (saved.payUrlInput) document.getElementById("payUrlInput").value = saved.payUrlInput;
      state.payUrlMode = normalizePayUrlMode(saved.payUrlMode);
      document.getElementById("payUrlModeSelect").value = state.payUrlMode;
      state.paymentMethod = normalizePaymentMethod(saved.paymentMethod);
      document.getElementById("paymentMethodSelect").value = state.paymentMethod;
      state.lastLongPayUrl = typeof saved.lastLongPayUrl === "string" ? saved.lastLongPayUrl : "";
      state.lastShortPayUrl = typeof saved.lastShortPayUrl === "string" ? saved.lastShortPayUrl : "";
      state.lastCheckoutRegion = normalizeOptionalCheckoutRegion(saved.lastCheckoutRegion);
      state.specifiedAccountInput = typeof saved.specifiedAccountInput === "string" ? saved.specifiedAccountInput : "";
      document.getElementById("specifiedAccountInput").value = state.specifiedAccountInput;
      state.teamProviderDomain = normalizeTeamProviderDomain(saved.teamProviderDomain);
      document.getElementById("teamProviderSelect").value = state.teamProviderDomain;
      state.registrationMethod = normalizeRegistrationMethod(saved.registrationMethod);
      document.getElementById("registrationMethodSelect").value = state.registrationMethod;
      state.heroApiKey = typeof saved.heroApiKey === "string" ? saved.heroApiKey : "";
      document.getElementById("heroApiKeyInput").value = state.heroApiKey;
      state.heroService = HERO_DEFAULT_SERVICE;
      state.heroCountry = typeof saved.heroCountry === "string" ? saved.heroCountry : "";
      document.getElementById("heroCountrySelect").value = state.heroCountry;
      renderHeroCountryOptions();
      loadHeroCountries();
      state.heroMaxPrice = typeof saved.heroMaxPrice === "string" ? saved.heroMaxPrice : "";
      document.getElementById("heroMaxPriceInput").value = state.heroMaxPrice;
      state.deleteThirdPartyAccountEnabled = saved.deleteThirdPartyAccountEnabled === undefined ? true : Boolean(saved.deleteThirdPartyAccountEnabled);
      document.getElementById("deleteThirdPartyAccountCheckbox").checked = state.deleteThirdPartyAccountEnabled;
      state.paymentFlowEnabled = saved.paymentFlowEnabled === undefined ? true : Boolean(saved.paymentFlowEnabled);
      document.getElementById("paymentFlowEnabledCheckbox").checked = state.paymentFlowEnabled;
      state.stopAfterThirdPartySubmitEnabled = Boolean(saved.stopAfterThirdPartySubmitEnabled);
      document.getElementById("stopAfterThirdPartySubmitCheckbox").checked = state.stopAfterThirdPartySubmitEnabled;
      state.continueAuthorizationEnabled = Boolean(saved.continueAuthorizationEnabled);
      document.getElementById("continueAuthorizationCheckbox").checked = state.continueAuthorizationEnabled;
      state.codexSmsVoucherCode = typeof saved.codexSmsVoucherCode === "string" ? saved.codexSmsVoucherCode : "";
      document.getElementById("codexSmsVoucherInput").value = state.codexSmsVoucherCode;
      state.lastSuccessfulAuthorizationAccount = normalizeAuthorizationAccount(saved.lastSuccessfulAuthorizationAccount);
      state.lastAuthorizationStatus = typeof saved.lastAuthorizationStatus === "string" ? saved.lastAuthorizationStatus : "";
      state.debugModeEnabled = Boolean(saved.debugModeEnabled);
      document.getElementById("debugModeCheckbox").checked = state.debugModeEnabled;
      if (saved.phoneKeyInput) document.getElementById("phoneKeyInput").value = saved.phoneKeyInput;
      state.phoneFailureCooldownMinutes = normalizePhoneCooldownMinutes(saved.phoneFailureCooldownMinutes);
      document.getElementById("phoneFailureCooldownMinutesInput").value = String(state.phoneFailureCooldownMinutes);
      state.phoneFailureCooldowns = saved.phoneFailureCooldowns && typeof saved.phoneFailureCooldowns === "object"
        ? saved.phoneFailureCooldowns
        : {};
      pruneExpiredPhoneCooldowns();
      state.flowCountry = normalizeFlowCountry(saved.flowCountry);
      document.getElementById("flowCountrySelect").value = state.flowCountry;
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
      state.step4ProxyCountry = normalizeProxyCountry(saved.step4ProxyCountry || "KEEP_STEP3");
      document.getElementById("step4ProxyCountrySelect").value = state.step4ProxyCountry;
      state.currentProxy = isRuntimeProxy(saved.currentProxy) ? saved.currentProxy : null;
      state.currentIpLocation = normalizeSavedIpLocation(saved.currentIpLocation);
      renderProxyStatus();
      state.randomCardEnabled = true;
      const randomCardCheckbox = document.getElementById("randomCardCheckbox");
      if (randomCardCheckbox) randomCardCheckbox.checked = state.randomCardEnabled;
      state.useCurrentIpLocation = Boolean(saved.useCurrentIpLocation);
      const useCurrentIpLocationCheckbox = document.getElementById("useCurrentIpLocationCheckbox");
      if (useCurrentIpLocationCheckbox) useCurrentIpLocationCheckbox.checked = state.useCurrentIpLocation;
      state.phoneKeyInput = typeof saved.phoneKeyInput === "string" ? saved.phoneKeyInput : "";
      state.phoneKeyCursor = Number.isInteger(saved.phoneKeyCursor) && saved.phoneKeyCursor >= 0
        ? saved.phoneKeyCursor
        : 0;
      try {
        state.phoneKey = peekFirstPhoneKey(state.phoneKeyInput, { allowEmpty: true });
      } catch (_) {
        state.phoneKey = null;
      }
      state.fillSettings = sanitizeFillSettings(saved.fillSettings);
      state.fillSettingsExpanded = Boolean(saved.fillSettingsExpanded);
      state.lastPaypalEmail = typeof saved.lastPaypalEmail === "string" ? saved.lastPaypalEmail : "";
      state.brazilPixResume = normalizeBrazilPixResumeContext(saved.brazilPixResume);
      renderFillSettings();
      renderAuthorizationControls();
      renderAutomationBatchControls();
      renderNextPhoneStatus();
    });
  }

  function persistState() {
    const cardInput = document.getElementById("cardInput");
    const randomCardCheckbox = document.getElementById("randomCardCheckbox");
    const useCurrentIpLocationCheckbox = document.getElementById("useCurrentIpLocationCheckbox");
    const nextState = {
      country: document.getElementById("country").value,
      flowCountry: normalizeFlowCountry(document.getElementById("flowCountrySelect").value),
      runCount: getRunCount(),
      cardInput: cardInput ? cardInput.value : "",
      randomCardEnabled: true,
      useCurrentIpLocation: useCurrentIpLocationCheckbox ? useCurrentIpLocationCheckbox.checked : Boolean(state.useCurrentIpLocation),
      registrationMethod: normalizeRegistrationMethod(document.getElementById("registrationMethodSelect").value),
      heroApiKey: document.getElementById("heroApiKeyInput").value.trim(),
      heroService: HERO_DEFAULT_SERVICE,
      heroCountry: document.getElementById("heroCountrySelect").value.trim(),
      heroMaxPrice: document.getElementById("heroMaxPriceInput").value.trim(),
      specifiedAccountInput: document.getElementById("specifiedAccountInput").value,
      teamProviderDomain: normalizeTeamProviderDomain(document.getElementById("teamProviderSelect").value),
      deleteThirdPartyAccountEnabled: document.getElementById("deleteThirdPartyAccountCheckbox").checked,
      paymentFlowEnabled: document.getElementById("paymentFlowEnabledCheckbox").checked,
      stopAfterThirdPartySubmitEnabled: document.getElementById("stopAfterThirdPartySubmitCheckbox").checked,
      continueAuthorizationEnabled: document.getElementById("continueAuthorizationCheckbox").checked,
      codexSmsVoucherCode: document.getElementById("codexSmsVoucherInput").value.trim(),
      lastSuccessfulAuthorizationAccount: normalizeAuthorizationAccount(state.lastSuccessfulAuthorizationAccount),
      lastAuthorizationStatus: state.lastAuthorizationStatus,
      debugModeEnabled: document.getElementById("debugModeCheckbox").checked,
      pixCdkInput: document.getElementById("pixCdkInput").value,
      protocolCdkInput: document.getElementById("protocolCdkInput").value,
      payUrlInput: document.getElementById("payUrlInput").value,
      payUrlMode: normalizePayUrlMode(document.getElementById("payUrlModeSelect").value),
      paymentMethod: normalizePaymentMethod(document.getElementById("paymentMethodSelect").value),
      lastLongPayUrl: state.lastLongPayUrl,
      lastShortPayUrl: state.lastShortPayUrl,
      lastCheckoutRegion: normalizeOptionalCheckoutRegion(state.lastCheckoutRegion),
      phoneKeyInput: document.getElementById("phoneKeyInput").value,
      proxyEnabled: document.getElementById("proxyEnabledCheckbox").checked,
      webshareApiKey: document.getElementById("webshareApiKeyInput").value,
      proxyProtocol: normalizeProxyProtocol(document.getElementById("proxyProtocolSelect").value),
      step1ProxyCountry: normalizeProxyCountry(document.getElementById("step1ProxyCountrySelect").value),
      step3ProxyCountry: normalizeProxyCountry(document.getElementById("step3ProxyCountrySelect").value),
      step4ProxyCountry: normalizeProxyCountry(document.getElementById("step4ProxyCountrySelect").value),
      currentProxy: state.currentProxy,
      currentIpLocation: state.currentIpLocation,
      fillSettings: sanitizeFillSettings(state.fillSettings),
      fillSettingsExpanded: state.fillSettingsExpanded,
      lastPhoneCode: state.lastPhoneCode,
      lastPaypalEmail: state.lastPaypalEmail,
      brazilPixResume: normalizeBrazilPixResumeContext(state.brazilPixResume),
      phoneKeyCursor: state.phoneKeyCursor,
      phoneFailureCooldownMinutes: getPhoneFailureCooldownMinutes(),
      phoneFailureCooldowns: state.phoneFailureCooldowns
    };
    return ext.storage.local.set({ [STORAGE_KEY]: nextState });
  }

  function bindEvents() {
    document.getElementById("startBtn").addEventListener("click", () => runWithErrorHandling(runAutomationBatch));
    document.getElementById("startToStep2Btn").addEventListener("click", () => runWithErrorHandling(startToStep2));
    document.getElementById("startTeamRegistrationBtn").addEventListener("click", () => runWithErrorHandling(runTeamRegistrationBatch));
    document.getElementById("cancelBatchBtn").addEventListener("click", requestCancelAutomationBatch);
    document.getElementById("getPayUrlBtn").addEventListener("click", () => runWithErrorHandling(getPayUrlFromCurrentTab));
    document.getElementById("startPayUrlBtn").addEventListener("click", () => runWithErrorHandling(startFromPayUrl));
    document.getElementById("startStep3Btn").addEventListener("click", () => runWithErrorHandling(startFromStep3));
    document.getElementById("startStep4Btn").addEventListener("click", () => runWithErrorHandling(startFromStep4));
    document.getElementById("fillStep5FormBtn").addEventListener("click", () => runWithErrorHandling(manualFillStep5Form));
    document.getElementById("continueBrazilPixPaymentBtn").addEventListener("click", () => runWithErrorHandling(continueBrazilPixPayment));
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
      state.webshareApiKey = document.getElementById("webshareApiKeyInput").value;
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
    document.getElementById("step4ProxyCountrySelect").addEventListener("change", () => {
      document.getElementById("step4ProxyCountrySelect").value = getStep4ProxyCountry();
      persistState();
    });
    document.getElementById("country").addEventListener("change", () => {
      updatePixCdkVisibility();
      persistState();
    });
    document.getElementById("pixCdkInput").addEventListener("input", () => {
      state.pixCdkInput = document.getElementById("pixCdkInput").value.trim();
      persistState();
    });
    document.getElementById("protocolCdkInput").addEventListener("input", () => {
      state.protocolCdkInput = document.getElementById("protocolCdkInput").value;
      persistState();
    });
    document.getElementById("specifiedAccountInput").addEventListener("input", () => {
      state.specifiedAccountInput = document.getElementById("specifiedAccountInput").value.trim();
      persistState();
    });
    document.getElementById("registrationMethodSelect").addEventListener("change", () => {
      const method = getRegistrationMethod();
      persistState();
      logMessage(method === "phone" ? "注册方式已切换为手机号，将使用 Hero SMS 获取手机号" : "注册方式已切换为邮箱");
    });
    document.getElementById("heroCountrySearchInput").addEventListener("input", () => {
      state.heroCountrySearch = document.getElementById("heroCountrySearchInput").value.trim();
      renderHeroCountryOptions();
    });
    document.getElementById("heroCountrySelect").addEventListener("change", () => {
      getHeroSettings();
      persistState();
    });
    ["heroApiKeyInput", "heroMaxPriceInput"].forEach((elementId) => {
      document.getElementById(elementId).addEventListener("input", () => {
        getHeroSettings();
        persistState();
      });
    });
    document.getElementById("deleteThirdPartyAccountCheckbox").addEventListener("change", () => {
      state.deleteThirdPartyAccountEnabled = document.getElementById("deleteThirdPartyAccountCheckbox").checked;
      persistState();
      logMessage(state.deleteThirdPartyAccountEnabled ? "失败时将删除第三方账号" : "失败时将保留第三方账号");
    });
    document.getElementById("paymentFlowEnabledCheckbox").addEventListener("change", () => {
      state.paymentFlowEnabled = document.getElementById("paymentFlowEnabledCheckbox").checked;
      persistState();
      logMessage(state.paymentFlowEnabled ? "已开启支付流程" : "已关闭支付流程，注册成功后即按流程成功收尾");
    });
    document.getElementById("stopAfterThirdPartySubmitCheckbox").addEventListener("change", () => {
      state.stopAfterThirdPartySubmitEnabled = document.getElementById("stopAfterThirdPartySubmitCheckbox").checked;
      persistState();
      logMessage(state.stopAfterThirdPartySubmitEnabled ? "第三方接口提交成功后将结束流程" : "第三方接口提交成功后将继续原流程");
    });
    document.getElementById("debugModeCheckbox").addEventListener("change", () => {
      state.debugModeEnabled = document.getElementById("debugModeCheckbox").checked;
      persistState();
      logMessage(state.debugModeEnabled ? "调试模式已开启，将保留窗口" : "调试模式已关闭");
    });
    document.getElementById("continueAuthorizationCheckbox").addEventListener("change", () => {
      state.continueAuthorizationEnabled = document.getElementById("continueAuthorizationCheckbox").checked;
      renderAuthorizationControls();
      persistState();
      logMessage(state.continueAuthorizationEnabled ? "继续授权已开启" : "继续授权已关闭");
    });
    document.getElementById("teamProviderSelect").addEventListener("change", () => {
      const domain = getTeamProviderDomain();
      document.getElementById("teamProviderSelect").value = domain;
      persistState();
      logMessage(`Team Provider 已切换为 ${domain}`);
    });
    document.getElementById("codexSmsVoucherInput").addEventListener("input", () => {
      state.codexSmsVoucherCode = document.getElementById("codexSmsVoucherInput").value.trim();
      persistState();
    });
    document.getElementById("authorizeCurrentAccountButton").addEventListener("click", () => runWithErrorHandling(authorizeCurrentBrowserSessionAccount));
    document.getElementById("flowCountrySelect").addEventListener("change", () => {
      document.getElementById("flowCountrySelect").value = getFlowCountry();
      renderNextPhoneStatus();
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
    document.getElementById("paymentMethodSelect").addEventListener("change", () => {
      const method = getPaymentMethod();
      persistState();
      logMessage(method === "protocol" ? "支付方式已切换为协议" : "支付方式已切换为默认");
    });
    document.getElementById("phoneFailureCooldownMinutesInput").addEventListener("input", () => {
      getPhoneFailureCooldownMinutes();
      renderNextPhoneStatus();
      persistState();
    });
    document.getElementById("runCountInput").addEventListener("input", persistState);
    const cardInput = document.getElementById("cardInput");
    if (cardInput) {
      cardInput.addEventListener("input", persistState);
    }
    const randomCardCheckbox = document.getElementById("randomCardCheckbox");
    if (randomCardCheckbox) {
      randomCardCheckbox.addEventListener("change", () => {
        state.randomCardEnabled = randomCardCheckbox.checked;
        persistState();
      });
    }
    const generateRandomCardButton = document.getElementById("generateRandomCardButton");
    if (generateRandomCardButton) {
      generateRandomCardButton.addEventListener("click", () => runWithErrorHandling(generateRandomCardInputNumber));
    }
    const useCurrentIpLocationCheckbox = document.getElementById("useCurrentIpLocationCheckbox");
    if (useCurrentIpLocationCheckbox) {
      useCurrentIpLocationCheckbox.addEventListener("change", () => {
        state.useCurrentIpLocation = useCurrentIpLocationCheckbox.checked;
        persistState();
        logMessage(state.useCurrentIpLocation ? "已启用当前 IP 定位填表" : "已关闭当前 IP 定位填表，将使用默认卡片地址");
      });
    }
    document.getElementById("payUrlInput").addEventListener("input", persistState);
    document.getElementById("phoneKeyInput").addEventListener("input", () => {
      state.phoneKeyInput = document.getElementById("phoneKeyInput").value.trim();
      pruneExpiredPhoneCooldowns();
      try {
        state.phoneKey = peekFirstPhoneKey(state.phoneKeyInput, { allowEmpty: true });
      } catch (_) {
        state.phoneKey = null;
      }
      renderNextPhoneStatus();
      persistState();
    });
    const toggleFillSettingsButton = document.getElementById("toggleFillSettingsButton");
    if (toggleFillSettingsButton) {
      toggleFillSettingsButton.addEventListener("click", () => {
        state.fillSettingsExpanded = !state.fillSettingsExpanded;
        renderFillSettings();
        persistState();
      });
    }
    const resetFillSettingsButton = document.getElementById("resetFillSettingsButton");
    if (resetFillSettingsButton) {
      resetFillSettingsButton.addEventListener("click", () => {
        state.fillSettings = createDefaultFillSettings();
        renderFillSettings();
        persistState();
        logMessage("已恢复默认填充设置");
      });
    }
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
