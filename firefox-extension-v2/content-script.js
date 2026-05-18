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
    const descriptor = getValueSetter(element);
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, nextValue);
    } else {
      element.value = nextValue;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function typeNativeValue(element, value) {
    const text = String(value || "");
    element.focus();
    setNativeValue(element, "");
    const descriptor = getValueSetter(element);
    for (const ch of text) {
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, String(element.value || "") + ch);
      } else {
        element.value = String(element.value || "") + ch;
      }
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: ch
      }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
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

  function fillSelector(selectors, value, options) {
    const selectorList = normalizeSelectorList(selectors);
    const shouldType = Boolean(options && options.type);
    for (const selector of selectorList) {
      const element = document.querySelector(selector);
      if (!element) {
        continue;
      }
      element.focus();
      if (shouldType) {
        typeNativeValue(element, value);
      } else {
        setNativeValue(element, value);
      }
      element.blur();
      return { filled: true, selector };
    }
    return { filled: false, selector: selectorList[0] || "" };
  }

  function buildFieldMap(card, settings, phone) {
    const billingName = [card.firstName, card.lastName]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" ") || card.billingName || card.name;

    return [
      { selectors: settings.phoneSelector, value: phone },
      { selectors: settings.cardNumberSelector, value: card.card },
      { selectors: settings.cardExpirySelector, value: card.expiryInput },
      { selectors: settings.cardCvvSelector, value: card.cvv },
      { selectors: settings.billingNameSelector, value: billingName },
      { selectors: settings.firstNameSelector, value: card.firstName },
      { selectors: settings.lastNameSelector, value: card.lastName },
      { selectors: settings.billingLine1Selector, value: card.address },
      { selectors: settings.billingCitySelector, value: card.city },
      { selectors: settings.billingStateSelector, value: card.state },
      { selectors: settings.billingPostalCodeSelector, value: card.postcode },
      { selectors: settings.countrySelector, value: card.country },
      { selectors: settings.passwordSelector, value: settings.passwordValue }
    ];
  }

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
    element.click();
    return { ok: true, selector };
  };

  window.__gptAutoRegisterSetValue = async function setValueExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const element = selector ? await waitForSelector(selector, payload && payload.timeoutMs) : null;
    if (!element) {
      return { ok: false, selector, error: `Element not found: ${selector}` };
    }
    if (payload && payload.type) {
      typeNativeValue(element, payload.value);
    } else {
      setNativeValue(element, payload && payload.value);
    }
    return { ok: true, selector, value: String(element.value || "") };
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
    setNativeValue(element, value);
    return { ok: true, selector, changed: true, value: String(element.value || "") };
  };

  window.__gptAutoRegisterCheck = async function checkExport(payload) {
    const selector = String((payload && payload.selector) || "").trim();
    const element = selector ? await waitForSelector(selector, payload && payload.timeoutMs) : null;
    if (!element) {
      return { ok: false, selector, checked: false, error: `Element not found: ${selector}` };
    }
    if (!element.checked) {
      element.click();
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { ok: true, selector, checked: Boolean(element.checked) };
  };

  window.__gptAutoRegisterFillForm = function fillForm(payload) {
    try {
      const card = payload && payload.card ? payload.card : {};
      const settings = payload && payload.settings ? payload.settings : {};
      const phone = String((payload && payload.phone) || card.phone || "").trim();
      const fields = buildFieldMap(card, settings, phone);
      const missing = [];
      let filled = 0;

      fields.forEach(({ selectors, value }) => {
        const selectorList = normalizeSelectorList(selectors);
        if (!selectorList.length || value === undefined || value === null) {
          return;
        }
        const result = fillSelector(selectorList, value);
        if (result.filled) {
          filled += 1;
        } else {
          missing.push(result.selector || selectorList[0]);
        }
      });

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
}());
