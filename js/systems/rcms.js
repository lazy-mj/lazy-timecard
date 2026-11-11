// ============================================================
// systems/rcms.js
// RCMS 참여연구자 "화면 캡처" 읽기. RCMS는 엑셀 다운로드·복사가 안 돼서 캡처 이미지를 글자 인식(OCR)한다.
//
// 흐름: 캡처 이미지들 → (3배 확대·흑백) → tesseract 한글 인식 → 줄마다 "값의 모양"으로 해석
//       → 생년월일(+No.)로 여러 캡처의 같은 줄 합치기 → PMS 명단으로 이름 보정 → IRIS 와 같은 모양으로 변환
//
// 열 위치에 기대지 않는다: 사람마다 캡처 범위가 달라도, 머리줄이 없어도 읽을 수 있게.
//   - 1940~2014년 날짜 = 생년월일, 2015년 이후 날짜 두 개 = 참여시작일·참여종료일
//   - '내국인/외국인' 다음의 0~100 숫자 = 인건비계상률 (연평균 참여율)
//   - 생년월일 바로 앞의 한글 낱말 = 성명
// 모든 처리는 브라우저 안에서만 한다 (tesseract 엔진·한글 데이터도 이 사이트 파일).
// ============================================================

window.RcmsOcr = (() => {
  const VP = "js/vendor/tesseract/";
  const P = window.Period;

  // ---------- OCR ----------
  let workerPromise = null;
  function getWorker() {
    if (!workerPromise) {
      workerPromise = (async () => {
        const w = await Tesseract.createWorker("kor", 1, {
          workerPath: VP + "worker.min.js", corePath: VP + "core", langPath: VP + "lang",
          workerBlobURL: false, gzip: true,
        });
        await w.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "6" });
        return w;
      })();
    }
    return workerPromise;
  }

  async function preprocess(file, scale = 3) {
    const bmp = await createImageBitmap(file);
    const c = document.createElement("canvas");
    c.width = bmp.width * scale; c.height = bmp.height * scale;
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = y < 150 ? 0 : 255; // 선택된 줄의 연한 파랑 배경도 흰색으로
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // 캡처 한 장 → 줄 텍스트 목록
  async function readImage(file) {
    const worker = await getWorker();
    const canvas = await preprocess(file);
    const { data } = await worker.recognize(canvas);
    return data.lines.map((l) => l.text.replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  // ---------- 줄 해석 ----------
  const DATE_RE = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g;
  const STOP = new Set(["한국전자통신연구원", "연구개발기관", "참여구분", "참여연구자", "과제책임자", "내국인", "외국인",
    "일반의무채용", "채용형태", "성명", "생년월일", "내/외국인구분", "인건비계상률", "참여시작일", "참여종료일"]);

  function parseLine(text) {
    const dates = [];
    let m;
    DATE_RE.lastIndex = 0;
    while ((m = DATE_RE.exec(text)) !== null) dates.push({ y: +m[1], m: +m[2], d: +m[3], idx: m.index, len: m[0].length, raw: m[0] });
    const birth = dates.find((d) => d.y >= 1940 && d.y <= 2014);
    const work = dates.filter((d) => d.y >= 2015);
    if (!birth && work.length < 2) return null; // 머리줄·제목 줄 등

    // 숫자 낱말(날짜 아닌 것)
    const noDates = text.replace(DATE_RE, " ");
    const tokens = noDates.split(/\s+/).filter(Boolean);
    const first = text.trim().split(/\s+/)[0];
    const no = /^\d{1,3}$/.test(first) ? Number(first) : null;

    // 계상률: 내/외국인 다음 숫자 → 없으면 생년월일과 시작일 사이의 마지막 숫자
    let rate = null;
    const fm = text.match(/(내국인|외국인)/);
    const foreign = fm ? fm[1] : "";
    const region = (() => {
      const from = fm ? fm.index + fm[0].length : (birth ? birth.idx + birth.len : 0);
      const to = work.length ? work[0].idx : text.length;
      return text.slice(from, to);
    })();
    const nums = (region.match(/\d{1,3}(?:\.\d{1,2})?/g) || []).map(Number).filter((n) => n >= 0 && n <= 100);
    if (nums.length) rate = nums[nums.length - 1];

    // 성명: 생년월일 바로 앞의 한글 낱말(2~5자, 기관·구분 낱말 제외)
    let name = "";
    const beforeBirth = birth ? text.slice(0, birth.idx) : text;
    const hangul = (beforeBirth.match(/[가-힣]{2,5}/g) || []).filter((w) => !STOP.has(w) && !/연구원$|기관$|연구자$|책임자$|임자$/.test(w));
    if (hangul.length) name = hangul[hangul.length - 1];
    const lead = /책임자|임자/.test(beforeBirth); // OCR이 '과제책임자'를 '과제색임자'로 읽기도 함

    void tokens;
    return {
      no, name, lead, foreign, rate,
      birth: birth ? `${birth.y}.${String(birth.m).padStart(2, "0")}.${String(birth.d).padStart(2, "0")}` : "",
      start: work[0] ? `${work[0].y}.${String(work[0].m).padStart(2, "0")}.${String(work[0].d).padStart(2, "0")}` : "",
      end: work[1] ? `${work[1].y}.${String(work[1].m).padStart(2, "0")}.${String(work[1].d).padStart(2, "0")}` : "",
    };
  }

  // ---------- 이름 보정 (자모 단위 거리) ----------
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ", JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ", JONG = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
  function jamo(s) {
    let out = "";
    for (const ch of s) {
      const c = ch.charCodeAt(0) - 0xac00;
      if (c < 0 || c > 11171) { out += ch; continue; }
      out += CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + (c % 28 ? JONG[c % 28] : "");
    }
    return out;
  }
  function lev(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return dp[a.length][b.length];
  }
  function similarity(a, b) {
    const ja = jamo(a), jb = jamo(b);
    return 1 - lev(ja, jb) / Math.max(ja.length, jb.length, 1);
  }
  // PMS 이름 중 가장 비슷한 것 (확실할 때만)
  function bestName(ocrName, pmsNames) {
    if (!ocrName) return null;
    if (pmsNames.includes(ocrName)) return { name: ocrName, exact: true };
    const scored = pmsNames.map((n) => ({ n, s: similarity(ocrName, n) + (n.startsWith(ocrName) ? 0.15 : 0) })).sort((a, b) => b.s - a.s);
    if (!scored.length) return null;
    const [top, second] = scored;
    if (top.s >= 0.6 && (!second || top.s - second.s >= 0.1)) return { name: top.n, exact: false, score: top.s };
    return null;
  }

  // ---------- 여러 캡처 합치기 ----------
  // 같은 사람 = 생년월일이 같고 (No. 가 같거나 이름이 비슷). 값이 캡처마다 다르면 충돌로 표시.
  function mergeRows(rowsPerImage, pmsNames) {
    const out = [];
    rowsPerImage.forEach((rows, imgIdx) => {
      for (const r of rows) {
        const same = out.find((o) => o.birth && o.birth === r.birth &&
          (o.no === r.no || similarity(o.ocrNames[0], r.name) >= 0.5));
        if (same) {
          same.sources.add(imgIdx + 1);
          if (r.name && !same.ocrNames.includes(r.name)) same.ocrNames.push(r.name);
          for (const k of ["rate", "start", "end", "foreign"]) {
            if (r[k] === null || r[k] === "") continue;
            if (same[k] === null || same[k] === "") same[k] = r[k];
            else if (String(same[k]) !== String(r[k])) (same.conflicts[k] = same.conflicts[k] || new Set([String(same[k])])).add(String(r[k]));
          }
          same.lead = same.lead || r.lead;
        } else {
          out.push({ ...r, ocrNames: r.name ? [r.name] : [], sources: new Set([imgIdx + 1]), conflicts: {} });
        }
      }
    });
    // 이름 정하기: 여러 캡처의 이름 중 PMS 명단에 그대로 있는 것 우선 → 없으면 가장 비슷한 PMS 이름
    for (const r of out) {
      const exact = r.ocrNames.find((n) => pmsNames.includes(n));
      if (exact) { r.name = exact; r.nameFixed = r.ocrNames.length > 1 && r.ocrNames.some((n) => n !== exact) ? r.ocrNames.filter((n) => n !== exact).join(", ") : ""; continue; }
      const best = r.ocrNames.map((n) => bestName(n, pmsNames)).filter(Boolean).sort((a, b) => (b.score || 1) - (a.score || 1))[0];
      if (best) { r.name = best.name; r.nameFixed = r.ocrNames.join(", "); }
      else { r.name = r.ocrNames[0] || ""; r.nameFixed = ""; r.nameUnknown = true; }
    }
    out.sort((a, b) => (a.no ?? 999) - (b.no ?? 999));
    return out.map((r) => ({
      no: r.no, name: r.name, birth: r.birth, foreign: r.foreign, rate: r.rate, start: r.start, end: r.end, lead: r.lead,
      ocrNames: r.ocrNames, nameFixed: r.nameFixed || "", nameUnknown: !!r.nameUnknown,
      sources: [...r.sources], conflicts: Object.fromEntries(Object.entries(r.conflicts).map(([k, v]) => [k, [...v]])),
    }));
  }

  // ---------- 대조용 모양으로 (IRIS parse 결과와 같은 모양) ----------
  function toParsed(rows, meta = {}) {
    const people = rows.filter((r) => r.name).map((r, i) => {
      const start = P.parseDate(r.start), end = P.parseDate(r.end);
      const rate = Number(r.rate);
      const periods = start && end && Number.isFinite(rate) ? [{ start, end, rate }] : [];
      return {
        source: "RCMS", row: i + 1, seq: String(r.no ?? i + 1), name: r.name, org: "한국전자통신연구원",
        kind: "", role: r.lead ? "연구책임자" : "참여연구자", researcherNo: "", status: "",
        birth: r.birth, foreign: r.foreign, periods, months: P.expandToMonths(periods),
      };
    });
    if (!people.length) return { ok: false, error: "RCMS 캡처에서 참여연구자를 읽지 못했어요. 표가 보이게 다시 캡처해 주세요." };
    return {
      ok: true,
      meta: { system: "RCMS", avgOnly: true, totalCount: people.length, targetCount: people.length, otherOrgCounts: {}, ...meta },
      people, others: [],
    };
  }

  return { readImage, parseLine, mergeRows, toParsed, bestName, similarity };
})();
