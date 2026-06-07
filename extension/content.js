// Detects password form submissions and token copies; offers to save to vault

let pendingCredentials = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractCredentials(form) {
  const passwordFields = [...form.querySelectorAll('input[type="password"]')].filter((el) => el.value);
  if (passwordFields.length === 0 || passwordFields.length > 1) return null;
  const password = passwordFields[0].value;
  const usernameSelectors = [
    'input[type="email"]', 'input[autocomplete="username"]', 'input[autocomplete="email"]',
    'input[name*="user"]', 'input[name*="email"]', 'input[name*="login"]',
    'input[id*="user"]', 'input[id*="email"]', 'input[type="text"]',
  ];
  let username = "";
  for (const sel of usernameSelectors) {
    const el = form.querySelector(sel);
    if (el && el.value) { username = el.value; break; }
  }
  return { username, password };
}

function looksLikeToken(text) {
  if (!text || text.length < 20 || /\s/.test(text)) return false;
  // Well-known token prefixes
  const prefixes = ["ghp_", "github_pat_", "ghs_", "gho_", "sk-", "xoxb-", "xoxp-",
                    "eyJ", "ya29.", "AKIA", "AIza", "Bearer "];
  if (prefixes.some((p) => text.startsWith(p))) return true;
  // Generic: long string of token-safe chars (no spaces, mostly alphanumeric + - _ .)
  return text.length >= 32 && /^[A-Za-z0-9\-_\.]+$/.test(text);
}

// ── Banner: password / credentials ───────────────────────────────────────────

function showSaveBanner(creds) {
  const existing = document.getElementById("__pm_banner__");
  if (existing) existing.remove();

  const banner = makeBanner();
  const msg = banner.querySelector(".__pm_msg__");
  const btnSave = banner.querySelector(".__pm_save__");
  msg.textContent = `Save password for ${location.hostname}?`;

  btnSave.addEventListener("click", async () => {
    btnSave.disabled = true;
    btnSave.textContent = "Saving…";
    const res = await chrome.runtime.sendMessage({
      type: "SAVE_ENTRY",
      title: document.title || location.hostname,
      username: creds.username,
      password: creds.password,
      url: location.origin,
    });
    handleSaveResponse(res, msg, btnSave, () => banner.remove());
  });

  document.body.prepend(banner);
  setTimeout(() => banner.remove(), 20000);
}

// ── Banner: token / secret ────────────────────────────────────────────────────

function showTokenSaveBanner(secret, suggestedTitle) {
  const existing = document.getElementById("__pm_banner__");
  if (existing) existing.remove();

  const banner = makeBanner();
  const msg = banner.querySelector(".__pm_msg__");
  const btnSave = banner.querySelector(".__pm_save__");

  // Editable title input so the user can name the token entry
  const titleInput = document.createElement("input");
  titleInput.value = suggestedTitle || document.title || location.hostname;
  titleInput.placeholder = "Entry name";
  titleInput.style.cssText = [
    "background:#16213e", "color:#e0e0e0", "border:1px solid #444",
    "border-radius:4px", "padding:4px 8px", "font-size:13px",
    "width:160px", "flex-shrink:0",
  ].join(";");

  const preview = secret.length > 24 ? secret.slice(0, 12) + "…" + secret.slice(-4) : secret;
  msg.textContent = `Save token (${preview}) as:`;
  // Insert the input between msg and save button
  msg.after(titleInput);

  btnSave.addEventListener("click", async () => {
    btnSave.disabled = true;
    btnSave.textContent = "Saving…";
    const res = await chrome.runtime.sendMessage({
      type: "SAVE_ENTRY",
      title: titleInput.value.trim() || location.hostname,
      secret,
      url: location.origin,
    });
    handleSaveResponse(res, msg, btnSave, () => { titleInput.remove(); banner.remove(); });
  });

  document.body.prepend(banner);
  setTimeout(() => banner.remove(), 30000);
}

// ── Shared banner factory ─────────────────────────────────────────────────────

function makeBanner() {
  const banner = document.createElement("div");
  banner.id = "__pm_banner__";
  banner.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:2147483647",
    "background:#1a1a2e", "color:#e0e0e0", "padding:10px 16px",
    "display:flex", "align-items:center", "gap:10px",
    "font-family:system-ui,sans-serif", "font-size:14px",
    "box-shadow:0 2px 10px rgba(0,0,0,0.6)",
  ].join(";");

  const btnStyle = "border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;flex-shrink:0;";

  const msg = document.createElement("span");
  msg.className = "__pm_msg__";
  msg.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

  const btnSave = document.createElement("button");
  btnSave.className = "__pm_save__";
  btnSave.textContent = "Save";
  btnSave.style.cssText = btnStyle + "background:#0f3460;color:#fff;";

  const btnNotNow = document.createElement("button");
  btnNotNow.textContent = "Not now";
  btnNotNow.style.cssText = btnStyle + "background:transparent;color:#aaa;border:1px solid #555;";

  const btnClose = document.createElement("button");
  btnClose.textContent = "✕";
  btnClose.style.cssText = "background:transparent;color:#888;border:none;cursor:pointer;font-size:15px;padding:2px 6px;";

  const dismiss = () => banner.remove();
  btnNotNow.addEventListener("click", dismiss);
  btnClose.addEventListener("click", dismiss);

  banner.append(msg, btnSave, btnNotNow, btnClose);
  return banner;
}

function handleSaveResponse(res, msg, btnSave, onSuccess) {
  if (res?.ok) {
    msg.textContent = "✓ Saved to Password Manager";
    setTimeout(onSuccess, 2000);
  } else if (res?.locked) {
    msg.textContent = "Vault is locked — open the app and unlock first";
    btnSave.textContent = "Save"; btnSave.disabled = false;
  } else {
    msg.textContent = "Failed to save: " + (res?.error || "unknown error");
    btnSave.textContent = "Save"; btnSave.disabled = false;
  }
}

// ── Detect: password form submission ─────────────────────────────────────────

document.addEventListener("submit", (event) => {
  const form = event.target.closest("form") ?? event.target;
  const creds = extractCredentials(form);
  if (!creds) return;
  pendingCredentials = creds;
  showSaveBanner(creds);
}, true);

document.addEventListener("click", (event) => {
  const btn = event.target.closest('button[type="submit"], input[type="submit"], button:not([type])');
  if (!btn) return;
  const form = btn.closest("form");
  if (!form) return;
  const creds = extractCredentials(form);
  if (!creds) return;
  pendingCredentials = creds;
  setTimeout(() => { if (pendingCredentials === creds) showSaveBanner(creds); }, 300);
}, true);

// ── Detect: token copy (Ctrl+C / select-and-copy) ────────────────────────────

document.addEventListener("copy", () => {
  const selected = window.getSelection()?.toString().trim() ?? "";
  if (looksLikeToken(selected)) showTokenSaveBanner(selected);
});

// ── Detect: programmatic clipboard.writeText (e.g. GitHub "Copy" button) ─────
// injected.js (MAIN world) fires this event when any script calls clipboard.writeText

window.addEventListener("__pm_clipboard_write__", (event) => {
  if (looksLikeToken(event.detail)) showTokenSaveBanner(event.detail);
});

// ── Detect: context menu "Save to Password Manager" ──────────────────────────

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type === "__PM_SAVE_SECRET__") {
    showTokenSaveBanner(event.data.text, event.data.title);
  }
});
