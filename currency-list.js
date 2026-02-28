const searchInputEl = document.getElementById("currencySearch");
const listEl = document.getElementById("currencyList");
const countEl = document.getElementById("currencyCount");

const FLAG_OVERRIDES = {
  AED: "🇦🇪",
  AFN: "🇦🇫",
  ALL: "🇦🇱",
  AMD: "🇦🇲",
  ANG: "🇨🇼",
  AOA: "🇦🇴",
  ARS: "🇦🇷",
  AUD: "🇦🇺",
  AWG: "🇦🇼",
  AZN: "🇦🇿",
  BAM: "🇧🇦",
  BBD: "🇧🇧",
  BDT: "🇧🇩",
  BGN: "🇧🇬",
  BHD: "🇧🇭",
  BIF: "🇧🇮",
  BMD: "🇧🇲",
  BND: "🇧🇳",
  BOB: "🇧🇴",
  BRL: "🇧🇷",
  BSD: "🇧🇸",
  BTN: "🇧🇹",
  BWP: "🇧🇼",
  BYN: "🇧🇾",
  BZD: "🇧🇿",
  CAD: "🇨🇦",
  CDF: "🇨🇩",
  CHF: "🇨🇭",
  CLP: "🇨🇱",
  CNY: "🇨🇳",
  COP: "🇨🇴",
  CRC: "🇨🇷",
  CUP: "🇨🇺",
  CVE: "🇨🇻",
  CZK: "🇨🇿",
  DJF: "🇩🇯",
  DKK: "🇩🇰",
  DOP: "🇩🇴",
  DZD: "🇩🇿",
  EGP: "🇪🇬",
  ERN: "🇪🇷",
  ETB: "🇪🇹",
  EUR: "🇪🇺",
  FJD: "🇫🇯",
  FKP: "🇫🇰",
  GBP: "🇬🇧",
  GEL: "🇬🇪",
  GGP: "🇬🇬",
  GHS: "🇬🇭",
  GIP: "🇬🇮",
  GMD: "🇬🇲",
  GNF: "🇬🇳",
  GTQ: "🇬🇹",
  GYD: "🇬🇾",
  HKD: "🇭🇰",
  HNL: "🇭🇳",
  HRK: "🇭🇷",
  HTG: "🇭🇹",
  HUF: "🇭🇺",
  IDR: "🇮🇩",
  ILS: "🇮🇱",
  IMP: "🇮🇲",
  INR: "🇮🇳",
  IQD: "🇮🇶",
  IRR: "🇮🇷",
  ISK: "🇮🇸",
  JEP: "🇯🇪",
  JMD: "🇯🇲",
  JOD: "🇯🇴",
  JPY: "🇯🇵",
  KES: "🇰🇪",
  KGS: "🇰🇬",
  KHR: "🇰🇭",
  KMF: "🇰🇲",
  KPW: "🇰🇵",
  KRW: "🇰🇷",
  KWD: "🇰🇼",
  KYD: "🇰🇾",
  KZT: "🇰🇿",
  LAK: "🇱🇦",
  LBP: "🇱🇧",
  LKR: "🇱🇰",
  LRD: "🇱🇷",
  LSL: "🇱🇸",
  LYD: "🇱🇾",
  MAD: "🇲🇦",
  MDL: "🇲🇩",
  MGA: "🇲🇬",
  MKD: "🇲🇰",
  MMK: "🇲🇲",
  MNT: "🇲🇳",
  MOP: "🇲🇴",
  MRU: "🇲🇷",
  MUR: "🇲🇺",
  MVR: "🇲🇻",
  MWK: "🇲🇼",
  MXN: "🇲🇽",
  MYR: "🇲🇾",
  MZN: "🇲🇿",
  NAD: "🇳🇦",
  NGN: "🇳🇬",
  NIO: "🇳🇮",
  NOK: "🇳🇴",
  NPR: "🇳🇵",
  NZD: "🇳🇿",
  OMR: "🇴🇲",
  PAB: "🇵🇦",
  PEN: "🇵🇪",
  PGK: "🇵🇬",
  PHP: "🇵🇭",
  PKR: "🇵🇰",
  PLN: "🇵🇱",
  PYG: "🇵🇾",
  QAR: "🇶🇦",
  RON: "🇷🇴",
  RSD: "🇷🇸",
  RUB: "🇷🇺",
  RWF: "🇷🇼",
  SAR: "🇸🇦",
  SBD: "🇸🇧",
  SCR: "🇸🇨",
  SDG: "🇸🇩",
  SEK: "🇸🇪",
  SGD: "🇸🇬",
  SHP: "🇸🇭",
  SLE: "🇸🇱",
  SLL: "🇸🇱",
  SOS: "🇸🇴",
  SRD: "🇸🇷",
  SSP: "🇸🇸",
  STN: "🇸🇹",
  SYP: "🇸🇾",
  SZL: "🇸🇿",
  THB: "🇹🇭",
  TJS: "🇹🇯",
  TMT: "🇹🇲",
  TND: "🇹🇳",
  TOP: "🇹🇴",
  TRY: "🇹🇷",
  TTD: "🇹🇹",
  TWD: "🇹🇼",
  TZS: "🇹🇿",
  UAH: "🇺🇦",
  UGX: "🇺🇬",
  USD: "🇺🇸",
  UYU: "🇺🇾",
  UZS: "🇺🇿",
  VES: "🇻🇪",
  VND: "🇻🇳",
  VUV: "🇻🇺",
  WST: "🇼🇸",
  XAF: "🇨🇲",
  XCD: "🇦🇬",
  XOF: "🇸🇳",
  XPF: "🇵🇫",
  YER: "🇾🇪",
  ZAR: "🇿🇦",
  ZMW: "🇿🇲",
  ZWL: "🇿🇼"
};

function toFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "🏳️";
  const base = 127397;
  return String.fromCodePoint(
    base + countryCode.charCodeAt(0),
    base + countryCode.charCodeAt(1)
  );
}

function getFlagForCurrency(code) {
  const upper = String(code || "").toUpperCase();
  if (FLAG_OVERRIDES[upper]) return FLAG_OVERRIDES[upper];
  if (/^[A-Z]{3}$/.test(upper)) {
    const guess = upper.slice(0, 2);
    return toFlagEmoji(guess);
  }
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
    const symbol = parts.find((part) => part.type === "currency");
    return symbol ? symbol.value : code;
  } catch (error) {
    return code;
  }
}

function getCurrencyName(code) {
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "currency" });
    return displayNames.of(code) || code;
  } catch (error) {
    return code;
  }
}

function buildCurrencyData() {
  const supported = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("currency")
    : [];
  const codes = supported.length
    ? supported
    : ["USD", "EUR", "INR", "GBP", "JPY", "AUD", "CAD", "AED", "SGD", "CHF"];
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

function renderCurrencyList(filterText = "") {
  const query = String(filterText || "").trim().toLowerCase();
  const filtered = currencyData.filter((item) => {
    if (!query) return true;
    return (
      item.code.toLowerCase().includes(query) ||
      item.name.toLowerCase().includes(query)
    );
  });

  listEl.innerHTML = filtered
    .map(
      (item) => `
      <div class="currency-row">
        <div class="currency-row-flag">
          <span class="currency-flag-emoji" aria-hidden="true">${item.flag}</span>
        </div>
        <div class="currency-row-main">
          <div class="currency-row-title">${item.name} (${item.code})</div>
        </div>
        <div class="currency-row-symbol">${item.symbol}</div>
      </div>
    `
    )
    .join("");

  countEl.textContent = `${filtered.length} currencies`;
}

renderCurrencyList();

if (searchInputEl) {
  searchInputEl.addEventListener("input", (event) => {
    renderCurrencyList(event.target.value);
  });
}
