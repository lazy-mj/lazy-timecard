// ============================================================
// core/period.js
// 날짜·기간·월 단위 펼치기 유틸.
//
// 두 시스템은 참여율을 서로 다른 모양으로 준다.
//  - PMS  : "26/04/01 ~ 26/12/31 : 50%" 같은 기간 문구 + 월별 열(2026-04월 …)
//  - IRIS : 기간 1~5개(시작일·종료일) + 기간별 계상비율
// 그래서 비교 전에 전부 "월 → 참여율" 모양으로 펼친다(expandToMonths).
// 한 달을 다 채우지 못한 기간(예: 08-18~08-31)은 partial 로 표시해 둔다.
// ============================================================

window.Period = (() => {

  function pad2(n) { return String(n).padStart(2, "0"); }

  // 내부 표현: { y, m, d } (m은 1~12)
  function ymd(y, m, d) { return { y, m, d }; }

  function toKey(date) { return `${date.y}-${pad2(date.m)}-${pad2(date.d)}`; }
  function monthKey(y, m) { return `${y}-${pad2(m)}`; }

  function fullYear(y) {
    const n = Number(y);
    return n < 100 ? 2000 + n : n;
  }

  // 엑셀 날짜 일련번호(1900 체계) -> {y,m,d}
  function fromSerial(serial) {
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const dt = new Date(ms);
    return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  // "2026-04-01", "2026.04.01", "2026/04/01", "26/04/01", "4/1/26"(SheetJS 기본 날짜 표기), 46113(일련번호)
  function parseDate(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return valid(ymd(+m[1], +m[2], +m[3]));
    m = s.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (m) {
      // 앞자리가 13 이상이면 YY/MM/DD (PMS 표기), 아니면 M/D/YY(SheetJS 미국식 표기)로 본다.
      // PMS 문구는 항상 YY/MM/DD 이고 연도가 13 이상(2013년 이후)이라 충돌하지 않는다.
      if (+m[1] >= 13) return valid(ymd(fullYear(m[1]), +m[2], +m[3]));
      return valid(ymd(fullYear(m[3]), +m[1], +m[2]));
    }
    if (/^\d{5}(\.\d+)?$/.test(s)) return fromSerial(Number(s));
    return null;
  }

  function valid(d) {
    if (d.m < 1 || d.m > 12 || d.d < 1 || d.d > 31) return null;
    return d;
  }

  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  function cmp(a, b) {
    return (a.y - b.y) || (a.m - b.m) || (a.d - b.d);
  }

  // "50%", "50", " 12.5 % " -> 숫자. 빈 값이면 null
  function parseRate(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).replace(/[%,\s]/g, "");
    if (s === "" || s === "-") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // PMS 기간 문구: "26/04/01 ~ 26/05/31 : 10%,26/06/01 ~ 26/10/31 : 5%"
  function parsePmsPeriodText(text) {
    const periods = [];
    if (!text) return periods;
    const re = /(\d{2,4}[./-]\d{1,2}[./-]\d{1,2})\s*~\s*(\d{2,4}[./-]\d{1,2}[./-]\d{1,2})\s*:\s*([\d.]+)\s*%?/g;
    let m;
    while ((m = re.exec(String(text))) !== null) {
      const start = parseDate(m[1]);
      const end = parseDate(m[2]);
      const rate = Number(m[3]);
      if (start && end && Number.isFinite(rate)) periods.push({ start, end, rate });
    }
    return periods;
  }

  // 기간 목록 -> { "2026-04": { segments:[{rate,start,end,days}], coveredDays, monthDays } }
  // 같은 달에 기간이 둘 이상 걸치면 segments 가 여러 개가 된다.
  function expandToMonths(periods) {
    const months = {};
    for (const p of periods) {
      if (!p.start || !p.end || cmp(p.start, p.end) > 0) continue;
      let y = p.start.y, m = p.start.m;
      while (y < p.end.y || (y === p.end.y && m <= p.end.m)) {
        const dim = daysInMonth(y, m);
        const fromD = (y === p.start.y && m === p.start.m) ? p.start.d : 1;
        const toD = (y === p.end.y && m === p.end.m) ? Math.min(p.end.d, dim) : dim;
        const key = monthKey(y, m);
        if (!months[key]) months[key] = { segments: [], coveredDays: 0, monthDays: dim };
        months[key].segments.push({ rate: p.rate, start: ymd(y, m, fromD), end: ymd(y, m, toD), days: toD - fromD + 1 });
        months[key].coveredDays += toD - fromD + 1;
        m++;
        if (m > 12) { m = 1; y++; }
      }
    }
    for (const key of Object.keys(months)) {
      const info = months[key];
      info.partial = info.coveredDays < info.monthDays;
      const rates = [...new Set(info.segments.map((s) => s.rate))];
      // 한 달 안에서 참여율이 하나로 정해지면 rate, 둘 이상이면 rate=null + mixed
      info.mixed = rates.length > 1;
      info.rate = info.mixed ? null : rates[0];
    }
    return months;
  }

  // 월별 숫자 맵 { "2026-04": 50 } -> expandToMonths 와 같은 모양으로
  function monthlyValuesToMonths(values) {
    const months = {};
    for (const [key, rate] of Object.entries(values)) {
      if (rate === null || rate === undefined) continue;
      const [y, m] = key.split("-").map(Number);
      const dim = daysInMonth(y, m);
      months[key] = {
        segments: [{ rate, start: ymd(y, m, 1), end: ymd(y, m, dim), days: dim }],
        coveredDays: dim, monthDays: dim, partial: false, mixed: false, rate,
      };
    }
    return months;
  }

  function shortDate(d) { return `${pad2(d.m)}/${pad2(d.d)}`; }
  function fullDate(d) { return d ? toKey(d) : ""; }

  // 참여기간 내 평균 참여율 = (참여율 > 0 인 달의 참여율 합) / (그 달 수)
  function averageRate(months) {
    const vals = Object.values(months).map((v) => v.rate).filter((r) => r !== null && r > 0);
    if (!vals.length) return { avg: 0, count: 0, sum: 0 };
    const sum = vals.reduce((a, b) => a + b, 0);
    return { avg: sum / vals.length, count: vals.length, sum };
  }

  function sortedKeys(...maps) {
    const set = new Set();
    for (const mp of maps) for (const k of Object.keys(mp || {})) set.add(k);
    return [...set].sort();
  }

  return {
    parseDate, parseRate, parsePmsPeriodText, expandToMonths, monthlyValuesToMonths,
    averageRate, sortedKeys, shortDate, fullDate, cmp, monthKey,
  };
})();
