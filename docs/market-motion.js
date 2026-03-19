(function () {
  if (!document.body || document.body.classList.contains("page-auth")) return;

  const PAGE_CONFIG = {
    dashboard: {
      label: "Live dashboard pulse",
      note: "Watchlists, risk, and planning aligned",
      tickers: [
        { symbol: "WATCHLIST", move: "12 symbols", tone: "up" },
        { symbol: "RISK", move: "heat map", tone: "neutral" },
        { symbol: "FLOW", move: "multi-market", tone: "up" },
        { symbol: "DESK", move: "ready", tone: "up" }
      ]
    },
    stock: {
      label: "Detail terminal live",
      note: "Chart, forecast, and signal layers active",
      tickers: [
        { symbol: "CHART", move: "streaming", tone: "up" },
        { symbol: "FORECAST", move: "pattern-aware", tone: "neutral" },
        { symbol: "ALERTS", move: "armed", tone: "up" },
        { symbol: "AI", move: "active", tone: "up" }
      ]
    },
    control: {
      label: "Control center sync",
      note: "Themes, alerts, and diagnostics in motion",
      tickers: [
        { symbol: "THEME", move: "live", tone: "neutral" },
        { symbol: "SESSION", move: "healthy", tone: "up" },
        { symbol: "WORKSPACE", move: "synced", tone: "up" },
        { symbol: "ENGINE", move: "checked", tone: "up" }
      ]
    },
    execution: {
      label: "Execution workbench",
      note: "Alert logic and backtests moving together",
      tickers: [
        { symbol: "ALERTS", move: "logic stack", tone: "up" },
        { symbol: "BACKTEST", move: "metrics live", tone: "neutral" },
        { symbol: "ENTRY", move: "framed", tone: "up" },
        { symbol: "RISK", move: "guarded", tone: "up" }
      ]
    },
    platform: {
      label: "Platform suite stream",
      note: "Feeds, news, and teams orbiting one hub",
      tickers: [
        { symbol: "STREAM", move: "ready", tone: "up" },
        { symbol: "NEWS", move: "digest", tone: "neutral" },
        { symbol: "TEAMS", move: "shared", tone: "up" },
        { symbol: "SYNC", move: "online", tone: "up" }
      ]
    },
    planner: {
      label: "Planning tools active",
      note: "Calculators now feel like a live desk",
      tickers: [
        { symbol: "CAGR", move: "faster", tone: "up" },
        { symbol: "RETIREMENT", move: "mapped", tone: "neutral" },
        { symbol: "ALLOCATION", move: "balanced", tone: "up" },
        { symbol: "CORPUS", move: "tracked", tone: "up" }
      ]
    },
    sip: {
      label: "SIP projection flow",
      note: "Targets, curves, and compounding in motion",
      tickers: [
        { symbol: "SIP", move: "projecting", tone: "up" },
        { symbol: "GOALS", move: "inflation-aware", tone: "neutral" },
        { symbol: "CURVE", move: "rising", tone: "up" },
        { symbol: "PLAN", move: "focused", tone: "up" }
      ]
    },
    advanced: {
      label: "Advanced tool grid",
      note: "Risk, options, and journal tools energized",
      tickers: [
        { symbol: "PORTFOLIO", move: "live", tone: "up" },
        { symbol: "OPTIONS", move: "modeled", tone: "neutral" },
        { symbol: "RISK", move: "guard rails", tone: "up" },
        { symbol: "JOURNAL", move: "flowing", tone: "up" }
      ]
    },
    notes: {
      label: "Notes workspace alive",
      note: "Trading review now feels connected to the desk",
      tickers: [
        { symbol: "THESIS", move: "captured", tone: "neutral" },
        { symbol: "CHECKLIST", move: "ready", tone: "up" },
        { symbol: "ENTRY", move: "mapped", tone: "up" },
        { symbol: "REVIEW", move: "faster", tone: "up" }
      ]
    },
    currency: {
      label: "System notice layer",
      note: "Even utility pages now share the live theme",
      tickers: [
        { symbol: "NOTICE", move: "updated", tone: "neutral" },
        { symbol: "TOOLS", move: "trimmed", tone: "neutral" },
        { symbol: "USD", move: "fixed", tone: "up" },
        { symbol: "DESK", move: "consistent", tone: "up" }
      ]
    },
    default: {
      label: "Market workspace live",
      note: "A cleaner visual rhythm across the suite",
      tickers: [
        { symbol: "MARKET", move: "open", tone: "up" },
        { symbol: "FLOW", move: "active", tone: "up" },
        { symbol: "RISK", move: "tracked", tone: "neutral" },
        { symbol: "AI", move: "ready", tone: "up" }
      ]
    }
  };

  const REVEAL_SELECTORS = [
    ".page-head",
    ".card",
    ".kpi",
    ".wish",
    ".risk-item",
    ".news-item",
    ".dashboard-meta-card",
    ".stock-strip-card",
    ".stock-actions-card",
    ".stock-hero-note",
    ".control-savebar",
    ".notes-side-card",
    ".tool-grid .btn",
    ".page-actions .btn",
    ".quick-list > *"
  ];

  const FRAME_SELECTORS = [
    ".card",
    ".kpi",
    ".wish",
    ".risk-item",
    ".news-item",
    ".dashboard-meta-card",
    ".stock-strip-card",
    ".stock-actions-card",
    ".stock-hero-note",
    ".control-tabs",
    ".control-savebar",
    ".notes-side-card"
  ];

  let revealObserver = null;
  let revealIndex = 0;

  function getPageKey() {
    const path = String(window.location.pathname || "").toLowerCase();
    if (path.includes("dashboard")) return "dashboard";
    if (path.includes("stock")) return "stock";
    if (path.includes("control-center")) return "control";
    if (path.includes("execution-lab")) return "execution";
    if (path.includes("platform-suite")) return "platform";
    if (path.includes("planner-tools")) return "planner";
    if (path.includes("sip")) return "sip";
    if (path.includes("advanced-tools")) return "advanced";
    if (path.includes("notes")) return "notes";
    if (path.includes("currency-list")) return "currency";
    return "default";
  }

  function seedFromText(text) {
    return String(text || "").split("").reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
  }

  function collectMatches(root, selectors) {
    const results = [];
    const seen = new Set();

    selectors.forEach((selector) => {
      if (root.matches && root.matches(selector) && !seen.has(root)) {
        results.push(root);
        seen.add(root);
      }
      if (!root.querySelectorAll) return;
      root.querySelectorAll(selector).forEach((node) => {
        if (!seen.has(node)) {
          results.push(node);
          seen.add(node);
        }
      });
    });

    return results;
  }

  function matchesAny(element, selectors) {
    return selectors.some((selector) => element.matches && element.matches(selector));
  }

  function getMotionMode() {
    const explicit = String(document.documentElement.dataset.motion || "").toLowerCase();
    if (explicit) return explicit;
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full";
  }

  function ensureRevealObserver() {
    if (revealObserver || getMotionMode() === "off") return;
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
  }

  function createGlowNode(delayMs) {
    const glow = document.createElement("div");
    glow.className = "market-card-glow";
    glow.setAttribute("aria-hidden", "true");
    glow.style.setProperty("--market-scan-delay", `${delayMs}ms`);
    return glow;
  }

  function decorateRevealTarget(element) {
    if (!element || element.dataset.marketReveal === "true") return;
    element.dataset.marketReveal = "true";
    element.classList.add("market-reveal");
    element.style.setProperty("--market-delay", `${Math.min(revealIndex * 42, 560)}ms`);
    revealIndex += 1;

    if (getMotionMode() === "off") {
      element.classList.add("is-visible");
    } else {
      ensureRevealObserver();
      if (revealObserver) revealObserver.observe(element);
    }

    if (matchesAny(element, FRAME_SELECTORS)) {
      element.classList.add("market-frame");
      const alreadyHasGlow = Array.from(element.children || []).some((child) => child.classList && child.classList.contains("market-card-glow"));
      if (!alreadyHasGlow) {
        element.appendChild(createGlowNode(revealIndex * 90));
      }
    }
  }

  function createBars(seed, count, className) {
    let markup = "";
    for (let index = 0; index < count; index += 1) {
      const height = 8 + ((seed + index * 17) % 18);
      const delay = (index * 110) % 900;
      markup += `<span class="${className}" style="--bar-height:${height}px;--bar-delay:${delay}ms;"></span>`;
    }
    return markup;
  }

  function renderTickerItems(items, className) {
    return items
      .concat(items)
      .map((item) => {
        const toneClass = item.tone === "down" ? "is-down" : item.tone === "neutral" ? "is-neutral" : "is-up";
        return `<span class="${className} ${toneClass}"><strong>${item.symbol}</strong><em>${item.move}</em></span>`;
      })
      .join("");
  }

  function initBackdrop(pageKey, config) {
    if (document.querySelector(".market-site-bg")) return;
    const seed = seedFromText(pageKey);
    const backdrop = document.createElement("div");
    backdrop.className = "market-site-bg";
    backdrop.setAttribute("aria-hidden", "true");

    let candles = "";
    for (let index = 0; index < 22; index += 1) {
      const height = 26 + ((seed + index * 13) % 58);
      const bodyScale = 0.35 + (((seed + index * 5) % 48) / 100);
      const delay = ((index * 230) % 2000) / 1000;
      const toneClass = (seed + index) % 4 === 0 ? "is-down" : "is-up";
      candles += `<span class="market-site-bg__candle ${toneClass}" style="--candle-height:${height}px;--candle-body:${bodyScale.toFixed(2)};--candle-delay:${delay}s;"></span>`;
    }

    backdrop.innerHTML = `
      <div class="market-site-bg__glow market-site-bg__glow--one"></div>
      <div class="market-site-bg__glow market-site-bg__glow--two"></div>
      <div class="market-site-bg__grid"></div>
      <div class="market-site-bg__ribbon market-site-bg__ribbon--top">
        <div class="market-site-bg__track">${renderTickerItems(config.tickers, "market-site-bg__item")}</div>
      </div>
      <div class="market-site-bg__ribbon market-site-bg__ribbon--bottom">
        <div class="market-site-bg__track">${renderTickerItems(config.tickers.slice().reverse(), "market-site-bg__item")}</div>
      </div>
      <div class="market-site-bg__candles">${candles}</div>
    `;

    document.body.prepend(backdrop);
    document.body.classList.add("market-motion-active");
    document.body.dataset.marketPage = pageKey;
  }

  function enhanceHeaders(pageKey, config) {
    const seed = seedFromText(pageKey);
    document.querySelectorAll(".page-head").forEach((header, index) => {
      if (header.querySelector(".market-head-band")) return;
      header.classList.add("market-head-enhanced");

      const band = document.createElement("div");
      band.className = "market-head-band";
      band.setAttribute("aria-hidden", "true");
      band.innerHTML = `
        <div class="market-head-band__pulse">
          <span class="market-head-band__dot"></span>
          <strong>${config.label}</strong>
          <em>${config.note}</em>
        </div>
        <div class="market-head-band__ticker">
          <div class="market-head-band__ticker-track">${renderTickerItems(config.tickers, "market-head-band__item")}</div>
        </div>
        <div class="market-head-band__spark">${createBars(seed + index * 31, 12, "market-head-band__bar")}</div>
      `;
      header.appendChild(band);
    });
  }

  function enhanceSectionHeads(root, pageKey) {
    const seed = seedFromText(pageKey);

    collectMatches(root, [".section-head"]).forEach((sectionHead, index) => {
      if (sectionHead.querySelector(".market-section-spark")) return;
      const spark = document.createElement("div");
      spark.className = "market-section-spark";
      spark.setAttribute("aria-hidden", "true");
      spark.innerHTML = createBars(seed + index * 19, 10, "market-section-spark__bar");
      sectionHead.appendChild(spark);
    });

    collectMatches(root, [".card > h3:first-child", ".notes-side-card > h3:first-child"]).forEach((heading, index) => {
      if (heading.nextElementSibling && heading.nextElementSibling.classList && heading.nextElementSibling.classList.contains("market-inline-spark")) return;
      const spark = document.createElement("div");
      spark.className = "market-inline-spark";
      spark.setAttribute("aria-hidden", "true");
      spark.innerHTML = createBars(seed + index * 27, 8, "market-inline-spark__bar");
      heading.insertAdjacentElement("afterend", spark);
    });
  }

  function decorateTree(root, pageKey) {
    collectMatches(root, REVEAL_SELECTORS).forEach((element) => decorateRevealTarget(element));
    enhanceSectionHeads(root, pageKey);
  }

  function syncLiveStockSymbol() {
    const nameEl = document.getElementById("stockName");
    if (!nameEl) return;
    const applySymbol = () => {
      const symbol = String(nameEl.textContent || "").trim();
      if (!symbol || symbol === "SYMBOL") return;
      document.querySelectorAll(".market-head-band__item strong").forEach((el, index) => {
        if (index % 4 === 0) el.textContent = symbol;
      });
      document.querySelectorAll(".market-site-bg__item strong").forEach((el, index) => {
        if (index % 4 === 0) el.textContent = symbol;
      });
    };
    applySymbol();
    const observer = new MutationObserver(applySymbol);
    observer.observe(nameEl, { childList: true, subtree: true, characterData: true });
  }

  function initMutations(pageKey) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          decorateTree(node, pageKey);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    const pageKey = getPageKey();
    const config = PAGE_CONFIG[pageKey] || PAGE_CONFIG.default;
    initBackdrop(pageKey, config);
    enhanceHeaders(pageKey, config);
    decorateTree(document, pageKey);
    syncLiveStockSymbol();
    initMutations(pageKey);
  }

  init();
})();
