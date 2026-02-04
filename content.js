console.log("Halo Grade Enhancer active");

// ---------- State Variables ----------

let whatIfEnabled = false;
let excludeUngradedEnabled = false; // when true, omit originally-ungraded assignments from numerator/denominator
let lastPath = location.pathname;
const originalScores = new Map(); // index -> row state
let originalPointsCard = { earned: null, total: null };
let originalPercentCard = { value: null };
let originalLetterGrade = null;

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

// Best-effort: find a "status" badge near the row that contains the score cell.
// Example: <div data-testid="status" ...>Published</div>
function findStatusEl(fromEl) {
  const row = fromEl?.closest?.("tr");
  const inRow = row?.querySelector?.("[data-testid='status']");
  if (inRow) return inRow;

  let el = fromEl;
  for (let depth = 0; el && depth < 10; depth += 1) {
    const st = el.querySelector?.("[data-testid='status']");
    if (st) return st;
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

  if (whatIfEnabled) enableWhatIf();
  else disableWhatIf();
}

// ---------- Enable What-If Mode ----------

function enableWhatIf() {
  const cells = document.querySelectorAll("td[data-testid$='_score']");

  if (!cells.length) {
    return setTimeout(enableWhatIf, 800);
  }

  // Save original cards
  const pointsCard = getCardByLabel("Points Earned");
  if (pointsCard) {
    const e = pointsCard.querySelector("[data-testid='student_scored_points']");
    const t = pointsCard.querySelector(".Points_totalPoints__0YI7s");
    if (e && t) {
      originalPointsCard.earned = e.textContent.trim();
      originalPointsCard.total = t.textContent.trim();
    }
  }

  const percentCard = getCardByLabel("Percentage");
  if (percentCard) {
    const span = percentCard.querySelector("[data-testid='student_scored_points']");
    if (span) originalPercentCard.value = span.textContent.trim();
  }

  const letterCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const letterEl = letterCard?.querySelector("[data-testid='student_scored_points']");
  if (letterEl) originalLetterGrade = letterEl.textContent.trim();

  cells.forEach((cell, i) => {
    if (cell.querySelector(".halo-whatif-input")) return;

    const scored = cell.querySelector("[data-testid='student_scored_points']");
    const totalEl = cell.querySelector(".Points_totalPoints__0YI7s:not(.AssessmentTable_score__Exj27)");
    if (!scored || !totalEl) return;

    const total = parseFloat(totalEl.textContent) || 0;
    const match = cell.textContent.match(/(\d+(\.\d+)?)\s*\/\s*\d+/);

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

    const prev = originalScores.get(i);

    let earned;
    // If re-entering What-If and we previously marked it ungraded, keep the "assume full credit" behavior
    if (prev?.wasEmpty) earned = total;
    else if (match) earned = parseFloat(match[1]);
    else earned = total;

    if (isNaN(earned) || earned < 0) earned = 0;

    const percentSpan = cell.querySelector(".Points_totalPoints__0YI7s.AssessmentTable_score__Exj27");
    const originalHTML = scored.innerHTML;

    originalScores.set(i, {
      earned,
      total,
      percentEl: percentSpan,
      percentText: percentSpan ? percentSpan.textContent : "",
      originalHTML,
      wasEmpty,
      userIncluded: false,
      savedUngradedValue: null,
    });

    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.max = String(total);
    inp.step = "0.01";
    inp.className = "halo-whatif-input";
    inp.value = earned;
    inp.dataset.haloIndex = String(i);

    if (excludeUngradedEnabled && wasEmpty) {
      // If exclude mode is already enabled on entry, we still want the ability to toggle it off
      // and return to the default "assume full credit" behavior for ungraded rows.
      const base = originalScores.get(i);
      if (base && base.savedUngradedValue === null) {
        base.savedUngradedValue = String(earned);
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

      const idx = parseInt(inp.dataset.haloIndex || "", 10);
      const base = originalScores.get(idx);
      if (base?.wasEmpty && excludeUngradedEnabled) {
        base.userIncluded = true; // allow explicit 0 to count
        base.savedUngradedValue = null;
        inp.classList.remove("halo-ungraded-excluded");
        inp.placeholder = "";
        inp.closest("td")?.classList.remove("halo-ungraded-excluded");
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
    const parent = inp.parentElement;
    const idx = parseInt(inp.dataset.haloIndex || "", 10);
    inp.remove();

    const o = originalScores.get(idx);
    if (!o || !parent) return;

    parent.innerHTML = o.originalHTML;
    parent.closest("td")?.classList.remove("halo-ungraded-excluded");

    if (o.percentEl) o.percentEl.textContent = o.percentText;
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
  document.body.classList.remove("halo-whatif-active");
}

// ---------- Recalculate Grades ----------

function recalc() {
  let earned = 0;
  let possible = excludeUngradedEnabled ? 0 : 1000;

  document.querySelectorAll(".halo-whatif-input").forEach((inp) => {
    const idx = parseInt(inp.dataset.haloIndex || "", 10);
    const base = originalScores.get(idx);
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
  document.querySelectorAll("td[data-testid$='_score']").forEach((cell, i) => {
    const inp = cell.querySelector(".halo-whatif-input");
    const base = originalScores.get(i);
    if (!inp || !base) return;

    const percentSpan = cell.querySelector(".Points_totalPoints__0YI7s.AssessmentTable_score__Exj27");

    if (excludeUngradedEnabled && base.wasEmpty && !base.userIncluded) {
      if (percentSpan) percentSpan.textContent = base.percentText;
      inp.classList.add("halo-ungraded-excluded");
      cell.classList.add("halo-ungraded-excluded");
      return;
    }

    inp.classList.remove("halo-ungraded-excluded");
    cell.classList.remove("halo-ungraded-excluded");

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
      const idx = parseInt(inp.dataset.haloIndex || "", 10);
      const base = originalScores.get(idx);
      if (!base?.wasEmpty) return;

      if (excludeUngradedEnabled) {
        base.userIncluded = false;
        base.savedUngradedValue = inp.value;
        inp.value = "";
        inp.placeholder = "0";
        inp.classList.add("halo-ungraded-excluded");
        inp.closest("td")?.classList.add("halo-ungraded-excluded");
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
        inp.closest("td")?.classList.remove("halo-ungraded-excluded");
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
