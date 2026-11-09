// ============================================================
// ui/state.js
// 앱 전역 상태. DOM을 건드리지 않는다.
// 과제 1개 = PMS 1개 + IRIS 1개. 여러 과제를 올리면 PMS마다 IRIS 짝을 고른다.
// ============================================================

window.AppState = (() => {
  const state = {
    files: [],          // [{ id, name, grid, type, parsed }]
    pairs: {},          // { [pmsId]: irisId | 0 }  0 = 대조 안 함
    manual: new Set(),  // 사용자가 직접 고른 PMS id (자동 추천이 덮어쓰지 않음)
    resultShown: false,
    lastResults: [],    // [{ label, pmsName, irisName, result }] - 엑셀 내보내기가 이 데이터를 사용
    basis: "monthly",   // 결과 표 기준: "monthly"(월별 인건비 참여율) | "agreement"(협약사업)
  };
  let fileIdSeq = 1;
  function nextFileId() { return fileIdSeq++; }
  function filesOf(type) { return state.files.filter((f) => f.type === type); }
  function fileById(id) { return state.files.find((f) => f.id === id) || null; }

  // 파일 목록이 바뀔 때마다: 사라진 파일 짝 정리 + 직접 고르지 않은 PMS는 자동 추천으로 채움
  function refreshPairs() {
    const pmsList = filesOf("PMS");
    const irisList = filesOf("IRIS");
    const irisIds = new Set(irisList.map((f) => f.id));
    for (const key of Object.keys(state.pairs)) {
      const pmsId = Number(key);
      if (!fileById(pmsId)) { delete state.pairs[key]; state.manual.delete(pmsId); }
      else if (state.pairs[key] && !irisIds.has(state.pairs[key])) { state.pairs[key] = 0; state.manual.delete(pmsId); }
    }
    const takenByManual = new Set(pmsList.filter((p) => state.manual.has(p.id)).map((p) => state.pairs[p.id]).filter(Boolean));
    const autoPms = pmsList.filter((p) => !state.manual.has(p.id));
    const autoIris = irisList.filter((i) => !takenByManual.has(i.id));
    const suggested = window.Compare.suggestPairs(autoPms, autoIris);
    for (const p of autoPms) state.pairs[p.id] = suggested[p.id] || 0;
  }

  function activePairs() {
    return filesOf("PMS")
      .filter((p) => state.pairs[p.id])
      .map((p) => ({ pms: p, iris: fileById(state.pairs[p.id]) }))
      .filter((x) => x.iris);
  }

  return { state, nextFileId, filesOf, fileById, refreshPairs, activePairs };
})();
