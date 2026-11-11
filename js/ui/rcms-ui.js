// ============================================================
// ui/rcms-ui.js
// RCMS 캡처 묶음 화면: 캡처 목록 → 글자 인식 진행 → 확인표(고칠 수 있음) → 대조용 가상 파일(type "RCMS")
//
// 확인표에서 고친 값이 곧 대조에 쓰인다. 노란 칸 = 사람이 한 번 봐야 하는 칸
//  (PMS 명단으로 이름을 고친 칸 / 캡처마다 값이 달랐던 칸 / 비어 있는 칸)
// ============================================================

window.RcmsUi = (() => {
  const S = () => AppState.state.rcms;
  let imgSeq = 1;
  let tesseractLoading = null;

  // tesseract.js 는 캡처를 처음 올릴 때만 불러온다 (첫 화면을 가볍게)
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (!tesseractLoading) {
      tesseractLoading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "js/vendor/tesseract/tesseract.min.js";
        s.onload = resolve;
        s.onerror = () => reject(new Error("글자 인식 엔진을 불러오지 못했어요"));
        document.head.appendChild(s);
      });
    }
    return tesseractLoading;
  }

  function pmsNames() {
    return [...new Set(AppState.filesOf("PMS").filter((f) => f.parsed && f.parsed.ok).flatMap((f) => f.parsed.people.map((p) => p.name)))];
  }

  async function addImages(files) {
    for (const file of files) {
      S().images.push({ id: imgSeq++, name: file.name, file, url: URL.createObjectURL(file), lines: null, status: "대기" });
    }
    S().edited = false;
    render();
    await runOcr();
  }

  async function runOcr() {
    if (S().busy) return;
    S().busy = true;
    try {
      await loadTesseract();
      for (const img of S().images) {
        if (img.lines) continue;
        img.status = "읽는 중";
        render();
        try {
          img.lines = await RcmsOcr.readImage(img.file);
          img.status = "완료";
        } catch (err) {
          console.error(err);
          img.lines = [];
          img.status = "실패";
        }
        rebuildRows();
      }
    } catch (err) {
      AppCore.error.show(err.message, "errorArea");
    } finally {
      S().busy = false;
      rebuildRows();
    }
  }

  // 캡처별 줄 → 합치기 → 확인표 행 (사용자가 표를 고친 뒤에는 새 캡처가 올 때만 다시 만든다)
  function rebuildRows(force = false) {
    if (S().edited && !force) { sync(); return; }
    const perImage = S().images.filter((i) => i.lines).map((i) => i.lines.map(RcmsOcr.parseLine).filter(Boolean));
    S().rows = RcmsOcr.mergeRows(perImage, pmsNames());
    sync();
  }

  // 확인표 → 대조용 가상 파일 (files 안의 type "RCMS" 항목)
  function sync() {
    const st = AppState.state;
    const has = S().images.length > 0;
    let entry = st.files.find((f) => f.type === "RCMS");
    if (!has) {
      if (entry) st.files = st.files.filter((f) => f !== entry);
    } else {
      if (!entry) {
        entry = { id: AppState.nextFileId(), type: "RCMS", virtual: true, name: "", parsed: null };
        st.files.push(entry);
      }
      entry.name = `RCMS 캡처 ${S().images.length}장`;
      entry.parsed = S().rows.length ? RcmsOcr.toParsed(S().rows) : { ok: false, error: "아직 읽은 줄이 없어요" };
    }
    refreshUpload();
    render();
  }

  function clearAll(silent) {
    S().images.forEach((i) => URL.revokeObjectURL(i.url));
    S().images = []; S().rows = []; S().edited = false;
    if (!silent) sync(); else AppState.state.files = AppState.state.files.filter((f) => f.type !== "RCMS");
    render();
  }

  function removeImage(id) {
    const img = S().images.find((i) => i.id === id);
    if (img) URL.revokeObjectURL(img.url);
    S().images = S().images.filter((i) => i.id !== id);
    S().edited = false;
    rebuildRows(true);
  }

  // ---------- 화면 ----------
  function cellCls(r, k) {
    if (k === "name" && (r.nameFixed || r.nameUnknown)) return " warn";
    if (r.conflicts && r.conflicts[k]) return " warn";
    if ((k === "rate" && (r.rate === null || r.rate === "")) || ((k === "start" || k === "end") && !r[k])) return " warn";
    return "";
  }
  function cellTip(r, k) {
    if (k === "name" && r.nameFixed) return `인식: ${r.nameFixed}`;
    if (k === "name" && r.nameUnknown) return "PMS 명단에 없음";
    if (r.conflicts && r.conflicts[k]) return `캡처마다 다름: ${r.conflicts[k].join(" / ")}`;
    return "";
  }

  function render() {
    const wrap = $("#rcmsArea");
    if (!wrap) return;
    const imgs = S().images;
    if (!imgs.length) { wrap.innerHTML = ""; return; }
    const thumbs = imgs.map((i) => `
      <div class="rc-thumb" title="${escapeHtml(i.name)}">
        <img src="${i.url}" alt="${escapeHtml(i.name)}">
        <span class="rc-st st-${i.status === "완료" ? "ok" : i.status === "실패" ? "bad" : "run"}">${escapeHtml(i.status)}</span>
        <button class="rc-x" data-rc-remove="${i.id}" title="이 캡처 빼기" aria-label="${escapeHtml(i.name)} 빼기">✕</button>
      </div>`).join("");
    const rows = S().rows;
    const warnCount = rows.filter((r) => ["name", "rate", "start", "end"].some((k) => cellCls(r, k))).length;
    const input = (r, i, k, w) => `<td class="rc-c${cellCls(r, k)}"${cellTip(r, k) ? ` title="${escapeHtml(cellTip(r, k))}"` : ""}>
      <input data-rc-row="${i}" data-rc-key="${k}" value="${escapeHtml(r[k] ?? "")}" style="width:${w}">
      ${cellTip(r, k) ? `<div class="rc-note">${escapeHtml(cellTip(r, k))}</div>` : ""}</td>`;
    const table = rows.length ? `
      <div class="table-wrap rc-table-wrap"><table class="rc-table">
        <thead><tr><th>No.</th><th>성명</th><th>생년월일</th><th>내/외국인</th><th>인건비계상률</th><th>참여시작일</th><th>참여종료일</th><th>캡처</th><th></th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr>
          <td>${r.no ?? ""}${r.lead ? '<div class="tag tag-lead">책임자</div>' : ""}</td>
          ${input(r, i, "name", "84px")}
          <td>${escapeHtml(r.birth || "")}</td>
          <td>${escapeHtml(r.foreign || "")}</td>
          ${input(r, i, "rate", "64px")}
          ${input(r, i, "start", "96px")}
          ${input(r, i, "end", "96px")}
          <td class="rc-src">${r.sources.map((n) => `#${n}`).join(" ")}</td>
          <td><button class="rc-del" data-rc-del="${i}" title="이 줄 빼기">✕</button></td>
        </tr>`).join("")}</tbody>
      </table></div>
      <div class="rc-foot">
        <button class="btn btn-outline rc-add" data-rc-add>+ 줄 추가</button>
        <span class="rc-sum">${rows.length}명 · ${warnCount ? `<b class="rc-warn">확인할 칸이 있는 줄 ${warnCount}개</b> (노란 칸)` : "확인할 칸 없음"}</span>
      </div>` : `<div class="rc-empty">${S().busy ? "캡처에서 글자를 읽고 있어요… (처음 한 번은 엔진을 불러오느라 몇 초 더 걸려요)" : "읽은 줄이 없어요. 표가 보이게 다시 캡처해 주세요."}</div>`;
    wrap.innerHTML = `
      <div class="rc-head">
        <span class="dz-badge badge-rcms">RCMS 캡처</span>
        <b>${imgs.length}장</b>
        <span class="rc-hint">겹치게 찍은 줄은 생년월일로 한 줄로 합쳐요. 노란 칸만 원본 캡처와 비교해 확인해 주세요.</span>
        <button class="btn btn-outline rc-clear" data-rc-clear>캡처 모두 빼기</button>
      </div>
      <div class="rc-thumbs">${thumbs}</div>
      ${table}`;

    wrap.querySelectorAll("[data-rc-remove]").forEach((b) => b.addEventListener("click", () => removeImage(Number(b.dataset.rcRemove))));
    wrap.querySelector("[data-rc-clear]").addEventListener("click", () => clearAll());
    wrap.querySelectorAll("[data-rc-row]").forEach((inp) => inp.addEventListener("change", () => {
      const r = S().rows[Number(inp.dataset.rcRow)];
      const k = inp.dataset.rcKey;
      r[k] = k === "rate" ? (inp.value.trim() === "" ? null : Number(inp.value)) : inp.value.trim();
      if (k === "name") { r.nameFixed = ""; r.nameUnknown = false; }
      if (r.conflicts) delete r.conflicts[k];
      S().edited = true;
      sync();
    }));
    wrap.querySelectorAll("[data-rc-del]").forEach((b) => b.addEventListener("click", () => {
      S().rows.splice(Number(b.dataset.rcDel), 1); S().edited = true; sync();
    }));
    const add = wrap.querySelector("[data-rc-add]");
    if (add) add.addEventListener("click", () => {
      S().rows.push({ no: null, name: "", birth: "", foreign: "", rate: null, start: "", end: "", lead: false, ocrNames: [], nameFixed: "", nameUnknown: false, sources: [], conflicts: {} });
      S().edited = true; sync();
    });
  }

  // PMS 파일이 바뀌면(이름 명단이 바뀌면) 손대지 않은 확인표는 이름 보정을 다시 한다
  function onPmsChanged() { if (S().images.length && !S().edited && !S().busy) rebuildRows(); }

  return { addImages, clearAll, render, onPmsChanged };
})();
