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
const uiPrefInputs = {
  density: document.getElementById("uiDensity"),
  motion: document.getElementById("uiMotion"),
  panelRadius: document.getElementById("uiPanelRadius"),
  cardRadius: document.getElementById("uiCardRadius"),
  inputRadius: document.getElementById("uiInputRadius"),
  blur: document.getElementById("uiBlur"),
  shellWidth: document.getElementById("uiShellWidth")
};
const uiPrefValueEls = {
  panelRadius: document.getElementById("uiPanelRadiusValue"),
  cardRadius: document.getElementById("uiCardRadiusValue"),
  inputRadius: document.getElementById("uiInputRadiusValue"),
  blur: document.getElementById("uiBlurValue"),
  shellWidth: document.getElementById("uiShellWidthValue")
};
const colorInputMap = {
  bg0: document.getElementById("colorBg0"),
  bg1: document.getElementById("colorBg1"),
  bg2: document.getElementById("colorBg2"),
  card: document.getElementById("colorCard"),
  cardStrong: document.getElementById("colorCardStrong"),
  text: document.getElementById("colorText"),
  muted: document.getElementById("colorMuted"),
  line: document.getElementById("colorLine"),
  lineStrong: document.getElementById("colorLineStrong"),
  accent: document.getElementById("colorAccent"),
  accent2: document.getElementById("colorAccent2"),
  accent3: document.getElementById("colorAccent3")
};

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

function collectCustomColors() {
  const colors = {};
  Object.entries(colorInputMap).forEach(([key, input]) => {
    if (!input) return;
    colors[key] = String(input.value || "").trim();
  });
  return colors;
}

function fillCustomColorInputs(colors) {
  const palette = colors || window.TradeProCore.getCustomColors?.() || {};
  Object.entries(colorInputMap).forEach(([key, input]) => {
    if (!input || !palette[key]) return;
    input.value = palette[key];
  });
}

function previewCustomColors() {
  if (!window.TradeProCore?.applyCustomColors) return;
  window.TradeProCore.applyCustomColors(collectCustomColors(), { persist: false, source: "preview" });
}

function loadCustomColors() {
  const colors = window.TradeProCore.getCustomColors?.();
  fillCustomColorInputs(colors);
  previewCustomColors();
  renderDiagLine("Colors", "Loaded current palette.");
}

function saveCustomColors() {
  const palette = window.TradeProCore.applyCustomColors?.(collectCustomColors(), { persist: true, source: "local" });
  renderDiagLine("Colors", `Saved ${Object.keys(palette || {}).length} palette values.`);
}

function resetCustomColors() {
  const palette = window.TradeProCore.resetCustomColors?.({ persist: true, source: "local" });
  fillCustomColorInputs(palette);
  renderDiagLine("Colors", "Reset to default palette.");
}

function collectCustomUi() {
  return {
    density: String(uiPrefInputs.density?.value || "comfortable"),
    motion: String(uiPrefInputs.motion?.value || "full"),
    panelRadius: Number(uiPrefInputs.panelRadius?.value || 28),
    cardRadius: Number(uiPrefInputs.cardRadius?.value || 24),
    inputRadius: Number(uiPrefInputs.inputRadius?.value || 16),
    blur: Number(uiPrefInputs.blur?.value || 18),
    shellWidth: Number(uiPrefInputs.shellWidth?.value || 1680)
  };
}

function renderUiPrefValues(prefs = collectCustomUi()) {
  if (uiPrefValueEls.panelRadius) uiPrefValueEls.panelRadius.textContent = `${prefs.panelRadius}px`;
  if (uiPrefValueEls.cardRadius) uiPrefValueEls.cardRadius.textContent = `${prefs.cardRadius}px`;
  if (uiPrefValueEls.inputRadius) uiPrefValueEls.inputRadius.textContent = `${prefs.inputRadius}px`;
  if (uiPrefValueEls.blur) uiPrefValueEls.blur.textContent = `${prefs.blur}px`;
  if (uiPrefValueEls.shellWidth) uiPrefValueEls.shellWidth.textContent = `${prefs.shellWidth}px`;
}

function fillCustomUiInputs(ui) {
  const prefs = ui || window.TradeProCore.getCustomUi?.() || {};
  Object.entries(uiPrefInputs).forEach(([key, input]) => {
    if (!input || prefs[key] === undefined) return;
    input.value = String(prefs[key]);
  });
  renderUiPrefValues(prefs);
}

function previewCustomUi() {
  if (!window.TradeProCore?.applyCustomUi) return;
  const prefs = collectCustomUi();
  renderUiPrefValues(prefs);
  window.TradeProCore.applyCustomUi(prefs, { persist: false, source: "preview" });
}

function loadCustomUi() {
  const prefs = window.TradeProCore.getCustomUi?.();
  fillCustomUiInputs(prefs);
  previewCustomUi();
  renderDiagLine("UI", "Loaded interface tuning.");
}

function saveCustomUi() {
  const prefs = collectCustomUi();
  window.TradeProCore.applyCustomUi?.(prefs, { persist: true, source: "local" });
  renderUiPrefValues(prefs);
  renderDiagLine("UI", "Saved interface tuning.");
}

function resetCustomUi() {
  const prefs = window.TradeProCore.resetCustomUi?.({ persist: true, source: "local" });
  fillCustomUiInputs(prefs);
  renderDiagLine("UI", "Reset interface tuning.");
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
on("colorsLoadBtn", "click", () => loadCustomColors());
on("colorsSaveBtn", "click", () => saveCustomColors());
on("colorsResetBtn", "click", () => resetCustomColors());
on("uiLoadBtn", "click", () => loadCustomUi());
on("uiSaveBtn", "click", () => saveCustomUi());
on("uiResetBtn", "click", () => resetCustomUi());
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
fillCustomColorInputs(window.TradeProCore.getCustomColors?.());
Object.values(colorInputMap).forEach((input) => {
  input?.addEventListener("input", previewCustomColors);
});
fillCustomUiInputs(window.TradeProCore.getCustomUi?.());
Object.values(uiPrefInputs).forEach((input) => {
  input?.addEventListener("input", previewCustomUi);
  input?.addEventListener("change", previewCustomUi);
});
loadWorkspaces();
loadAuditLogs();
