const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeSignalOutput, assertMarketSnapshotInvariants } = require("./server");

test("normalizeSignalOutput collapses contradictory range sell signals", () => {
  const normalized = normalizeSignalOutput({
    trend: "range",
    action: "SELL",
    confidence: 84
  });

  assert.equal(normalized.action, "HOLD");
  assert.equal(normalized.confidence <= 60, true);
});

test("snapshot invariants require numeric market cap when available", () => {
  assert.throws(() => {
    assertMarketSnapshotInvariants({
      quote: { price: 120.45, marketCap: "not-a-number" },
      ai: { signal: { trend: "bullish", action: "BUY", confidence: 68 } }
    });
  }, /market cap/i);
});

test("snapshot invariants reject contradictory range sell output", () => {
  assert.throws(() => {
    assertMarketSnapshotInvariants({
      quote: { price: 120.45, marketCap: 1000000 },
      ai: { signal: { trend: "range", action: "SELL", confidence: 80 } }
    });
  }, /contradictory/i);
});

test("snapshot invariants enforce ATR percent formula", () => {
  assert.throws(() => {
    assertMarketSnapshotInvariants({
      quote: { price: 120.45, marketCap: 1000000 },
      ai: {
        signal: { trend: "bullish", action: "BUY", confidence: 66 },
        metrics: { indicatorClose: 100 },
        indicators: { atr: 5, atrPct: 12 }
      }
    });
  }, /ATR%/i);
});

test("snapshot invariants enforce MACD polarity consistency", () => {
  assert.throws(() => {
    assertMarketSnapshotInvariants({
      quote: { price: 120.45, marketCap: 1000000 },
      ai: {
        signal: { trend: "bearish", action: "SELL", confidence: 64 },
        metrics: { indicatorClose: 100 },
        indicators: {
          atr: 2,
          atrPct: 2,
          macd: {
            value: -3,
            signal: -4,
            histogram: -1,
            histogramPolarity: "Negative"
          }
        }
      }
    });
  }, /MACD bearish/i);
});
