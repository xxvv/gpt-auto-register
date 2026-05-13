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

  function fillSelector(selector, value) {
    const element = document.querySelector(selector);
    if (!element) {
      return false;
    }
    element.focus();
    setNativeValue(element, value);
    element.blur();
    return true;
  }

  function removeSelector(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      return { removed: false, selector };
    }
    element.remove();
    return { removed: true, selector };
  }

  function buildFieldMap(card, settings) {
    return {
      [settings.phoneSelector]: card.phone,
      [settings.cardNumberSelector]: card.card,
      [settings.cardExpirySelector]: card.expiryInput,
      [settings.cardCvvSelector]: card.cvv,
      [settings.firstNameSelector]: card.firstName,
      [settings.lastNameSelector]: card.lastName,
      [settings.billingLine1Selector]: card.address,
      [settings.billingCitySelector]: card.city,
      [settings.billingStateSelector]: card.state,
      [settings.billingPostalCodeSelector]: card.postcode,
      [settings.passwordSelector]: settings.passwordValue
    };
  }

  window.__gptAutoRegisterFillForm = function fillForm(payload) {
    try {
      const card = payload && payload.card ? payload.card : {};
      const settings = payload && payload.settings ? payload.settings : {};
      const fields = buildFieldMap(card, settings);

      const missing = [];
      let filled = 0;

      Object.entries(fields).forEach(([selector, value]) => {
        if (!selector) {
          return;
        }
        if (fillSelector(selector, value)) {
          filled += 1;
        } else {
          missing.push(selector);
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
