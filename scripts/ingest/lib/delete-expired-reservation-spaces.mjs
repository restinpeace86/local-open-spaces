// [한시성 예약 스팟 자동 삭제](2026-09-09 사용자 지시): "open_spaces로 들어온
// 데이터중에.. seoul_public_reservation으로 들어온것들은 이런거는 예약일자라던가
// 서비스 일자가 들어 있는데.. 예약일자 기준 end date가 지난건 open_spaces에서
// 삭제해버리자. 즉, 대표스팟으로 묶인 장소중 예약일자라던가 있는 애들.. 이애들은
// 한시성 장소로서 예약일자가 지나버리면 자동삭제"
//
// [배경 조사] seoul_public_reservation(seoul-yeyak-adapter.mjs, MAXCLASSNM_TABLE로
// open_spaces에 라우팅되는 "체육시설"/"공간시설" 행)은 open_spaces에 전용 날짜
// 컬럼이 없지만(open_spaces 스키마 자체가 애초에 한시성을 가정하지 않음),
// raw_data(jsonb)에 원본 서울시 API의 SVCOPNBGNDT/SVCOPNENDDT(서비스 이용
// 시작/종료일자)가 그대로 보존돼 있다(실측 확인: "8월 일반캠핑존.." 행은
// SVCOPNENDDT="2026-08-31 00:00:00.0"). 같은 어댑터의 events 분기는 이미
// 이 필드를 end_date로 써서 deactivateExpiredEvents(비활성화)가 만료를
// 처리한다 — open_spaces에는 소프트 삭제 컬럼(is_active)이 없어(dedupe-open-
// spaces.mjs 상단 주석과 동일한 제약) 하드 삭제가 불가피하다.
//
// 유예 기간은 deactivate-expired-events.mjs의 현재 정책(EXPIRY_GRACE_DAYS=0,
// "종료일 당일까지는 노출, 다음날 첫 배치부터 즉시 처리")과 동일하게 맞춘다 —
// 같은 개념(한시성 데이터 만료)에 서로 다른 유예 기준을 임의로 적용하지 않는다
// (제3장 제5조 추측 금지, 제5장 제4조 기존 구조 우선). 날짜 계산 함수 자체를
// 그대로 재사용한다.
import fs from 'fs';
import path from 'path';
import { computeExpiryCutoffDate } from './deactivate-expired-events.mjs';

const EXPIRED_SOURCE = 'seoul_public_reservation';
const PAGE_SIZE = 1000;
const DELETE_BATCH_SIZE = 200;

// raw_data->>'SVCOPNENDDT'는 "YYYY-MM-DD HH:MI:SS.f" 형태의 원본 텍스트다 —
// 날짜 부분만 취해 cutoffDate(YYYY-MM-DD)와 문자열 비교해도 정확하다(둘 다
// 항상 같은 고정폭 ISO 형식이라 사전식 비교 = 날짜 비교).
function extractEndDate(rawData) {
  const raw = rawData?.SVCOPNENDDT;
  if (typeof raw !== 'string' || raw.length < 10) return null;
  return raw.slice(0, 10);
}

async function fetchReservationRows(client) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = client
      .from('open_spaces')
      .select('id, external_id, name, address, created_at, raw_data')
      .eq('source', EXPIRED_SOURCE)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error) throw new Error(`${EXPIRED_SOURCE} 행 조회 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    lastId = data[data.length - 1].id;
  }
  return rows;
}

// 정기 실행(run-daily.mjs 후처리) 및 수동 실행 양쪽에서 재사용한다. dryRun이면 DB를
// 건드리지 않고 집계만 반환한다. 실제 삭제 전에는 dedupeOpenSpaces와 동일한 안전장치로
// 삭제 대상 전체를 백업 JSON 파일로 먼저 남긴다(open_spaces는 소프트 삭제 컬럼이 없어
// 하드 삭제만 가능하므로 복구 가능성을 남겨둔다).
export async function deleteExpiredReservationSpaces(
  client,
  { dryRun = false, backupDir = 'docs/dedupe-backups', now = new Date() } = {}
) {
  const cutoffDate = computeExpiryCutoffDate(now);
  const rows = await fetchReservationRows(client);
  const expired = rows.filter((row) => {
    const endDate = extractEndDate(row.raw_data);
    return endDate !== null && endDate < cutoffDate;
  });

  if (dryRun) {
    return { cutoffDate, totalScanned: rows.length, toDeleteCount: expired.length };
  }

  if (expired.length === 0) {
    return { cutoffDate, totalScanned: rows.length, deletedCount: 0, backupFile: null };
  }

  const backupPayload = expired.map(({ id, external_id: externalId, name, address, created_at: createdAt, raw_data: rawData }) => ({
    id,
    external_id: externalId,
    name,
    address,
    created_at: createdAt,
    svc_end_date: extractEndDate(rawData),
  }));
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(
    backupDir,
    `${new Date().toISOString().replace(/[:.]/g, '-')}-expired-reservation-spaces.json`
  );
  fs.writeFileSync(backupFile, JSON.stringify(backupPayload, null, 2), 'utf8');

  let deletedCount = 0;
  const deleteIds = expired.map((row) => row.id);
  for (let i = 0; i < deleteIds.length; i += DELETE_BATCH_SIZE) {
    const batch = deleteIds.slice(i, i + DELETE_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const { error, count } = await client.from('open_spaces').delete({ count: 'exact' }).in('id', batch);
    if (error) throw new Error(`만료 예약 스팟 삭제 실패: ${error.message}`);
    deletedCount += count ?? batch.length;
  }

  return { cutoffDate, totalScanned: rows.length, deletedCount, backupFile };
}
