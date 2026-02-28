const NOTES_STORAGE_KEY = "tp_notes_workspace_v1";

const titleEl = document.getElementById("noteTitle");
const tagEl = document.getElementById("noteTag");
const editorEl = document.getElementById("notesEditor");
const statusEl = document.getElementById("notesStatus");
const clearBtn = document.getElementById("clearNotesBtn");
const downloadBtn = document.getElementById("downloadNotesBtn");
const notesChipsEl = document.getElementById("notesChips");
const checks = Array.from(document.querySelectorAll(".notes-check"));
const entryEl = document.getElementById("entryPrice");
const stopEl = document.getElementById("stopPrice");
const targetEl = document.getElementById("targetPrice");
const qtyEl = document.getElementById("positionSize");

const quickInserts = [
  "Setup: Breakout above resistance with rising volume.",
  "Entry Trigger: Confirm close above level and retest hold.",
  "Risk Plan: Max 1% account risk. Stop only at invalidation.",
  "Post-Trade Review: What worked, what failed, what to improve."
];

function getSnapshot() {
  return {
    title: titleEl.value.trim(),
    tag: tagEl.value.trim(),
    body: editorEl.value,
    checks: checks.filter((c) => c.checked).map((c) => c.value),
    entry: entryEl.value.trim(),
    stop: stopEl.value.trim(),
    target: targetEl.value.trim(),
    qty: qtyEl.value.trim(),
    updatedAt: Date.now()
  };
}

function setStatus(message) {
  if (!statusEl) return;
  statusEl.textContent = message;
}

function formatTime(ts) {
  const dt = new Date(ts);
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function saveNotes() {
  const snapshot = getSnapshot();
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(snapshot));
  setStatus(`Saved ${formatTime(snapshot.updatedAt)}`);
}

function restoreNotes() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || "{}");
  } catch {
    saved = {};
  }

  titleEl.value = saved.title || "";
  tagEl.value = saved.tag || "";
  editorEl.value = saved.body || "";
  entryEl.value = saved.entry || "";
  stopEl.value = saved.stop || "";
  targetEl.value = saved.target || "";
  qtyEl.value = saved.qty || "";

  const selected = new Set(Array.isArray(saved.checks) ? saved.checks : []);
  checks.forEach((check) => {
    check.checked = selected.has(check.value);
  });

  if (saved.updatedAt) setStatus(`Recovered ${formatTime(saved.updatedAt)}`);
}

function appendTemplate(text) {
  const current = editorEl.value.trim();
  editorEl.value = current ? `${current}\n\n${text}` : text;
  editorEl.focus();
  saveNotes();
}

function renderQuickInserts() {
  if (!notesChipsEl) return;
  notesChipsEl.innerHTML = quickInserts
    .map((line, i) => `<button class="pill notes-chip" type="button" data-note-chip="${i}">Insert ${i + 1}</button>`)
    .join("");

  notesChipsEl.querySelectorAll("[data-note-chip]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-note-chip"));
      appendTemplate(quickInserts[idx]);
    });
  });
}

function clearNotes() {
  titleEl.value = "";
  tagEl.value = "";
  editorEl.value = "";
  entryEl.value = "";
  stopEl.value = "";
  targetEl.value = "";
  qtyEl.value = "";
  checks.forEach((c) => {
    c.checked = false;
  });
  localStorage.removeItem(NOTES_STORAGE_KEY);
  setStatus("Cleared");
}

function buildDownloadText() {
  const snap = getSnapshot();
  const checklistLines = checks.map((c) => `- [${c.checked ? "x" : " "}] ${c.parentElement?.textContent?.trim() || c.value}`);
  return [
    `Title: ${snap.title || "-"}`,
    `Tag: ${snap.tag || "-"}`,
    `Updated: ${new Date().toLocaleString()}`,
    "",
    "Quick Metrics",
    `Entry: ${snap.entry || "-"}`,
    `Stop: ${snap.stop || "-"}`,
    `Target: ${snap.target || "-"}`,
    `Qty: ${snap.qty || "-"}`,
    "",
    "Checklist",
    ...checklistLines,
    "",
    "Notes",
    snap.body || "-"
  ].join("\n");
}

function downloadNotes() {
  const blob = new Blob([buildDownloadText()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tradepro-notes-${stamp}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Downloaded");
}

const autoSaveTargets = [titleEl, tagEl, editorEl, entryEl, stopEl, targetEl, qtyEl, ...checks];
autoSaveTargets.forEach((el) => {
  if (!el) return;
  el.addEventListener("input", saveNotes);
  el.addEventListener("change", saveNotes);
});

if (clearBtn) clearBtn.addEventListener("click", clearNotes);
if (downloadBtn) downloadBtn.addEventListener("click", downloadNotes);

renderQuickInserts();
restoreNotes();
