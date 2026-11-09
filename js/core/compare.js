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

  // 기준 하나(월별 또는 협약)에 대한 판정
  function judge(baseMonths, irisPerson, keys) {
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
      out.avgNote = sameRange
        ? `IRIS 단일기간 ${irisRate}% ≠ PMS 평균 ${round2(baseAvg.avg)}%`
        : `참여기간이 달라요 (PMS ${fmtRange(ra)} / IRIS ${fmtRange(rb)})`;
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
      if (pms) for (const issue of pms.internalIssues) flags.push({ level: "warn", text: "PMS 내부 불일치 · " + issue.message, months: issue.months });
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

      const monthly = judge(pms.monthly, iris, monthKeys);
      const agreement = pmsParsed.meta.hasAgreement ? judge(pms.agreement.months, iris, monthKeys) : null;
      if (monthly.partial) flags.push({ level: "info", text: `한 달을 다 채우지 않은 참여월이 ${monthly.partial}개 있어요 (◐ 표시)` });
      if (monthly.review) flags.push({ level: "warn", text: `한 달 안에 참여율이 둘 이상인 달이 ${monthly.review}개 있어요 — 직접 확인해주세요` });

      rows.push({ kind: "matched", name: pms.name, pms, iris, monthly, agreement, flags, verdict: monthly.verdict });
    }

    // 정렬: 문제 있는 사람 먼저, 그다음 PMS 순서
    const rank = { mismatch: 0, duplicate: 1, review: 2, pmsOnly: 3, irisOnly: 4, "avg-match": 5, match: 6, nodata: 7 };
    const pmsOrder = new Map(pmsParsed.people.map((p, i) => [norm(p.name), i]));
    rows.sort((a, b) => {
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
      review: count("review") + count("duplicate"),
      oneSide: count("pmsOnly") + count("irisOnly"),
      agreementMismatch: rows.filter((r) => r.agreement && (r.agreement.verdict === "mismatch" || r.agreement.verdict === "review")).length,
      warnings: rows.reduce((n, r) => n + r.flags.filter((f) => f.level === "warn").length, 0),
    };

    return {
      ok: true,
      projectCode: pmsParsed.meta.projectCode,
      hasAgreement: pmsParsed.meta.hasAgreement,
      monthKeys,
      rows,
      summary,
      irisMeta: irisParsed.meta,
    };
  }

  return { run, compareMonths, judge };
})();
