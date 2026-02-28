const API_BASE = (window.TradeProCore && window.TradeProCore.API_BASE) || "https://tradingcopy-0p0k.onrender.com";

if (window.TradeProCore && window.TradeProCore.hasSession()) {
  window.TradeProCore.ensureAuthenticated().catch(() => {
    window.location = "index.html";
  });
} else if (localStorage.getItem("auth") !== "true" && sessionStorage.getItem("auth") !== "true") {
  window.location = "index.html";
}

const streamSymbolsEl = document.getElementById("streamSymbols");
const streamHealthTextEl = document.getElementById("streamHealthText");
const streamQuotesEl = document.getElementById("streamQuotes");
const newsSymbolEl = document.getElementById("newsSymbol");
const newsIntelOutEl = document.getElementById("newsIntelOut");
const teamListEl = document.getElementById("teamList");

let streamConnection = null;

function esc(value) {
  return String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function n(value, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

function money(value) {
  if (window.TradeProCore && typeof window.TradeProCore.formatMoney === "function") {
    return window.TradeProCore.formatMoney(n(value), { digits: 2, assumeUSD: true });
  }
  return n(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

async function api(path, options = {}) {
  if (window.TradeProCore) {
    const response = await window.TradeProCore.apiFetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  }
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function stopStream() {
  if (streamConnection) {
    streamConnection.close();
    streamConnection = null;
  }
  streamHealthTextEl.textContent = "Stopped";
}

function startStream() {
  stopStream();
  const symbols = String(streamSymbolsEl.value || "").trim();
  if (!symbols) {
    streamHealthTextEl.textContent = "Add symbols first";
    return;
  }
  const accessToken = window.TradeProCore?.getAccessToken?.();
  if (!accessToken) {
    streamHealthTextEl.textContent = "Login required";
    return;
  }
  const url = `${API_BASE}/api/live/stream?token=${encodeURIComponent(accessToken)}&symbols=${encodeURIComponent(symbols)}`;
  streamConnection = new EventSource(url);
  streamHealthTextEl.textContent = "Connecting...";

  streamConnection.addEventListener("ready", () => {
    streamHealthTextEl.textContent = "Connected";
  });
  streamConnection.addEventListener("quotes", (event) => {
    const payload = JSON.parse(event.data || "{}");
    const quotes = payload.quotes || {};
    const rows = Object.entries(quotes).map(([symbol, px]) => `
      <div class="news-item">
        <h4>${esc(symbol)}</h4>
        <p>${px === null ? "N/A" : Number(px).toFixed(4)}</p>
      </div>
    `);
    streamQuotesEl.innerHTML = rows.join("") || "<p class='brand-sub'>No quote updates yet.</p>";
  });
  streamConnection.onerror = () => {
    streamHealthTextEl.textContent = "Disconnected";
  };
}

async function refreshStreamHealth() {
  try {
    const health = await api("/api/live/health");
    streamHealthTextEl.textContent = `${health.status} | clients: ${health.connectedClients}`;
  } catch (error) {
    streamHealthTextEl.textContent = error.message;
  }
}

async function runNewsAnalysis() {
  const symbol = String(newsSymbolEl.value || "").trim().toUpperCase();
  if (!symbol) {
    newsIntelOutEl.innerHTML = "<p class='brand-sub'>Enter a symbol first.</p>";
    return;
  }
  try {
    const data = await api(`/api/news-intel/${encodeURIComponent(symbol)}`);
    const sentiment = data.sentiment || {};
    const events = Array.isArray(data.events) ? data.events : [];
    newsIntelOutEl.innerHTML = [
      `<div class="news-item"><h4>Sentiment: ${esc(sentiment.label || "Neutral")}</h4><p>Score ${n(sentiment.score)} | +${n(sentiment.positive, 0)} / -${n(sentiment.negative, 0)}</p></div>`,
      ...events.slice(0, 8).map((item) => `<div class="news-item"><h4>${esc(item.headline)}</h4><p>${esc(item.source)} | ${esc(item.impact)} impact</p></div>`)
    ].join("");
  } catch (error) {
    newsIntelOutEl.innerHTML = `<p class='brand-sub'>${esc(error.message)}</p>`;
  }
}

async function runNewsDigest() {
  try {
    const data = await api("/api/news-intel/digest");
    const items = Array.isArray(data.items) ? data.items : [];
    newsIntelOutEl.innerHTML = items.map((item) => `
      <div class="news-item">
        <h4>${esc(item.symbol)} | ${item.changedToday ? "Changed Today" : "No major change"}</h4>
        <p>${esc(item.topHeadline)} | Sentiment: ${esc(item.sentiment?.label || "Neutral")}</p>
      </div>
    `).join("") || "<p class='brand-sub'>No digest items.</p>";
  } catch (error) {
    newsIntelOutEl.innerHTML = `<p class='brand-sub'>${esc(error.message)}</p>`;
  }
}

async function refreshTeams() {
  try {
    const data = await api("/api/team/watchlists");
    const teams = Array.isArray(data.teams) ? data.teams : [];
    teamListEl.innerHTML = teams.map((team) => `
      <div class="news-item">
        <h4>${esc(team.name)} (${esc(team.id)})</h4>
        <p>Role: ${esc(team.role)} | Members: ${n(team.members, 0)} | Watchlist: ${esc((team.watchlist || []).join(", "))}</p>
      </div>
    `).join("") || "<p class='brand-sub'>No team watchlists yet.</p>";
  } catch (error) {
    teamListEl.innerHTML = `<p class='brand-sub'>${esc(error.message)}</p>`;
  }
}

async function createTeam() {
  const name = String(document.getElementById("teamName").value || "").trim();
  if (!name) return;
  await api("/api/team/watchlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  refreshTeams();
}

async function addTeamSymbol() {
  const teamId = String(document.getElementById("teamIdInput").value || "").trim();
  const symbol = String(document.getElementById("teamSymbolInput").value || "").trim().toUpperCase();
  if (!teamId || !symbol) return;
  await api(`/api/team/watchlists/${encodeURIComponent(teamId)}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol })
  });
  refreshTeams();
}

async function addTeamMember() {
  const teamId = String(document.getElementById("teamIdInput").value || "").trim();
  const username = String(document.getElementById("teamMemberUsername").value || "").trim();
  const role = String(document.getElementById("teamMemberRole").value || "viewer");
  if (!teamId || !username) return;
  await api(`/api/team/watchlists/${encodeURIComponent(teamId)}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, role })
  });
  refreshTeams();
}

document.getElementById("streamStartBtn").addEventListener("click", startStream);
document.getElementById("streamStopBtn").addEventListener("click", stopStream);
document.getElementById("streamHealthBtn").addEventListener("click", refreshStreamHealth);
document.getElementById("newsRunBtn").addEventListener("click", runNewsAnalysis);
document.getElementById("newsDigestBtn").addEventListener("click", runNewsDigest);
document.getElementById("teamRefreshBtn").addEventListener("click", refreshTeams);
document.getElementById("teamCreateBtn").addEventListener("click", () => createTeam().catch((e) => (teamListEl.innerHTML = `<p class='brand-sub'>${esc(e.message)}</p>`)));
document.getElementById("teamAddSymbolBtn").addEventListener("click", () => addTeamSymbol().catch((e) => (teamListEl.innerHTML = `<p class='brand-sub'>${esc(e.message)}</p>`)));
document.getElementById("teamAddMemberBtn").addEventListener("click", () => addTeamMember().catch((e) => (teamListEl.innerHTML = `<p class='brand-sub'>${esc(e.message)}</p>`)));

refreshStreamHealth();
refreshTeams();
