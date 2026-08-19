// Source 04: 서울시 공공서비스예약 (spec/data/data_sources.md #04)
// 2단계 수집: 1) ListPublicReservationViaGUI로 유효한 SVCID 목록 조회
//            2) 각 SVCID에 대해 ListPublicReservationDetail로 상세 조회
//
// 주의: ListPublicReservationViaGUI가 현재 ERROR-500(서버 오류)을 반환 중이라
// row 필드 구조를 실제 응답으로 확인하지 못했다. 임의로 필드명을 추측하지 않고
// 원본 응답을 그대로 로그로 남기도록 방어적으로 작성했다 (제3장 제5조 추측 금지).
// 목록 API가 정상화되면 mapListRow/mapDetailToEventRow의 필드 매핑을 실제 응답 기준으로 채워야 한다.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient, upsertRows } from './lib/supabase-admin.mjs';

const env = loadEnv();
const dryRun = process.argv.includes('--dry-run');

const BASE = 'http://openapi.seoul.go.kr:8088';

async function callSeoulApi(serviceName, pathSuffix = '') {
  const url = `${BASE}/${env.SEOUL_OPEN_DATA_KEY}/json/${serviceName}${pathSuffix}`;
  const res = await fetch(url);
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${serviceName} 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
  }

  const topKey = Object.keys(json).find((k) => k !== 'RESULT');
  const result = json[topKey]?.RESULT ?? json.RESULT;

  return { json, result, topKey };
}

async function fetchReservationList({ startIdx = 1, endIdx = 100 } = {}) {
  const { json, result, topKey } = await callSeoulApi('ListPublicReservationViaGUI', `/${startIdx}/${endIdx}/`);

  if (result?.CODE !== 'INFO-000') {
    throw new Error(`ListPublicReservationViaGUI 오류: ${result?.CODE} ${result?.MESSAGE}`);
  }

  return json[topKey]?.row ?? [];
}

async function fetchReservationDetail(svcId) {
  const { json, result, topKey } = await callSeoulApi('ListPublicReservationDetail', `/1/1/${svcId}`);

  if (result?.CODE === 'INFO-200') {
    return null; // 만료/삭제된 SVCID
  }
  if (result?.CODE !== 'INFO-000') {
    throw new Error(`ListPublicReservationDetail(${svcId}) 오류: ${result?.CODE} ${result?.MESSAGE}`);
  }

  return json[topKey]?.row?.[0] ?? null;
}

async function main() {
  console.log(`▶ 서울시 공공서비스예약 수집 시작 (dry-run: ${dryRun})`);

  const listRows = await fetchReservationList({ startIdx: 1, endIdx: 20 });
  console.log(`✅ 목록 조회 성공: ${listRows.length}건`);
  console.log('   샘플 원본 응답(필드 구조 확인용):', JSON.stringify(listRows[0], null, 2));

  // 목록 응답의 SVCID 필드명이 실제로 확인되기 전까지는 후보 필드명을 순서대로 탐색한다.
  const svcIdFieldCandidates = ['SVCID', 'SVC_ID', 'RSV_SVC_ID', 'SVCSTATNM'];
  const firstRow = listRows[0] ?? {};
  const svcIdField = svcIdFieldCandidates.find((f) => firstRow[f] !== undefined);

  if (!svcIdField) {
    console.warn('⚠️ SVCID 필드를 자동으로 찾지 못했습니다. 위 원본 응답을 보고 정확한 필드명을 확인해야 합니다.');
    console.warn('   후보 필드 목록:', Object.keys(firstRow));
    return;
  }

  const details = [];
  for (const row of listRows) {
    const svcId = row[svcIdField];
    const detail = await fetchReservationDetail(svcId);
    if (detail) details.push(detail);
  }

  console.log(`✅ 상세 조회 성공: ${details.length}/${listRows.length}건 (나머지는 만료/삭제)`);
  console.log('   샘플 상세 응답(필드 구조 확인용):', JSON.stringify(details[0], null, 2));

  if (dryRun || details.length === 0) {
    console.log('ℹ️ dry-run이거나 유효 데이터가 없어 upsert는 건너뜁니다.');
    return;
  }

  console.warn('⚠️ 상세 응답 필드 매핑이 아직 확정되지 않아 자동 upsert는 수행하지 않습니다.');
  console.warn('   위 원본 응답을 기준으로 events 테이블 매핑(mapDetailToEventRow)을 완성한 뒤 재실행하세요.');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
