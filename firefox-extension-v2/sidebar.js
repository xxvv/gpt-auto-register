(function () {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : chrome;

  const STORAGE_KEY = "gptAccessibleFormHelperV2State";
  const US_ZIP3_STATE_RANGES_PATH = "us_zip3_state_ranges.json";
  const EMAIL_WAIT_ATTEMPTS = 60;
  const EMAIL_WAIT_DELAY_MS = 1000;
  const ABOUT_WAIT_ATTEMPTS = 60;
  const ABOUT_WAIT_DELAY_MS = 1000;

  const CHECKOUT_COUNTRIES = Object.freeze({
    JP: { country: "JP", currency: "JPY", label: "日本" },
    US: { country: "US", currency: "USD", label: "美国" },
    IN: { country: "IN", currency: "INR", label: "印度" },
    DE: { country: "DE", currency: "EUR", label: "德国" }
  });

  const elements = {
    currentTabText: document.getElementById("currentTabText"),
    refreshTabButton: document.getElementById("refreshTabButton"),
    registerStep: document.getElementById("registerStep"),
    paymentStep: document.getElementById("paymentStep"),
    startButton: document.getElementById("startButton"),
    emailInput: document.getElementById("emailInput"),
    codeInput: document.getElementById("codeInput"),
    fillCodeButton: document.getElementById("fillCodeButton"),
    nameInput: document.getElementById("nameInput"),
    ageInput: document.getElementById("ageInput"),
    checkoutCountrySelect: document.getElementById("checkoutCountrySelect"),
    fetchCheckoutButton: document.getElementById("fetchCheckoutButton"),
    copyPaymentLinkButton: document.getElementById("copyPaymentLinkButton"),
    paymentLinkOutput: document.getElementById("paymentLinkOutput"),
    cardInput: document.getElementById("cardInput"),
    cardPreview: document.getElementById("cardPreview"),
    fillCardButton: document.getElementById("fillCardButton"),
    clearLogButton: document.getElementById("clearLogButton"),
    logList: document.getElementById("logList")
  };

  const state = {
    email: "",
    code: "",
    name: "",
    age: "",
    checkoutCountry: "JP",
    cardInput: "",
    lastPaymentLink: "",
    step: "register",
    logs: [],
    currentTab: null,
    busy: new Set()
  };

  let usZip3StateRangesPromise = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    await restoreState();
    await refreshCurrentTab();
    await renderCardPreview();
    renderAll();
  }

  function bindEvents() {
    elements.refreshTabButton.addEventListener("click", refreshCurrentTab);
    elements.startButton.addEventListener("click", startRegistrationAssist);
    elements.fillCodeButton.addEventListener("click", fillVerificationCode);
    elements.fetchCheckoutButton.addEventListener("click", fetchCheckoutLink);
    elements.copyPaymentLinkButton.addEventListener("click", copyPaymentLink);
    elements.fillCardButton.addEventListener("click", fillCardInCurrentTab);
    elements.clearLogButton.addEventListener("click", clearLogs);

    [
      ["emailInput", "email"],
      ["codeInput", "code"],
      ["nameInput", "name"],
      ["ageInput", "age"],
      ["cardInput", "cardInput"]
    ].forEach(([elementKey, stateKey]) => {
      elements[elementKey].addEventListener("input", async () => {
        state[stateKey] = elements[elementKey].value;
        if (stateKey === "cardInput") {
          await renderCardPreview();
        }
        persistState();
      });
    });

    elements.checkoutCountrySelect.addEventListener("change", () => {
      state.checkoutCountry = normalizeCheckoutCountry(elements.checkoutCountrySelect.value);
      elements.checkoutCountrySelect.value = state.checkoutCountry;
      persistState();
    });
  }

  async function restoreState() {
    try {
      const saved = await ext.storage.local.get(STORAGE_KEY);
      const stored = saved && saved[STORAGE_KEY] && typeof saved[STORAGE_KEY] === "object"
        ? saved[STORAGE_KEY]
        : {};
      state.email = String(stored.email || "");
      state.code = String(stored.code || "");
      state.name = String(stored.name || "");
      state.age = String(stored.age || "");
      state.checkoutCountry = normalizeCheckoutCountry(stored.checkoutCountry || "JP");
      state.cardInput = String(stored.cardInput || "");
      state.lastPaymentLink = String(stored.lastPaymentLink || "");
      state.step = stored.step === "payment" ? "payment" : "register";
      state.logs = Array.isArray(stored.logs) ? stored.logs.slice(-80) : [];
    } catch (error) {
      state.logs = [];
      addLog("error", `读取保存状态失败：${formatError(error)}`, { skipPersist: true });
    }
  }

  async function persistState() {
    const serializable = {
      email: state.email,
      code: state.code,
      name: state.name,
      age: state.age,
      checkoutCountry: state.checkoutCountry,
      cardInput: state.cardInput,
      lastPaymentLink: state.lastPaymentLink,
      step: state.step,
      logs: state.logs.slice(-80)
    };
    try {
      await ext.storage.local.set({ [STORAGE_KEY]: serializable });
    } catch (error) {
      console.warn("Failed to persist v2 state", error);
    }
  }

  function renderAll() {
    elements.emailInput.value = state.email;
    elements.codeInput.value = state.code;
    elements.nameInput.value = state.name;
    elements.ageInput.value = state.age;
    elements.checkoutCountrySelect.value = state.checkoutCountry;
    elements.cardInput.value = state.cardInput;
    renderPaymentLink();
    renderSteps();
    renderLogs();
    renderBusy();
  }

  function renderSteps() {
    elements.registerStep.classList.toggle("active", state.step === "register");
    elements.registerStep.classList.toggle("done", state.step === "payment");
    elements.paymentStep.classList.toggle("active", state.step === "payment");
  }

  function renderPaymentLink() {
    const link = String(state.lastPaymentLink || "").trim();
    elements.paymentLinkOutput.classList.toggle("visible", Boolean(link));
    elements.paymentLinkOutput.textContent = link ? `paymentLink: ${link}` : "";
  }

  function renderLogs() {
    elements.logList.textContent = "";
    state.logs.forEach((entry) => {
      const item = document.createElement("li");
      item.className = `log-item ${entry.level || "info"}`;
      const meta = document.createElement("div");
      meta.className = "log-meta";
      meta.textContent = `${entry.time || ""} · ${entry.level || "info"}`;
      const message = document.createElement("div");
      message.className = "log-message";
      message.textContent = entry.message || "";
      item.append(meta, message);
      elements.logList.append(item);
    });
  }

  function renderBusy() {
    const registrationBusy = state.busy.has("registration");
    const codeBusy = state.busy.has("code");
    const checkoutBusy = state.busy.has("checkout");
    const cardBusy = state.busy.has("card");

    elements.startButton.disabled = registrationBusy;
    elements.fillCodeButton.disabled = codeBusy;
    elements.fetchCheckoutButton.disabled = checkoutBusy;
    elements.copyPaymentLinkButton.disabled = !String(state.lastPaymentLink || "").trim();
    elements.fillCardButton.disabled = cardBusy;

    elements.startButton.textContent = registrationBusy ? "进行中" : "开始";
    elements.fillCodeButton.textContent = codeBusy ? "填写中" : "填写验证码";
    elements.fetchCheckoutButton.textContent = checkoutBusy ? "获取中" : "获取支付链接";
    elements.fillCardButton.textContent = cardBusy ? "填充中" : "填充卡片";
  }

  async function refreshCurrentTab() {
    try {
      const tabs = await ext.tabs.query({ active: true, currentWindow: true });
      state.currentTab = tabs && tabs[0] ? tabs[0] : null;
      elements.currentTabText.textContent = state.currentTab && state.currentTab.url
        ? state.currentTab.url
        : "未找到当前标签页";
      if (state.currentTab && /^https:\/\/chatgpt\.com\//i.test(String(state.currentTab.url || ""))) {
        state.step = "payment";
        await persistState();
      }
      renderSteps();
      return state.currentTab;
    } catch (error) {
      elements.currentTabText.textContent = `读取标签页失败：${formatError(error)}`;
      return null;
    }
  }

  async function startRegistrationAssist() {
    const email = String(elements.emailInput.value || "").trim();
    if (!email) {
      addLog("error", "请先输入邮箱。");
      elements.emailInput.focus();
      return;
    }
    state.email = email;
    state.step = "register";
    setBusy("registration", true);

    try {
      addLog("info", "正在打开 https://chatgpt.com/");
      const tab = await ext.tabs.create({ url: "https://chatgpt.com/", active: true });
      await delay(2500);

      addLog("info", "尝试点击页面上的注册入口。");
      await ensureContentScript(tab.id, false);
      const signupResult = await runScript(tab.id, "window.__gptV2TryOpenSignup && window.__gptV2TryOpenSignup()");
      if (signupResult && signupResult.clicked) {
        addLog("success", "已点击注册入口。");
      } else {
        addLog("info", "没有找到注册入口；请在打开的页面手动点击注册。");
      }

      addLog("info", "开始等待邮箱输入框，每 1 秒检查一次，最多 60 秒。");
      const emailTab = await waitForSelectorInTabs(["#email", "input[type='email']"], EMAIL_WAIT_ATTEMPTS, EMAIL_WAIT_DELAY_MS);
      const fillResult = await runScript(
        emailTab.id,
        `window.__gptV2FillEmail && window.__gptV2FillEmail(${JSON.stringify({ email })})`
      );
      if (!fillResult || !fillResult.ok) {
        throw new Error((fillResult && fillResult.error) || "邮箱填充失败");
      }
      addLog("success", `邮箱已填入 ${email}，提交按钮已聚焦，请确认后手动提交。`);
    } catch (error) {
      addLog("error", `注册辅助失败：${formatError(error)}`);
    } finally {
      setBusy("registration", false);
      await refreshCurrentTab();
    }
  }

  async function fillVerificationCode() {
    const code = String(elements.codeInput.value || "").trim();
    if (!code) {
      addLog("error", "请先输入验证码。");
      elements.codeInput.focus();
      return;
    }
    state.code = code;
    setBusy("code", true);

    try {
      const tab = await findBestTab([
        /^https:\/\/auth\.openai\.com\/email-verification/i,
        /^https:\/\/auth\.openai\.com\//i
      ]);
      addLog("info", "正在检查验证码输入框。");
      await ensureContentScript(tab.id, false);
      await waitForSelectorInTab(tab.id, ["input[name='code']", "#code", "input[autocomplete='one-time-code']"], 20, 1000);
      const result = await runScript(
        tab.id,
        `window.__gptV2FillCode && window.__gptV2FillCode(${JSON.stringify({ code })})`
      );
      if (!result || !result.ok) {
        throw new Error((result && result.error) || "验证码填充失败");
      }
      addLog("success", "验证码已填入，提交按钮已聚焦，请确认后手动提交。");

      await maybeFillAboutYou(tab);
    } catch (error) {
      addLog("error", `填写验证码失败：${formatError(error)}`);
    } finally {
      setBusy("code", false);
      await refreshCurrentTab();
    }
  }

  async function maybeFillAboutYou(currentTab) {
    const name = String(elements.nameInput.value || "").trim();
    const age = String(elements.ageInput.value || "").trim();
    if (!name || !age) {
      addLog("info", "姓名或年龄未填写；到 about-you 页面后可补齐再重新点击填写验证码。");
      return;
    }
    validateAge(age);
    addLog("info", "等待个人信息字段出现。");
    let tab = currentTab || null;
    const hasNameOnCurrentPage = tab
      ? await checkSelectorInTab(tab.id, ["input[name='name']", "#name", "input[autocomplete='name']"])
      : false;

    if (hasNameOnCurrentPage) {
      addLog("info", "检测到验证码和个人信息合并在同一页面。");
    } else {
      tab = await waitForUrlAndSelector(
        /^https:\/\/auth\.openai\.com\/(?:about-you|email-verification\/register)/i,
        ["input[name='name']", "#name", "input[autocomplete='name']"],
        ABOUT_WAIT_ATTEMPTS,
        ABOUT_WAIT_DELAY_MS
      );
    }
    await waitForSelectorInTab(tab.id, ["input[name='age']", "#age", "input[type='number']"], 20, 1000);
    await ensureContentScript(tab.id, false);
    const result = await runScript(
      tab.id,
      `window.__gptV2FillAboutYou && window.__gptV2FillAboutYou(${JSON.stringify({ name, age })})`
    );
    if (!result || !result.ok) {
      throw new Error(`about-you 填充失败：${(result && result.missing && result.missing.join(", ")) || "字段缺失"}`);
    }
    addLog("success", "姓名和年龄已填入，提交按钮已聚焦，请确认后手动提交。");
  }

  async function fetchCheckoutLink() {
    const country = normalizeCheckoutCountry(elements.checkoutCountrySelect.value);
    state.checkoutCountry = country;
    setBusy("checkout", true);

    try {
      const tab = await findBestTab([/^https:\/\/chatgpt\.com\//i]);
      const config = CHECKOUT_COUNTRIES[country];
      addLog("info", `正在为${config.label}请求 Checkout 链接。`);
      const result = await runScript(
        tab.id,
        `(${requestCheckoutInPage.toString()})(${JSON.stringify(config)})`
      );
      if (!result || !result.ok) {
        throw new Error((result && (result.detail || result.error)) || "Checkout 请求失败");
      }

      state.step = "payment";
      state.lastPaymentLink = String(result.paymentLink || "").trim();
      await persistState();
      renderPaymentLink();

      try {
        await writeClipboard(state.lastPaymentLink);
        addLog("success", `支付链接已获取并复制：${state.lastPaymentLink}`);
      } catch (error) {
        addLog("success", `支付链接已获取，但复制失败：${formatError(error)}。链接：${state.lastPaymentLink}`);
      }
      await ext.tabs.create({ url: state.lastPaymentLink, active: true });
    } catch (error) {
      addLog("error", `获取支付链接失败：${formatError(error)}`);
    } finally {
      setBusy("checkout", false);
      await refreshCurrentTab();
    }
  }

  function requestCheckoutInPage(config) {
    return fetch("https://chatgpt.com/api/auth/session", {
      cache: "no-store",
      credentials: "include"
    })
      .then((response) => response.text().then((text) => {
        let session = {};
        try {
          session = text ? JSON.parse(text) : {};
        } catch (error) {
          return Promise.reject(new Error(`session_json_parse_failed: ${text.slice(0, 180)}`));
        }
        const accessToken = String(session.accessToken || session.access_token || session.token || "").trim();
        if (!accessToken) {
          return Promise.reject(new Error("session 缺少 accessToken，请确认已登录 ChatGPT"));
        }

        const payload = {
          plan_name: "chatgptplusplan",
          billing_details: {
            country: config.country,
            currency: config.currency
          },
          cancel_url: "https://chatgpt.com/#pricing",
          promo_campaign: {
            promo_campaign_id: "plus-1-month-free",
            is_coupon_from_query_param: false
          },
          checkout_ui_mode: "hosted"
        };

        return fetch("https://chatgpt.com/backend-api/payments/checkout", {
          method: "POST",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }).then((checkoutResponse) => checkoutResponse.text().then((checkoutText) => {
          let data = {};
          try {
            data = checkoutText ? JSON.parse(checkoutText) : {};
          } catch (error) {
            data = {};
          }
          const paymentLink = data && (data.url || data.stripe_hosted_url || data.checkout_url) || "";
          return {
            ok: checkoutResponse.ok && Boolean(paymentLink),
            status: checkoutResponse.status,
            accessToken,
            paymentLink,
            error: checkoutResponse.ok ? "" : `HTTP ${checkoutResponse.status}`,
            detail: paymentLink ? "" : `HTTP ${checkoutResponse.status}: ${checkoutText.slice(0, 300)}`
          };
        }));
      }))
      .catch((error) => ({
        ok: false,
        paymentLink: "",
        error: error && error.message ? error.message : "checkout_fetch_failed"
      }));
  }

  async function copyPaymentLink() {
    const link = String(state.lastPaymentLink || "").trim();
    if (!link) {
      addLog("error", "当前没有可复制的支付链接。");
      return;
    }
    try {
      await writeClipboard(link);
      addLog("success", "支付链接已复制。");
    } catch (error) {
      addLog("error", `复制支付链接失败：${formatError(error)}`);
    }
  }

  async function fillCardInCurrentTab() {
    setBusy("card", true);
    try {
      const card = await parseCardInput(elements.cardInput.value);
      const tab = await findBestTab([
        /^https:\/\/checkout\.stripe\.com\//i,
        /^https:\/\/[^/]*\.stripe\.com\//i
      ]);
      await ensureContentScript(tab.id, true);
      const results = await runScriptAllFrames(
        tab.id,
        `window.__gptV2FillCard && window.__gptV2FillCard(${JSON.stringify({ card, phone: card.phone })})`
      );
      const successful = results.filter((result) => result && result.ok);
      const filled = successful.reduce((sum, result) => sum + Number(result.filled || 0), 0);
      if (!filled) {
        const errors = results
          .map((result) => result && (result.error || (result.missing && result.missing.join(", "))))
          .filter(Boolean);
        throw new Error(errors[0] || "没有填入任何字段");
      }
      addLog("success", `卡片字段已填充 ${filled} 项；不会自动点击付款按钮。`);
    } catch (error) {
      addLog("error", `填充卡片失败：${formatError(error)}`);
    } finally {
      setBusy("card", false);
      await refreshCurrentTab();
    }
  }

  async function renderCardPreview() {
    const text = String(elements.cardInput.value || state.cardInput || "").trim();
    elements.cardPreview.textContent = "";
    elements.cardPreview.classList.remove("visible");
    if (!text) {
      return;
    }

    try {
      const card = await parseCardInput(text);
      [
        ["卡号", maskCard(card.card)],
        ["有效期", card.expiryDisplay],
        ["CVV", card.cvv],
        ["姓名", card.billingName],
        ["地址", card.address],
        ["城市", card.city],
        ["州", card.state],
        ["邮编", card.postcode],
        ["国家", card.country],
        ["电话", card.phone]
      ].forEach(([label, value]) => {
        if (!String(value || "").trim()) {
          return;
        }
        const row = document.createElement("div");
        row.className = "preview-row";
        const labelNode = document.createElement("span");
        labelNode.className = "preview-label";
        labelNode.textContent = label;
        const valueNode = document.createElement("span");
        valueNode.className = "preview-value";
        valueNode.textContent = value;
        row.append(labelNode, valueNode);
        elements.cardPreview.append(row);
      });
      elements.cardPreview.classList.add("visible");
    } catch (error) {
      elements.cardPreview.textContent = `卡片解析失败：${formatError(error)}`;
      elements.cardPreview.classList.add("visible");
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
    const expiryInfo = parseExpiry(expiry);
    const addressInfo = await parseAddressBlob(addressBlob);
    const firstName = extractFirstName(name);
    const lastName = extractLastName(name);
    const billingName = [firstName, lastName].filter(Boolean).join(" ");

    const parsed = {
      card: String(card || "").replace(/\s+/g, ""),
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

    const missing = ["card", "year", "month", "cvv", "name", "address", "city", "state", "postcode"]
      .filter((key) => !String(parsed[key] || "").trim());
    if (missing.length) {
      throw new Error(`卡片字段为空：${missing.join(", ")}`);
    }
    return parsed;
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

    return {
      year: yearDigits,
      month: String(monthNumber),
      display: `${monthNumber}/${yearDigits.slice(-2)}`,
      input: `${String(monthNumber).padStart(2, "0")}${yearDigits.slice(-2)}`
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
      usZip3StateRangesPromise = fetch(ext.runtime.getURL(US_ZIP3_STATE_RANGES_PATH), { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const payload = await response.json();
          if (!Array.isArray(payload)) {
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

  function normalizeUsPhone(phone) {
    let normalized = String(phone || "").trim();
    if (normalized.startsWith("+1")) {
      normalized = normalized.slice(2).trim();
    }
    return normalized.replace(/\D+/g, "");
  }

  function maskCard(card) {
    const compact = String(card || "").replace(/\s+/g, "");
    if (compact.length <= 8) {
      return compact;
    }
    return `${compact.slice(0, 6)}******${compact.slice(-4)}`;
  }

  async function waitForSelectorInTabs(selectors, attempts, delayMs) {
    let lastError = "";
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const tabs = await ext.tabs.query({});
      const candidates = tabs.filter((tab) => /^https:\/\/(chatgpt\.com|auth\.openai\.com)\//i.test(String(tab.url || "")));
      for (const tab of candidates) {
        try {
          const found = await checkSelectorInTab(tab.id, selectors);
          if (found) {
            return tab;
          }
        } catch (error) {
          lastError = formatError(error);
        }
      }
      if (attempt < attempts) {
        await delay(delayMs);
      }
    }
    throw new Error(`等待字段超时：${selectorText(selectors)}${lastError ? `；${lastError}` : ""}`);
  }

  async function waitForSelectorInTab(tabId, selectors, attempts, delayMs) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (await checkSelectorInTab(tabId, selectors)) {
        return true;
      }
      if (attempt < attempts) {
        await delay(delayMs);
      }
    }
    throw new Error(`等待字段超时：${selectorText(selectors)}`);
  }

  async function waitForUrlAndSelector(urlPattern, selectors, attempts, delayMs) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const tabs = await ext.tabs.query({});
      const candidates = tabs.filter((tab) => urlPattern.test(String(tab.url || "")));
      for (const tab of candidates) {
        if (await checkSelectorInTab(tab.id, selectors)) {
          return tab;
        }
      }
      if (attempt < attempts) {
        await delay(delayMs);
      }
    }
    throw new Error(`等待页面或字段超时：${selectorText(selectors)}`);
  }

  async function checkSelectorInTab(tabId, selectors) {
    const code = `Boolean(document.querySelector(${JSON.stringify(selectorList(selectors).join(","))}))`;
    const result = await runScript(tabId, code);
    return Boolean(result);
  }

  async function findBestTab(patterns) {
    await refreshCurrentTab();
    if (state.currentTab && patterns.some((pattern) => pattern.test(String(state.currentTab.url || "")))) {
      return state.currentTab;
    }
    const tabs = await ext.tabs.query({});
    const matched = tabs.find((tab) => patterns.some((pattern) => pattern.test(String(tab.url || ""))));
    if (!matched) {
      throw new Error("未找到符合条件的标签页");
    }
    return matched;
  }

  async function runScript(tabId, code) {
    const results = await ext.tabs.executeScript(tabId, {
      code,
      allFrames: false,
      runAt: "document_idle"
    });
    return Array.isArray(results) ? results[0] : results;
  }

  async function ensureContentScript(tabId, allFrames) {
    try {
      await ext.tabs.executeScript(tabId, {
        file: "content-script.js",
        allFrames,
        runAt: "document_idle"
      });
    } catch (error) {
      console.warn("content-script injection failed", error);
    }
  }

  async function runScriptAllFrames(tabId, code) {
    const results = await ext.tabs.executeScript(tabId, {
      code,
      allFrames: true,
      runAt: "document_idle"
    });
    return Array.isArray(results) ? results : [results];
  }

  function selectorList(selectors) {
    return Array.isArray(selectors)
      ? selectors.map((selector) => String(selector || "").trim()).filter(Boolean)
      : [String(selectors || "").trim()].filter(Boolean);
  }

  function selectorText(selectors) {
    return selectorList(selectors).join(", ");
  }

  function normalizeCheckoutCountry(value) {
    const country = String(value || "").trim().toUpperCase();
    return CHECKOUT_COUNTRIES[country] ? country : "JP";
  }

  function validateAge(age) {
    const value = Number(age);
    if (!Number.isInteger(value) || value < 22 || value > 55) {
      throw new Error("年龄必须是 22-55 的整数。");
    }
  }

  function setBusy(key, busy) {
    if (busy) {
      state.busy.add(key);
    } else {
      state.busy.delete(key);
    }
    renderBusy();
  }

  function addLog(level, message, options = {}) {
    const now = new Date();
    const entry = {
      level,
      message,
      time: now.toLocaleTimeString("zh-CN", { hour12: false })
    };
    state.logs.push(entry);
    state.logs = state.logs.slice(-80);
    renderLogs();
    if (!options.skipPersist) {
      persistState();
    }
  }

  function clearLogs() {
    state.logs = [];
    renderLogs();
    persistState();
  }

  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return ext.clipboard.writeText(text);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function formatError(error) {
    if (!error) {
      return "unknown_error";
    }
    return error.message || String(error);
  }
}());
