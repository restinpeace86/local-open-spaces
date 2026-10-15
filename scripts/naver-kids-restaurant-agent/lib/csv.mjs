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

export function writeCsvUtf8(path, header, rows) {
  const lines = [header.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(header.map((col) => escapeCsvField(row[col])).join(','));
  }
  fs.writeFileSync(path, lines.join('\r\n') + '\r\n', 'utf-8');
}
