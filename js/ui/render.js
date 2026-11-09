// ============================================================
// ui/render.js
// 화면 렌더링 전담. AppState.state 를 읽기만 한다.
// 결과 표 = 사람(행) × 월(열). 칸 하나에 PMS(위) / IRIS(아래) 참여율.
//  - 같으면 숫자 하나만, 다르면 두 숫자를 빨간 칸에.
//  - ◐ = 그 달을 다 채우지 않은 기간(예: 08/18~08/31)
// ============================================================

const VERDICT = {
  match:      { text: "일치",       cls: "v-ok",     icon: "check" },
  "avg-match":{ text: "연평균 일치", cls: "v-ok",     icon: "check" },
  mismatch:   { text: "불일치",     cls: "v-bad",    icon: "x" },
  review:     { text: "확인 필요",   cls: "v-warn",   icon: "alert" },
  duplicate:  { text: "동명이인",    cls: "v-warn",   icon: "alert" },
  pmsOnly:    { text: "PMS에만",    cls: "v-side",   icon: "minus" },
  irisOnly:   { text: "IRIS에만",   cls: "v-side",   icon: "minus" },
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
  const hasPms = !!AppState.fileOf("PMS");
  const hasIris = !!AppState.fileOf("IRIS");
  btn.disabled = !(hasPms && hasIris);
  if (!AppState.state.files.length) { hint.textContent = ""; AppCore.stepper.set(1); return; }
  if (hasPms && hasIris) { hint.textContent = ""; AppCore.stepper.set(2); return; }
  hint.textContent = hasPms ? "IRIS 참여연구자 엑셀도 올려주세요." : hasIris ? "PMS 참여인력 엑셀도 올려주세요." : "PMS·IRIS 참여인력 엑셀이 각각 1개씩 필요합니다.";
  AppCore.stepper.set(1);
}

// ---------------- 결과: 요약 ----------------

function buildSummaryHtml(result) {
  const s = result.summary;
  const m = result.irisMeta;
  const others = Object.entries(m.otherOrgCounts || {});
  const range = result.monthKeys.length
    ? `${result.monthKeys[0].replace("-", ".")} ~ ${result.monthKeys[result.monthKeys.length - 1].replace("-", ".")}`
    : "";
  const tile = (cls, label, value, sub = "") =>
    `<div class="sum-tile ${cls}"><div class="l">${label}</div><div class="v">${value}<span class="u">명</span></div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
  return `
    <div class="sum-head">
      <div class="sum-title">
        ${result.projectCode ? `<span class="proj-code">${escapeHtml(result.projectCode)}</span>` : ""}
        <span class="sum-meta">ETRI 참여자 ${s.total}명 · ${range}</span>
      </div>
      <div class="sum-tiles">
        ${tile("t-ok", "일치", s.match, s.avgMatch ? `연평균 입력 ${s.avgMatch}명 포함` : "")}
        ${tile("t-bad", "불일치", s.mismatch, result.hasAgreement ? `협약사업 기준 불일치 ${s.agreementMismatch}명` : "")}
        ${tile("t-warn", "확인 필요", s.review, "동명이인·한 달 내 혼합")}
        ${tile("t-side", "한쪽에만", s.oneSide)}
      </div>
    </div>
    ${others.length ? `<div class="iris-scope">${icon("info")} IRIS 전체 ${m.totalCount}명 중 한국전자통신연구원 ${m.targetCount}명만 대조했어요. 제외: ${others.map(([o, n]) => `${escapeHtml(o)} ${n}`).join(" · ")}</div>` : ""}
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

function cellHtml(c, internalMonths, key) {
  const warnDot = internalMonths && internalMonths.has(key) ? `<span class="int-dot" title="PMS 내부 불일치 달">!</span>` : "";
  if (!c || c.status === "none") return `<td class="mc m-none">${warnDot}<span class="dash">·</span></td>`;
  const partial = c.partial ? `<span class="half" aria-label="부분 참여">◐</span>` : "";
  const title = escapeHtml(`${segTitle(c.base, "PMS")}\n${segTitle(c.iris, "IRIS")}`);
  if (c.status === "match") {
    return `<td class="mc m-ok${c.partial ? " is-partial" : ""}" title="${title}">${warnDot}<span class="one">${num(c.base.rate)}</span>${partial}</td>`;
  }
  const cls = c.status === "review" ? "m-warn" : "m-bad";
  return `<td class="mc ${cls}${c.partial ? " is-partial" : ""}" title="${title}">${warnDot}
    <span class="two"><span class="p">${c.base ? irisText(c.base) : "–"}</span><span class="i">${irisText(c.iris)}</span></span>${partial}</td>`;
}

function oneSideCells(months, keys, side) {
  return keys.map((k) => {
    const info = months[k];
    if (!info || info.rate === 0) return `<td class="mc m-none"><span class="dash">·</span></td>`;
    const partial = info.partial ? `<span class="half">◐</span>` : "";
    const text = irisText(info);
    return `<td class="mc m-side" title="${escapeHtml(segTitle(info, side))}"><span class="two"><span class="p">${side === "PMS" ? text : "–"}</span><span class="i">${side === "IRIS" ? text : "–"}</span></span>${partial}</td>`;
  }).join("");
}

function personCell(row) {
  const p = row.pms, i = row.iris;
  const sub = p ? [p.rank, p.dept].filter(Boolean).join(" · ") : (i ? [i.role, i.org].filter(Boolean).join(" · ") : "");
  const role = p ? p.role : (i ? i.role : "");
  const ended = i && i.status && i.status.replace(/\s/g, "") !== "수행중" ? `<span class="tag tag-ended">IRIS ${escapeHtml(i.status)}</span>` : "";
  return `<td class="pc">
    <div class="pn">${escapeHtml(row.name)}${/책임/.test(role) ? `<span class="tag tag-lead">책임자</span>` : ""}${ended}</div>
    ${sub ? `<div class="ps">${escapeHtml(sub)}</div>` : ""}
  </td>`;
}

function verdictCell(verdict, j) {
  const v = VERDICT[verdict] || VERDICT.review;
  let extra = "";
  if (j && verdict === "mismatch") extra = `<div class="vd-sub">${j.mismatch}개월 다름</div>`;
  return `<td class="vc"><span class="vbadge ${v.cls}">${icon(v.icon, 12)}${v.text}</span>${extra}</td>`;
}

function avgCell(j) {
  if (!j) return `<td class="ac">–</td>`;
  const same = Math.abs(j.baseAvg - j.irisAvg) < 0.005;
  return `<td class="ac${same ? "" : " ac-bad"}"><span class="p">${num(j.baseAvg)}</span><span class="i">${num(j.irisAvg)}</span></td>`;
}

function buildRowsHtml(result, basis) {
  const keys = result.monthKeys;
  const colspan = keys.length + 3;
  return result.rows.map((row) => {
    let main = "";
    let notes = row.flags.slice();

    if (row.kind === "matched") {
      const j = basis === "agreement" && row.agreement ? row.agreement : row.monthly;
      const internalMonths = new Set(row.flags.filter((f) => f.months).flatMap((f) => f.months));
      main = `<tr class="pr v-${j.verdict}">${personCell(row)}${verdictCell(j.verdict, j)}
        ${keys.map((k) => cellHtml(j.cells[k], basis === "monthly" ? internalMonths : null, k)).join("")}
        ${avgCell(j)}</tr>`;
      if (j.avgNote) notes.unshift({ level: j.verdict === "avg-match" ? "ok" : "info", text: j.avgNote });
      if (basis === "agreement" && row.pms.agreement.text) notes.push({ level: "info", text: `PMS 협약사업: ${row.pms.agreement.text}` });
      if (basis === "monthly" && row.agreement && row.agreement.verdict !== row.monthly.verdict) {
        notes.push({ level: "info", text: `협약사업 기준으로는 '${VERDICT[row.agreement.verdict].text}'이에요` });
      }
    } else if (row.kind === "pmsOnly") {
      const months = basis === "agreement" ? row.pms.agreement.months : row.pms.monthly;
      main = `<tr class="pr v-pmsOnly">${personCell(row)}${verdictCell("pmsOnly")}${oneSideCells(months, keys, "PMS")}<td class="ac">–</td></tr>`;
      notes.unshift({ level: "warn", text: "IRIS(한국전자통신연구원)에서 이 이름을 찾지 못했어요" });
    } else if (row.kind === "irisOnly") {
      main = `<tr class="pr v-irisOnly">${personCell(row)}${verdictCell("irisOnly")}${oneSideCells(row.iris.months, keys, "IRIS")}<td class="ac">–</td></tr>`;
      notes.unshift({ level: "warn", text: "PMS 참여인력 목록에 없는 사람이에요" });
    } else {
      const list = [
        ...row.pms.map((p) => `PMS ${escapeHtml(p.empNo || "")} ${escapeHtml(p.dept || "")}`),
        ...row.iris.map((i) => `IRIS 국가연구자번호 ${escapeHtml(i.researcherNo || "-")}`),
      ].join(" / ");
      main = `<tr class="pr v-duplicate">${personCell(row)}${verdictCell("duplicate")}<td class="dup-cell" colspan="${keys.length + 1}">${list}</td></tr>`;
    }

    const notesHtml = notes.length
      ? `<tr class="note-row"><td colspan="${colspan}"><div class="notes">${notes.map((n) =>
          `<span class="nt nt-${n.level}">${icon(n.level === "warn" ? "alert" : n.level === "ok" ? "check" : "info", 12)}${escapeHtml(n.text)}</span>`).join("")}</div></td></tr>`
      : "";
    return main + notesHtml;
  }).join("");
}

function buildTableHtml(result, basis) {
  const keys = result.monthKeys;
  let lastYear = "";
  const monthHeads = keys.map((k) => {
    const y = k.slice(0, 4);
    const showYear = y !== lastYear;
    lastYear = y;
    return `<th class="mh">${showYear ? `<span class="yr">${y.slice(2)}년</span>` : ""}${monthLabel(k)}</th>`;
  }).join("");
  return `
    <div class="table-wrap">
      <table class="grid">
        <thead><tr>
          <th class="pc-h">참여자</th><th class="vc-h">판정</th>${monthHeads}
          <th class="ac-h" title="참여기간 내 참여율 합 ÷ 참여 개월수">평균</th>
        </tr></thead>
        <tbody>${buildRowsHtml(result, basis)}</tbody>
      </table>
    </div>`;
}

function buildLegendHtml() {
  return `<div class="legend">
    <span class="lg"><span class="sw sw-ok">50</span>일치</span>
    <span class="lg"><span class="sw sw-bad"><span class="p">10</span><span class="i">50</span></span>불일치 (위 PMS · 아래 IRIS)</span>
    <span class="lg"><span class="sw sw-warn">◐</span>그 달 일부만 참여 (마우스를 올리면 날짜)</span>
    <span class="lg"><span class="sw sw-int">!</span>PMS 안에서 서로 다른 달</span>
  </div>`;
}

function buildBasisToggle(result) {
  const b = AppState.state.basis;
  const agreementCount = result.summary.agreementMismatch;
  return `<div class="basis-toggle" role="tablist">
    <button role="tab" class="${b === "monthly" ? "on" : ""}" data-basis="monthly">월별 인건비 참여율 기준</button>
    ${result.hasAgreement ? `<button role="tab" class="${b === "agreement" ? "on" : ""}" data-basis="agreement">협약사업 기준${agreementCount ? ` <span class="cnt">${agreementCount}</span>` : ""}</button>` : ""}
  </div>`;
}

function renderResultArea() {
  const result = AppState.state.lastResult;
  if (!result) return;
  $("#resultArea").innerHTML = buildBasisToggle(result) + buildLegendHtml() + buildTableHtml(result, AppState.state.basis);
  document.querySelectorAll("[data-basis]").forEach((btn) => {
    btn.addEventListener("click", () => { AppState.state.basis = btn.dataset.basis; renderResultArea(); });
  });
}

function renderResults(result) {
  $("#errorArea").innerHTML = "";
  if (!result.ok) {
    AppCore.error.show(result.error, "errorArea");
    return;
  }
  AppState.state.resultShown = true;
  AppState.state.lastResult = result;
  AppState.state.basis = "monthly";
  AppCore.stepper.set(3);
  $("#summaryArea").innerHTML = buildSummaryHtml(result);
  renderResultArea();
  $("#uploadCard").style.display = "none";
  $("#resultCard").style.display = "block";
  $("#resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
}
