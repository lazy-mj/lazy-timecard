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
  function judge(baseMonths, irisPerson, keys, basePeriods, opts = {}) {
    const out = opts.avgOnly ? judgeAvgOnly(baseMonths, irisPerson, keys) : judgeRates(baseMonths, irisPerson, keys, opts.ext || "IRIS");
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

  // RCMS 처럼 외부시스템에 연평균 참여율만 있을 때: 달마다 값은 비교하지 않고
  //  (1) 참여한 달이 서로 같은지  (2) PMS 참여기간 평균 = 외부 계상률 인지로 판정한다.
  function judgeAvgOnly(baseMonths, ext, keys) {
    const baseAvg = P.averageRate(baseMonths);
    const extRate = ext.periods.length ? ext.periods[0].rate : 0;
    const avgEqual = Math.abs(baseAvg.avg - extRate) < EPS;
    const avgNear = !avgEqual && Math.abs(baseAvg.avg - extRate) < 1 && Math.round(baseAvg.avg) === Math.round(extRate);
    const cells = {};
    let mismatch = 0, partial = 0, compared = 0;
    for (const k of keys) {
      const a = baseMonths[k], b = ext.months[k];
      const aOn = a && a.rate > 0, bOn = b && b.rate > 0;
      if (!aOn && !bOn) { cells[k] = { status: "none", base: a || null, iris: b || null }; continue; }
      compared++;
      const isPartial = !!((a && a.partial) || (b && b.partial));
      if (isPartial) partial++;
      let status = "match";
      if (aOn !== bOn || (!avgEqual && !avgNear)) status = "mismatch";
      else if (avgNear) status = "review";
      if (status === "mismatch") mismatch++;
      cells[k] = { status, partial: isPartial, base: a || null, iris: b || null };
    }
    const onlyOneSide = keys.some((k) => !!(baseMonths[k] && baseMonths[k].rate > 0) !== !!(ext.months[k] && ext.months[k].rate > 0));
    const out = {
      cells, mismatch, review: avgNear ? compared : 0, partial, compared,
      baseAvg: round2(baseAvg.avg), baseMonthsCount: baseAvg.count,
      irisAvg: round2(extRate), irisMonthsCount: Object.keys(ext.months).length,
      verdict: "match", avgNote: "",
    };
    if (!Object.keys(baseMonths).length) { out.verdict = "nodata"; return out; }
    if (onlyOneSide || (!avgEqual && !avgNear)) out.verdict = "mismatch";
    else if (avgNear) {
      out.verdict = "avg-near";
      out.avgNote = `RCMS 계상률 ${extRate}% ≈ PMS 평균 ${round2(baseAvg.avg)}% (${baseAvg.count}개월) — 반올림 차이인지 확인해주세요`;
    }
    return out;
  }

  function judgeRates(baseMonths, irisPerson, keys, extLabel = "IRIS") {
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
        out.avgNote = `${extLabel}에 연평균(${irisRate}%)으로 입력됨 · PMS 평균 ${round2(baseAvg.avg)}% (${baseAvg.count}개월)`;
        return out;
      }
      // IRIS 연평균이 PMS 평균을 반올림한 값처럼 보이면(예: 42.5 → 43) 불일치 대신 확인 필요
      if (sameRange && Math.abs(baseAvg.avg - irisRate) < 1 && Math.round(baseAvg.avg) === Math.round(irisRate)) {
        out.verdict = "avg-near";
        out.avgNote = `${extLabel} 연평균 ${irisRate}% ≈ PMS 평균 ${round2(baseAvg.avg)}% (${baseAvg.count}개월) — 반올림 차이인지 확인해주세요`;
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

  // 같은 이름이 PMS에 여러 줄인데 참여한 달이 서로 안 겹치면 같은 사람(동·하계 연수생 재참여 등)으로 합친다.
  // 연수생은 참여할 때마다 개인번호가 새로 나와서 개인번호로는 알 수 없다. 달이 겹치면 진짜 동명이인으로 남긴다.
  function combineReentries(people) {
    const byName = groupByName(people);
    const out = [];
    for (const list of byName.values()) {
      if (list.length < 2) { out.push(list[0]); continue; }
      const seen = new Set();
      let overlap = false;
      for (const p of list) {
        for (const [k, v] of Object.entries(p.monthly)) {
          if (!v.rate) continue;
          if (seen.has(k)) overlap = true;
          seen.add(k);
        }
      }
      if (overlap) { out.push(...list); continue; }
      const values = {};
      for (const p of list) for (const [k, v] of Object.entries(p.monthly)) if (v.rate) values[k] = v.rate;
      const periods = list.flatMap((p) => p.exec.periods);
      const base = list[0];
      out.push({
        ...base,
        empNo: list.map((p) => p.empNo).filter(Boolean).join(", "),
        dept: [...new Set(list.map((p) => p.dept).filter(Boolean))].join(" / "),
        monthly: P.monthlyValuesToMonths(values),
        exec: { text: list.map((p) => p.exec.text).filter(Boolean).join(" / "), total: null, periods, months: P.expandToMonths(periods) },
        agreement: list.find((p) => p.agreement.periods.length) ? list.find((p) => p.agreement.periods.length).agreement : base.agreement,
        parts: list.flatMap((p) => p.parts || []),
        reentry: `PMS에 ${list.length}줄로 나뉘어 있어 합쳤어요 (개인번호 ${list.map((p) => p.empNo || "-").join(" · ")}, 참여한 달이 겹치지 않음)`,
      });
    }
    return out;
  }

  // 한쪽에만 있는 이름끼리, 한 이름이 다른 이름에 포함되면(PMS 마이클 ⊂ IRIS 존마이클스미스) 같은 사람으로 본다.
  // 후보가 정확히 하나일 때만. IRIS 쪽 키를 PMS 이름으로 옮기고 안내 문구를 돌려준다.
  function linkContainedNames(pmsByName, irisByName) {
    const notes = new Map();
    const pOnly = [...pmsByName.keys()].filter((k) => !irisByName.has(k) && pmsByName.get(k).length === 1);
    const iOnly = [...irisByName.keys()].filter((k) => !pmsByName.has(k) && irisByName.get(k).length === 1);
    const contains = (a, b) => a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
    for (const pk of pOnly) {
      const cands = iOnly.filter((ik) => contains(pk, ik));
      if (cands.length !== 1) continue;
      const ik = cands[0];
      if (pOnly.filter((x) => contains(x, ik)).length !== 1) continue;
      irisByName.set(pk, irisByName.get(ik));
      irisByName.delete(ik);
      notes.set(pk, `이름이 달라요 — PMS '${pmsByName.get(pk)[0].name}' / 외부 '${irisByName.get(pk)[0].name}'. 같은 사람으로 보고 대조했어요`);
    }
    return notes;
  }

  function run(pmsParsed, irisParsed) {
    if (!pmsParsed.ok) return { ok: false, error: "PMS: " + pmsParsed.error };
    const EXT = (irisParsed.meta && irisParsed.meta.system) || "IRIS";
    const avgOnly = !!(irisParsed.meta && irisParsed.meta.avgOnly);
    if (!irisParsed.ok) return { ok: false, error: EXT + ": " + irisParsed.error };
    if (!irisParsed.people.length) {
      return { ok: false, error: "IRIS 파일에 한국전자통신연구원(ETRI) 연구자가 없어요. 다른 과제 파일인지 확인해주세요." };
    }

    const pmsPeople = combineReentries(pmsParsed.people);
    const pmsByName = groupByName(pmsPeople);
    const irisByName = groupByName(irisParsed.people);
    const aliasNotes = linkContainedNames(pmsByName, irisByName);
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
          pms: ps, iris: is, flags: [{ level: "warn", text: `동명이인 확인 필요 (PMS ${ps.length}명 · ${EXT} ${is.length}명) — 자동 대조하지 않았어요` }],
          verdict: "duplicate",
        });
        continue;
      }

      const pms = ps[0] || null;
      const iris = is[0] || null;
      const flags = [];
      if (pms && pms.reentry) flags.push({ level: "info", text: pms.reentry });
      if (aliasNotes.has(key)) flags.push({ level: "warn", text: aliasNotes.get(key) });
      // 학생 구분 확인: PMS 직급이 학생연구원(위촉연구원·UST학생연구원·학연학생)인지와 IRIS 참여구분 '학생'이 서로 맞는지.
      // 동·하계 연구연수생은 학생연구원이 아니다.
      if (iris && pms && !avgOnly) { // RCMS 화면엔 참여구분(학생)이 없어서 건너뜀
        const irisStudent = norm(iris.kind) === "학생";
        const pmsStudent = STUDENT_RANK.test(norm(pms.rank));
        if (irisStudent && !pmsStudent) {
          flags.push({ level: "warn", text: `IRIS 참여구분이 '학생'인데 PMS 직급은 '${pms.rank || "-"}'이에요 — 학생연구원(위촉연구원·UST학생연구원·학연학생)이 아니면 IRIS 구분을 확인해주세요` });
        } else if (pmsStudent && !irisStudent) {
          flags.push({ level: "warn", text: `PMS 직급은 학생연구원(${pms.rank})인데 IRIS 참여구분은 '${iris.kind || "-"}'이에요 — 확인해주세요` });
        }
      }
      if (iris && iris.status && norm(iris.status) !== "수행중") {
        flags.push({ level: pms ? "warn" : "info", text: `${EXT} 수행구분이 '${iris.status}'이에요${pms ? " — PMS에는 참여 중으로 있어요" : ""}` });
      }

      if (pms && !iris) {
        if (elsewhere.length) flags.push({ level: "info", text: `${EXT} 다른 기관(${elsewhere.join(", ")})에 같은 이름이 있어요` });
        rows.push({ kind: "pmsOnly", name: pms.name, pms, iris: null, flags, verdict: "pmsOnly" });
        continue;
      }
      if (!pms && iris) {
        rows.push({ kind: "irisOnly", name: iris.name, pms: null, iris, flags, verdict: "irisOnly" });
        continue;
      }

      if (iris.periods.length && iris.periods.every((p) => !p.rate)) {
        flags.push({ level: "warn", text: `${EXT} 계상비율${avgOnly ? "" : "(현금)"}이 0%로 입력돼 있어요` });
      }
      const jopts = { avgOnly, ext: EXT };
      const monthly = judge(pms.monthly, iris, monthKeys, pms.exec.periods, jopts);
      const agreement = pmsParsed.meta.hasAgreement ? judge(pms.agreement.months, iris, monthKeys, pms.agreement.periods, jopts) : null;
      if (monthly.periodDiff) flags.push({ level: "warn", text: `참여기간이 달라요 (중도입사·퇴사 등) — PMS ${monthly.periodDiff.pms} / ${EXT} ${monthly.periodDiff.iris}` });
      if (monthly.partial) flags.push({ level: "info", text: `한 달을 다 채우지 않은 참여월이 ${monthly.partial}개 있어요 (◐ 표시)` });
      if (monthly.review) flags.push({ level: "warn", text: `한 달 안에 참여율이 둘 이상인 달이 ${monthly.review}개 있어요 — 직접 확인해주세요` });

      rows.push({ kind: "matched", name: pms.name, pms, iris, monthly, agreement, flags, verdict: monthly.verdict });
    }

    // 정렬: 과제 책임자 맨 위 → 문제 있는 사람 → 일치, 같은 판정끼리는 PMS 순서
    const rank = { mismatch: 0, duplicate: 1, period: 2, "avg-near": 2, review: 3, pmsOnly: 4, irisOnly: 5, "avg-match": 6, match: 7, nodata: 8 };
    const pmsOrder = new Map(pmsPeople.map((p, i) => [norm(p.name), i]));
    // 과제 책임자: PMS에 '사업책임자'가 있으면 그 사람만(실행계정별 '과제책임자'는 계정 책임자로 태그만).
    // 없으면 PMS '책임자', 그것도 없으면 IRIS '연구책임자'.
    const hasBizLead = pmsPeople.some((p) => /사업책임자/.test(p.role || ""));
    const leadRe = hasBizLead ? /사업책임자/ : /책임자/;
    const hasPmsLead = pmsPeople.some((p) => leadRe.test(p.role || ""));
    const isLead = (r) => {
      const p = r.pms && !Array.isArray(r.pms) ? r.pms : null;
      const i = r.iris && !Array.isArray(r.iris) ? r.iris : null;
      if (hasPmsLead) return !!p && leadRe.test(p.role || "");
      return !!i && /연구책임자/.test(i.role || "");
    };
    const isSubLead = (r) => {
      const p = r.pms && !Array.isArray(r.pms) ? r.pms : null;
      return !!p && /책임자/.test(p.role || "") && !leadRe.test(p.role || "");
    };
    for (const r of rows) { r.isLead = isLead(r); r.isSubLead = isSubLead(r); }
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

    const pmsLead = pmsPeople.find((p) => leadRe.test(p.role || ""));
    const irisLead = irisParsed.people.find((p) => /연구책임자/.test(p.role || ""));
    return {
      ok: true,
      projectCode: pmsParsed.meta.projectCode,
      ext: EXT,
      avgOnly,
      projectCodes: pmsParsed.meta.projectCodes || [pmsParsed.meta.projectCode],
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
    // 1차: 1:1 로 가장 잘 맞는 쌍부터
    for (const c of cands) {
      if (usedP.has(c.pmsId) || usedI.has(c.irisId)) continue;
      usedP.add(c.pmsId); usedI.add(c.irisId);
      pairs[c.pmsId] = c.irisId;
    }
    // 2차: 남은 PMS(한 과제를 실행계정 여러 개로 쪼갠 경우)를 같은 IRIS에 같이 붙인다 → 합산 대조.
    //      실행계정은 과제번호 끝 두 자리만 다르다(26XX0010 / 26XX0020). 이미 그 IRIS에 붙은 PMS와 앞부분이 같으면 같은 과제로 본다.
    //      과제번호로 알 수 없을 땐, 다른 과제가 같은 연구실 사람을 공유할 수 있으니 PMS 참여자의 80% 이상이 그 IRIS에 있을 때만.
    const codeOf = (id) => {
      const p = pmsList.find((x) => x.id === id);
      return (p && p.parsed && p.parsed.ok && p.parsed.meta.projectCode) || "";
    };
    const familyOf = (code) => (code.length > 2 ? code.slice(0, -2) : "");
    for (const c of cands) {
      if (usedP.has(c.pmsId)) continue;
      const fam = familyOf(codeOf(c.pmsId));
      const sameFamily = fam && Object.entries(pairs).some(([pid, iid]) => iid === c.irisId && familyOf(codeOf(isNaN(pid) ? pid : Number(pid))) === fam);
      if (!sameFamily && c.ratio < 0.8) continue;
      usedP.add(c.pmsId);
      pairs[c.pmsId] = c.irisId;
    }
    return pairs;
  }


  // 한 IRIS 과제를 PMS 실행계정 여러 개로 나눈 경우: PMS 파일들을 하나로 합친다.
  //  - 같은 이름은 한 사람으로 보고 달마다 참여율을 더한다 (계정별 내역은 parts 에 남김)
  //  - 실행과제 기간 문구는 계정별 기간을 모두 모은다 (참여기간 = 가장 이른 시작 ~ 가장 늦은 끝)
  //  - 협약사업 칸은 계정마다 같은 협약 정보가 반복된다고 보고 더하지 않고 처음 것을 쓴다
  //  - 한 파일 안에 같은 이름이 2명 이상이면 합치지 않고 그대로 둔다 → 동명이인으로 확인 필요
  // 실행계정 여러 개 과제의 짧은 이름: 끝 두 자리만 다르면 "26ZZ00xx · 실행계정 5개", 아니면 "26ZZ0010 외 4개"
  function shortCodeLabel(codes) {
    if (codes.length < 2) return codes[0] || "";
    const fams = [...new Set(codes.map((c) => (c.length > 2 ? c.slice(0, -2) : c)))];
    return fams.length === 1 ? `${fams[0]}xx · 실행계정 ${codes.length}개` : `${codes[0]} 외 ${codes.length - 1}개`;
  }

  function mergePms(parsedList) {
    const oks = parsedList.filter((p) => p && p.ok);
    if (oks.length === 1) return oks[0];
    if (!oks.length) return parsedList[0];
    const codes = oks.map((p) => p.meta.projectCode || "?");
    const monthKeys = [...new Set(oks.flatMap((p) => p.meta.monthKeys))].sort();
    const merged = new Map();   // name -> merged person (넣은 순서 = PMS 파일 순서 유지)
    let looseSeq = 0;
    oks.forEach((parsed, idx) => {
      const code = codes[idx];
      const counts = {};
      parsed.people.forEach((p) => { counts[norm(p.name)] = (counts[norm(p.name)] || 0) + 1; });
      for (const p of parsed.people) {
        // 한 파일 안에 같은 이름이 2줄 이상이면 여기선 합치지 않고 따로 둔다 (자리·계정 정보는 그대로).
        // 재입사 두 줄인지, 진짜 동명이인인지는 run() 의 combineReentries 가 참여한 달로 판단한다.
        const key = counts[norm(p.name)] > 1 ? `${norm(p.name)}#${looseSeq++}` : norm(p.name);
        if (!merged.has(key)) {
          merged.set(key, {
            ...p,
            monthlyValues: {},
            parts: [],
            exec: { text: "", total: 0, periods: [], months: {} },
            agreement: p.agreement,
          });
        }
        const m = merged.get(key);
        if (/책임자/.test(p.role || "")) m.role = p.role;
        if (!m.agreement.periods.length && p.agreement.periods.length) m.agreement = p.agreement;
        for (const [k, v] of Object.entries(p.monthly)) {
          m.monthlyValues[k] = (m.monthlyValues[k] || 0) + (v.rate || 0);
        }
        m.parts.push({ code, monthly: p.monthly });
        m.exec.periods.push(...p.exec.periods);
        m.exec.text = [m.exec.text, p.exec.text && `[${code}] ${p.exec.text}`].filter(Boolean).join(" / ");
        m.exec.total += p.exec.total || 0;
      }
    });
    const people = [...merged.values()].map((m) => {
      const monthly = P.monthlyValuesToMonths(m.monthlyValues);
      // 칸마다 계정별 내역 (툴팁용)
      for (const k of Object.keys(monthly)) {
        monthly[k].parts = m.parts.map((pt) => ({ code: pt.code, rate: pt.monthly[k] ? pt.monthly[k].rate : 0 }));
      }
      const exec = { ...m.exec, months: P.expandToMonths(m.exec.periods) };
      delete m.monthlyValues;
      return { ...m, monthly, exec };
    });
    return {
      ok: true,
      meta: {
        projectCode: shortCodeLabel(codes),
        projectCodes: codes,
        monthKeys,
        hasAgreement: oks.some((p) => p.meta.hasAgreement),
      },
      people,
    };
  }

  const isStudentRank = (rank) => STUDENT_RANK.test(norm(rank));
  return { run, compareMonths, judge, nameOverlap, suggestPairs, mergePms, isStudentRank };
})();
