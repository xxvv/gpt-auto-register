(function () {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : chrome;

  const DOMAINS = [
    "minima.edu.kg",
    "watermelon.edu.kg",
    "ciat.edu.kg",
    "cars.edu.kg",
    "damahou.edu.kg"
  ];
  const CODE_API = "https://getemail.nnai.website/api/code";
  const THIRD_PARTY_ACCOUNTS_API = "https://gpt.nnai.website/api/third-party/accounts";
  const THIRD_PARTY_API_KEY = "pvxxvv";
  const WEBSHARE_LIST_API = "https://proxy.webshare.io/api/v2/proxy/list/";
  const WEBSHARE_REPLACE_API = "https://proxy.webshare.io/api/v3/proxy/replace/";
  const STORAGE_KEY = "gptAutoRegisterV2State";
  const PROXY_AUTH_KEY = "gptAutoRegisterProxyAuth";
  const US_ZIP3_STATE_RANGES_PATH = "us_zip3_state_ranges.json";
  const POLL_ATTEMPTS = 5;
  const POLL_DELAY_MS = 2500;
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
    phoneKeyInput: "",
    phoneKey: null,
    lastPhoneCode: "",
    lastPaypalEmail: "",
    proxyEnabled: true,
    webshareApiKey: "",
    proxyProtocol: "http",
    step1ProxyCountry: "US",
    step3ProxyCountry: "US",
    currentProxy: null
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
      const apiKey = requireWebshareApiKey();
      const proxy = await replaceWebshareProxyDirect(apiKey, getStep3ProxyCountry(), getProxyProtocol());
      await applyFirefoxProxy(proxy);
      state.currentProxy = proxy;
      renderProxyStatus();
      await persistState();
      logMessage(`已替换并设置代理: 国家 ${getStep3ProxyCountry()}，${formatProxy(proxy)}`);
    } catch (error) {
      logMessage(`替换代理失败: ${formatError(error)}`);
    }
  }

  async function clearProxy() {
    try {
      await clearFirefoxProxyState();
      state.currentProxy = null;
      renderProxyStatus();
      await persistState();
      logMessage("已清除 Firefox 代理");
    } catch (error) {
      logMessage(`清除代理失败: ${formatError(error)}`);
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
    return country === "JP" ? "JP" : "US";
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

  async function fetchVerificationCode(email) {
    try {
      const resp = await fetch(`${CODE_API}?email=${encodeURIComponent(email)}&format=json`);
      const data = await resp.json();
      if (data && data.code) return data.code;
    } catch (e) {}
    return null;
  }

  const regionConfig = {
    ID: { country: "ID", currency: "IDR" },
    IE: { country: "IE", currency: "EUR" },
    JP: { country: "JP", currency: "JPY" },
    US: { country: "US", currency: "USD" },
    DE: { country: "DE", currency: "EUR" }
  };

  async function requestChatGptCheckoutLinkOnly(checkoutRegion) {
    try {
      const session = await fetch("https://chatgpt.com/api/auth/session", {
        cache: "no-store",
        credentials: "include"
      }).then((r) => r.json());
      const accessToken = session && session.accessToken;
      if (!accessToken) return { ok: false, error: "accessToken: null" };

      const config = regionConfig[checkoutRegion] || regionConfig.ID;
      const payload = {
        plan_name: "chatgptplusplan",
        billing_details: { country: config.country, currency: config.currency },
        cancel_url: "https://chatgpt.com/#pricing",
        promo_campaign: { promo_campaign_id: "plus-1-month-free", is_coupon_from_query_param: false },
        checkout_ui_mode: "hosted"
      };

      const resp = await fetch("https://chatgpt.com/backend-api/payments/checkout", {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      const paymentLink = data && (data.url || data.stripe_hosted_url || data.checkout_url) || null;
      return {
        ok: resp.ok && Boolean(paymentLink),
        accessToken,
        paymentLink,
        error: resp.ok ? "" : `HTTP ${resp.status}`
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

  async function runRegistration(tabId) {
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
    await executeScriptAfterPageReady(tabId, { code: clickRegisterCode }, "点击注册按钮");
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
    const hasEmail = (await executeScriptAfterPageReady(tabId, { code: waitEmailCode }, "等待邮箱输入框"))[0];
    if (!hasEmail) {
      logMessage("错误: #email 未出现，超时");
      return { ok: false };
    }

    const localPart = generateLocalPart();
    const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
    const email = `${localPart}@${domain}`;
    const randomName = generateRandomName();
    const randomAge = String(generateRandomAge());
    logMessage(`生成注册邮箱: ${email}`);

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
        const input = document.querySelector('#email');
        const nameInput = document.querySelector('input[name="name"]');
        const ageInput = document.querySelector('input[name="age"]');
        if (input) simulateType(input, ${JSON.stringify(email)});
        if (nameInput) simulateType(nameInput, ${JSON.stringify(randomName)});
        if (ageInput) simulateType(ageInput, ${JSON.stringify(randomAge)});
        return { email: Boolean(input), nameAge: Boolean(nameInput && ageInput) };
      })();
    `;
    const fillEmailResult = (await executeScriptAfterPageReady(tabId, { code: fillEmailCode }, "填写邮箱"))[0] || {};
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
        const start = Date.now();
        while (Date.now() - start < 60000) {
          const nameInput = document.querySelector('input[name="name"]');
          const ageInput = document.querySelector('input[name="age"]');
          if (nameInput && ageInput) {
            simulateType(nameInput, ${JSON.stringify(randomName)});
            simulateType(ageInput, ${JSON.stringify(randomAge)});
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
    await executeScriptAfterPageReady(tabId, { code: clickSubmitCode }, "提交邮箱");
    if (nameAgeFilledOnEmailPage) {
      await delay(3000);
      const clickedTryAgain = await clickAboutYouTryAgainIfPresent(tabId, clickTryAgainCode);
      if (clickedTryAgain) {
        logMessage("邮箱页提交后仍在 about-you 页面，检测到 Try again，已点击后重新填写姓名和年龄");
        const nameAgeSubmitted = await submitNameAgeWithTryAgainRetry(tabId, fillNameAgeCode, clickSubmitCode, clickTryAgainCode);
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
    await executeScriptAfterPageReady(tabId, { code: fillCodeOnly }, "填写验证码");
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
    await executeScriptAfterPageReady(tabId, { code: submitCodeBtn }, "提交验证码");

    if (!nameAgeFilledOnEmailPage) {
      logMessage("验证码已提交，等待姓名和年龄输入框...");
      const nameAgeSubmitted = await submitNameAgeWithTryAgainRetry(tabId, fillNameAgeCode, submitCodeBtn, clickTryAgainCode);
      if (!nameAgeSubmitted) {
        return { ok: false };
      }
    } else {
      logMessage("验证码已提交，等待进入 chatgpt.com");
    }
    return { ok: true, email };
  }

  async function submitNameAgeWithTryAgainRetry(tabId, fillNameAgeCode, submitCodeBtn, clickTryAgainCode) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const fillNameAgeResult = (await executeScriptAfterPageReady(tabId, { code: fillNameAgeCode }, "填写姓名和年龄"))[0] || {};
      if (!fillNameAgeResult.ok) {
        logMessage("错误: 姓名和年龄输入框未出现，超时");
        return false;
      }

      await delay(1000);
      await scrollTabToBottom(tabId);
      await executeScriptAfterPageReady(tabId, { code: submitCodeBtn }, "提交姓名和年龄");
      logMessage(attempt === 1 ? "姓名和年龄已提交，等待进入 chatgpt.com" : `姓名和年龄已重新提交，第 ${attempt} 次，等待进入 chatgpt.com`);
      await delay(3000);

      const clickedTryAgain = await clickAboutYouTryAgainIfPresent(tabId, clickTryAgainCode);
      if (!clickedTryAgain) {
        return true;
      }

      logMessage(`仍在 about-you 页面，检测到 Try again，已点击后准备重新填写（第 ${attempt}/5 次）`);
      await delay(1500);
    }

    logMessage("错误: about-you 页面 Try again 重试次数已达上限");
    return false;
  }

  async function clickAboutYouTryAgainIfPresent(tabId, clickTryAgainCode) {
    const tab = await ext.tabs.get(tabId);
    const currentUrl = String(tab.url || "");
    if (!currentUrl.startsWith("https://auth.openai.com/about-you")) {
      return false;
    }
    return Boolean((await executeScriptAfterPageReady(tabId, { code: clickTryAgainCode }, "检测并点击 Try again"))[0]);
  }

  async function createTabInActiveWindow(url) {
    try {
      const win = await ext.windows.getLastFocused({ windowTypes: ["normal"] });
      if (win && win.id !== undefined) {
        return await ext.tabs.create({ windowId: win.id, url, active: true });
      }
    } catch (error) {
      console.warn("Failed to get active browser window", error);
    }
    return ext.tabs.create({ url, active: true });
  }

  async function startAutomation() {
    const countrySel = document.getElementById("country").value;
    let prepared;
    try {
      prepared = await preparePaymentInputs(false);
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return;
    }

    logMessage("开始完整自动化流程...");
    try {
      await ensureProxyForStage("第一步");
    } catch (error) {
      logMessage("第一步代理设置失败，流程终止: " + formatError(error));
      return;
    }
    const tab = await createTabInActiveWindow("https://chatgpt.com");
    logMessage("步骤1: 打开 chatgpt.com");

    const registration = await runRegistration(tab.id);
    if (!registration.ok) {
      logMessage("注册失败，流程终止");
      return;
    }

    let reachedChat = false;
    for (let i = 0; i < 45; i += 1) {
      try {
        const t = await ext.tabs.get(tab.id);
        if (t.url && t.url.startsWith("https://chatgpt.com")) {
          reachedChat = true;
          break;
        }
      } catch (_) {}
      await delay(1500);
    }

    if (!reachedChat) {
      logMessage("错误: 未成功到达 chatgpt.com");
      return;
    }

    setActiveStep(2);
    logMessage("步骤2: 获取支付链接");
    const result = await requestChatGptCheckoutLinkOnly(countrySel);
    if (!result.ok || !result.paymentLink) {
      logMessage("获取支付链接失败: " + (result.error || "未知错误"));
      return;
    }

    document.getElementById("payUrlInput").value = result.paymentLink;
    await persistState();
    logMessage("支付链接获取成功: " + result.paymentLink);
    logMessage("正在提交到第三方接口...");
    const thirdPartyResult = await submitThirdPartyAccount({
      account: registration.email,
      accessToken: result.accessToken,
      payurl: result.paymentLink
    });
    if (thirdPartyResult.ok) {
      logMessage("第三方接口提交成功");
    } else {
      logMessage("第三方接口提交失败: " + (thirdPartyResult.error || "未知错误"));
    }

    prepared.payUrl = result.paymentLink;
    await runPayPalFlow(tab.id, prepared);
  }

  async function startFromPayUrl() {
    let prepared;
    try {
      prepared = await preparePaymentInputs(true);
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return;
    }

    logMessage("从 PayURL 开始支付流程...");
    try {
      await ensureProxyForStage("第三步");
    } catch (error) {
      logMessage("第三步代理设置失败，流程终止: " + formatError(error));
      return;
    }
    const tab = await createTabInActiveWindow(prepared.payUrl);
    await runPayPalFlow(tab.id, prepared, { proxyReady: true });
  }

  async function startFromStep3() {
    let prepared;
    try {
      prepared = await preparePaymentInputs(false);
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return;
    }

    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      logMessage("错误: 未找到当前标签页");
      return;
    }

    logMessage("从当前页面第3步开始支付流程...");
    try {
      await ensureProxyForStage("第三步");
    } catch (error) {
      logMessage("第三步代理设置失败，流程终止: " + formatError(error));
      return;
    }
    await runPayPalFlowFromCurrentPayUrl(tab.id, prepared);
  }

  async function manualFillStep5Form() {
    let prepared;
    try {
      prepared = await preparePaymentInputs(false, { reusePaypalEmail: true });
    } catch (error) {
      logMessage("错误: " + formatError(error));
      return;
    }

    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      logMessage("错误: 未找到当前标签页");
      return;
    }

    setActiveStep(5);
    logMessage("手动填充第5步 PayPal signup 表单...");
    await fillPayPalSignupForm(tab.id, prepared);
    logMessage("第5步表单已填充，未自动提交");
  }

  async function preparePaymentInputs(requirePayUrl, options = {}) {
    const cardText = document.getElementById("cardInput").value.trim();
    const payUrl = document.getElementById("payUrlInput").value.trim();
    if (!cardText) {
      throw new Error("请输入卡片信息");
    }
    const card = await parseCardInput(cardText);
    if (state.randomCardEnabled) {
      const generatedCardNumber = generateRandomLuhnCardNumber(card.card);
      card.card = generatedCardNumber;
      logMessage(`已随机生成 Luhn 有效卡号: ${generatedCardNumber}`);
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
    const phoneKey = pickRandomPhoneKey(document.getElementById("phoneKeyInput").value);
    state.phoneKey = phoneKey;
    state.phoneKeyInput = document.getElementById("phoneKeyInput").value.trim();
    const paypalEmail = options.reusePaypalEmail && state.lastPaypalEmail
      ? state.lastPaypalEmail
      : generateGmailAddress();
    state.lastPaypalEmail = paypalEmail;
    await persistState();
    return {
      card,
      phoneKey,
      phone: phoneKey.phone || getFillPhoneNumber(card),
      payUrl,
      settings: sanitizeFillSettings(state.fillSettings),
      paypalEmail
    };
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
        return;
      }
    }
    await updateTabUrl(tabId, prepared.payUrl);
    await runPayPalFlowFromCurrentPayUrl(tabId, prepared);
  }

  async function runPayPalFlowFromCurrentPayUrl(tabId, prepared) {
    await runPayUrlPage(tabId, prepared);
    await runPayPalLoginPage(tabId, prepared);
    await runPayPalSignupPage(tabId, prepared);
    logMessage("PayPal 步骤已完成，短信验证码已输入");
  }

  async function runPayUrlPage(tabId, prepared) {
    setActiveStep(3);
    logMessage("步骤3: 等待 PayURL 页面 PayPal 选项");
    await ensureContentScript(tabId);
    await clickPageElement(tabId, {
      selector: 'button[data-testid="paypal-accordion-item-button"]',
      timeoutMs: 60000
    }, "未找到 PayPal 支付选项");
    logMessage("已选择 PayPal，填充卡片信息");
    await delay();
    await fillCurrentPage(tabId, prepared);
    await scrollTabToBottom(tabId);
    await requirePageResult(tabId, "__gptAutoRegisterCheck", {
      selector: "#termsOfServiceConsentCheckbox",
      timeoutMs: 30000
    }, "未找到服务条款复选框");
    const submitDelayMs = randomDelayMs();
    logMessage(`表单已填充，等待 ${(submitDelayMs / 1000).toFixed(1)} 秒后提交`);
    await delay(submitDelayMs);
    await clickPageElement(tabId, {
      selector: 'button[type="submit"]',
      timeoutMs: 30000
    }, "未找到提交按钮");
    logMessage("PayURL 页面已提交");
  }

  async function runPayPalLoginPage(tabId, prepared) {
    setActiveStep(4);
    logMessage("步骤4: 等待进入 paypal.com");
    await waitForUrlPrefix(tabId, "https://www.paypal.com", 90000);
    await delay();
    await ensureContentScript(tabId);
    await delay();
    logMessage("检测是否有滑块验证码");
    const captchaChecks = await executePageFunction(tabId, "__gptAutoRegisterCheckCaptcha", {
      timeoutMs: 10000
    }, {
      allFrames: true
    });
    const captchaCheck = (Array.isArray(captchaChecks) ? captchaChecks : [captchaChecks])
      .filter(Boolean)
      .find((result) => result.hasCaptcha);
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
        logMessage("滑块验证码已完成");
        await delay();
      } else {
        logMessage(`滑块验证码处理失败: ${captchaResult ? captchaResult.error : "未知错误"}`);
      }
    }

    logMessage("等待点击");
    await delay();
    await clickPageElement(tabId, {
      selector: '#createAccount, #startOnboardingFlow, button[data-atomic-wait-intent="Pay_With_Card"]',
      timeoutMs: 60000
    }, "PayPal 页面未找到提交按钮");
    logMessage("点击了按钮");
    logMessage("等待插件邮箱输入框");
    await delay();
    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: '#login_email, #onboardingFlowEmail',
      value: prepared.paypalEmail,
      type: true,
      timeoutMs: 60000
    }, "未找到 PayPal login_email");
    logMessage(`已输入 PayPal 邮箱: ${prepared.paypalEmail}`);
    await clickPageElement(tabId, {
      selector: "button",
      timeoutMs: 30000
    }, "PayPal 页面未找到下一步按钮");
  }

  async function runPayPalSignupPage(tabId, prepared) {
    setActiveStep(5);
    logMessage("步骤5: 等待 PayPal signup 页面");
    await waitForUrlPrefix(tabId, "https://www.paypal.com/checkoutweb/signup", 120000);
    const stopCaptchaCleaner = startCaptchaCleaner(tabId, "#captchaComponent");
    try {
      await fillPayPalSignupForm(tabId, prepared);
      await delay();

      await submitSignupForm(tabId);
      logMessage("已提交 signup，开始获取短信验证码");
      await delay();
      await refillSignupFormIfCleared(tabId, prepared);
      await requirePageResult(tabId, "__gptAutoRegisterWaitForSelector", {
        selector: "#ci-ciBasic-0",
        timeoutMs: 120000
      }, "未找到短信验证码输入框");
      const smsCode = await fetchPhoneVerificationCode(prepared.phoneKey);
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
      await finishPayPalConsent(tabId);
    } finally {
      stopCaptchaCleaner();
    }
  }

  async function finishPayPalConsent(tabId) {
    logMessage("等待 PayPal Hermes 授权页面...");
    await waitForUrlPrefix(tabId, "https://www.paypal.com/webapps/hermes", 120000);
    logMessage("已进入 Hermes 页面，等待点击授权按钮");
    await clickPageElement(tabId, {
      selector: "#consentButton",
      timeoutMs: 60000
    }, "未找到 PayPal 授权按钮 #consentButton");
    logMessage("已点击 PayPal 授权按钮，等待返回 ChatGPT");
    const finalUrl = await waitForUrlPrefix(tabId, "https://chatgpt.com/", 120000);
    logMessage(`支付流程成功，已返回 ChatGPT: ${finalUrl}`);
  }

  async function fillPayPalSignupForm(tabId, prepared) {
    await ensureContentScript(tabId);
    await delay();
    logMessage("步骤5: 判断国家是否是us");
    const countryResult = await requirePageResult(tabId, "__gptAutoRegisterSetSelectIfNeeded", {
      selector: "#country",
      value: "US",
      timeoutMs: 60000
    }, "未找到国家字段");
    if (countryResult.changed) {
      logMessage("国家已改为 US，等待 3 秒");
      await delay();
    } else {
      logMessage("步骤5: 国家为us不用修改");
    }

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
    await fillCurrentPage(tabId, prepared, createSignupFillOptions());
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
    await fillCurrentPage(tabId, prepared, createSignupFillOptions());
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

  async function waitForPageComplete(tabId, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const tab = await ext.tabs.get(tabId);
        const readyState = (await ext.tabs.executeScript(tabId, {
          code: "document.readyState"
        }))[0];
        if ((!tab.status || tab.status === "complete") && readyState === "complete") {
          return true;
        }
      } catch (_) {}
      await delay(500);
    }
    return false;
  }

  async function executePageFunction(tabId, functionName, payload, options = {}) {
    await ensureContentScript(tabId, Boolean(options.allFrames));
    const code = `window.${functionName} && window.${functionName}(${JSON.stringify(payload || {})})`;
    const results = await executeScriptAfterPageReady(tabId, {
      code,
      allFrames: Boolean(options.allFrames),
      runAt: "document_idle"
    }, functionName);
    return options.allFrames ? results : (Array.isArray(results) ? results[0] : results);
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
      await executeScriptAfterPageReady(tabId, {
        code: `
          (async function() {
            function fireScrollEvent(target) {
              if (!target || typeof target.dispatchEvent !== 'function') {
                return;
              }
              target.dispatchEvent(new Event('scroll', {
                bubbles: true,
                cancelable: false
              }));
            }

            function scrollElementToBottom(element) {
              if (!element) {
                return false;
              }
              const bottom = Math.max(element.scrollHeight || 0, element.clientHeight || 0);
              const before = element.scrollTop;
              element.scrollTop = bottom;
              fireScrollEvent(element);
              return element.scrollTop !== before;
            }

            function isScrollableElement(element) {
              if (!element || element === document.documentElement || element === document.body) {
                return false;
              }
              const style = window.getComputedStyle(element);
              const overflowY = style.overflowY;
              return /(auto|scroll|overlay)/.test(overflowY) && element.scrollHeight > element.clientHeight;
            }

            const root = document.scrollingElement || document.documentElement || document.body;
            const bottom = Math.max(
              root ? root.scrollHeight : 0,
              document.documentElement ? document.documentElement.scrollHeight : 0,
              document.body ? document.body.scrollHeight : 0
            );
            window.scrollTo(0, bottom);
            if (root) {
              root.scrollTop = bottom;
              fireScrollEvent(root);
            }
            fireScrollEvent(window);
            fireScrollEvent(document);
            fireScrollEvent(document.body);

            Array.from(document.querySelectorAll('*'))
              .filter(isScrollableElement)
              .forEach(scrollElementToBottom);

            await new Promise(resolve => requestAnimationFrame(resolve));
            window.scrollTo(0, Math.max(bottom, root ? root.scrollHeight : 0));
            if (root) {
              root.scrollTop = root.scrollHeight;
              fireScrollEvent(root);
            }
            fireScrollEvent(window);
            return true;
          })();
        `,
        runAt: "document_idle"
      }, "滚动页面", { loadTimeoutMs: 15000 });
    } catch (_) {}
  }

  async function clickPageElement(tabId, payload, errorMessage) {
    await scrollTabToBottom(tabId);
    return requirePageResult(tabId, "__gptAutoRegisterClick", payload, errorMessage);
  }

  async function requirePageResult(tabId, functionName, payload, errorMessage) {
    const result = await executePageFunction(tabId, functionName, payload);
    if (!result || !result.ok) {
      throw new Error((result && result.error) || errorMessage);
    }
    return result;
  }

  function createPayUrlFillOptions() {
    return {
      payUrlStyle: true
    };
  }

  function createSignupFillOptions() {
    return {
      ...createPayUrlFillOptions(),
      skipFields: ["country"]
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
    if (!summary.success) {
      throw new Error(summary.message);
    }
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

  async function fetchPhoneVerificationCode(phoneKey) {
    let lastError = "";
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
          return code;
        }
        lastError = response.ok ? "响应里没有匹配到 6 位验证码" : `HTTP ${response.status} ${body.slice(0, 120)}`;
      } catch (error) {
        lastError = formatError(error);
      }
      if (attempt < POLL_ATTEMPTS) {
        logMessage(`第 ${attempt}/${POLL_ATTEMPTS} 次未取到短信码，继续轮询`);
        await delay(POLL_DELAY_MS);
      }
    }
    throw new Error(`获取短信验证码失败，已轮询 ${POLL_ATTEMPTS} 次: ${lastError || "没有匹配到 6 位验证码"}`);
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
      if (saved.cardInput) document.getElementById("cardInput").value = saved.cardInput;
      if (saved.payUrlInput) document.getElementById("payUrlInput").value = saved.payUrlInput;
      if (saved.phoneKeyInput) document.getElementById("phoneKeyInput").value = saved.phoneKeyInput;
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
      renderProxyStatus();
      state.randomCardEnabled = Boolean(saved.randomCardEnabled);
      document.getElementById("randomCardCheckbox").checked = state.randomCardEnabled;
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
      cardInput: document.getElementById("cardInput").value,
      randomCardEnabled: document.getElementById("randomCardCheckbox").checked,
      payUrlInput: document.getElementById("payUrlInput").value,
      phoneKeyInput: document.getElementById("phoneKeyInput").value,
      proxyEnabled: document.getElementById("proxyEnabledCheckbox").checked,
      webshareApiKey: document.getElementById("webshareApiKeyInput").value,
      proxyProtocol: normalizeProxyProtocol(document.getElementById("proxyProtocolSelect").value),
      step1ProxyCountry: normalizeProxyCountry(document.getElementById("step1ProxyCountrySelect").value),
      step3ProxyCountry: normalizeProxyCountry(document.getElementById("step3ProxyCountrySelect").value),
      currentProxy: state.currentProxy,
      fillSettings: sanitizeFillSettings(state.fillSettings),
      fillSettingsExpanded: state.fillSettingsExpanded,
      lastPhoneCode: state.lastPhoneCode,
      lastPaypalEmail: state.lastPaypalEmail
    };
    return ext.storage.local.set({ [STORAGE_KEY]: nextState });
  }

  function bindEvents() {
    document.getElementById("startBtn").addEventListener("click", () => runWithErrorHandling(startAutomation));
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
    document.getElementById("cardInput").addEventListener("input", persistState);
    document.getElementById("randomCardCheckbox").addEventListener("change", () => {
      state.randomCardEnabled = document.getElementById("randomCardCheckbox").checked;
      persistState();
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
