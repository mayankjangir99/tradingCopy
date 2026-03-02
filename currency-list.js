const searchInputEl = document.getElementById("currencySearch");
const listEl = document.getElementById("currencyList");
const countEl = document.getElementById("currencyCount");
const amountEl = document.getElementById("convertAmount");
const fromCurrencyEl = document.getElementById("fromCurrency");
const toCurrencyEl = document.getElementById("toCurrency");
const resultEl = document.getElementById("conversionResult");
const rateTextEl = document.getElementById("conversionRateText");
const ratesUpdatedTextEl = document.getElementById("ratesUpdatedText");
const refreshRatesBtn = document.getElementById("refreshRatesBtn");
const swapCurrenciesBtn = document.getElementById("swapCurrenciesBtn");

const FLAG_OVERRIDES = {
  AED: "🇦🇪", AFN: "🇦🇫", ALL: "🇦🇱", AMD: "🇦🇲", ANG: "🇨🇼", AOA: "🇦🇴", ARS: "🇦🇷", AUD: "🇦🇺",
  AWG: "🇦🇼", AZN: "🇦🇿", BAM: "🇧🇦", BBD: "🇧🇧", BDT: "🇧🇩", BGN: "🇧🇬", BHD: "🇧🇭", BIF: "🇧🇮",
  BMD: "🇧🇲", BND: "🇧🇳", BOB: "🇧🇴", BRL: "🇧🇷", BSD: "🇧🇸", BTN: "🇧🇹", BWP: "🇧🇼", BYN: "🇧🇾",
  BZD: "🇧🇿", CAD: "🇨🇦", CDF: "🇨🇩", CHF: "🇨🇭", CLP: "🇨🇱", CNY: "🇨🇳", COP: "🇨🇴", CRC: "🇨🇷",
  CUP: "🇨🇺", CVE: "🇨🇻", CZK: "🇨🇿", DJF: "🇩🇯", DKK: "🇩🇰", DOP: "🇩🇴", DZD: "🇩🇿", EGP: "🇪🇬",
  ERN: "🇪🇷", ETB: "🇪🇹", EUR: "🇪🇺", FJD: "🇫🇯", FKP: "🇫🇰", GBP: "🇬🇧", GEL: "🇬🇪", GGP: "🇬🇬",
  GHS: "🇬🇭", GIP: "🇬🇮", GMD: "🇬🇲", GNF: "🇬🇳", GTQ: "🇬🇹", GYD: "🇬🇾", HKD: "🇭🇰", HNL: "🇭🇳",
  HRK: "🇭🇷", HTG: "🇭🇹", HUF: "🇭🇺", IDR: "🇮🇩", ILS: "🇮🇱", IMP: "🇮🇲", INR: "🇮🇳", IQD: "🇮🇶",
  IRR: "🇮🇷", ISK: "🇮🇸", JEP: "🇯🇪", JMD: "🇯🇲", JOD: "🇯🇴", JPY: "🇯🇵", KES: "🇰🇪", KGS: "🇰🇬",
  KHR: "🇰🇭", KMF: "🇰🇲", KPW: "🇰🇵", KRW: "🇰🇷", KWD: "🇰🇼", KYD: "🇰🇾", KZT: "🇰🇿", LAK: "🇱🇦",
  LBP: "🇱🇧", LKR: "🇱🇰", LRD: "🇱🇷", LSL: "🇱🇸", LYD: "🇱🇾", MAD: "🇲🇦", MDL: "🇲🇩", MGA: "🇲🇬",
  MKD: "🇲🇰", MMK: "🇲🇲", MNT: "🇲🇳", MOP: "🇲🇴", MRU: "🇲🇷", MUR: "🇲🇺", MVR: "🇲🇻", MWK: "🇲🇼",
  MXN: "🇲🇽", MYR: "🇲🇾", MZN: "🇲🇿", NAD: "🇳🇦", NGN: "🇳🇬", NIO: "🇳🇮", NOK: "🇳🇴", NPR: "🇳🇵",
  NZD: "🇳🇿", OMR: "🇴🇲", PAB: "🇵🇦", PEN: "🇵🇪", PGK: "🇵🇬", PHP: "🇵🇭", PKR: "🇵🇰", PLN: "🇵🇱",
  PYG: "🇵🇾", QAR: "🇶🇦", RON: "🇷🇴", RSD: "🇷🇸", RUB: "🇷🇺", RWF: "🇷🇼", SAR: "🇸🇦", SBD: "🇸🇧",
  SCR: "🇸🇨", SDG: "🇸🇩", SEK: "🇸🇪", SGD: "🇸🇬", SHP: "🇸🇭", SLE: "🇸🇱", SLL: "🇸🇱", SOS: "🇸🇴",
  SRD: "🇸🇷", SSP: "🇸🇸", STN: "🇸🇹", SYP: "🇸🇾", SZL: "🇸🇿", THB: "🇹🇭", TJS: "🇹🇯", TMT: "🇹🇲",
  TND: "🇹🇳", TOP: "🇹🇴", TRY: "🇹🇷", TTD: "🇹🇹", TWD: "🇹🇼", TZS: "🇹🇿", UAH: "🇺🇦", UGX: "🇺🇬",
  USD: "🇺🇸", UYU: "🇺🇾", UZS: "🇺🇿", VES: "🇻🇪", VND: "🇻🇳", VUV: "🇻🇺", WST: "🇼🇸", XAF: "🇨🇲",
  XCD: "🇦🇬", XOF: "🇸🇳", XPF: "🇵🇫", YER: "🇾🇪", ZAR: "🇿🇦", ZMW: "🇿🇲", ZWL: "🇿🇼"
};

function q(id) {
  return document.getElementById(id);
}

function toFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "🏳️";
  const base = 127397;
  return String.fromCodePoint(base + countryCode.charCodeAt(0), base + countryCode.charCodeAt(1));
}

function getFlagForCurrency(code) {
  const upper = String(code || "").toUpperCase();
  if (FLAG_OVERRIDES[upper]) return FLAG_OVERRIDES[upper];
  if (/^[A-Z]{3}$/.test(upper)) return toFlagEmoji(upper.slice(0, 2));
  return "🏳️";
}

function getCurrencySymbol(code) {
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "symbol",
      maximumFractionDigits: 0
    }).formatToParts(1);
    return parts.find((part) => part.type === "currency")?.value || code;
  } catch {
    return code;
  }
}

function getCurrencyName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) || code;
  } catch {
    return code;
  }
}

function buildCurrencyData() {
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [];
  const codes = supported.length ? supported : ["USD", "EUR", "INR", "GBP", "JPY", "AUD", "CAD", "AED", "SGD", "CHF"];
  return codes
    .map((code) => ({
      code,
      name: getCurrencyName(code),
      symbol: getCurrencySymbol(code),
      flag: getFlagForCurrency(code)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const currencyData = buildCurrencyData();

function formatNumber(value, digits = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function formatCurrencyValue(value, code) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 4
    }).format(n);
  } catch {
    return `${code} ${formatNumber(n, 4)}`;
  }
}

function populateCurrencySelect(selectEl, defaultCode) {
  if (!selectEl) return;
  selectEl.innerHTML = currencyData
    .map((item) => `<option value="${item.code}" ${item.code === defaultCode ? "selected" : ""}>${item.code} - ${item.name}</option>`)
    .join("");
}

function renderCurrencyList(filterText = "") {
  const query = String(filterText || "").trim().toLowerCase();
  const filtered = currencyData.filter((item) => {
    if (!query) return true;
    return item.code.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
  });

  listEl.innerHTML = filtered.map((item) => `
    <div class="currency-row">
      <div class="currency-row-flag">
        <span class="currency-flag-emoji" aria-hidden="true">${item.flag}</span>
      </div>
      <div class="currency-row-main">
        <div class="currency-row-title">${item.name} (${item.code})</div>
      </div>
      <div class="currency-row-symbol">${item.symbol}</div>
    </div>
  `).join("");

  countEl.textContent = `${filtered.length} currencies`;
}

function getRateState() {
  if (!window.TradeProCore || typeof window.TradeProCore.getCurrencyRates !== "function") {
    return { base: "USD", rates: {}, updatedAt: 0 };
  }
  return window.TradeProCore.getCurrencyRates();
}

function renderConverter() {
  if (!window.TradeProCore) return;
  const amount = Number(amountEl?.value || 0);
  const fromCode = fromCurrencyEl?.value || "USD";
  const toCode = toCurrencyEl?.value || "INR";
  const converted = window.TradeProCore.convertCurrencyAmount(amount, fromCode, toCode);
  const rateState = getRateState();
  const fromRate = Number(rateState.rates[fromCode] || 1);
  const toRate = Number(rateState.rates[toCode] || 1);
  const oneUnitRate = Number.isFinite(fromRate) && fromRate > 0 ? toRate / fromRate : Number.NaN;

  resultEl.textContent = formatCurrencyValue(converted, toCode);
  rateTextEl.textContent = `1 ${fromCode} = ${formatNumber(oneUnitRate, 6)} ${toCode}`;
  ratesUpdatedTextEl.textContent = rateState.updatedAt
    ? `Rates updated: ${new Date(rateState.updatedAt).toLocaleString()}`
    : "Rates not fetched yet. Using fallback values until live rates load.";
}

async function refreshRates() {
  if (!window.TradeProCore || typeof window.TradeProCore.refreshCurrencyRates !== "function") return;
  if (refreshRatesBtn) {
    refreshRatesBtn.disabled = true;
    refreshRatesBtn.textContent = "Refreshing...";
  }
  try {
    await window.TradeProCore.refreshCurrencyRates();
    renderConverter();
  } finally {
    if (refreshRatesBtn) {
      refreshRatesBtn.disabled = false;
      refreshRatesBtn.textContent = "Refresh Rates";
    }
  }
}

function bootstrap() {
  populateCurrencySelect(fromCurrencyEl, "USD");
  populateCurrencySelect(toCurrencyEl, "INR");
  renderCurrencyList();
  renderConverter();

  searchInputEl?.addEventListener("input", (event) => renderCurrencyList(event.target.value));
  amountEl?.addEventListener("input", renderConverter);
  fromCurrencyEl?.addEventListener("change", renderConverter);
  toCurrencyEl?.addEventListener("change", renderConverter);
  refreshRatesBtn?.addEventListener("click", refreshRates);
  swapCurrenciesBtn?.addEventListener("click", () => {
    const currentFrom = fromCurrencyEl.value;
    fromCurrencyEl.value = toCurrencyEl.value;
    toCurrencyEl.value = currentFrom;
    renderConverter();
  });
  window.addEventListener("storage", renderConverter);
  window.addEventListener("tp:currency-changed", renderConverter);

  refreshRates().catch(() => {
    renderConverter();
  });
}

bootstrap();
