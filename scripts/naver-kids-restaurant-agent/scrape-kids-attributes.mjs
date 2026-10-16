// [네이버 플레이스 키즈친화 스크래핑 에이전트 3단계](todo.md 개선사항4, 4~6단계):
// 네이버플레이스ID가 확정된 식당마다 정보 탭(편의시설)과 "아이와 가기 좋아요" 태그
// 리뷰를 수집해 LLM으로 키즈친화 속성(아기의자/유아식기/키즈메뉴)을 추출하고
// 식당.csv에 반영한다.
//
// [재시작 가능 설계] search-and-match.mjs와 동일한 이유로, 이미 분석된 행(아기의자
// 컬럼에 값이 있는 행)은 건너뛰고 일정 건수마다 중간 저장한다. NOT_FOUND(매칭
// 실패)/빈 값(아직 매칭 안 됨) 행은 분석 대상에서 자동으로 빠진다(유효한 숫자
// ID가 있는 행만 대상).
import path from 'path';
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { readCsvUtf8, writeCsvUtf8, mergeHeader } from './lib/csv.mjs';
import { fetchPlaceConveniences } from './lib/naver-place-detail.mjs';
import { fetchKidGoodReviewBodies } from './lib/naver-reviews.mjs';
import { extractKidsFriendlyAttributes } from './lib/kids-friendly-extraction.mjs';

loadEnv();

const CSV_PATH = path.resolve(process.cwd(), 'metadata', '식당.csv');
const REQUIRED_COLUMNS = [
  '명칭',
  '주소',
  '위도',
  '경도',
  '네이버플레이스ID',
  '네이버플레이스URL',
  '아기의자',
  '아기의자_근거',
  '유아식기',
  '유아식기_근거',
  '키즈메뉴',
  '키즈메뉴_근거',
];
const REQUEST_DELAY_MS = 500;
const SAVE_EVERY = 20;
const PRESENT = '있음';
const ABSENT = '없음';
const UNKNOWN = '분석실패';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasValidPlaceId(row) {
  return Boolean(row.네이버플레이스ID && /^\d+$/.test(row.네이버플레이스ID.trim()));
}

function alreadyAnalyzed(row) {
  return Boolean(row.아기의자 && row.아기의자.trim());
}

function applyAttributesToRow(row, attributes) {
  row.아기의자 = attributes.kidsChair.present ? PRESENT : ABSENT;
  row.아기의자_근거 = attributes.kidsChair.evidence ?? '';
  row.유아식기 = attributes.kidsTableware.present ? PRESENT : ABSENT;
  row.유아식기_근거 = attributes.kidsTableware.evidence ?? '';
  row.키즈메뉴 = attributes.kidsMenu.present ? PRESENT : ABSENT;
  row.키즈메뉴_근거 = attributes.kidsMenu.evidence ?? '';
}

async function analyzeOneRestaurant(row, { apiKey, delayMs }) {
  const placeId = row.네이버플레이스ID.trim();

  const { conveniences, status: homeStatus } = await fetchPlaceConveniences(placeId);
  if (homeStatus === 429) return { outcome: 'RATE_LIMITED' };

  await sleep(delayMs);

  const { bodies, status: reviewStatus } = await fetchKidGoodReviewBodies(placeId);
  if (reviewStatus === 429) return { outcome: 'RATE_LIMITED' };

  const attributes = await extractKidsFriendlyAttributes({
    name: row.명칭,
    conveniences,
    kidGoodReviewBodies: bodies,
    apiKey,
  });
  if (!attributes) return { outcome: 'LLM_FAILED' };

  return { outcome: 'ANALYZED', attributes };
}

export async function run({
  csvPath = CSV_PATH,
  limit = Infinity,
  apiKey = process.env.GEMINI_API_KEY,
  delayMs = REQUEST_DELAY_MS,
} = {}) {
  const rows = readCsvUtf8(csvPath);
  const header = mergeHeader(rows, REQUIRED_COLUMNS);
  const stats = { analyzed: 0, skipped: 0, noPlaceId: 0, rateLimited: 0, llmFailed: 0 };
  let processed = 0;

  for (const row of rows) {
    if (!hasValidPlaceId(row)) {
      stats.noPlaceId += 1;
      continue;
    }
    if (alreadyAnalyzed(row)) {
      stats.skipped += 1;
      continue;
    }
    if (processed >= limit) break;

    const result = await analyzeOneRestaurant(row, { apiKey, delayMs });
    if (result.outcome === 'ANALYZED') {
      applyAttributesToRow(row, result.attributes);
      stats.analyzed += 1;
    } else if (result.outcome === 'RATE_LIMITED') {
      stats.rateLimited += 1;
    } else {
      row.아기의자 = UNKNOWN;
      row.아기의자_근거 = '';
      row.유아식기 = UNKNOWN;
      row.유아식기_근거 = '';
      row.키즈메뉴 = UNKNOWN;
      row.키즈메뉴_근거 = '';
      stats.llmFailed += 1;
    }

    processed += 1;
    if (processed % SAVE_EVERY === 0) {
      writeCsvUtf8(csvPath, header, rows);
    }
    await sleep(delayMs);
  }

  writeCsvUtf8(csvPath, header, rows);
  return { ...stats, processed, total: rows.length };
}

// [비주기적 수동 실행](search-and-match.mjs와 동일한 2026-10-15 사용자 지시
// — 인자 없는 CSV 경로는 기존 metadata/식당.csv로 하위 호환 유지).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const csvPathArg = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : CSV_PATH;
  const limitArg = process.argv[3] ? Number(process.argv[3]) : Infinity;
  const delayMsArg = process.argv[4] ? Number(process.argv[4]) : REQUEST_DELAY_MS;
  run({ csvPath: csvPathArg, limit: limitArg, delayMs: delayMsArg })
    .then((stats) => {
      console.log(`✅ 키즈친화 속성 분석 완료(${csvPathArg}):`, stats);
    })
    .catch((err) => {
      console.error('❌ 키즈친화 속성 분석 실패:', err.message);
      process.exit(1);
    });
}
