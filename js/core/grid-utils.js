// ============================================================
// core/grid-utils.js
// 엑셀 시트를 표현하는 2차원 배열(grid)을 다루는 공통 유틸리티.
// * grid[r][c] (0-based index)
//   -> Excel의 1-based 행/열 개념과 헷갈리지 않도록 이 프로젝트 안에서는
//      "행 번호(rowNum)/열 번호(colNum)"는 전부 1-based로 통일하고,
//      실제 grid 접근시에만 -1 해서 읽는다. (VBA와 동일한 사고방식 유지)
//
// systems/*.js(PMS·이지바로·RCMS 어댑터)가 공통으로 사용한다.
// ============================================================

window.GridUtils = (() => {

  function cellText(grid, rowNum, colNum) {
    const row = grid[rowNum - 1];
    if (!row) return "";
    const v = row[colNum - 1];
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  function parseAmount(raw) {
    if (raw === null || raw === undefined || raw === "") return 0;
    const cleaned = String(raw).replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function lastColOfGrid(grid) {
    let max = 1;
    for (const row of grid) {
      if (row && row.length > max) max = row.length;
    }
    return max;
  }

  // 지정한 텍스트가 있는 행 번호를 찾는다 (헤더 위치 탐색용). 1-based, 못 찾으면 0
  function findHeaderRow(grid, headerText, maxSearchRows = 10) {
    const lastCol = lastColOfGrid(grid);
    const maxRow = Math.min(maxSearchRows, grid.length);
    for (let r = 1; r <= maxRow; r++) {
      for (let c = 1; c <= lastCol; c++) {
        if (cellText(grid, r, c) === headerText) return r;
      }
    }
    return 0;
  }

  // 지정한 행에서 특정 헤더 텍스트가 있는 열 번호를 찾는다. 1-based, 못 찾으면 0
  function findColumnInRow(grid, rowNum, headerText) {
    if (!rowNum) return 0;
    const lastCol = lastColOfGrid(grid);
    for (let c = 1; c <= lastCol; c++) {
      if (cellText(grid, rowNum, c) === headerText) return c;
    }
    return 0;
  }

  // 지정한 행에서, 주어진 [startCol, endCol] 범위 안에서만 특정 텍스트를 찾는다.
  // RCMS처럼 같은 라벨("본예산" 등)이 여러 상위 그룹 아래 반복되는 경우,
  // 상위 그룹의 열 범위로 좁혀서 찾아야 엉뚱한 그룹의 값을 집어오지 않는다.
  function findColumnInRange(grid, rowNum, startCol, endCol, headerText) {
    for (let c = startCol; c <= endCol; c++) {
      if (cellText(grid, rowNum, c) === headerText) return c;
    }
    return 0;
  }

  // 특정 행에서 상위 헤더의 "구간(span)"을 계산한다.
  // SheetJS 버전/환경에 따라 병합된 셀이 두 가지로 읽힌다:
  //  (A) 첫 칸에만 값, 나머지는 null  (예: D="승인한도", E=null, F=null)
  //  (B) 병합 범위 전체에 값이 복제됨   (예: D=E=F="승인한도")
  // 두 경우 모두 올바르게 그룹 경계를 잡으려면:
  //  - 빈 칸(null)은 "직전 라벨의 연속"으로 취급 (A 대응)
  //  - 같은 라벨이 연속되면 하나의 그룹으로 병합 (B 대응)
  function findTopLevelSpans(grid, headerRow) {
    const lastCol = lastColOfGrid(grid);
    const spans = [];
    let curLabel = null;
    let curStart = 0;
    for (let c = 1; c <= lastCol; c++) {
      const raw = cellText(grid, headerRow, c);
      // 빈 칸이면 직전 그룹이 계속 이어지는 것으로 본다 (병합셀이 null로 읽힌 경우)
      const label = raw === "" ? curLabel : raw;
      if (label !== curLabel) {
        // 새 그룹 시작
        if (curLabel !== null) {
          spans.push({ label: curLabel, startCol: curStart, endCol: c - 1 });
        }
        curLabel = label;
        curStart = c;
      }
    }
    if (curLabel !== null) {
      spans.push({ label: curLabel, startCol: curStart, endCol: lastCol });
    }
    return spans;
  }

  // 마지막으로 값이 있는 행 번호를 특정 열 기준으로 찾는다 (데이터 범위의 끝을 찾을 때 사용)
  function lastRowByColumn(grid, colNum) {
    for (let r = grid.length; r >= 1; r--) {
      if (cellText(grid, r, colNum) !== "") return r;
    }
    return 0;
  }

  return {
    cellText, parseAmount, lastColOfGrid,
    findHeaderRow, findColumnInRow, findColumnInRange, findTopLevelSpans,
    lastRowByColumn,
  };
})();
