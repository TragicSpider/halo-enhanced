console.log("Halo Grade Enhancer active");

let whatIfEnabled = false;
let lastPath = location.pathname;
const originalScores = new Map();
let originalPointsCard = { earned: null, total: null };
let originalPercentCard = { value: null };
let originalLetterGrade = null;

// ---------- Helpers ----------
function getAllGradeCards() {
  return Array.from(document.querySelectorAll(".GradingScoreCard_scoreCard__YO7GJ"));
}

function getCardByLabel(labels) {
  const arr = Array.isArray(labels) ? labels : [labels];
  return getAllGradeCards().find(card => {
    const label = card.querySelector(".GradingScoreCard_scoreLabel__QfYiM");
    const text = label ? label.textContent.trim() : "";
    return arr.includes(text);
  });
}

function getLabelEl(card) {
  return card ? card.querySelector(".GradingScoreCard_scoreLabel__QfYiM") : null;
}

// ---------- Toggle What-If ----------
function toggleWhatIf() {
  whatIfEnabled = !whatIfEnabled;
  const btn = document.getElementById("toggle-whatif-btn");
  if (btn) {
    btn.textContent = whatIfEnabled ? "Exit What-If Mode" : "Enter What-If Mode";
    btn.classList.toggle("active", whatIfEnabled);
  }

  const labelCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const label = getLabelEl(labelCard);
  if (label) label.textContent = whatIfEnabled ? "What-If Grade" : "Overall Grade";

  document.body.classList.toggle("halo-whatif-active", whatIfEnabled);

  if (whatIfEnabled) enableWhatIf();
  else disableWhatIf();
}

// ---------- Enable What-If ----------
function enableWhatIf() {
  const cells = document.querySelectorAll("td[data-testid$='_score']");
  if (!cells.length) return setTimeout(enableWhatIf, 800);

  // Save top cards
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

  // Add editable inputs
  cells.forEach((cell, i) => {
    if (cell.querySelector(".halo-whatif-input")) return;

    const scored = cell.querySelector("[data-testid='student_scored_points']");
    const totalEl = cell.querySelector(".Points_totalPoints__0YI7s:not(.AssessmentTable_score__Exj27)");
    if (!scored || !totalEl) return;

    const total = parseFloat(totalEl.textContent) || 0;
    const match = cell.textContent.match(/(\d+(\.\d+)?)\s*\/\s*\d+/);
    let earned = match ? parseFloat(match[1]) : 0;
    if (isNaN(earned) || earned < 0) earned = 0;

    const percentSpan = cell.querySelector(".Points_totalPoints__0YI7s.AssessmentTable_score__Exj27");
    originalScores.set(i, {
      earned,
      total,
      percentEl: percentSpan,
      percentText: percentSpan ? percentSpan.textContent : ""
    });

    const inp = document.createElement("input");
    inp.type = "number";
    inp.className = "halo-whatif-input";
    inp.value = earned > 0 ? earned : 0;
    inp.addEventListener("input", recalc);

    scored.textContent = "";
    scored.appendChild(inp);
  });

  // Set /1000 total immediately
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

  recalc();
}

// ---------- Disable What-If ----------
function disableWhatIf() {
  document.querySelectorAll(".halo-whatif-input").forEach((inp, i) => {
    const parent = inp.parentElement;
    inp.remove();
    const o = originalScores.get(i);
    if (!o || !parent) return;

    parent.textContent = o.earned > 0 ? o.earned : "-";
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

// ---------- Recalculate ----------
function recalc() {
  let earned = 0, possible = 1000;
  document.querySelectorAll(".halo-whatif-input").forEach(inp => {
    const e = parseFloat(inp.value);
    if (!isNaN(e)) earned += e;
  });
  const pct = (earned / possible) * 100;

  // Letter Grade
  const letterCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const letterEl = letterCard?.querySelector("[data-testid='student_scored_points']");
  if (letterEl) {
    const L = pct >= 97 ? "A+" :
      pct >= 93 ? "A" :
      pct >= 90 ? "A-" :
      pct >= 87 ? "B+" :
      pct >= 83 ? "B" :
      pct >= 80 ? "B-" :
      pct >= 77 ? "C+" :
      pct >= 73 ? "C" :
      pct >= 70 ? "C-" :
      pct >= 67 ? "D+" :
      pct >= 63 ? "D" :
      pct >= 60 ? "D-" : "F";
    letterEl.textContent = L;
  }

  // Points Card
  const pCard = getCardByLabel("Points Earned");
  const eEl = pCard?.querySelector("[data-testid='student_scored_points']");
  const tEl = pCard?.querySelector(".Points_totalPoints__0YI7s");
  if (eEl && tEl) {
    eEl.textContent = earned.toFixed(2);
    tEl.textContent = "1000";
  }

  // Percentage Card
  const percentCard = getCardByLabel("Percentage");
  const pEl = percentCard?.querySelector("[data-testid='student_scored_points']");
  if (pEl) pEl.textContent = `${pct.toFixed(2)}%`;

  // Inline Row Percentages
  const rows = document.querySelectorAll("td[data-testid$='_score']");
  rows.forEach((cell, i) => {
    const inp = cell.querySelector(".halo-whatif-input");
    const base = originalScores.get(i);
    if (!base) return;

    const total = base.total;
    const eVal = inp ? parseFloat(inp.value) : NaN;
    const percent = !isNaN(eVal) && total > 0 ? ((eVal / total) * 100).toFixed(0) : 0;

    if (base.percentEl) base.percentEl.textContent = `(${percent}%)`;
  });
}

// ---------- Button ----------
function insertButtonInGradeCard(retries = 20) {
  if (document.getElementById("toggle-whatif-btn")) return;

  const card =
    getCardByLabel(["Overall Grade", "What-If Grade"]) ||
    getAllGradeCards()[0];

  // If grade cards still aren't loaded, retry
  if (!card) {
    if (retries > 0)
      return setTimeout(() => insertButtonInGradeCard(retries - 1), 300);
    return;
  }

  const btn = document.createElement("button");
  btn.id = "toggle-whatif-btn";
  btn.textContent = "Enter What-If Mode";
  btn.addEventListener("click", toggleWhatIf);

  const label = getLabelEl(card);
  if (label?.parentElement) label.parentElement.appendChild(btn);
  else card.appendChild(btn);
}


function removeButton() {
  const btn = document.getElementById("toggle-whatif-btn");
  if (btn) btn.remove();

  const lCard = getCardByLabel(["Overall Grade", "What-If Grade"]);
  const lbl = getLabelEl(lCard);
  if (lbl) lbl.textContent = "Overall Grade";

  disableWhatIf();
  whatIfEnabled = false;
}

// ---------- SPA + Reload ----------
function checkURLChange() {
  const cur = location.pathname;
  if (cur !== lastPath) {
    lastPath = cur;
    if (cur.includes("/gradebook")) setTimeout(insertButtonInGradeCard, 800);
    else removeButton();
  }
}

window.addEventListener("load", () => {
  if (location.pathname.includes("/gradebook")) setTimeout(insertButtonInGradeCard, 800);
  checkURLChange();
});

setInterval(checkURLChange, 500);
