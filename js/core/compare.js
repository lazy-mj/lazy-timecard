// ============================================================
// core/compare.js
// PMS ↔ IRIS 참여인력 대조 엔진 (DOM 없음, 순수 계산).
//
// 1) 사람 매칭: 공통 ID가 없어서 이름(공백 제거)으로 맞춘다.
//    같은 이름이 한쪽에 2명 이상이면 자동 매칭하지 않고 "동명이인 확인" 으로 돌린다.
// 2) 월별 대조: 두 시스템을 전부 {월: 참여율}로 펼친 뒤 달마다 비교한다.
//    - 기준A: PMS 월별 인건비 참여율 열 (주 비교)
//    - 기준B: PMS 협약사업 참여기간/참여율 문구 (보조 비교)
// 3) 연평균 입력 인정: IRIS에 기간 1개로만(연평참) 넣은 경우,
//    달마다는 달라도 "참여기간이 같고 평균 참여율이 같으면" 연평균 일치로 본다.
//    평균 = 참여기간 내 참여율 합 / 참여 개월수
// ============================================================

window.Compare = (() => {
  const P = window.Period;
  const norm = (s) => String(s || "").replace(/\s+/g, "");
  const EPS = 0.005;
  // PMS 직급 중 학생연구원 (동·하계 연구연수생은 제외)
  const STUDENT_RANK = /위촉연구원|UST학생연구원|학연학생|학생연구원/;

  function round2(n) { return Math.round(n * 100) / 100; }

  // 한 사람의 두 월별 맵을 달마다 비교
  function compareMonths(base, iris, keys) {
    const cells = {};
    let mismatch = 0, review = 0, partial = 0, compared = 0;
    for (const k of keys) {
      const a = base[k];
      const b = iris[k];
      const aRate = a ? a.rate : 0;
      const bRate = b ? b.rate : 0;
      const aZero = !a || a.rate === 0;
      const bZero = !b || b.rate === 0;
      if (aZero && bZero) { cells[k] = { status: "none", base: a || null, iris: b || null }; continue; }
      compared++;
      const isPartial = !!((a && a.partial) || (b && b.partial));
      const isMixed = !!((a && a.mixed) || (b && b.mixed));
      let status;
      if (isMixed) status = "review";
      else status = Math.abs((aRate || 0) - (bRate || 0)) < EPS ? "match" : "mismatch";
      if (status === "mismatch") mismatch++;
      if (status === "review") review++;
      if (isPartial) partial++;
      cells[k] = { status, partial: isPartial, base: a || null, iris: b || null };
    }
    return { cells, mismatch, review, partial, compared };
  }

  function activeRange(months) {
    const keys = Object.keys(months).filter((k) => months[k].rate === null || months[k].rate > 0).sort();
    return keys.length ? { from: keys[0], to: keys[keys.length - 1], count: keys.length } : null;
  }

  // 참여기간(일 단위): 참여율 > 0 인 기간들의 가장 이른 시작일 ~ 가장 늦은 종료일
  function dayRange(periods) {
    const ps = (periods || []).filter((p) => p.rate > 0 && p.start && p.end);
    if (!ps.length) return null;
    let start = ps[0].start, end = ps[0].end;
    for (const p of ps) {
      if (P.cmp(p.start, start) < 0) start = p.start;
      if (P.cmp(p.end, end) > 0) end = p.end;
    }
    return { start, end };
  }
  function fmtDayRange(r) { return r ? `${P.fullDate(r.start).slice(2).replace(/-/g, ".")}~${P.fullDate(r.end).slice(2).replace(/-/g, ".")}` : "없음"; }

  // 기준 하나(월별 또는 협약)에 대한 판정
  // basePeriods: PMS 쪽 일 단위 기간(월별 기준이면 실행과제 문구, 협약 기준이면 협약사업 문구) - 참여기간 비교용
  function judge(baseMonths, irisPerson, keys, basePeriods) {
    const out = judgeRates(baseMonths, irisPerson, keys);
    // 참여기간(시작일·종료일) 비교. 월별 참여율이 같아도 날짜가 다르면 '기간 다름'
    const ra = dayRange(basePeriods), rb = dayRange(irisPerson.periods);
    const ratesAgree = ["match", "avg-match", "avg-near"].includes(out.verdict);
    if (ratesAgree && ra && rb && (P.cmp(ra.start, rb.start) !== 0 || P.cmp(ra.end, rb.end) !== 0)) {
      out.periodDiff = { pms: fmtDayRange(ra), iris: fmtDayRange(rb) };
      // 시작일·종료일이 다른 달을 표에서 짚어주기 (이미 불일치인 칸은 그대로)
      const mk = (d) => P.monthKey(d.y, d.m);
      const marks = [];
      if (P.cmp(ra.start, rb.start) !== 0) marks.push(mk(ra.start), mk(rb.start));
      if (P.cmp(ra.end, rb.end) !== 0) marks.push(mk(ra.end), mk(rb.end));
      for (const k of marks) {
        const c = out.cells[k];
        if (c && c.status !== "mismatch") c.status = "period";
        else if (!c) out.cells[k] = { status: "period", base: baseMonths[k] || null, iris: irisPerson.months[k] || null };
      }
      if (out.verdict !== "avg-near") out.verdict = "period";
    }
    return out;
  }

  function judgeRates(baseMonths, irisPerson, keys) {
    const res = compareMonths(baseMonths, irisPerson.months, keys);
    const baseAvg = P.averageRate(baseMonths);
    const irisAvg = P.averageRate(irisPerson.months);
    const out = {
      ...res,
      baseAvg: round2(baseAvg.avg), baseMonthsCount: baseAvg.count,
      irisAvg: round2(irisAvg.avg), irisMonthsCount: irisAvg.count,
      verdict: "match",
      avgNote: "",
    };
    if (!Object.keys(baseMonths).length) { out.verdict = "nodata"; return out; }
    if (res.mismatch === 0 && res.review === 0) { out.verdict = "match"; return out; }

    // 연평균 입력 인정 검사: IRIS 기간이 1개뿐이고, 참여 시작·끝 달이 같고, 평균이 같을 때
    const onePeriod = irisPerson.periods.filter((p) => p.rate > 0).length === 1;
    if (onePeriod && res.review === 0) {
      const ra = activeRange(baseMonths);
      const rb = activeRange(irisPerson.months);
      const sameRange = ra && rb && ra.from === rb.from && ra.to === rb.to;
      const irisRate = irisPerson.periods.find((p) => p.rate > 0).rate;
      if (sameRange && Math.abs(baseAvg.avg - irisRate) < EPS) {
        out.verdict = "avg-match";
        out.avgNote = `IRIS에 연평균(${irisRate}%)으로 입력됨 · PMS 평균 ${round2(baseAvg.avg)}% (${baseAvg.count}개월)`;
        return out;
      }
      // IRIS 연평균이 PMS 평균을 반올림한 값처럼 보이면(예: 42.5 → 43) 불일치 대신 확인 필요
      if (sameRange && Math.abs(baseAvg.avg - irisRate) < 1 && Math.round(baseAvg.avg) === Math.round(irisRate)) {
        out.verdict = "avg-near";
        out.avgNote = `IRIS 연평균 ${irisRate}% ≈ PMS 평균 ${round2(baseAvg.avg)}% (${baseAvg.count}개월) — 반올림 차이인지 확인해주세요`;
        return out;
      }
    }
    out.verdict = res.mismatch > 0 ? "mismatch" : "review";
    return out;
  }

  function fmtRange(r) {
    if (!r) return "없음";
    const f = (k) => `${k.slice(2, 4)}.${k.slice(5)}`;
    return r.from === r.to ? f(r.from) : `${f(r.from)}~${f(r.to)}`;
  }

  function groupByName(list) {
    const m = new Map();
    for (const p of list) {
      const k = norm(p.name);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    return m;
  }

  function run(pmsParsed, irisParsed) {
    if (!pmsParsed.ok) return { ok: false, error: "PMS: " + pmsParsed.error };
    if (!irisParsed.ok) return { ok: false, error: "IRIS: " + irisParsed.error };
    if (!irisParsed.people.length) {
      return { ok: false, error: "IRIS 파일에 한국전자통신연구원(ETRI) 연구자가 없어요. 다른 과제 파일인지 확인해주세요." };
    }

    const pmsByName = groupByName(pmsParsed.people);
    const irisByName = groupByName(irisParsed.people);
    const otherByName = groupByName(irisParsed.others || []);

    // 화면에 그릴 달 범위: PMS 월별 열 + 양쪽에서 펼친 달 전부
    const keySet = new Set(pmsParsed.meta.monthKeys);
    for (const p of pmsParsed.people) {
      Object.keys(p.agreement.months).forEach((k) => keySet.add(k));
    }
    for (const p of irisParsed.people) Object.keys(p.months).forEach((k) => keySet.add(k));
    const monthKeys = [...keySet].sort();

    const rows = [];
    const names = [...new Set([...pmsByName.keys(), ...irisByName.keys()])];
    for (const key of names) {
      const ps = pmsByName.get(key) || [];
      const is = irisByName.get(key) || [];
      const elsewhere = (otherByName.get(key) || []).map((o) => o.org);
      const dup = ps.length > 1 || is.length > 1;

      if (dup) {
        rows.push({
          kind: "duplicate", name: ps[0] ? ps[0].name : is[0].name,
          pms: ps, iris: is, flags: [{ level: "warn", text: `동명이인 확인 필요 (PMS ${ps.length}명 · IRIS ${is.length}명) — 자동 대조하지 않았어요` }],
          verdict: "duplicate",
        });
        continue;
      }

      const pms = ps[0] || null;
      const iris = is[0] || null;
      const flags = [];
      // 학생 구분 확인: PMS 직급이 학생연구원(위촉연구원·UST학생연구원·학연학생)인지와 IRIS 참여구분 '학생'이 서로 맞는지.
      // 동·하계 연구연수생은 학생연구원이 아니다.
      if (iris && pms) {
        const irisStudent = norm(iris.kind) === "학생";
        const pmsStudent = STUDENT_RANK.test(norm(pms.rank));
        if (irisStudent && !pmsStudent) {
          flags.push({ level: "warn", text: `IRIS 참여구분이 '학생'인데 PMS 직급은 '${pms.rank || "-"}'이에요 — 학생연구원(위촉연구원·UST학생연구원·학연학생)이 아니면 IRIS 구분을 확인해주세요` });
        } else if (pmsStudent && !irisStudent) {
          flags.push({ level: "warn", text: `PMS 직급은 학생연구원(${pms.rank})인데 IRIS 참여구분은 '${iris.kind || "-"}'이에요 — 확인해주세요` });
        }
      }
      if (iris && iris.status && norm(iris.status) !== "수행중") {
        flags.push({ level: pms ? "warn" : "info", text: `IRIS 수행구분이 '${iris.status}'이에요${pms ? " — PMS에는 참여 중으로 있어요" : ""}` });
      }

      if (pms && !iris) {
        if (elsewhere.length) flags.push({ level: "info", text: `IRIS 다른 기관(${elsewhere.join(", ")})에 같은 이름이 있어요` });
        rows.push({ kind: "pmsOnly", name: pms.name, pms, iris: null, flags, verdict: "pmsOnly" });
        continue;
      }
      if (!pms && iris) {
        rows.push({ kind: "irisOnly", name: iris.name, pms: null, iris, flags, verdict: "irisOnly" });
        continue;
      }

      if (iris.periods.length && iris.periods.every((p) => !p.rate)) {
        flags.push({ level: "warn", text: "IRIS 계상비율(현금)이 0%로 입력돼 있어요" });
      }
      const monthly = judge(pms.monthly, iris, monthKeys, pms.exec.periods);
      const agreement = pmsParsed.meta.hasAgreement ? judge(pms.agreement.months, iris, monthKeys, pms.agreement.periods) : null;
      if (monthly.periodDiff) flags.push({ level: "warn", text: `참여기간이 달라요 (중도입사·퇴사 등) — PMS ${monthly.periodDiff.pms} / IRIS ${monthly.periodDiff.iris}` });
      if (monthly.partial) flags.push({ level: "info", text: `한 달을 다 채우지 않은 참여월이 ${monthly.partial}개 있어요 (◐ 표시)` });
      if (monthly.review) flags.push({ level: "warn", text: `한 달 안에 참여율이 둘 이상인 달이 ${monthly.review}개 있어요 — 직접 확인해주세요` });

      rows.push({ kind: "matched", name: pms.name, pms, iris, monthly, agreement, flags, verdict: monthly.verdict });
    }

    // 정렬: 과제 책임자 맨 위 → 문제 있는 사람 → 일치, 같은 판정끼리는 PMS 순서
    const rank = { mismatch: 0, duplicate: 1, period: 2, "avg-near": 2, review: 3, pmsOnly: 4, irisOnly: 5, "avg-match": 6, match: 7, nodata: 8 };
    const pmsOrder = new Map(pmsParsed.people.map((p, i) => [norm(p.name), i]));
    const isLead = (r) => {
      const p = r.pms && !Array.isArray(r.pms) ? r.pms : null;
      const i = r.iris && !Array.isArray(r.iris) ? r.iris : null;
      return /책임자/.test((p && p.role) || "") || /연구책임자/.test((i && i.role) || "");
    };
    for (const r of rows) r.isLead = isLead(r);
    rows.sort((a, b) => {
      if (a.isLead !== b.isLead) return a.isLead ? -1 : 1;
      const d = (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9);
      if (d) return d;
      return (pmsOrder.get(norm(a.name)) ?? 999) - (pmsOrder.get(norm(b.name)) ?? 999);
    });

    const count = (v) => rows.filter((r) => r.verdict === v).length;
    const summary = {
      total: rows.length,
      match: count("match") + count("avg-match"),
      avgMatch: count("avg-match"),
      mismatch: count("mismatch"),
      periodOnly: count("period"),
      review: count("review") + count("duplicate") + count("period") + count("avg-near"),
      oneSide: count("pmsOnly") + count("irisOnly"),
      irisMissing: count("pmsOnly"),
      pmsMissing: count("irisOnly"),
      agreementMismatch: rows.filter((r) => r.agreement && ["mismatch", "review", "period", "avg-near"].includes(r.agreement.verdict)).length,
      warnings: rows.reduce((n, r) => n + r.flags.filter((f) => f.level === "warn").length, 0),
    };

    const pmsLead = pmsParsed.people.find((p) => /책임자/.test(p.role || ""));
    const irisLead = irisParsed.people.find((p) => /연구책임자/.test(p.role || ""));
    return {
      ok: true,
      projectCode: pmsParsed.meta.projectCode,
      leaderName: pmsLead ? pmsLead.name : (irisLead ? irisLead.name : ""),
      hasAgreement: pmsParsed.meta.hasAgreement,
      monthKeys,
      rows,
      summary,
      irisMeta: irisParsed.meta,
    };
  }

  // 짝짓기 추천용: PMS 참여자 이름 중 IRIS(ETRI)에 있는 이름 수
  function nameOverlap(pmsParsed, irisParsed) {
    if (!pmsParsed || !pmsParsed.ok || !irisParsed || !irisParsed.ok) return { common: 0, total: 0, ratio: 0 };
    const irisNames = new Set(irisParsed.people.map((p) => norm(p.name)));
    const pmsNames = [...new Set(pmsParsed.people.map((p) => norm(p.name)))];
    const common = pmsNames.filter((n) => irisNames.has(n)).length;
    return { common, total: pmsNames.length, ratio: pmsNames.length ? common / pmsNames.length : 0 };
  }

  // PMS 파일마다 이름이 가장 많이 겹치는 IRIS 파일을 고른다 (겹침 비율 높은 쌍부터, 한 IRIS는 한 번만).
  // 절반 미만으로 겹치면 짝을 추천하지 않는다 - 엉뚱한 짝이 조용히 대조되는 게 가장 위험하므로.
  function suggestPairs(pmsList, irisList) {
    const cands = [];
    for (const p of pmsList) for (const i of irisList) {
      const ov = nameOverlap(p.parsed, i.parsed);
      if (ov.ratio >= 0.5) cands.push({ pmsId: p.id, irisId: i.id, ratio: ov.ratio, common: ov.common });
    }
    cands.sort((a, b) => b.ratio - a.ratio || b.common - a.common);
    const usedP = new Set(), usedI = new Set(), pairs = {};
    for (const c of cands) {
      if (usedP.has(c.pmsId) || usedI.has(c.irisId)) continue;
      usedP.add(c.pmsId); usedI.add(c.irisId);
      pairs[c.pmsId] = c.irisId;
    }
    return pairs;
  }

  return { run, compareMonths, judge, nameOverlap, suggestPairs };
})();
