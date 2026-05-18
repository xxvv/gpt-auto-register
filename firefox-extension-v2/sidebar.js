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
  const STORAGE_KEY = "gptAutoRegisterV2State";
  const US_ZIP3_STATE_RANGES_PATH = "us_zip3_state_ranges.json";
  const POLL_ATTEMPTS = 3;
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
    countrySelector: ["#country", ""],
    passwordSelector: ["#password", ""],
    passwordValue: "Bb02911ss"
  });

  const state = {
    fillSettings: createDefaultFillSettings(),
    fillSettingsExpanded: false,
    phoneKeyInput: "",
    phoneKey: null,
    lastPhoneCode: ""
  };
  let usZip3StateRangesPromise = null;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    logMessage("等待注册按钮...");
    const clickRegisterCode = `
      (function() {
        const btns = Array.from(document.querySelectorAll('button'));
        const regBtn = btns.find(b => /注册|Sign up|Create account/i.test(b.textContent || ''));
        if (regBtn) { regBtn.click(); return true; }
        return false;
      })();
    `;
    await ext.tabs.executeScript(tabId, { code: clickRegisterCode });
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
    const hasEmail = (await ext.tabs.executeScript(tabId, { code: waitEmailCode }))[0];
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
    const fillEmailResult = (await ext.tabs.executeScript(tabId, { code: fillEmailCode }))[0] || {};
    if (fillEmailResult.nameAge) {
      logMessage("检测到姓名和年龄输入框，已一起填写");
    }
    await delay(3000);

    const clickSubmitCode = `
      (function() {
        const submit = document.querySelector('button[type="submit"]');
        if (submit) { submit.click(); return true; }
        return false;
      })();
    `;
    await ext.tabs.executeScript(tabId, { code: clickSubmitCode });
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
    await ext.tabs.executeScript(tabId, { code: fillCodeOnly });
    await delay(3000);

    const submitCodeBtn = `
      (function() {
        const submit = document.querySelector('button[type="submit"], button[data-testid="submit"]');
        if (submit) { submit.click(); return true; }
        return false;
      })();
    `;
    await ext.tabs.executeScript(tabId, { code: submitCodeBtn });
    logMessage("验证码已提交，等待进入 chatgpt.com");
    return { ok: true, email };
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
    const tab = await ext.tabs.create({ url: "https://chatgpt.com", active: true });
    logMessage("步骤1: 打开 chatgpt.com");

    await delay(2500);
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
    const tab = await ext.tabs.create({ url: prepared.payUrl, active: true });
    await runPayPalFlow(tab.id, prepared);
  }

  async function preparePaymentInputs(requirePayUrl) {
    const cardText = document.getElementById("cardInput").value.trim();
    const payUrl = document.getElementById("payUrlInput").value.trim();
    if (!cardText) {
      throw new Error("请输入卡片信息");
    }
    const card = await parseCardInput(cardText);
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
    const phoneKey = parsePhoneKeyInput(document.getElementById("phoneKeyInput").value);
    state.phoneKey = phoneKey;
    state.phoneKeyInput = phoneKey.raw;
    await persistState();
    return {
      card,
      phoneKey,
      phone: phoneKey.phone || getFillPhoneNumber(card),
      payUrl,
      settings: sanitizeFillSettings(state.fillSettings),
      paypalEmail: generateGmailAddress()
    };
  }

  async function runPayPalFlow(tabId, prepared) {
    if (!prepared.payUrl) {
      throw new Error("PayURL 不能为空");
    }
    await updateTabUrl(tabId, prepared.payUrl);
    await runPayUrlPage(tabId, prepared);
    await runPayPalLoginPage(tabId, prepared);
    await runPayPalSignupPage(tabId, prepared);
    logMessage("PayPal 步骤已完成，短信验证码已输入");
  }

  async function runPayUrlPage(tabId, prepared) {
    setActiveStep(3);
    logMessage("步骤3: 等待 PayURL 页面 PayPal 选项");
    await ensureContentScript(tabId);
    await requirePageResult(tabId, "__gptAutoRegisterClick", {
      selector: 'button[data-testid="paypal-accordion-item-button"]',
      timeoutMs: 60000
    }, "未找到 PayPal 支付选项");
    logMessage("已选择 PayPal，填充卡片信息");
    await fillCurrentPage(tabId, prepared);
    await requirePageResult(tabId, "__gptAutoRegisterCheck", {
      selector: "#termsOfServiceConsentCheckbox",
      timeoutMs: 30000
    }, "未找到服务条款复选框");
    await requirePageResult(tabId, "__gptAutoRegisterClick", {
      selector: 'button[type="submit"]',
      timeoutMs: 30000
    }, "未找到提交按钮");
    logMessage("PayURL 页面已提交");
  }

  async function runPayPalLoginPage(tabId, prepared) {
    setActiveStep(4);
    logMessage("步骤4: 等待进入 paypal.com");
    await waitForUrlPrefix(tabId, "https://www.paypal.com", 90000);
    await ensureContentScript(tabId);
    await requirePageResult(tabId, "__gptAutoRegisterClick", {
      selector: 'button[type="submit"]',
      timeoutMs: 60000
    }, "PayPal 页面未找到提交按钮");
    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: "#login_email",
      value: prepared.paypalEmail,
      type: true,
      timeoutMs: 60000
    }, "未找到 PayPal login_email");
    logMessage(`已输入 PayPal 邮箱: ${prepared.paypalEmail}`);
    await requirePageResult(tabId, "__gptAutoRegisterClick", {
      selector: "button",
      timeoutMs: 30000
    }, "PayPal 页面未找到下一步按钮");
  }

  async function runPayPalSignupPage(tabId, prepared) {
    setActiveStep(5);
    logMessage("步骤5: 等待 PayPal signup 页面");
    await waitForUrlPrefix(tabId, "https://www.paypal.com/checkoutweb/signup", 120000);
    await ensureContentScript(tabId);
    const countryResult = await requirePageResult(tabId, "__gptAutoRegisterSetSelectIfNeeded", {
      selector: "#country",
      value: "US",
      timeoutMs: 60000
    }, "未找到国家字段");
    if (countryResult.changed) {
      logMessage("国家已改为 US，等待 3 秒");
      await delay(3000);
    }
    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: "#email",
      value: prepared.paypalEmail,
      type: true,
      timeoutMs: 30000
    }, "未找到 signup 邮箱字段");
    await fillCurrentPage(tabId, prepared);
    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: "#phone",
      value: prepared.phone,
      type: true,
      timeoutMs: 30000
    }, "未找到手机号字段");
    await requirePageResult(tabId, "__gptAutoRegisterClick", {
      selector: 'button[type="submit"]',
      timeoutMs: 30000
    }, "未找到 signup 提交按钮");
    logMessage("已提交 signup，开始获取短信验证码");
    await requirePageResult(tabId, "__gptAutoRegisterWaitForSelector", {
      selector: "#ci-ciBasic-0",
      timeoutMs: 120000
    }, "未找到短信验证码输入框");
    const smsCode = await fetchPhoneVerificationCode(prepared.phoneKey);
    await requirePageResult(tabId, "__gptAutoRegisterSetValue", {
      selector: "#ci-ciBasic-0",
      value: smsCode,
      type: true,
      timeoutMs: 30000
    }, "短信验证码输入失败");
    logMessage(`短信验证码已输入: ${smsCode}`);
  }

  async function updateTabUrl(tabId, url) {
    const tab = await ext.tabs.get(tabId);
    if (!String(tab.url || "").startsWith(url)) {
      await ext.tabs.update(tabId, { url, active: true });
    }
    await delay(1500);
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

  async function executePageFunction(tabId, functionName, payload, options = {}) {
    await ensureContentScript(tabId, Boolean(options.allFrames));
    const code = `window.${functionName} && window.${functionName}(${JSON.stringify(payload || {})})`;
    const results = await ext.tabs.executeScript(tabId, {
      code,
      allFrames: Boolean(options.allFrames),
      runAt: "document_idle"
    });
    return options.allFrames ? results : (Array.isArray(results) ? results[0] : results);
  }

  async function requirePageResult(tabId, functionName, payload, errorMessage) {
    const result = await executePageFunction(tabId, functionName, payload);
    if (!result || !result.ok) {
      throw new Error((result && result.error) || errorMessage);
    }
    return result;
  }

  async function fillCurrentPage(tabId, prepared) {
    const result = await executePageFunction(tabId, "__gptAutoRegisterFillForm", {
      card: prepared.card,
      phone: prepared.phone,
      settings: prepared.settings
    }, {
      allFrames: true
    });
    const summary = summarizeFillResults(result);
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
      await ext.tabs.executeScript(tabId, {
        file: "content-script.js",
        allFrames,
        runAt: "document_idle"
      });
    } catch (error) {
      logMessage("注入 content-script 失败: " + formatError(error));
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
        filled: 0,
        missing: [],
        message: errors[0] || "没有在当前页面找到可填充的支付表单"
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
        const phoneKey = parsePhoneKeyInput(rawPhoneInput, { allowEmpty: true });
        if (phoneKey && phoneKey.phone) {
          state.phoneKey = phoneKey;
          state.phoneKeyInput = phoneKey.raw;
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
      state.phoneKeyInput = typeof saved.phoneKeyInput === "string" ? saved.phoneKeyInput : "";
      try {
        state.phoneKey = parsePhoneKeyInput(state.phoneKeyInput, { allowEmpty: true });
      } catch (_) {
        state.phoneKey = null;
      }
      state.fillSettings = sanitizeFillSettings(saved.fillSettings);
      state.fillSettingsExpanded = Boolean(saved.fillSettingsExpanded);
      renderFillSettings();
    });
  }

  function persistState() {
    const nextState = {
      country: document.getElementById("country").value,
      cardInput: document.getElementById("cardInput").value,
      payUrlInput: document.getElementById("payUrlInput").value,
      phoneKeyInput: document.getElementById("phoneKeyInput").value,
      fillSettings: sanitizeFillSettings(state.fillSettings),
      fillSettingsExpanded: state.fillSettingsExpanded,
      lastPhoneCode: state.lastPhoneCode
    };
    return ext.storage.local.set({ [STORAGE_KEY]: nextState });
  }

  function bindEvents() {
    document.getElementById("startBtn").addEventListener("click", () => runWithErrorHandling(startAutomation));
    document.getElementById("startPayUrlBtn").addEventListener("click", () => runWithErrorHandling(startFromPayUrl));
    document.getElementById("country").addEventListener("change", persistState);
    document.getElementById("cardInput").addEventListener("input", persistState);
    document.getElementById("payUrlInput").addEventListener("input", persistState);
    document.getElementById("phoneKeyInput").addEventListener("input", () => {
      state.phoneKeyInput = document.getElementById("phoneKeyInput").value.trim();
      try {
        state.phoneKey = parsePhoneKeyInput(state.phoneKeyInput, { allowEmpty: true });
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
