// ============================================================
// ui/render.js
// 화면 렌더링 전담. AppState.state 를 읽기만 한다.
// 결과 = 과제별 블록. 블록마다 요약 + 사람 × 월 표(한 사람 = PMS 줄 / IRIS 줄).
//  - 다른 달은 같은 열의 두 칸을 빨갛게.
//  - ◐ = 그 달을 다 채우지 않은 기간(예: 08/18~08/31)
// ============================================================

const VERDICT = {
  match:      { text: "일치",       cls: "v-ok",     icon: "check" },
  "avg-match":{ text: "연평균 일치", cls: "v-ok",     icon: "check" },
  mismatch:   { text: "불일치",     cls: "v-bad",    icon: "x" },
  period:     { text: "기간 확인",   cls: "v-warn",   icon: "alert" },
  "avg-near": { text: "평균 근사",   cls: "v-warn",   icon: "alert" },
  review:     { text: "확인 필요",   cls: "v-warn",   icon: "alert" },
  duplicate:  { text: "동명이인",    cls: "v-warn",   icon: "alert" },
  pmsOnly:    { text: "IRIS 미등록", cls: "v-side",   icon: "minus" },
  irisOnly:   { text: "PMS 미등록",  cls: "v-side",   icon: "minus" },
  nodata:     { text: "자료 없음",   cls: "v-side",   icon: "minus" },
};

const ICONS = {
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  minus: '<path d="M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
};
function icon(name, size = 13) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

function num(n) {
  if (n === null || n === undefined) return "";
  return String(Math.round(n * 100) / 100);
}

function monthLabel(key) { return `${Number(key.slice(5))}월`; }

// ---------------- 업로드 영역 ----------------

function badgeInfo(type) {
  if (type === "PMS") return { text: "PMS(내부망)", cls: "badge-pms" };
  if (type === "IRIS") return { text: "IRIS(외부)", cls: "badge-iris" };
  return { text: "⚠ 참여인력 파일이 맞는지 확인해주세요", cls: "unknown" };
}

function renderChips() {
  const wrap = $("#fileChips");
  wrap.innerHTML = AppState.state.files.map((f) => {
    let badge;
    if (f.type === "분석중") badge = `<span class="dz-badge">분석 중...</span>`;
    else if (f.type === "ERROR") badge = `<span class="dz-badge unknown">⚠ 파일을 읽을 수 없어요</span>`;
    else { const b = badgeInfo(f.type); badge = `<span class="dz-badge ${b.cls}">${b.text}</span>`; }
    return `
      <div class="file-chip">
        <span class="fc-icon">📄</span>
        <span class="fc-name">${escapeHtml(f.name)}</span>
        ${badge}
        <button class="fc-remove" data-remove="${f.id}" title="제거" aria-label="${escapeHtml(f.name)} 파일 제거">✕</button>
      </div>`;
  }).join("");
  wrap.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removeFile(Number(btn.dataset.remove)));
  });
}

function updateRunState() {
  const hint = $("#uploadHint");
  const btn = $("#runBtn");
  const label = btn.querySelector(".btn-label");
  const pmsN = AppState.filesOf("PMS").length;
  const irisN = AppState.filesOf("IRIS").length;
  const pairs = AppState.activePairs().length;
  btn.disabled = pairs === 0;
  label.textContent = pairs > 1 ? `대조 실행 (${pairs}개 과제)` : "대조 실행";
  if (!AppState.state.files.length) { hint.textContent = ""; AppCore.stepper.set(1); return; }
  if (!pmsN || !irisN) {
    hint.textContent = pmsN ? "IRIS 참여연구자 엑셀도 올려주세요." : irisN ? "PMS 참여인력 엑셀도 올려주세요." : "PMS·IRIS 참여인력 엑셀이 필요합니다.";
    AppCore.stepper.set(1);
    return;
  }
  hint.textContent = pairs ? "" : "짝이 지어진 과제가 없어요. 아래에서 IRIS 파일을 골라주세요.";
  AppCore.stepper.set(pairs ? 2 : 1);
}

// PMS 파일마다 한 줄: [과제번호] 파일명 ↔ IRIS 선택 (이름 겹침 n/m명)
function renderPairs() {
  const wrap = $("#pairArea");
  const pmsList = AppState.filesOf("PMS");
  const irisList = AppState.filesOf("IRIS");
  if (!pmsList.length || !irisList.length) { wrap.innerHTML = ""; return; }
  const usedCount = {};
  for (const p of pmsList) {
    const id = AppState.state.pairs[p.id];
    if (id) usedCount[id] = (usedCount[id] || 0) + 1;
  }
  const rows = pmsList.map((p) => {
    const chosen = AppState.state.pairs[p.id] || 0;
    const code = p.parsed && p.parsed.ok ? p.parsed.meta.projectCode : "";
    const irisFile = chosen ? AppState.fileById(chosen) : null;
    const ov = irisFile ? Compare.nameOverlap(p.parsed, irisFile.parsed) : null;
    let status;
    if (!chosen) status = `<span class="pr-st st-none">대조 안 함</span>`;
    else if (ov.ratio >= 0.5) status = `<span class="pr-st st-ok">일치 ${ov.common}명</span>`;
    else status = `<span class="pr-st st-bad">일치 ${ov.common}명 (PMS ${ov.total}명 중) — 다른 과제 아닐까요?</span>`;
    if (chosen && usedCount[chosen] > 1) status += `<span class="pr-st st-bad">같은 IRIS 파일을 두 과제에 골랐어요</span>`;
    const options = [`<option value="0"${chosen ? "" : " selected"}>— 대조 안 함 —</option>`,
      ...irisList.map((i) => {
        const o = Compare.nameOverlap(p.parsed, i.parsed);
        return `<option value="${i.id}"${i.id === chosen ? " selected" : ""}>${escapeHtml(i.name)} (일치 ${o.common}명)</option>`;
      })].join("");
    return `<div class="pair-row">
      <div class="pr-pms"><span class="dz-badge badge-pms">PMS</span>${code ? `<b class="pr-code">${escapeHtml(code)}</b>` : ""}<span class="pr-file" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span></div>
      <span class="pr-arrow">↔</span>
      <div class="pr-iris"><span class="dz-badge badge-iris">IRIS</span><select data-pair="${p.id}" aria-label="${escapeHtml(code || p.name)} 과제의 IRIS 파일">${options}</select></div>
      <div class="pr-status">${status}</div>
    </div>`;
  }).join("");
  const counts = pmsList.length > 1 || irisList.length > 1 ? ` <span>PMS ${pmsList.length}개 · IRIS ${irisList.length}개</span>` : "";
  wrap.innerHTML = `<div class="pair-title">대조할 과제${counts}</div>${rows}`;
  wrap.querySelectorAll("[data-pair]").forEach((sel) => {
    sel.addEventListener("change", () => setPair(Number(sel.dataset.pair), Number(sel.value)));
  });
}


// ---------------- 결과: 요약 ----------------

function projectTitle(result, item) {
  const code = result.projectCode || item.pmsName;
  return result.leaderName ? `${code} (${result.leaderName})` : code;
}

function buildSummaryHtml(result, item) {
  const s = result.summary;
  const range = result.monthKeys.length
    ? `${result.monthKeys[0].replace("-", ".")} ~ ${result.monthKeys[result.monthKeys.length - 1].replace("-", ".")}`
    : "";
  const tile = (cls, label, value, sub = "") =>
    `<div class="sum-tile ${cls}"><div class="l">${label}</div><div class="v">${value}<span class="u">명</span></div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
  return `
    <div class="sum-head">
      <div class="sum-title">
        <span class="proj-code">${escapeHtml(projectTitle(result, item))}</span>
        <span class="sum-meta">ETRI 참여자 ${s.total}명 · ${range}</span>
        <span class="sum-files">${escapeHtml(item.pmsName)} ↔ ${escapeHtml(item.irisName)}</span>
      </div>
      <div class="sum-tiles">
        ${tile("t-ok", "일치", s.match, s.avgMatch ? `연평균 입력 ${s.avgMatch}명 포함` : "")}
        ${tile("t-bad", "불일치", s.mismatch, result.hasAgreement ? `협약 기준 ${s.agreementMismatch}명` : "")}
        ${tile("t-warn", "확인 필요", s.review, s.periodOnly ? `참여기간 차이 ${s.periodOnly}명 포함` : "참여기간 차이·동명이인 등")}
        ${tile("t-side", "미등록", s.oneSide, s.oneSide ? [s.irisMissing ? `IRIS 미등록 ${s.irisMissing}명` : "", s.pmsMissing ? `PMS 미등록 ${s.pmsMissing}명` : ""].filter(Boolean).join(" · ") : "한 곳에만 있는 사람")}
      </div>
    </div>
  `;
}

// ---------------- 결과: 사람×월 표 ----------------

function irisText(info) {
  if (!info) return "–";
  if (info.mixed) return info.segments.map((s) => num(s.rate)).join("·");
  return num(info.rate);
}
function segTitle(info, label) {
  if (!info) return `${label}: 없음`;
  return `${label}: ` + info.segments.map((s) => `${Period.shortDate(s.start)}~${Period.shortDate(s.end)} ${num(s.rate)}%`).join(", ");
}

// 엑셀처럼: 한 사람 = 두 줄 (PMS 줄 / IRIS 줄). 성명·소속·판정 칸은 두 줄을 합쳐 보여준다.
// 다른 달은 같은 열의 PMS·IRIS 두 칸을 함께 빨갛게 칠한다.

function sideValue(info, otherInfo) {
  if (info && info.rate !== 0) return info.mixed ? info.segments.map((s) => num(s.rate)).join("·") : num(info.rate);
  const otherHas = otherInfo && otherInfo.rate !== 0;
  return otherHas ? `<span class="zero">0</span>` : "";
}

// pmsInfo/irisInfo: 그 달의 양쪽 정보. side: 이 칸이 보여줄 쪽("PMS"|"IRIS")
// ◐(한 달 일부만 참여)는 어느 한쪽만 부분이어도 두 칸 모두에 표시하고, 툴팁엔 양쪽 날짜를 다 보여준다.
function monthCell(cls, pmsInfo, irisInfo, side) {
  const info = side === "PMS" ? pmsInfo : irisInfo;
  const other = side === "PMS" ? irisInfo : pmsInfo;
  const has = (x) => x && x.rate !== 0;
  const isPartial = (has(pmsInfo) && pmsInfo.partial) || (has(irisInfo) && irisInfo.partial);
  const partial = isPartial ? `<span class="half" aria-label="부분 참여">◐</span>` : "";
  const title = has(pmsInfo) || has(irisInfo) ? ` title="${escapeHtml(segTitle(pmsInfo, "PMS") + "\n" + segTitle(irisInfo, "IRIS"))}"` : "";
  return `<td class="mc ${cls}"${title}>${sideValue(info, other)}${partial}</td>`;
}

// status: match | mismatch | review | none | side
function statusClass(status) {
  return { match: "m-ok", mismatch: "m-bad", review: "m-warn", period: "m-warn", side: "m-side" }[status] || "m-none";
}

function nameCell(row, rowspan) {
  const p = row.pms && !Array.isArray(row.pms) ? row.pms : null;
  const i = row.iris && !Array.isArray(row.iris) ? row.iris : null;
  const role = p ? p.role : (i ? i.role : "");
  const ended = i && i.status && i.status.replace(/\s/g, "") !== "수행중" ? `<span class="tag tag-ended">IRIS ${escapeHtml(i.status)}</span>` : "";
  const tip = [p && p.rank, p && p.empNo ? `개인번호 ${p.empNo}` : "", i && i.researcherNo ? `국가연구자번호 ${i.researcherNo}` : ""].filter(Boolean).join(" · ");
  const kind = i && i.kind ? i.kind.replace(/\s/g, "") : "";
  const kindTag = kind && kind !== "내부연구원"
    ? `<span class="tag ${kind === "학생" ? "tag-student" : "tag-kind"}" title="IRIS 참여구분">${escapeHtml(kind)}</span>` : "";
  return `<td class="pc" rowspan="${rowspan}"${tip ? ` title="${escapeHtml(tip)}"` : ""}>
    <span class="pn">${escapeHtml(row.name)}</span>${/책임/.test(role) ? `<span class="tag tag-lead">책임자</span>` : ""}${kindTag}${ended}</td>`;
}

function deptCell(row, rowspan) {
  const p = row.pms && !Array.isArray(row.pms) ? row.pms : null;
  const i = row.iris && !Array.isArray(row.iris) ? row.iris : null;
  const dept = p ? p.dept : (i ? i.org : "");
  return `<td class="dc" rowspan="${rowspan}" title="${escapeHtml(dept)}">${escapeHtml(dept)}</td>`;
}

function verdictCell(verdict, j, rowspan) {
  const v = VERDICT[verdict] || VERDICT.review;
  const extra = j && verdict === "mismatch" ? `<div class="vd-sub">${j.mismatch}개월 다름</div>` : "";
  return `<td class="vc" rowspan="${rowspan}"><span class="vbadge ${v.cls}">${icon(v.icon, 12)}${v.text}</span>${extra}</td>`;
}

function srcCell(text, cls) { return `<td class="src ${cls}">${text}</td>`; }

function avgPair(j) {
  if (!j) return ["<td class=\"ac\">–</td>", "<td class=\"ac\">–</td>"];
  const bad = Math.abs(j.baseAvg - j.irisAvg) >= 0.005 ? " ac-bad" : "";
  return [`<td class="ac${bad}">${num(j.baseAvg)}</td>`, `<td class="ac${bad}">${num(j.irisAvg)}</td>`];
}

function buildRowsHtml(result, basis) {
  const keys = result.monthKeys;
  const colspan = keys.length + 5;
  const pmsLabel = basis === "agreement" ? "PMS<small>협약</small>" : "PMS";
  return result.rows.map((row, idx) => {
    const zebra = idx % 2 ? " odd" : "";
    let html = "";
    const notes = row.flags.slice();

    if (row.kind === "matched" || row.kind === "pmsOnly" || row.kind === "irisOnly") {
      let j = null, pmsMonths = {}, irisMonths = {}, verdict = row.verdict;
      if (row.kind === "matched") {
        j = basis === "agreement" && row.agreement ? row.agreement : row.monthly;
        verdict = j.verdict;
        pmsMonths = basis === "agreement" ? row.pms.agreement.months : row.pms.monthly;
        irisMonths = row.iris.months;
        if (verdict === "avg-match" && j.avgNote) notes.unshift({ level: "ok", text: j.avgNote });
        if (verdict === "avg-near" && j.avgNote) notes.unshift({ level: "warn", text: j.avgNote });
      } else if (row.kind === "pmsOnly") {
        pmsMonths = basis === "agreement" ? row.pms.agreement.months : row.pms.monthly;
        notes.unshift({ level: "warn", text: "IRIS(한국전자통신연구원)에서 이 이름을 찾지 못했어요" });
      } else {
        irisMonths = row.iris.months;
        notes.unshift({ level: "warn", text: "PMS 참여인력 목록에 없는 사람이에요" });
      }
      const statusOf = (k) => {
        if (j && j.verdict !== "nodata") return j.cells[k] ? j.cells[k].status : "none";
        const has = (pmsMonths[k] && pmsMonths[k].rate !== 0) || (irisMonths[k] && irisMonths[k].rate !== 0);
        return has ? "side" : "none";
      };
      const [pAvg, iAvg] = avgPair(j);
      const pmsCells = keys.map((k) => monthCell(statusClass(statusOf(k)), pmsMonths[k], irisMonths[k], "PMS")).join("");
      const irisCells = keys.map((k) => monthCell(statusClass(statusOf(k)), pmsMonths[k], irisMonths[k], "IRIS")).join("");
      const span = notes.length ? 3 : 2;
      html += `<tr class="r-pms${zebra}">${nameCell(row, span)}${deptCell(row, span)}${verdictCell(verdict, j, span)}${srcCell(pmsLabel, "src-pms")}${pmsCells}${pAvg}</tr>`;
      html += `<tr class="r-iris${zebra}">${srcCell("IRIS", "src-iris")}${irisCells}${iAvg}</tr>`;
    } else {
      const list = [
        ...row.pms.map((p) => `PMS ${escapeHtml(p.empNo || "")} ${escapeHtml(p.dept || "")}`),
        ...row.iris.map((i) => `IRIS 국가연구자번호 ${escapeHtml(i.researcherNo || "-")}`),
      ].join(" / ");
      html += `<tr class="r-dup${zebra}">${nameCell(row, 1)}<td class="dc"></td>${verdictCell("duplicate", null, 1)}<td class="dup-cell" colspan="${keys.length + 2}">${list}</td></tr>`;
    }

    if (notes.length) {
      const noteSpan = row.kind === "duplicate" ? colspan : keys.length + 2;
      html += `<tr class="note-row${zebra}"><td colspan="${noteSpan}"><div class="notes">${notes.map((n) =>
        `<span class="nt nt-${n.level}">${icon(n.level === "warn" ? "alert" : n.level === "ok" ? "check" : "info", 12)}${escapeHtml(n.text)}</span>`).join("")}</div></td></tr>`;
    }
    return `<tbody class="person">${html}</tbody>`;
  }).join("");
}

function buildTableHtml(result, basis) {
  const keys = result.monthKeys;
  let lastYear = "";
  const monthHeads = keys.map((k) => {
    const y = k.slice(0, 4);
    const label = y !== lastYear ? `${y.slice(2)}.${k.slice(5)}` : monthLabel(k);
    lastYear = y;
    return `<th class="mh">${label}</th>`;
  }).join("");
  return `
    <div class="table-wrap">
      <table class="grid">
        <thead><tr>
          <th class="pc-h">성명</th><th class="dc-h">소속</th><th class="vc-h">판정</th><th class="src-h">구분</th>${monthHeads}
          <th class="ac-h" title="참여기간 내 참여율 합 ÷ 참여 개월수">평균<small>참여기간</small></th>
        </tr></thead>
        ${buildRowsHtml(result, basis)}
      </table>
    </div>`;
}

function buildLegendHtml() {
  return `<div class="legend">
    <span class="lg"><span class="sw sw-bad"></span>참여율 다름</span>
    <span class="lg"><span class="sw sw-warn"></span>참여기간 다름</span>
    <span class="lg"><span class="sw sw-half">◐</span>월 중간 참여</span>
    <span class="lg lg-unit">단위 %</span>
  </div>`;
}

// ---------------- 결과: 여러 과제 요약표 + 과제별 블록 ----------------

function buildOverviewHtml(items) {
  const rows = items.map((it, idx) => {
    if (!it.result.ok) {
      return `<tr><td>${idx + 1}</td><td class="ov-code">${escapeHtml(it.label)}</td><td colspan="6" class="ov-err">⚠ ${escapeHtml(it.result.error)}</td></tr>`;
    }
    const s = it.result.summary;
    const allOk = s.mismatch + s.review + s.oneSide === 0;
    const badge = allOk
      ? `<span class="vbadge v-ok">${icon("check", 12)}모두 일치</span>`
      : `<span class="vbadge v-bad">${icon("alert", 12)}확인할 사람 있음</span>`;
    return `<tr>
      <td>${idx + 1}</td>
      <td class="ov-code"><a href="#proj-${idx}">${escapeHtml(projectTitle(it.result, it))}</a></td>
      <td>${s.total}</td>
      <td class="ov-ok">${s.match}</td>
      <td class="${s.mismatch ? "ov-bad" : ""}">${s.mismatch}</td>
      <td class="${s.review ? "ov-warn" : ""}">${s.review}</td>
      <td class="${s.oneSide ? "ov-side" : ""}">${s.oneSide}</td>
      <td>${badge}</td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap ov-wrap"><table class="overview-grid">
    <thead><tr><th>#</th><th>과제</th><th>참여자</th><th>일치</th><th>불일치</th><th>확인 필요</th><th>미등록</th><th>결과</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function renderResultArea() {
  const items = AppState.state.lastResults;
  if (!items.length) return;
  const anyAgreement = items.some((it) => it.result.ok && it.result.hasAgreement);
  const b = AppState.state.basis;
  const toggle = `<div class="basis-toggle" role="tablist">
    <button role="tab" class="${b === "monthly" ? "on" : ""}" data-basis="monthly">실행과제 기준</button>
    ${anyAgreement ? `<button role="tab" class="${b === "agreement" ? "on" : ""}" data-basis="agreement">협약 기준</button>` : ""}
  </div>`;
  const blocks = items.map((it, idx) => {
    if (!it.result.ok) {
      return `<section class="proj-block" id="proj-${idx}"><div class="error-card">${escapeHtml(it.label)} — ${escapeHtml(it.result.error)}</div></section>`;
    }
    return `<section class="proj-block" id="proj-${idx}">${buildSummaryHtml(it.result, it)}${buildTableHtml(it.result, b)}</section>`;
  }).join("");
  $("#resultArea").innerHTML = (items.length > 1 ? buildOverviewHtml(items) : "")
    + `<div class="basis-bar">${toggle}${buildLegendHtml()}</div>` + blocks;
  document.querySelectorAll("[data-basis]").forEach((btn) => {
    btn.addEventListener("click", () => { AppState.state.basis = btn.dataset.basis; renderResultArea(); });
  });
}

function renderResults(items) {
  $("#errorArea").innerHTML = "";
  AppState.state.resultShown = true;
  AppState.state.lastResults = items;
  AppState.state.basis = "monthly";
  AppCore.stepper.set(3);
  renderResultArea();
  $("#uploadCard").style.display = "none";
  $("#resultCard").style.display = "block";
  $("#resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
}
