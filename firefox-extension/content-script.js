(function () {
  "use strict";

  function setNativeValue(element, value) {
    if (element instanceof HTMLSelectElement) {
      element.value = String(value || "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const inputPrototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(inputPrototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value || "") }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function normalizeSelectorList(selectors) {
    if (Array.isArray(selectors)) {
      return selectors.map((selector) => String(selector || "").trim()).filter(Boolean);
    }
    const single = String(selectors || "").trim();
    return single ? [single] : [];
  }

  function fillSelector(selectors, value) {
    const selectorList = normalizeSelectorList(selectors);
    for (const selector of selectorList) {
      const element = document.querySelector(selector);
      if (!element) {
        continue;
      }
      element.focus();
      setNativeValue(element, value);
      element.blur();
      return { filled: true, selector };
    }
    return { filled: false, selector: selectorList[0] || "" };
  }

  function removeSelector(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      return { removed: false, selector };
    }
    element.remove();
    return { removed: true, selector };
  }

  function checkSelector(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      return false;
    }
    if (!element.checked) {
      element.click();
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }

  function buildFieldMap(card, settings, phone) {
    return [
      { selectors: settings.phoneSelector, value: phone },
      { selectors: settings.cardNumberSelector, value: card.card },
      { selectors: settings.cardExpirySelector, value: card.expiryInput },
      { selectors: settings.cardCvvSelector, value: card.cvv },
      { selectors: settings.firstNameSelector, value: card.firstName },
      { selectors: settings.lastNameSelector, value: card.lastName },
      { selectors: settings.billingLine1Selector, value: card.address },
      { selectors: settings.billingCitySelector, value: card.city },
      { selectors: settings.billingStateSelector, value: card.state },
      { selectors: settings.billingPostalCodeSelector, value: card.postcode },
      { selectors: settings.passwordSelector, value: settings.passwordValue }
    ];
  }

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
        if (!selectorList.length) {
          return;
        }
        const result = fillSelector(selectorList, value);
        if (result.filled) {
          filled += 1;
        } else {
          missing.push(result.selector || selectorList[0]);
        }
      });

      return {
        ok: filled > 0,
        filled,
        checked: 0,
        missing
      };
    } catch (error) {
      return {
        ok: false,
        filled: 0,
        checked: 0,
        missing: [],
        error: error && error.message ? error.message : String(error)
      };
    }
  };

  window.__gptAutoRegisterRemoveElement = function removeElement(payload) {
    try {
      const selector = String((payload && payload.selector) || "").trim();
      if (!selector) {
        return {
          ok: false,
          removed: false,
          selector: "",
          error: "selector 不能为空"
        };
      }
      const result = removeSelector(selector);
      return {
        ok: result.removed,
        removed: result.removed,
        selector: result.selector,
        error: result.removed ? "" : ""
      };
    } catch (error) {
      return {
        ok: false,
        removed: false,
        selector: String((payload && payload.selector) || "").trim(),
        error: error && error.message ? error.message : String(error)
      };
    }
  };
}());
