// [긴급 아키텍처 개편] BaseCollectorAdapter의 RAW 레이어 opt-in 동작(run()에서의 raw 보존,
// runServiceTransformFromRaw()의 재가공)을 검증한다. 기존 fetch→transform→upsert 흐름
// 자체는 각 어댑터별 테스트가 이미 간접 검증하므로, 여기서는 이번에 새로 추가된 오케스트레이션
// 로직에 집중한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertRowsSafeMergeMock = vi.fn(() => Promise.resolve({ count: 1 }));
const upsertRawIngestDataMock = vi.fn(() => Promise.resolve({ count: 2 }));
const fetchRawIngestDataMock = vi.fn(() => Promise.resolve([]));
const createAdminClientMock = vi.fn(() => ({ from: vi.fn() }));

vi.mock('../lib/supabase-admin.mjs', () => ({
  createAdminClient: () => createAdminClientMock(),
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
    upsertRowsSafeMergeMock.mockClear();
    upsertRawIngestDataMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('getRawRows()를 구현하지 않은 기존 어댑터는 RAW 적재를 전혀 호출하지 않는다(하위 호환)', async () => {
    const adapter = new NoRawAdapter();
    await adapter.run();

    expect(upsertRawIngestDataMock).not.toHaveBeenCalled();
    expect(upsertRowsSafeMergeMock).toHaveBeenCalledWith(expect.anything(), 'events', [
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
    expect(upsertRowsSafeMergeMock).toHaveBeenCalledWith(expect.anything(), 'events', [
      { external_id: 'S1' },
      { external_id: 'S2' },
    ]);
  });

  it('dry-run이면 RAW 레이어 적재도 건너뛴다(DB 변경 없음 원칙 유지)', async () => {
    const adapter = new RawOptInAdapter();
    await adapter.run({ dryRun: true });

    expect(upsertRawIngestDataMock).not.toHaveBeenCalled();
    expect(upsertRowsSafeMergeMock).not.toHaveBeenCalled();
  });

  it('RAW 적재 건수를 recordPipelineRun에 rawArchivedCount로 전달한다', async () => {
    const adapter = new RawOptInAdapter();
    await adapter.run();

    // upsertRowsSafeMergeMock은 실제 입력과 무관하게 항상 { count: 1 }을 반환하도록 스텁돼
    // 있다(위 모듈 상단 정의) — 최종 count는 그 스텁값을 그대로 반영한다.
    expect(recordPipelineRun).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKey: 'RAW_OPT_IN', rawArchivedCount: 2, count: 1 })
    );
  });

  // [배치 자동화 및 로깅 체계 확정](2026-08-25): run-daily.mjs/run-monthly.mjs 배치 오케스트레이터가
  // docs/pipeline-log.md의 배치 리포트 표를 만들 때 이 반환값(rawCount/rawArchivedCount/
  // safeMergeCount/errorCount)을 그대로 쓴다 — 반환 형태 자체를 직접 검증한다.
  it('성공 시 배치 리포트에 필요한 rawCount/rawArchivedCount/safeMergeCount/errorCount를 함께 반환한다', async () => {
    upsertRowsSafeMergeMock.mockResolvedValueOnce({ count: 2, duplicateWithinBatch: 1, mergedWithExisting: 3 });
    const adapter = new RawOptInAdapter();

    const result = await adapter.run();

    expect(result).toEqual({
      sourceKey: 'RAW_OPT_IN',
      targetTable: 'events',
      source: null,
      count: 2,
      upserted: true,
      rawCount: 2,
      rawArchivedCount: 2,
      safeMergeCount: 4, // duplicateWithinBatch(1) + mergedWithExisting(3)
      errorCount: 0, // rawCount(2) - count(2)
    });
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
      sourceKey: 'MULTI_SOURCE',
      targetTable: 'multi',
      source: null,
      count: 2,
      upserted: false,
      rawCount: 3,
      rawArchivedCount: undefined,
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

  it('성공 시 배치 리포트에 필요한 safeMergeCount/errorCount를 두 테이블 합산으로 반환한다', async () => {
    upsertRowsSafeMergeMock.mockImplementation((_client, table) =>
      Promise.resolve(
        table === 'open_spaces'
          ? { count: 1, duplicateWithinBatch: 2, mergedWithExisting: 5 }
          : { count: 1, duplicateWithinBatch: 3, mergedWithExisting: 10 }
      )
    );
    const adapter = new MultiTableAdapter();

    const result = await adapter.run();

    expect(result).toMatchObject({
      sourceKey: 'MULTI_SOURCE',
      targetTable: 'multi',
      count: 2,
      rawCount: 3,
      safeMergeCount: 20, // (2+5) + (3+10)
      // MultiTableAdapter의 3개 raw 항목(S1/S2/S3)은 open_spaces 1건 + events 1건 + 진료복지
      // 제외 1건으로 전부 설명되므로(1+1+1=rawCount 3) 실제로는 드롭이 0건이다.
      // errorCounts({DATE_PARSE_FAIL:1})는 세부 breakdown용 진단 정보일 뿐, "적재도 안 되고
      // 제외도 아닌" 진짜 드롭 여부는 rawCount와 실제 출력 배열 길이를 직접 대조해 계산한다
      // (아래 "실제로 드롭된 raw 항목이 있으면..." 테스트 참고 — 실측으로 발견한 버그 수정).
      errorCount: 0,
    });
  });

  // [배치 자동화 및 로깅 체계 확정](2026-08-25) 실측 중 발견해 수정한 버그: errorCounts를
  // 그대로 합산하면 "적재는 됐지만 이상 신호만 남긴" 항목(예: 실제 SeoulYeyakAdapter의
  // COORDINATE_PARSE_FAIL — 좌표 파싱 실패해도 UNKNOWN 정밀도로 행은 정상 적재됨)까지
  // "드롭"으로 잘못 집계돼, 실제 배치 실행에서 "수신 vs 적재+에러+제외" 검증식이 음수로
  // 어긋나는 것을 확인했다. errorCount는 이제 rawCount에서 실제 출력 배열 길이와 excludedCount를
  // 뺀 값(진짜로 어디에도 안 들어간 raw 항목 수)으로 계산한다.
  class MultiTablePartialDropAdapter extends BaseCollectorAdapter {
    constructor() {
      super({ sourceKey: 'MULTI_PARTIAL_DROP', targetTable: 'multi' });
    }
    async fetch() {
      // S1→open_spaces, S2→events, S3은 errorCounts에 잡히지만 어느 배열에도 안 들어감(진짜 드롭).
      return [{ SVCID: 'S1' }, { SVCID: 'S2' }, { SVCID: 'S3' }];
    }
    transformSplit(raw) {
      return {
        open_spaces: [{ external_id: raw[0].SVCID }],
        events: [{ external_id: raw[1].SVCID }],
        errorCounts: { DATE_PARSE_FAIL: 1 }, // S3가 여기 집계되지만 어느 출력 배열에도 없음
        excludedCount: 0,
      };
    }
  }

  it('실제로 드롭된 raw 항목이 있으면(어느 테이블에도 안 들어가고 제외 대상도 아님) errorCount에 정확히 반영한다', async () => {
    const adapter = new MultiTablePartialDropAdapter();

    const result = await adapter.run();

    // rawCount(3) - open_spaces(1) - events(1) - excludedCount(0) = 1건 진짜 드롭.
    expect(result.errorCount).toBe(1);
  });

  it("runServiceTransformFromRaw()는 'multi' 모드를 아직 지원하지 않아 명시적으로 에러를 던진다", async () => {
    const adapter = new MultiTableAdapter();
    await expect(adapter.runServiceTransformFromRaw()).rejects.toThrow("targetTable 'multi'");
  });
});
