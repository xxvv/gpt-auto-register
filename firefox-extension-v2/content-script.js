(function () {
  "use strict";

  function setNativeValue(element, value) {
    if (!element) {
      return false;
    }

    if (element instanceof HTMLSelectElement) {
      element.value = String(value || "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, String(value || ""));
    } else {
      element.value = String(value || "");
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value || "") }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function selectorList(selectors) {
    if (Array.isArray(selectors)) {
      return selectors.map((selector) => String(selector || "").trim()).filter(Boolean);
    }
    const single = String(selectors || "").trim();
    return single ? [single] : [];
  }

  function findFirst(selectors) {
    for (const selector of selectorList(selectors)) {
      const element = document.querySelector(selector);
      if (element) {
        return { element, selector };
      }
    }
    return { element: null, selector: selectorList(selectors)[0] || "" };
  }

  function fillFirst(selectors, value) {
    const result = findFirst(selectors);
    if (!result.element) {
      return { filled: false, selector: result.selector };
    }
    result.element.focus();
    setNativeValue(result.element, value);
    result.element.blur();
    return { filled: true, selector: result.selector };
  }

  function focusSubmit() {
    const submit = document.querySelector("button[type='submit'], input[type='submit']");
    if (submit instanceof HTMLElement) {
      submit.focus();
      return true;
    }
    return false;
  }

  function visibleText(element) {
    return String((element && (element.innerText || element.textContent)) || "").replace(/\s+/g, " ").trim();
  }

  window.__gptV2TryOpenSignup = function tryOpenSignup() {
    const candidates = Array.from(document.querySelectorAll("a, button"));
    const matched = candidates.find((element) => {
      const text = visibleText(element).toLowerCase();
      const href = String(element.getAttribute("href") || "").toLowerCase();
      return text === "sign up" ||
        text.includes("sign up") ||
        text.includes("注册") ||
        href.includes("signup") ||
        href.includes("sign-up");
    });

    if (!matched) {
      return { ok: false, clicked: false, message: "未找到注册入口" };
    }

    matched.click();
    return { ok: true, clicked: true, message: "已点击注册入口" };
  };

  window.__gptV2FillEmail = function fillEmail(payload) {
    const email = String((payload && payload.email) || "").trim();
    const result = fillFirst(["#email", "input[type='email']"], email);
    if (result.filled) {
      return { ok: true, selector: result.selector, submitFocused: focusSubmit() };
    }
    return { ok: false, selector: result.selector, error: "未找到邮箱输入框" };
  };

  window.__gptV2FillCode = function fillCode(payload) {
    const code = String((payload && payload.code) || "").trim();
    const result = fillFirst(["input[name='code']", "#code", "input[autocomplete='one-time-code']"], code);
    if (result.filled) {
      return { ok: true, selector: result.selector, submitFocused: focusSubmit() };
    }
    return { ok: false, selector: result.selector, error: "未找到验证码输入框" };
  };

  window.__gptV2FillAboutYou = function fillAboutYou(payload) {
    const name = String((payload && payload.name) || "").trim();
    const age = String((payload && payload.age) || "").trim();
    const nameResult = fillFirst(["input[name='name']", "#name", "input[autocomplete='name']"], name);
    const ageResult = fillFirst(["input[name='age']", "#age", "input[type='number']"], age);
    return {
      ok: nameResult.filled && ageResult.filled,
      nameFilled: nameResult.filled,
      ageFilled: ageResult.filled,
      submitFocused: nameResult.filled && ageResult.filled ? focusSubmit() : false,
      missing: [
        nameResult.filled ? "" : (nameResult.selector || "input[name='name']"),
        ageResult.filled ? "" : (ageResult.selector || "input[name='age']")
      ].filter(Boolean)
    };
  };

  window.__gptV2FillCard = function fillCard(payload) {
    try {
      const card = payload && payload.card ? payload.card : {};
      const phone = String((payload && payload.phone) || card.phone || "").trim();
      const fields = [
        { selectors: ["#phone", "input[name='phone']", "input[type='tel']"], value: phone },
        { selectors: ["#cardNumber", "input[name='cardnumber']", "input[autocomplete='cc-number']"], value: card.card },
        { selectors: ["#cardExpiry", "#cardExpiryInput", "input[name='exp-date']", "input[autocomplete='cc-exp']"], value: card.expiryInput },
        { selectors: ["#cardCvv", "#cardCvc", "input[name='cvc']", "input[autocomplete='cc-csc']"], value: card.cvv },
        { selectors: ["#billingName", "input[name='billingName']", "input[autocomplete='cc-name']"], value: card.billingName || card.name },
        { selectors: ["#firstName", "input[name='firstName']", "input[autocomplete='given-name']"], value: card.firstName },
        { selectors: ["#lastName", "input[name='lastName']", "input[autocomplete='family-name']"], value: card.lastName },
        { selectors: ["#billingLine1", "#billingAddressLine1", "input[name='addressLine1']", "input[autocomplete='billing address-line1']"], value: card.address },
        { selectors: ["#billingCity", "#billingLocality", "input[name='locality']", "input[autocomplete='billing address-level2']"], value: card.city },
        { selectors: ["#billingState", "input[name='administrativeArea']", "input[autocomplete='billing address-level1']"], value: card.state },
        { selectors: ["#billingPostalCode", "input[name='postalCode']", "input[autocomplete='billing postal-code']"], value: card.postcode },
        { selectors: ["#country", "select[name='country']", "select[autocomplete='billing country']"], value: card.country }
      ];

      const missing = [];
      let filled = 0;
      fields.forEach((field) => {
        if (!String(field.value || "").trim()) {
          return;
        }
        const result = fillFirst(field.selectors, field.value);
        if (result.filled) {
          filled += 1;
        } else {
          missing.push(result.selector);
        }
      });

      return { ok: filled > 0, filled, missing };
    } catch (error) {
      return { ok: false, filled: 0, missing: [], error: error && error.message ? error.message : String(error) };
    }
  };
}());
