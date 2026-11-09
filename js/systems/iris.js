// ============================================================
// systems/iris.js
// IRIS(범부처통합연구지원시스템) 참여연구자 엑셀 어댑터.
//
// 양식 (3줄 헤더, 연구자 1명 = 2행):
//   1행: 순번 | 연구기관역할구분 | 연구기관명 | 연구자명 | 참여구분 | 연구자역할구분 | 국가연구자번호 | 수행구분 | 1 | | | 2 | | | … 5
//   2행:                                                                      참여시작일 | 참여종료일 | 산출 근거 연봉 금액 (기간마다 반복)
//   3행:                                                                      계상비율(현금) | 계상비율(현물) | 계상비율(미지급금)
//   데이터: 윗줄 = 기간(시작·종료일), 아랫줄 = 그 기간의 계상비율. 참여율은 현금만 본다.
//
// 모든 기관이 들어 있으므로 ETRI(한국전자통신연구원) 행만 비교 대상으로 쓴다.
// 다른 기관 사람은 "다른 기관에 같은 이름이 있음" 안내용으로만 남긴다.
// ============================================================

(() => {
  const { cellText, lastColOfGrid } = window.GridUtils;
  const P = window.Period;

  const norm = (s) => String(s || "").replace(/\s+/g, "");
  const TARGET_ORGS = new Set(["한국전자통신연구원", "ETRI"]);

  function findCell(grid, text, maxRows = 10) {
    const lastCol = lastColOfGrid(grid);
    for (let r = 1; r <= Math.min(maxRows, grid.length); r++) {
      for (let c = 1; c <= lastCol; c++) {
        if (norm(cellText(grid, r, c)) === text) return { r, c };
      }
    }
    return null;
  }

  function findAllInRow(grid, row, text) {
    const out = [];
    const lastCol = lastColOfGrid(grid);
    for (let c = 1; c <= lastCol; c++) {
      if (norm(cellText(grid, row, c)) === text) out.push(c);
    }
    return out;
  }

  function detect(grid) {
    return !!findCell(grid, "국가연구자번호") && !!findCell(grid, "참여시작일") && !!findCell(grid, "연구기관명");
  }

  function parse(grid) {
    const head = findCell(grid, "순번");
    const startCell = findCell(grid, "참여시작일");
    if (!head || !startCell) {
      return { ok: false, error: "IRIS 헤더(순번/참여시작일)를 찾지 못했습니다. 참여연구자 엑셀이 맞는지 확인해주세요." };
    }
    const headerRow = head.r;
    const periodRow = startCell.r;
    const lastCol = lastColOfGrid(grid);
    const colOf = (text) => {
      for (let c = 1; c <= lastCol; c++) if (norm(cellText(grid, headerRow, c)) === text) return c;
      return 0;
    };
    const cols = {
      seq: head.c,
      orgRole: colOf("연구기관역할구분"),
      org: colOf("연구기관명"),
      name: colOf("연구자명"),
      kind: colOf("참여구분"),
      role: colOf("연구자역할구분"),
      researcherNo: colOf("국가연구자번호"),
      status: colOf("수행구분"),
    };
    if (!cols.org || !cols.name) {
      return { ok: false, error: "IRIS 파일에서 연구기관명/연구자명 열을 찾지 못했습니다. 다운로드 양식이 바뀌었을 수 있어요." };
    }

    // 기간 블록: 참여시작일 열마다 { start, end(=바로 다음 '참여종료일'), cash(=비율 헤더행의 '계상비율(현금)') }
    const startCols = findAllInRow(grid, periodRow, "참여시작일");
    const rateRow = periodRow + 1;
    const blocks = startCols.map((sc) => {
      let endCol = 0;
      for (let c = sc + 1; c <= Math.min(sc + 3, lastCol); c++) {
        if (norm(cellText(grid, periodRow, c)) === "참여종료일") { endCol = c; break; }
      }
      let cashCol = 0;
      for (let c = sc; c <= Math.min(sc + 3, lastCol); c++) {
        if (norm(cellText(grid, rateRow, c)).startsWith("계상비율(현금)")) { cashCol = c; break; }
      }
      return { startCol: sc, endCol, cashCol: cashCol || sc };
    });
    const dataStart = Math.max(headerRow, periodRow, rateRow) + 1;

    const all = [];
    for (let r = dataStart; r <= grid.length; r++) {
      const seq = cellText(grid, r, cols.seq);
      const name = cellText(grid, r, cols.name);
      if (!seq || !name) continue; // 비율만 있는 아랫줄 / 빈 줄
      const periods = [];
      for (const b of blocks) {
        const start = P.parseDate(cellText(grid, r, b.startCol));
        const end = b.endCol ? P.parseDate(cellText(grid, r, b.endCol)) : null;
        if (!start || !end) continue;
        const rate = P.parseRate(cellText(grid, r + 1, b.cashCol));
        periods.push({ start, end, rate: rate ?? 0 });
      }
      const org = cellText(grid, r, cols.org).trim();
      all.push({
        source: "IRIS",
        row: r,
        seq,
        name,
        org,
        orgRole: cols.orgRole ? cellText(grid, r, cols.orgRole) : "",
        kind: cols.kind ? cellText(grid, r, cols.kind) : "",
        role: cols.role ? cellText(grid, r, cols.role) : "",
        researcherNo: cols.researcherNo ? cellText(grid, r, cols.researcherNo) : "",
        status: cols.status ? cellText(grid, r, cols.status) : "",
        periods,
        months: P.expandToMonths(periods),
      });
    }

    const people = all.filter((p) => TARGET_ORGS.has(norm(p.org)));
    const others = all.filter((p) => !TARGET_ORGS.has(norm(p.org)));
    if (!all.length) return { ok: false, error: "IRIS 파일에 연구자 행이 없습니다." };

    const orgCounts = {};
    for (const p of others) orgCounts[p.org] = (orgCounts[p.org] || 0) + 1;

    return {
      ok: true,
      meta: { totalCount: all.length, targetCount: people.length, otherOrgCounts: orgCounts },
      people,
      others,
    };
  }

  window.SystemRegistry.register("IRIS", {
    label: "IRIS(외부)",
    isExternal: true,
    detect, parse,
  });
})();
