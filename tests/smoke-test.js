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

const M = ["2026-04월", "2026-05월", "2026-06월", "2026-07월", "2026-08월", "2026-09월", "2026-10월", "2026-11월", "2026-12월"];
const pmsRow = (name, info, agree, exec, months) =>
  [name, info, "참여연구원", "", agree, "", exec, "", "", "", ...months.map(String)];
const pmsGrid = [
  ["참여자", "참여자", "참여자", "협약사업", "협약사업", "실행과제(99XX0001)", "실행과제(99XX0001)", "타 참여율", "타 참여율", "월별 인건비 참여율(%)", ...M.map(() => "월별 인건비 참여율(%)")],
  ["성명", "개인번호/부서/직급", "참여유형", "총참여율", "참여기간/참여율", "총참여율", "참여기간/참여율", "타과제", "타사업", "계", ...M],
  // 가나다: 완전 일치
  pmsRow("가나다", "00001/테스트실/책임연구원", "26/04/01 ~ 26/12/31 : 50%", "26/04/01 ~ 26/12/31 : 50%", [50, 50, 50, 50, 50, 50, 50, 50, 50]),
  // 라마바: 월별은 다르지만 IRIS에 연평균(20%)으로 입력 → 연평균 일치  (10*6+... 평균 20)
  pmsRow("라마바", "00002/테스트실/선임연구원", "26/04/01 ~ 26/12/31 : 20%", "", [10, 10, 10, 10, 10, 10, 40, 40, 40]),
  // 사아자: IRIS가 기간별 3구간으로 같게 입력 → 일치
  pmsRow("사아자", "00003/테스트실/연구원", "", "26/04/01 ~ 26/06/30 : 40%,26/07/01 ~ 26/07/31 : 20%,26/08/01 ~ 26/12/31 : 10%", [40, 40, 40, 20, 10, 10, 10, 10, 10]),
  // 차카타: 11월부터 다름 → 불일치
  pmsRow("차카타", "00004/테스트실/연구원", "26/04/01 ~ 26/12/31 : 10%", "", [10, 10, 10, 10, 10, 10, 10, 50, 50]),
  // 동명이인: PMS에 2명
  pmsRow("홍길동", "00005/가실/연구원", "", "", [10, 10, 10, 10, 10, 10, 10, 10, 10]),
  pmsRow("홍길동", "00006/나실/연구원", "", "", [20, 20, 20, 20, 20, 20, 20, 20, 20]),
  // PMS에만 (IRIS 다른 기관에 같은 이름)
  pmsRow("파하가", "00007/테스트실/연구원", "", "", [10, 10, 10, 10, 10, 10, 10, 10, 10]),
  // 부분 참여월: IRIS 08/18~ 시작, 값은 같음 → 일치 + ◐
  pmsRow("나다라", "00008/테스트실/연구원", "", "", [0, 0, 0, 0, 30, 30, 30, 30, 30]),
  // 수행종료지만 값은 같음
  pmsRow("마바사", "00009/테스트실/연구원", "", "", [10, 10, 10, 10, 10, 10, 10, 10, 10]),
];

const irisHead = [
  ["순번", "연구기관\n역할구분", "연구기관\n명", "연구자 명", "참여구분", "연구자 역할\n구분", "국가\n연구자\n번호", "수행구분", "1", "", "", "2", "", "", "3", "", ""],
  ["", "", "", "", "", "", "", "", "참여시작일", "참여종료일", "산출 근거 연봉 금액", "참여시작일", "참여종료일", "산출 근거 연봉 금액", "참여시작일", "참여종료일", "산출 근거 연봉 금액"],
  ["", "", "", "", "", "", "", "", "계상비율(현금)", "계상비율(현물)", "계상비율(미지급금)", "계상비율(현금)", "계상비율(현물)", "계상비율(미지급금)", "계상비율(현금)", "계상비율(현물)", "계상비율(미지급금)"],
];
let seq = 0;
function irisPerson(org, name, status, periods) {
  seq++;
  const top = [String(seq), "주관연구개발기관", org, name, "내부연구원", "참여연구자", String(10000000 + seq), status];
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
  ...irisPerson(ETRI, "가나다", "수행중", [["2026-04-01", "2026-12-31", 50]]),
  ...irisPerson(ETRI, "라마바", "수행중", [["2026-04-01", "2026-12-31", 20]]),
  ...irisPerson(ETRI, "사아자", "수행중", [["2026-04-01", "2026-06-30", 40], ["2026-07-01", "2026-07-31", 20], ["2026-08-01", "2026-12-31", 10]]),
  ...irisPerson(ETRI, "차카타", "수행중", [["2026-04-01", "2026-12-31", 10]]),
  ...irisPerson(ETRI, "홍길동", "수행중", [["2026-04-01", "2026-12-31", 10]]),
  ...irisPerson(ETRI, "나다라", "수행중", [["2026-08-18", "2026-12-31", 30]]),
  ...irisPerson(ETRI, "마바사", "수행종료", [["2026-04-01", "2026-12-31", 10]]),
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
expect("IRIS ETRI 인원", iris.people.length, 8);

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

if (failed) { console.log(`\n❌ ${failed}개 실패`); process.exit(1); }
console.log("\n✅ 스모크 테스트 통과");
