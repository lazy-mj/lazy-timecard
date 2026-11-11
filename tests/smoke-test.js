// 스모크 테스트 (Node 환경, 실제 앱에는 포함되지 않음)
// 실행: node tests/smoke-test.js   (lazy-timecard 폴더에서)
// 실제 PMS/IRIS 파일과 같은 모양의 합성 그리드(가짜 이름)로 판정 규칙을 검증한다.
global.window = global;
const fs = require("fs");
const path = require("path");
const load = (p) => eval(fs.readFileSync(path.join(__dirname, "..", p), "utf8"));

load("js/core/grid-utils.js");
load("js/core/period.js");
load("js/systems/registry.js");
load("js/systems/pms.js");
load("js/systems/iris.js");
load("js/core/compare.js");
load("js/systems/rcms.js");

const M = ["2026-04월", "2026-05월", "2026-06월", "2026-07월", "2026-08월", "2026-09월", "2026-10월", "2026-11월", "2026-12월"];
const pmsRow = (name, info, agree, exec, months, role = "참여연구원") =>
  [name, info, role, "", agree, "", exec, "", "", "", ...months.map(String)];
const pmsGrid = [
  ["참여자", "참여자", "참여자", "협약사업", "협약사업", "실행과제(99XX0001)", "실행과제(99XX0001)", "타 참여율", "타 참여율", "월별 인건비 참여율(%)", ...M.map(() => "월별 인건비 참여율(%)")],
  ["성명", "개인번호/부서/직급", "참여유형", "총참여율", "참여기간/참여율", "총참여율", "참여기간/참여율", "타과제", "타사업", "계", ...M],
  // 가나다: 완전 일치
  pmsRow("가나다", "00001/테스트실/책임연구원", "26/04/01 ~ 26/12/31 : 50%", "26/04/01 ~ 26/12/31 : 50%", [50, 50, 50, 50, 50, 50, 50, 50, 50]),
  // 라마바: 월별은 다르지만 IRIS에 연평균(20%)으로 입력 → 연평균 일치  (10*6+... 평균 20)
  pmsRow("라마바", "00002/테스트실/선임연구원", "26/04/01 ~ 26/12/31 : 20%", "", [10, 10, 10, 10, 10, 10, 40, 40, 40]),
  // 사아자: IRIS가 기간별 3구간으로 같게 입력 → 일치
  pmsRow("사아자", "00003/테스트실/위촉연구원", "", "26/04/01 ~ 26/06/30 : 40%,26/07/01 ~ 26/07/31 : 20%,26/08/01 ~ 26/12/31 : 10%", [40, 40, 40, 20, 10, 10, 10, 10, 10]),
  // 차카타: 11월부터 다름 → 불일치. 과제 책임자라서 판정과 상관없이 맨 위
  pmsRow("차카타", "00004/테스트실/연구원", "26/04/01 ~ 26/12/31 : 10%", "", [10, 10, 10, 10, 10, 10, 10, 50, 50], "사업책임자"),
  // 동명이인: PMS에 2명
  pmsRow("홍길동", "00005/가실/연구원", "", "", [10, 10, 10, 10, 10, 10, 10, 10, 10]),
  pmsRow("홍길동", "00006/나실/연구원", "", "", [20, 20, 20, 20, 20, 20, 20, 20, 20]),
  // PMS에만 (IRIS 다른 기관에 같은 이름)
  pmsRow("파하가", "00007/테스트실/연구원", "", "", [10, 10, 10, 10, 10, 10, 10, 10, 10]),
  // 부분 참여월: IRIS 08/18~ 시작, 값은 같음 → 일치 + ◐
  pmsRow("나다라", "00008/테스트실/연구연수생", "", "", [0, 0, 0, 0, 30, 30, 30, 30, 30]),
  // 기간 다름: 참여율은 같지만 PMS는 08/01~, IRIS는 08/18~
  // 평균 근사: PMS 평균 20.56% (185/9), IRIS 연평균 21% → 확인 필요
  pmsRow("평균근", "00011/테스트실/연구원", "", "", [20, 20, 20, 20, 20, 20, 20, 20, 25]),
  pmsRow("다라마", "00010/테스트실/연구원", "", "26/08/01 ~ 26/12/31 : 100%", [0, 0, 0, 0, 100, 100, 100, 100, 100]),
  // 수행종료지만 값은 같음
  pmsRow("마바사", "00009/테스트실/UST학생연구원", "", "", [10, 10, 10, 10, 10, 10, 10, 10, 10]),
];

const irisHead = [
  ["순번", "연구기관\n역할구분", "연구기관\n명", "연구자 명", "참여구분", "연구자 역할\n구분", "국가\n연구자\n번호", "수행구분", "1", "", "", "2", "", "", "3", "", ""],
  ["", "", "", "", "", "", "", "", "참여시작일", "참여종료일", "산출 근거 연봉 금액", "참여시작일", "참여종료일", "산출 근거 연봉 금액", "참여시작일", "참여종료일", "산출 근거 연봉 금액"],
  ["", "", "", "", "", "", "", "", "계상비율(현금)", "계상비율(현물)", "계상비율(미지급금)", "계상비율(현금)", "계상비율(현물)", "계상비율(미지급금)", "계상비율(현금)", "계상비율(현물)", "계상비율(미지급금)"],
];
let seq = 0;
function irisPerson(org, name, status, periods, kind = "내부연구원") {
  seq++;
  const top = [String(seq), "주관연구개발기관", org, name, kind, "참여연구자", String(10000000 + seq), status];
  const bottom = ["", "", "", "", "", "", "", ""];
  for (let i = 0; i < 3; i++) {
    const p = periods[i];
    top.push(p ? p[0] : "", p ? p[1] : "", p ? "***" : "0");
    bottom.push(p ? String(p[2]) : "", p ? "0" : "", p ? "0" : "");
  }
  return [top, bottom];
}
const ETRI = "한국전자통신연구원";
const irisGrid = [
  ...irisHead,
  ...irisPerson(ETRI, "가나다", "수행중", [["2026-04-01", "2026-12-31", 50]], "학생"),
  ...irisPerson(ETRI, "라마바", "수행중", [["2026-04-01", "2026-12-31", 20]]),
  ...irisPerson(ETRI, "사아자", "수행중", [["2026-04-01", "2026-06-30", 40], ["2026-07-01", "2026-07-31", 20], ["2026-08-01", "2026-12-31", 10]], "학생"),
  ...irisPerson(ETRI, "차카타", "수행중", [["2026-04-01", "2026-12-31", 10]]),
  ...irisPerson(ETRI, "홍길동", "수행중", [["2026-04-01", "2026-12-31", 10]]),
  ...irisPerson(ETRI, "나다라", "수행중", [["2026-08-18", "2026-12-31", 30]], "학생"),
  ...irisPerson(ETRI, "마바사", "수행종료", [["2026-04-01", "2026-12-31", 10]]),
  ...irisPerson(ETRI, "평균근", "수행중", [["2026-04-01", "2026-12-31", 21]]),
  ...irisPerson(ETRI, "다라마", "수행중", [["2026-08-18", "2026-12-31", 100]]),
  ...irisPerson(ETRI, "IRIS만", "수행중", [["2026-04-01", "2026-12-31", 5]]),
  ...irisPerson("다른연구원", "파하가", "수행중", [["2026-04-01", "2026-12-31", 10]]),
];

let failed = 0;
function expect(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${actual}${ok ? "" : ` (기대값 ${expected})`}`);
}

expect("PMS 판별", SystemRegistry.detectType(pmsGrid), "PMS");
expect("IRIS 판별", SystemRegistry.detectType(irisGrid), "IRIS");

const pms = SystemRegistry.get("PMS").parse(pmsGrid);
const iris = SystemRegistry.get("IRIS").parse(irisGrid);
expect("PMS 파싱", pms.ok, true);
expect("IRIS 파싱", iris.ok, true);
expect("과제번호", pms.meta.projectCode, "99XX0001");
expect("IRIS ETRI 인원", iris.people.length, 10);

const res = Compare.run(pms, iris);
expect("대조 성공", res.ok, true);
const row = (n) => res.rows.find((r) => r.name === n);

expect("가나다 완전 일치", row("가나다").verdict, "match");
expect("라마바 연평균 일치", row("라마바").verdict, "avg-match");
expect("사아자 기간별 일치", row("사아자").verdict, "match");
expect("차카타 불일치", row("차카타").verdict, "mismatch");
expect("차카타 다른 달 수", row("차카타").monthly.mismatch, 2);
expect("차카타 협약 기준", row("차카타").agreement.verdict, "match");
expect("홍길동 동명이인", row("홍길동").verdict, "duplicate");
expect("파하가 PMS에만", row("파하가").verdict, "pmsOnly");
expect("파하가 다른 기관 안내", row("파하가").flags.some((f) => f.text.includes("다른연구원")), true);
expect("IRIS만 IRIS에만", row("IRIS만").verdict, "irisOnly");
expect("나다라 부분월 일치", row("나다라").verdict, "match");
expect("나다라 8월 부분 표시", row("나다라").monthly.cells["2026-08"].partial, true);
expect("마바사 수행종료 경고", row("마바사").flags.some((f) => f.text.includes("수행종료")), true);
expect("PMS 내부 불일치 없음(사아자)", row("사아자").pms.internalIssues.length, 0);
expect("다라마 기간 다름", row("다라마").verdict, "period");
expect("다라마 기간 표시", row("다라마").monthly.periodDiff.iris, "26.08.18~26.12.31");
expect("책임자 맨 위", res.rows[0].name, "차카타");
expect("평균 근사 → 확인 필요", row("평균근").verdict, "avg-near");
expect("과제 책임자 이름", res.leaderName, "차카타");
expect("학생인데 PMS 직급 책임연구원 → 안내", row("가나다").flags.some((f) => f.text.includes("학생")), true);
const studentFlag = (n) => row(n).flags.some((f) => f.text.includes("학생"));
expect("위촉연구원 + IRIS 학생 → 안내 없음", studentFlag("사아자"), false);
expect("연구연수생 + IRIS 학생 → 안내", studentFlag("나다라"), true);
expect("UST학생연구원 + IRIS 내부연구원 → 안내", studentFlag("마바사"), true);
expect("학생 안내는 판정을 바꾸지 않음", row("가나다").verdict, "match");
expect("IRIS 미등록 수", res.summary.irisMissing, 1);
expect("PMS 미등록 수", res.summary.pmsMissing, 1);

// 자동 짝짓기: 이름이 많이 겹치는 쪽끼리, 절반 미만이면 짝 없음
const pairs = Compare.suggestPairs(
  [{ id: 1, parsed: pms }, { id: 2, parsed: { ok: true, people: [{ name: "없는사람" }] } }],
  [{ id: 10, parsed: { ok: true, people: [{ name: "가나다" }] } }, { id: 11, parsed: iris }]);
expect("짝짓기: PMS1 ↔ IRIS11", pairs[1], 11);
expect("짝짓기: 겹침 없으면 짝 없음", pairs[2], undefined);

// ---- 한 과제를 PMS 실행계정 2개로 나눈 경우: 합산해서 IRIS 하나와 대조 ----
const splitHead = (code) => [
  pmsGrid[0].map((h) => (h.startsWith("실행과제") ? `실행과제(${code})` : h)),
  pmsGrid[1],
];
const accA = [...splitHead("99XX000A"),
  pmsRow("가나다", "00001/테스트실/책임연구원", "26/04/01 ~ 26/12/31 : 50%", "26/04/01 ~ 26/12/31 : 30%", [30, 30, 30, 30, 30, 30, 30, 30, 30], "사업책임자"),
  pmsRow("라마바", "00002/테스트실/선임연구원", "", "26/04/01 ~ 26/12/31 : 10%", [10, 10, 10, 10, 10, 10, 10, 10, 10])];
const accB = [...splitHead("99XX000B"),
  pmsRow("가나다", "00001/테스트실/책임연구원", "26/04/01 ~ 26/12/31 : 50%", "26/04/01 ~ 26/12/31 : 20%", [20, 20, 20, 20, 20, 20, 20, 20, 20]),
  pmsRow("사아자", "00003/테스트실/연구원", "", "26/07/01 ~ 26/12/31 : 40%", [0, 0, 0, 40, 40, 40, 40, 40, 40])];
seq = 0;
const irisSplit = [...irisHead,
  ...irisPerson(ETRI, "가나다", "수행중", [["2026-04-01", "2026-12-31", 50]]),
  ...irisPerson(ETRI, "라마바", "수행중", [["2026-04-01", "2026-12-31", 10]]),
  ...irisPerson(ETRI, "사아자", "수행중", [["2026-07-01", "2026-12-31", 40]])];
const pA = SystemRegistry.get("PMS").parse(accA), pB = SystemRegistry.get("PMS").parse(accB);
const pI = SystemRegistry.get("IRIS").parse(irisSplit);
const splitPairs = Compare.suggestPairs([{ id: 1, parsed: pA }, { id: 2, parsed: pB }], [{ id: 9, parsed: pI }]);
expect("실행계정 2개 → 같은 IRIS로 자동 짝", `${splitPairs[1]},${splitPairs[2]}`, "9,9");
const mergedPms = Compare.mergePms([pA, pB]);
expect("합친 과제번호(짧게)", mergedPms.meta.projectCode, "99XX00xx · 실행계정 2개");
expect("합친 인원(이름 기준)", mergedPms.people.length, 3);
const splitRes = Compare.run(mergedPms, pI);
const srow = (n) => splitRes.rows.find((r) => r.name === n);
expect("가나다 30+20=50 → 일치", srow("가나다").verdict, "match");
expect("가나다 계정별 내역", srow("가나다").pms.monthly["2026-05"].parts.map((p) => p.code + ":" + p.rate).join(","), "99XX000A:30,99XX000B:20");
expect("협약은 더하지 않음", srow("가나다").agreement.verdict, "match");
expect("한쪽 계정에만 있는 사람도 일치", srow("사아자").verdict, "match");
expect("합친 과제 책임자", splitRes.leaderName, "가나다");

// ---- 실행계정끼리 사람이 안 겹치는 일반적인 경우 (XX10 / XX20) ----
const acc10 = [...splitHead("99YY0010"),
  pmsRow("가나다", "00001/테스트실/책임연구원", "", "26/04/01 ~ 26/12/31 : 50%", [50, 50, 50, 50, 50, 50, 50, 50, 50], "사업책임자"),
  pmsRow("라마바", "00002/테스트실/선임연구원", "", "26/04/01 ~ 26/12/31 : 10%", [10, 10, 10, 10, 10, 10, 10, 10, 10])];
const acc20 = [...splitHead("99YY0020"),
  pmsRow("사아자", "00003/테스트실/연구원", "", "26/07/01 ~ 26/12/31 : 40%", [0, 0, 0, 40, 40, 40, 40, 40, 40]),
  pmsRow("차카타", "00004/테스트실/연구원", "", "26/04/01 ~ 26/12/31 : 10%", [10, 10, 10, 10, 10, 10, 10, 10, 10]),
  pmsRow("새로운", "00012/테스트실/연구원", "", "26/04/01 ~ 26/12/31 : 10%", [10, 10, 10, 10, 10, 10, 10, 10, 10])];
seq = 0;
const irisFam = [...irisHead,
  ...irisPerson(ETRI, "가나다", "수행중", [["2026-04-01", "2026-12-31", 50]]),
  ...irisPerson(ETRI, "라마바", "수행중", [["2026-04-01", "2026-12-31", 10]]),
  ...irisPerson(ETRI, "사아자", "수행중", [["2026-07-01", "2026-12-31", 40]]),
  ...irisPerson(ETRI, "차카타", "수행중", [["2026-04-01", "2026-12-31", 10]])];
const p10 = SystemRegistry.get("PMS").parse(acc10), p20 = SystemRegistry.get("PMS").parse(acc20);
const pFam = SystemRegistry.get("IRIS").parse(irisFam);
// 99YY0020 은 3명 중 2명만 IRIS에 있음(67%) → 80% 미만이지만 과제번호 앞부분(99YY00)이 같아서 같은 IRIS에 붙어야 함
const famPairs = Compare.suggestPairs([{ id: 1, parsed: p10 }, { id: 2, parsed: p20 }], [{ id: 9, parsed: pFam }]);
expect("XX10·XX20 → 같은 IRIS (과제번호 규칙)", `${famPairs[1]},${famPairs[2]}`, "9,9");
// 과제번호가 다른 과제면 67% 겹침으로는 붙이지 않음
const p20other = SystemRegistry.get("PMS").parse([...splitHead("88ZZ0020"), ...acc20.slice(2)]);
const otherPairs = Compare.suggestPairs([{ id: 1, parsed: p10 }, { id: 2, parsed: p20other }], [{ id: 9, parsed: pFam }]);
expect("다른 과제번호 + 67% 겹침 → 안 붙임", otherPairs[2], undefined);
const famRes = Compare.run(Compare.mergePms([p10, p20]), pFam);
expect("계정 합산 후 IRIS 미등록 없음(새로운 제외)", famRes.summary.irisMissing, 1);
expect("계정 합산 후 일치 4명", famRes.summary.match, 4);

// ---- 재입사(새 개인번호)로 같은 이름이 두 줄 + 이름 축약(외국인) ----
const reGrid = [...splitHead("99RR0010"),
  pmsRow("가나다", "00001/테스트실/책임연구원", "", "26/04/01 ~ 26/12/31 : 50%", [50, 50, 50, 50, 50, 50, 50, 50, 50], "사업책임자"),
  pmsRow("김연수", "90001/가실/연구연수생", "", "26/04/01 ~ 26/05/31 : 100%", [100, 100, 0, 0, 0, 0, 0, 0, 0]),
  pmsRow("김연수", "90002/나실/연구연수생", "", "26/07/01 ~ 26/08/31 : 100%", [0, 0, 0, 100, 100, 0, 0, 0, 0]),
  pmsRow("마이클", "00013/테스트실/책임연구원", "", "26/04/01 ~ 26/12/31 : 30%", [30, 30, 30, 30, 30, 30, 30, 30, 30]),
  pmsRow("과제장", "00014/테스트실/책임연구원", "", "26/04/01 ~ 26/12/31 : 10%", [10, 10, 10, 10, 10, 10, 10, 10, 10], "과제책임자")];
seq = 0;
const irisRe = [...irisHead,
  ...irisPerson(ETRI, "가나다", "수행중", [["2026-04-01", "2026-12-31", 50]]),
  ...irisPerson(ETRI, "김연수", "수행중", [["2026-04-01", "2026-05-31", 100], ["2026-07-01", "2026-08-31", 100]]),
  ...irisPerson(ETRI, "존마이클스미스", "수행중", [["2026-04-01", "2026-12-31", 30]]),
  ...irisPerson(ETRI, "과제장", "수행중", [["2026-04-01", "2026-12-31", 10]])];
const reRes = Compare.run(SystemRegistry.get("PMS").parse(reGrid), SystemRegistry.get("IRIS").parse(irisRe));
const rr = (n) => reRes.rows.find((r) => r.name === n);
expect("재입사 두 줄 → 한 사람으로 합쳐 일치", rr("김연수").verdict, "match");
expect("재입사 합침 안내", rr("김연수").flags.some((f) => f.text.includes("90001")), true);
expect("축약 이름 ↔ IRIS 긴 이름 → 일치", rr("마이클").verdict, "match");
expect("미등록 없음", reRes.summary.oneSide, 0);
expect("사업책임자만 맨 위", reRes.rows[0].name + (reRes.rows[0].isLead ? "*" : ""), "가나다*");
expect("과제책임자는 계정 책임자 태그", rr("과제장").isSubLead && !rr("과제장").isLead, true);

// ---- RCMS 캡처 글자 인식 결과(줄 텍스트) → 확인표 → 연평균 대조 ----
// 캡처 2장이 겹침(3번 줄), 인식 오류 이름(가니다 → 가나다), 머리줄·제목 줄 섞임
const rcmsLines = [
  ["No. 연구개발기관 참여구분 성명 생년월일 내/외국인구분 인건비계상률 참여시작일 참여종료일 채용형태",
   "1 과제색임자 가니다 1970.01.02 내국인 50 2026.04.01 2026.12.31 일반의무채용",
   "2 한국전자통신연구원 라마바 1980.03.04 내국인 20 2026.04.01 2026.12.31 일반의무채용",
   "3 차카타 1990.05.06 내국인 22.5 2026.04.01 2026.12.31 일반의무채용"],
  ["3 차카타 1990.05.06 내국인 22.5 2026.04.01 2026.12.31 일반의무채용",
   "4 참여연구자 사아자 1985.07.08 내국인 10 2026.07.01 2026.12.31 일반의무채용"],
];
const rcmsPms = [...splitHead("99RC0010"),
  pmsRow("가나다", "00001/테스트실/책임연구원", "", "26/04/01 ~ 26/12/31 : 50%", [50, 50, 50, 50, 50, 50, 50, 50, 50], "사업책임자"),
  pmsRow("라마바", "00002/테스트실/선임연구원", "", "26/04/01 ~ 26/12/31 : 20%", [10, 10, 10, 30, 30, 30, 20, 20, 20]),
  pmsRow("차카타", "00004/테스트실/연구원", "", "26/04/01 ~ 26/12/31 : 20%", [20, 20, 20, 20, 25, 25, 25, 25, 20]),
  pmsRow("사아자", "00003/테스트실/연구원", "", "26/07/01 ~ 26/12/31 : 40%", [0, 0, 0, 40, 40, 40, 40, 40, 40])];
const pR = SystemRegistry.get("PMS").parse(rcmsPms);
const rcRows = RcmsOcr.mergeRows(rcmsLines.map((ls) => ls.map(RcmsOcr.parseLine).filter(Boolean)), pR.people.map((p) => p.name));
expect("RCMS 줄 4명 (겹친 줄 합침)", rcRows.length, 4);
expect("RCMS 겹친 줄은 캡처 1·2", rcRows.find((r) => r.no === 3).sources.join(","), "1,2");
expect("RCMS 이름 보정 가니다 → 가나다", rcRows[0].name + "/" + rcRows[0].nameFixed, "가나다/가니다");
expect("RCMS 책임자 인식(색임자)", rcRows[0].lead, true);
expect("RCMS 계상률 소수", rcRows.find((r) => r.no === 3).rate, 22.5);
const rcRes = Compare.run(pR, RcmsOcr.toParsed(rcRows));
const rcr = (n) => rcRes.rows.find((r) => r.name === n);
expect("RCMS 대조 모드", rcRes.ext + "/" + rcRes.avgOnly, "RCMS/true");
expect("RCMS 평균 같으면 매달 달라도 일치(라마바 20)", rcr("라마바").verdict, "match");
expect("RCMS 22.5 vs PMS 평균 22.22 → 불일치", rcr("차카타").verdict, "mismatch");
expect("RCMS 사아자 40 vs 10 → 불일치", rcr("사아자").verdict, "mismatch");
expect("RCMS 가나다 일치", rcr("가나다").verdict, "match");

if (failed) { console.log(`\n❌ ${failed}개 실패`); process.exit(1); }
console.log("\n✅ 스모크 테스트 통과");
