(function () {
  "use strict";

  if (window.__gptAutoRegisterV2Loaded) {
    return;
  }
  window.__gptAutoRegisterV2Loaded = true;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeSelectorList(selectors) {
    if (Array.isArray(selectors)) {
      return selectors.map((selector) => String(selector || "").trim()).filter(Boolean);
    }
    const single = String(selectors || "").trim();
    return single ? [single] : [];
  }

  const FALLBACK_FIELD_SELECTORS = Object.freeze({
    phone: [
      'input[type="tel"]',
      'input[autocomplete="tel"]',
      'input[name*="phone" i]',
      'input[id*="phone" i]'
    ],
    cardNumber: [
      "#cardNumber",
      "#cardnumber",
      'input[name="cardNumber"]',
      'input[name="cardnumber"]',
      'input[name="card[number]"]',
      'input[autocomplete="cc-number"]',
      'input[inputmode="numeric"][placeholder*="card" i]',
      'input[id*="cardNumber" i]'
    ],
    cardExpiry: [
      "#cardExpiry",
      "#cardExpiration",
      'input[name="cardExpiry"]',
      'input[name="card[exp]"]',
      'input[name="exp-date"]',
      'input[autocomplete="cc-exp"]',
      'input[id*="exp" i]',
      'input[placeholder*="MM" i]'
    ],
    cardCvv: [
      "#cardCvv",
      "#cardCvc",
      "#cvv",
      "#cvc",
      'input[name="cardCvv"]',
      'input[name="cardCvc"]',
      'input[name="card[cvc]"]',
      'input[name="cvc"]',
      'input[name="cvv"]',
      'input[autocomplete="cc-csc"]',
      'input[id*="cvc" i]',
      'input[id*="cvv" i]'
    ],
    billingName: [
      "#billingName",
      'input[name="billingName"]',
      'input[name="name"]',
      'input[autocomplete="cc-name"]',
      'input[autocomplete="name"]'
    ],
    firstName: [
      "#firstName",
      'input[name="firstName"]',
      'input[name="first_name"]',
      'input[autocomplete="given-name"]'
    ],
    lastName: [
      "#lastName",
      'input[name="lastName"]',
      'input[name="last_name"]',
      'input[autocomplete="family-name"]'
    ],
    billingLine1: [
      "#billingLine1",
      "#billingAddressLine1",
      'input[name="billingLine1"]',
      'input[name="addressLine1"]',
      'input[name="line1"]',
      'input[autocomplete="billing address-line1"]',
      'input[autocomplete="address-line1"]'
    ],
    billingCity: [
      "#billingCity",
      "#billingLocality",
      'input[name="billingCity"]',
      'input[name="city"]',
      'input[autocomplete="billing address-level2"]',
      'input[autocomplete="address-level2"]'
    ],
    billingState: [
      "#billingState",
      'input[name="billingState"]',
      'select[name="billingState"]',
      'input[name="state"]',
      'select[name="state"]',
      'input[autocomplete="billing address-level1"]',
      'select[autocomplete="billing address-level1"]',
      'input[autocomplete="address-level1"]',
      'select[autocomplete="address-level1"]'
    ],
    billingPostalCode: [
      "#billingPostalCode",
      "#postalCode",
      "#zip",
      'input[name="billingPostalCode"]',
      'input[name="postalCode"]',
      'input[name="zip"]',
      'input[autocomplete="billing postal-code"]',
      'input[autocomplete="postal-code"]'
    ],
    country: [
      "#country",
      "#billingCountry",
      'select[name="country"]',
      'select[name="billingCountry"]',
      'select[autocomplete="billing country"]',
      'select[autocomplete="country"]'
    ],
    password: [
      "#password",
      'input[name="password"]',
      'input[type="password"]',
      'input[autocomplete="new-password"]'
    ]
  });

  function getValueSetter(element) {
    if (element instanceof HTMLTextAreaElement) {
      return Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    }
    if (element instanceof HTMLSelectElement) {
      return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    }
    return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  }

  function setNativeValue(element, value) {
    const nextValue = String(value || "");
    if (element instanceof HTMLSelectElement) {
      element.value = nextValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const descriptor = getValueSetter(element);
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, nextValue);
    } else {
      element.value = nextValue;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function isTextEntryElement(element) {
    return element instanceof HTMLTextAreaElement ||
      element instanceof HTMLInputElement;
  }

  function randomTypeDelayMs(minMs, maxMs) {
    const min = Math.max(0, Math.ceil(Number(minMs) || 80));
    const max = Math.max(min, Math.floor(Number(maxMs) || 180));
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async function typeNativeValue(element, value, options) {
    const text = String(value || "");
    element.focus();
    await delay(1000);
    const descriptor = getValueSetter(element);
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, "");
    } else {
      element.value = "";
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    const typeDelayMinMs = options && options.typeDelayMinMs;
    const typeDelayMaxMs = options && options.typeDelayMaxMs;
    for (const ch of text) {
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, String(element.value || "") + ch);
      } else {
        element.value = String(element.value || "") + ch;
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      await delay(randomTypeDelayMs(typeDelayMinMs, typeDelayMaxMs));
    }
    element.blur();
  }

  function pasteNativeValue(element, value) {
    const text = String(value || "");
    element.focus();
    if (typeof element.select === "function") {
      element.select();
    }

    try {
      const data = new DataTransfer();
      data.setData("text/plain", text);
      data.setData("text", text);
      element.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data
      }));
    } catch (_) {
      element.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true }));
    }

    let shouldInsert = true;
    try {
      shouldInsert = element.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertFromPaste",
        data: text
      }));
    } catch (_) {}

    if (shouldInsert) {
      setNativeValue(element, text);
    }
    try {
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertFromPaste",
        data: text
      }));
    } catch (_) {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.blur();
  }

  async function waitForSelector(selector, timeoutMs) {
    const timeout = Number(timeoutMs || 60000);
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await delay(300);
    }
    return null;
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) {
      return false;
    }
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function isClickable(element) {
    return isVisible(element) &&
      !element.disabled &&
      element.getAttribute("aria-disabled") !== "true";
  }

  function simulateClick(element) {
    if (!element) {
      return;
    }
    element.scrollIntoView({ block: "center", inline: "center" });
    element.focus();
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    ["mouseover", "mousemove", "mousedown", "mouseup", "click"].forEach((type) => {
      element.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
        button: 0,
        buttons: type === "mousedown" ? 1 : 0
      }));
    });
  }

  function getButtonForm(button) {
    if (!button) {
      return null;
    }
    const formId = button.getAttribute("form");
    if (formId) {
      return document.getElementById(formId);
    }
    return button.closest("form");
  }

  function findFormWithSelectors(selectors) {
    const selectorList = normalizeSelectorList(selectors);
    if (!selectorList.length) {
      return null;
    }
    const forms = Array.from(document.querySelectorAll("form"));
    return forms.find((form) => selectorList.every((selector) => {
      try {
        return Boolean(form.querySelector(selector));
      } catch (error) {
        return false;
      }
    })) || null;
  }

  async function waitForClickableButton(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const timeout = Number((payload && payload.timeoutMs) || 60000);
    const formSelectors = payload && payload.formSelectors;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const targetForm = findFormWithSelectors(formSelectors);
      const buttons = selector ? Array.from(document.querySelectorAll(selector)) : [];
      const clickableButtons = buttons.filter(isClickable);
      const button = targetForm
        ? clickableButtons.find((candidate) => getButtonForm(candidate) === targetForm)
        : clickableButtons[0];
      if (button) {
        return { button, targetForm };
      }
      await delay(300);
    }
    return { button: null, targetForm: null };
  }

  function uniqueSelectors(selectors) {
    const seen = new Set();
    return normalizeSelectorList(selectors).filter((selector) => {
      if (seen.has(selector)) {
        return false;
      }
      seen.add(selector);
      return true;
    });
  }

  async function fillSelector(selectors, value, options) {
    const selectorList = uniqueSelectors(selectors);
    for (const selector of selectorList) {
      let element = null;
      try {
        element = document.querySelector(selector);
      } catch (error) {
        continue;
      }
      if (!element) {
        continue;
      }
      element.focus();
      let shouldBlur = true;
      if (options && options.payUrlStyle) {
        setNativeValue(element, value);
      } else if (options && options.type && isTextEntryElement(element)) {
        await typeNativeValue(element, value, options);
        shouldBlur = false;
      } else {
        setNativeValue(element, value);
      }
      if (shouldBlur) {
        element.blur();
      }
      return { filled: true, selector };
    }
    return { filled: false, selector: selectorList[0] || "" };
  }

  function selectorsFor(settings, key) {
    return uniqueSelectors([]
      .concat(normalizeSelectorList(settings[key + "Selector"]))
      .concat(FALLBACK_FIELD_SELECTORS[key] || []));
  }

  function buildFieldMap(card, settings, phone) {
    const billingName = [card.firstName, card.lastName]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" ") || card.billingName || card.name;

    return [
      { field: "phone", selectors: selectorsFor(settings, "phone"), value: phone },
      { field: "cardNumber", selectors: selectorsFor(settings, "cardNumber"), value: card.card },
      { field: "cardExpiry", selectors: selectorsFor(settings, "cardExpiry"), value: card.expiryInput },
      { field: "cardCvv", selectors: selectorsFor(settings, "cardCvv"), value: card.cvv },
      { field: "billingName", selectors: selectorsFor(settings, "billingName"), value: billingName },
      { field: "firstName", selectors: selectorsFor(settings, "firstName"), value: card.firstName },
      { field: "lastName", selectors: selectorsFor(settings, "lastName"), value: card.lastName },
      { field: "billingLine1", selectors: selectorsFor(settings, "billingLine1"), value: card.address },
      { field: "billingCity", selectors: selectorsFor(settings, "billingCity"), value: card.city },
      { field: "billingState", selectors: selectorsFor(settings, "billingState"), value: card.state },
      { field: "billingPostalCode", selectors: selectorsFor(settings, "billingPostalCode"), value: card.postcode },
      { field: "country", selectors: selectorsFor(settings, "country"), value: card.country },
      { field: "password", selectors: selectorsFor(settings, "password"), value: settings.passwordValue }
    ];
  }

  window.__gptAutoRegisterProbe = function probeExport() {
    return {
      ok: true,
      href: location.href,
      inputs: document.querySelectorAll("input, textarea, select").length,
      forms: document.querySelectorAll("form").length
    };
  };

  window.__gptAutoRegisterWaitForSelector = async function waitForSelectorExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const element = selector ? await waitForSelector(selector, payload && payload.timeoutMs) : null;
    return { ok: Boolean(element), selector };
  };

  window.__gptAutoRegisterClick = async function clickExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const element = selector ? await waitForSelector(selector, payload && payload.timeoutMs) : null;
    if (!element) {
      return { ok: false, selector, error: `Element not found: ${selector}` };
    }
    simulateClick(element);
    return { ok: true, selector };
  };

  window.__gptAutoRegisterClickFormButton = async function clickFormButtonExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const result = await waitForClickableButton(payload || {});
    if (!result.button) {
      return { ok: false, selector, error: `Clickable form button not found: ${selector}` };
    }
    simulateClick(result.button);
    return {
      ok: true,
      selector,
      text: String(result.button.textContent || "").trim(),
      formMatched: Boolean(result.targetForm)
    };
  };

  window.__gptAutoRegisterSetValue = async function setValueExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const element = selector ? await waitForSelector(selector, payload && payload.timeoutMs) : null;
    if (!element) {
      return { ok: false, selector, error: `Element not found: ${selector}` };
    }
    if (payload && payload.paste) {
      pasteNativeValue(element, payload.value);
    } else if (payload && payload.payUrlStyle) {
      element.focus();
      setNativeValue(element, payload.value);
      element.blur();
    } else if (payload && payload.type) {
      await typeNativeValue(element, payload.value, payload);
    } else {
      element.focus();
      setNativeValue(element, payload && payload.value);
      element.blur();
    }
    return { ok: true, selector, value: String(element.value || "") };
  };

  window.__gptAutoRegisterSetOtpDigits = async function setOtpDigitsExport(payload) {
    const code = String((payload && payload.value) || "").replace(/\D/g, "");
    const selectors = normalizeSelectorList((payload && payload.selectors) || [
      "#ci-ciBasic-0",
      "#ci-ciBasic-1",
      "#ci-ciBasic-2",
      "#ci-ciBasic-3",
      "#ci-ciBasic-4",
      "#ci-ciBasic-5"
    ]);
    const timeoutMs = Number((payload && payload.timeoutMs) || 30000);
    const start = Date.now();
    const inputs = [];

    if (code.length < selectors.length) {
      return {
        ok: false,
        selectors,
        filled: 0,
        error: `OTP code is too short: expected ${selectors.length}, got ${code.length}`
      };
    }

    while (Date.now() - start < timeoutMs) {
      inputs.length = 0;
      let foundAll = true;
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element) {
          foundAll = false;
          break;
        }
        inputs.push(element);
      }
      if (foundAll) {
        break;
      }
      await delay(300);
    }

    if (inputs.length !== selectors.length) {
      return {
        ok: false,
        selectors,
        filled: 0,
        error: `OTP inputs not found: ${selectors.join(", ")}`
      };
    }

    inputs.forEach((element, index) => {
      const digit = code[index];
      element.focus();
      setNativeValue(element, digit);
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.blur();
    });

    return {
      ok: true,
      selectors,
      filled: inputs.length,
      value: inputs.map((element) => String(element.value || "")).join("")
    };
  };

  window.__gptAutoRegisterGetValue = function getValueExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const element = selector ? document.querySelector(selector) : null;
    if (!element) {
      return { ok: false, selector, value: "" };
    }
    return { ok: true, selector, value: String(element.value || "") };
  };

  window.__gptAutoRegisterSetSelectIfNeeded = async function setSelectIfNeededExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const value = String((payload && payload.value) || "");
    const element = selector ? await waitForSelector(selector, payload && payload.timeoutMs) : null;
    if (!element) {
      return { ok: false, selector, changed: false, error: `Element not found: ${selector}` };
    }
    const currentValue = String(element.value || "");
    if (currentValue === value) {
      return { ok: true, selector, changed: false, value: currentValue };
    }
    element.focus();
    setNativeValue(element, value);
    element.blur();
    return { ok: true, selector, changed: true, value: String(element.value || "") };
  };

  window.__gptAutoRegisterCheck = async function checkExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const element = selector ? await waitForSelector(selector, payload && payload.timeoutMs) : null;
    if (!element) {
      return { ok: false, selector, checked: false, error: `Element not found: ${selector}` };
    }
    if (!element.checked) {
      simulateClick(element);
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { ok: true, selector, checked: Boolean(element.checked) };
  };

  window.__gptAutoRegisterRemoveAll = function removeAllExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    if (!selector) {
      return { ok: false, selector, removed: 0, error: "Empty selector" };
    }
    try {
      const elements = Array.from(document.querySelectorAll(selector));
      elements.forEach((element) => element.remove());
      return { ok: true, selector, removed: elements.length };
    } catch (error) {
      return {
        ok: false,
        selector,
        removed: 0,
        error: error && error.message ? error.message : String(error)
      };
    }
  };

  window.__gptAutoRegisterFillForm = async function fillForm(payload) {
    try {
      const card = payload && payload.card ? payload.card : {};
      const settings = payload && payload.settings ? payload.settings : {};
      const fillOptions = payload && payload.fillOptions ? payload.fillOptions : {};
      const skipFields = new Set(Array.isArray(fillOptions.skipFields) ? fillOptions.skipFields : []);
      const phone = String((payload && payload.phone) || card.phone || "").trim();
      const fields = buildFieldMap(card, settings, phone);
      const missing = [];
      let filled = 0;

      for (const { field, selectors, value } of fields) {
        if (skipFields.has(field)) {
          continue;
        }
        const selectorList = normalizeSelectorList(selectors);
        if (!selectorList.length || value === undefined || value === null) {
          continue;
        }
        const result = await fillSelector(selectorList, value, fillOptions);
        if (result.filled) {
          filled += 1;
        } else {
          missing.push(`${field}: ${selectorList.slice(0, 3).join(" | ")}`);
        }
      }

      return { ok: filled > 0, filled, missing, error: "" };
    } catch (error) {
      return {
        ok: false,
        filled: 0,
        missing: [],
        error: error && error.message ? error.message : String(error)
      };
    }
  };

  window.__gptAutoRegisterSolveCaptcha = async function solveCaptchaExport(payload) {
    try {
      const captchaSelector = "#captcha__element, #captchaComponent";
      const sliderSelector = ".sliderContainer .slider";
      const distance = Number((payload && payload.distance) || 280);
      const timeoutMs = Number((payload && payload.timeoutMs) || 10000);

      if (payload && payload.onlyIfPresent) {
        const hasCaptchaInFrame = document.querySelector(captchaSelector) || document.querySelector(sliderSelector);
        if (!hasCaptchaInFrame) {
          return { ok: false, error: "Captcha not present in this frame", hasCaptcha: false };
        }
      }

      const captchaElement = await waitForSelector(captchaSelector, timeoutMs);
      if (!captchaElement) {
        return { ok: false, error: "Captcha element not found", hasCaptcha: false };
      }

      const sliderElement = await waitForSelector(sliderSelector, timeoutMs);
      if (!sliderElement) {
        return { ok: false, error: "Slider element not found", hasCaptcha: true };
      }

      sliderElement.scrollIntoView({ block: "center", inline: "center" });
      await delay(500);

      const rect = sliderElement.getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;
      const endX = startX + distance;
      const endY = startY;

      sliderElement.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: startX,
        clientY: startY,
        button: 0,
        buttons: 1
      }));

      await delay(100);

      const steps = 20;
      for (let i = 1; i <= steps; i++) {
        const currentX = startX + (distance * i / steps);
        sliderElement.dispatchEvent(new MouseEvent("mousemove", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: currentX,
          clientY: startY,
          button: 0,
          buttons: 1
        }));
        await delay(10);
      }

      await delay(100);

      sliderElement.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: endX,
        clientY: endY,
        button: 0,
        buttons: 0
      }));

      return { ok: true, hasCaptcha: true, distance, error: "" };
    } catch (error) {
      return {
        ok: false,
        hasCaptcha: false,
        error: error && error.message ? error.message : String(error)
      };
    }
  };

  window.__gptAutoRegisterCheckCaptcha = async function checkCaptchaExport(payload) {
    const selector = String((payload && payload.selector) || "#captcha__element, #captchaComponent, .sliderContainer .slider").trim();
    const timeoutMs = Number((payload && payload.timeoutMs) || 5000);
    const captchaElement = selector ? await waitForSelector(selector, timeoutMs) : null;
    return {
      ok: Boolean(captchaElement),
      hasCaptcha: Boolean(captchaElement),
      selector,
      href: location.href
    };
  };
}());
