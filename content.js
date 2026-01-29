console.log("Halo Grade Enhancer active");

// ---------- State Variables ----------

let whatIfEnabled = false;
let lastPath = location.pathname;
const originalScores = new Map();
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

  return getAllGradeCards().find(card => {
    const label = card.querySelector(".GradingScoreCard_scoreLabel__QfYiM");
    const text = label ? label.textContent.trim() : "";
    return arr.includes(text);
  });
}

// Get the label element from a card
function getLabelEl(card) {
  return card ? card.querySelector(".GradingScoreCard_scoreLabel__QfYiM") : null;
}


// ---------- Toggle What-If Mode ----------

// Enable or disable What-If mode
function toggleWhatIf() {
  whatIfEnabled = !whatIfEnabled;

  // Update button appearance
  const btn = document.getElementById("toggle-whatif-btn");
  if (btn) {
    btn.textContent = whatIfEnabled ? "Exit What-If Mode" : "Enter What-If Mode";
    btn.classList.toggle("active", whatIfEnabled);
  }

  // Update grade card label
  const labelCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const label = getLabelEl(labelCard);

  if (label) {
    label.textContent = whatIfEnabled ? "What-If Grade" : "Overall Grade";
  }

  // Toggle global CSS class
  document.body.classList.toggle("halo-whatif-active", whatIfEnabled);

  // Enable or disable mode
  if (whatIfEnabled) enableWhatIf();
  else disableWhatIf();
}


// ---------- Enable What-If Mode ----------

// Convert grade cells into editable inputs
function enableWhatIf() {

  // Find all score cells
  const cells = document.querySelectorAll("td[data-testid$='_score']");

  // Retry if not loaded yet
  if (!cells.length) {
    return setTimeout(enableWhatIf, 800);
  }

  // ----- Save original Points Earned card -----

  const pointsCard = getCardByLabel("Points Earned");

  if (pointsCard) {
    const e = pointsCard.querySelector("[data-testid='student_scored_points']");
    const t = pointsCard.querySelector(".Points_totalPoints__0YI7s");

    if (e && t) {
      originalPointsCard.earned = e.textContent.trim();
      originalPointsCard.total = t.textContent.trim();
    }
  }

  // ----- Save original Percentage card -----

  const percentCard = getCardByLabel("Percentage");

  if (percentCard) {
    const span = percentCard.querySelector("[data-testid='student_scored_points']");

    if (span) {
      originalPercentCard.value = span.textContent.trim();
    }
  }

  // ----- Save original Letter Grade -----

  const letterCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const letterEl = letterCard?.querySelector("[data-testid='student_scored_points']");

  if (letterEl) {
    originalLetterGrade = letterEl.textContent.trim();
  }

  // ----- Replace scores with inputs -----

  cells.forEach((cell, i) => {

    // Skip if already converted
    if (cell.querySelector(".halo-whatif-input")) return;

    const scored = cell.querySelector("[data-testid='student_scored_points']");
    const totalEl = cell.querySelector(".Points_totalPoints__0YI7s:not(.AssessmentTable_score__Exj27)");

    if (!scored || !totalEl) return;

    // Parse total points
    const total = parseFloat(totalEl.textContent) || 0;

    // Extract earned points from text
    const match = cell.textContent.match(/(\d+(\.\d+)?)\s*\/\s*\d+/);

    // Check stored state (if re-entering What-If)
    const prev = originalScores.get(i);

    let earned;

    // If ungraded → assume full credit
    if (prev?.wasEmpty) {
      earned = total;
    }
    // If graded → use real score
    else if (match) {
      earned = parseFloat(match[1]);
    }
    // Fallback
    else {
      earned = total;
    }


    if (isNaN(earned) || earned < 0) earned = 0;

    // Store percentage element
    const percentSpan = cell.querySelector(".Points_totalPoints__0YI7s.AssessmentTable_score__Exj27");

    // Save original row data
    const originalHTML = scored.innerHTML;

    const wasEmpty =
      scored.textContent.includes("NoScore") ||
      scored.textContent.trim() === "-" ||
      scored.textContent.trim() === "";

    originalScores.set(i, {
      earned,
      total,
      percentEl: percentSpan,
      percentText: percentSpan ? percentSpan.textContent : "",
      originalHTML,
      wasEmpty
    });


    // Create input field
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.max = String(total);
    inp.step = "0.01";
    inp.className = "halo-whatif-input";
    inp.value = earned;

    // Recalculate on change
    inp.addEventListener("input", () => {
      let val = parseFloat(inp.value);

      if (isNaN(val)) val = 0;

      // Clamp between 0 and total
      val = Math.max(0, Math.min(val, total));

      inp.value = val;

      recalc();
    });


    // Replace score with input
    scored.textContent = "";
    scored.appendChild(inp);
  });

  // ----- Set Points Card to /1000 -----

  const pointsCard2 = getCardByLabel("Points Earned");

  if (pointsCard2) {
    const e = pointsCard2.querySelector("[data-testid='student_scored_points']");
    const t = pointsCard2.querySelector(".Points_totalPoints__0YI7s");

    if (e && t) {
      const val = parseFloat(originalPointsCard.earned) || 0;
      e.textContent = val.toFixed(2);
      t.textContent = "1000";
    }
  }

  // Initial calculation
  recalc();
}


// ---------- Disable What-If Mode ----------

// Restore original grade values
function disableWhatIf() {

  // Restore each input back to text
  document.querySelectorAll(".halo-whatif-input").forEach((inp, i) => {

    const parent = inp.parentElement;
    inp.remove();

    const o = originalScores.get(i);

    if (!o || !parent) return;

    parent.innerHTML = o.originalHTML;

    if (o.percentEl) {
      o.percentEl.textContent = o.percentText;
    }
  });

  // Restore Points card
  const pCard = getCardByLabel("Points Earned");

  if (pCard && originalPointsCard.earned && originalPointsCard.total) {

    const e = pCard.querySelector("[data-testid='student_scored_points']");
    const t = pCard.querySelector(".Points_totalPoints__0YI7s");

    if (e && t) {
      e.textContent = originalPointsCard.earned;
      t.textContent = originalPointsCard.total;
    }
  }

  // Restore Percentage card
  const percentCard = getCardByLabel("Percentage");

  if (percentCard && originalPercentCard.value) {

    const span = percentCard.querySelector("[data-testid='student_scored_points']");

    if (span) span.textContent = originalPercentCard.value;
  }

  // Restore Letter grade
  const letterCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const letterEl = letterCard?.querySelector("[data-testid='student_scored_points']");

  if (letterEl && originalLetterGrade) {
    letterEl.textContent = originalLetterGrade;
  }

  // Clear stored data
  originalScores.clear();

  document.body.classList.remove("halo-whatif-active");
}


// ---------- Recalculate Grades ----------

// Recompute totals and grades
function recalc() {

  let earned = 0;
  let possible = 1000;

  // Sum all input values
  document.querySelectorAll(".halo-whatif-input").forEach(inp => {
    const e = parseFloat(inp.value);
    if (!isNaN(e)) earned += e;
  });

  const pct = (earned / possible) * 100;

  // ----- Update Letter Grade -----

  const letterCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const letterEl = letterCard?.querySelector("[data-testid='student_scored_points']");

  if (letterEl) {

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

  // ----- Update Points Card -----

  const pCard = getCardByLabel("Points Earned");

  const eEl = pCard?.querySelector("[data-testid='student_scored_points']");
  const tEl = pCard?.querySelector(".Points_totalPoints__0YI7s");

  if (eEl && tEl) {
    eEl.textContent = earned.toFixed(2);
    tEl.textContent = "1000";
  }

  // ----- Update Percentage Card -----

  const percentCard = getCardByLabel("Percentage");
  const pEl = percentCard?.querySelector("[data-testid='student_scored_points']");

  if (pEl) {
    pEl.textContent = `${pct.toFixed(2)}%`;
  }

  // ----- Update Row Percentages -----

  const rows = document.querySelectorAll("td[data-testid$='_score']");

  rows.forEach((cell, i) => {

    const inp = cell.querySelector(".halo-whatif-input");
    const base = originalScores.get(i);

    if (!base) return;

    const total = base.total;
    const eVal = inp ? parseFloat(inp.value) : NaN;

    const percent =
      !isNaN(eVal) && total > 0
        ? ((eVal / total) * 100).toFixed(0)
        : 0;

    if (base.percentEl) {
      base.percentEl.textContent = `(${percent}%)`;
    }
  });
}


// ---------- Button Injection ----------

// Insert toggle button into grade card
function insertButtonInGradeCard(retries = 20) {

  if (document.getElementById("toggle-whatif-btn")) return;

  // Find main grade card
  const card =
    getCardByLabel(["Overall Grade", "What-If Grade"]) ||
    getAllGradeCards()[0];

  // Retry if not loaded
  if (!card) {

    if (retries > 0) {
      return setTimeout(() => insertButtonInGradeCard(retries - 1), 300);
    }

    return;
  }

  // Create button
  const btn = document.createElement("button");

  btn.id = "toggle-whatif-btn";
  btn.textContent = "Enter What-If Mode";
  btn.addEventListener("click", toggleWhatIf);

  // Insert near label
  const label = getLabelEl(card);

  if (label?.parentElement) {
    label.parentElement.appendChild(btn);
  } else {
    card.appendChild(btn);
  }
}


// Remove toggle button
function removeButton() {

  const btn = document.getElementById("toggle-whatif-btn");
  if (btn) btn.remove();

  const lCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const lbl = getLabelEl(lCard);

  if (lbl) lbl.textContent = "Overall Grade";

  disableWhatIf();
  whatIfEnabled = false;
}


// ---------- SPA Navigation Handling ----------

// Detect URL changes in Halo SPA
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

// Run on page load
window.addEventListener("load", () => {

  if (location.pathname.includes("/gradebook")) {
    setTimeout(insertButtonInGradeCard, 800);
  }

  checkURLChange();
});

// Poll for URL changes (SPA fallback)
setInterval(checkURLChange, 500);
