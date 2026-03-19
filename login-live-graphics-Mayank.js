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
    { label: "Opening Auction", duration: 3000 },
    { label: "Liquidity Sweep", duration: 2600 },
    { label: "Candle Build", duration: 4200 },
    { label: "Momentum Release", duration: 3400 }
  ];
  const totalDuration = PHASES.reduce((sum, phase) => sum + phase.duration, 0);
  const TICKERS = [
    { symbol: "NVDA", move: "+2.4%", tone: "up" },
    { symbol: "BTC", move: "+1.1%", tone: "up" },
    { symbol: "EURUSD", move: "+0.4%", tone: "up" },
    { symbol: "AAPL", move: "+0.6%", tone: "up" },
    { symbol: "GOLD", move: "-0.2%", tone: "down" },
    { symbol: "QQQ", move: "+0.9%", tone: "up" }
  ];

  function resize() {
    dpr = window.devicePixelRatio || 1;
    width = Math.max(300, canvas.clientWidth || 320);
    height = Math.max(180, canvas.clientHeight || 180);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothStep(value) {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function currentPhase(ms) {
    const loopMs = ((ms % totalDuration) + totalDuration) % totalDuration;
    let cursor = 0;
    for (const phase of PHASES) {
      const phaseEnd = cursor + phase.duration;
      if (loopMs <= phaseEnd) {
        return {
          label: phase.label,
          ratio: (loopMs - cursor) / phase.duration
        };
      }
      cursor = phaseEnd;
    }
    return { label: PHASES[0].label, ratio: 0 };
  }

  function roundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function buildSeries(count, seed) {
    const out = [];
    let price = 100 + Math.sin(seed * 0.2) * 7;
    for (let index = 0; index < count; index += 1) {
      const drift = Math.sin((index + seed) * 0.19) * 0.85;
      const swing = Math.cos((index + seed) * 0.11) * 0.52;
      const shock = Math.sin((index + seed) * 0.71) * 0.48;
      const open = price;
      const close = open + drift + swing + shock;
      const high = Math.max(open, close) + 0.65 + Math.abs(Math.sin((index + seed) * 0.34));
      const low = Math.min(open, close) - 0.7 - Math.abs(Math.cos((index + seed) * 0.29));
      const volume = 32 + Math.abs(Math.sin((index + seed) * 0.17)) * 48 + (index % 5) * 4;
      out.push({ open, high, low, close, volume });
      price = close;
    }
    return out;
  }

  function chartBounds(series) {
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (const candle of series) {
      if (candle.low < low) low = candle.low;
      if (candle.high > high) high = candle.high;
    }
    if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
      return { low: 90, high: 110 };
    }
    return { low, high };
  }

  function valueToY(value, low, high, top, chartHeight) {
    return top + chartHeight - ((value - low) / (high - low)) * chartHeight;
  }

  function drawGlow(ts) {
    const glow = ctx.createRadialGradient(width * 0.22, height * 0.12, 6, width * 0.22, height * 0.12, width * 0.48);
    glow.addColorStop(0, "rgba(102, 204, 255, 0.28)");
    glow.addColorStop(1, "rgba(102, 204, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const glow2 = ctx.createRadialGradient(width * 0.8, height * 0.88, 8, width * 0.8, height * 0.88, width * 0.32);
    glow2.addColorStop(0, "rgba(108, 247, 212, 0.14)");
    glow2.addColorStop(1, "rgba(108, 247, 212, 0)");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, width, height);

    const pulse = 0.18 + (Math.sin(ts * 0.0025) + 1) * 0.12;
    ctx.strokeStyle = `rgba(124, 210, 255, ${pulse.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 10);
    ctx.lineTo(width, height - 10);
    ctx.stroke();
  }

  function drawTickerRail(ts, chartRight) {
    let cursor = chartRight + 200 - ((ts * 0.05) % (chartRight + 280));
    const railTop = 8;

    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textBaseline = "middle";

    for (let repeat = 0; repeat < 2; repeat += 1) {
      for (const item of TICKERS) {
        const label = `${item.symbol} ${item.move}`;
        const badgeWidth = Math.max(74, ctx.measureText(label).width + 22);
        const badgeHeight = 22;

        roundedRect(cursor, railTop, badgeWidth, badgeHeight, 11);
        ctx.fillStyle = "rgba(5, 18, 36, 0.82)";
        ctx.fill();
        ctx.strokeStyle = item.tone === "down" ? "rgba(255, 122, 144, 0.34)" : "rgba(124, 210, 255, 0.28)";
        ctx.stroke();

        ctx.fillStyle = "rgba(226, 241, 255, 0.95)";
        ctx.fillText(item.symbol, cursor + 9, railTop + badgeHeight / 2);
        ctx.fillStyle = item.tone === "down" ? "rgba(255, 132, 150, 0.9)" : "rgba(108, 247, 212, 0.92)";
        ctx.fillText(item.move, cursor + badgeWidth - ctx.measureText(item.move).width - 9, railTop + badgeHeight / 2);

        cursor += badgeWidth + 10;
      }
    }
  }

  function drawGrid(area) {
    ctx.save();
    ctx.strokeStyle = "rgba(180, 214, 255, 0.08)";
    ctx.lineWidth = 1;

    const cols = 7;
    const rows = 5;
    for (let col = 0; col <= cols; col += 1) {
      const x = area.left + (area.width / cols) * col;
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = area.top + (area.height / rows) * row;
      ctx.beginPath();
      ctx.moveTo(area.left, y);
      ctx.lineTo(area.right, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawVolumeBars(series, area) {
    const step = area.width / series.length;
    const volumeTop = area.bottom - 28;
    const volumeHeight = 18;

    ctx.save();
    for (let index = 0; index < series.length; index += 1) {
      const candle = series[index];
      const ratio = clamp(candle.volume / 92, 0.12, 1);
      const barHeight = volumeHeight * ratio;
      const x = area.left + step * index + step * 0.22;
      const y = volumeTop + (volumeHeight - barHeight);
      const barWidth = Math.max(2, step * 0.54);
      ctx.fillStyle = candle.close >= candle.open ? "rgba(108, 247, 212, 0.22)" : "rgba(255, 122, 144, 0.18)";
      ctx.fillRect(x, y, barWidth, barHeight);
    }
    ctx.restore();
  }

  function drawCandles(series, bounds, area, mix, trendOnly) {
    const step = area.width / series.length;
    const bodyWidth = Math.max(3, step * 0.56);

    ctx.save();
    for (let index = 0; index < series.length; index += 1) {
      const candle = series[index];
      const x = area.left + step * index + step / 2;
      const yOpen = valueToY(candle.open, bounds.low, bounds.high, area.top, area.height - 34);
      const yClose = valueToY(candle.close, bounds.low, bounds.high, area.top, area.height - 34);
      const yHigh = valueToY(candle.high, bounds.low, bounds.high, area.top, area.height - 34);
      const yLow = valueToY(candle.low, bounds.low, bounds.high, area.top, area.height - 34);
      const isUp = candle.close >= candle.open;
      const wickColor = isUp ? `rgba(108, 247, 212, ${(0.34 + mix * 0.36).toFixed(3)})` : `rgba(255, 122, 144, ${(0.34 + mix * 0.36).toFixed(3)})`;
      const bodyColor = isUp ? `rgba(108, 247, 212, ${(0.52 + mix * 0.44).toFixed(3)})` : `rgba(255, 122, 144, ${(0.48 + mix * 0.48).toFixed(3)})`;

      ctx.strokeStyle = wickColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      if (!trendOnly) {
        ctx.fillStyle = bodyColor;
        ctx.fillRect(x - bodyWidth / 2, Math.min(yOpen, yClose), bodyWidth, Math.max(1.4, Math.abs(yClose - yOpen)));
      }
    }

    const trendPath = [];
    for (let index = 0; index < series.length; index += 1) {
      const x = area.left + step * index + step / 2;
      const y = valueToY(series[index].close, bounds.low, bounds.high, area.top, area.height - 34);
      trendPath.push({ x, y });
    }

    ctx.beginPath();
    trendPath.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = `rgba(98, 194, 255, ${(0.54 + mix * 0.34).toFixed(3)})`;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    const fill = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    fill.addColorStop(0, "rgba(87, 182, 255, 0.18)");
    fill.addColorStop(1, "rgba(87, 182, 255, 0)");
    ctx.beginPath();
    trendPath.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.lineTo(area.right, area.bottom - 26);
    ctx.lineTo(area.left, area.bottom - 26);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.restore();
  }

  function drawScanner(ts, area) {
    const x = area.left + ((ts * 0.05) % area.width);
    const gradient = ctx.createLinearGradient(x - 16, 0, x + 16, 0);
    gradient.addColorStop(0, "rgba(87, 182, 255, 0)");
    gradient.addColorStop(0.5, "rgba(87, 182, 255, 0.18)");
    gradient.addColorStop(1, "rgba(87, 182, 255, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(x - 16, area.top, 32, area.height - 24);
    ctx.strokeStyle = "rgba(87, 182, 255, 0.35)";
    ctx.beginPath();
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.bottom - 24);
    ctx.stroke();
  }

  function drawPulseMarkers(series, bounds, area, ts) {
    const step = area.width / series.length;
    ctx.save();
    for (let index = series.length - 6; index < series.length; index += 2) {
      const candle = series[index];
      const x = area.left + step * index + step / 2;
      const y = valueToY(candle.close, bounds.low, bounds.high, area.top, area.height - 34);
      const pulse = 3 + (Math.sin(ts * 0.006 + index) + 1) * 2.5;
      ctx.beginPath();
      ctx.arc(x, y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(108, 247, 212, 0.14)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(108, 247, 212, 0.92)";
      ctx.fill();
    }
    ctx.restore();
  }

  function drawOscillator(ts, area) {
    const top = height - 28;
    const left = area.left;
    const right = area.right;
    const widthSpan = right - left;

    ctx.save();
    ctx.beginPath();
    for (let index = 0; index <= 42; index += 1) {
      const x = left + (widthSpan / 42) * index;
      const y = top + Math.sin(index * 0.48 + ts * 0.004) * 4 + Math.cos(index * 0.21 + ts * 0.002) * 2;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(255, 208, 122, 0.6)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  function drawOrderBook(ts, panel) {
    roundedRect(panel.x, panel.y, panel.width, panel.height, 14);
    ctx.fillStyle = "rgba(4, 15, 30, 0.86)";
    ctx.fill();
    ctx.strokeStyle = "rgba(124, 210, 255, 0.16)";
    ctx.stroke();

    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(214, 235, 255, 0.88)";
    ctx.fillText("Depth Ladder", panel.x + 10, panel.y + 10);
    ctx.fillStyle = "rgba(147, 163, 191, 0.92)";
    ctx.fillText("Bid / Ask", panel.x + 10, panel.y + 24);

    const rowCount = 5;
    const rowGap = 12;
    const rowHeight = 10;
    const startY = panel.y + 48;

    for (let index = 0; index < rowCount; index += 1) {
      const askRatio = 0.28 + (Math.sin(ts * 0.003 + index * 0.8) + 1) * 0.24;
      const bidRatio = 0.34 + (Math.cos(ts * 0.0034 + index * 0.7) + 1) * 0.22;
      const rowY = startY + index * (rowGap + rowHeight);
      const barMax = panel.width - 34;

      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.fillRect(panel.x + 10, rowY, barMax, rowHeight);

      ctx.fillStyle = "rgba(255, 122, 144, 0.18)";
      ctx.fillRect(panel.x + 10, rowY, barMax * askRatio, rowHeight);

      ctx.fillStyle = "rgba(108, 247, 212, 0.2)";
      ctx.fillRect(panel.x + 10, rowY + rowHeight + 3, barMax * bidRatio, rowHeight);

      ctx.fillStyle = "rgba(255, 132, 150, 0.9)";
      ctx.fillText(`${(100.4 + index * 0.2).toFixed(1)}`, panel.x + 10, rowY - 10);
      ctx.fillStyle = "rgba(122, 236, 204, 0.92)";
      ctx.fillText(`${(99.8 - index * 0.2).toFixed(1)}`, panel.x + 10, rowY + rowHeight + 14);
    }

    const pulseY = panel.y + panel.height - 24;
    ctx.fillStyle = "rgba(147, 163, 191, 0.92)";
    ctx.fillText("Flow", panel.x + 10, pulseY);
    const pulse = 0.4 + (Math.sin(ts * 0.005) + 1) * 0.24;
    ctx.fillStyle = "rgba(108, 247, 212, 0.94)";
    ctx.fillText(`${Math.round(pulse * 100)}%`, panel.x + panel.width - 36, pulseY);
  }

  function drawNoise(area, ts) {
    ctx.save();
    for (let index = 0; index < 90; index += 1) {
      const x = area.left + ((index * 17) % area.width);
      const y =
        area.top +
        ((index * 29) % (area.height - 34)) +
        Math.sin(ts * 0.004 + index * 0.7) * 6;
      const alpha = 0.08 + (Math.sin(ts * 0.003 + index) + 1) * 0.06;
      ctx.fillStyle = `rgba(124, 210, 255, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function render(ts) {
    if (!lastTs) lastTs = ts;
    const delta = ts - lastTs;
    lastTs = ts;
    elapsed += delta;

    const phase = currentPhase(elapsed);
    phaseLabel.textContent = phase.label;

    const panelWidth = Math.min(122, Math.max(96, width * 0.24));
    const chartArea = {
      left: 16,
      top: 40,
      right: width - panelWidth - 18,
      bottom: height - 18
    };
    chartArea.width = Math.max(150, chartArea.right - chartArea.left);
    chartArea.height = chartArea.bottom - chartArea.top;

    const orderBookPanel = {
      x: width - panelWidth,
      y: 36,
      width: panelWidth - 2,
      height: height - 54
    };

    ctx.clearRect(0, 0, width, height);
    drawGlow(elapsed);
    drawTickerRail(elapsed, chartArea.right);
    drawGrid(chartArea);

    const series = buildSeries(44, Math.floor(elapsed / 120));
    const bounds = chartBounds(series);
    const trendMix = phase.label === "Opening Auction" ? 0.18 : phase.label === "Liquidity Sweep" ? 0.44 : 0.82;
    const trendOnly = phase.label === "Opening Auction" || phase.label === "Liquidity Sweep";

    drawVolumeBars(series, chartArea);
    if (phase.label === "Opening Auction") {
      drawNoise(chartArea, elapsed);
    }
    drawCandles(series, bounds, chartArea, smoothStep(trendMix), trendOnly);
    drawOscillator(elapsed, chartArea);
    drawOrderBook(elapsed, orderBookPanel);
    drawScanner(elapsed, chartArea);

    if (phase.label === "Momentum Release" || phase.label === "Candle Build") {
      drawPulseMarkers(series, bounds, chartArea, elapsed);
    }

    rafId = requestAnimationFrame(render);
  }

  function boot() {
    resize();
    if (rafId) cancelAnimationFrame(rafId);
    lastTs = 0;
    elapsed = 0;
    rafId = requestAnimationFrame(render);
  }

  window.addEventListener("resize", resize);
  boot();
})();
