if (window.TradeProCore && window.TradeProCore.hasSession()) {
  window.TradeProCore.ensureAuthenticated().catch(() => {
    window.location = "index.html";
  });
} else if (localStorage.getItem("auth") !== "true" && sessionStorage.getItem("auth") !== "true") {
  window.location = "index.html";
}

const NOTES_STORAGE_KEY = "tp_notes_workspace_v1";
const WORKSPACE_PANEL_IDS = {
  watchlist: "workspacePanelWatchlist",
  "risk-heatmap": "workspacePanelRisk",
  "planning-tools": "workspacePanelPlanning",
  "summary-strip": "workspacePanelSummary"
};

const themePickEl = document.getElementById("themePick");
const workspaceListEl = document.getElementById("workspaceList");
const workspaceImportInputEl = document.getElementById("workspaceImportInput");
const workspaceRenameInputEl = document.getElementById("workspaceRenameInput");
const controlStatusLineEl = document.getElementById("controlStatusLine");
const controlOverviewGridEl = document.getElementById("controlOverviewGrid");
const controlOverviewThemeEl = document.getElementById("controlOverviewTheme");
const controlOverviewHealthEl = document.getElementById("controlOverviewHealth");
const diagnosticsGridEl = document.getElementById("controlDiagnosticsGrid");
const settingsSaveBarEl = document.getElementById("settingsSaveBar");
const settingsSaveTitleEl = document.getElementById("settingsSaveTitle");
const settingsSaveStatusEl = document.getElementById("settingsSaveStatus");
const appearancePresetSelectEl = document.getElementById("appearancePresetSelect");
const appearancePresetNameEl = document.getElementById("appearancePresetName");
const appearancePresetListEl = document.getElementById("appearancePresetList");
const previewDensityValueEl = document.getElementById("previewDensityValue");
const previewMotionValueEl = document.getElementById("previewMotionValue");
const previewShellWidthValueEl = document.getElementById("previewShellWidthValue");

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

const state = {
  activeTab: "appearance",
  preferences: {},
  settings: null,
  user: null,
  session: null,
  workspaces: [],
  activeWorkspaceId: "",
  alerts: { alerts: [], events: [], notificationEmail: "", emailDeliveryReady: false },
  dashboardSummary: null,
  diagnostics: {
    backend: { ok: false, service: "", timestamp: "", error: "" },
    providerHealth: null,
    serviceWorker: "checking"
  },
  broker: { available: false, payload: null, providers: [] },
  paper: { available: false, payload: null },
  dirty: false,
  dirtyTabs: new Set()
};

function createDefaultSettings() {
  return {
    notificationSettings: {
      emailAlerts: true,
      inAppAlerts: true,
      telegramAlerts: false,
      whatsappAlerts: false,
      dailyDigest: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      digestFrequency: "daily",
      defaultCooldown: 300
    },
    marketDataSettings: {
      defaultSymbol: localStorage.getItem("tp_recent_symbol") || "NASDAQ:AAPL",
      defaultTimeframe: "1D",
      autoRefreshMs: 30000,
      staleTolerance: "balanced",
      providerMode: "auto"
    },
    tradingSettings: {
      defaultStrategy: "swing",
      riskPerTradePct: 1,
      stopModel: "atr",
      targetModel: "rr_2",
      feePct: 0.1,
      slippagePct: 0.05
    },
    alertDefaults: {
      logic: "AND",
      cooldownSec: 300,
      templateName: "Default Alert",
      channelInApp: true,
      channelEmail: true,
      channelTelegram: false,
      channelWhatsapp: false
    },
    workspacePresets: {
      landingPage: "dashboard.html",
      defaultDensity: "comfortable",
      dashboardPanels: ["watchlist", "risk-heatmap", "planning-tools"]
    },
    watchlistPreferences: {
      preferredMarket: "auto",
      preferredExchange: "",
      maxRecentSymbols: 20,
      groupByMarket: true,
      syncToServer: true
    },
    aiSettings: {
      mode: "balanced",
      minConfidence: 60,
      preferredTimeframe: "1D",
      fallbackBehavior: "hybrid",
      explainDepth: "brief"
    },
    securitySettings: {
      trustedDevice: false,
      reauthHours: 12
    },
    appearancePresets: []
  };
}

state.settings = createDefaultSettings();

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeSettings(base, extra) {
  const output = Array.isArray(base) ? [...base] : { ...base };
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      output[key] = [...value];
      return;
    }
    if (value && typeof value === "object") {
      output[key] = mergeSettings(output[key] && typeof output[key] === "object" ? output[key] : {}, value);
      return;
    }
    output[key] = value;
  });
  return output;
}

function esc(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}

function byId(id) {
  return document.getElementById(id);
}

function on(id, event, handler) {
  const el = byId(id);
  if (el) el.addEventListener(event, handler);
}

async function apiFetch(path, options = {}) {
  const response = await window.TradeProCore.apiFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function setStatusLine(message, isError = false) {
  if (!controlStatusLineEl) return;
  controlStatusLineEl.textContent = message || "";
  controlStatusLineEl.classList.toggle("bad", Boolean(isError));
}

function renderDiagLine(title, content) {
  console.log(`[Control Center] ${title}: ${content}`);
}

function formatDateTime(ts) {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return "Not available";
  return new Date(value).toLocaleString();
}

function formatMaybeMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return window.TradeProCore?.formatMoney ? window.TradeProCore.formatMoney(n, { digits: 2 }) : `$${n.toFixed(2)}`;
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || "").split(".")[1] || "";
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getStoredRefreshToken() {
  return localStorage.getItem("tp_refresh_token") || sessionStorage.getItem("tp_refresh_token") || "";
}

function getPathValue(source, path) {
  return String(path || "").split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
}

function setPathValue(target, path, value) {
  const keys = String(path || "").split(".");
  let cursor = target;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  });
}

function getPreferenceInputs() {
  return Array.from(document.querySelectorAll("[data-pref-path]"));
}

function collectPreferenceSettings() {
  const next = deepClone(state.settings || createDefaultSettings());
  getPreferenceInputs().forEach((input) => {
    const path = input.getAttribute("data-pref-path");
    if (!path) return;
    let value;
    if (input.type === "checkbox") value = input.checked;
    else if (input.type === "number" || input.dataset.prefKind === "number") value = Number(input.value || 0);
    else value = input.value;
    setPathValue(next, path, value);
  });
  next.workspacePresets.dashboardPanels = Object.entries(WORKSPACE_PANEL_IDS)
    .filter(([, id]) => Boolean(byId(id)?.checked))
    .map(([panel]) => panel);
  next.appearancePresets = Array.isArray(state.settings?.appearancePresets) ? [...state.settings.appearancePresets] : [];
  return next;
}

function fillPreferenceInputs() {
  getPreferenceInputs().forEach((input) => {
    const value = getPathValue(state.settings, input.getAttribute("data-pref-path"));
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = value === undefined || value === null ? "" : String(value);
  });
  Object.entries(WORKSPACE_PANEL_IDS).forEach(([panel, id]) => {
    const input = byId(id);
    if (!input) return;
    input.checked = (state.settings?.workspacePresets?.dashboardPanels || []).includes(panel);
  });
}

function clearDirtyState() {
  state.dirty = false;
  state.dirtyTabs.clear();
  document.querySelectorAll(".control-tab").forEach((tab) => tab.classList.remove("is-dirty"));
  renderSaveBar();
}

function markDirtyFromElement(element) {
  state.dirty = true;
  const tabPanel = element.closest("[data-tab-panel]");
  const tab = tabPanel?.getAttribute("data-tab-panel");
  if (tab) {
    state.dirtyTabs.add(tab);
    document.querySelector(`.control-tab[data-tab="${tab}"]`)?.classList.add("is-dirty");
  }
  renderSaveBar();
}

function renderSaveBar() {
  if (!settingsSaveBarEl) return;
  settingsSaveBarEl.classList.toggle("is-dirty", state.dirty);
  settingsSaveTitleEl.textContent = state.dirty ? "Preferences Pending" : "Preferences Clean";
  settingsSaveStatusEl.textContent = state.dirty
    ? `${state.dirtyTabs.size || 1} section${state.dirtyTabs.size === 1 ? "" : "s"} have unsaved changes.`
    : "No pending preference changes.";
}

function renderTabs() {
  document.querySelectorAll(".control-tab").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-tab") === state.activeTab);
  });
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.getAttribute("data-tab-panel") === state.activeTab);
  });
}

function setupTabs() {
  document.querySelectorAll(".control-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.getAttribute("data-tab") || "appearance";
      renderTabs();
    });
  });
}

function collectCustomColors() {
  const colors = {};
  Object.entries(colorInputMap).forEach(([key, input]) => {
    if (input) colors[key] = String(input.value || "").trim();
  });
  return colors;
}

function fillCustomColorInputs(colors) {
  const palette = colors || window.TradeProCore.getCustomColors?.() || {};
  Object.entries(colorInputMap).forEach(([key, input]) => {
    if (input && palette[key]) input.value = palette[key];
  });
}

function previewCustomColors() {
  window.TradeProCore?.applyCustomColors?.(collectCustomColors(), { persist: false, source: "preview" });
}

function loadCustomColors() {
  fillCustomColorInputs(window.TradeProCore.getCustomColors?.());
  previewCustomColors();
  renderDiagLine("Colors", "Loaded current palette.");
}

function saveCustomColors() {
  window.TradeProCore?.applyCustomColors?.(collectCustomColors(), { persist: true, source: "local" });
  renderDiagLine("Colors", "Saved custom palette.");
}

function resetCustomColors() {
  const palette = window.TradeProCore?.resetCustomColors?.({ persist: true, source: "local" });
  fillCustomColorInputs(palette);
  renderDiagLine("Colors", "Reset custom palette.");
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
  if (previewDensityValueEl) previewDensityValueEl.textContent = prefs.density;
  if (previewMotionValueEl) previewMotionValueEl.textContent = prefs.motion;
  if (previewShellWidthValueEl) previewShellWidthValueEl.textContent = `${prefs.shellWidth}px`;
}

function fillCustomUiInputs(ui) {
  const prefs = ui || window.TradeProCore.getCustomUi?.() || {};
  Object.entries(uiPrefInputs).forEach(([key, input]) => {
    if (input && prefs[key] !== undefined) input.value = String(prefs[key]);
  });
  renderUiPrefValues(prefs);
}

function previewCustomUi() {
  const prefs = collectCustomUi();
  renderUiPrefValues(prefs);
  window.TradeProCore?.applyCustomUi?.(prefs, { persist: false, source: "preview" });
}

function loadCustomUi() {
  fillCustomUiInputs(window.TradeProCore.getCustomUi?.());
  previewCustomUi();
  renderDiagLine("UI", "Loaded interface tuning.");
}

function saveCustomUi() {
  const prefs = collectCustomUi();
  window.TradeProCore?.applyCustomUi?.(prefs, { persist: true, source: "local" });
  renderUiPrefValues(prefs);
  renderDiagLine("UI", "Saved interface tuning.");
}

function resetCustomUi() {
  const prefs = window.TradeProCore?.resetCustomUi?.({ persist: true, source: "local" });
  fillCustomUiInputs(prefs);
  renderDiagLine("UI", "Reset interface tuning.");
}

async function loadTheme() {
  try {
    const data = await apiFetch("/api/theme");
    const theme = String(data.theme || "dark");
    if (themePickEl) themePickEl.value = theme;
    window.TradeProCore.applyTheme(theme);
    byId("themeStatus").textContent = `Loaded ${theme} theme.`;
  } catch (error) {
    byId("themeStatus").textContent = error.message;
  }
}

async function saveTheme() {
  const theme = themePickEl?.value || "dark";
  await window.TradeProCore.setTheme(theme);
  byId("themeStatus").textContent = `Saved ${theme} theme.`;
}

function renderAppearancePresets() {
  const presets = Array.isArray(state.settings?.appearancePresets) ? state.settings.appearancePresets : [];
  if (appearancePresetSelectEl) {
    appearancePresetSelectEl.innerHTML = presets.length
      ? presets.map((preset) => `<option value="${esc(preset.id)}">${esc(preset.name)}</option>`).join("")
      : `<option value="">No presets</option>`;
  }
  if (appearancePresetListEl) {
    appearancePresetListEl.innerHTML = presets.length
      ? presets.map((preset) => `
          <div class="news-item">
            <h4>${esc(preset.name)}</h4>
            <p>Theme ${esc(preset.theme || "dark")} | Saved ${new Date(Number(preset.updatedAt || Date.now())).toLocaleString()}</p>
          </div>
        `).join("")
      : "<p class='brand-sub'>No appearance presets saved yet.</p>";
  }
}

async function saveAppearancePreset() {
  const name = String(appearancePresetNameEl?.value || "").trim();
  if (!name) throw new Error("Enter a preset name");
  const now = Date.now();
  const id = `ap-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || now}`;
  const nextPreset = {
    id,
    name,
    theme: String(themePickEl?.value || "dark"),
    colors: collectCustomColors(),
    ui: collectCustomUi(),
    updatedAt: now
  };
  const current = Array.isArray(state.settings.appearancePresets) ? [...state.settings.appearancePresets] : [];
  const index = current.findIndex((item) => item.id === id);
  if (index >= 0) current[index] = { ...current[index], ...nextPreset };
  else current.unshift(nextPreset);
  state.settings.appearancePresets = current.slice(0, 12);
  renderAppearancePresets();
  await savePreferenceSettings("Appearance preset saved.");
}

function getSelectedAppearancePreset() {
  const selected = String(appearancePresetSelectEl?.value || "");
  return (state.settings.appearancePresets || []).find((item) => item.id === selected) || null;
}

function applyAppearancePreset() {
  const preset = getSelectedAppearancePreset();
  if (!preset) throw new Error("Select a preset to apply");
  if (themePickEl) themePickEl.value = String(preset.theme || "dark");
  window.TradeProCore.applyTheme?.(preset.theme || "dark");
  fillCustomColorInputs(preset.colors || {});
  previewCustomColors();
  fillCustomUiInputs(preset.ui || {});
  previewCustomUi();
  byId("themeStatus").textContent = `Applied preset ${preset.name}. Save theme if you want to sync it to the backend.`;
}

async function deleteAppearancePreset() {
  const preset = getSelectedAppearancePreset();
  if (!preset) throw new Error("Select a preset to delete");
  state.settings.appearancePresets = (state.settings.appearancePresets || []).filter((item) => item.id !== preset.id);
  renderAppearancePresets();
  await savePreferenceSettings("Appearance preset deleted.");
}

function renderWorkspaces() {
  if (!workspaceListEl) return;
  const active = state.activeWorkspaceId;
  workspaceListEl.innerHTML = (state.workspaces || []).map((ws) => `
    <div class="news-item">
      <h4>${esc(ws.name)} ${ws.id === active ? "(Active)" : ""}</h4>
      <p>ID: ${esc(ws.id)} | Updated: ${new Date(Number(ws.updatedAt || Date.now())).toLocaleString()}</p>
      <div class="row" style="margin-top:8px;">
        <button class="btn ghost btn-auto" type="button" data-workspace-action="activate" data-workspace-id="${encodeURIComponent(String(ws.id || ""))}">Activate</button>
        <button class="btn ghost btn-auto" type="button" data-workspace-action="delete" data-workspace-id="${encodeURIComponent(String(ws.id || ""))}">Delete</button>
      </div>
    </div>
  `).join("") || "<p class='brand-sub'>No workspaces yet.</p>";
}

async function loadWorkspaces() {
  const data = await apiFetch("/api/workspaces");
  state.activeWorkspaceId = data.activeWorkspaceId || "";
  state.workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
  renderWorkspaces();
}

async function createWorkspace() {
  const name = String(byId("workspaceName")?.value || "").trim();
  if (!name) throw new Error("Enter a workspace name");
  await apiFetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, layout: { dashboardPanels: ["watchlist", "risk-heatmap", "planning-tools"], density: "comfortable" } })
  });
  await loadWorkspaces();
}

async function activateWorkspace(id) {
  await apiFetch("/api/workspaces/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });
  await loadWorkspaces();
}

async function deleteWorkspace(id) {
  await apiFetch(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadWorkspaces();
}

async function duplicateActiveWorkspace() {
  const active = state.workspaces.find((item) => item.id === state.activeWorkspaceId);
  if (!active) throw new Error("No active workspace to duplicate");
  await apiFetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `${active.name} Copy`, layout: active.layout || {} })
  });
  await loadWorkspaces();
}

async function renameActiveWorkspace() {
  const active = state.workspaces.find((item) => item.id === state.activeWorkspaceId);
  const nextName = String(workspaceRenameInputEl?.value || "").trim();
  if (!active) throw new Error("No active workspace to rename");
  if (!nextName) throw new Error("Enter a new workspace name");
  await apiFetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: active.id, name: nextName, layout: active.layout || {} })
  });
  await loadWorkspaces();
}

async function resetActiveWorkspaceLayout() {
  const active = state.workspaces.find((item) => item.id === state.activeWorkspaceId);
  if (!active) throw new Error("No active workspace found");
  const layout = {
    dashboardPanels: [...(state.settings.workspacePresets.dashboardPanels || ["watchlist", "risk-heatmap", "planning-tools"])],
    density: state.settings.workspacePresets.defaultDensity || "comfortable"
  };
  await apiFetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: active.id, name: active.name, layout })
  });
  byId("workspacePresetStatus").textContent = `Reset ${active.name} to the saved workspace preset.`;
  await loadWorkspaces();
}

function exportWorkspacesJson() {
  const payload = JSON.stringify({
    exportedAt: new Date().toISOString(),
    activeWorkspaceId: state.activeWorkspaceId,
    workspaces: state.workspaces
  }, null, 2);
  if (workspaceImportInputEl) workspaceImportInputEl.value = payload;
  navigator.clipboard?.writeText(payload).catch(() => {});
}

async function importWorkspacesJson() {
  const raw = String(workspaceImportInputEl?.value || "").trim();
  if (!raw) throw new Error("Paste workspace JSON to import");
  const parsed = JSON.parse(raw);
  const workspaces = Array.isArray(parsed) ? parsed : Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
  if (!workspaces.length) throw new Error("No workspaces found in JSON");
  for (const ws of workspaces.slice(0, 20)) {
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
}

function applyImmediatePreferences(settings) {
  localStorage.setItem("tp_recent_symbol", String(settings.marketDataSettings.defaultSymbol || ""));
  localStorage.setItem("tp_stock_strategy", String(settings.tradingSettings.defaultStrategy || "swing"));
  localStorage.setItem("tp_stock_refresh_ms", String(settings.marketDataSettings.autoRefreshMs || 30000));
}

function hydrateSettingsFromPreferences(preferences) {
  const base = createDefaultSettings();
  const merged = mergeSettings(base, {
    notificationSettings: preferences.notificationSettings || {},
    marketDataSettings: preferences.marketDataSettings || {},
    tradingSettings: {
      ...(preferences.tradingSettings || {}),
      defaultStrategy: preferences.defaultStrategy || preferences.tradingSettings?.defaultStrategy || base.tradingSettings.defaultStrategy
    },
    alertDefaults: preferences.alertDefaults || {},
    workspacePresets: preferences.workspacePresets || {},
    watchlistPreferences: preferences.watchlistPreferences || {},
    aiSettings: {
      ...(preferences.aiSettings || {}),
      preferredTimeframe: preferences.defaultAiTf || preferences.aiSettings?.preferredTimeframe || base.aiSettings.preferredTimeframe
    },
    securitySettings: preferences.securitySettings || {},
    appearancePresets: Array.isArray(preferences.appearancePresets) ? preferences.appearancePresets : []
  });
  state.preferences = preferences || {};
  state.settings = merged;
  applyImmediatePreferences(merged);
}

async function savePreferenceSettings(message = "Preferences saved.") {
  const nextSettings = collectPreferenceSettings();
  const payload = {
    defaultStrategy: nextSettings.tradingSettings.defaultStrategy,
    defaultAiTf: nextSettings.aiSettings.preferredTimeframe,
    notificationSettings: nextSettings.notificationSettings,
    marketDataSettings: nextSettings.marketDataSettings,
    tradingSettings: nextSettings.tradingSettings,
    alertDefaults: nextSettings.alertDefaults,
    workspacePresets: nextSettings.workspacePresets,
    watchlistPreferences: nextSettings.watchlistPreferences,
    aiSettings: nextSettings.aiSettings,
    securitySettings: nextSettings.securitySettings,
    appearancePresets: nextSettings.appearancePresets
  };
  const data = await apiFetch("/api/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferences: payload })
  });
  hydrateSettingsFromPreferences(data.preferences || payload);
  fillPreferenceInputs();
  renderAppearancePresets();
  clearDirtyState();
  setStatusLine(message);
}

function discardPreferenceChanges() {
  fillPreferenceInputs();
  clearDirtyState();
  setStatusLine("Preference edits discarded.");
}

function fillAccountDetails() {
  const user = state.user || {};
  const session = state.session || {};
  const accessToken = window.TradeProCore?.getAccessToken?.() || "";
  const payload = decodeJwtPayload(accessToken);
  byId("accountDisplayName").value = user.displayName || "";
  byId("accountEmail").value = user.email || "";
  byId("accountUsername").value = user.username || "";
  byId("accountRole").value = user.role || "user";
  byId("accountProvider").value = user.authProvider || (user.hasPassword ? "password" : "not linked");
  byId("accountCreatedAt").value = formatDateTime(user.createdAt);
  byId("accountLastLoginAt").textContent = formatDateTime(user.lastLoginAt);
  byId("sessionAccessExpiry").textContent = payload?.exp ? new Date(Number(payload.exp) * 1000).toLocaleString() : "Not available";
  byId("sessionRefreshPresent").textContent = getStoredRefreshToken() ? "Present" : "Missing";
  byId("sessionVersionValue").textContent = String(session.tokenVersion || 1);
  byId("notifRecipientEmail").value = state.alerts.notificationEmail || user.email || "";
  byId("notifEmailReady").value = state.alerts.emailDeliveryReady ? "Email delivery ready" : "Email delivery not ready";
  byId("alertCountValue").textContent = String((state.alerts.alerts || []).length);
  byId("alertEventCountValue").textContent = String((state.alerts.events || []).length);
}

async function saveAccountProfile() {
  const displayName = String(byId("accountDisplayName")?.value || "").trim();
  const email = String(byId("accountEmail")?.value || "").trim();
  const data = await apiFetch("/api/auth/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName, email })
  });
  state.user = data.user || state.user;
  fillAccountDetails();
  byId("accountProfileStatus").textContent = "Profile updated.";
}

async function updatePassword() {
  const currentPassword = String(byId("currentPasswordInput")?.value || "");
  const newPassword = String(byId("newPasswordInput")?.value || "");
  const confirmPassword = String(byId("confirmPasswordInput")?.value || "");
  if (newPassword !== confirmPassword) throw new Error("New passwords do not match");
  await apiFetch("/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword })
  });
  byId("passwordStatus").textContent = "Password changed. Sign in again to continue.";
  await window.TradeProCore.logout();
  window.location = "index.html";
}

async function logoutAllSessions() {
  await apiFetch("/api/auth/logout-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  await window.TradeProCore.logout();
  window.location = "index.html";
}

async function forceReauth() {
  await window.TradeProCore.logout();
  window.location = "index.html";
}

async function loadAlerts() {
  state.alerts = await apiFetch("/api/alerts");
  fillAccountDetails();
}

async function sendTestNotification() {
  const data = await apiFetch("/api/notifications/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  byId("notifTestStatus").textContent = `In-app ${data.result?.inApp || "logged"} | Email ${data.result?.email || "disabled"}.`;
}

async function evaluateAlertsNow() {
  const data = await apiFetch("/api/alerts/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  byId("alertEvaluateStatus").textContent = `${Number(data.count || 0)} alerts triggered in this run.`;
  await loadAlerts();
}

async function loadDashboardSummary() {
  state.dashboardSummary = await apiFetch("/api/dashboard/summary");
}

async function pingBackend() {
  const endpoint = `${window.TradeProCore?.API_BASE || ""}/healthz`;
  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    state.diagnostics.backend = {
      ok: Boolean(response.ok && data.ok),
      service: String(data.service || ""),
      timestamp: String(data.timestamp || ""),
      error: response.ok ? "" : `HTTP ${response.status}`
    };
  } catch (error) {
    state.diagnostics.backend = {
      ok: false,
      service: "",
      timestamp: "",
      error: String(error.message || "Ping failed")
    };
  }
}

async function loadProviderDiagnostics() {
  const symbol = encodeURIComponent(state.settings.marketDataSettings.defaultSymbol || "NASDAQ:AAPL");
  try {
    const data = await apiFetch(`/api/symbol/resolve?symbol=${symbol}`);
    state.diagnostics.providerHealth = data.providerHealth || null;
  } catch {
    state.diagnostics.providerHealth = null;
  }
}

async function loadBrokerState() {
  try {
    const [brokerPayload, providersPayload] = await Promise.all([
      apiFetch("/api/broker/sandbox"),
      apiFetch("/api/broker/sandbox/providers")
    ]);
    state.broker = {
      available: true,
      payload: brokerPayload,
      providers: Array.isArray(providersPayload.providers) ? providersPayload.providers : []
    };
  } catch (error) {
    state.broker = { available: false, payload: null, providers: [] };
    byId("brokerStatusLine").textContent = error.message;
  }
}

function renderBrokerState() {
  const broker = state.broker.payload?.broker || {};
  byId("brokerStatusValue").textContent = broker.status || (state.broker.available ? "disconnected" : "disabled");
  byId("brokerProviderValue").textContent = broker.provider || (state.broker.available ? "not connected" : "feature disabled");
  byId("brokerAccountValue").textContent = broker.accountId || "-";
  byId("brokerBuyingPowerValue").textContent = formatMaybeMoney(broker.buyingPower);
  byId("brokerStatusLine").textContent = state.broker.available ? "Broker sandbox ready." : "Broker sandbox is disabled or unavailable.";
  const select = byId("brokerProviderSelect");
  if (select) {
    select.innerHTML = (state.broker.providers || []).length
      ? state.broker.providers.map((provider) => `<option value="${esc(provider.id)}">${esc(provider.label)}</option>`).join("")
      : `<option value="paper-broker">paper-broker</option>`;
    select.value = broker.provider || "paper-broker";
  }
  byId("brokerAccountIdInput").value = broker.accountId || "";
  byId("brokerBuyingPowerInput").value = broker.buyingPower || 100000;
  byId("brokerMaxOrderPctInput").value = broker.maxOrderValuePct || 25;
}

async function connectBroker() {
  const payload = {
    provider: String(byId("brokerProviderSelect")?.value || "paper-broker"),
    accountId: String(byId("brokerAccountIdInput")?.value || "").trim(),
    buyingPower: Number(byId("brokerBuyingPowerInput")?.value || 100000),
    maxOrderValuePct: Number(byId("brokerMaxOrderPctInput")?.value || 25)
  };
  await apiFetch("/api/broker/sandbox/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await loadBrokerState();
  renderBrokerState();
}

async function disconnectBroker() {
  await apiFetch("/api/broker/sandbox/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  await loadBrokerState();
  renderBrokerState();
}

async function syncBroker() {
  await apiFetch("/api/broker/sandbox/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  await loadBrokerState();
  renderBrokerState();
}

async function loadPaperState() {
  try {
    state.paper = { available: true, payload: await apiFetch("/api/paper/summary") };
  } catch (error) {
    state.paper = { available: false, payload: null };
    byId("paperStatusLine").textContent = error.message;
  }
}

function renderPaperState() {
  const summary = state.paper.payload?.summary || {};
  byId("paperEquityValue").textContent = formatMaybeMoney(summary.totalEquity);
  byId("paperCashValue").textContent = formatMaybeMoney(summary.cash);
  byId("paperPositionsValue").textContent = String((state.paper.payload?.positions || []).length);
  byId("paperOrdersValue").textContent = String((state.paper.payload?.openOrders || []).length);
  byId("paperStatusLine").textContent = state.paper.available ? "Paper trading summary loaded." : "Paper trading is disabled or unavailable.";
}

function renderOverview() {
  const summary = state.dashboardSummary || {};
  const user = state.user || {};
  const items = [
    { label: "User", value: user.displayName || user.username || "-" },
    { label: "Workspace", value: state.workspaces.find((item) => item.id === state.activeWorkspaceId)?.name || "None" },
    { label: "Watchlist", value: String(summary.totalWatchlist || 0) },
    { label: "Alerts Today", value: String(summary.alertsTriggeredToday || 0) },
    { label: "Market Feed", value: summary.marketStatus || "unknown" },
    { label: "Theme", value: document.documentElement.getAttribute("data-theme") || themePickEl?.value || "dark" }
  ];
  controlOverviewGridEl.innerHTML = items.map((item) => `
    <div class="control-stat-card">
      <span class="control-stat-label">${esc(item.label)}</span>
      <strong class="control-stat-value">${esc(item.value)}</strong>
    </div>
  `).join("");
  controlOverviewThemeEl.textContent = `Theme ${themePickEl?.value || "dark"}`;
  controlOverviewHealthEl.textContent = state.diagnostics.backend.ok ? "Backend Healthy" : "Backend Degraded";
}

function renderDiagnostics() {
  const health = state.diagnostics.backend;
  const serviceWorkerStatus = state.diagnostics.serviceWorker;
  const providerHealth = state.diagnostics.providerHealth;
  const presetCount = Array.isArray(state.settings?.appearancePresets) ? state.settings.appearancePresets.length : 0;
  const cards = [
    { label: "Backend", value: health.ok ? "Healthy" : "Offline", tone: health.ok ? "good" : "bad" },
    { label: "Service Worker", value: serviceWorkerStatus, tone: /ready|active|controlled/i.test(serviceWorkerStatus) ? "good" : "" },
    { label: "Provider Check", value: providerHealth?.live?.status || state.dashboardSummary?.marketStatus || "unknown", tone: /streaming|available|idle/i.test(providerHealth?.live?.status || "") ? "good" : "" },
    { label: "Appearance Presets", value: String(presetCount), tone: presetCount ? "good" : "" },
    { label: "Broker", value: state.broker.available ? (state.broker.payload?.broker?.status || "ready") : "disabled", tone: state.broker.available ? "" : "bad" },
    { label: "Paper", value: state.paper.available ? "available" : "disabled", tone: state.paper.available ? "good" : "bad" }
  ];
  diagnosticsGridEl.innerHTML = cards.map((card) => `
    <div class="control-diag-card">
      <span class="control-stat-label">${esc(card.label)}</span>
      <strong class="control-stat-value ${esc(card.tone)}">${esc(card.value)}</strong>
    </div>
  `).join("");
  byId("systemApiBase").textContent = window.TradeProCore?.API_BASE || "-";
  byId("systemBackendHealth").textContent = health.ok ? "Healthy" : `Offline${health.error ? ` (${health.error})` : ""}`;
  byId("systemBackendTime").textContent = health.timestamp ? new Date(health.timestamp).toLocaleString() : "-";
  byId("systemProviderHealth").textContent = providerHealth?.live?.status || state.dashboardSummary?.marketStatus || "-";
  byId("systemServiceWorker").textContent = serviceWorkerStatus;
  byId("systemConnectionStatus").textContent = health.ok ? "Backend ping completed." : "Backend ping failed or timed out.";
}

function collectExportBundle() {
  return {
    exportedAt: new Date().toISOString(),
    apiBase: window.TradeProCore?.API_BASE || "",
    user: state.user,
    session: state.session,
    preferences: state.preferences,
    settings: state.settings,
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
    alerts: state.alerts,
    dashboardSummary: state.dashboardSummary,
    diagnostics: state.diagnostics,
    notesSnapshot: (() => {
      try {
        return JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || "null");
      } catch {
        return null;
      }
    })(),
    customColors: window.TradeProCore?.getCustomColors?.(),
    customUi: window.TradeProCore?.getCustomUi?.(),
    theme: document.documentElement.getAttribute("data-theme") || "dark"
  };
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportBundle() {
  downloadJson(`tradepro-control-bundle-${Date.now()}.json`, collectExportBundle());
  byId("exportStatus").textContent = "Exported full bundle.";
}

function exportPreferences() {
  downloadJson(`tradepro-preferences-${Date.now()}.json`, { preferences: state.preferences, settings: state.settings });
  byId("exportStatus").textContent = "Exported preferences.";
}

function exportDiagnostics() {
  downloadJson(`tradepro-diagnostics-${Date.now()}.json`, {
    exportedAt: new Date().toISOString(),
    backend: state.diagnostics.backend,
    providerHealth: state.diagnostics.providerHealth,
    dashboardSummary: state.dashboardSummary,
    serviceWorker: state.diagnostics.serviceWorker
  });
  byId("exportStatus").textContent = "Exported diagnostics.";
}

async function clearCaches() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  byId("storageStatus").textContent = "Browser caches cleared.";
}

function resetLocalUi() {
  window.TradeProCore?.resetCustomColors?.({ persist: true, source: "local" });
  window.TradeProCore?.resetCustomUi?.({ persist: true, source: "local" });
  loadCustomColors();
  loadCustomUi();
  byId("storageStatus").textContent = "Local UI customizations reset.";
}

function clearLocalNotes() {
  localStorage.removeItem(NOTES_STORAGE_KEY);
  byId("storageStatus").textContent = "Local notes snapshot cleared.";
}

function fullLocalReset() {
  const keys = [
    "wishlist",
    "tp_recent_symbol",
    "tp_recent_market_type",
    "tp_stock_strategy",
    "tp_stock_refresh_ms",
    "tp_onboarding_hidden",
    NOTES_STORAGE_KEY,
    "tp_custom_colors",
    "tp_custom_ui",
    "tp_theme"
  ];
  keys.forEach((key) => localStorage.removeItem(key));
  byId("storageStatus").textContent = "Local browser state reset. Auth tokens were kept.";
}

function detectServiceWorkerStatus() {
  if (!("serviceWorker" in navigator)) {
    state.diagnostics.serviceWorker = "unsupported";
    return Promise.resolve();
  }
  return navigator.serviceWorker.getRegistrations().then((registrations) => {
    state.diagnostics.serviceWorker = registrations.length
      ? (navigator.serviceWorker.controller ? "controlled" : "registered")
      : "not registered";
  }).catch(() => {
    state.diagnostics.serviceWorker = "unavailable";
  });
}

async function refreshControlCenter() {
  setStatusLine("Refreshing Control Center...");
  const [profileData, prefsData] = await Promise.all([
    apiFetch("/api/auth/profile"),
    apiFetch("/api/preferences")
  ]);
  state.user = profileData.user || {};
  state.session = profileData.session || {};
  hydrateSettingsFromPreferences(prefsData.preferences || {});
  fillPreferenceInputs();
  renderAppearancePresets();
  await Promise.allSettled([
    loadTheme(),
    loadWorkspaces(),
    loadAlerts(),
    loadDashboardSummary(),
    pingBackend(),
    loadProviderDiagnostics(),
    loadBrokerState(),
    loadPaperState(),
    detectServiceWorkerStatus()
  ]);
  fillAccountDetails();
  renderBrokerState();
  renderPaperState();
  renderOverview();
  renderDiagnostics();
  renderUiPrefValues(collectCustomUi());
  clearDirtyState();
  setStatusLine("Control Center refreshed.");
}

function bindPreferenceInputs() {
  getPreferenceInputs().forEach((input) => {
    input.addEventListener("input", () => markDirtyFromElement(input));
    input.addEventListener("change", () => markDirtyFromElement(input));
  });
  Object.values(WORKSPACE_PANEL_IDS).forEach((id) => {
    const input = byId(id);
    if (!input) return;
    input.addEventListener("change", () => markDirtyFromElement(input));
  });
}

function bindUiPreviewInputs() {
  Object.values(colorInputMap).forEach((input) => {
    input?.addEventListener("input", previewCustomColors);
  });
  Object.values(uiPrefInputs).forEach((input) => {
    input?.addEventListener("input", previewCustomUi);
    input?.addEventListener("change", previewCustomUi);
  });
}

on("settingsSaveBtn", "click", () => savePreferenceSettings().catch((error) => setStatusLine(error.message, true)));
on("settingsDiscardBtn", "click", () => discardPreferenceChanges());
on("controlRefreshBtn", "click", () => refreshControlCenter().catch((error) => setStatusLine(error.message, true)));

on("themeLoadBtn", "click", () => loadTheme().catch((error) => byId("themeStatus").textContent = error.message));
on("themeSaveBtn", "click", () => saveTheme().catch((error) => byId("themeStatus").textContent = error.message));
on("colorsLoadBtn", "click", loadCustomColors);
on("colorsSaveBtn", "click", saveCustomColors);
on("colorsResetBtn", "click", resetCustomColors);
on("uiLoadBtn", "click", loadCustomUi);
on("uiSaveBtn", "click", saveCustomUi);
on("uiResetBtn", "click", resetCustomUi);
on("appearancePresetSaveBtn", "click", () => saveAppearancePreset().catch((error) => setStatusLine(error.message, true)));
on("appearancePresetApplyBtn", "click", () => { try { applyAppearancePreset(); } catch (error) { setStatusLine(error.message, true); } });
on("appearancePresetDeleteBtn", "click", () => deleteAppearancePreset().catch((error) => setStatusLine(error.message, true)));

on("workspaceRefreshBtn", "click", () => loadWorkspaces().catch((error) => setStatusLine(error.message, true)));
on("workspaceCreateBtn", "click", () => createWorkspace().catch((error) => setStatusLine(error.message, true)));
on("workspaceRenameBtn", "click", () => renameActiveWorkspace().catch((error) => setStatusLine(error.message, true)));
on("workspaceDuplicateBtn", "click", () => duplicateActiveWorkspace().catch((error) => setStatusLine(error.message, true)));
on("workspaceResetLayoutBtn", "click", () => resetActiveWorkspaceLayout().catch((error) => setStatusLine(error.message, true)));
on("workspaceExportBtn", "click", exportWorkspacesJson);
on("workspaceImportBtn", "click", () => importWorkspacesJson().catch((error) => setStatusLine(error.message, true)));

on("accountProfileSaveBtn", "click", () => saveAccountProfile().catch((error) => byId("accountProfileStatus").textContent = error.message));
on("passwordChangeBtn", "click", () => updatePassword().catch((error) => byId("passwordStatus").textContent = error.message));
on("logoutAllBtn", "click", () => logoutAllSessions().catch((error) => byId("securityStatus").textContent = error.message));
on("forceReauthBtn", "click", () => forceReauth().catch((error) => byId("securityStatus").textContent = error.message));
on("securityRefreshBtn", "click", () => refreshControlCenter().catch((error) => byId("securityStatus").textContent = error.message));

on("notifTestBtn", "click", () => sendTestNotification().catch((error) => byId("notifTestStatus").textContent = error.message));
on("alertEvaluateBtn", "click", () => evaluateAlertsNow().catch((error) => byId("alertEvaluateStatus").textContent = error.message));

on("brokerRefreshBtn", "click", () => loadBrokerState().then(renderBrokerState).catch((error) => byId("brokerStatusLine").textContent = error.message));
on("brokerConnectBtn", "click", () => connectBroker().catch((error) => byId("brokerStatusLine").textContent = error.message));
on("brokerDisconnectBtn", "click", () => disconnectBroker().catch((error) => byId("brokerStatusLine").textContent = error.message));
on("brokerSyncBtn", "click", () => syncBroker().catch((error) => byId("brokerStatusLine").textContent = error.message));

on("systemPingBtn", "click", () => pingBackend().then(renderDiagnostics).catch((error) => byId("systemConnectionStatus").textContent = error.message));
on("systemRefreshBtn", "click", () => refreshControlCenter().catch((error) => byId("systemConnectionStatus").textContent = error.message));
on("paperRefreshBtn", "click", () => loadPaperState().then(renderPaperState).catch((error) => byId("paperStatusLine").textContent = error.message));
on("exportBundleBtn", "click", exportBundle);
on("exportPrefsBtn", "click", exportPreferences);
on("exportDiagnosticsBtn", "click", exportDiagnostics);
on("storageClearCachesBtn", "click", () => clearCaches().catch((error) => byId("storageStatus").textContent = error.message));
on("storageClearUiBtn", "click", resetLocalUi);
on("storageClearNotesBtn", "click", clearLocalNotes);
on("storageFullResetBtn", "click", fullLocalReset);

workspaceListEl?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-workspace-action]");
  if (!button) return;
  const action = button.getAttribute("data-workspace-action");
  const workspaceId = decodeURIComponent(button.getAttribute("data-workspace-id") || "");
  if (!workspaceId) return;
  if (action === "activate") {
    activateWorkspace(workspaceId).catch((error) => setStatusLine(error.message, true));
    return;
  }
  if (action === "delete") {
    deleteWorkspace(workspaceId).catch((error) => setStatusLine(error.message, true));
  }
});

setupTabs();
bindPreferenceInputs();
bindUiPreviewInputs();
fillCustomColorInputs(window.TradeProCore?.getCustomColors?.());
fillCustomUiInputs(window.TradeProCore?.getCustomUi?.());
renderSaveBar();
refreshControlCenter().catch((error) => setStatusLine(error.message, true));
