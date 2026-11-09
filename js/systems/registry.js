// ============================================================
// systems/registry.js
// 참여인력 엑셀 시스템 어댑터 레지스트리 (lazy-jeongsan 과 같은 구조).
//
// 어댑터 형태: { key, label, isExternal, detect(grid), parse(grid) }
//  - parse(grid) -> { ok, error?, meta, people: [...] }
// 새 외부시스템(이지바로 등)은 systems/xxx.js 하나 추가 + index.html 에 script 한 줄이면 된다.
// ============================================================

window.SystemRegistry = (() => {
  const adapters = {};
  const order = [];

  function register(key, adapter) {
    adapters[key] = { key, ...adapter };
    order.push(key);
  }

  function get(key) { return adapters[key]; }

  function detectType(grid) {
    for (const key of order) {
      if (adapters[key].detect(grid)) return key;
    }
    return "UNKNOWN";
  }

  function isExternal(key) {
    return !!adapters[key] && adapters[key].isExternal === true;
  }

  return { register, get, detectType, isExternal };
})();
