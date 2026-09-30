// [표준중분류 미지정 데이터 LLM 분류(C열 채우기)](2026-09-30 사용자 지시):
// "미지정.csv 파일내에 약 1900건의 표준중분류 미지정된 데이터들이 있어..
// A열(시설명)과 B열(주소)을 보고, 우리 DB에 있는 [표준중분류 리스트] 중에서
// 가장 적합한 항목 '하나'를 골라 정확히 매칭해 줘.. 어디에도 적합하지 않은건
// 미지정으로 아무것도 매칭 안해도 돼.. 한번에 20개씩 요청해서.. C열에 작성해줘"
//
// A/B열 내용(시설명/주소)은 그대로 두고(내용 변경 금지), 20건씩 배치로 Gemini에
// 물어 결과를 C열에 채운 새 CSV를 만든다. 이 스크립트는 DB를 갱신하지 않는다 —
// 사용자가 결과 CSV를 검토한 뒤 별도 지시로 실제 이관을 요청하는 것이 이번
// 세션의 기존 관례(어린이과학관/어린이박물관 배치들과 동일하게, CSV 검토 →
// 별도 이관 지시 2단계로 진행).
//
// [실행 방법] node scripts/classify-unassigned-category-min.mjs <입력CSV(UTF-8)> [출력CSV]
import fs from 'fs';
import { pathToFileURL } from 'url';
import { loadEnv } from './lib/load-env.mjs';
import { classifyBatch, sleep, REQUEST_INTERVAL_MS, BATCH_SIZE } from './lib/unassigned-category-classification.mjs';

loadEnv();

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function csvField(value) {
  const text = value ?? '';
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// 원본 CSV를 한 줄씩이 아니라 필드 단위(따옴표 안 줄바꿈 대응)로 안전하게
// 행 분리한다 — 미지정.csv의 일부 주소에 콤마가 포함돼 있어(예: "서울특별시
// 관악구 난우길 51, 2층") 단순 split('\n')만으로는 충분하지만, 혹시 모를
// 필드 내 줄바꿈까지 대비해 따옴표 상태를 추적한다.
function splitCsvRows(raw) {
  const rows = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === '\n' && !inQuotes) {
      rows.push(cur);
      cur = '';
    } else if (ch !== '\r') {
      cur += ch;
    }
  }
  if (cur.trim().length > 0) rows.push(cur);
  return rows;
}

function readInputCsv(path) {
  const raw = fs.readFileSync(path, 'utf-8');
  const lines = splitCsvRows(raw).filter((l) => l.trim().length > 0);
  return lines.slice(1).map((line) => {
    const [name, address] = parseCsvLine(line);
    return { name: name ?? '', address: address ?? '' };
  });
}

function writeOutputCsv(path, rowsWithResults) {
  const csvLines = [
    '명칭,주소,표준중분류(LLM 분류)',
    ...rowsWithResults.map((r) => `${csvField(r.name)},${csvField(r.address)},${csvField(r.categoryMin ?? '')}`),
  ];
  fs.writeFileSync(path, csvLines.join('\n') + '\n', 'utf8');
}

export async function run({ inputPath, outputPath }) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY가 없습니다.');

  const rows = readInputCsv(inputPath);
  console.log(`📋 입력 ${rows.length}건 (배치 크기 ${BATCH_SIZE}건, 총 ${Math.ceil(rows.length / BATCH_SIZE)}회 호출 예정)`);

  const results = new Array(rows.length).fill(null);
  const tally = { matched: 0, unassigned: 0, error: 0 };
  let consecutiveRateLimitFailures = 0;
  const CONSECUTIVE_RATE_LIMIT_ABORT_THRESHOLD = 2;

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const batchNum = start / BATCH_SIZE + 1;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
    try {
      const batchResults = await classifyBatch(batch, GEMINI_API_KEY);
      consecutiveRateLimitFailures = 0;
      for (let i = 0; i < batch.length; i++) {
        results[start + i] = batchResults[i];
        if (batchResults[i]) tally.matched += 1;
        else tally.unassigned += 1;
      }
      console.log(`  [배치 ${batchNum}/${totalBatches}] ${batch.length}건 처리 — 매칭 ${batchResults.filter(Boolean).length}건`);
    } catch (err) {
      tally.error += batch.length;
      console.error(`  ❌ [배치 ${batchNum}/${totalBatches}] 실패: ${err.message} — 이 배치는 미지정으로 유지`);
      if (err.isRateLimit) {
        consecutiveRateLimitFailures += 1;
        if (consecutiveRateLimitFailures >= CONSECUTIVE_RATE_LIMIT_ABORT_THRESHOLD) {
          console.error('🛑 일일 한도로 추정되어 중단합니다 — 지금까지 처리한 결과만 저장합니다.');
          break;
        }
      } else {
        consecutiveRateLimitFailures = 0;
      }
    }
    if (start + BATCH_SIZE < rows.length) await sleep(REQUEST_INTERVAL_MS);
  }

  const rowsWithResults = rows.map((r, i) => ({ ...r, categoryMin: results[i] }));
  writeOutputCsv(outputPath, rowsWithResults);
  console.log(`\n📊 완료 — 매칭 ${tally.matched}건 / 미지정 유지 ${tally.unassigned}건 / 오류(미지정 유지) ${tally.error}건`);
  console.log(`📄 결과 저장: ${outputPath}`);
  return { total: rows.length, ...tally };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputPath = process.argv[2] ?? './미지정_utf8.csv';
  const outputPath = process.argv[3] ?? './미지정_분류결과.csv';
  run({ inputPath, outputPath }).catch((err) => {
    console.error(`❌ 실행 실패: ${err.message}`);
    process.exitCode = 1;
  });
}
