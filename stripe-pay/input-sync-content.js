(() => {
  if (window.__stripePayInputSyncInjected) {
    return;
  }
  window.__stripePayInputSyncInjected = true;

  const pendingActionIds = new Set();
  const elementIndexCache = new WeakMap();
  const LOCAL_ACTION_TTL_MS = 1000;

  let activeElement = null;
  let isComposing = false;
  let applyingRemote = false;
  let readySent = false;
  let detached = false;

  function sendReadySignal() {
    if (readySent || detached) {
      return;
    }
    readySent = true;
    void chrome.runtime.sendMessage({
      type: "MIRROR_CONTENT_READY"
    }).catch(() => {});
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, 100);
  }

  function canMirrorElement(el) {
    if (!el) {
      return false;
    }

    if (el.disabled) {
      return false;
    }

    if (el.isContentEditable) {
      return false;
    }

    if (el instanceof HTMLInputElement) {
      const blocked = new Set(["password", "file", "hidden"]);
      if (blocked.has((el.type || "").toLowerCase())) {
        return false;
      }
      return true;
    }

    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      return true;
    }

    if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) {
      return true;
    }

    if (el instanceof HTMLElement) {
      const role = (el.getAttribute("role") || "").toLowerCase();
      return ["button", "checkbox", "radio", "option", "tab"].includes(role);
    }

    return false;
  }

  function getElementIndex(el) {
    const parent = el?.parentElement;
    if (!parent) {
      return 0;
    }

    if (elementIndexCache.has(el)) {
      return elementIndexCache.get(el);
    }

    const sameTag = Array.from(parent.querySelectorAll(el.tagName.toLowerCase())).filter((node) =>
      canMirrorElement(node)
    );
    const index = Math.max(0, sameTag.indexOf(el));
    elementIndexCache.set(el, index);
    return index;
  }

  function getElementDescriptor(el) {
    if (!el) {
      return null;
    }

    const tag = el.tagName.toLowerCase();
    const descriptor = {
      tag,
      id: el.id || "",
      name: el.getAttribute("name") || "",
      type: el.getAttribute("type") || "",
      role: el.getAttribute("role") || "",
      placeholder: el.getAttribute("placeholder") || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      text: ""
    };

    if (tag === "button" || tag === "a") {
      descriptor.text = normalizeText(el.textContent || "");
    }

    if (!descriptor.id && !descriptor.name && !descriptor.ariaLabel && !descriptor.placeholder && !descriptor.text) {
      descriptor.index = getElementIndex(el);
    }

    return descriptor;
  }

  function getActionTargetKind(el) {
    if (el instanceof HTMLInputElement) {
      const type = (el.type || "").toLowerCase();
      if (["checkbox", "radio", "button", "submit", "reset", "image"].includes(type)) {
        return "click";
      }
      return "input";
    }

    if (el instanceof HTMLTextAreaElement) {
      return "input";
    }

    if (el instanceof HTMLSelectElement) {
      return "change";
    }

    return "click";
  }

  function createActionId() {
    if (window.crypto?.randomUUID) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function findCandidateElements(descriptor) {
    const selectors = [];

    if (descriptor.id) {
      selectors.push(`#${CSS.escape(descriptor.id)}`);
    }

    if (descriptor.name) {
      selectors.push(`[name="${CSS.escape(descriptor.name)}"]`);
    }

    if (descriptor.placeholder) {
      selectors.push(`[placeholder="${CSS.escape(descriptor.placeholder)}"]`);
    }

    if (descriptor.ariaLabel) {
      selectors.push(`[aria-label="${CSS.escape(descriptor.ariaLabel)}"]`);
    }

    if (descriptor.role) {
      selectors.push(`[role="${CSS.escape(descriptor.role)}"]`);
    }

    if (descriptor.tag === "input" && descriptor.type) {
      selectors.push(`input[type="${CSS.escape(descriptor.type)}"]`);
    }

    if (descriptor.tag === "button" && descriptor.text) {
      selectors.push("button");
    }

    if (descriptor.tag === "a" && descriptor.text) {
      selectors.push("a");
    }

    const seen = new Set();
    const nodes = [];

    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (seen.has(el) || !canMirrorElement(el)) {
          continue;
        }
        seen.add(el);
        nodes.push(el);
      }
    }

    return nodes;
  }

  function matchesDescriptor(el, descriptor) {
    if (!el || !descriptor) {
      return false;
    }

    const tag = el.tagName.toLowerCase();
    if (descriptor.tag && descriptor.tag !== tag) {
      return false;
    }

    if (descriptor.id && el.id !== descriptor.id) {
      return false;
    }

    if (descriptor.name && el.getAttribute("name") !== descriptor.name) {
      return false;
    }

    if (descriptor.type && (el.getAttribute("type") || "") !== descriptor.type) {
      return false;
    }

    if (descriptor.role && (el.getAttribute("role") || "") !== descriptor.role) {
      return false;
    }

    if (descriptor.placeholder && (el.getAttribute("placeholder") || "") !== descriptor.placeholder) {
      return false;
    }

    if (descriptor.ariaLabel && (el.getAttribute("aria-label") || "") !== descriptor.ariaLabel) {
      return false;
    }

    if (descriptor.text) {
      const text = normalizeText(el.textContent || "");
      if (text !== descriptor.text) {
        return false;
      }
    }

    return true;
  }

  function resolveTarget(action) {
    const descriptor = action?.descriptor;
    if (!descriptor) {
      return null;
    }

    const candidates = findCandidateElements(descriptor);

    if (candidates.length > 0) {
      if (typeof descriptor.index === "number") {
        const matchedByIndex = candidates.filter((el) => getElementIndex(el) === descriptor.index);
        if (matchedByIndex[0]) {
          return matchedByIndex[0];
        }
      }

      const exactMatch = candidates.find((el) => matchesDescriptor(el, descriptor));
      if (exactMatch) {
        return exactMatch;
      }

      return candidates[0];
    }

    if (typeof descriptor.index === "number") {
      const selector = descriptor.tag || "*";
      const fallback = Array.from(document.querySelectorAll(selector)).filter(canMirrorElement);
      return fallback[descriptor.index] || null;
    }

    return null;
  }

  function updateControlValue(el, nextValue) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
      descriptor?.set?.call(el, nextValue);
      return;
    }

    if (el instanceof HTMLSelectElement) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
      descriptor?.set?.call(el, nextValue);
    }
  }

  function buildActionPayload(el, event) {
    const descriptor = getElementDescriptor(el);
    if (!descriptor) {
      return null;
    }

    const actionType = getActionTargetKind(el);
    const payload = {
      actionId: createActionId(),
      actionType,
      descriptor
    };

    if (actionType === "input") {
      payload.value = el.value;
      payload.selectedIndex = el instanceof HTMLSelectElement ? el.selectedIndex : undefined;
    }

    if (actionType === "click") {
      if (el instanceof HTMLInputElement) {
        payload.checked = el.checked;
      }

      if (event && typeof event.button === "number") {
        payload.button = event.button;
      }
    }

    if (actionType === "change" && el instanceof HTMLSelectElement) {
      payload.value = el.value;
      payload.selectedIndex = el.selectedIndex;
    }

    return payload;
  }

  function broadcastAction(payload) {
    if (!payload || applyingRemote || isComposing || detached) {
      return;
    }

    const outboundPayload = {
      ...payload,
      actionId: payload.actionId || createActionId()
    };

    void chrome.runtime.sendMessage({
      type: "MIRROR_ACTION_BROADCAST",
      payload: outboundPayload
    }).catch(() => {});
  }

  function applyInputAction(target, payload) {
    if (target instanceof HTMLSelectElement) {
      updateControlValue(target, typeof payload.value === "string" ? payload.value : "");
      if (typeof payload.selectedIndex === "number") {
        target.selectedIndex = payload.selectedIndex;
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      updateControlValue(target, typeof payload.value === "string" ? payload.value : "");
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    return false;
  }

  function applyClickAction(target) {
    if (target instanceof HTMLInputElement) {
      const type = (target.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        target.click();
        return true;
      }

      if (["button", "submit", "reset", "image"].includes(type)) {
        target.click();
        return true;
      }
    }

    if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement || target instanceof HTMLElement) {
      target.click();
      return true;
    }

    return false;
  }

  function applyAction(payload) {
    if (!payload || !payload.actionType || !payload.actionId || detached) {
      return { applied: false };
    }

    if (pendingActionIds.has(payload.actionId)) {
      return { applied: true, deduped: true };
    }

    pendingActionIds.add(payload.actionId);
    setTimeout(() => pendingActionIds.delete(payload.actionId), LOCAL_ACTION_TTL_MS);

    const target = resolveTarget(payload);
    if (!target) {
      return { applied: false, skipped: true, reason: "target_not_found" };
    }

    applyingRemote = true;
    try {
      if (payload.actionType === "input" || payload.actionType === "change") {
        return {
          applied: applyInputAction(target, payload)
        };
      }

      if (payload.actionType === "click") {
        return {
          applied: applyClickAction(target, payload)
        };
      }
    } finally {
      applyingRemote = false;
    }

    return { applied: false, skipped: true, reason: "unsupported_action" };
  }

  function onFocusIn(event) {
    const target = event.target;
    if (canMirrorElement(target)) {
      activeElement = target;
    }
  }

  function onInput(event) {
    const target = event.target;
    if (!canMirrorElement(target) || applyingRemote || detached) {
      return;
    }

    activeElement = target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const payload = buildActionPayload(target, event);
      if (payload) {
        payload.actionType = "input";
        broadcastAction(payload);
      }
    }
  }

  function onChange(event) {
    const target = event.target;
    if (!canMirrorElement(target) || applyingRemote || detached) {
      return;
    }

    activeElement = target;
    if (target instanceof HTMLSelectElement) {
      const payload = buildActionPayload(target, event);
      if (payload) {
        payload.actionType = "change";
        broadcastAction(payload);
      }
    } else if (target instanceof HTMLInputElement) {
      const type = (target.type || "").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        const payload = buildActionPayload(target, event);
        if (payload) {
          payload.actionType = "click";
          broadcastAction(payload);
        }
      }
    }
  }

  function onClick(event) {
    const target = event.target instanceof Element ? event.target.closest("button, a, input, [role='button'], [role='checkbox'], [role='radio']") : null;
    if (!target || !canMirrorElement(target) || applyingRemote || detached) {
      return;
    }

    if (target instanceof HTMLInputElement) {
      const type = (target.type || "").toLowerCase();
      if (["checkbox", "radio", "button", "submit", "reset", "image"].indexOf(type) === -1) {
        return;
      }
    }

    activeElement = target;
    const payload = buildActionPayload(target, event);
    if (payload) {
      if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement || target.getAttribute("role") === "button" || target instanceof HTMLInputElement) {
        payload.actionType = "click";
        broadcastAction(payload);
        return;
      }

      payload.actionType = getActionTargetKind(target);
      broadcastAction(payload);
    }
  }

  function onCompositionStart() {
    isComposing = true;
  }

  function onCompositionEnd(event) {
    isComposing = false;
    const target = event.target;
    if (canMirrorElement(target) && !detached) {
      activeElement = target;
      const payload = buildActionPayload(target, event);
      if (payload) {
        payload.actionType = "input";
        broadcastAction(payload);
      }
    }
  }

  function onMessage(message, _sender, sendResponse) {
    if (message?.type === "MIRROR_ACTION_APPLY") {
      const result = applyAction(message.payload);
      sendResponse?.(result);
      return true;
    }

    if (message?.type === "MIRROR_DETACH") {
      detach();
      sendResponse?.({ detached: true });
      return true;
    }

    return undefined;
  }

  function attach() {
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("compositionstart", onCompositionStart, true);
    document.addEventListener("compositionend", onCompositionEnd, true);
    chrome.runtime.onMessage.addListener(onMessage);
    sendReadySignal();
  }

  function detach() {
    if (detached) {
      return;
    }

    detached = true;
    readySent = false;
    applyingRemote = false;
    isComposing = false;
    activeElement = null;
    pendingActionIds.clear();

    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("change", onChange, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("compositionstart", onCompositionStart, true);
    document.removeEventListener("compositionend", onCompositionEnd, true);
    chrome.runtime.onMessage.removeListener(onMessage);

    try {
      delete window.__stripePayInputSyncInjected;
    } catch (_error) {
      window.__stripePayInputSyncInjected = false;
    }
  }

  attach();
})();
