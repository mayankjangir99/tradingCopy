const API_BASE = "https://tradingcopy-0p0k.onrender.com";
let sipChartInstance = null;
let lastSipPayload = null;

function money(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  if (window.TradeProCore && typeof window.TradeProCore.formatMoney === "function") {
    return window.TradeProCore.formatMoney(n, { digits, assumeUSD: false });
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function renderSipResults(data) {
  const wrap = document.getElementById("sipResults");
  wrap.innerHTML = [
    `<div class="kpi"><div class="kpi-label">Total Invested</div><div class="kpi-value">${money(data.totalInvested, 0)}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Estimated Future Value</div><div class="kpi-value good">${money(data.futureValue, 0)}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Estimated Profit</div><div class="kpi-value ${Number(data.profit) >= 0 ? "good" : "bad"}">${money(data.profit, 0)}</div></div>`
  ].join("");

  const meta = document.getElementById("sipMeta");
  meta.textContent = data.usedInflation
    ? `Projection uses real annual return ${Number(data.realAnnualReturnPct || 0).toFixed(2)}% after inflation adjustment.`
    : `Projection uses nominal annual return ${Number(data.annualReturn || 0).toFixed(2)}%.`;
}

function renderSipChart(projection) {
  const canvas = document.getElementById("sipChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (sipChartInstance) {
    sipChartInstance.destroy();
  }

  sipChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: projection.map((item) => `Year ${item.year}`),
      datasets: [
        {
          label: "Projected Value",
          data: projection.map((item) => item.projectedValue),
          borderColor: "#57b6ff",
          backgroundColor: "rgba(87, 182, 255, 0.18)",
          tension: 0.35,
          fill: true,
          pointRadius: 3
        },
        {
          label: "Total Invested",
          data: projection.map((item) => item.totalInvested),
          borderColor: "#2fd08b",
          backgroundColor: "rgba(47, 208, 139, 0.08)",
          tension: 0.25,
          fill: false,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 900,
        easing: "easeOutQuart"
      },
      plugins: {
        legend: {
          labels: {
            color: "#e8f0ff"
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#93a3bf" },
          grid: { color: "rgba(122, 180, 255, 0.12)" }
        },
        y: {
          ticks: {
            color: "#93a3bf",
            callback(value) {
              return money(value, 0);
            }
          },
          grid: { color: "rgba(122, 180, 255, 0.12)" }
        }
      }
    }
  });
}

async function calculateSip() {
  const payload = {
    monthlyInvestment: Number(document.getElementById("monthlyInvestment").value),
    annualReturn: Number(document.getElementById("annualReturn").value),
    durationYears: Number(document.getElementById("durationYears").value),
    inflationRate: Number(document.getElementById("inflationRate").value || 0),
    useInflation: document.getElementById("useInflation").checked
  };

  const response = await fetch(`${API_BASE}/api/sip-calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`SIP API ${response.status}`);

  const data = await response.json();
  lastSipPayload = data;
  renderSipResults(data);
  renderSipChart(data.projection || []);
}

async function calculateGoalSip() {
  const payload = {
    targetAmount: Number(document.getElementById("targetAmount").value),
    annualReturn: Number(document.getElementById("goalAnnualReturn").value),
    durationYears: Number(document.getElementById("goalDurationYears").value),
    inflationRate: Number(document.getElementById("goalInflationRate").value || 0),
    useInflation: document.getElementById("goalUseInflation").checked
  };

  const response = await fetch(`${API_BASE}/api/sip-goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Goal API ${response.status}`);

  const data = await response.json();
  document.getElementById("goalResult").innerHTML = [
    `<div class="kpi"><div class="kpi-label">Required Monthly Investment</div><div class="kpi-value">${money(data.requiredMonthlyInvestment, 0)}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Target Amount</div><div class="kpi-value">${money(data.targetAmount, 0)}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Duration</div><div class="kpi-value">${money(data.durationYears, 1)} Years</div></div>`
  ].join("");
}

async function downloadSipPdf() {
  const payload = lastSipPayload || {
    monthlyInvestment: Number(document.getElementById("monthlyInvestment").value),
    annualReturn: Number(document.getElementById("annualReturn").value),
    durationYears: Number(document.getElementById("durationYears").value),
    inflationRate: Number(document.getElementById("inflationRate").value || 0),
    useInflation: document.getElementById("useInflation").checked
  };

  const response = await fetch(`${API_BASE}/api/sip-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`PDF API ${response.status}`);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sip-plan-report.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function bootstrapSip() {
  document.getElementById("calculateSipBtn").addEventListener("click", async () => {
    try {
      await calculateSip();
    } catch (error) {
      document.getElementById("sipMeta").textContent = error.message;
    }
  });

  document.getElementById("calculateGoalBtn").addEventListener("click", async () => {
    try {
      await calculateGoalSip();
    } catch (error) {
      document.getElementById("goalResult").innerHTML = `<div class="kpi"><div class="kpi-label">Error</div><div class="kpi-value bad">${error.message}</div></div>`;
    }
  });

  document.getElementById("downloadSipPdfBtn").addEventListener("click", async () => {
    try {
      await downloadSipPdf();
    } catch (error) {
      document.getElementById("sipMeta").textContent = error.message;
    }
  });

  document.getElementById("sipResults").innerHTML = [
    `<div class="kpi"><div class="kpi-label">Total Invested</div><div class="kpi-value">${money(0, 0)}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Estimated Future Value</div><div class="kpi-value">${money(0, 0)}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Estimated Profit</div><div class="kpi-value">${money(0, 0)}</div></div>`
  ].join("");

  document.getElementById("goalResult").innerHTML = [
    `<div class="kpi"><div class="kpi-label">Required Monthly Investment</div><div class="kpi-value">${money(0, 0)}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Target Amount</div><div class="kpi-value">${money(0, 0)}</div></div>`,
    `<div class="kpi"><div class="kpi-label">Duration</div><div class="kpi-value">0 Years</div></div>`
  ].join("");

  document.getElementById("sipMeta").textContent = "Enter values and click Calculate SIP.";
}

bootstrapSip();
