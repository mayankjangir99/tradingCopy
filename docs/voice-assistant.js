(() => {
  const API_BASE = "http://localhost:3000";
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  const WAKE_WORDS = [
    "hey tradepro",
    "hey tradpro",
    "hey trade pro",
    "ok tradepro",
    "ok tradpro",
    "hello tradepro",
    "hello tradpro",
    "hey assistant"
  ];
  const WAKE_BTN_ID = "floatingWakeBtn";

  let recognition = null;
  let isListening = false;
  let stopRequested = false;
  let restartTimer = null;
  let wakeCommandTimer = null;

  let wakeModeEnabled = false;
  let awaitingWakeCommand = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function setAssistantStatus(message, isError = false) {
    const statusEl = byId("floatingVoiceStatus");
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.classList.toggle("error", Boolean(isError));
  }

  function setListeningState(active) {
    isListening = active;
    const btn = byId("floatingVoiceBtn");
    if (btn) btn.classList.toggle("listening", active);
  }

  function speakText(text) {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function clearWakeCommandTimer() {
    if (wakeCommandTimer) {
      clearTimeout(wakeCommandTimer);
      wakeCommandTimer = null;
    }
  }

  function startWakeCommandTimer() {
    clearWakeCommandTimer();
    wakeCommandTimer = setTimeout(() => {
      awaitingWakeCommand = false;
      setAssistantStatus("Wake mode active. Say 'Hey TradePro'.");
    }, 7000);
  }

  function normalizeText(text) {
    return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function containsWakeWord(text) {
    const normalized = normalizeText(text);
    return WAKE_WORDS.some((w) => normalized.includes(w));
  }

  function stripWakeWord(text) {
    let cleaned = normalizeText(text);
    WAKE_WORDS.forEach((w) => {
      cleaned = cleaned.replace(w, " ");
    });
    cleaned = cleaned
      .replace(/^hey\b/i, " ")
      .replace(/^ok\b/i, " ")
      .replace(/^hello\b/i, " ");
    return cleaned.replace(/\s+/g, " ").trim();
  }

  function normalizeSymbolToken(token) {
    let symbol = String(token || "")
      .toUpperCase()
      .trim()
      .replace(/[.,!?;:]+$/g, "")
      .replace(/\s+/g, "")
      .replace(/\//g, "");

    if (!symbol) return "";

    if (/^(BITCOIN|BTC)$/.test(symbol)) symbol = "BTCUSDT";
    if (/^(ETHEREUM|ETHER|ETH)$/.test(symbol)) symbol = "ETHUSDT";
    if (/^(SOLANA|SOL)$/.test(symbol)) symbol = "SOLUSDT";
    if (/^(XRP|RIPPLE)$/.test(symbol)) symbol = "XRPUSDT";

    if (/^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|LTC)$/.test(symbol)) symbol = `${symbol}USDT`;
    if (/^(BTC|ETH|SOL|XRP|BNB|ADA|DOGE|LTC)USD$/.test(symbol)) symbol = `${symbol}T`;
    if (/^([A-Z0-9]{2,10})(USDT|USDC|BUSD|USD)$/.test(symbol)) {
      return symbol.replace(/(USDT|USDC|BUSD|USD)$/i, "/$1");
    }
    return symbol;
  }

  function extractCompare(text) {
    const match = String(text || "").match(/compare\s+(.+?)\s+(?:and|vs)\s+(.+)$/i);
    if (!match) return null;
    const first = normalizeSymbolToken(match[1]);
    const second = normalizeSymbolToken(match[2]);
    if (!first || !second) return null;
    return { first, second };
  }

  function extractSymbolFromText(text) {
    const cleaned = String(text || "")
      .toUpperCase()
      .replace(/\b(PRICE|SHOW|OF|ANALYZE|OPEN|PLEASE|THE|CHART)\b/g, " ")
      .replace(/[^A-Z0-9/!.\-:\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) return "";

    const direct = cleaned.match(/\b([A-Z]{1,8}:[A-Z0-9!./-]+|[A-Z]{1,6}\d{6}[CP]\d{8}|[A-Z]{2,12}(?:\/(?:USDT|USDC|BUSD|USD))?)\b/);
    if (direct) return normalizeSymbolToken(direct[1]);

    const words = cleaned.split(" ").filter(Boolean);
    const candidate = words.find((w) => /^[A-Z]{1,10}$/.test(w));
    return normalizeSymbolToken(candidate || "");
  }

  function detectIntent(text) {
    const t = normalizeText(text);
    if (!t) return "none";
    if (/\b(compare|vs)\b/.test(t)) return "compare";
    if (/\b(open|go)\s+dashboard\b/.test(t) || t.includes("dashboard")) return "dashboard";
    if (t.includes("portfolio")) return "general";
    if (/\b(price|quote)\b/.test(t)) return "price";
    if (/\b(analyze|analysis|chart)\b/.test(t)) return "analyze";
    if (extractSymbolFromText(t)) return "analyze";
    return "general";
  }

  function isCommandTextUsable(text) {
    const t = normalizeText(text);
    if (!t) return false;
    if (containsWakeWord(t) && !stripWakeWord(t)) return false;
    if (/^(yes|yeah|yep|okay|ok|hello|hi)$/.test(t)) return false;
    return true;
  }

  function navigateToDashboard() {
    window.location = "dashboard.html";
  }

  function applySymbolToInput(symbol) {
    const inputEl = byId("symbol");
    if (inputEl) inputEl.value = symbol;
    return Boolean(inputEl);
  }

  function runAnalyze(symbol) {
    if (!symbol) return false;
    if (typeof window.go === "function") {
      applySymbolToInput(symbol);
      window.go(symbol);
      return true;
    }
    window.location = `stock.html?symbol=${encodeURIComponent(symbol)}`;
    return true;
  }

  function runCompare(first, second) {
    if (!first || !second) return false;
    if (typeof window.addToWishlist === "function") window.addToWishlist(second);
    return runAnalyze(first);
  }

  async function askBackendAssistant(text) {
    const response = await fetch(`${API_BASE}/api/assistant/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, page: window.location.pathname })
    });
    if (!response.ok) throw new Error(`Assistant API ${response.status}`);
    return response.json();
  }

  async function executeAssistantAction(payload, fallbackText) {
    const action = String(payload?.action || "").toLowerCase();
    const reply = String(payload?.reply || "");
    const symbol = normalizeSymbolToken(payload?.symbol || "");
    const first = normalizeSymbolToken(payload?.first || "");
    const second = normalizeSymbolToken(payload?.second || "");

    if (action === "dashboard") {
      setAssistantStatus(reply || "Opening dashboard...");
      speakText(reply || "Opening dashboard");
      navigateToDashboard();
      return true;
    }

    if (action === "portfolio") {
      setAssistantStatus("Portfolio feature is disabled.", true);
      speakText("Portfolio feature is disabled.");
      return true;
    }

    if (action === "compare") {
      if (runCompare(first, second)) {
        setAssistantStatus(reply || `Comparing ${first} and ${second}...`);
        speakText(reply || `Comparing ${first} and ${second}`);
      } else {
        setAssistantStatus("Could not parse compare command.", true);
      }
      return true;
    }

    if (action === "analyze") {
      if (runAnalyze(symbol)) {
        setAssistantStatus(reply || `Analyzing ${symbol}...`);
        speakText(reply || `Analyzing ${symbol}`);
      } else {
        setAssistantStatus("Could not detect a valid symbol.", true);
      }
      return true;
    }

    if (action === "chat") {
      setAssistantStatus(reply || "I could not process that command.");
      if (reply) speakText(reply);
      return true;
    }

    // Unknown action => local fallback.
    return handleVoiceCommandLocalFallback(fallbackText);
  }

  async function handleVoiceCommandLocalFallback(commandText) {
    const text = String(commandText || "").trim();
    if (!text) {
      setAssistantStatus("No command detected.", true);
      return false;
    }

    const intent = detectIntent(text);

    if (intent === "dashboard") {
      setAssistantStatus("Opening dashboard...");
      speakText("Opening dashboard");
      navigateToDashboard();
      return true;
    }

    if (intent === "compare") {
      const pair = extractCompare(text);
      if (pair && runCompare(pair.first, pair.second)) {
        setAssistantStatus(`Comparing ${pair.first} and ${pair.second}...`);
        speakText(`Comparing ${pair.first} and ${pair.second}`);
      } else {
        setAssistantStatus("Could not parse compare command.", true);
      }
      return true;
    }

    if (intent === "price" || intent === "analyze") {
      const symbolLocal = extractSymbolFromText(text);
      if (runAnalyze(symbolLocal)) {
        setAssistantStatus(`${intent === "price" ? "Checking price for" : "Analyzing"} ${symbolLocal}...`);
        speakText(`${intent === "price" ? "Checking price for" : "Analyzing"} ${symbolLocal}`);
      } else {
        setAssistantStatus("Could not detect a valid symbol.", true);
      }
      return true;
    }
    return false;
  }

  async function handleVoiceCommand(commandText) {
    const text = String(commandText || "").trim();
    if (!text) {
      setAssistantStatus("No command detected.", true);
      return;
    }
    try {
      setAssistantStatus("Thinking...");
      const payload = await askBackendAssistant(text);
      const handled = await executeAssistantAction(payload, text);
      if (!handled) {
        await handleVoiceCommandLocalFallback(text);
      }
    } catch (error) {
      console.log("Assistant backend warning:", error.message);
      const handled = await handleVoiceCommandLocalFallback(text);
      if (!handled) {
        setAssistantStatus("Assistant request failed.", true);
      }
    }
  }

  function ensureRecognition() {
    if (recognition || !SpeechRecognitionAPI) return;

    recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListeningState(true);
      if (wakeModeEnabled) {
        setAssistantStatus(awaitingWakeCommand ? "Listening for command..." : "Wake mode active. Say 'Hey TradePro'.");
      } else {
        setAssistantStatus("Listening...");
      }
    };

    recognition.onresult = async (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (!transcript) return;

      if (wakeModeEnabled) {
        if (awaitingWakeCommand) {
          awaitingWakeCommand = false;
          clearWakeCommandTimer();
          setAssistantStatus(`Command: "${transcript}"`);
          await handleVoiceCommand(transcript);
          setAssistantStatus("Wake mode active. Say 'Hey TradePro'.");
          return;
        }

        if (containsWakeWord(transcript)) {
          const inlineCommand = stripWakeWord(transcript);
          if (isCommandTextUsable(inlineCommand)) {
            setAssistantStatus(`Command: "${inlineCommand}"`);
            await handleVoiceCommand(inlineCommand);
            setAssistantStatus("Wake mode active. Say 'Hey TradePro'.");
          } else {
            awaitingWakeCommand = true;
            setAssistantStatus("Wake word detected. Speak command.");
            speakText("Yes, I am listening.");
            startWakeCommandTimer();
          }
          return;
        }

        setAssistantStatus("Wake mode active. Say 'Hey TradePro'.");
        return;
      }

      setAssistantStatus(`Heard: "${transcript}"`);
      await handleVoiceCommand(transcript);
    };

    recognition.onerror = (event) => {
      const err = String(event.error || "");
      if (err === "aborted") return;

      if (err === "not-allowed" || err === "service-not-allowed") {
        disableWakeMode(true);
        setAssistantStatus("Microphone permission denied.", true);
        return;
      }

      if (wakeModeEnabled && (err === "no-speech" || err === "network")) {
        return;
      }

      setAssistantStatus(`Voice error: ${err}`, true);
    };

    recognition.onend = () => {
      setListeningState(false);

      if (stopRequested) {
        stopRequested = false;
        return;
      }

      if (wakeModeEnabled) {
        restartTimer = setTimeout(() => startRecognition(), 280);
      }
    };
  }

  function stopRecognition() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    clearWakeCommandTimer();

    if (!recognition || !isListening) return;
    stopRequested = true;
    recognition.stop();
  }

  function startRecognition() {
    if (!SpeechRecognitionAPI) {
      setAssistantStatus("Voice not supported in this browser.", true);
      return;
    }

    ensureRecognition();
    if (!recognition || isListening) return;

    recognition.continuous = Boolean(wakeModeEnabled);

    try {
      recognition.start();
    } catch {
      // Ignore rapid re-start errors from browser speech API.
    }
  }

  function startManualListening() {
    if (wakeModeEnabled) {
      setAssistantStatus("Wake mode is on. Use Wake button to turn it off for one-tap mode.");
      return;
    }
    awaitingWakeCommand = false;
    startRecognition();
  }

  function renderWakeButton() {
    const wakeBtn = byId(WAKE_BTN_ID);
    if (!wakeBtn) return;
    wakeBtn.textContent = wakeModeEnabled ? "Wake On" : "Wake Off";
    wakeBtn.style.borderColor = wakeModeEnabled
      ? "rgba(108, 247, 212, 0.65)"
      : "rgba(122, 180, 255, 0.35)";
    wakeBtn.style.color = wakeModeEnabled ? "#b9ffeb" : "#d8ebff";
  }

  function enableWakeMode() {
    wakeModeEnabled = true;
    awaitingWakeCommand = false;
    setAssistantStatus("Wake mode enabled. Say 'Hey TradePro'.");
    renderWakeButton();
    startRecognition();
  }

  function disableWakeMode(silent = false) {
    wakeModeEnabled = false;
    awaitingWakeCommand = false;
    stopRecognition();
    renderWakeButton();
    if (!silent) {
      setAssistantStatus("Wake mode off. Click Assistant to talk.");
    }
  }

  function toggleWakeMode() {
    if (wakeModeEnabled) disableWakeMode();
    else enableWakeMode();
  }

  function ensureWakeButton() {
    let wakeBtn = byId(WAKE_BTN_ID);
    if (wakeBtn) return wakeBtn;

    wakeBtn = document.createElement("button");
    wakeBtn.id = WAKE_BTN_ID;
    wakeBtn.type = "button";
    wakeBtn.setAttribute("aria-label", "Toggle wake mode");
    wakeBtn.style.position = "fixed";
    wakeBtn.style.right = "20px";
    wakeBtn.style.bottom = "72px";
    wakeBtn.style.zIndex = "1201";
    wakeBtn.style.height = "30px";
    wakeBtn.style.padding = "0 10px";
    wakeBtn.style.borderRadius = "999px";
    wakeBtn.style.border = "1px solid rgba(122, 180, 255, 0.35)";
    wakeBtn.style.background = "rgba(11, 20, 38, 0.9)";
    wakeBtn.style.color = "#d8ebff";
    wakeBtn.style.fontSize = "12px";
    wakeBtn.style.cursor = "pointer";
    wakeBtn.style.backdropFilter = "blur(6px)";

    document.body.appendChild(wakeBtn);
    return wakeBtn;
  }

  function bindFloatingAssistant() {
    const btn = byId("floatingVoiceBtn");
    if (!btn) return;

    btn.title = "Click to talk";

    const wakeBtn = ensureWakeButton();
    renderWakeButton();

    btn.addEventListener("click", startManualListening);
    wakeBtn.addEventListener("click", toggleWakeMode);

    setAssistantStatus("Click Assistant to talk. Enable Wake for hands-free mode.");
  }

  window.handleVoiceCommand = handleVoiceCommand;
  window.enableWakeVoiceAssistant = enableWakeMode;
  window.disableWakeVoiceAssistant = disableWakeMode;

  bindFloatingAssistant();
})();
