const params = new URLSearchParams(window.location.search);

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function money(v) {
  if (window.TradeProCore && typeof window.TradeProCore.formatMoney === "function") {
    return window.TradeProCore.formatMoney(num(v), { digits: 2, assumeUSD: false });
  }
  const value = num(v);
  const fallbackCurrency = String(localStorage.getItem("tp_currency") || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: fallbackCurrency,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${fallbackCurrency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}

function pct(v) {
  return `${num(v).toFixed(2)}%`;
}

const tools = {
  "lumpsum-fv": {
    name: "Lumpsum Future Value",
    description: "Estimate growth of one-time investment.",
    fields: [
      { key: "principal", label: "Initial Amount", value: 100000 },
      { key: "annualReturn", label: "Annual Return (%)", value: 12 },
      { key: "years", label: "Years", value: 10 }
    ],
    calc: ({ principal, annualReturn, years }) => {
      const fv = num(principal) * Math.pow(1 + num(annualReturn) / 100, num(years));
      return [
        ["Future Value", money(fv)],
        ["Total Gain", money(fv - num(principal))]
      ];
    }
  },
  "stepup-sip": {
    name: "Step-Up SIP Planner",
    description: "Annual increase in SIP amount for faster corpus growth.",
    fields: [
      { key: "monthlySip", label: "Monthly SIP", value: 5000 },
      { key: "annualReturn", label: "Annual Return (%)", value: 12 },
      { key: "years", label: "Years", value: 15 },
      { key: "stepUp", label: "Annual Step-Up (%)", value: 10 }
    ],
    calc: ({ monthlySip, annualReturn, years, stepUp }) => {
      const r = num(annualReturn) / 100 / 12;
      let corpus = 0;
      let sip = num(monthlySip);
      let invested = 0;
      for (let y = 1; y <= num(years); y += 1) {
        for (let m = 0; m < 12; m += 1) {
          corpus = (corpus + sip) * (1 + r);
          invested += sip;
        }
        sip *= 1 + num(stepUp) / 100;
      }
      return [
        ["Projected Corpus", money(corpus)],
        ["Total Invested", money(invested)],
        ["Estimated Profit", money(corpus - invested)]
      ];
    }
  },
  "swp": {
    name: "SWP Sustainability",
    description: "Estimate how long a corpus lasts with fixed monthly withdrawals.",
    fields: [
      { key: "corpus", label: "Starting Corpus", value: 3000000 },
      { key: "annualReturn", label: "Annual Return (%)", value: 8 },
      { key: "monthlyWithdrawal", label: "Monthly Withdrawal", value: 30000 }
    ],
    calc: ({ corpus, annualReturn, monthlyWithdrawal }) => {
      let bal = num(corpus);
      const r = num(annualReturn) / 100 / 12;
      const w = num(monthlyWithdrawal);
      let months = 0;
      while (bal > 0 && months < 1200) {
        bal = bal * (1 + r) - w;
        months += 1;
      }
      return [
        ["Estimated Duration", `${Math.floor(months / 12)} years ${months % 12} months`],
        ["Ending Balance", money(Math.max(0, bal))]
      ];
    }
  },
  "retirement-corpus": {
    name: "Retirement Corpus Need",
    description: "How much corpus you need at retirement start.",
    fields: [
      { key: "monthlyExpense", label: "Current Monthly Expense", value: 50000 },
      { key: "inflation", label: "Inflation (%)", value: 6 },
      { key: "yearsToRetire", label: "Years To Retirement", value: 20 },
      { key: "retirementYears", label: "Retirement Duration (Years)", value: 25 },
      { key: "postReturn", label: "Post-Retirement Return (%)", value: 8 }
    ],
    calc: ({ monthlyExpense, inflation, yearsToRetire, retirementYears, postReturn }) => {
      const futureAnnualExpense =
        num(monthlyExpense) * 12 * Math.pow(1 + num(inflation) / 100, num(yearsToRetire));
      const real = (1 + num(postReturn) / 100) / (1 + num(inflation) / 100) - 1;
      const corpus =
        Math.abs(real) < 1e-12
          ? futureAnnualExpense * num(retirementYears)
          : futureAnnualExpense * ((1 - Math.pow(1 + real, -num(retirementYears))) / real);
      return [
        ["Corpus Needed", money(corpus)],
        ["Year-1 Retirement Expense", money(futureAnnualExpense)]
      ];
    }
  },
  cagr: {
    name: "CAGR Calculator",
    description: "Annualized growth rate between start and end value.",
    fields: [
      { key: "startValue", label: "Start Value", value: 100000 },
      { key: "endValue", label: "End Value", value: 180000 },
      { key: "years", label: "Years", value: 5 }
    ],
    calc: ({ startValue, endValue, years }) => {
      const cagr = (Math.pow(num(endValue) / Math.max(1, num(startValue)), 1 / Math.max(1, num(years))) - 1) * 100;
      return [
        ["CAGR", pct(cagr)],
        ["Absolute Gain", money(num(endValue) - num(startValue))]
      ];
    }
  },
  "goal-lumpsum": {
    name: "Goal Lumpsum Required",
    description: "Current one-time amount needed to hit a future target.",
    fields: [
      { key: "target", label: "Target Amount", value: 5000000 },
      { key: "annualReturn", label: "Expected Return (%)", value: 10 },
      { key: "years", label: "Years", value: 10 }
    ],
    calc: ({ target, annualReturn, years }) => {
      const pv = num(target) / Math.pow(1 + num(annualReturn) / 100, num(years));
      return [
        ["Required Lumpsum Today", money(pv)],
        ["Target Amount", money(target)]
      ];
    }
  },
  emergency: {
    name: "Emergency Fund Planner",
    description: "Build safety corpus from monthly expenses and target buffer months.",
    fields: [
      { key: "monthlyExpense", label: "Monthly Expense", value: 40000 },
      { key: "months", label: "Buffer Months", value: 9 },
      { key: "currentSavings", label: "Current Emergency Savings", value: 100000 }
    ],
    calc: ({ monthlyExpense, months, currentSavings }) => {
      const target = num(monthlyExpense) * num(months);
      const gap = target - num(currentSavings);
      return [
        ["Emergency Fund Target", money(target)],
        ["Additional Needed", money(Math.max(0, gap))]
      ];
    }
  },
  allocation: {
    name: "Allocation Split",
    description: "Split capital into Equity, Debt, Gold, Cash percentages.",
    fields: [
      { key: "capital", label: "Total Capital", value: 1000000 },
      { key: "equityPct", label: "Equity (%)", value: 50 },
      { key: "debtPct", label: "Debt (%)", value: 30 },
      { key: "goldPct", label: "Gold (%)", value: 10 },
      { key: "cashPct", label: "Cash (%)", value: 10 }
    ],
    calc: ({ capital, equityPct, debtPct, goldPct, cashPct }) => {
      const c = num(capital);
      const totalPct = num(equityPct) + num(debtPct) + num(goldPct) + num(cashPct);
      return [
        ["Equity", money((c * num(equityPct)) / 100)],
        ["Debt", money((c * num(debtPct)) / 100)],
        ["Gold", money((c * num(goldPct)) / 100)],
        ["Cash", money((c * num(cashPct)) / 100)],
        ["Total Weight", pct(totalPct)]
      ];
    }
  },
  breakeven: {
    name: "Trade Breakeven Price",
    description: "Find sell price required to cover entry and transaction costs.",
    fields: [
      { key: "buyPrice", label: "Buy Price", value: 100 },
      { key: "chargesPct", label: "Total Charges (%)", value: 0.6 }
    ],
    calc: ({ buyPrice, chargesPct }) => {
      const c = num(chargesPct) / 100;
      const sell = num(buyPrice) * (1 + c);
      return [
        ["Breakeven Sell Price", num(sell).toFixed(4)],
        ["Required Move", pct((sell / Math.max(0.0001, num(buyPrice)) - 1) * 100)]
      ];
    }
  },
  "rule-72": {
    name: "Rule of 72",
    description: "Estimate years to double money at a fixed annual return.",
    fields: [{ key: "annualReturn", label: "Annual Return (%)", value: 12 }],
    calc: ({ annualReturn }) => {
      const years = 72 / Math.max(0.1, num(annualReturn));
      return [
        ["Years to Double", `${years.toFixed(2)} years`],
        ["Return Assumed", pct(annualReturn)]
      ];
    }
  }
};

const selectEl = document.getElementById("toolSelect");
const titleEl = document.getElementById("toolTitle");
const descEl = document.getElementById("toolDescription");
const subtitleEl = document.getElementById("toolSubtitle");
const fieldsEl = document.getElementById("toolFields");
const resultsEl = document.getElementById("toolResults");

function renderFields(toolKey) {
  const tool = tools[toolKey];
  titleEl.textContent = tool.name;
  descEl.textContent = tool.description;
  subtitleEl.textContent = tool.description;

  fieldsEl.innerHTML = tool.fields
    .map(
      (f) => `
      <div>
        <label class="form-label" for="f_${f.key}">${f.label}</label>
        <input class="input" id="f_${f.key}" type="number" step="any" value="${f.value}">
      </div>
    `
    )
    .join("");
}

function runTool() {
  const key = selectEl.value;
  const tool = tools[key];
  const input = {};
  tool.fields.forEach((f) => {
    input[f.key] = num(document.getElementById(`f_${f.key}`).value);
  });

  const output = tool.calc(input);
  resultsEl.innerHTML = output
    .map(([label, value]) => `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>`)
    .join("");
}

function init() {
  Object.entries(tools).forEach(([key, t]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = t.name;
    selectEl.appendChild(opt);
  });

  const initialKey = tools[params.get("tool")] ? params.get("tool") : "lumpsum-fv";
  selectEl.value = initialKey;
  renderFields(initialKey);
  runTool();

  selectEl.addEventListener("change", () => {
    const key = selectEl.value;
    const url = new URL(window.location.href);
    url.searchParams.set("tool", key);
    window.history.replaceState({}, "", url.toString());
    renderFields(key);
    runTool();
  });

  document.getElementById("runToolBtn").addEventListener("click", runTool);
}

init();
