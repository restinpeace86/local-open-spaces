import fs from 'fs';
import { parse } from 'csv-parse/sync';

// 이 에이전트가 직접 만들고 다시 읽는 CSV는 euc-kr 정부 데이터와 달리 우리가 생성하므로
// UTF-8 고정이다(BOM 없이 — 이 프로젝트에 이미 csv-parse 의존성이 있어 재사용, 제5장
// 제4조 기존 구조 우선).
export function readCsvUtf8(path) {
  if (!fs.existsSync(path)) return [];
  const text = fs.readFileSync(path, 'utf-8');
  if (!text.trim()) return [];
  return parse(text, { columns: true, skip_empty_lines: true });
}

// RFC4180 최소 구현 — 값에 쉼표/줄바꿈/겹따옴표가 있으면 겹따옴표로 감싸고 내부
// 겹따옴표는 두 번 반복한다. 네이버 주소(예: "OO로 12, 2층")처럼 쉼표가 실제 들어있을
// 수 있어 단순 join(',')은 안전하지 않다.
function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// [파이프라인 여러 단계가 같은 CSV를 순서대로 채워나가는 구조] 각 단계가 자기
// 컬럼만 아는 고정 HEADER로 writeCsvUtf8을 호출하면, 이미 다른 단계가 추가해 둔
// 컬럼(예: scrape-kids-attributes.mjs가 채운 아기의자 등)이 CSV에 남아있는 행을
// search-and-match.mjs가 다시 저장할 때 그 컬럼들이 통째로 사라진다(write가 header에
// 없는 키를 그냥 버림) — 실제 데이터 손실 버그다. 기존 행에 이미 있던 컬럼(파일을
// 읽었을 때의 순서) + 이번 단계가 요구하는 컬럼을 합쳐서 최종 헤더를 만든다.
export function mergeHeader(existingRows, requiredColumns) {
  const existingColumns = existingRows.length > 0 ? Object.keys(existingRows[0]) : [];
  const merged = [...existingColumns];
  for (const col of requiredColumns) {
    if (!merged.includes(col)) merged.push(col);
  }
  return merged;
}

export function writeCsvUtf8(path, header, rows) {
  const lines = [header.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(header.map((col) => escapeCsvField(row[col])).join(','));
  }
  fs.writeFileSync(path, lines.join('\r\n') + '\r\n', 'utf-8');
}
