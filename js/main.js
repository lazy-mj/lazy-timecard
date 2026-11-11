// ============================================================
// main.js
// 컨트롤러: 파일 읽기, 사용자 액션, 초기화.
// 모든 처리는 브라우저 안에서만 이루어지며 어떤 파일도 서버로 전송되지 않는다.
// ============================================================

function readWorkbookGrid(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null }));
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function resetResultIfNeeded() {
  if (!AppState.state.resultShown) return;
  AppState.state.resultShown = false;
  AppState.state.lastResults = [];
  $("#uploadCard").style.display = "block";
  $("#resultCard").style.display = "none";
  AppCore.toast.show("파일이 바뀌어 이전 결과를 초기화했습니다. 다시 대조를 실행해주세요.");
}

function refreshUpload() {
  AppState.refreshPairs();
  renderChips();
  renderPairs();
  updateRunState();
}

async function handleFiles(fileList) {
  resetResultIfNeeded();
  $("#errorArea").innerHTML = "";
  const all = Array.from(fileList);
  // 이미지는 RCMS 캡처로 (글자 인식), 나머지는 엑셀로
  const images = all.filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name));
  if (images.length) RcmsUi.addImages(images);
  for (const file of all.filter((f) => !images.includes(f))) {
    const entry = { id: AppState.nextFileId(), name: file.name, grid: null, type: "분석중", parsed: null };
    AppState.state.files.push(entry);
    renderChips();
    try {
      entry.grid = await readWorkbookGrid(file);
      entry.type = SystemRegistry.detectType(entry.grid);
      if (entry.type !== "UNKNOWN") entry.parsed = SystemRegistry.get(entry.type).parse(entry.grid);
    } catch (err) {
      entry.type = "ERROR";
      console.error(err);
    }
  }
  refreshUpload();
  RcmsUi.onPmsChanged();
}

function removeFile(id) {
  resetResultIfNeeded();
  const f = AppState.fileById(id);
  if (f && f.type === "RCMS") { RcmsUi.clearAll(); return; }
  AppState.state.files = AppState.state.files.filter((f) => f.id !== id);
  refreshUpload();
  RcmsUi.onPmsChanged();
}

function setPair(pmsId, irisId) {
  AppState.state.pairs[pmsId] = irisId;
  AppState.state.manual.add(pmsId);
  refreshUpload();
}

function resetAll() {
  RcmsUi.clearAll(true);
  AppState.state.files = [];
  AppState.state.pairs = {};
  AppState.state.manual.clear();
  AppState.state.resultShown = false;
  AppState.state.lastResults = [];
  refreshUpload();
  $("#uploadCard").style.display = "block";
  $("#resultCard").style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function runComparison() {
  const pairs = AppState.activePairs();
  if (!pairs.length) return;
  const items = pairs.map(({ pmsList, iris }) => {
    // 실행계정이 여러 개면 PMS 파일들을 합쳐서(사람별·월별 합산) 한 과제로 대조
    const pmsParsed = Compare.mergePms(pmsList.map((p) => p.parsed));
    const result = Compare.run(pmsParsed, iris.parsed);
    const code = pmsParsed && pmsParsed.ok ? pmsParsed.meta.projectCode : "";
    const pmsName = pmsList.map((p) => p.name).join(" + ");
    const label = (code || pmsName) + (result.ok && result.leaderName ? ` (${result.leaderName})` : "");
    return { label, pmsName, irisName: iris.name, result, accounts: pmsList.length };
  });
  renderResults(items);
}

function wireDropzone() {
  const dz = $("#dropzone");
  const input = $("#fileInput");
  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", (e) => {
    if (e.target.files.length) handleFiles(e.target.files);
    input.value = "";
  });
  ["dragenter", "dragover"].forEach((evt) => dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((evt) => dz.addEventListener(evt, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
  dz.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
  // RCMS 화면 캡처는 Ctrl+V 로 바로 붙여넣기
  document.addEventListener("paste", (e) => {
    if (AppState.state.resultShown) return;
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const imgs = [...(e.clipboardData ? e.clipboardData.items : [])].filter((it) => it.type.startsWith("image/")).map((it, i) => {
      const f = it.getAsFile();
      return new File([f], `붙여넣은 캡처 ${AppState.state.rcms.images.length + i + 1}.png`, { type: f.type });
    });
    if (imgs.length) { e.preventDefault(); handleFiles(imgs); }
  });
}

function showGuideModal() {
  AppCore.dialog.info({
    title: "사용법",
    bodyHtml: `
      <ol>
        <li><b>파일 업로드</b> : PMS 참여인력 엑셀과 IRIS 참여연구자 엑셀(또는 RCMS 참여인력 캡처 이미지)을 함께 끌어다 놓으세요. 캡처는 Ctrl+V로 붙여넣어도 돼요.</li>
        <li><b>여러 과제를 한 번에</b> : 여러 과제 파일을 한꺼번에 올리면 PMS 파일마다 참여자 이름이 가장 많이 겹치는 IRIS 파일(또는 RCMS 캡처)을 자동으로 짝지어 둡니다. 짝이 틀렸으면 목록의 선택창에서 바꿔주세요.</li>
        <li><b>대조 실행</b> : PMS와 IRIS·RCMS 참여자를 이름으로 짝지어 월별 참여율을 비교합니다. RCMS는 연평균(계상률)과 비교해요.</li>
        <li><b>결과 확인</b> : 참여율이 다른 달은 빨갛게 표시합니다. 실행과제, 협약과제 기준으로 볼 수 있어요.</li>
        <li><b>내보내기</b> : [결과 다운로드]로 요약 시트와 과제별 월별대조 시트가 담긴 엑셀을 받을 수 있어요.</li>
      </ol>
      <p class="usage-subhead">어디서 다운로드하나요?</p>
      <ul>
        <li><b>PMS(ETRIware) 참여인력</b> : 과제관리 &gt; 사업관리 &gt; 실행과제관리 &gt; 실행계획서관리 &gt; 과제조회 후 더블클릭(실행과제마스터) &gt; 참여인력 탭 &gt; 우측상단 [엑셀변환] 버튼</li>
        <li><b>RCMS 참여연구자</b> : 협약정보확인 &gt; 과제선택 &gt; 참여연구자 탭 &gt; 스크롤하여 전체 인원 화면 캡처(겹쳐도 됨) — 엑셀 다운로드가 안 돼서 캡처를 끌어다 놓거나 Ctrl+V로 붙여넣어요</li>
        <li><b>IRIS 참여연구자</b> : IRIS R&amp;D업무포털 &gt; 과제수행 &gt; 협약변경 &gt; (승인통보)협약변경신청 &gt; 과제조회(책임자명, 과제명 등) &gt; 연구개발과제명 앞 네모 버튼 &gt; 통합과제 팝업 &gt; 수행정보 탭 &gt; 연차별수행정보 탭 &gt; 참여연구원 탭 &gt; 좌측에서 당해 연구개발기간 선택 &gt; 참여연구원 참여시작일 확인 후 우측상단 [엑셀] 버튼</li>
      </ul>
    `,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireDropzone();
  $("#guideBadge").addEventListener("click", showGuideModal);
  $("#guideBadge").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.click(); }
  });
  $("#runBtn").addEventListener("click", runComparison);
  $("#downloadBtn").addEventListener("click", downloadExcel);
  $("#resetBtn").addEventListener("click", resetAll);
  AppCore.stepper.set(1);
});
