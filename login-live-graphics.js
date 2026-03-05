(function () {
  const canvas = document.getElementById("loginLiveChart");
  const phaseLabel = document.getElementById("loginLivePhase");
  if (!canvas || !phaseLabel) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = 0;
  let lastTs = 0;
  let elapsed = 0;

  const PHASES = [
    { label: "Signal Noise", duration: 4200 },
    { label: "Pattern Lock", duration: 2400 },
    { label: "Candle Build", duration: 5000 },
    { label: "Momentum Drift", duration: 3400 }
  ];
  const totalDuration = PHASES.reduce((sum, item) => sum + item.duration, 0);

  function resize() {
    dpr = window.devicePixelRatio || 1;
    width = Math.max(280, canvas.clientWidth || 300);
    height = Math.max(130, canvas.clientHeight || 130);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function smoothStep(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  function currentPhase(ms) {
    const loopMs = ((ms % totalDuration) + totalDuration) % totalDuration;
    let cursor = 0;
    for (const phase of PHASES) {
      const end = cursor + phase.duration;
      if (loopMs <= end) {
        return {
          label: phase.label,
          local: loopMs - cursor,
          ratio: (loopMs - cursor) / phase.duration
        };
      }
      cursor = end;
    }
    return { label: PHASES[0].label, local: 0, ratio: 0 };
  }

  function buildSeries(count, seed) {
    const out = [];
    let price = 100 + Math.sin(seed * 0.2) * 9;
    for (let i = 0; i < count; i += 1) {
      const drift = Math.sin((i + seed) * 0.2) * 0.8;
      const shock = (Math.sin((i + seed) * 1.7) + Math.cos((i + seed) * 0.74)) * 0.42;
      const open = price;
      const close = open + drift + shock;
      const high = Math.max(open, close) + 0.8 + Math.abs(Math.sin((i + seed) * 0.8));
      const low = Math.min(open, close) - 0.8 - Math.abs(Math.cos((i + seed) * 0.7));
      out.push({ open, high, low, close });
      price = close;
    }
    return out;
  }

  function chartBounds(series) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const c of series) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
      lo = 90;
      hi = 110;
    }
    return { lo, hi };
  }

  function valueToY(v, lo, hi, top, h) {
    return top + h - ((v - lo) / (hi - lo)) * h;
  }

  function drawGrid() {
    const cols = 7;
    const rows = 4;
    ctx.save();
    ctx.strokeStyle = "rgba(180,214,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= cols; i += 1) {
      const x = (width / cols) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let i = 0; i <= rows; i += 1) {
      const y = (height / rows) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNoise(t) {
    const points = 130;
    ctx.save();
    for (let i = 0; i < points; i += 1) {
      const px = (i / (points - 1)) * width;
      const wave = Math.sin((i + t * 0.004) * 0.27) + Math.cos((i - t * 0.003) * 0.18);
      const py = height * 0.5 + wave * (height * 0.18) + Math.sin(i * 0.9 + t * 0.01) * 6;
      const a = 0.22 + (Math.sin(i + t * 0.002) + 1) * 0.15;
      ctx.fillStyle = `rgba(125,198,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px, py, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCandles(series, lo, hi, mix, trendOnly) {
    const left = 12;
    const right = width - 12;
    const top = 10;
    const bottom = height - 12;
    const chartW = right - left;
    const chartH = bottom - top;
    const step = chartW / series.length;
    const bodyW = Math.max(2.5, step * 0.56);

    ctx.save();
    for (let i = 0; i < series.length; i += 1) {
      const c = series[i];
      const x = left + step * i + step / 2;
      const yOpen = valueToY(c.open, lo, hi, top, chartH);
      const yClose = valueToY(c.close, lo, hi, top, chartH);
      const yHigh = valueToY(c.high, lo, hi, top, chartH);
      const yLow = valueToY(c.low, lo, hi, top, chartH);
      const up = c.close >= c.open;
      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(1.2, Math.abs(yClose - yOpen));
      const wickColor = up ? `rgba(82,233,178,${0.42 * mix})` : `rgba(255,122,144,${0.42 * mix})`;
      const bodyColor = up ? `rgba(82,233,178,${0.88 * mix})` : `rgba(255,122,144,${0.88 * mix})`;

      ctx.strokeStyle = wickColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      if (!trendOnly) {
        ctx.fillStyle = bodyColor;
        ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
      }
    }

    // Trend line overlay
    ctx.beginPath();
    for (let i = 0; i < series.length; i += 1) {
      const c = series[i];
      const x = left + step * i + step / 2;
      const y = valueToY(c.close, lo, hi, top, chartH);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(98,194,255,${0.75 * mix})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawGlow(t) {
    const g = ctx.createRadialGradient(width * 0.68, height * 0.16, 8, width * 0.68, height * 0.16, 120);
    g.addColorStop(0, "rgba(102,204,255,0.28)");
    g.addColorStop(1, "rgba(102,204,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const pulse = 0.2 + (Math.sin(t * 0.0025) + 1) * 0.2;
    ctx.strokeStyle = `rgba(108,247,212,${pulse.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 8);
    ctx.lineTo(width, height - 8);
    ctx.stroke();
  }

  function render(ts) {
    if (!lastTs) lastTs = ts;
    const dt = ts - lastTs;
    lastTs = ts;
    elapsed += dt;

    const phase = currentPhase(elapsed);
    phaseLabel.textContent = phase.label;

    ctx.clearRect(0, 0, width, height);
    drawGrid();
    drawGlow(elapsed);

    const series = buildSeries(44, Math.floor(elapsed / 120));
    const bounds = chartBounds(series);

    if (phase.label === "Signal Noise") {
      drawNoise(elapsed);
    } else if (phase.label === "Pattern Lock") {
      drawNoise(elapsed);
      const mix = smoothStep(phase.ratio);
      drawCandles(series, bounds.lo, bounds.hi, mix, true);
    } else if (phase.label === "Candle Build") {
      const mix = 0.45 + smoothStep(phase.ratio) * 0.55;
      drawCandles(series, bounds.lo, bounds.hi, mix, false);
    } else {
      const mix = 0.75 + Math.sin(elapsed * 0.002) * 0.2;
      drawCandles(series, bounds.lo, bounds.hi, mix, false);
    }

    rafId = requestAnimationFrame(render);
  }

  function boot() {
    resize();
    if (rafId) cancelAnimationFrame(rafId);
    lastTs = 0;
    rafId = requestAnimationFrame(render);
  }

  window.addEventListener("resize", resize);
  boot();
})();
