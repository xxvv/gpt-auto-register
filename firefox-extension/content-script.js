(function () {
  "use strict";

  function setNativeValue(element, value) {
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

  window.__gptAutoRegisterFillStripe = function fillStripe(card) {
    try {
      const fields = {
        "#cardNumber": card.card,
        "#cardExpiry": card.expiryInput,
        "#cardCvc": card.cvv,
        "#billingName": card.name,
        "#billingAddressLine1": card.address,
        "#billingLocality": card.city,
        "#billingPostalCode": card.postcode
      };

      const missing = [];
      let filled = 0;

      Object.entries(fields).forEach(([selector, value]) => {
        if (fillSelector(selector, value)) {
          filled += 1;
        } else {
          missing.push(selector);
        }
      });

      let checked = 0;
      if (checkSelector("#termsOfServiceConsentCheckbox")) {
        checked += 1;
      } else {
        missing.push("#termsOfServiceConsentCheckbox");
      }

      return {
        ok: filled > 0 || checked > 0,
        filled,
        checked,
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
}());
