(function (root) {
  const chromeStore =
    typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage : null;
  const listeners = [];

  function get(key, cb) {
    if (chromeStore) {
      chromeStore.local.get(key, cb);
      return;
    }
    let value;
    try {
      const raw = localStorage.getItem(key);
      value = raw ? JSON.parse(raw) : undefined;
    } catch {
      value = undefined;
    }
    cb({ [key]: value });
  }

  function set(obj, cb) {
    if (chromeStore) {
      chromeStore.local.set(obj, cb);
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
    const changes = {};
    for (const [key, value] of Object.entries(obj)) {
      changes[key] = { newValue: value };
    }
    listeners.forEach((fn) => fn(changes, "local"));
    if (cb) cb();
  }

  function onChanged(fn) {
    if (chromeStore && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(fn);
      return;
    }
    listeners.push(fn);
    window.addEventListener("storage", (event) => {
      if (!event.key) return;
      let newValue;
      try {
        newValue = event.newValue ? JSON.parse(event.newValue) : undefined;
      } catch {
        newValue = undefined;
      }
      fn({ [event.key]: { newValue } }, "local");
    });
  }

  function openSettings() {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }
    location.href = "options.html";
  }

  function isWeb() {
    return !chromeStore;
  }

  root.Store = { get, set, onChanged, openSettings, isWeb };
})(typeof window !== "undefined" ? window : globalThis);
