(function () {
  function resolveApiBase() {
    const configuredBase = String(
      window.TRADEPRO_CONFIG?.API_BASE ||
      localStorage.getItem("tp_api_base") ||
      document.querySelector('meta[name="tradepro-api-base"]')?.content ||
      ""
    ).trim();

    if (configuredBase) {
      const isLocalPage = ["localhost", "127.0.0.1"].includes(window.location.hostname);
      const pointsToHostedBackend = /onrender\.com$/i.test(new URL(configuredBase, window.location.href).hostname);
      if (!(isLocalPage && pointsToHostedBackend)) {
        return configuredBase.replace(/\/+$/, "");
      }
    }

    const hostname = String(window.location.hostname || "").toLowerCase();
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
    const currentPort = String(window.location.port || "");
    if (isLocalHost) {
      if (currentPort === "3000" || currentPort === "3012") {
        return window.location.origin.replace(/\/+$/, "");
      }
      return "http://localhost:3000";
    }

    return "https://tradingcopy-0p0k.onrender.com";
  }

  const API_BASE = resolveApiBase();
  const ACCESS_KEY = "tp_access_token";
  const REFRESH_KEY = "tp_refresh_token";
  const USER_KEY = "tp_user";
  const THEME_KEY = "tp_theme";
  const CUSTOM_COLORS_KEY = "tp_custom_colors";
  const CUSTOM_UI_KEY = "tp_custom_ui";
  const RELOAD_MARKER_KEY = "tp_pending_reload";
  const DEFAULT_CURRENCY = "USD";
  const CUSTOM_COLOR_DEFAULTS = {
    bg0: "#07111f",
    bg1: "#0f1c30",
    bg2: "#17263f",
    card: "#091222",
    cardStrong: "#0d182c",
    line: "#8aacd6",
    lineStrong: "#85c0ff",
    text: "#edf3ff",
    muted: "#92a8c8",
    accent: "#65c3ff",
    accent2: "#ffd07a",
    accent3: "#83f0d0"
  };
  const CUSTOM_COLOR_VAR_MAP = {
    bg0: "--bg-0",
    bg1: "--bg-1",
    bg2: "--bg-2",
    card: "--card",
    cardStrong: "--card-strong",
    line: "--line",
    lineStrong: "--line-strong",
    text: "--text",
    muted: "--muted",
    accent: "--accent",
    accent2: "--accent-2",
    accent3: "--accent-3"
  };
  const CUSTOM_UI_DEFAULTS = {
    density: "comfortable",
    motion: "full",
    panelRadius: 28,
    cardRadius: 24,
    inputRadius: 16,
    blur: 18,
    shellWidth: 1680
  };
  let reloadScheduled = false;
  const IS_AUTH_PAGE = /\/?(index\.html)?$/i.test(window.location.pathname);

  function readStorage(key) {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  }

  function writeStorage(key, value, persist) {
    const target = persist ? localStorage : sessionStorage;
    const secondary = persist ? sessionStorage : localStorage;
    if (value === null || value === undefined || value === "") {
      target.removeItem(key);
      secondary.removeItem(key);
      return;
    }
    target.setItem(key, String(value));
    secondary.removeItem(key);
  }

  function setSession(tokens, persist) {
    writeStorage(ACCESS_KEY, tokens.accessToken, persist);
    writeStorage(REFRESH_KEY, tokens.refreshToken, persist);
  }

  function getAccessToken() {
    return readStorage(ACCESS_KEY);
  }

  function clearSession() {
    writeStorage(ACCESS_KEY, "", true);
    writeStorage(REFRESH_KEY, "", true);
    writeStorage(USER_KEY, "", true);
    localStorage.removeItem("auth");
    sessionStorage.removeItem("auth");
  }

  function markLegacyAuth(persist) {
    if (persist) localStorage.setItem("auth", "true");
    else sessionStorage.setItem("auth", "true");
  }

  async function parseApiError(response, fallbackMessage) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (payload && payload.error) return String(payload.error);
    if (response.status === 404) {
      return `Auth service not found at ${API_BASE}. Start backend server or check port.`;
    }
    return fallbackMessage;
  }

  async function login(username, password, persist) {
    let response;
    try {
      response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
    } catch {
      throw new Error(`Cannot reach backend at ${API_BASE}.`);
    }
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Login failed"));
    }
    const data = await response.json();
    setSession(data, persist);
    writeStorage(USER_KEY, JSON.stringify(data.user || {}), persist);
    markLegacyAuth(persist);
    return data;
  }

  async function socialLogin(provider, idToken, persist) {
    let response;
    try {
      response = await fetch(`${API_BASE}/api/auth/social`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, idToken })
      });
    } catch {
      throw new Error(`Cannot reach backend at ${API_BASE}.`);
    }
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Social login failed"));
    }
    const data = await response.json();
    setSession(data, persist);
    writeStorage(USER_KEY, JSON.stringify(data.user || {}), persist);
    markLegacyAuth(persist);
    return data;
  }

  async function register(displayName, username, password, persist) {
    let response;
    try {
      response = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, username, password })
      });
    } catch {
      throw new Error(`Cannot reach backend at ${API_BASE}.`);
    }
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Registration failed"));
    }
    const data = await response.json();
    setSession(data, persist);
    writeStorage(USER_KEY, JSON.stringify(data.user || {}), persist);
    markLegacyAuth(persist);
    return data;
  }

  async function refreshAccessToken() {
    const refreshToken = readStorage(REFRESH_KEY);
    if (!refreshToken) throw new Error("No refresh token");

    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!response.ok) {
      clearSession();
      throw new Error("Session expired");
    }
    const data = await response.json();
    const persist = Boolean(localStorage.getItem(REFRESH_KEY));
    writeStorage(ACCESS_KEY, data.accessToken, persist);
    markLegacyAuth(persist);
    return data.accessToken;
  }

  async function apiFetch(endpoint, options) {
    const requestOptions = options ? { ...options } : {};
    requestOptions.headers = { ...(requestOptions.headers || {}) };
    let accessToken = readStorage(ACCESS_KEY);

    if (!accessToken && readStorage(REFRESH_KEY)) {
      accessToken = await refreshAccessToken();
    }

    if (accessToken) {
      requestOptions.headers.Authorization = `Bearer ${accessToken}`;
    }

    let response = await fetch(`${API_BASE}${endpoint}`, requestOptions);
    if (response.status === 401 && readStorage(REFRESH_KEY)) {
      accessToken = await refreshAccessToken();
      requestOptions.headers.Authorization = `Bearer ${accessToken}`;
      response = await fetch(`${API_BASE}${endpoint}`, requestOptions);
    }
    return response;
  }

  async function ensureAuthenticated() {
    const accessToken = readStorage(ACCESS_KEY);
    const refreshToken = readStorage(REFRESH_KEY);
    if (!accessToken && !refreshToken) throw new Error("No active session");

    const response = await apiFetch("/api/auth/me");
    if (!response.ok) {
      if (response.status === 401) {
        clearSession();
        throw new Error("Authentication failed");
      }
      throw new Error(`Auth check failed (${response.status})`);
    }
    const data = await response.json();
    if (data && data.user) {
      const persist = Boolean(localStorage.getItem(REFRESH_KEY) || localStorage.getItem(ACCESS_KEY) || localStorage.getItem(USER_KEY));
      writeStorage(USER_KEY, JSON.stringify(data.user || {}), persist);
    }
    return data;
  }

  async function logout() {
    const refreshToken = readStorage(REFRESH_KEY);
    try {
      if (refreshToken) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken })
        });
      }
    } catch {
      // Best effort only.
    } finally {
      clearSession();
    }
  }

  function getUser() {
    try {
      return JSON.parse(readStorage(USER_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function normalizeHexColor(value, fallback = "") {
    const raw = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
    if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toUpperCase()}`;
    return fallback;
  }

  function normalizeCustomColors(input) {
    const source = input && typeof input === "object" ? input : {};
    const next = {};
    for (const [key, fallback] of Object.entries(CUSTOM_COLOR_DEFAULTS)) {
      const value = normalizeHexColor(source[key], fallback);
      next[key] = value || fallback;
    }
    return next;
  }

  function readCustomColors() {
    try {
      const raw = localStorage.getItem(CUSTOM_COLORS_KEY);
      if (!raw) return null;
      return normalizeCustomColors(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function applyCustomColors(colors, options = {}) {
    const palette = normalizeCustomColors(colors);
    const root = document.documentElement;
    for (const [key, cssVar] of Object.entries(CUSTOM_COLOR_VAR_MAP)) {
      root.style.setProperty(cssVar, palette[key]);
    }
    if (options.persist !== false) {
      localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(palette));
    }
    if (options.emit !== false) {
      window.dispatchEvent(new CustomEvent("tp:colors-changed", {
        detail: { colors: { ...palette }, source: String(options.source || "local") }
      }));
    }
    return palette;
  }

  function resetCustomColors(options = {}) {
    const root = document.documentElement;
    Object.values(CUSTOM_COLOR_VAR_MAP).forEach((cssVar) => {
      root.style.removeProperty(cssVar);
    });
    if (options.persist !== false) {
      localStorage.removeItem(CUSTOM_COLORS_KEY);
    }
    const palette = { ...CUSTOM_COLOR_DEFAULTS };
    if (options.emit !== false) {
      window.dispatchEvent(new CustomEvent("tp:colors-changed", {
        detail: { colors: palette, source: String(options.source || "local"), reset: true }
      }));
    }
    return palette;
  }

  function hydrateCustomColors() {
    const stored = readCustomColors();
    if (!stored) return { ...CUSTOM_COLOR_DEFAULTS };
    return applyCustomColors(stored, { persist: false, emit: false, source: "hydrate" });
  }

  function getCustomColors() {
    return normalizeCustomColors(readCustomColors() || CUSTOM_COLOR_DEFAULTS);
  }

  function normalizeUiPreferenceNumber(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function normalizeCustomUi(input) {
    const source = input && typeof input === "object" ? input : {};
    const density = ["compact", "comfortable", "spacious"].includes(String(source.density || ""))
      ? String(source.density)
      : CUSTOM_UI_DEFAULTS.density;
    const motion = ["full", "reduced", "off"].includes(String(source.motion || ""))
      ? String(source.motion)
      : CUSTOM_UI_DEFAULTS.motion;
    return {
      density,
      motion,
      panelRadius: normalizeUiPreferenceNumber(source.panelRadius, CUSTOM_UI_DEFAULTS.panelRadius, 12, 40),
      cardRadius: normalizeUiPreferenceNumber(source.cardRadius, CUSTOM_UI_DEFAULTS.cardRadius, 10, 34),
      inputRadius: normalizeUiPreferenceNumber(source.inputRadius, CUSTOM_UI_DEFAULTS.inputRadius, 8, 28),
      blur: normalizeUiPreferenceNumber(source.blur, CUSTOM_UI_DEFAULTS.blur, 0, 28),
      shellWidth: normalizeUiPreferenceNumber(source.shellWidth, CUSTOM_UI_DEFAULTS.shellWidth, 1180, 1880)
    };
  }

  function readCustomUi() {
    try {
      const raw = localStorage.getItem(CUSTOM_UI_KEY);
      if (!raw) return null;
      return normalizeCustomUi(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function applyCustomUi(uiPrefs, options = {}) {
    const prefs = normalizeCustomUi(uiPrefs);
    const root = document.documentElement;
    root.dataset.density = prefs.density;
    root.dataset.motion = prefs.motion;
    root.style.setProperty("--ui-radius-panel", `${prefs.panelRadius}px`);
    root.style.setProperty("--ui-radius-card", `${prefs.cardRadius}px`);
    root.style.setProperty("--ui-radius-input", `${prefs.inputRadius}px`);
    root.style.setProperty("--ui-blur-glass", `${prefs.blur}px`);
    root.style.setProperty("--ui-shell-width", `${prefs.shellWidth}px`);
    if (options.persist !== false) {
      localStorage.setItem(CUSTOM_UI_KEY, JSON.stringify(prefs));
    }
    if (options.emit !== false) {
      window.dispatchEvent(new CustomEvent("tp:ui-changed", {
        detail: { ui: { ...prefs }, source: String(options.source || "local") }
      }));
    }
    return prefs;
  }

  function resetCustomUi(options = {}) {
    const root = document.documentElement;
    delete root.dataset.density;
    delete root.dataset.motion;
    ["--ui-radius-panel", "--ui-radius-card", "--ui-radius-input", "--ui-blur-glass", "--ui-shell-width"].forEach((cssVar) => {
      root.style.removeProperty(cssVar);
    });
    if (options.persist !== false) {
      localStorage.removeItem(CUSTOM_UI_KEY);
    }
    const prefs = { ...CUSTOM_UI_DEFAULTS };
    if (options.emit !== false) {
      window.dispatchEvent(new CustomEvent("tp:ui-changed", {
        detail: { ui: prefs, source: String(options.source || "local"), reset: true }
      }));
    }
    return prefs;
  }

  function hydrateCustomUi() {
    const stored = readCustomUi();
    if (!stored) return { ...CUSTOM_UI_DEFAULTS };
    return applyCustomUi(stored, { persist: false, emit: false, source: "hydrate" });
  }

  function getCustomUi() {
    return normalizeCustomUi(readCustomUi() || CUSTOM_UI_DEFAULTS);
  }

  function ensureGlobalLoader() {
    if (!document.body) return null;
    let styleTag = document.getElementById("tp-global-loader-style");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "tp-global-loader-style";
      styleTag.textContent = `
        .tp-global-loader {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: none;
          align-items: center;
          justify-content: center;
          background: rgba(8, 16, 30, 0.35);
          backdrop-filter: blur(6px);
        }
        .tp-global-loader.show {
          display: flex;
        }
        .tp-global-loader-card {
          min-width: 220px;
          max-width: min(92vw, 420px);
          border: 1px solid rgba(122, 180, 255, 0.32);
          border-radius: 14px;
          background: rgba(10, 20, 38, 0.9);
          color: #e8f0ff;
          padding: 16px 18px;
          text-align: center;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
        }
        .tp-global-loader-spinner {
          width: 34px;
          height: 34px;
          margin: 2px auto 10px;
          border: 3px solid rgba(122, 180, 255, 0.3);
          border-top-color: #57b6ff;
          border-radius: 50%;
          animation: tpLoaderSpin 0.8s linear infinite;
        }
        .tp-global-loader-text {
          font-size: 14px;
          letter-spacing: 0.2px;
        }
        .tp-hard-refresh-btn.tp-inline {
          white-space: nowrap;
        }
        .tp-hard-refresh-btn.tp-fallback {
          position: fixed;
          right: 12px;
          top: 12px;
          z-index: 99950;
          border: 1px solid rgba(122, 180, 255, 0.42);
          border-radius: 999px;
          background: rgba(10, 20, 38, 0.9);
          color: #e8f0ff;
          min-height: 34px;
          padding: 7px 10px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.2px;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
        }
        @keyframes tpLoaderSpin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(styleTag);
    }

    let overlay = document.getElementById("tp-global-loader");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "tp-global-loader";
      overlay.className = "tp-global-loader";
      overlay.innerHTML = `
        <div class="tp-global-loader-card" role="status" aria-live="polite" aria-label="Loading">
          <div class="tp-global-loader-spinner"></div>
          <div class="tp-global-loader-text" id="tp-global-loader-text">Loading...</div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function showGlobalLoader(text) {
    const overlay = ensureGlobalLoader();
    if (!overlay) return;
    const textEl = document.getElementById("tp-global-loader-text");
    if (textEl) textEl.textContent = text || "Loading...";
    overlay.classList.add("show");
  }

  function hideGlobalLoader() {
    const overlay = document.getElementById("tp-global-loader");
    if (overlay) overlay.classList.remove("show");
  }

  async function hardRefreshNow() {
    if (reloadScheduled) return;
    reloadScheduled = true;
    try {
      sessionStorage.setItem(RELOAD_MARKER_KEY, JSON.stringify({ reason: "hard-refresh", ts: Date.now() }));
    } catch {
      // Ignore storage errors.
    }
    showGlobalLoader("Hard refreshing...");
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // Ignore cache clear errors.
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("_r");
    nextUrl.searchParams.delete("_hr");
    nextUrl.searchParams.set("_hr", String(Date.now()));
    setTimeout(() => {
      window.location.replace(nextUrl.toString());
    }, 180);
  }

  function injectHardRefreshButton() {
    if (!document.body) return;
    let btn = document.getElementById("tp-hard-refresh-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "tp-hard-refresh-btn";
      btn.type = "button";
      btn.textContent = "Hard Refresh";
      btn.setAttribute("aria-label", "Hard Refresh (Ctrl+F5)");
      btn.title = "Hard Refresh (Ctrl+F5)";
      btn.addEventListener("click", () => {
        btn.disabled = true;
        btn.textContent = "Refreshing...";
        hardRefreshNow().catch(() => {
          window.location.reload();
        });
      });
    }

    const existingActions = document.querySelector(".page-head .page-actions");
    if (existingActions) {
      btn.className = "btn ghost btn-auto tp-hard-refresh-btn tp-inline";
      existingActions.prepend(btn);
      return;
    }

    const pageHead = document.querySelector(".page-head");
    if (pageHead) {
      let actions = pageHead.querySelector(".page-actions");
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "page-actions";
        pageHead.appendChild(actions);
      }
      btn.className = "btn ghost btn-auto tp-hard-refresh-btn tp-inline";
      actions.prepend(btn);
      return;
    }

    btn.className = "tp-hard-refresh-btn tp-fallback";
    if (!btn.parentElement) {
      document.body.appendChild(btn);
    }
  }

  function installHardRefreshShortcut() {
    window.addEventListener("keydown", (event) => {
      const key = String(event.key || "").toLowerCase();
      const trigger = (event.ctrlKey && key === "f5") || (event.ctrlKey && event.shiftKey && key === "r");
      if (!trigger) return;
      event.preventDefault();
      hardRefreshNow().catch(() => {
        window.location.reload();
      });
    });
  }

  function forceReloadWithLoader(reason) {
    if (reloadScheduled) return;
    reloadScheduled = true;
    const label = reason === "theme" ? "Applying theme..." : "Refreshing page...";
    try {
      sessionStorage.setItem(RELOAD_MARKER_KEY, JSON.stringify({ reason, ts: Date.now() }));
    } catch {
      // Ignore storage errors.
    }
    showGlobalLoader(label);
    setTimeout(() => {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("_r", String(Date.now()));
      window.location.replace(nextUrl.toString());
    }, 240);
  }

  function bootPendingReloadOverlay() {
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(RELOAD_MARKER_KEY) || "null");
    } catch {
      pending = null;
    }
    if (!pending || typeof pending !== "object") return;

    const now = Date.now();
    if (!Number.isFinite(Number(pending.ts)) || now - Number(pending.ts) > 7000) {
      sessionStorage.removeItem(RELOAD_MARKER_KEY);
      return;
    }

    const label = pending.reason === "theme"
      ? "Theme updated. Reloading..."
      : "Loading...";
    const show = () => showGlobalLoader(label);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", show, { once: true });
    } else {
      show();
    }

    const clear = () => {
      setTimeout(() => {
        hideGlobalLoader();
        sessionStorage.removeItem(RELOAD_MARKER_KEY);
      }, 320);
    };
    if (document.readyState === "complete") clear();
    else window.addEventListener("load", clear, { once: true });
  }

  function convertFromUSD(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return Number.NaN;
    return n;
  }

  function formatMoney(value, options = {}) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    const digits = Number.isFinite(Number(options.digits)) ? Number(options.digits) : 2;
    const converted = convertFromUSD(n);
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: DEFAULT_CURRENCY,
        maximumFractionDigits: digits
      }).format(converted);
    } catch {
      return `${DEFAULT_CURRENCY} ${converted.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
    }
  }

  function applyTheme(theme) {
    const safeTheme = ["dark", "light", "neon"].includes(String(theme || "").toLowerCase())
      ? String(theme || "").toLowerCase()
      : "dark";
    document.documentElement.setAttribute("data-theme", safeTheme);
    localStorage.setItem(THEME_KEY, safeTheme);
    return safeTheme;
  }

  async function setTheme(theme) {
    const safeTheme = applyTheme(theme);
    if (!hasSession()) {
      window.dispatchEvent(new CustomEvent("tp:theme-changed", { detail: { theme: safeTheme, source: "local" } }));
      return safeTheme;
    }
    try {
      await apiFetch("/api/theme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: safeTheme })
      });
    } catch (error) {
      console.log("Theme sync warning:", error.message);
    }
    window.dispatchEvent(new CustomEvent("tp:theme-changed", { detail: { theme: safeTheme, source: "local" } }));
    return safeTheme;
  }

  async function hydrateTheme() {
    const cached = localStorage.getItem(THEME_KEY);
    if (cached) applyTheme(cached);
    if (!hasSession()) return;
    try {
      const response = await apiFetch("/api/theme");
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.theme) applyTheme(data.theme);
    } catch (error) {
      console.log("Theme hydrate warning:", error.message);
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js?v=20260228a").catch((error) => {
        console.log("SW register warning:", error.message);
      });
    });
  }

  function hasSession() {
    return Boolean(readStorage(ACCESS_KEY) || readStorage(REFRESH_KEY));
  }

  window.TradeProCore = {
    API_BASE,
    login,
    register,
    socialLogin,
    logout,
    apiFetch,
    ensureAuthenticated,
    getUser,
    getAccessToken,
    hasSession,
    applyTheme,
    setTheme,
    hydrateTheme,
    applyCustomColors,
    resetCustomColors,
    hydrateCustomColors,
    getCustomColors,
    applyCustomUi,
    resetCustomUi,
    hydrateCustomUi,
    getCustomUi,
    registerServiceWorker,
    formatMoney,
    convertFromUSD
  };

  window.addEventListener("storage", (event) => {
    if (event.key === THEME_KEY) {
      const nextTheme = String(event.newValue || "dark");
      applyTheme(nextTheme);
      window.dispatchEvent(new CustomEvent("tp:theme-changed", { detail: { theme: nextTheme, source: "storage" } }));
      return;
    }
    if (event.key === CUSTOM_COLORS_KEY) {
      if (!event.newValue) {
        resetCustomColors({ persist: false, source: "storage" });
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue);
        applyCustomColors(parsed, { persist: false, source: "storage" });
      } catch {
        resetCustomColors({ persist: false, source: "storage" });
      }
      return;
    }
    if (event.key === CUSTOM_UI_KEY) {
      if (!event.newValue) {
        resetCustomUi({ persist: false, source: "storage" });
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue);
        applyCustomUi(parsed, { persist: false, source: "storage" });
      } catch {
        resetCustomUi({ persist: false, source: "storage" });
      }
    }
  });

  window.addEventListener("tp:theme-changed", (event) => {
    const source = String(event?.detail?.source || "local");
    if (source !== "local" && source !== "storage") return;
    forceReloadWithLoader("theme");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      ensureGlobalLoader();
      injectHardRefreshButton();
    }, { once: true });
  } else {
    ensureGlobalLoader();
    injectHardRefreshButton();
  }
  installHardRefreshShortcut();
  bootPendingReloadOverlay();
  hydrateTheme();
  hydrateCustomColors();
  hydrateCustomUi();
  if (!IS_AUTH_PAGE) {
    registerServiceWorker();
  }
})();
