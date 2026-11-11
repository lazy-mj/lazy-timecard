// ============================================================
// systems/pms.js
// PMS(ETRIware, 내부망) 참여인력 엑셀 어댑터.
//
// 양식 (2줄 헤더):
//   1행: 참여자 | 협약사업 | 실행과제(과제번호) | 타 참여율 | 월별 인건비 참여율(%)
//   2행: 성명 | 개인번호/부서/직급 | 참여유형 | 총참여율 | 참여기간/참여율 | 총참여율 | 참여기간/참여율 | … | 계 | 2026-04월 | 2026-05월 …
// 비교 기준은 "월별 인건비 참여율" 열이고, 협약사업 기간 문구도 따로 펼쳐서 같이 비교한다.
// 실행과제 기간 문구 ↔ 월별 열이 서로 안 맞으면 PMS 내부 불일치로 경고한다.
// ============================================================

(() => {
  const { cellText, lastColOfGrid, findTopLevelSpans } = window.GridUtils;
  const P = window.Period;

  const norm = (s) => String(s || "").replace(/\s+/g, "");
  const MONTH_RE = /^(\d{4})[-./](\d{1,2})월?$/;

  function findRow(grid, text, maxRows = 10) {
    const lastCol = lastColOfGrid(grid);
    for (let r = 1; r <= Math.min(maxRows, grid.length); r++) {
      for (let c = 1; c <= lastCol; c++) {
        if (norm(cellText(grid, r, c)) === text) return r;
      }
    }
    return 0;
  }

  function findInRange(grid, row, start, end, text) {
    for (let c = start; c <= end; c++) {
      if (norm(cellText(grid, row, c)) === text) return c;
    }
    return 0;
  }

  function monthColumns(grid, headerRow) {
    const cols = [];
    const lastCol = lastColOfGrid(grid);
    for (let c = 1; c <= lastCol; c++) {
      const m = norm(cellText(grid, headerRow, c)).match(MONTH_RE);
      if (m) cols.push({ col: c, key: P.monthKey(+m[1], +m[2]) });
    }
    return cols;
  }

  function detect(grid) {
    const headerRow = findRow(grid, "성명");
    return headerRow > 0 && monthColumns(grid, headerRow).length > 0 && findRow(grid, "참여기간/참여율") > 0;
  }

  function parse(grid) {
    const headerRow = findRow(grid, "성명");
    if (!headerRow || headerRow < 2) {
      return { ok: false, error: "PMS 헤더(성명)를 찾지 못했습니다. 참여인력 엑셀이 맞는지 확인해주세요." };
    }
    const groupRow = headerRow - 1;
    const spans = findTopLevelSpans(grid, groupRow).map((s) => ({ ...s, key: norm(s.label) }));
    const agreementSpan = spans.find((s) => s.key.startsWith("협약사업"));
    const execSpan = spans.find((s) => s.key.startsWith("실행과제"));
    const lastCol = lastColOfGrid(grid);

    const cols = {
      name: findInRange(grid, headerRow, 1, lastCol, "성명"),
      info: findInRange(grid, headerRow, 1, lastCol, "개인번호/부서/직급"),
      role: findInRange(grid, headerRow, 1, lastCol, "참여유형"),
      agreementTotal: agreementSpan ? findInRange(grid, headerRow, agreementSpan.startCol, agreementSpan.endCol, "총참여율") : 0,
      agreementPeriod: agreementSpan ? findInRange(grid, headerRow, agreementSpan.startCol, agreementSpan.endCol, "참여기간/참여율") : 0,
      execTotal: execSpan ? findInRange(grid, headerRow, execSpan.startCol, execSpan.endCol, "총참여율") : 0,
      execPeriod: execSpan ? findInRange(grid, headerRow, execSpan.startCol, execSpan.endCol, "참여기간/참여율") : 0,
    };
    const months = monthColumns(grid, headerRow);
    if (!cols.name || !months.length) {
      return { ok: false, error: "PMS 파일에서 성명 또는 월별 인건비 참여율 열을 찾지 못했습니다. 다운로드 양식이 바뀌었을 수 있어요." };
    }

    const codeMatch = execSpan ? execSpan.label.match(/\(([^)]+)\)/) : null;
    const meta = {
      projectCode: codeMatch ? codeMatch[1].trim() : "",
      monthKeys: months.map((m) => m.key),
      hasAgreement: !!cols.agreementPeriod,
    };

    const people = [];
    for (let r = headerRow + 1; r <= grid.length; r++) {
      const name = cellText(grid, r, cols.name);
      if (!name) continue;
      if (/^(합계|소계|계)$/.test(norm(name))) continue;

      const [empNo = "", dept = "", rank = ""] = cellText(grid, r, cols.info).split("/").map((s) => s.trim());

      const monthlyValues = {};
      for (const mc of months) {
        const v = P.parseRate(cellText(grid, r, mc.col));
        if (v !== null) monthlyValues[mc.key] = v;
      }
      const monthly = P.monthlyValuesToMonths(monthlyValues);

      const agreementText = cols.agreementPeriod ? cellText(grid, r, cols.agreementPeriod) : "";
      const execText = cols.execPeriod ? cellText(grid, r, cols.execPeriod) : "";
      const agreementPeriods = P.parsePmsPeriodText(agreementText);
      const execPeriods = P.parsePmsPeriodText(execText);

      const person = {
        source: "PMS",
        row: r,
        name,
        empNo, dept, rank,
        role: cols.role ? cellText(grid, r, cols.role) : "",
        monthly,
        agreement: {
          text: agreementText,
          total: cols.agreementTotal ? P.parseRate(cellText(grid, r, cols.agreementTotal)) : null,
          periods: agreementPeriods,
          months: P.expandToMonths(agreementPeriods),
        },
        exec: {
          text: execText,
          total: cols.execTotal ? P.parseRate(cellText(grid, r, cols.execTotal)) : null,
          periods: execPeriods,
          months: P.expandToMonths(execPeriods),
        },
        internalIssues: [],
      };
      person.internalIssues = checkInternal(person);
      people.push(person);
    }

    if (!people.length) return { ok: false, error: "PMS 파일에 참여자 행이 없습니다." };
    return { ok: true, meta, people };
  }

  // PMS 안에서 실행과제 기간 문구와 월별 열이 서로 맞는지 확인
  function checkInternal(p) {
    const issues = [];
    if (!p.exec.periods.length) return issues;
    const keys = P.sortedKeys(p.exec.months, p.monthly);
    const diffMonths = [];
    for (const k of keys) {
      const a = p.exec.months[k] ? p.exec.months[k].rate : 0;
      const b = p.monthly[k] ? p.monthly[k].rate : 0;
      if ((a || 0) !== (b || 0)) diffMonths.push({ month: k, periodRate: a, monthlyRate: b });
    }
    if (diffMonths.length) {
      issues.push({
        type: "period-vs-monthly",
        message: "실행과제 기간 문구와 월별 열 값이 다른 달이 있어요: " +
          diffMonths.map((d) => `${Number(d.month.slice(5))}월(문구 ${d.periodRate ?? 0}% / 월별 ${d.monthlyRate ?? 0}%)`).join(", "),
        months: diffMonths.map((d) => d.month),
      });
    }
    const sum = Object.values(p.monthly).reduce((a, v) => a + (v.rate || 0), 0);
    if (p.exec.total !== null && Math.abs(sum - p.exec.total) > 0.001) {
      issues.push({
        type: "total-vs-sum",
        message: `실행과제 총참여율(${p.exec.total}%)과 월별 합계(${round1(sum)}%)가 달라요.`,
      });
    }
    return issues;
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  window.SystemRegistry.register("PMS", {
    label: "PMS(내부망)",
    isExternal: false,
    detect, parse,
  });
})();
