// upsertRows()의 external_id 중복 제거 방어 로직 단위 테스트 (2026-08-21 추가)
// 배경: GgEventsAdapter의 원본 데이터(TBWTRWTRPLYHYDRDTAM)에 완전히 동일한 시설명+주소
// 레코드가 두 건 중복 등재돼 있어, 동일 external_id(SHA1 해시)를 가진 두 행이 같은 upsert
// 배치에 섞여 들어가면서 Postgres가 "ON CONFLICT DO UPDATE command cannot affect row a
// second time"로 배치 전체를 거부하는 실제 오류를 겪었다. 이 방어는 어떤 어댑터든 원본에
// 완전 중복 레코드가 섞여 있을 수 있는 일반적인 경우라 공용 upsertRows에 둔다.
import { describe, expect, it, vi } from 'vitest';
import { upsertRows, upsertRowsSafeMerge, upsertRawIngestData, fetchRawIngestData } from './supabase-admin.mjs';

function makeMockClient() {
  const upsert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn(() => ({ upsert }));
  return { client: { from }, upsert, from };
}

describe('upsertRows', () => {
  it('행이 없으면 upsert를 호출하지 않고 count 0을 반환한다', async () => {
    const { client, upsert } = makeMockClient();
    const result = await upsertRows(client, 'open_spaces', []);
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0 });
  });

  it('external_id가 같은 행이 여러 개면 하나로 합쳐 upsert를 한 번만 호출한다(마지막 값 우선)', async () => {
    const { client, upsert } = makeMockClient();
    const rows = [
      { external_id: 'A', name: '첫 번째' },
      { external_id: 'B', name: '유일' },
      { external_id: 'A', name: '두 번째(최종)' },
    ];

    const result = await upsertRows(client, 'open_spaces', rows);

    expect(upsert).toHaveBeenCalledTimes(1);
    const [sentRows] = upsert.mock.calls[0];
    expect(sentRows).toHaveLength(2);
    expect(sentRows.find((r) => r.external_id === 'A')).toEqual({ external_id: 'A', name: '두 번째(최종)' });
    expect(result).toEqual({ count: 2 });
  });

  it('중복이 없으면 그대로 전달한다', async () => {
    const { client, upsert } = makeMockClient();
    const rows = [
      { external_id: 'A', name: '가' },
      { external_id: 'B', name: '나' },
    ];

    const result = await upsertRows(client, 'open_spaces', rows);

    const [sentRows] = upsert.mock.calls[0];
    expect(sentRows).toHaveLength(2);
    expect(result).toEqual({ count: 2 });
  });

  it('onConflict 옵션을 external_id로 지정해 호출한다', async () => {
    const { client, upsert, from } = makeMockClient();
    await upsertRows(client, 'events', [{ external_id: 'A' }]);

    expect(from).toHaveBeenCalledWith('events');
    expect(upsert).toHaveBeenCalledWith(expect.anything(), { onConflict: 'external_id' });
  });

  it('upsert가 에러를 반환하면 테이블명을 포함한 에러를 던진다', async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: { message: 'boom' } }));
    const client = { from: vi.fn(() => ({ upsert })) };

    await expect(upsertRows(client, 'open_spaces', [{ external_id: 'A' }])).rejects.toThrow(
      'open_spaces upsert 실패: boom'
    );
  });

  // 사용자 지시(2026-08-22) 전체 어댑터 정책 점검에서 발견: 82,373건짜리 소스(playground.mjs)를
  // 단일 upsert 호출로 보내면 요청이 멈춰버렸다. 500건씩 배치로 나눠 호출하는지 검증한다.
  it('행이 500건을 넘으면 배치로 나눠 여러 번 upsert를 호출한다', async () => {
    const { client, upsert } = makeMockClient();
    const rows = Array.from({ length: 1200 }, (_, i) => ({ external_id: `id-${i}` }));

    const result = await upsertRows(client, 'open_spaces', rows);

    expect(upsert).toHaveBeenCalledTimes(3); // 500 + 500 + 200
    expect(upsert.mock.calls[0][0]).toHaveLength(500);
    expect(upsert.mock.calls[1][0]).toHaveLength(500);
    expect(upsert.mock.calls[2][0]).toHaveLength(200);
    expect(result).toEqual({ count: 1200 });
  });
});

function makeSafeMergeMockClient({ existingRows = [] } = {}) {
  const upsert = vi.fn(() => Promise.resolve({ error: null }));
  const inFn = vi.fn(() => Promise.resolve({ data: existingRows, error: null }));
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select, upsert }));
  return { client: { from }, upsert, select, inFn, from };
}

// [긴급 아키텍처 개편] 2단계(RAW→Service 재가공) 전용 Safe UPSERT — 충돌 시 무조건 덮어쓰는
// upsertRows()와 달리, 기존 행의 컬럼이 NULL일 때만 새 값으로 채우고 이미 값이 있으면 보존한다.
describe('upsertRowsSafeMerge', () => {
  it('행이 없으면 조회/upsert 모두 호출하지 않고 count 0을 반환한다', async () => {
    const { client, upsert, select } = makeSafeMergeMockClient();
    const result = await upsertRowsSafeMerge(client, 'events', []);
    expect(select).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0, duplicateWithinBatch: 0, mergedWithExisting: 0, failedBatches: [] });
  });

  it('기존 행이 없으면(신규) incoming 행을 그대로 upsert한다', async () => {
    const { client, upsert } = makeSafeMergeMockClient({ existingRows: [] });
    const result = await upsertRowsSafeMerge(client, 'events', [{ external_id: 'A', title: '새 행', venue_name: null }]);

    const [sentRows] = upsert.mock.calls[0];
    expect(sentRows).toEqual([{ external_id: 'A', title: '새 행', venue_name: null }]);
    expect(result).toEqual({ count: 1, duplicateWithinBatch: 0, mergedWithExisting: 0, failedBatches: [] });
  });

  it('기존 행의 컬럼이 NULL이 아니면 incoming 값으로 덮어쓰지 않고 기존 값을 보존한다', async () => {
    const { client, upsert } = makeSafeMergeMockClient({
      existingRows: [{ external_id: 'A', title: '기존 제목(실데이터)', venue_name: null }],
    });

    const result = await upsertRowsSafeMerge(client, 'events', [
      { external_id: 'A', title: '재가공된 새 제목', venue_name: '재가공된 장소명' },
    ]);

    const [sentRows] = upsert.mock.calls[0];
    // title은 기존에 이미 실데이터가 있었으므로 보존, venue_name은 기존이 NULL이었으므로 새 값으로 채워진다.
    expect(sentRows).toEqual([{ external_id: 'A', title: '기존 제목(실데이터)', venue_name: '재가공된 장소명' }]);
    expect(result.mergedWithExisting).toBe(1);
  });

  // [예약/운영 상태 필드는 항상 최신값으로 갱신](2026-09-12 사용자 지시): "시간관련
  // 필드.. 예약 일자들도 항상 최신값으로 갱신에 포함하는게 맞을거같은데.. 주기적으로
  // 바뀌어야 하는 필드에 대하여.. 최신값으로 갱신해" — 서울형 키즈카페 실측 확인(회차가
  // 바뀌었는데도 옛 예약기간에 고정)에서 발견된 버그의 재발 방지 테스트.
  describe('events의 예약/운영 상태 필드는 기존 값이 있어도 항상 최신 incoming 값으로 갱신한다', () => {
    it('start_date/end_date/reservation_start_date/reservation_end_date/is_active/booking_status는 기존 값을 덮어쓴다', async () => {
      const { client, upsert } = makeSafeMergeMockClient({
        existingRows: [
          {
            external_id: 'A',
            start_date: '2026-08-25',
            end_date: '2026-09-07',
            reservation_start_date: '2026-08-25T00:00:00Z',
            reservation_end_date: '2026-09-07T23:59:59Z',
            is_active: false,
            booking_status: 'CLOSED',
          },
        ],
      });

      await upsertRowsSafeMerge(client, 'events', [
        {
          external_id: 'A',
          start_date: '2026-09-10',
          end_date: '2026-09-21',
          reservation_start_date: '2026-09-10T00:00:00Z',
          reservation_end_date: '2026-09-21T23:59:59Z',
          is_active: true,
          booking_status: 'OPEN',
        },
      ]);

      const [sentRows] = upsert.mock.calls[0];
      expect(sentRows).toEqual([
        {
          external_id: 'A',
          start_date: '2026-09-10',
          end_date: '2026-09-21',
          reservation_start_date: '2026-09-10T00:00:00Z',
          reservation_end_date: '2026-09-21T23:59:59Z',
          is_active: true,
          booking_status: 'OPEN',
        },
      ]);
    });

    it('이번 재가공이 해당 필드를 못 채웠으면(null/undefined) 예외적으로 기존 값을 보존한다', async () => {
      const { client, upsert } = makeSafeMergeMockClient({
        existingRows: [{ external_id: 'A', start_date: '2026-08-25', is_active: true }],
      });

      await upsertRowsSafeMerge(client, 'events', [{ external_id: 'A', start_date: null, is_active: undefined }]);

      const [sentRows] = upsert.mock.calls[0];
      expect(sentRows).toEqual([{ external_id: 'A', start_date: '2026-08-25', is_active: true }]);
    });

    it('open_spaces는 이런 시간 필드 대상이 없어 기존 SafeMerge 규칙(기존 값 보존)이 그대로 적용된다', async () => {
      const { client, upsert } = makeSafeMergeMockClient({
        existingRows: [{ external_id: 'A', is_active: false }],
      });

      await upsertRowsSafeMerge(client, 'open_spaces', [{ external_id: 'A', is_active: true }]);

      const [sentRows] = upsert.mock.calls[0];
      expect(sentRows).toEqual([{ external_id: 'A', is_active: false }]);
    });

    it('관리자가 수동으로 덮어쓸 수 있는 category_min/target_audience는 항상 최신화 대상에 포함하지 않는다(기존 값 보존)', async () => {
      const { client, upsert } = makeSafeMergeMockClient({
        existingRows: [
          { external_id: 'A', category_min: '관리자수동분류', category_min_source: 'MANUAL', target_audience: 'FAMILY', target_audience_source: 'MANUAL' },
        ],
      });

      await upsertRowsSafeMerge(client, 'events', [
        { external_id: 'A', category_min: '원본재분류', category_min_source: 'RAW', target_audience: null, target_audience_source: null },
      ]);

      const [sentRows] = upsert.mock.calls[0];
      expect(sentRows).toEqual([
        { external_id: 'A', category_min: '관리자수동분류', category_min_source: 'MANUAL', target_audience: 'FAMILY', target_audience_source: 'MANUAL' },
      ]);
    });
  });

  // Decision 017(2026-08-25) 3항: 같은 배치(같은 fetch 결과) 안에서 동일 SVCID(external_id)가
  // 중복되는 경우도 마지막 값 우선이 아니라 컬럼별 NULL 병합이어야 한다.
  it('배치 내 동일 external_id 중복도 컬럼별 NULL 병합한다(마지막 값 우선 아님)', async () => {
    const { client, upsert } = makeSafeMergeMockClient({ existingRows: [] });

    const result = await upsertRowsSafeMerge(client, 'events', [
      { external_id: 'A', title: '첫 번째(실데이터)', venue_name: null },
      { external_id: 'A', title: null, venue_name: '두 번째에만 있는 장소명' },
    ]);

    const [sentRows] = upsert.mock.calls[0];
    expect(sentRows).toEqual([{ external_id: 'A', title: '첫 번째(실데이터)', venue_name: '두 번째에만 있는 장소명' }]);
    expect(result).toEqual({ count: 1, duplicateWithinBatch: 1, mergedWithExisting: 0, failedBatches: [] });
  });

  it("배치 내 중복 시 빈 문자열('')도 '값 없음'으로 취급해 다른 항목의 실데이터로 채운다", async () => {
    const { client, upsert } = makeSafeMergeMockClient({ existingRows: [] });

    await upsertRowsSafeMerge(client, 'open_spaces', [
      { external_id: 'A', address: '서울시 종로구' },
      { external_id: 'A', address: '' },
    ]);

    const [sentRows] = upsert.mock.calls[0];
    expect(sentRows).toEqual([{ external_id: 'A', address: '서울시 종로구' }]);
  });

  it('external_id로 select().in()을 호출해 기존 행을 조회한다', async () => {
    const { client, select, inFn, from } = makeSafeMergeMockClient({ existingRows: [] });
    await upsertRowsSafeMerge(client, 'open_spaces', [{ external_id: 'A' }, { external_id: 'B' }]);

    expect(from).toHaveBeenCalledWith('open_spaces');
    expect(select).toHaveBeenCalledWith('*');
    expect(inFn).toHaveBeenCalledWith('external_id', ['A', 'B']);
  });

  // [배치 단위 장애 격리](2026-09-26 사용자 지시): "300개로 나눴으면 중간에 실패나면
  // 그 300건에 대하여서만 실패하고 다음단계 수행하도록 넘어가는게 좋을꺼 같은데" —
  // 이제 조회/upsert 에러는 함수 전체를 던지지 않고, 그 배치만 failedBatches에
  // 기록한 채 계속 진행한다(아래는 단일 배치라 "계속 진행"이 곧바로 종료되는
  // 경계 케이스 — 여러 배치에 걸친 경우는 "실패한 배치만 건너뛰고 나머지는
  // 계속 upsert된다" 테스트에서 별도로 검증한다).
  it('기존 행 조회 중 에러가 나면 그 배치를 failedBatches에 기록하고(던지지 않고) 계속 진행한다', async () => {
    const inFn = vi.fn(() => Promise.resolve({ data: null, error: { message: 'select boom' } }));
    const select = vi.fn(() => ({ in: inFn }));
    const client = { from: vi.fn(() => ({ select, upsert: vi.fn() })) };

    const result = await upsertRowsSafeMerge(client, 'events', [{ external_id: 'A' }]);

    expect(result.count).toBe(0);
    expect(result.failedBatches).toEqual([
      { batchNumber: 1, range: '1~1', count: 1, error: 'events 기존 행 조회 실패: select boom' },
    ]);
  });

  it('upsert가 에러를 반환하면 그 배치를 failedBatches에 기록하고(던지지 않고) 계속 진행한다', async () => {
    const inFn = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const select = vi.fn(() => ({ in: inFn }));
    const upsert = vi.fn(() => Promise.resolve({ error: { message: 'upsert boom' } }));
    const client = { from: vi.fn(() => ({ select, upsert })) };

    const result = await upsertRowsSafeMerge(client, 'events', [{ external_id: 'A' }]);

    expect(result.count).toBe(0);
    expect(result.failedBatches).toEqual([
      { batchNumber: 1, range: '1~1', count: 1, error: 'events upsert 실패: upsert boom' },
    ]);
  });

  // 여러 배치에 걸친 실제 시나리오: 중간 배치 하나만 실패해도 앞뒤 배치는 정상
  // upsert되고, 실패한 배치의 번호/행 범위가 정확히 기록된다.
  it('여러 배치 중 하나가 완전히 실패해도(재시도 소진) 나머지 배치는 계속 upsert되고, 실패한 배치의 번호/행 범위가 기록된다', async () => {
    const inFn = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const select = vi.fn(() => ({ in: inFn }));
    // 2번째 배치(행 301~600)의 upsert만 매번 실패하도록 external_id로 분기한다.
    const upsert = vi.fn((rows) => {
      const isSecondBatch = rows[0]?.external_id === 'id-300';
      return Promise.resolve({ error: isSecondBatch ? { message: 'upsert boom' } : null });
    });
    const client = { from: vi.fn(() => ({ select, upsert })) };
    const rows = Array.from({ length: 900 }, (_, i) => ({ external_id: `id-${i}` }));

    const result = await upsertRowsSafeMerge(client, 'open_spaces', rows);

    // open_spaces 배치 크기 300 기준: 1~300(성공) / 301~600(실패) / 601~900(성공).
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(result.count).toBe(600); // 실패한 300건은 count에서 빠진다.
    expect(result.failedBatches).toEqual([
      { batchNumber: 2, range: '301~600', count: 300, error: 'open_spaces upsert 실패: upsert boom' },
    ]);
  });

  it('events는 200건 단위로 upsert를 나눈다(트리거/trigram 인덱스 비용 때문에 그대로 유지)', async () => {
    const { client, upsert, inFn } = makeSafeMergeMockClient({ existingRows: [] });
    const rows = Array.from({ length: 1200 }, (_, i) => ({ external_id: `id-${i}` }));

    const result = await upsertRowsSafeMerge(client, 'events', rows);

    // [SEOUL_YEYAK events upsert 간헐적 statement timeout 수정](2026-09-13 사용자 지시):
    // "왜 쿼리가 타임아웃나는지 원인 진단해서 고쳐줘" — SafeMerge upsert 배치 크기를
    // 500 → 200(이미 검증된 SELECT_LOOKUP_BATCH_SIZE와 동일)으로 낮췄다. 단일 SQL
    // UPSERT 문이 처리하는 행 수를 줄여, 그 문 하나에 실리는 트리거(events.updated_at
    // 자동 갱신)/trigram 인덱스 유지 비용을 줄이는 것이 목적이다(events 테이블에
    // statement_timeout 2분을 넘겨 upsert가 반복 실패한 실측 진단 결과 — 상세는
    // implementation/2026-09-13-events-upsert-timeout-fix.md 참고).
    // upsert(POST 본문): 1200/200 = 정확히 6배치. 조회(.in(), GET)는 배치 크기가
    // SELECT_LOOKUP_BATCH_SIZE(200)와 같아져 배치당 추가로 쪼갤 필요가 없다 — 6회.
    expect(upsert).toHaveBeenCalledTimes(6);
    expect(inFn).toHaveBeenCalledTimes(6);
    expect(inFn.mock.calls.every(([, ids]) => ids.length <= 200)).toBe(true);
    expect(result).toEqual({ count: 1200, duplicateWithinBatch: 0, mergedWithExisting: 0, failedBatches: [] });
  });

  // [LOCALDATA_PLAYGROUND 대량 upsert 타임아웃 수정](2026-09-25 사용자 지시): "이것만
  // upsert를 나눠서 할 수는 없어? 10000건씩 upsert한다던가" — 실측 확인 결과
  // open_spaces에는 events와 달리 커스텀 트리거가 전혀 없어(pg_trigger 직접 조회로
  // 확인) 200으로 낮출 근거가 없었는데도 공용 상수를 그대로 썼다.
  // [PostgREST 8초 statement_timeout 실측 확정](2026-09-26 사용자 지시): "다 뒤져서
  // 단계별로 찾아봐" 조사 결과 PostgREST 경유 요청은(service_role 포함) DB 기본값
  // (2분)이 아니라 authenticator 롤의 8초 statement_timeout을 그대로 물려받는다는
  // 것을 진단 함수로 직접 확인했다. 500건 배치가 이따금 이 8초를 넘겨 재시도가
  // 발생하는 것을 실측(LOCALDATA_PLAYGROUND 단독 재실행)으로 확인해 — "어차피
  // 월 1회 배치인데 왕복이 조금 늘어도 상관없다"(사용자)는 판단으로 300건으로
  // 낮춰 8초를 더 여유 있게 피한다(이미 이 소스만 25분 스텝 타임아웃을 따로 줌).
  it('open_spaces는 300건 단위로 upsert를 나눈다(8초 statement_timeout에 더 여유를 두기 위해 500에서 하향)', async () => {
    const { client, upsert, inFn } = makeSafeMergeMockClient({ existingRows: [] });
    const rows = Array.from({ length: 1200 }, (_, i) => ({ external_id: `id-${i}` }));

    const result = await upsertRowsSafeMerge(client, 'open_spaces', rows);

    // upsert(POST 본문): 300×4 = 4배치. 조회(.in(), GET)는 여전히
    // SELECT_LOOKUP_BATCH_SIZE(200) 단위로 별도 쪼개져 300건 배치당 2회씩(200+100)
    // — 총 4×2 = 8회(URL 길이 제한은 배치 크기와 무관하게 그대로 지켜진다).
    expect(upsert).toHaveBeenCalledTimes(4);
    expect(upsert.mock.calls[0][0]).toHaveLength(300);
    expect(upsert.mock.calls[1][0]).toHaveLength(300);
    expect(upsert.mock.calls[2][0]).toHaveLength(300);
    expect(upsert.mock.calls[3][0]).toHaveLength(300);
    expect(inFn).toHaveBeenCalledTimes(8);
    expect(inFn.mock.calls.every(([, ids]) => ids.length <= 200)).toBe(true);
    expect(result).toEqual({ count: 1200, duplicateWithinBatch: 0, mergedWithExisting: 0, failedBatches: [] });
  });

  // [GG_CULTURE_EVENTS 반복 upsert 실패 수정](2026-09-07): 실제 운영에서 반복 재현된
  // "events_location_precision_consistency_check" 위반 — location/location_precision을
  // 컬럼별로 독립 병합하면 서로 다른 소스에서 값을 가져와 "UNKNOWN인데 location이 채워짐"
  // 같은 제약 위반 조합이 만들어졌다. 두 컬럼은 항상 함께(더 나은 정밀도 쪽으로) 병합돼야
  // 한다.
  describe('location/location_precision 쌍 정합성', () => {
    it('기존 행이 UNKNOWN(location=null)이고 incoming이 더 나은 정밀도(CITY_APPROX+좌표)면 incoming 쌍을 통째로 채택한다', async () => {
      const { client, upsert } = makeSafeMergeMockClient({
        existingRows: [{ external_id: 'A', location: null, location_precision: 'UNKNOWN' }],
      });

      await upsertRowsSafeMerge(client, 'events', [
        { external_id: 'A', location: 'SRID=4326;POINT(127 37)', location_precision: 'CITY_APPROX' },
      ]);

      const [sentRows] = upsert.mock.calls[0];
      expect(sentRows).toEqual([{ external_id: 'A', location: 'SRID=4326;POINT(127 37)', location_precision: 'CITY_APPROX' }]);
    });

    it('기존 행이 이미 더 나은 정밀도(EXACT)면 incoming이 UNKNOWN이어도 기존 쌍을 그대로 유지한다', async () => {
      const { client, upsert } = makeSafeMergeMockClient({
        existingRows: [{ external_id: 'A', location: 'SRID=4326;POINT(127 37)', location_precision: 'EXACT' }],
      });

      await upsertRowsSafeMerge(client, 'events', [{ external_id: 'A', location: null, location_precision: 'UNKNOWN' }]);

      const [sentRows] = upsert.mock.calls[0];
      expect(sentRows).toEqual([{ external_id: 'A', location: 'SRID=4326;POINT(127 37)', location_precision: 'EXACT' }]);
    });

    it('배치 내 동일 external_id 중복도 location/location_precision을 항상 같은 쪽에서 함께 가져온다', async () => {
      const { client, upsert } = makeSafeMergeMockClient({ existingRows: [] });

      await upsertRowsSafeMerge(client, 'open_spaces', [
        { external_id: 'A', location: null, location_precision: 'UNKNOWN' },
        { external_id: 'A', location: 'SRID=4326;POINT(127 37)', location_precision: 'CITY_APPROX' },
      ]);

      const [sentRows] = upsert.mock.calls[0];
      expect(sentRows).toEqual([{ external_id: 'A', location: 'SRID=4326;POINT(127 37)', location_precision: 'CITY_APPROX' }]);
    });
  });
});

// [긴급 아키텍처 개편] RAW 레이어 — upsertRows와 동일한 배치/중복 방어 로직을 재사용하지만,
// 유효성 검증으로 행을 드롭하지 않는다는 점(무오염 보존)이 핵심 차이라 별도로 검증한다.
describe('upsertRawIngestData', () => {
  it('행이 없으면 upsert를 호출하지 않고 count 0을 반환한다', async () => {
    const { client, upsert } = makeMockClient();
    const result = await upsertRawIngestData(client, 'SEOUL_YEYAK', []);
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 0 });
  });

  it('source/source_id/raw_payload를 그대로 담아 raw_ingest_data에 upsert한다', async () => {
    const { client, upsert, from } = makeMockClient();
    await upsertRawIngestData(client, 'SEOUL_YEYAK', [{ sourceId: 'S1', payload: { SVCID: 'S1', SVCNM: '행사' } }]);

    expect(from).toHaveBeenCalledWith('raw_ingest_data');
    const [sentRows, options] = upsert.mock.calls[0];
    expect(sentRows).toEqual([
      expect.objectContaining({
        source: 'SEOUL_YEYAK',
        source_id: 'S1',
        raw_payload: { SVCID: 'S1', SVCNM: '행사' },
      }),
    ]);
    expect(options).toEqual({ onConflict: 'source,source_id' });
  });

  it('동일 source_id가 중복되면 마지막 값으로 병합해 upsert를 한 번만 호출한다', async () => {
    const { client, upsert } = makeMockClient();
    const rawRows = [
      { sourceId: 'S1', payload: { v: 1 } },
      { sourceId: 'S2', payload: { v: 2 } },
      { sourceId: 'S1', payload: { v: 3 } },
    ];

    const result = await upsertRawIngestData(client, 'SEOUL_YEYAK', rawRows);

    expect(upsert).toHaveBeenCalledTimes(1);
    const [sentRows] = upsert.mock.calls[0];
    expect(sentRows).toHaveLength(2);
    expect(sentRows.find((r) => r.source_id === 'S1').raw_payload).toEqual({ v: 3 });
    expect(result).toEqual({ count: 2 });
  });

  it('upsert가 에러를 반환하면 에러를 던진다', async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: { message: 'boom' } }));
    const client = { from: vi.fn(() => ({ upsert })) };

    await expect(
      upsertRawIngestData(client, 'SEOUL_YEYAK', [{ sourceId: 'S1', payload: {} }])
    ).rejects.toThrow('raw_ingest_data upsert 실패: boom');
  });
});

describe('fetchRawIngestData', () => {
  it('source로 필터링해 raw_ingest_data 행을 조회한다', async () => {
    const eq = vi.fn(() => ({ range }));
    function range() {
      return Promise.resolve({ data: [{ source_id: 'S1', raw_payload: { v: 1 }, fetched_at: '2026-08-25' }], error: null });
    }
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const client = { from };

    const rows = await fetchRawIngestData(client, 'SEOUL_YEYAK');

    expect(from).toHaveBeenCalledWith('raw_ingest_data');
    expect(eq).toHaveBeenCalledWith('source', 'SEOUL_YEYAK');
    expect(rows).toEqual([{ source_id: 'S1', raw_payload: { v: 1 }, fetched_at: '2026-08-25' }]);
  });

  it('조회 중 에러가 나면 에러를 던진다', async () => {
    const range = () => Promise.resolve({ data: null, error: { message: 'boom' } });
    const eq = vi.fn(() => ({ range }));
    const select = vi.fn(() => ({ eq }));
    const client = { from: vi.fn(() => ({ select })) };

    await expect(fetchRawIngestData(client, 'SEOUL_YEYAK')).rejects.toThrow('raw_ingest_data 조회 실패: boom');
  });
});
