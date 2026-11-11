# tesseract (RCMS 캡처 글자 인식용, 브라우저 안에서만 동작)

- `tesseract.min.js`, `worker.min.js` — tesseract.js 5.1.1 (Apache-2.0, LICENSE-tesseract.js.md)
- `core/` — tesseract.js-core 5.1.1 LSTM WebAssembly (SIMD / 비SIMD) (Apache-2.0, core/LICENSE)
- `lang/kor.traineddata.gz` — @tesseract.js-data/kor 1.0.0 (패키지 MIT, 원본 Tesseract tessdata 4.0.0_best_int Apache-2.0)

캡처를 처음 올릴 때만 불러오며, 외부 서버로 아무것도 보내지 않습니다.
