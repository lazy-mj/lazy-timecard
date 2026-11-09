// ============================================================
// ui/excel-export.js
// 대조 결과를 서식 있는 엑셀로 내보낸다 (테두리·머리줄 색·불일치 칸 색).
// 화면(DOM)이 아니라 Compare.run() 결과 데이터에서 직접 만든다.
//  - 요약          : 모든 과제의 사람별 판정, 평균, 비고
//  - 월별_과제번호 : 화면 표와 같은 모양 (한 사람 = PMS / PMS 협약 / IRIS 줄)
//
// 셀 서식은 무료판 SheetJS가 쓰지 못해서 쓰기에만 xlsx-js-style(window.XLSXStyle)을 쓴다.
// ============================================================

const VERDICT_TEXT = {
  match: "일치", "avg-match": "연평균 일치", mismatch: "불일치", period: "기간 확인", "avg-near": "평균 근사",
  review: "확인 필요", duplicate: "동명이인", pmsOnly: "IRIS 미등록", irisOnly: "PMS 미등록", nodata: "자료 없음",
};
const VERDICT_TONE = {
  match: "ok", "avg-match": "ok", mismatch: "bad", period: "warn", "avg-near": "warn",
  review: "warn", duplicate: "warn", pmsOnly: "side", irisOnly: "side", nodata: "side",
};

// ---------- 서식 ----------
const XS = (() => {
  const line = { style: "thin", color: { rgb: "B7C0CC" } };
  const border = { top: line, bottom: line, left: line, right: line };
  const font = (extra = {}) => ({ name: "맑은 고딕", sz: 10, ...extra });
  const fill = (rgb) => ({ patternType: "solid", fgColor: { rgb } });
  const center = { vertical: "center", horizontal: "center", wrapText: true };
  const base = { font: font(), border, alignment: center };
  const tone = {
    ok:   { fill: fill("E8F5EA"), font: font({ bold: true, color: { rgb: "2E7D32" } }) },
    bad:  { fill: fill("FDE4E4"), font: font({ bold: true, color: { rgb: "C62828" } }) },
    warn: { fill: fill("FFF4D6"), font: font({ bold: true, color: { rgb: "8A5A00" } }) },
    side: { fill: fill("F1ECFE"), font: font({ bold: true, color: { rgb: "5B21B6" } }) },
  };
  return {
    base,
    head: { ...base, fill: fill("E2E7F0"), font: font({ bold: true, color: { rgb: "1F2937" } }) },
    title: { font: font({ bold: true, sz: 13 }), alignment: { vertical: "center" } },
    left: { ...base, alignment: { vertical: "center", horizontal: "left", wrapText: true } },
    srcPms: { ...base, fill: fill("F4F6FF"), font: font({ bold: true, color: { rgb: "3A46C4" } }) },
    srcAgr: { ...base, fill: fill("F7F8FA"), font: font({ color: { rgb: "6B7280" } }) },
    srcIris: { ...base, fill: fill("F1FAF8"), font: font({ bold: true, color: { rgb: "0F766E" } }) },
    agr: { ...base, font: font({ color: { rgb: "6B7280" } }) },
    avg: { ...base, fill: fill("EEF1F6"), font: font({ bold: true }) },
    tone: (t) => ({ ...base, ...tone[t] }),
  };
})();

function monthsText(info) {
  if (!info || info.rate === 0) return "";
  const v = info.mixed ? info.segments.map((s) => s.rate).join("/") : info.rate;
  return info.partial ? `${v} ◐` : v;
}

// aoa + 같은 모양의 서식표 → 시트
function toSheet(aoa, styles, merges, cols, rows) {
  const X = window.XLSXStyle || XLSX;
  const ws = X.utils.aoa_to_sheet(aoa);
  styles.forEach((row, r) => (row || []).forEach((st, c) => {
    if (!st) return;
    const ref = X.utils.encode_cell({ r, c });
    if (!ws[ref]) ws[ref] = { t: "s", v: "" };
    ws[ref].s = st;
  }));
  if (merges && merges.length) ws["!merges"] = merges;
  if (cols) ws["!cols"] = cols;
  if (rows) ws["!rows"] = rows;
  return ws;
}

function notesOf(r) {
  const notes = r.flags.map((f) => f.text);
  if (r.monthly && r.monthly.avgNote && ["avg-match", "avg-near"].includes(r.monthly.verdict)) notes.unshift(r.monthly.avgNote);
  return notes.join("\n");
}

// ---------- 요약 시트 ----------
function buildSummarySheet(items) {
  const header = ["과제", "성명", "소속", "직급", "참여유형", "IRIS 참여구분", "IRIS 수행구분",
    "판정(실행과제 기준)", "다른 달 수", "판정(협약 기준)", "PMS 평균(%)", "IRIS 평균(%)", "IRIS 입력 기간", "비고"];
  const aoa = [header];
  const styles = [header.map(() => XS.head)];
  for (const it of items) {
    for (const r of it.result.rows) {
      const p = r.pms && !Array.isArray(r.pms) ? r.pms : null;
      const i = r.iris && !Array.isArray(r.iris) ? r.iris : null;
      const irisPeriods = i ? i.periods.map((x) => `${Period.fullDate(x.start)}~${Period.fullDate(x.end)} ${x.rate}%`).join("\n") : "";
      aoa.push([
        it.label, r.name, p ? p.dept : (i ? i.org : ""), p ? p.rank : "", p ? p.role : (i ? i.role : ""),
        i ? i.kind : "", i ? i.status : "",
        VERDICT_TEXT[r.verdict] || r.verdict,
        r.monthly && r.monthly.mismatch ? r.monthly.mismatch : "",
        r.agreement ? VERDICT_TEXT[r.agreement.verdict] : "",
        r.monthly ? r.monthly.baseAvg : "", r.monthly ? r.monthly.irisAvg : "",
        irisPeriods, notesOf(r),
      ]);
      const agrTone = r.agreement ? VERDICT_TONE[r.agreement.verdict] : null;
      styles.push([XS.base, XS.base, XS.left, XS.base, XS.base,
        i && i.kind === "학생" ? XS.tone("warn") : XS.base,
        i && i.status && i.status.replace(/\s/g, "") !== "수행중" ? XS.tone("bad") : XS.base,
        XS.tone(VERDICT_TONE[r.verdict] || "warn"), XS.base,
        agrTone ? XS.tone(agrTone) : XS.base,
        XS.avg, XS.avg, XS.left, XS.left]);
    }
  }
  const cols = [{ wch: 20 }, { wch: 8 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 13 }, { wch: 8 }, { wch: 12 }, { wch: 9 }, { wch: 9 }, { wch: 30 }, { wch: 70 }];
  return toSheet(aoa, styles, [], cols, [{ hpt: 30 }]);
}

// ---------- 과제별 월별 시트 (화면 표와 같은 모양) ----------
function buildMonthlySheet(it) {
  const res = it.result;
  const keys = res.monthKeys;
  const head = ["성명", "소속", "판정", "구분", ...keys.map((k) => `${k.slice(2, 4)}.${k.slice(5)}`), "평균", "비고"];
  const W = head.length;
  const aoa = [[`${it.label} — 실행과제 기준 (단위 %)`], [], head];
  const styles = [[XS.title], [], head.map(() => XS.head)];
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: W - 1 } }];

  for (const r of res.rows) {
    const start = aoa.length;
    if (r.kind === "duplicate") {
      aoa.push([r.name, "", VERDICT_TEXT.duplicate, "", ...keys.map(() => ""), "", notesOf(r)]);
      styles.push([XS.base, XS.base, XS.tone("warn"), XS.base, ...keys.map(() => XS.base), XS.avg, XS.left]);
      continue;
    }
    const p = r.pms, i = r.iris;
    const cells = r.monthly ? r.monthly.cells : {};
    const toneOf = (k) => {
      if (r.kind !== "matched") {
        const has = (p && p.monthly[k] && p.monthly[k].rate) || (i && i.months[k] && i.months[k].rate);
        return has ? "side" : null;
      }
      const st = cells[k] ? cells[k].status : "none";
      return { mismatch: "bad", period: "warn", review: "warn" }[st] || null;
    };
    const lines = [{ label: "PMS", style: XS.srcPms, months: p ? p.monthly : {}, avg: r.monthly ? r.monthly.baseAvg : "" }];
    if (res.hasAgreement && p && p.agreement.periods.length) {
      lines.push({ label: "PMS 협약", style: XS.srcAgr, months: p.agreement.months, avg: "", agreement: true });
    }
    lines.push({ label: "IRIS", style: XS.srcIris, months: i ? i.months : {}, avg: r.monthly ? r.monthly.irisAvg : "" });

    lines.forEach((ln, idx) => {
      const first = idx === 0;
      aoa.push([
        first ? r.name : "", first ? (p ? p.dept : (i ? i.org : "")) : "", first ? (VERDICT_TEXT[r.verdict] || r.verdict) : "",
        ln.label, ...keys.map((k) => monthsText(ln.months[k])), ln.avg, first ? notesOf(r) : "",
      ]);
      styles.push([
        XS.base, XS.left, XS.tone(VERDICT_TONE[r.verdict] || "warn"), ln.style,
        ...keys.map((k) => {
          if (ln.agreement) return XS.agr;
          const t = toneOf(k);
          return t ? XS.tone(t) : XS.base;
        }),
        XS.avg, XS.left,
      ]);
    });
    const end = aoa.length - 1;
    if (end > start) for (const c of [0, 1, 2, W - 1]) merges.push({ s: { r: start, c }, e: { r: end, c } });
  }
  const cols = [{ wch: 9 }, { wch: 18 }, { wch: 11 }, { wch: 9 }, ...keys.map(() => ({ wch: 7 })), { wch: 8 }, { wch: 60 }];
  return toSheet(aoa, styles, merges, cols, [{ hpt: 22 }]);
}

// 요약 시트: 모든 과제를 한 시트에 (맨 앞에 과제 열)
// 월별 시트: 과제마다 하나씩 ("월별_26YY0010 (홍길동)")
function downloadExcel() {
  const items = AppState.state.lastResults.filter((it) => it.result.ok);
  if (!items.length) return;
  const X = window.XLSXStyle || XLSX;
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, buildSummarySheet(items), "요약");
  const used = new Set(["요약"]);
  for (const it of items) {
    const base = ("월별_" + it.label).replace(/[:\\/?*[\]]/g, "_").slice(0, 28);
    let name = base, n = 1;
    while (used.has(name)) name = `${base}_${n++}`;
    used.add(name);
    X.utils.book_append_sheet(wb, buildMonthlySheet(it), name);
  }
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const tag = items.length === 1 ? items[0].label.replace(/[\\/:*?"<>|]/g, "_") : `${items.length}개과제`;
  X.writeFile(wb, `참여율대조_${tag}_${today}.xlsx`);
  AppCore.toast.show("다운로드 완료", "success");
}
