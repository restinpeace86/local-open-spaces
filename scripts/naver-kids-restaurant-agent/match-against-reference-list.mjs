// [참고용 네이버 플레이스 검색 결과 덤프로 매칭](2026-10-16 사용자 지시): "네이버
// 플레이스에서 유아숲체험원으로 검색했을때 나온 리스트들 1페이지부터 5페이지까지
// 넣어놨어.. 상호명을 여기에 맞추어.. 상호명과 주소를 보고 우리쪽에꺼랑 매칭을 해."
// 유아숲체험원은 실시간 검색(search-and-match.mjs)의 매칭률이 낮았다(330건 중 106건,
// 2026-10-16-forest-experience-naver-place-match.md 참고) — 한 산/공원에 여러
// 진입로가 개별 등재된 데이터 특성상, 매번 다른 상호명으로 검색해야 찾을 수 있는
// 경우가 많았다. 사용자가 직접 "유아숲체험원"으로 검색해 1~5페이지(300건, 전체
// 507건 중 일부)를 저장해둔 걸 정적 후보 목록으로 써서, 네트워크 호출/레이트리밋
// 위험 없이 이름+주소 교차검증(기존 address-match.mjs의 pickBestCandidate 그대로
// 재사용, 제5장 제4조)만으로 매칭한다.
//
// [이미 매칭된 행은 건너뜀] search-and-match.mjs가 이미 채운 네이버플레이스ID는
// 덮어쓰지 않는다 — 이번 패스는 그 실행이 놓친(NOT_FOUND) 행만 이 정적 후보
// 목록으로 한 번 더 시도하는 보완 작업이다.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { readCsvUtf8, writeCsvUtf8, mergeHeader } from './lib/csv.mjs';
import { pickBestCandidate } from './lib/address-match.mjs';

const CSV_PATH = path.resolve(process.cwd(), 'metadata', '유아숲체험원.csv');
const REFERENCE_DIR = path.resolve(process.cwd(), 'reference', 'naverplace');
const REQUIRED_COLUMNS = ['명칭', '주소', '위도', '경도', '네이버플레이스ID', '네이버플레이스URL', '네이버상호명'];
const NOT_FOUND_MARKER = 'NOT_FOUND';

function buildPlaceUrl(id) {
  return `https://map.naver.com/p/entry/place/${id}`;
}

// 파일명 패턴 "<검색어>_page<N>.json"의 페이지들을 전부 읽어 하나의 후보 배열로
// 합친다(id 기준 중복 제거 — 같은 업체가 검색어 조합에 따라 여러 페이지에 겹쳐
// 나올 수 있음).
export function loadReferenceCandidates(referenceDir, keyword) {
  const files = fs
    .readdirSync(referenceDir)
    .filter((f) => f.startsWith(`${keyword}_page`) && f.endsWith('.json'));

  const byId = new Map();
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(referenceDir, file), 'utf-8'));
    const items = raw?.[0]?.data?.placeList?.businesses?.items ?? [];
    for (const item of items) {
      if (!item?.id || !item?.name) continue;
      byId.set(item.id, {
        id: String(item.id),
        name: item.name,
        roadAddress: item.roadAddress ?? null,
        address: item.address ?? null,
        fullAddress: item.fullAddress ?? null,
        lng: item.x ? Number(item.x) : null,
        lat: item.y ? Number(item.y) : null,
      });
    }
  }
  return [...byId.values()];
}

export async function run({
  csvPath = CSV_PATH,
  referenceDir = REFERENCE_DIR,
  keyword = '유아숲체험원',
} = {}) {
  const candidates = loadReferenceCandidates(referenceDir, keyword);
  const rows = readCsvUtf8(csvPath);
  const header = mergeHeader(rows, REQUIRED_COLUMNS);

  const stats = { candidateCount: candidates.length, matched: 0, stillNotFound: 0, skipped: 0 };

  for (const row of rows) {
    const hasValidId = row.네이버플레이스ID && /^\d+$/.test(row.네이버플레이스ID.trim());
    if (hasValidId) {
      stats.skipped += 1;
      continue;
    }

    const target = { name: row.명칭, address: row.주소 };
    const best = pickBestCandidate(target, candidates);
    if (best) {
      row.네이버플레이스ID = best.candidate.id;
      row.네이버플레이스URL = buildPlaceUrl(best.candidate.id);
      row.네이버상호명 = best.candidate.name;
      stats.matched += 1;
    } else {
      row.네이버플레이스ID = NOT_FOUND_MARKER;
      row.네이버플레이스URL = '';
      stats.stillNotFound += 1;
    }
  }

  writeCsvUtf8(csvPath, header, rows);
  return { ...stats, total: rows.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const csvPathArg = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : CSV_PATH;
  run({ csvPath: csvPathArg })
    .then((stats) => {
      console.log(`✅ 참고 목록 매칭 완료(${csvPathArg}):`, stats);
    })
    .catch((err) => {
      console.error('❌ 참고 목록 매칭 실패:', err.message);
      process.exit(1);
    });
}
