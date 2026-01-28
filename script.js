// script.js
const PERIOD_SECONDS = 900;

let tmCount = 2;
let opCount = 3;

let opNames = ["att neck band to body", "top stitch front neck", "att back neck tape"];

// matrix[tm][op] = CT seconds, 0 means cannot do it
let matrix = [
  [30, 15, 0],
  [0, 15, 35]
];

function $(id){ return document.getElementById(id); }

function initFromInputs(){
  tmCount = Math.max(1, Number($("tmCount").value) || 1);
  opCount = Math.max(1, Number($("opCount").value) || 1);

  const newNames = [];
  for(let j=0;j<opCount;j++){
    newNames.push(opNames[j] ?? `Operation ${j+1}`);
  }
  opNames = newNames;

  const newMatrix = [];
  for(let i=0;i<tmCount;i++){
    const row = [];
    for(let j=0;j<opCount;j++){
      const v = (matrix[i] && matrix[i][j] != null) ? matrix[i][j] : 0;
      row.push(Number(v) || 0);
    }
    newMatrix.push(row);
  }
  matrix = newMatrix;
}

function buildTable(){
  initFromInputs();

  const wrap = $("matrixWrap");
  wrap.innerHTML = "";

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");

  const th0 = document.createElement("th");
  th0.className = "stickyLeft";
  th0.textContent = "TM \\ Operation";
  hr.appendChild(th0);

  for(let j=0;j<opCount;j++){
    const th = document.createElement("th");
    th.innerHTML = `
      <input class="opName" value="${escapeHtml(opNames[j])}"
        oninput="opNames[${j}]=this.value;calculate()"
        placeholder="Operation name" />
    `;
    hr.appendChild(th);
  }

  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for(let i=0;i<tmCount;i++){
    const tr = document.createElement("tr");

    const tdLabel = document.createElement("td");
    tdLabel.className = "stickyLeft";
    tdLabel.innerHTML = `<b>TM ${i+1}</b>`;
    tr.appendChild(tdLabel);

    for(let j=0;j<opCount;j++){
      const td = document.createElement("td");
      td.innerHTML = `
        <input class="ctInput" type="number" min="0" step="0.1"
          value="${Number(matrix[i][j]) || 0}"
          oninput="matrix[${i}][${j}]=Number(this.value)||0;calculate()"
          placeholder="CT (s)" />
      `;
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrap.appendChild(table);

  calculate();
}

function calculate(){
  const summary = $("summary");
  const result = $("result");
  result.innerHTML = "";

  // validate: each operation has at least one capable TM
  for(let j=0;j<opCount;j++){
    let ok = false;
    for(let i=0;i<tmCount;i++){
      if((Number(matrix[i][j]) || 0) > 0) ok = true;
    }
    if(!ok){
      summary.textContent = `Operation ${j+1} has no capable TM. Set CT > 0 for at least one TM.`;
      return;
    }
  }

  const U = findMaxUnits();
  const plan = buildPlanForUnits(U);
  const qty = plan.qty;

  const opTotals = computeOpTotals(qty);

  // In this mode, we target exactly U pcs per operation (no overproduction)
  const lineOutput = U;

  // time and workload per TM (based on busiest TM)
  const tmTimeUsed = computeTmTimeUsed(qty);
  const maxTime = Math.max(...tmTimeUsed, 0);
  const tmWorkload = tmTimeUsed.map(t => maxTime > 0 ? (t / maxTime) * 100 : 0);

  summary.textContent =
    `Line output ${lineOutput} units per 900s. Operation workload is shown as share of total pcs for that operation.`;

  for(let i=0;i<tmCount;i++){
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="cardTitle">
        TM ${i+1}
        <span class="badge">${fmt(tmWorkload[i])}%</span>
      </div>
      <div class="opsList">
        ${renderOpsForTM(i, qty, opTotals)}
      </div>
    `;

    result.appendChild(card);
  }
}

function renderOpsForTM(tmIndex, qty, opTotals){
  const items = [];

  for(let j=0;j<opCount;j++){
    const q = qty[tmIndex][j] || 0;
    const ct = Number(matrix[tmIndex][j]) || 0;

    if(q > 0 && ct > 0){
      const total = opTotals[j] || 0;
      const share = total > 0 ? (q / total) * 100 : 0;
      const nm = (opNames[j] || "").trim() || `Operation ${j+1}`;

      items.push(`
        <div class="pill">
          <span>${escapeHtml(nm)}</span>
          <span>${q} pcs · ${fmt(share)}%</span>
        </div>
      `);
    }
  }

  if(items.length === 0){
    return `<div class="empty">No operation assigned</div>`;
  }
  return items.join("");
}

function computeOpTotals(qty){
  const totals = Array.from({length:opCount}, ()=>0);
  for(let j=0;j<opCount;j++){
    for(let i=0;i<tmCount;i++){
      totals[j] += qty[i][j] || 0;
    }
  }
  return totals;
}

function computeTmTimeUsed(qty){
  const tmTimeUsed = Array.from({length:tmCount}, ()=>0);
  for(let i=0;i<tmCount;i++){
    let used = 0;
    for(let j=0;j<opCount;j++){
      const ct = Number(matrix[i][j]) || 0;
      used += (qty[i][j] || 0) * ct;
    }
    tmTimeUsed[i] = used;
  }
  return tmTimeUsed;
}

function findMaxUnits(){
  // upper bound from fastest TM for each operation
  let hi = 1e9;
  for(let j=0;j<opCount;j++){
    let bestCt = Infinity;
    for(let i=0;i<tmCount;i++){
      const ct = Number(matrix[i][j]) || 0;
      if(ct > 0) bestCt = Math.min(bestCt, ct);
    }
    const ub = Math.floor(PERIOD_SECONDS / bestCt);
    hi = Math.min(hi, ub);
  }
  hi = Math.max(0, hi);

  let lo = 0;
  while(lo < hi){
    const mid = Math.ceil((lo + hi) / 2);
    if(isFeasible(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function isFeasible(U){
  const rem = Array.from({length:tmCount}, ()=>PERIOD_SECONDS);

  // ops order by tightness
  const opsOrder = [];
  for(let j=0;j<opCount;j++){
    const caps = [];
    for(let i=0;i<tmCount;i++){
      const ct = Number(matrix[i][j]) || 0;
      if(ct > 0) caps.push({ i, ct });
    }
    const maxPossible = caps.reduce((s,x)=> s + Math.floor(PERIOD_SECONDS / x.ct), 0);
    opsOrder.push({ j, maxPossible });
  }
  opsOrder.sort((a,b)=>a.maxPossible - b.maxPossible);

  for(const item of opsOrder){
    const j = item.j;

    const candidates = [];
    for(let i=0;i<tmCount;i++){
      const ct = Number(matrix[i][j]) || 0;
      if(ct > 0) candidates.push({ i, ct });
    }
    candidates.sort((a,b)=>a.ct - b.ct);

    let need = U;
    for(const c of candidates){
      if(need <= 0) break;
      const maxq = Math.floor(rem[c.i] / c.ct);
      const take = Math.min(maxq, need);
      rem[c.i] -= take * c.ct;
      need -= take;
    }
    if(need > 0) return false;
  }

  return true;
}

/*
  Build plan to produce exactly U pcs for EVERY operation (no overproduction),
  while minimizing the maximum TM workload (balancing used time).

  Greedy strategy (per piece):
  - For each operation, assign next piece to TM with lowest current used time
    (tie-break: smaller CT).
*/
function buildPlanForUnits(U){
  const qty = Array.from({length:tmCount}, ()=>Array.from({length:opCount}, ()=>0));
  const used = Array.from({length:tmCount}, ()=>0);

  // order operations by tightness to avoid dead ends
  const opsOrder = [];
  for(let j=0;j<opCount;j++){
    const caps = [];
    for(let i=0;i<tmCount;i++){
      const ct = Number(matrix[i][j]) || 0;
      if(ct > 0) caps.push({ i, ct });
    }
    const maxPossible = caps.reduce((s,x)=> s + Math.floor(PERIOD_SECONDS / x.ct), 0);
    opsOrder.push({ j, maxPossible });
  }
  opsOrder.sort((a,b)=>a.maxPossible - b.maxPossible);

  for(const item of opsOrder){
    const j = item.j;

    const capable = [];
    for(let i=0;i<tmCount;i++){
      const ct = Number(matrix[i][j]) || 0;
      if(ct > 0) capable.push({ i, ct });
    }

    let produced = 0;
    while(produced < U){
      let best = -1;
      let bestUsed = Infinity;
      let bestCt = Infinity;

      for(const c of capable){
        const i = c.i;
        const ct = c.ct;

        if(used[i] + ct > PERIOD_SECONDS) continue;

        if(used[i] < bestUsed || (used[i] === bestUsed && ct < bestCt)){
          best = i;
          bestUsed = used[i];
          bestCt = ct;
        }
      }

      // safety: should not happen when U is feasible
      if(best === -1) break;

      qty[best][j] += 1;
      used[best] += Number(matrix[best][j]) || 0;
      produced += 1;
    }
  }

  return { qty };
}

function fmt(x){
  return (Math.round(x * 10) / 10).toFixed(1);
}

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

window.addEventListener("DOMContentLoaded", () => {
  $("buildBtn").addEventListener("click", buildTable);
  buildTable();
});
