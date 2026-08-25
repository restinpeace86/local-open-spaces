// [긴급 아키텍처 개편] BaseCollectorAdapter의 RAW 레이어 opt-in 동작(run()에서의 raw 보존,
// runServiceTransformFromRaw()의 재가공)을 검증한다. 기존 fetch→transform→upsert 흐름
// 자체는 각 어댑터별 테스트가 이미 간접 검증하므로, 여기서는 이번에 새로 추가된 오케스트레이션
// 로직에 집중한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertRowsMock = vi.fn(() => Promise.resolve({ count: 1 }));
const upsertRowsSafeMergeMock = vi.fn(() => Promise.resolve({ count: 1 }));
const upsertRawIngestDataMock = vi.fn(() => Promise.resolve({ count: 2 }));
const fetchRawIngestDataMock = vi.fn(() => Promise.resolve([]));
const createAdminClientMock = vi.fn(() => ({ from: vi.fn() }));

vi.mock('../lib/supabase-admin.mjs', () => ({
  createAdminClient: () => createAdminClientMock(),
  upsertRows: (...args) => upsertRowsMock(...args),
  upsertRowsSafeMerge: (...args) => upsertRowsSafeMergeMock(...args),
  upsertRawIngestData: (...args) => upsertRawIngestDataMock(...args),
  fetchRawIngestData: (...args) => fetchRawIngestDataMock(...args),
}));

vi.mock('../lib/pipeline-log.mjs', () => ({
  countRawItems: (raw) => (Array.isArray(raw) ? raw.length : null),
  recordPipelineRun: vi.fn(),
}));

const { BaseCollectorAdapter } = await import('./base-collector-adapter.mjs');
const { recordPipelineRun } = await import('../lib/pipeline-log.mjs');

class NoRawAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'NO_RAW', targetTable: 'events' });
  }
  async fetch() {
    return [{ id: 1 }, { id: 2 }];
  }
  transform(raw) {
    return raw.map((item) => ({ external_id: `id-${item.id}` }));
  }
}

class RawOptInAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'RAW_OPT_IN', targetTable: 'events' });
  }
  async fetch() {
    return [{ SVCID: 'S1' }, { SVCID: 'S2' }];
  }
  getRawRows(raw) {
    return raw.map((item) => ({ sourceId: item.SVCID, payload: item }));
  }
  transform(raw) {
    return raw.map((item) => ({ external_id: item.SVCID }));
  }
}

describe('BaseCollectorAdapter.run() — RAW 레이어 opt-in', () => {
  beforeEach(() => {
    upsertRowsMock.mockClear();
    upsertRawIngestDataMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('getRawRows()를 구현하지 않은 기존 어댑터는 RAW 적재를 전혀 호출하지 않는다(하위 호환)', async () => {
    const adapter = new NoRawAdapter();
    await adapter.run();

    expect(upsertRawIngestDataMock).not.toHaveBeenCalled();
    expect(upsertRowsMock).toHaveBeenCalledWith(expect.anything(), 'events', [
      { external_id: 'id-1' },
      { external_id: 'id-2' },
    ]);
  });

  it('getRawRows()를 구현한 어댑터는 transform 이전에 RAW 레이어부터 무오염 보존한다', async () => {
    const adapter = new RawOptInAdapter();
    await adapter.run();

    expect(upsertRawIngestDataMock).toHaveBeenCalledWith(expect.anything(), 'RAW_OPT_IN', [
      { sourceId: 'S1', payload: { SVCID: 'S1' } },
      { sourceId: 'S2', payload: { SVCID: 'S2' } },
    ]);
    expect(upsertRowsMock).toHaveBeenCalledWith(expect.anything(), 'events', [
      { external_id: 'S1' },
      { external_id: 'S2' },
    ]);
  });

  it('dry-run이면 RAW 레이어 적재도 건너뛴다(DB 변경 없음 원칙 유지)', async () => {
    const adapter = new RawOptInAdapter();
    await adapter.run({ dryRun: true });

    expect(upsertRawIngestDataMock).not.toHaveBeenCalled();
    expect(upsertRowsMock).not.toHaveBeenCalled();
  });

  it('RAW 적재 건수를 recordPipelineRun에 rawArchivedCount로 전달한다', async () => {
    const adapter = new RawOptInAdapter();
    await adapter.run();

    // upsertRowsMock은 실제 입력과 무관하게 항상 { count: 1 }을 반환하도록 스텁돼 있다(위
    // 모듈 상단 정의) — 최종 count는 그 스텁값을 그대로 반영한다.
    expect(recordPipelineRun).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKey: 'RAW_OPT_IN', rawArchivedCount: 2, count: 1 })
    );
  });
});

describe('BaseCollectorAdapter.runServiceTransformFromRaw()', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('raw_ingest_data에 저장된 원본이 없으면 재수집 없이 0건으로 종료한다', async () => {
    fetchRawIngestDataMock.mockResolvedValueOnce([]);
    const adapter = new RawOptInAdapter();

    const result = await adapter.runServiceTransformFromRaw();

    expect(result).toEqual({ count: 0, upserted: false });
    expect(upsertRowsSafeMergeMock).not.toHaveBeenCalled();
  });

  it('raw_ingest_data에서 읽은 payload를 transform()에 그대로 넣어 재가공하고 upsertRowsSafeMerge로 재적재한다', async () => {
    fetchRawIngestDataMock.mockResolvedValueOnce([
      { source_id: 'S1', raw_payload: { SVCID: 'S1' } },
      { source_id: 'S2', raw_payload: { SVCID: 'S2' } },
    ]);
    const adapter = new RawOptInAdapter();

    const result = await adapter.runServiceTransformFromRaw();

    // upsertRows()가 아니라 upsertRowsSafeMerge()를 써야 한다 — RAW 재가공 결과는 기존 실데이터를
    // 덮어쓰지 않고 기존 NULL 컬럼만 채우는 Safe UPSERT여야 하기 때문이다.
    expect(upsertRowsMock).not.toHaveBeenCalled();
    expect(upsertRowsSafeMergeMock).toHaveBeenCalledWith(expect.anything(), 'events', [
      { external_id: 'S1' },
      { external_id: 'S2' },
    ]);
    // upsertRowsSafeMergeMock은 항상 { count: 1 }을 반환하도록 스텁돼 있다 — 최종 count는 그 값이다.
    expect(result).toEqual({ count: 1, upserted: true });
  });

  it('dry-run이면 재적재 없이 결과만 미리 보여준다', async () => {
    fetchRawIngestDataMock.mockResolvedValueOnce([{ source_id: 'S1', raw_payload: { SVCID: 'S1' } }]);
    const adapter = new RawOptInAdapter();

    const result = await adapter.runServiceTransformFromRaw({ dryRun: true });

    expect(upsertRowsSafeMergeMock).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 1, upserted: false });
  });
});

// Decision 017(2026-08-25): targetTable: 'multi' — 하나의 원본이 open_spaces/events 두 테이블로
// 나뉘어 적재되는 어댑터(예: 서울시 예약 통합 API)의 오케스트레이션을 검증한다.
class MultiTableAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'MULTI_SOURCE', targetTable: 'multi' });
  }
  async fetch() {
    return [
      { SVCID: 'S1', MAXCLASSNM: '체육시설' },
      { SVCID: 'S2', MAXCLASSNM: '문화체험' },
      { SVCID: 'S3', MAXCLASSNM: '진료복지' },
    ];
  }
  transformSplit(raw) {
    const openSpaces = raw.filter((item) => item.MAXCLASSNM === '체육시설').map((item) => ({ external_id: item.SVCID }));
    const events = raw.filter((item) => item.MAXCLASSNM === '문화체험').map((item) => ({ external_id: item.SVCID }));
    return { open_spaces: openSpaces, events, errorCounts: { DATE_PARSE_FAIL: 1 }, excludedCount: 1 };
  }
}

class MultiTableSpacesOnlyAdapter extends BaseCollectorAdapter {
  constructor() {
    super({ sourceKey: 'MULTI_SPACES_ONLY', targetTable: 'multi' });
  }
  async fetch() {
    return [{ SVCID: 'S1' }];
  }
  transformSplit(raw) {
    return { open_spaces: raw.map((item) => ({ external_id: item.SVCID })), events: [], errorCounts: {}, excludedCount: 0 };
  }
}

describe("BaseCollectorAdapter — targetTable: 'multi' (Decision 017 다중 테이블 분리 적재)", () => {
  beforeEach(() => {
    upsertRowsSafeMergeMock.mockClear();
    upsertRowsSafeMergeMock.mockImplementation(() =>
      Promise.resolve({ count: 1, duplicateWithinBatch: 0, mergedWithExisting: 0 })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("targetTable: 'multi'로 생성해도 에러를 던지지 않는다(생성자 검증 완화)", () => {
    expect(() => new MultiTableAdapter()).not.toThrow();
  });

  it('transformSplit()이 나눈 open_spaces/events 각각을 upsertRowsSafeMerge로 별도 적재한다', async () => {
    const adapter = new MultiTableAdapter();
    await adapter.run();

    expect(upsertRowsSafeMergeMock).toHaveBeenCalledWith(expect.anything(), 'open_spaces', [{ external_id: 'S1' }]);
    expect(upsertRowsSafeMergeMock).toHaveBeenCalledWith(expect.anything(), 'events', [{ external_id: 'S2' }]);
    expect(upsertRowsMock).not.toHaveBeenCalled();
  });

  it('한쪽 테이블이 비어있으면 그 테이블은 upsert 호출을 아예 스킵한다', async () => {
    const adapter = new MultiTableSpacesOnlyAdapter();
    await adapter.run();

    expect(upsertRowsSafeMergeMock).toHaveBeenCalledTimes(1);
    expect(upsertRowsSafeMergeMock).toHaveBeenCalledWith(expect.anything(), 'open_spaces', [{ external_id: 'S1' }]);
  });

  it('dry-run이면 upsert 없이 두 테이블 건수 합계만 반환한다', async () => {
    const adapter = new MultiTableAdapter();
    const result = await adapter.run({ dryRun: true });

    expect(upsertRowsSafeMergeMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      count: 2,
      upserted: false,
      perTable: { open_spaces: 1, events: 1 },
      errorCounts: { DATE_PARSE_FAIL: 1 },
      excludedCount: 1,
    });
  });

  it('recordPipelineRun에 테이블별 건수/중복·병합 건수/범위제외/에러 상세를 detail로 전달한다', async () => {
    upsertRowsSafeMergeMock.mockImplementation((_client, table) =>
      Promise.resolve(
        table === 'open_spaces'
          ? { count: 1, duplicateWithinBatch: 2, mergedWithExisting: 5 }
          : { count: 1, duplicateWithinBatch: 3, mergedWithExisting: 10 }
      )
    );
    const adapter = new MultiTableAdapter();
    await adapter.run();

    expect(recordPipelineRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKey: 'MULTI_SOURCE',
        count: 2,
        status: 'OK',
        detail: {
          perTable: {
            open_spaces: { fetched: 1, inserted: 1, duplicateWithinBatch: 2, mergedWithExisting: 5 },
            events: { fetched: 1, inserted: 1, duplicateWithinBatch: 3, mergedWithExisting: 10 },
          },
          excludedCount: 1,
          errorCounts: { DATE_PARSE_FAIL: 1 },
        },
      })
    );
  });

  it("runServiceTransformFromRaw()는 'multi' 모드를 아직 지원하지 않아 명시적으로 에러를 던진다", async () => {
    const adapter = new MultiTableAdapter();
    await expect(adapter.runServiceTransformFromRaw()).rejects.toThrow("targetTable 'multi'");
  });
});
