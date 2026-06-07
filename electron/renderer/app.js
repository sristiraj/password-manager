let sessionToken = null;

// --- DOM refs ---
const screenUnlock = document.getElementById("screen-unlock");
const screenVault = document.getElementById("screen-vault");
const masterPasswordInput = document.getElementById("master-password");
const btnUnlock = document.getElementById("btn-unlock");
const unlockError = document.getElementById("unlock-error");
const btnLock = document.getElementById("btn-lock");
const btnAdd = document.getElementById("btn-add");
const entryList = document.getElementById("entry-list");
const modal = document.getElementById("modal-entry");
const formEntry = document.getElementById("form-entry");
const modalTitle = document.getElementById("modal-title");
const btnModalCancel = document.getElementById("btn-modal-cancel");
const btnBackupUpload = document.getElementById("btn-backup-upload");
const btnBackupDownload = document.getElementById("btn-backup-download");

let editingId = null;

// --- Unlock ---
btnUnlock.addEventListener("click", async () => {
  unlockError.classList.add("hidden");
  try {
    const res = await window.api.unlock(masterPasswordInput.value);
    if (res.token) {
      sessionToken = res.token;
      masterPasswordInput.value = "";
      screenUnlock.classList.add("hidden");
      screenVault.classList.remove("hidden");
      loadEntries();
    } else {
      unlockError.textContent = res.detail || "Wrong password";
      unlockError.classList.remove("hidden");
    }
  } catch (err) {
    unlockError.textContent = "Cannot reach backend: " + err.message;
    unlockError.classList.remove("hidden");
  }
});

masterPasswordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnUnlock.click();
});

// --- Lock ---
btnLock.addEventListener("click", async () => {
  await window.api.lock(sessionToken);
  sessionToken = null;
  entryList.innerHTML = "";
  screenVault.classList.add("hidden");
  screenUnlock.classList.remove("hidden");
});

// --- Entries ---
async function loadEntries() {
  const entries = await window.api.listEntries(sessionToken);
  entryList.innerHTML = "";
  for (const e of entries) {
    const li = document.createElement("li");
    const subtitle = [e.username, e.url].filter(Boolean).join(" · ");
    li.innerHTML = `
      <div>
        <strong>${esc(e.title)}</strong>
        ${subtitle ? `<span class="entry-sub"> &mdash; ${esc(subtitle)}</span>` : ""}
      </div>
      <div class="entry-actions">
        ${e.password ? `<button data-id="${e.id}" class="btn-copy">Copy pwd</button>` : ""}
        ${e.secret ? `<button data-id="${e.id}" class="btn-copy-secret">Copy secret</button>` : ""}
        <button data-id="${e.id}" class="btn-edit">Edit</button>
        <button data-id="${e.id}" class="btn-delete">Delete</button>
      </div>`;
    entryList.appendChild(li);
  }
}

entryList.addEventListener("click", async (e) => {
  const id = Number(e.target.dataset.id);
  if (!id) return;
  if (e.target.classList.contains("btn-copy")) {
    const entry = await window.api.listEntries(sessionToken).then((list) => list.find((x) => x.id === id));
    navigator.clipboard.writeText(entry.password);
  } else if (e.target.classList.contains("btn-copy-secret")) {
    const entry = await window.api.listEntries(sessionToken).then((list) => list.find((x) => x.id === id));
    navigator.clipboard.writeText(entry.secret);
  } else if (e.target.classList.contains("btn-edit")) {
    const entry = await window.api.listEntries(sessionToken).then((list) => list.find((x) => x.id === id));
    openModal(entry);
  } else if (e.target.classList.contains("btn-delete")) {
    if (confirm("Delete this entry?")) {
      await window.api.deleteEntry(sessionToken, id);
      loadEntries();
    }
  }
});

// --- Modal ---
function openModal(entry = null) {
  formEntry.reset();
  editingId = null;
  if (entry) {
    editingId = entry.id;
    modalTitle.textContent = "Edit Entry";
    for (const [k, v] of Object.entries(entry)) {
      if (formEntry.elements[k]) formEntry.elements[k].value = v ?? "";
    }
  } else {
    modalTitle.textContent = "New Entry";
  }
  modal.showModal();
}

btnAdd.addEventListener("click", () => openModal());
btnModalCancel.addEventListener("click", () => modal.close());

formEntry.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(formEntry));
  if (editingId) {
    await window.api.updateEntry(sessionToken, editingId, data);
  } else {
    await window.api.createEntry(sessionToken, data);
  }
  modal.close();
  loadEntries();
});

// --- Backup ---
btnBackupUpload.addEventListener("click", async () => {
  const res = await window.api.backupUpload(sessionToken);
  alert(res.file_id ? "Backup uploaded to Google Drive." : "Backup failed: " + (res.detail ?? "unknown error"));
});

btnBackupDownload.addEventListener("click", async () => {
  if (!confirm("This will overwrite your local vault with the Drive backup. Continue?")) return;
  const res = await window.api.backupDownload(sessionToken);
  if (res.status === "restored") { alert("Vault restored. Reloading entries."); loadEntries(); }
  else alert("Restore failed: " + (res.detail ?? "unknown error"));
});

function esc(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
