console.log("Halo Grade Enhancer active");

// ---------- State Variables ----------

let whatIfEnabled = false;
let excludeUngradedEnabled = false; // when true, omit originally-ungraded assignments from numerator/denominator
let lastPath = location.pathname;
const originalScores = new Map(); // key -> row state (stable across responsive re-renders)
const userOverrides = new Map(); // key -> string numeric value user typed
let originalPointsCard = { earned: null, total: null };
let originalPercentCard = { value: null };
let originalLetterGrade = null;
let gradebookObserver = null;
let enableWhatIfScheduled = null;

// ---------- Helper Functions ----------

// Get all grade summary cards
function getAllGradeCards() {
  return Array.from(document.querySelectorAll(".GradingScoreCard_scoreCard__YO7GJ"));
}

// Find a grade card by its label text
function getCardByLabel(labels) {
  const arr = Array.isArray(labels) ? labels : [labels];

  return getAllGradeCards().find((card) => {
    const label = card.querySelector(".GradingScoreCard_scoreLabel__QfYiM");
    const text = label ? label.textContent.trim() : "";
    return arr.includes(text);
  });
}

// Get the label element from a card
function getLabelEl(card) {
  return card ? card.querySelector(".GradingScoreCard_scoreLabel__QfYiM") : null;
}

function isVisibleEl(el) {
  if (!el) return false;
  const rects = el.getClientRects?.();
  if (!rects || rects.length === 0) return false;
  const cs = window.getComputedStyle?.(el);
  if (!cs) return true;
  return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
}

function isTopicPointsEl(el) {
  // In narrow mode, Halo renders per-topic "Points:" totals that also contain
  // data-testid="student_scored_points". Those must never be treated as assignments.
  return !!el?.closest?.(
    ".guide_anchor_studentGradebook_topicPoints, [class*='TopicGrouping_topicPoints__'], [class*='TopicGrouping_topicHeader__']"
  );
}

function getScoreCells() {
  // Wide layout: true score cells exist.
  const direct = Array.from(document.querySelectorAll("[data-testid$='_score']")).filter(isVisibleEl);
  if (direct.length) return direct;

  // Narrow/staked layout: there may be no *_score containers. Fall back to locating the smallest
  // container around a per-assignment score span that also contains the total ("/ y") or total element.
  const scoredSpans = Array.from(document.querySelectorAll("[data-testid='student_scored_points']"))
    .filter((el) => !el.closest(".GradingScoreCard_scoreCard__YO7GJ"))
    .filter((el) => !isTopicPointsEl(el))
    .filter(isVisibleEl);

  const out = [];
  const seen = new Set();

  for (const span of scoredSpans) {
    let cur = span;
    for (let depth = 0; cur && depth < 10; depth += 1) {
      const text = (cur.textContent || "").trim();
      const hasFraction = /\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?/.test(text);
      const hasTotalEl = !!cur.querySelector?.(".Points_totalPoints__0YI7s:not(.AssessmentTable_score__Exj27)");
      const hasSingleScoreSpan =
        (cur.querySelectorAll?.("[data-testid='student_scored_points']")?.length ?? 0) === 1;

      if (hasSingleScoreSpan && (hasFraction || hasTotalEl)) {
        const sig = cur.getAttribute?.("data-testid") || cur;
        if (!seen.has(sig)) {
          seen.add(sig);
          if (isVisibleEl(cur)) out.push(cur);
        }
        break;
      }

      cur = cur.parentElement;
    }
  }

  return out;
}

function findAssignmentContainer(fromEl) {
  let el = fromEl;
  for (let depth = 0; el && depth < 14; depth += 1) {
    if (el.closest?.(".GradingScoreCard_scoreCard__YO7GJ")) return null;

    const statuses = el.querySelectorAll?.("[data-testid='status']");
    const scores = el.querySelectorAll?.("[data-testid='student_scored_points']");

    if ((statuses?.length ?? 0) === 1 && (scores?.length ?? 0) === 1) return el;

    el = el.parentElement;
  }
  return null;
}

function pickAssignmentTitle(container) {
  const anchors = Array.from(container?.querySelectorAll?.("a") ?? []);
  const texts = anchors
    .map((a) => (a.textContent || "").trim())
    .filter((t) => t && !/^view\b/i.test(t) && !/feedback|submission/i.test(t));

  // Prefer the longest (usually the assignment title).
  texts.sort((a, b) => b.length - a.length);
  return texts[0] || "";
}

function getScoreKey(cell, i, total, dtCounts) {
  const dt = cell?.getAttribute?.("data-testid");
  if (dt) {
    // Some Halo tables reuse the same data-testid for every row in a column (not unique).
    // If it's duplicated within the current render, append the row index to make it unique.
    const n = dtCounts?.get?.(dt) ?? 0;
    return n > 1 ? `${dt}::${i}` : dt;
  }

  const container = findAssignmentContainer(cell) || cell;
  const title = pickAssignmentTitle(container);
  if (title) return `${title}::${String(total ?? "")}`;

  return String(i);
}

function getScoreCellFromEl(el) {
  return (
    el?.closest?.("[data-halo-score-container='1']") ||
    el?.closest?.("[data-testid$='_score']") ||
    null
  );
}

function scheduleEnableWhatIf() {
  if (!whatIfEnabled) return;
  if (enableWhatIfScheduled) clearTimeout(enableWhatIfScheduled);
  enableWhatIfScheduled = setTimeout(() => {
    enableWhatIfScheduled = null;
    if (whatIfEnabled) enableWhatIf();
  }, 200);
}

function ensureGradebookObserver() {
  if (gradebookObserver) return;
  gradebookObserver = new MutationObserver(() => scheduleEnableWhatIf());
  gradebookObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function disconnectGradebookObserver() {
  if (!gradebookObserver) return;
  gradebookObserver.disconnect();
  gradebookObserver = null;
  if (enableWhatIfScheduled) clearTimeout(enableWhatIfScheduled);
  enableWhatIfScheduled = null;
}

// Best-effort: find a "status" badge near the row that contains the score cell.
// Example: <div data-testid="status" ...>Published</div>
function findStatusEl(fromEl) {
  const row = fromEl?.closest?.("tr");
  const inRow = row?.querySelector?.("[data-testid='status']");
  if (inRow) return inRow;

  const assignment = findAssignmentContainer(fromEl);
  const inAssignment = assignment?.querySelector?.("[data-testid='status']");
  if (inAssignment) return inAssignment;

  let el = fromEl;
  for (let depth = 0; el && depth < 10; depth += 1) {
    const sts = el.querySelectorAll?.("[data-testid='status']");
    if (sts && sts.length === 1) return sts[0];
    el = el.parentElement;
  }

  return null;
}

// ---------- Toggle What-If Mode ----------

function toggleWhatIf() {
  whatIfEnabled = !whatIfEnabled;

  // Update button appearance
  const btn = document.getElementById("toggle-whatif-btn");
  if (btn) {
    btn.textContent = whatIfEnabled ? "Exit What-If Mode" : "Enter What-If Mode";
    btn.classList.toggle("active", whatIfEnabled);
  }

  // Enable/disable the options UI while in What-If mode
  const optWrap = document.getElementById("halo-whatif-options");
  if (optWrap) optWrap.classList.toggle("active", whatIfEnabled);

  // Update grade card label
  const labelCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const label = getLabelEl(labelCard);
  if (label) label.textContent = whatIfEnabled ? "What-If Grade" : "Overall Grade";

  // Toggle global CSS class
  document.body.classList.toggle("halo-whatif-active", whatIfEnabled);

  if (whatIfEnabled) {
    ensureGradebookObserver();
    window.addEventListener("resize", scheduleEnableWhatIf);
    enableWhatIf();
  } else {
    window.removeEventListener("resize", scheduleEnableWhatIf);
    disconnectGradebookObserver();
    disableWhatIf();
  }
}

// ---------- Enable What-If Mode ----------

function enableWhatIf() {
  const cells = getScoreCells();

  if (!cells.length) {
    return setTimeout(enableWhatIf, 800);
  }

  const dtCounts = new Map();
  for (const c of cells) {
    const dt = c?.getAttribute?.("data-testid");
    if (!dt) continue;
    dtCounts.set(dt, (dtCounts.get(dt) || 0) + 1);
  }

  // Save original cards
  const pointsCard = getCardByLabel("Points Earned");
  if (pointsCard && (originalPointsCard.earned === null || originalPointsCard.total === null)) {
    const e = pointsCard.querySelector("[data-testid='student_scored_points']");
    const t = pointsCard.querySelector(".Points_totalPoints__0YI7s");
    if (e && t) {
      originalPointsCard.earned = e.textContent.trim();
      originalPointsCard.total = t.textContent.trim();
    }
  }

  const percentCard = getCardByLabel("Percentage");
  if (percentCard && originalPercentCard.value === null) {
    const span = percentCard.querySelector("[data-testid='student_scored_points']");
    if (span) originalPercentCard.value = span.textContent.trim();
  }

  const letterCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const letterEl = letterCard?.querySelector("[data-testid='student_scored_points']");
  if (letterEl && originalLetterGrade === null) originalLetterGrade = letterEl.textContent.trim();

  cells.forEach((cell, i) => {
    if (cell.querySelector(".halo-whatif-input")) return;
    if (isTopicPointsEl(cell)) return;

    const scored = cell.querySelector("[data-testid='student_scored_points']");
    const totalEl = cell.querySelector(".Points_totalPoints__0YI7s:not(.AssessmentTable_score__Exj27)");

    const fracMatch = cell.textContent.match(/(\d+(\.\d+)?)\s*\/\s*(\d+(\.\d+)?)/);
    let total = parseFloat(totalEl?.textContent || "");
    if (isNaN(total) && fracMatch) total = parseFloat(fracMatch[3]);

    if (!scored || isNaN(total)) return;

    const key = getScoreKey(cell, i, total, dtCounts);

    const match = fracMatch || cell.textContent.match(/(\d+(\.\d+)?)\s*\/\s*\d+/);

    const statusEl = findStatusEl(cell);
    const statusText = statusEl ? statusEl.textContent.trim() : "";
    const statusIsPublished = statusText ? statusText.toLowerCase().includes("published") : false;

    const scoredText = scored.textContent.trim();
    const wasEmpty = statusText
      ? !statusIsPublished
      : (
        scoredText.includes("NoScore") ||
        scoredText === "-" ||
        scoredText === "" ||
        !/[0-9]/.test(scoredText)
      );

    const prev = originalScores.get(key);

    let earned;
    const overrideText = userOverrides.get(key);
    if (overrideText !== undefined && overrideText !== null && String(overrideText).trim() !== "") {
      earned = parseFloat(overrideText);
    } else if (match) {
      earned = parseFloat(match[1]);
    } else {
      earned = total;
    }

    if (isNaN(earned) || earned < 0) earned = 0;

    const percentSpan = cell.querySelector(".Points_totalPoints__0YI7s.AssessmentTable_score__Exj27");
    const originalHTML = scored.innerHTML;

    // Keep previously-tracked include state across re-renders within a What-If session.
    const base = prev || {};
    originalScores.set(key, {
      earned,
      total,
      originalHTML,
      percentText: percentSpan ? percentSpan.textContent : (base.percentText || ""),
      wasEmpty,
      userIncluded: base.userIncluded || false,
      savedUngradedValue: base.savedUngradedValue ?? null,
    });

    // If the user already typed something for an originally-ungraded row, treat it as explicitly included.
    const base2 = originalScores.get(key);
    if (base2?.wasEmpty && userOverrides.has(key)) base2.userIncluded = true;

    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.max = String(total);
    inp.step = "1";
    inp.className = "halo-whatif-input";
    inp.value = earned;
    inp.dataset.haloKey = key;
    inp.inputMode = "numeric";

    // Mark the container so we can find it again even if Halo swaps layouts.
    try {
      cell.dataset.haloScoreContainer = "1";
    } catch {
      // Ignore (in case cell is not a normal Element in some edge DOM)
    }

    if (excludeUngradedEnabled && wasEmpty && !base2?.userIncluded) {
      // If exclude mode is already enabled on entry, we still want the ability to toggle it off
      // and return to the default "assume full credit" behavior for ungraded rows.
      if (base2 && base2.savedUngradedValue === null) {
        base2.savedUngradedValue = String(earned);
      }

      inp.value = "";
      inp.placeholder = "0";
      inp.classList.add("halo-ungraded-excluded");
      cell.classList.add("halo-ungraded-excluded");
    }

    inp.addEventListener("input", () => {
      let val = parseFloat(inp.value);
      if (isNaN(val)) val = 0;
      val = Math.max(0, Math.min(val, total));
      inp.value = val;

      const key2 = inp.dataset.haloKey || "";
      if (key2) userOverrides.set(key2, String(val));

      const base3 = originalScores.get(key2);
      if (base3?.wasEmpty && excludeUngradedEnabled) {
        base3.userIncluded = true; // allow explicit 0 to count
        base3.savedUngradedValue = null;
        inp.classList.remove("halo-ungraded-excluded");
        inp.placeholder = "";
        getScoreCellFromEl(inp)?.classList.remove("halo-ungraded-excluded");
      }

      recalc();
    });

    scored.textContent = "";
    scored.appendChild(inp);
  });

  recalc();
}

// ---------- Disable What-If Mode ----------

function disableWhatIf() {
  document.querySelectorAll(".halo-whatif-input").forEach((inp) => {
    if (!isVisibleEl(inp)) {
      inp.remove();
      return;
    }
    const parent = inp.parentElement;
    const key = inp.dataset.haloKey || "";
    inp.remove();

    const o = key ? originalScores.get(key) : null;
    if (!o || !parent) return;

    parent.innerHTML = o.originalHTML;
    const cell = getScoreCellFromEl(parent);
    cell?.classList.remove("halo-ungraded-excluded");

    const percentSpan = cell?.querySelector(".Points_totalPoints__0YI7s.AssessmentTable_score__Exj27");
    if (percentSpan) percentSpan.textContent = o.percentText;
  });

  const pCard = getCardByLabel("Points Earned");
  if (pCard && originalPointsCard.earned && originalPointsCard.total) {
    const e = pCard.querySelector("[data-testid='student_scored_points']");
    const t = pCard.querySelector(".Points_totalPoints__0YI7s");
    if (e && t) {
      e.textContent = originalPointsCard.earned;
      t.textContent = originalPointsCard.total;
    }
  }

  const percentCard = getCardByLabel("Percentage");
  if (percentCard && originalPercentCard.value) {
    const span = percentCard.querySelector("[data-testid='student_scored_points']");
    if (span) span.textContent = originalPercentCard.value;
  }

  const letterCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const letterEl = letterCard?.querySelector("[data-testid='student_scored_points']");
  if (letterEl && originalLetterGrade) letterEl.textContent = originalLetterGrade;

  originalScores.clear();
  userOverrides.clear();
  originalPointsCard = { earned: null, total: null };
  originalPercentCard = { value: null };
  originalLetterGrade = null;
  document.body.classList.remove("halo-whatif-active");
}

// ---------- Recalculate Grades ----------

function recalc() {
  let earned = 0;
  let possible = excludeUngradedEnabled ? 0 : 1000;

  document.querySelectorAll(".halo-whatif-input").forEach((inp) => {
    if (!isVisibleEl(inp)) return;
    const key = inp.dataset.haloKey || "";
    const base = key ? originalScores.get(key) : null;
    if (!base) return;

    const includeRow = !excludeUngradedEnabled ? true : (!base.wasEmpty || base.userIncluded);
    if (!includeRow) return;

    const e = parseFloat(inp.value);
    if (!isNaN(e)) earned += e;
    if (excludeUngradedEnabled) possible += base.total;
  });

  const pct = possible > 0 ? (earned / possible) * 100 : 0;

  const letterCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const letterEl = letterCard?.querySelector("[data-testid='student_scored_points']");
  if (letterEl) {
    if (possible <= 0) {
      letterEl.textContent = "N/A";
    } else {
      const L =
        pct >= 97 ? "A+" :
        pct >= 93 ? "A"  :
        pct >= 90 ? "A-" :
        pct >= 87 ? "B+" :
        pct >= 83 ? "B"  :
        pct >= 80 ? "B-" :
        pct >= 77 ? "C+" :
        pct >= 73 ? "C"  :
        pct >= 70 ? "C-" :
        pct >= 67 ? "D+" :
        pct >= 63 ? "D"  :
        pct >= 60 ? "D-" : "F";
      letterEl.textContent = L;
    }
  }

  const pCard = getCardByLabel("Points Earned");
  const eEl = pCard?.querySelector("[data-testid='student_scored_points']");
  const tEl = pCard?.querySelector(".Points_totalPoints__0YI7s");
  if (eEl && tEl) {
    eEl.textContent = earned.toFixed(2);
    tEl.textContent = excludeUngradedEnabled ? String(possible.toFixed(2)) : "1000";
  }

  const percentCard = getCardByLabel("Percentage");
  const pEl = percentCard?.querySelector("[data-testid='student_scored_points']");
  if (pEl) pEl.textContent = `${pct.toFixed(2)}%`;

  // Update per-row percent display
  document.querySelectorAll(".halo-whatif-input").forEach((inp) => {
    if (!isVisibleEl(inp)) return;
    const key = inp.dataset.haloKey || "";
    const base = key ? originalScores.get(key) : null;
    if (!base) return;

    const cell = getScoreCellFromEl(inp);
    const percentSpan = cell?.querySelector(".Points_totalPoints__0YI7s.AssessmentTable_score__Exj27");

    if (excludeUngradedEnabled && base.wasEmpty && !base.userIncluded) {
      if (percentSpan) percentSpan.textContent = base.percentText;
      inp.classList.add("halo-ungraded-excluded");
      cell?.classList.add("halo-ungraded-excluded");
      return;
    }

    inp.classList.remove("halo-ungraded-excluded");
    cell?.classList.remove("halo-ungraded-excluded");

    const eVal = parseFloat(inp.value);
    const percent = !isNaN(eVal) && base.total > 0 ? ((eVal / base.total) * 100).toFixed(0) : "0";
    if (percentSpan) percentSpan.textContent = `(${percent}%)`;
  });
}

// ---------- Button Injection ----------

function insertButtonInGradeCard(retries = 20) {
  if (document.getElementById("toggle-whatif-btn")) return;

  const card = getCardByLabel(["Overall Grade", "What-If Grade"]) || getAllGradeCards()[0];
  if (!card) {
    if (retries > 0) return setTimeout(() => insertButtonInGradeCard(retries - 1), 300);
    return;
  }

  const btn = document.createElement("button");
  btn.id = "toggle-whatif-btn";
  btn.textContent = "Enter What-If Mode";
  btn.addEventListener("click", toggleWhatIf);

  // Options: exclude ungraded from numerator/denominator
  const optWrap = document.createElement("span");
  optWrap.id = "halo-whatif-options";
  optWrap.className = "halo-whatif-options";

  const optLabel = document.createElement("label");
  optLabel.className = "halo-exclude-ungraded-label";

  const opt = document.createElement("input");
  opt.type = "checkbox";
  opt.id = "toggle-exclude-ungraded";
  opt.checked = excludeUngradedEnabled;
  opt.addEventListener("change", () => {
    excludeUngradedEnabled = opt.checked;
    if (!whatIfEnabled) return;

    document.querySelectorAll(".halo-whatif-input").forEach((inp) => {
      const key = inp.dataset.haloKey || "";
      const base = key ? originalScores.get(key) : null;
      if (!base?.wasEmpty) return;

      if (excludeUngradedEnabled) {
        base.userIncluded = false;
        base.savedUngradedValue = inp.value;
        inp.value = "";
        inp.placeholder = "0";
        inp.classList.add("halo-ungraded-excluded");
        getScoreCellFromEl(inp)?.classList.add("halo-ungraded-excluded");
      } else {
        // If we have a saved value (usually the pre-exclude "assume full credit"), restore it.
        // Otherwise (e.g., exclude was enabled before this What-If session), fall back to full credit.
        if (base.savedUngradedValue !== null) {
          inp.value = base.savedUngradedValue;
          base.savedUngradedValue = null;
        } else if ((inp.value || "").trim() === "") {
          inp.value = String(base.total);
        }
        inp.placeholder = "";
        inp.classList.remove("halo-ungraded-excluded");
        getScoreCellFromEl(inp)?.classList.remove("halo-ungraded-excluded");
      }
    });

    recalc();
  });

  const optText = document.createElement("span");
  optText.textContent = "Exclude ungraded";

  optLabel.appendChild(opt);
  optLabel.appendChild(optText);
  optWrap.appendChild(optLabel);

  const label = getLabelEl(card);
  if (label?.parentElement) {
    label.parentElement.appendChild(btn);
    label.parentElement.appendChild(optWrap);
  } else {
    card.appendChild(btn);
    card.appendChild(optWrap);
  }
}

function removeButton() {
  const btn = document.getElementById("toggle-whatif-btn");
  if (btn) btn.remove();

  const optWrap = document.getElementById("halo-whatif-options");
  if (optWrap) optWrap.remove();

  const lCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const lbl = getLabelEl(lCard);
  if (lbl) lbl.textContent = "Overall Grade";

  disableWhatIf();
  whatIfEnabled = false;
  excludeUngradedEnabled = false;
  window.removeEventListener("resize", scheduleEnableWhatIf);
  disconnectGradebookObserver();
}

// ---------- SPA Navigation Handling ----------

function checkURLChange() {
  const cur = location.pathname;
  if (cur !== lastPath) {
    lastPath = cur;
    if (cur.includes("/gradebook")) {
      setTimeout(insertButtonInGradeCard, 800);
    } else {
      removeButton();
    }
  }
}

// ---------- Initialization ----------

window.addEventListener("load", () => {
  if (location.pathname.includes("/gradebook")) {
    setTimeout(insertButtonInGradeCard, 800);
  }
  checkURLChange();
});

setInterval(checkURLChange, 500);
