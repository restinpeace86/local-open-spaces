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
    expect(result).toEqual({ count: 0 });
  });

  it('기존 행이 없으면(신규) incoming 행을 그대로 upsert한다', async () => {
    const { client, upsert } = makeSafeMergeMockClient({ existingRows: [] });
    const result = await upsertRowsSafeMerge(client, 'events', [{ external_id: 'A', title: '새 행', venue_name: null }]);

    const [sentRows] = upsert.mock.calls[0];
    expect(sentRows).toEqual([{ external_id: 'A', title: '새 행', venue_name: null }]);
    expect(result).toEqual({ count: 1 });
  });

  it('기존 행의 컬럼이 NULL이 아니면 incoming 값으로 덮어쓰지 않고 기존 값을 보존한다', async () => {
    const { client, upsert } = makeSafeMergeMockClient({
      existingRows: [{ external_id: 'A', title: '기존 제목(실데이터)', venue_name: null }],
    });

    await upsertRowsSafeMerge(client, 'events', [
      { external_id: 'A', title: '재가공된 새 제목', venue_name: '재가공된 장소명' },
    ]);

    const [sentRows] = upsert.mock.calls[0];
    // title은 기존에 이미 실데이터가 있었으므로 보존, venue_name은 기존이 NULL이었으므로 새 값으로 채워진다.
    expect(sentRows).toEqual([{ external_id: 'A', title: '기존 제목(실데이터)', venue_name: '재가공된 장소명' }]);
  });

  it('external_id로 select().in()을 호출해 기존 행을 조회한다', async () => {
    const { client, select, inFn, from } = makeSafeMergeMockClient({ existingRows: [] });
    await upsertRowsSafeMerge(client, 'open_spaces', [{ external_id: 'A' }, { external_id: 'B' }]);

    expect(from).toHaveBeenCalledWith('open_spaces');
    expect(select).toHaveBeenCalledWith('*');
    expect(inFn).toHaveBeenCalledWith('external_id', ['A', 'B']);
  });

  it('기존 행 조회 중 에러가 나면 테이블명을 포함한 에러를 던진다', async () => {
    const inFn = vi.fn(() => Promise.resolve({ data: null, error: { message: 'select boom' } }));
    const select = vi.fn(() => ({ in: inFn }));
    const client = { from: vi.fn(() => ({ select, upsert: vi.fn() })) };

    await expect(upsertRowsSafeMerge(client, 'events', [{ external_id: 'A' }])).rejects.toThrow(
      'events 기존 행 조회 실패: select boom'
    );
  });

  it('upsert가 에러를 반환하면 테이블명을 포함한 에러를 던진다', async () => {
    const inFn = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const select = vi.fn(() => ({ in: inFn }));
    const upsert = vi.fn(() => Promise.resolve({ error: { message: 'upsert boom' } }));
    const client = { from: vi.fn(() => ({ select, upsert })) };

    await expect(upsertRowsSafeMerge(client, 'events', [{ external_id: 'A' }])).rejects.toThrow(
      'events upsert 실패: upsert boom'
    );
  });

  it('행이 500건을 넘으면 배치로 나눠 여러 번 조회/upsert를 호출한다', async () => {
    const { client, upsert, inFn } = makeSafeMergeMockClient({ existingRows: [] });
    const rows = Array.from({ length: 1200 }, (_, i) => ({ external_id: `id-${i}` }));

    const result = await upsertRowsSafeMerge(client, 'open_spaces', rows);

    expect(inFn).toHaveBeenCalledTimes(3);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ count: 1200 });
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
