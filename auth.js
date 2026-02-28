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

function ensureFirebaseReady() {
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

  try {
    const auth = ensureFirebaseReady();
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
    showToast("Login successful. Redirecting...", "success");
    window.location = "dashboard.html";
  } catch (error) {
    const message = String(error && error.message ? error.message : "Social login failed.");
    showToast(message, "error");
  }
}

async function login(event) {
  if (event) event.preventDefault();

  const username = document.getElementById("user").value.trim();
  const password = document.getElementById("pass").value.trim();
  const remember = document.getElementById("remember");
  const persist = Boolean(remember && remember.checked);

  try {
    if (!window.TradeProCore || typeof window.TradeProCore.login !== "function") {
      throw new Error("Login API is unavailable");
    }
    await window.TradeProCore.login(username, password, persist);
    showToast("Login successful. Redirecting...", "success");
    window.location = "dashboard.html";
    return;
  } catch (error) {
    setFieldError("user", "Invalid username or password.");
    setFieldError("pass", "Invalid username or password.");
    const msg = String(error && error.message ? error.message : "Login failed.");
    showToast(`Login failed: ${msg}`, "error");
  }
}

async function registerUser(event) {
  if (event) event.preventDefault();

  const displayName = document.getElementById("newDisplayName").value.trim();
  const username = document.getElementById("newUser").value.trim();
  const password = document.getElementById("newPass").value;
  const confirmPassword = document.getElementById("confirmPass").value;
  const persist = Boolean(document.getElementById("registerRemember")?.checked);

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
    if (!window.TradeProCore || typeof window.TradeProCore.register !== "function") {
      throw new Error("Registration API is unavailable");
    }
    await window.TradeProCore.register(displayName, username, password, persist);
    showToast("Account created. Redirecting...", "success");
    window.location = "dashboard.html";
  } catch (error) {
    const msg = String(error && error.message ? error.message : "Registration failed.");
    showToast(`Registration failed: ${msg}`, "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  switchAuthMode("login");
  ["user", "pass", "newUser", "newPass", "confirmPass"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => clearFieldError(id));
  });
});
