// xlsx-js-style(셀 서식 지원 SheetJS 포크)를 XLSXStyle 로 따로 보관한다.
// 바로 다음에 로드되는 xlsx.full.min.js 가 전역 XLSX 를 덮어쓰므로,
// 파일 읽기는 최신 SheetJS(XLSX), 서식 있는 엑셀 쓰기는 XLSXStyle 로 나눠 쓴다.
window.XLSXStyle = window.XLSX;
