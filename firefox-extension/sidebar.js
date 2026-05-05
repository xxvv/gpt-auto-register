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
  const STORAGE_KEY = "gptAutoRegisterSidebarState";
  const POLL_ATTEMPTS = 3;
  const POLL_DELAY_MS = 2500;

  const elements = {
    currentTabText: document.getElementById("currentTabText"),
    refreshTabButton: document.getElementById("refreshTabButton"),
    generateEmailsButton: document.getElementById("generateEmailsButton"),
    emailList: document.getElementById("emailList"),
    copyEmailButton: document.getElementById("copyEmailButton"),
    fetchCodeButton: document.getElementById("fetchCodeButton"),
    codeOutput: document.getElementById("codeOutput"),
    fetchPayUrlButton: document.getElementById("fetchPayUrlButton"),
    payUrlOutput: document.getElementById("payUrlOutput"),
    cardInput: document.getElementById("cardInput"),
    fillCardButton: document.getElementById("fillCardButton"),
    cardPreview: document.getElementById("cardPreview"),
    fillOutput: document.getElementById("fillOutput")
  };

  const state = {
    emails: [],
    selectedEmail: "",
    currentTab: null,
    busy: new Set()
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    await restoreState();
    await refreshCurrentTab();
    renderEmails();
    renderCardPreview();
  }

  function bindEvents() {
    elements.refreshTabButton.addEventListener("click", refreshCurrentTab);
    elements.generateEmailsButton.addEventListener("click", generateEmails);
    elements.copyEmailButton.addEventListener("click", copySelectedEmail);
    elements.fetchCodeButton.addEventListener("click", fetchVerificationCode);
    elements.fetchPayUrlButton.addEventListener("click", fetchPayUrl);
    elements.fillCardButton.addEventListener("click", fillCardInCurrentTab);
    elements.cardInput.addEventListener("input", () => {
      renderCardPreview();
      persistState();
    });
  }

  async function restoreState() {
    try {
      const saved = await ext.storage.local.get(STORAGE_KEY);
      const data = saved && saved[STORAGE_KEY] ? saved[STORAGE_KEY] : {};
      state.emails = Array.isArray(data.emails) ? data.emails.filter(Boolean) : [];
      state.selectedEmail = typeof data.selectedEmail === "string" ? data.selectedEmail : "";
      elements.cardInput.value = typeof data.cardInput === "string" ? data.cardInput : "";
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
          cardInput: elements.cardInput.value
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
      card = parseCardInput(elements.cardInput.value);
    } catch (error) {
      showOutput(elements.fillOutput, "error", formatError(error));
      renderCardPreview(null);
      return;
    }

    renderCardPreview(card);
    setBusy("fill", true);
    showOutput(elements.fillOutput, "info", "正在填充当前支付页面");

    try {
      const tab = await requireCurrentTab("stripe");
      await ext.tabs.executeScript(tab.id, {
        file: "content-script.js",
        allFrames: true,
        runAt: "document_idle"
      });
      const code = `window.__gptAutoRegisterFillStripe && window.__gptAutoRegisterFillStripe(${JSON.stringify(card)})`;
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

  function parseCardInput(rawInput) {
    const text = String(rawInput || "").trim();
    const parts = text.split("----").map((part) => part.trim());
    if (parts.length !== 7) {
      throw new Error("卡片格式错误，必须是 card----年/月----cvv----phone----url----name----address,city postcode,US");
    }

    const [card, expiry, cvv, phone, url, name, addressBlob] = parts;
    const expiryParts = expiry.split("/", 2).map((part) => part.trim());
    if (expiryParts.length !== 2 || !expiryParts[0] || !expiryParts[1]) {
      throw new Error("年/月格式错误");
    }
    const [year, month] = expiryParts;
    const addressParts = addressBlob.rsplit ? addressBlob.rsplit(",", 2) : rsplit(addressBlob, ",", 2);
    const normalizedAddressParts = addressParts.map((part) => part.trim());
    if (normalizedAddressParts.length !== 3) {
      throw new Error("地址格式错误，必须是 address,city postcode,US");
    }
    const [address, cityPostcode, country] = normalizedAddressParts;
    const cityPostcodeMatch = cityPostcode.match(/^(.+)\s+([A-Za-z0-9][A-Za-z0-9-]*)$/);
    if (!cityPostcodeMatch) {
      throw new Error("city postcode 格式错误");
    }

    const parsed = {
      card,
      year,
      month,
      cvv,
      phone,
      url,
      name,
      address,
      city: cityPostcodeMatch[1].trim(),
      postcode: cityPostcodeMatch[2].trim(),
      country,
      expiryInput: `${String(month).padStart(2, "0")}${String(year).slice(-2)}`
    };

    const required = ["card", "year", "month", "cvv", "name", "address", "city", "postcode"];
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

  function renderCardPreview(card) {
    let parsed = card;
    if (!parsed) {
      try {
        parsed = elements.cardInput.value.trim() ? parseCardInput(elements.cardInput.value) : null;
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
      ["卡号", maskCard(parsed.card)],
      ["有效期", parsed.expiryInput],
      ["CVV", parsed.cvv],
      ["姓名", parsed.name],
      ["地址", `${parsed.address}, ${parsed.city} ${parsed.postcode}, ${parsed.country}`]
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
      elements.cardPreview.append(row);
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
    if (expected === "stripe" && !/^https:\/\/([^/]+\.)?stripe\.com\//i.test(url)) {
      throw new Error("请先打开 Stripe 支付页面");
    }
    return tab;
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
    elements.fetchPayUrlButton.disabled = state.busy.has("payurl");
    elements.fillCardButton.disabled = state.busy.has("fill");
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
