const API = "http://127.0.0.1:8765";

// Session token is kept only in service-worker memory — never in chrome.storage
let sessionToken = null;

// Right-click → "Save to Password Manager" (works on any selected text)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pm-save-secret",
    title: "Save to Password Manager",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "pm-save-secret" || !info.selectionText) return;
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (text, title) => window.postMessage({ type: "__PM_SAVE_SECRET__", text, title }, "*"),
    args: [info.selectionText.trim(), tab.title],
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  switch (msg.type) {
    case "UNLOCK": {
      const res = await apiFetch("/unlock", "POST", { master_password: msg.password });
      if (res.token) sessionToken = res.token;
      return res;
    }
    case "LOCK": {
      const res = await apiFetch("/lock", "POST", null);
      sessionToken = null;
      return res;
    }
    case "IS_LOCKED":
      return { locked: !sessionToken };
    case "LIST_ENTRIES":
      return apiFetch("/entries", "GET", null);
    case "SAVE_ENTRY": {
      if (!sessionToken) return { locked: true };
      const res = await apiFetch("/entries", "POST", {
        title: msg.title,
        username: msg.username || null,
        password: msg.password || null,
        secret: msg.secret || null,
        url: msg.url || null,
      });
      if (res.id) return { ok: true };
      return { error: res.detail || "Save failed" };
    }
    case "FILL_PASSWORD": {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillCredentials,
        args: [msg.username, msg.password, msg.secret ?? null],
      });
      return { ok: true };
    }
    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

async function apiFetch(path, method, body) {
  const headers = { "Content-Type": "application/json" };
  if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// Injected into the active tab to fill login fields
function fillCredentials(username, password, secret) {
  const usernameSelectors = ['input[type="email"]', 'input[name*="user"]', 'input[name*="email"]', 'input[id*="user"]', 'input[id*="email"]'];
  const passwordSelectors = ['input[type="password"]'];
  const secretSelectors = ['input[name*="token"]', 'input[name*="secret"]', 'input[name*="api"]', 'input[name*="key"]', 'input[id*="token"]', 'input[id*="secret"]', 'input[id*="api"]', 'input[id*="key"]'];

  const find = (selectors) => {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  };

  const triggerInput = (el, value) => {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const uField = find(usernameSelectors);
  const pField = find(passwordSelectors);
  if (uField && username) triggerInput(uField, username);
  if (pField && password) triggerInput(pField, password);

  if (secret) {
    const sField = find(secretSelectors);
    if (sField) {
      triggerInput(sField, secret);
    } else {
      // No recognisable token field — fall back to clipboard so the user can paste
      navigator.clipboard?.writeText(secret).catch(() => {});
    }
  }
}
