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
      "#billingAdministrativeArea",
      'input[name="billingState"]',
      'select[name="billingState"]',
      'select[name="billingAdministrativeArea"]',
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
    billingAdministrativeArea: [
      "#billingAdministrativeArea",
      'select[name="billingAdministrativeArea"]',
      'input[name="billingAdministrativeArea"]',
      "#billingState",
      'select[name="billingState"]'
    ],
    dateOfBirth: [
      "#dateOfBirth",
      'input[name="dateOfBirth"]',
      'input[autocomplete="bday"]'
    ],
    countrySpecificFirstName: [
      "#countrySpecificFirstName",
      'input[name="countrySpecificFirstName"]'
    ],
    countrySpecificLastName: [
      "#countrySpecificLastName",
      'input[name="countrySpecificLastName"]'
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
      const matchingOption = Array.from(element.options).find((option) =>
        String(option.value || "").toLowerCase() === nextValue.toLowerCase() ||
        String(option.textContent || "").trim().toLowerCase() === nextValue.toLowerCase()
      );
      element.value = matchingOption ? matchingOption.value : nextValue;
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

  function dispatchTypingKeyEvent(element, type, ch) {
    try {
      element.dispatchEvent(new KeyboardEvent(type, {
        key: ch,
        code: ch.length === 1 && /^[a-z0-9]$/i.test(ch) ? `Key${ch.toUpperCase()}` : "",
        bubbles: true,
        cancelable: true
      }));
    } catch (_) {
      element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    }
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
      dispatchTypingKeyEvent(element, "keydown", ch);
      dispatchTypingKeyEvent(element, "keypress", ch);
      let shouldInsert = true;
      try {
        shouldInsert = element.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: ch
        }));
      } catch (_) {}
      if (!shouldInsert) {
        dispatchTypingKeyEvent(element, "keyup", ch);
        await delay(randomTypeDelayMs(typeDelayMinMs, typeDelayMaxMs));
        continue;
      }
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, String(element.value || "") + ch);
      } else {
        element.value = String(element.value || "") + ch;
      }
      try {
        element.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: ch
        }));
      } catch (_) {
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
      dispatchTypingKeyEvent(element, "keyup", ch);
      await delay(randomTypeDelayMs(typeDelayMinMs, typeDelayMaxMs));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
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

  async function waitForAnySelector(selectors, timeoutMs) {
    const selectorList = uniqueSelectors(selectors);
    const timeout = Number(timeoutMs || 60000);
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (const selector of selectorList) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            return { element, selector };
          }
        } catch (_) {}
      }
      await delay(300);
    }
    return { element: null, selector: selectorList.join(", ") };
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
      if (options && options.payUrlStyle && options.type && isTextEntryElement(element)) {
        await typeNativeValue(element, value, options);
        shouldBlur = false;
      } else if (options && options.payUrlStyle) {
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

  function buildFieldMap(card, settings, phone, fillOptions) {
    const overrides = fillOptions && fillOptions.countryOverrides && typeof fillOptions.countryOverrides === "object"
      ? fillOptions.countryOverrides
      : {};
    const fieldValue = (key, fallback) => Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : fallback;
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
      { field: "firstName", selectors: selectorsFor(settings, "firstName"), value: fieldValue("firstName", card.firstName) },
      { field: "lastName", selectors: selectorsFor(settings, "lastName"), value: fieldValue("lastName", card.lastName) },
      { field: "billingLine1", selectors: selectorsFor(settings, "billingLine1"), value: fieldValue("billingLine1", card.address) },
      { field: "billingCity", selectors: selectorsFor(settings, "billingCity"), value: fieldValue("billingCity", card.city) },
      { field: "billingState", selectors: selectorsFor(settings, "billingState"), value: fieldValue("billingState", card.state) },
      { field: "billingAdministrativeArea", selectors: selectorsFor(settings, "billingAdministrativeArea"), value: fieldValue("billingAdministrativeArea", undefined) },
      { field: "billingPostalCode", selectors: selectorsFor(settings, "billingPostalCode"), value: fieldValue("billingPostalCode", card.postcode) },
      { field: "country", selectors: selectorsFor(settings, "country"), value: fieldValue("country", "us") },
      { field: "dateOfBirth", selectors: selectorsFor(settings, "dateOfBirth"), value: fieldValue("dateOfBirth", undefined) },
      { field: "countrySpecificFirstName", selectors: selectorsFor(settings, "countrySpecificFirstName"), value: fieldValue("countrySpecificFirstName", undefined) },
      { field: "countrySpecificLastName", selectors: selectorsFor(settings, "countrySpecificLastName"), value: fieldValue("countrySpecificLastName", undefined) },
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

  window.__gptAutoRegisterClickByIndex = async function clickByIndexExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const index = Math.max(0, Math.floor(Number(payload && payload.index) || 0));
    const timeoutMs = Number((payload && payload.timeoutMs) || 60000);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      let elements = [];
      try {
        elements = selector ? Array.from(document.querySelectorAll(selector)) : [];
      } catch (_) {
        elements = [];
      }
      const element = elements[index];
      console.log(element, 'element')
      if (isClickable(element)) {
        element.click()
        return {
          ok: true,
          selector,
          index,
          count: elements.length,
          text: String(element.textContent || "").trim()
        };
      }
      await delay(300);
    }
    return { ok: false, selector, index, error: `Element index not found: ${selector}[${index}]` };
  };

  window.__gptAutoRegisterWaitForUrlPrefix = async function waitForUrlPrefixExport(payload) {
    const prefix = String((payload && payload.prefix) || "").trim();
    const timeoutMs = Number((payload && payload.timeoutMs) || 60000);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const href = String(location.href || "");
      if (prefix && href.startsWith(prefix)) {
        return { ok: true, prefix, href };
      }
      await delay(500);
    }
    return {
      ok: false,
      prefix,
      href: String(location.href || ""),
      error: `URL prefix timeout: ${prefix}`
    };
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
    } else if (payload && payload.type && isTextEntryElement(element)) {
      await typeNativeValue(element, payload.value, payload);
    } else if (payload && payload.payUrlStyle) {
      element.focus();
      setNativeValue(element, payload.value);
      element.blur();
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

  window.__gptAutoRegisterGetText = async function getTextExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const element = selector ? await waitForSelector(selector, payload && payload.timeoutMs) : null;
    if (!element) {
      return { ok: false, selector, text: "", error: `Element not found: ${selector}` };
    }
    return {
      ok: true,
      selector,
      text: String(element.innerText || element.textContent || "").trim()
    };
  };

  window.__gptAutoRegisterSetSelectIfNeeded = async function setSelectIfNeededExport(payload) {
    const selectors = uniqueSelectors((payload && payload.selectors) || (payload && payload.selector) || "");
    const value = String((payload && payload.value) || "");
    const { element, selector } = await waitForAnySelector(selectors, payload && payload.timeoutMs);
    if (!element) {
      return { ok: false, selector, changed: false, error: `Element not found: ${selector}` };
    }
    const currentValue = String(element.value || "");
    if (currentValue.toLowerCase() === value.toLowerCase()) {
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
      const fields = buildFieldMap(card, settings, phone, fillOptions);
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
        await delay(200);
      }

      await delay(200);

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

  window.__gptAutoRegisterGetReadyState = function getReadyStateExport() {
    return { ok: true, readyState: document.readyState, href: location.href };
  };

  window.__gptAutoRegisterGetNavigatorUserAgent = function getNavigatorUserAgentExport() {
    return { ok: true, userAgent: navigator.userAgent || "" };
  };

  window.__gptAutoRegisterBodyContainsText = function bodyContainsTextExport(payload) {
    const text = String((payload && payload.text) || "");
    const bodyText = document.body ? String(document.body.innerHTML || "") : "";
    return { ok: bodyText.indexOf(text) > -1, text };
  };

  window.__gptAutoRegisterScrollToBottom = async function scrollToBottomExport() {
    function fireScrollEvent(target) {
      if (!target || typeof target.dispatchEvent !== "function") {
        return;
      }
      target.dispatchEvent(new Event("scroll", {
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

    Array.from(document.querySelectorAll("*"))
      .filter(isScrollableElement)
      .forEach(scrollElementToBottom);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.scrollTo(0, Math.max(bottom, root ? root.scrollHeight : 0));
    if (root) {
      root.scrollTop = root.scrollHeight;
      fireScrollEvent(root);
    }
    fireScrollEvent(window);
    return { ok: true };
  };

  window.__gptAutoRegisterClickButtonByText = function clickButtonByTextExport(payload) {
    const pattern = String((payload && payload.pattern) || "");
    const regex = pattern ? new RegExp(pattern, "i") : /注册|Sign up|Create account/i;
    const buttons = Array.from(document.querySelectorAll("button"));
    const button = buttons.find((candidate) => regex.test(candidate.textContent || ""));
    if (!button) {
      return { ok: false, error: "Button not found" };
    }
    simulateClick(button);
    return { ok: true, text: String(button.textContent || "").trim() };
  };

  function isVisibleEnabledElement(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return false;
    }
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      !element.disabled &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function isVisibleTextInput(element) {
    if (!isVisibleEnabledElement(element)) {
      return false;
    }
    const tagName = String(element.tagName || "").toLowerCase();
    const type = String(element.getAttribute("type") || "text").toLowerCase();
    return tagName === "input" && !["hidden", "submit", "button", "checkbox", "radio"].includes(type);
  }

  function firstVisibleElement(selectors) {
    const selectorList = uniqueSelectors(selectors);
    for (const selector of selectorList) {
      const elements = Array.from(document.querySelectorAll(selector));
      const element = elements.find(isVisibleEnabledElement);
      if (element) {
        return { element, selector };
      }
    }
    return { element: null, selector: selectorList[0] || "" };
  }

  function oauthCodeInputs(code) {
    const codeText = String(code || "").replace(/\D/g, "");
    const singleSelectors = [
      'input[name="code"]',
      'input[name*="code" i]',
      'input[name*="otp" i]',
      'input[name*="verification" i]',
      'input[id*="code" i]',
      'input[id*="otp" i]',
      'input[id*="verification" i]',
      'input[autocomplete="one-time-code"]',
      'input[inputmode="numeric"]',
      'input[placeholder*="code" i]',
      'input[placeholder*="verification" i]',
      'input[aria-label*="code" i]',
      'input[aria-label*="verification" i]'
    ];
    for (const selector of singleSelectors) {
      const elements = Array.from(document.querySelectorAll(selector))
        .filter((element) => isVisibleTextInput(element) && String(element.id || "") !== "tel");
      if (elements.length) {
        return { mode: "single", inputs: [elements[0]], selector };
      }
    }
    const candidates = Array.from(document.querySelectorAll(
      'input[inputmode="numeric"], input[autocomplete="one-time-code"], input[maxlength="1"]'
    ))
      .filter((element) => isVisibleTextInput(element) && String(element.id || "") !== "tel")
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.top - br.top) || (ar.left - br.left);
      });
    if (candidates.length >= Math.min(codeText.length || 6, 4)) {
      return { mode: "multi", inputs: candidates.slice(0, codeText.length || candidates.length), selector: "multi numeric inputs" };
    }
    return { mode: "", inputs: [], selector: "" };
  }

  window.__gptAutoRegisterOAuthPageState = function oauthPageStateExport() {
    const href = String(location.href || "");
    const bodyText = String(document.body && (document.body.innerText || document.body.textContent) || "");
    const lowerHref = href.toLowerCase();
    const lowerText = bodyText.toLowerCase();
    const buttons = Array.from(document.querySelectorAll("button, input[type='submit']"))
      .filter(isVisibleEnabledElement)
      .map((button) => String(button.textContent || button.value || "").trim())
      .filter(Boolean)
      .slice(0, 12);
    const hasContinueButton = buttons.some((text) => (
      /continue|next|confirm|verify|allow|authorize|log in|sign in/i.test(text) ||
      /继续|下一步|确定|确认|验证|允许|授权|登录/.test(text)
    ));
    return {
      ok: true,
      href,
      title: document.title || "",
      hasEmailInput: Boolean(firstVisibleElement([
        "#email",
        'input[type="email"]',
        'input[name="username"]',
        'input[name="email"]',
        'input[autocomplete="username"]'
      ]).element),
      hasPasswordInput: Boolean(firstVisibleElement([
        'input[type="password"]',
        'input[name="password"]',
        'input[name="current-password"]',
        "#password"
      ]).element),
      hasPhoneInput: Boolean(firstVisibleElement(["#tel", 'input[type="tel"]']).element),
      hasCodeInput: Boolean(oauthCodeInputs("123456").inputs.length),
      hasChooseAccountSession: lowerHref.includes("/choose-an-account") || Boolean(document.querySelector('input[name="session_id"]')),
      isConsent: lowerHref.includes("/sign-in-with-chatgpt/codex/consent") || lowerText.includes("codex"),
      hasContinueButton,
      phoneSubmitError: Boolean(document.querySelector("#_r_t_")),
      telInvalid: Boolean(document.querySelector('#tel[data-invalid="true"]')),
      buttons,
      textSample: bodyText.slice(0, 500)
    };
  };

  window.__gptAutoRegisterClickChooseAccountSession = async function clickChooseAccountSessionExport(payload) {
    const timeoutMs = Number((payload && payload.timeoutMs) || 15000);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const inputs = Array.from(document.querySelectorAll('input[name="session_id"]'))
        .filter((input) => !input.disabled);
      const input = inputs.find(isVisibleEnabledElement) || inputs[0];
      if (input) {
        const label = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
        const clickable = isVisibleEnabledElement(input)
          ? input
          : (label && isVisibleEnabledElement(label))
            ? label
            : input.closest("label, button, [role='button'], li, div");
        if (clickable && isVisibleEnabledElement(clickable)) {
          simulateClick(clickable);
        } else {
          simulateClick(input);
        }
        if (input.type === "radio" || input.type === "checkbox") {
          input.checked = true;
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        const form = input.closest("form");
        const submit = form && Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'))
          .find(isVisibleEnabledElement);
        if (submit) {
          await delay(300);
          simulateClick(submit);
        }
        return { ok: true, value: String(input.value || ""), submitted: Boolean(submit) };
      }
      await delay(300);
    }
    return { ok: false, error: 'input[name="session_id"] not found' };
  };

  window.__gptAutoRegisterSetFirstValue = async function setFirstValueExport(payload) {
    const selectors = (payload && payload.selectors) || (payload && payload.selector) || "";
    const timeoutMs = Number((payload && payload.timeoutMs) || 15000);
    const start = Date.now();
    let found = { element: null, selector: "" };
    while (Date.now() - start < timeoutMs) {
      found = firstVisibleElement(selectors);
      if (found.element) {
        break;
      }
      await delay(300);
    }
    if (!found.element) {
      return { ok: false, selector: found.selector, error: `Element not found: ${found.selector}` };
    }
    found.element.focus();
    setNativeValue(found.element, payload && payload.value);
    found.element.dispatchEvent(new Event("change", { bubbles: true }));
    found.element.blur();
    return { ok: true, selector: found.selector, value: String(found.element.value || "") };
  };

  window.__gptAutoRegisterFillGenericOtp = async function fillGenericOtpExport(payload) {
    const code = String((payload && payload.value) || "").replace(/\D/g, "");
    const timeoutMs = Number((payload && payload.timeoutMs) || 30000);
    const start = Date.now();
    let matched = { mode: "", inputs: [], selector: "" };
    while (Date.now() - start < timeoutMs) {
      matched = oauthCodeInputs(code);
      if (matched.inputs.length) {
        break;
      }
      await delay(300);
    }
    if (!matched.inputs.length) {
      return { ok: false, error: "OTP inputs not found" };
    }
    if (matched.mode === "single") {
      const input = matched.inputs[0];
      input.focus();
      setNativeValue(input, code);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
      return { ok: true, mode: matched.mode, selector: matched.selector, value: String(input.value || "") };
    }
    matched.inputs.forEach((input, index) => {
      input.focus();
      setNativeValue(input, code[index] || "");
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
    });
    return {
      ok: true,
      mode: matched.mode,
      selector: matched.selector,
      value: matched.inputs.map((input) => String(input.value || "")).join("")
    };
  };

  window.__gptAutoRegisterClickSmsRadioIfPresent = function clickSmsRadioIfPresentExport() {
    const radio = document.querySelector('input[type="radio"][value="sms"]');
    if (!radio || !isVisibleEnabledElement(radio)) {
      return { ok: false, found: false };
    }
    if (!radio.checked) {
      simulateClick(radio);
      radio.checked = true;
      radio.dispatchEvent(new Event("input", { bubbles: true }));
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { ok: true, found: true, checked: Boolean(radio.checked) };
  };

  window.__gptAutoRegisterClickOauthContinue = async function clickOauthContinueExport(payload) {
    const timeoutMs = Number((payload && payload.timeoutMs) || 15000);
    const buttonPattern = /continue|next|confirm|verify|allow|authorize|log in|sign in|submit/i;
    const chinesePattern = /继续|下一步|确定|确认|验证|允许|授权|登录|提交/;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const submit = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"]'))
        .find(isVisibleEnabledElement);
      if (submit) {
        simulateClick(submit);
        return { ok: true, text: String(submit.textContent || submit.value || "").trim(), selector: "submit" };
      }
      const buttons = Array.from(document.querySelectorAll("button, input[type='button']"))
        .filter(isVisibleEnabledElement);
      const matched = buttons.find((button) => {
        const text = String(button.textContent || button.value || "").trim();
        return buttonPattern.test(text) || chinesePattern.test(text);
      }) || buttons[0];
      if (matched) {
        simulateClick(matched);
        return { ok: true, text: String(matched.textContent || matched.value || "").trim(), selector: "button" };
      }
      await delay(300);
    }
    return { ok: false, error: "OAuth continue button not found" };
  };

  function fillRegistrationAgeOrBirthday(ageValue, birthdayValue) {
    const ageInput = document.querySelector('input[name="age"]');
    const birthdayInput = document.querySelector('input[name="birthday"]');
    if (ageInput) {
      setNativeValue(ageInput, Number(ageValue));
      return true;
    }
    if (birthdayInput) {
      setNativeValue(birthdayInput, String(birthdayValue));
      return true;
    }
    return false;
  }

  window.__gptAutoRegisterFillRegistrationEmail = function fillRegistrationEmailExport(payload) {
    const input = document.querySelector("#email");
    const nameInput = document.querySelector('input[name="name"]');
    if (input) {
      setNativeValue(input, payload && payload.email);
    }
    if (nameInput) {
      setNativeValue(nameInput, payload && payload.randomName);
    }
    const ageOrBirthday = fillRegistrationAgeOrBirthday(
      payload && payload.randomAge,
      payload && payload.randomBirthday
    );
    return { ok: Boolean(input), email: Boolean(input), nameAge: Boolean(nameInput && ageOrBirthday) };
  };

  window.__gptAutoRegisterFillRegistrationNameAge = async function fillRegistrationNameAgeExport(payload) {
    const timeoutMs = Number((payload && payload.timeoutMs) || 60000);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const nameInput = document.querySelector('input[name="name"]');
      const ageInput = document.querySelector('input[name="age"]');
      const birthdayInput = document.querySelector('input[name="birthday"]');
      if (nameInput && (ageInput || birthdayInput)) {
        setNativeValue(nameInput, payload && payload.randomName);
        fillRegistrationAgeOrBirthday(payload && payload.randomAge, payload && payload.randomBirthday);
        return { ok: true };
      }
      await delay(1000);
    }
    return { ok: false };
  };

  window.__gptAutoRegisterClickTryAgain = async function clickTryAgainExport(payload) {
    const selector = String((payload && payload.selector) || '[data-dd-action-name="Try again"]').trim();
    const element = selector ? await waitForSelector(selector, payload && payload.timeoutMs) : null;
    if (!element) {
      return { ok: false, selector };
    }
    simulateClick(element);
    return { ok: true, selector };
  };

  window.__gptAutoRegisterCheckoutLink = async function checkoutLinkExport(payload) {
    const checkoutRegion = String((payload && payload.checkoutRegion) || "ID").trim().toUpperCase();
    const payUrlMode = payload && payload.payUrlMode;
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

      shortCheckout = await requestShortCheckout();
      shortPaymentLink = shortCheckout.link;
      if (selectedPayUrlMode === "short") {
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
  };

  window.__gptAutoRegisterCall = async function callExport(functionName, payload) {
    const name = String(functionName || "");
    const fn = window[name];
    if (typeof fn !== "function") {
      return { ok: false, error: `Unknown content function: ${name}`, href: location.href };
    }
    return await fn(payload || {});
  };
}());
