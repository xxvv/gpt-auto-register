(async function () {
  "use strict";

  const extApi = typeof browser !== "undefined" ? browser : chrome;
  const storageKey = window.__gptAutoRegisterContentCallStorageKey || "__gptAutoRegisterContentCall";

  function storageGet(key) {
    const result = extApi.storage.local.get(key);
    if (result && typeof result.then === "function") {
      return result;
    }
    return new Promise((resolve) => extApi.storage.local.get(key, resolve));
  }

  try {
    const stored = await storageGet(storageKey);
    const call = stored && stored[storageKey];
    if (!call || !call.functionName) {
      return { ok: false, error: "Missing content call" };
    }
    if (typeof window.__gptAutoRegisterCall !== "function") {
      return {
        ok: false,
        href: location.href,
        error: "content-script not loaded"
      };
    }
    return await window.__gptAutoRegisterCall(call.functionName, call.payload || {});
  } catch (error) {
    return {
      ok: false,
      href: location.href,
      error: error && error.message ? error.message : String(error)
    };
  }
}());
