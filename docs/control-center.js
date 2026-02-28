if (window.TradeProCore && window.TradeProCore.hasSession()) {
  window.TradeProCore.ensureAuthenticated().catch(() => {
    window.location = "index.html";
  });
} else if (localStorage.getItem("auth") !== "true" && sessionStorage.getItem("auth") !== "true") {
  window.location = "index.html";
}

const themePickEl = document.getElementById("themePick");
const workspaceListEl = document.getElementById("workspaceList");
const auditListEl = document.getElementById("auditList");
const workspaceImportInputEl = document.getElementById("workspaceImportInput");
const workspaceRenameInputEl = document.getElementById("workspaceRenameInput");
const auditFilterInputEl = document.getElementById("auditFilterInput");
const currencyPickEl = document.getElementById("currencyPick");

let currentWorkspaces = [];
let currentActiveWorkspaceId = "";
let currentAuditItems = [];

function esc(v) {
  return String(v || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function on(id, event, handler) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener(event, handler);
}

async function apiFetch(path, options = {}) {
  const response = await window.TradeProCore.apiFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function renderDiagLine(title, content) {
  console.log(`[Control Center] ${title}: ${content}`);
}

async function loadTheme() {
  try {
    const data = await apiFetch("/api/theme");
    const theme = String(data.theme || "dark");
    themePickEl.value = theme;
    window.TradeProCore.applyTheme(theme);
  } catch (error) {
    console.log("Theme load warning:", error.message);
  }
}

async function saveTheme() {
  const theme = themePickEl.value;
  await window.TradeProCore.setTheme(theme);
  renderDiagLine("Theme", `Saved as ${theme}`);
}

async function loadCurrency() {
  const current = window.TradeProCore.getCurrency?.() || "USD";
  if (currencyPickEl) currencyPickEl.value = current;
  renderDiagLine("Currency", `Loaded ${current}`);
}

async function saveCurrency() {
  const next = String(currencyPickEl?.value || "USD");
  const saved = await window.TradeProCore.setCurrency(next);
  renderDiagLine("Currency", `Saved ${saved} for whole project`);
}

async function refreshFxRates() {
  await window.TradeProCore.refreshCurrencyRates?.();
  renderDiagLine("Currency", "Refreshed exchange rates from USD base.");
}

function renderWorkspaces() {
  const active = currentActiveWorkspaceId;
  workspaceListEl.innerHTML = currentWorkspaces.map((ws) => `
    <div class="news-item">
      <h4>${esc(ws.name)} ${ws.id === active ? "(Active)" : ""}</h4>
      <p>ID: ${esc(ws.id)} | Updated: ${new Date(Number(ws.updatedAt || Date.now())).toLocaleString()}</p>
      <div class="row" style="margin-top:8px;">
        <button class="btn ghost btn-auto" type="button" onclick="activateWorkspace('${esc(ws.id)}')">Activate</button>
        <button class="btn ghost btn-auto" type="button" onclick="deleteWorkspace('${esc(ws.id)}')">Delete</button>
      </div>
    </div>
  `).join("") || "<p class='brand-sub'>No workspaces yet.</p>";
}

async function loadWorkspaces() {
  try {
    const data = await apiFetch("/api/workspaces");
    currentActiveWorkspaceId = data.activeWorkspaceId || "";
    currentWorkspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
    renderWorkspaces();
  } catch (error) {
    workspaceListEl.innerHTML = `<p class='brand-sub'>${esc(error.message)}</p>`;
  }
}

async function createWorkspace() {
  const name = String(document.getElementById("workspaceName").value || "").trim();
  if (!name) return;
  await apiFetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, layout: { dashboardPanels: ["watchlist", "risk-heatmap", "planning-tools"], density: "comfortable" } })
  });
  await loadWorkspaces();
  renderDiagLine("Workspace", `Created ${name}`);
}

async function activateWorkspace(id) {
  await apiFetch("/api/workspaces/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });
  await loadWorkspaces();
  renderDiagLine("Workspace", `Activated ${id}`);
}

async function deleteWorkspace(id) {
  await apiFetch(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadWorkspaces();
  renderDiagLine("Workspace", `Deleted ${id}`);
}

async function duplicateActiveWorkspace() {
  const active = currentWorkspaces.find((w) => w.id === currentActiveWorkspaceId);
  if (!active) throw new Error("No active workspace to duplicate");
  const newName = `${active.name} Copy`;
  await apiFetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName, layout: active.layout || {} })
  });
  await loadWorkspaces();
  renderDiagLine("Workspace", `Duplicated ${active.name}`);
}

async function renameActiveWorkspace() {
  const active = currentWorkspaces.find((w) => w.id === currentActiveWorkspaceId);
  const nextName = String(workspaceRenameInputEl.value || "").trim();
  if (!active) throw new Error("No active workspace to rename");
  if (!nextName) throw new Error("Enter a new workspace name");
  await apiFetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: active.id, name: nextName, layout: active.layout || {} })
  });
  await loadWorkspaces();
  renderDiagLine("Workspace", `Renamed to ${nextName}`);
}

function exportWorkspacesJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    activeWorkspaceId: currentActiveWorkspaceId,
    workspaces: currentWorkspaces
  };
  const text = JSON.stringify(payload, null, 2);
  workspaceImportInputEl.value = text;
  navigator.clipboard?.writeText(text).catch(() => {});
  renderDiagLine("Workspace Export", "Copied workspace JSON to clipboard and input box.");
}

async function importWorkspacesJson() {
  const raw = String(workspaceImportInputEl.value || "").trim();
  if (!raw) throw new Error("Paste JSON to import");
  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON input");
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
  if (!list.length) throw new Error("No workspaces found in JSON");
  for (const ws of list.slice(0, 20)) {
    await apiFetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ws.id, name: ws.name || "Imported Workspace", layout: ws.layout || {} })
    });
  }
  if (parsed.activeWorkspaceId) {
    await apiFetch("/api/workspaces/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: parsed.activeWorkspaceId })
    }).catch(() => {});
  }
  await loadWorkspaces();
  renderDiagLine("Workspace Import", `Imported ${list.length} workspaces`);
}

function renderAudit(items) {
  auditListEl.innerHTML = items.map((item) => `
    <div class="news-item">
      <h4>${esc(item.type || "api_call")} | ${new Date(Number(item.ts || Date.now())).toLocaleString()}</h4>
      <p>${esc(item.method || "-")} ${esc(item.path || "")} | status ${esc(item.statusCode || "-")} | ${esc(item.durationMs || 0)}ms</p>
    </div>
  `).join("") || "<p class='brand-sub'>No activity yet.</p>";
}

async function loadAuditLogs() {
  try {
    const data = await apiFetch("/api/audit/logs?limit=180");
    currentAuditItems = Array.isArray(data.items) ? data.items : [];
    renderAudit(currentAuditItems);
  } catch (error) {
    auditListEl.innerHTML = `<p class='brand-sub'>${esc(error.message)}</p>`;
  }
}

function filterAuditLogs() {
  const needle = String(auditFilterInputEl.value || "").trim().toLowerCase();
  if (!needle) {
    renderAudit(currentAuditItems);
    return;
  }
  const filtered = currentAuditItems.filter((item) => {
    const hay = `${item.type || ""} ${item.method || ""} ${item.path || ""} ${item.statusCode || ""}`.toLowerCase();
    return hay.includes(needle);
  });
  renderAudit(filtered);
}

function clearAuditFilter() {
  auditFilterInputEl.value = "";
  renderAudit(currentAuditItems);
}

function downloadAuditCsv() {
  const rows = [["ts_iso", "type", "method", "path", "status", "duration_ms"]];
  currentAuditItems.forEach((item) => {
    rows.push([
      new Date(Number(item.ts || Date.now())).toISOString(),
      item.type || "",
      item.method || "",
      item.path || "",
      String(item.statusCode || ""),
      String(item.durationMs || "")
    ]);
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  renderDiagLine("Audit Export", "Downloaded audit CSV.");
}

on("themeLoadBtn", "click", () => loadTheme().catch((e) => renderDiagLine("Theme", e.message)));
on("themeSaveBtn", "click", () => saveTheme().catch((e) => renderDiagLine("Theme", e.message)));
on("currencyLoadBtn", "click", () => loadCurrency().catch((e) => renderDiagLine("Currency", e.message)));
on("currencySaveBtn", "click", () => saveCurrency().catch((e) => renderDiagLine("Currency", e.message)));
on("currencyRefreshRatesBtn", "click", () => refreshFxRates().catch((e) => renderDiagLine("Currency", e.message)));
on("workspaceRefreshBtn", "click", () => loadWorkspaces().catch((e) => renderDiagLine("Workspace", e.message)));
on("workspaceCreateBtn", "click", () => createWorkspace().catch((e) => renderDiagLine("Workspace", e.message)));
on("workspaceRenameBtn", "click", () => renameActiveWorkspace().catch((e) => renderDiagLine("Workspace", e.message)));
on("workspaceDuplicateBtn", "click", () => duplicateActiveWorkspace().catch((e) => renderDiagLine("Workspace", e.message)));
on("workspaceExportBtn", "click", () => exportWorkspacesJson());
on("workspaceImportBtn", "click", () => importWorkspacesJson().catch((e) => renderDiagLine("Workspace", e.message)));
on("auditRefreshBtn", "click", () => loadAuditLogs().catch((e) => renderDiagLine("Audit", e.message)));
on("auditFilterBtn", "click", () => filterAuditLogs());
on("auditClearFilterBtn", "click", () => clearAuditFilter());
on("auditDownloadBtn", "click", () => downloadAuditCsv());

window.activateWorkspace = activateWorkspace;
window.deleteWorkspace = deleteWorkspace;

loadTheme();
loadCurrency();
loadWorkspaces();
loadAuditLogs();
