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
  AppState.state.lastResult = null;
  $("#uploadCard").style.display = "block";
  $("#resultCard").style.display = "none";
  AppCore.toast.show("파일이 바뀌어 이전 결과를 초기화했습니다. 다시 대조를 실행해주세요.");
}

async function handleFiles(fileList) {
  resetResultIfNeeded();
  $("#errorArea").innerHTML = "";
  for (const file of Array.from(fileList)) {
    const entry = { id: AppState.nextFileId(), name: file.name, grid: null, type: "분석중" };
    AppState.state.files.push(entry);
    renderChips();
    try {
      entry.grid = await readWorkbookGrid(file);
      entry.type = SystemRegistry.detectType(entry.grid);
    } catch (err) {
      entry.type = "ERROR";
      console.error(err);
    }
    // 과제 1개 = PMS 1개 + IRIS 1개. 같은 종류가 또 들어오면 이전 파일을 교체한다.
    if (entry.type === "PMS" || entry.type === "IRIS") {
      const before = AppState.state.files.filter((f) => f.type === entry.type && f.id !== entry.id);
      if (before.length) {
        AppState.state.files = AppState.state.files.filter((f) => !before.includes(f));
        AppCore.toast.show(`${entry.type} 파일을 새로 올린 파일로 교체했어요.`);
      }
    }
    renderChips();
  }
  updateRunState();
}

function removeFile(id) {
  resetResultIfNeeded();
  AppState.state.files = AppState.state.files.filter((f) => f.id !== id);
  renderChips();
  updateRunState();
}

function resetAll() {
  AppState.state.files = [];
  AppState.state.resultShown = false;
  AppState.state.lastResult = null;
  renderChips();
  updateRunState();
  $("#uploadCard").style.display = "block";
  $("#resultCard").style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function runComparison() {
  const pmsFile = AppState.fileOf("PMS");
  const irisFile = AppState.fileOf("IRIS");
  if (!pmsFile || !irisFile) return;
  const pms = SystemRegistry.get("PMS").parse(pmsFile.grid);
  const iris = SystemRegistry.get("IRIS").parse(irisFile.grid);
  renderResults(Compare.run(pms, iris));
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
}

function showGuideModal() {
  AppCore.dialog.info({
    title: "사용법",
    bodyHtml: `
      <ol>
        <li><b>파일 업로드</b> : PMS 참여인력 엑셀과 IRIS 참여연구자 엑셀을 함께 끌어다 놓으세요. 어느 쪽인지 자동으로 구분합니다.</li>
        <li><b>대조 실행</b> : IRIS에서는 <b>한국전자통신연구원</b> 연구자만 골라, PMS와 <b>이름</b>으로 짝지어 달마다 참여율을 비교합니다.</li>
        <li><b>결과 확인</b> : 칸마다 위가 PMS, 아래가 IRIS 참여율입니다. 같으면 숫자 하나, 다르면 빨간 칸에 두 숫자가 보여요.
          위쪽 탭으로 <b>월별 인건비 참여율 기준</b>과 <b>협약사업 기준</b>을 바꿔 볼 수 있어요.</li>
        <li><b>내보내기</b> : [결과 다운로드]로 요약·월별대조 시트가 담긴 엑셀을 받을 수 있어요.</li>
      </ol>
      <p class="usage-subhead">이렇게 판정해요</p>
      <ul>
        <li><b>연평균 일치</b> : IRIS에 기간 하나로(연평균 참여율) 넣은 경우, 참여 시작·끝 달이 같고 평균(참여율 합 ÷ 참여 개월수)이 같으면 일치로 봅니다.</li>
        <li><b>◐ 부분 참여</b> : 한 달을 다 채우지 않은 기간(예: 08/18~08/31)은 참여율 값만 비교하고 ◐로 표시해요.</li>
        <li><b>동명이인</b> : 같은 이름이 한쪽에 2명 이상이면 자동으로 짝짓지 않고 확인 필요로 보여줘요.</li>
        <li><b>IRIS 수행종료</b> : 대조에서 빼지 않고 태그로 표시해요. PMS에선 참여 중인데 IRIS에서만 종료일 수 있으니까요.</li>
        <li><b>PMS 내부 불일치</b> : 실행과제 기간 문구와 월별 열 값이 다르면 <b>!</b> 로 따로 알려드려요.</li>
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
