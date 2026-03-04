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
