const send = (msg) => chrome.runtime.sendMessage(msg);

const viewLocked = document.getElementById("view-locked");
const viewUnlocked = document.getElementById("view-unlocked");
const popupPassword = document.getElementById("popup-password");
const btnUnlock = document.getElementById("btn-popup-unlock");
const popupError = document.getElementById("popup-error");
const btnLock = document.getElementById("btn-popup-lock");
const searchInput = document.getElementById("search");
const entriesList = document.getElementById("popup-entries");
const domainBadge = document.getElementById("domain-badge");

let allEntries = [];
let currentHost = null;

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) currentHost = new URL(tab.url).hostname;
  } catch (_) {}

  const { locked } = await send({ type: "IS_LOCKED" });
  if (locked) {
    viewLocked.classList.remove("hidden");
    viewUnlocked.classList.add("hidden");
  } else {
    showVault();
  }
}

async function showVault() {
  viewLocked.classList.add("hidden");
  viewUnlocked.classList.remove("hidden");
  allEntries = await send({ type: "LIST_ENTRIES" });

  // Auto-filter to matching domain entries; show all if none match
  const matched = currentHost ? allEntries.filter((e) => entryMatchesHost(e, currentHost)) : [];
  if (matched.length > 0) {
    domainBadge.textContent = `Showing ${matched.length} match${matched.length > 1 ? "es" : ""} for ${currentHost}`;
    domainBadge.classList.remove("hidden");
    renderEntries(matched);
  } else {
    domainBadge.classList.add("hidden");
    renderEntries(allEntries);
  }
}

function entryMatchesHost(entry, host) {
  if (!entry.url) return false;
  try {
    const entryHost = new URL(entry.url).hostname;
    return entryHost === host || host.endsWith("." + entryHost) || entryHost.endsWith("." + host);
  } catch (_) {
    return entry.url.includes(host);
  }
}

function renderEntries(entries) {
  entriesList.innerHTML = "";
  for (const e of entries) {
    const li = document.createElement("li");

    const info = document.createElement("div");
    info.className = "entry-info";
    info.innerHTML = `<div class="title">${esc(e.title)}</div><div class="url">${esc(e.url ?? "")}</div>`;
    info.addEventListener("click", () => {
      send({ type: "FILL_PASSWORD", username: e.username, password: e.password, secret: e.secret });
      window.close();
    });

    li.appendChild(info);

    if (e.secret) {
      const btn = document.createElement("button");
      btn.className = "btn-copy-secret";
      btn.title = "Copy secret / API token";
      btn.textContent = "key";
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await navigator.clipboard.writeText(e.secret);
        btn.textContent = "✓";
        setTimeout(() => { btn.textContent = "key"; }, 1500);
      });
      li.appendChild(btn);
    }

    entriesList.appendChild(li);
  }
}

btnUnlock.addEventListener("click", async () => {
  popupError.classList.add("hidden");
  const res = await send({ type: "UNLOCK", password: popupPassword.value });
  if (res.token) {
    showVault();
  } else {
    popupError.textContent = res.detail || "Wrong password";
    popupError.classList.remove("hidden");
  }
});

popupPassword.addEventListener("keydown", (e) => { if (e.key === "Enter") btnUnlock.click(); });

btnLock.addEventListener("click", async () => {
  await send({ type: "LOCK" });
  allEntries = [];
  viewUnlocked.classList.add("hidden");
  viewLocked.classList.remove("hidden");
});

searchInput.addEventListener("input", () => {
  const q = searchInput.value.toLowerCase();
  domainBadge.classList.add("hidden");
  renderEntries(allEntries.filter((e) => e.title.toLowerCase().includes(q) || (e.url ?? "").toLowerCase().includes(q)));
});

function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

init();
