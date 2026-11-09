// ============================================================
// ui/state.js
// 앱 전역 상태. DOM을 건드리지 않는다.
// 과제 1개 = PMS 1개 + IRIS 1개. 같은 종류 파일을 또 올리면 새 파일로 교체한다.
// ============================================================

window.AppState = (() => {
  const state = {
    files: [],          // [{ id, name, grid, type }]
    resultShown: false,
    lastResult: null,   // Compare.run() 결과 - 엑셀 내보내기가 이 데이터를 사용
    basis: "monthly",   // 결과 표 기준: "monthly"(월별 인건비 참여율) | "agreement"(협약사업)
  };
  let fileIdSeq = 1;
  function nextFileId() { return fileIdSeq++; }
  function fileOf(type) { return state.files.find((f) => f.type === type) || null; }
  return { state, nextFileId, fileOf };
})();
