// [open_spaces 중복 데이터 정제](2026-08-28): 사용자 제보 — "위경도가 완전히 동일하거나
// 이름/주소가 겹쳐서 중복으로 쌓여 있는 데이터가 있다". 실측 확인 결과 두 가지 서로 다른
// 현상이 섞여 있었다:
//
// 1) 진짜 중복(교차 출처): 서로 다른 공공데이터 API(source_type)가 같은 실제 장소를 각자
//    카탈로그에 등재해 우리 파이프라인이 둘 다 수집한 경우(예: "선화랑"이 KOR_TOUR_API_V4와
//    seoul_public_culture 양쪽에 존재, 좌표/이름 완전 동일). 828개 그룹, 1,685건 실측 확인.
// 2) 가짜 양성(단일 출처 반복): 같은 source_type 안에서 좌표+이름이 같아도 실제로는 서로 다른
//    진짜 시설인 경우 — 실측으로 발견한 반례: LOCALDATA_PLAYGROUND(전국어린이놀이시설정보)는
//    pfctSn(시설일련번호)이 전국 단위로 유일함이 어댑터 자체에 문서화돼 있어(playground-adapter.mjs
//    상단 주석) 같은 아파트 단지 내 여러 동에 각각 설치된 서로 다른 놀이터가 정부 등록부상
//    복수의 pfctSn으로 등록되지만 좌표/이름은 단지 대표값 하나로 동일하게 잡힌다 — 이걸
//    중복으로 지우면 실제 콘텐츠(서로 다른 놀이터)를 파괴한다. seoul_public_reservation도
//    동일 서비스명이 SVCID만 다르게 반복되는 사례를 발견했으나(예: "삼청테니스장 코트이용
//    (야간)" 9건) 이 근거만으로 안전하다고 확정할 수 없어(추측 금지) 단일 출처 반복은
//    이번 정제 대상에서 전부 제외한다.
//
// 따라서 "명백한 중복"의 정의를 "서로 다른 2개 이상의 source_type이 동일 좌표+이름 또는
// 동일 이름+주소로 겹치는 경우"로 엄격히 한정한다. 이 기준은 사용자 요구사항("오직 명백하게
// 겹치는 중복 데이터만") 및 제3장 제5조(추측 금지)를 함께 만족한다.
import fs from 'fs';
import path from 'path';
import { createAdminClient } from './supabase-admin.mjs';

const PAGE_SIZE = 1000;

const SELECT_COLUMNS =
  'id, external_id, source, source_type, name, address, location, location_precision, category, category_min, category_min_source, is_free, operating_hours, info_url, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group, sigungu_name, created_at';

// survivor(그룹 내 최초 생성 행)의 값이 비어있을 때만 다른 행의 값으로 채운다(덮어쓰기 없음
// — Decision 017의 "NULL 병합" 관례와 동일한 철학). location/외부 식별자/생성시각처럼
// 정체성에 해당하는 컬럼은 병합 대상에서 제외한다(location은 별도 처리 — 아래 참고).
const MERGE_COLUMNS = [
  'category',
  'category_min',
  'category_min_source',
  'address',
  'location_precision',
  'is_free',
  'operating_hours',
  'info_url',
  'is_kids_friendly',
  'has_parking',
  'stroller_accessible',
  'facility_type',
  'target_age_group',
  'sigungu_name',
];

function extractLngLat(location) {
  const coords = location?.coordinates;
  if (!coords) return null;
  return { lng: coords[0], lat: coords[1] };
}

function coordKey(location) {
  const c = extractLngLat(location);
  return c ? `${c.lng.toFixed(6)},${c.lat.toFixed(6)}` : null;
}

function nonEmpty(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isBlank(value) {
  return value === null || value === undefined || value === '';
}

// Union-Find: 같은 실제 장소로 판정된 행들을 하나의 그룹으로 묶는다.
function makeUnionFind() {
  const parent = new Map();
  function find(x) {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  return { find, union };
}

// 순수 함수: rows(각 SELECT_COLUMNS 형태의 행 배열)를 받아 "명백한 중복" 그룹만 골라
// 각 그룹을 [survivor, ...losers] 형태(survivor=그룹 내 최초 생성행)의 배열로 반환한다.
export function findOpenSpacesDuplicateGroups(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const { find, union } = makeUnionFind();

  const byCoordName = new Map();
  const byNameAddr = new Map();
  for (const row of rows) {
    find(row.id);
    const coord = coordKey(row.location);
    const name = nonEmpty(row.name);
    const addr = nonEmpty(row.address);
    if (coord && name) {
      const key = `${coord}|||${name}`;
      if (!byCoordName.has(key)) byCoordName.set(key, []);
      byCoordName.get(key).push(row.id);
    }
    if (name && addr) {
      const key = `${name}|||${addr}`;
      if (!byNameAddr.has(key)) byNameAddr.set(key, []);
      byNameAddr.get(key).push(row.id);
    }
  }

  // 후보 그룹 중 서로 다른 source_type이 2개 이상 섞인 경우에만 병합한다(교차 출처만 신뢰).
  function crossRegistryUnion(candidateMap) {
    for (const [, ids] of candidateMap) {
      if (ids.length < 2) continue;
      const sourceTypes = new Set(ids.map((id) => byId.get(id).source_type));
      if (sourceTypes.size < 2) continue;
      for (let i = 1; i < ids.length; i += 1) union(ids[0], ids[i]);
    }
  }
  crossRegistryUnion(byCoordName);
  crossRegistryUnion(byNameAddr);

  const groups = new Map();
  for (const row of rows) {
    const root = find(row.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(row);
  }

  return [...groups.values()]
    .filter((list) => list.length > 1)
    .map((list) => [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
}

// 그룹 하나(survivor + losers)를 받아, survivor에 적용할 patch(빈 필드만 채움)를 계산한다.
function buildMergePatch(survivor, losers) {
  const patch = {};
  for (const col of MERGE_COLUMNS) {
    if (!isBlank(survivor[col])) continue;
    const donor = losers.find((r) => !isBlank(r[col]));
    if (donor) patch[col] = donor[col];
  }
  if (isBlank(survivor.location)) {
    const donor = losers.find((r) => r.location);
    if (donor) {
      const c = extractLngLat(donor.location);
      if (c) patch.location = `SRID=4326;POINT(${c.lng} ${c.lat})`;
    }
  }
  return patch;
}

async function fetchAllOpenSpaces(client) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = client.from('open_spaces').select(SELECT_COLUMNS).order('id', { ascending: true }).limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`open_spaces 조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    lastId = data[data.length - 1].id;
  }
  return rows;
}

// 정기 실행(run-daily.mjs/run-monthly.mjs 배치 후처리) 및 1회성 마이그레이션 양쪽에서
// 재사용한다. dryRun이면 DB를 건드리지 않고 집계만 반환한다. 실제 실행 시에는 삭제 전
// 그룹 전체(survivor+losers)를 백업 JSON 파일로 먼저 기록한 뒤(복구 가능성 확보 —
// open_spaces에는 is_active 같은 소프트 삭제 컬럼이 없어 하드 삭제가 불가피하다) UPDATE/
// DELETE를 수행한다. raw_data는 백업에서 제외한다 — Decision 017의 raw_ingest_data 테이블이
// (source, source_id) 기준으로 원본을 이미 영구 보존하므로 중복 보존할 필요가 없다.
export async function dedupeOpenSpaces(
  { dryRun = false, backupDir = 'docs/dedupe-backups' } = {},
  client = createAdminClient()
) {
  const rows = await fetchAllOpenSpaces(client);
  const groups = findOpenSpacesDuplicateGroups(rows);

  const updates = [];
  const deleteIds = [];
  for (const group of groups) {
    const [survivor, ...losers] = group;
    const patch = buildMergePatch(survivor, losers);
    if (Object.keys(patch).length > 0) updates.push({ id: survivor.id, patch });
    deleteIds.push(...losers.map((r) => r.id));
  }

  if (dryRun) {
    return { totalRows: rows.length, groupCount: groups.length, toUpdateCount: updates.length, toDeleteCount: deleteIds.length };
  }

  if (groups.length === 0) {
    return { totalRows: rows.length, groupCount: 0, updated: 0, deleted: 0, backupFile: null };
  }

  const backupPayload = groups.map((group) => ({
    survivorId: group[0].id,
    rows: group.map(({ id, external_id: externalId, source, source_type: sourceType, name, address, created_at: createdAt }) => ({
      id,
      external_id: externalId,
      source,
      source_type: sourceType,
      name,
      address,
      created_at: createdAt,
    })),
  }));
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-open-spaces-dedup.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupPayload, null, 2), 'utf8');

  for (const { id, patch } of updates) {
    // eslint-disable-next-line no-await-in-loop
    const { error } = await client.from('open_spaces').update(patch).eq('id', id);
    if (error) throw new Error(`open_spaces survivor 병합 실패(id=${id}): ${error.message}`);
  }

  let deleted = 0;
  const DELETE_BATCH_SIZE = 200;
  for (let i = 0; i < deleteIds.length; i += DELETE_BATCH_SIZE) {
    const batch = deleteIds.slice(i, i + DELETE_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const { error, count } = await client.from('open_spaces').delete({ count: 'exact' }).in('id', batch);
    if (error) throw new Error(`open_spaces 중복 삭제 실패: ${error.message}`);
    deleted += count ?? batch.length;
  }

  return { totalRows: rows.length, groupCount: groups.length, updated: updates.length, deleted, backupFile };
}
