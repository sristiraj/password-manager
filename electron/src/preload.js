const { contextBridge } = require("electron");

const API_BASE = "http://127.0.0.1:8765";

// Expose a minimal typed API surface to the renderer — no raw Node APIs
contextBridge.exposeInMainWorld("api", {
  unlock: (password) =>
    fetch(`${API_BASE}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ master_password: password }),
    }).then((r) => r.json()),

  lock: (token) =>
    fetch(`${API_BASE}/lock`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()),

  listEntries: (token) =>
    fetch(`${API_BASE}/entries`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()),

  createEntry: (token, data) =>
    fetch(`${API_BASE}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  updateEntry: (token, id, data) =>
    fetch(`${API_BASE}/entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  deleteEntry: (token, id) =>
    fetch(`${API_BASE}/entries/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()),

  backupUpload: (token) =>
    fetch(`${API_BASE}/backup/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()),

  backupDownload: (token) =>
    fetch(`${API_BASE}/backup/download`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()),
});
