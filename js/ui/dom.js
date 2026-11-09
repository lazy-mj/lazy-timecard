// ============================================================
// ui/dom.js
// DOM 조회 헬퍼. 원래 코드의 `const $ = (sel) => document.querySelector(sel)`를
// 그대로 사용하되, 별도 파일로 분리해 어디서 정의됐는지 명확히 한다.
// ============================================================

window.$ = (sel) => document.querySelector(sel);

// 파일명, 비목명 등 "사용자/파일에서 온 문자열"을 innerHTML에 넣기 전 반드시 거치는 이스케이프.
// 예: 파일명이 <img src=x onerror=...> 형태여도 화면엔 문자 그대로만 보이게 만든다.
window.escapeHtml = (str) => {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};
