// ============================================================
// ui/excel-export.js
// 대조 결과를 엑셀로 내보낸다. 화면(DOM)이 아니라 Compare.run() 결과 데이터에서 직접 만든다.
//  - 요약     : 사람별 판정(월별·협약), 평균, 비고
//  - 월별대조 : 사람별 PMS 월별 / PMS 협약 / IRIS 세 줄 + 달마다 판정
// ============================================================

const VERDICT_TEXT = {
  match: "일치", "avg-match": "연평균 일치", mismatch: "불일치", review: "확인 필요",
  duplicate: "동명이인", pmsOnly: "PMS에만", irisOnly: "IRIS에만", nodata: "자료 없음",
};

function monthsText(info) {
  if (!info || info.rate === 0) return "";
  const v = info.mixed ? info.segments.map((s) => s.rate).join("/") : info.rate;
  return info.partial ? `${v} (◐${info.segments.map((s) => `${Period.shortDate(s.start)}~${Period.shortDate(s.end)}`).join(",")})` : v;
}

function buildSummaryAoa(result) {
  const header = ["성명", "개인번호", "부서", "직급", "참여유형", "IRIS 수행구분",
    "판정(월별 기준)", "다른 달 수", "판정(협약사업 기준)", "PMS 평균(%)", "IRIS 평균(%)", "IRIS 입력 기간", "비고"];
  const rows = result.rows.map((r) => {
    const p = r.pms && !Array.isArray(r.pms) ? r.pms : null;
    const i = r.iris && !Array.isArray(r.iris) ? r.iris : null;
    const irisPeriods = i ? i.periods.map((x) => `${Period.fullDate(x.start)}~${Period.fullDate(x.end)} ${x.rate}%`).join(" / ") : "";
    const notes = r.flags.map((f) => f.text);
    if (r.monthly && r.monthly.avgNote) notes.unshift(r.monthly.avgNote);
    return [
      r.name, p ? p.empNo : "", p ? p.dept : "", p ? p.rank : "", p ? p.role : (i ? i.role : ""), i ? i.status : "",
      VERDICT_TEXT[r.verdict] || r.verdict,
      r.monthly ? r.monthly.mismatch : "",
      r.agreement ? VERDICT_TEXT[r.agreement.verdict] : "",
      r.monthly ? r.monthly.baseAvg : "", r.monthly ? r.monthly.irisAvg : "",
      irisPeriods, notes.join(" | "),
    ];
  });
  return [header, ...rows];
}

function buildMonthlyAoa(result) {
  const keys = result.monthKeys;
  const header = ["성명", "구분", ...keys.map((k) => `${k.slice(0, 4)}-${k.slice(5)}`)];
  const aoa = [header];
  for (const r of result.rows) {
    if (r.kind === "duplicate") {
      aoa.push([r.name, "동명이인 - 직접 확인", ...keys.map(() => "")]);
      continue;
    }
    const p = r.pms, i = r.iris;
    aoa.push([r.name, "PMS 월별", ...keys.map((k) => (p ? monthsText(p.monthly[k]) : ""))]);
    if (result.hasAgreement) aoa.push([r.name, "PMS 협약사업", ...keys.map((k) => (p ? monthsText(p.agreement.months[k]) : ""))]);
    aoa.push([r.name, "IRIS", ...keys.map((k) => (i ? monthsText(i.months[k]) : ""))]);
    if (r.monthly) {
      aoa.push([r.name, "판정(월별)", ...keys.map((k) => {
        const c = r.monthly.cells[k];
        if (!c || c.status === "none") return "";
        return c.status === "match" ? "O" : c.status === "mismatch" ? "X" : "확인";
      })]);
    }
    aoa.push([]);
  }
  return aoa;
}

function downloadExcel() {
  const result = AppState.state.lastResult;
  if (!result) return;
  const wb = XLSX.utils.book_new();
  const s1 = XLSX.utils.aoa_to_sheet(buildSummaryAoa(result));
  s1["!cols"] = [{ wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 40 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, s1, "요약");
  const s2 = XLSX.utils.aoa_to_sheet(buildMonthlyAoa(result));
  s2["!cols"] = [{ wch: 8 }, { wch: 14 }, ...result.monthKeys.map(() => ({ wch: 9 }))];
  XLSX.utils.book_append_sheet(wb, s2, "월별대조");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  XLSX.writeFile(wb, `참여율대조_${result.projectCode || "결과"}_${today}.xlsx`);
  AppCore.toast.show("다운로드 완료", "success");
}
