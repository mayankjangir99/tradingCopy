function switchAuthMode(mode) {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const loginTabBtn = document.getElementById("loginTabBtn");
  const registerTabBtn = document.getElementById("registerTabBtn");

  const showLogin = mode !== "register";
  loginForm.classList.toggle("auth-hidden", !showLogin);
  registerForm.classList.toggle("auth-hidden", showLogin);
  loginTabBtn.classList.toggle("active", showLogin);
  registerTabBtn.classList.toggle("active", !showLogin);
  loginTabBtn.setAttribute("aria-selected", String(showLogin));
  registerTabBtn.setAttribute("aria-selected", String(!showLogin));
}

function getToastStack() {
  let stack = document.querySelector(".toast-stack");
  if (stack) return stack;
  stack = document.createElement("div");
  stack.className = "toast-stack";
  document.body.appendChild(stack);
  return stack;
}

function showToast(message, type) {
  const stack = getToastStack();
  const toast = document.createElement("div");
  toast.className = `toast ${type || "error"}`;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3400);
}

function clearFieldError(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.removeAttribute("aria-invalid");
  const next = input.parentElement ? input.parentElement.querySelector(".field-error") : null;
  if (next) next.remove();
}

function setFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  if (!input) return;
  clearFieldError(inputId);
  input.setAttribute("aria-invalid", "true");
  const error = document.createElement("div");
  error.className = "field-error";
  error.textContent = message;
  if (input.parentElement) input.parentElement.appendChild(error);
}

function validateRegisterFields(username, password) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_.-]{2,23}$/.test(normalized)) {
    return "Username must start with a letter and be 3-24 characters.";
  }
  if (String(password || "").length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return "";
}

let firebaseBooted = false;
let firebaseLoadPromise = null;
let authSlowTimer = null;

function setAuthStatus(message, type = "info") {
  const status = document.getElementById("authStatus");
  if (!status) return;
  status.textContent = message || "";
  status.classList.remove("good", "bad");
  if (type === "success") status.classList.add("good");
  if (type === "error") status.classList.add("bad");
}

function startAuthSlowTimer(message = "Backend is taking longer than usual. Still trying...") {
  clearTimeout(authSlowTimer);
  authSlowTimer = window.setTimeout(() => {
    setAuthStatus(message, "error");
  }, 5000);
}

function stopAuthSlowTimer() {
  clearTimeout(authSlowTimer);
  authSlowTimer = null;
}

function setButtonBusy(button, busy, busyLabel) {
  if (!button) return;
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent || "";
  }
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function ensureFirebaseSdkLoaded() {
  if (firebaseLoadPromise) return firebaseLoadPromise;
  firebaseLoadPromise = (async () => {
    await loadScript("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
    await loadScript("https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js");
    await loadScript("firebase-config.js?v=20260228a");
  })();
  return firebaseLoadPromise;
}

async function ensureFirebaseReady() {
  await ensureFirebaseSdkLoaded();
  if (firebaseBooted) return firebase.auth();
  if (typeof firebase === "undefined") {
    throw new Error("Firebase SDK not loaded.");
  }
  const cfg = window.TRADEPRO_FIREBASE_CONFIG || {};
  if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId) {
    throw new Error("Missing firebase-config.js values.");
  }
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(cfg);
  }
  firebaseBooted = true;
  return firebase.auth();
}

async function exchangeSocialToken(provider, idToken, persist) {
  if (!window.TradeProCore || typeof window.TradeProCore.socialLogin !== "function") {
    throw new Error("Backend social login API is unavailable.");
  }
  await window.TradeProCore.socialLogin(provider, idToken, persist);
}

async function socialLogin(provider) {
  const remember = document.getElementById("remember");
  const persist = Boolean(remember && remember.checked);
  const button = document.querySelector(`.oauth-btn[onclick="socialLogin('${provider}')"]`);

  try {
    setButtonBusy(button, true, "Connecting...");
    setAuthStatus("Opening secure sign-in window...");
    startAuthSlowTimer("Google login is taking longer than usual. Check popup blocking if nothing opens.");
    const auth = await ensureFirebaseReady();
    let oauthProvider;

    if (provider === "google") {
      oauthProvider = new firebase.auth.GoogleAuthProvider();
      oauthProvider.addScope("email");
      oauthProvider.addScope("profile");
    } else if (provider === "apple") {
      oauthProvider = new firebase.auth.OAuthProvider("apple.com");
      oauthProvider.addScope("email");
      oauthProvider.addScope("name");
    } else {
      throw new Error("Unsupported provider.");
    }

    const result = await auth.signInWithPopup(oauthProvider);
    const idToken = await result.user.getIdToken();
    await exchangeSocialToken(provider, idToken, persist);
    stopAuthSlowTimer();
    setAuthStatus("Login successful. Redirecting...", "success");
    showToast("Login successful. Redirecting...", "success");
    window.location = "dashboard.html";
  } catch (error) {
    stopAuthSlowTimer();
    const message = String(error && error.message ? error.message : "Social login failed.");
    setAuthStatus(message, "error");
    showToast(message, "error");
  } finally {
    setButtonBusy(button, false);
  }
}

async function login(event) {
  if (event) event.preventDefault();

  const username = document.getElementById("user").value.trim();
  const password = document.getElementById("pass").value;
  const remember = document.getElementById("remember");
  const persist = Boolean(remember && remember.checked);
  const submitButton = document.querySelector('#loginForm button[type="submit"]');

  try {
    clearFieldError("user");
    clearFieldError("pass");
    setButtonBusy(submitButton, true, "Signing in...");
    setAuthStatus("Signing in...");
    startAuthSlowTimer();
    if (!window.TradeProCore || typeof window.TradeProCore.login !== "function") {
      throw new Error("Login API is unavailable");
    }
    await window.TradeProCore.login(username, password, persist);
    stopAuthSlowTimer();
    setAuthStatus("Login successful. Redirecting...", "success");
    showToast("Login successful. Redirecting...", "success");
    window.location = "dashboard.html";
    return;
  } catch (error) {
    stopAuthSlowTimer();
    setFieldError("user", "Invalid username or password.");
    setFieldError("pass", "Invalid username or password.");
    const msg = String(error && error.message ? error.message : "Login failed.");
    setAuthStatus(msg, "error");
    showToast(`Login failed: ${msg}`, "error");
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function registerUser(event) {
  if (event) event.preventDefault();

  const displayName = document.getElementById("newDisplayName").value.trim();
  const username = document.getElementById("newUser").value.trim();
  const password = document.getElementById("newPass").value;
  const confirmPassword = document.getElementById("confirmPass").value;
  const persist = Boolean(document.getElementById("registerRemember")?.checked);
  const submitButton = document.querySelector('#registerForm button[type="submit"]');

  if (password !== confirmPassword) {
    clearFieldError("confirmPass");
    setFieldError("confirmPass", "Passwords do not match.");
    showToast("Passwords do not match.", "error");
    return;
  }
  const inputError = validateRegisterFields(username, password);
  if (inputError) {
    clearFieldError("newUser");
    clearFieldError("newPass");
    if (inputError.toLowerCase().includes("username")) setFieldError("newUser", inputError);
    else setFieldError("newPass", inputError);
    showToast(inputError, "error");
    return;
  }

  try {
    setButtonBusy(submitButton, true, "Creating...");
    setAuthStatus("Creating account...");
    startAuthSlowTimer("Account setup is taking longer than usual. Waiting for backend response...");
    if (!window.TradeProCore || typeof window.TradeProCore.register !== "function") {
      throw new Error("Registration API is unavailable");
    }
    await window.TradeProCore.register(displayName, username, password, persist);
    stopAuthSlowTimer();
    setAuthStatus("Account created. Redirecting...", "success");
    showToast("Account created. Redirecting...", "success");
    window.location = "dashboard.html";
  } catch (error) {
    stopAuthSlowTimer();
    const msg = String(error && error.message ? error.message : "Registration failed.");
    setAuthStatus(msg, "error");
    showToast(`Registration failed: ${msg}`, "error");
  } finally {
    setButtonBusy(submitButton, false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.TradeProCore && window.TradeProCore.hasSession()) {
    setAuthStatus("Active session found. Opening dashboard...");
    window.location = "dashboard.html";
    return;
  }
  switchAuthMode("login");
  setAuthStatus("Sign in to continue.");
  ["user", "pass", "newUser", "newPass", "confirmPass"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      clearFieldError(id);
      if (id === "user" || id === "pass" || id === "newUser" || id === "newPass" || id === "confirmPass") {
        setAuthStatus("Ready.");
      }
    });
  });
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => {
      ensureFirebaseSdkLoaded().catch(() => {});
    }, { timeout: 2500 });
  }
});
