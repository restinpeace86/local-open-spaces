// [파이프라인 로그 DB화](2026-09-15 사용자 지시, implementation/todo.md [개선사항 3]):
// recordBatchRun이 더 이상 docs/pipeline-log.md에 마크다운을 append하지 않고 pipeline_logs
// 테이블에 소스(에이전트)당 1행씩 insert하는지 검증한다.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase-admin.mjs', () => ({
  createAdminClient: vi.fn(),
}));

const { recordBatchRun } = await import('./batch-log.mjs');
const { createAdminClient } = await import('./supabase-admin.mjs');

function makeClient() {
  const insertMock = vi.fn().mockResolvedValue({ error: null });
  const client = { from: vi.fn(() => ({ insert: insertMock })) };
  return { client, insertMock };
}

describe('recordBatchRun', () => {
  afterEach(() => vi.clearAllMocks());

  it('소스별로 pipeline_logs에 1행씩 insert한다', async () => {
    const { client, insertMock } = makeClient();
    createAdminClient.mockReturnValue(client);

    await recordBatchRun({
      batchName: 'Daily Events Batch',
      results: [
        {
          sourceKey: 'SEOUL_YEYAK',
          source: 'seoul_public_reservation',
          targetTable: 'multi',
          rawCount: 2906,
          perTable: { open_spaces: 1282, events: 1595 },
          safeMergeCount: 1407,
          errorCount: 15,
          excludedCount: 29,
        },
      ],
    });

    expect(client.from).toHaveBeenCalledWith('pipeline_logs');
    expect(insertMock).toHaveBeenCalledTimes(1);
    const rows = insertMock.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agent_name: 'SEOUL_YEYAK',
      status: 'OK',
      error_message: null,
      period: 'daily',
    });
    expect(rows[0].meta_data).toMatchObject({
      rawCount: 2906,
      eventsCount: 1595,
      openSpacesCount: 1282,
      safeMergeCount: 1407,
      errorCount: 15,
      excludedCount: 29,
    });
  });

  it('batchName에 Monthly가 포함되면 period를 monthly로 기록한다', async () => {
    const { client, insertMock } = makeClient();
    createAdminClient.mockReturnValue(client);

    await recordBatchRun({
      batchName: 'Monthly Spaces Batch',
      results: [{ sourceKey: 'CITY_PARK', source: 'city_park', targetTable: 'open_spaces', rawCount: 100, count: 100, errorCount: 0 }],
    });

    expect(insertMock.mock.calls[0][0][0]).toMatchObject({ agent_name: 'CITY_PARK', period: 'monthly' });
  });

  it('실행 자체가 실패한 소스는 FAILED 상태와 사유를 error_message에 기록한다', async () => {
    const { client, insertMock } = makeClient();
    createAdminClient.mockReturnValue(client);

    await recordBatchRun({
      batchName: 'Weekly Spaces Batch',
      results: [{ failed: true, sourceKey: 'GO_CAMPING', source: 'tourapi_4.0', note: 'HTTP 500' }],
    });

    expect(insertMock.mock.calls[0][0][0]).toMatchObject({
      agent_name: 'GO_CAMPING',
      status: 'FAILED',
      error_message: 'HTTP 500',
    });
  });

  it('targetTable이 multi인 소스는 events/open_spaces 건수를 perTable 기준으로 나눠 meta_data에 기록한다', async () => {
    const { client, insertMock } = makeClient();
    createAdminClient.mockReturnValue(client);

    await recordBatchRun({
      batchName: 'Daily Events Batch',
      results: [
        {
          sourceKey: 'SEOUL_YEYAK',
          source: 'seoul_public_reservation',
          targetTable: 'multi',
          rawCount: 100,
          perTable: { open_spaces: 40, events: 55 },
          errorCount: 5,
        },
      ],
    });

    expect(insertMock.mock.calls[0][0][0].meta_data).toMatchObject({ eventsCount: 55, openSpacesCount: 40 });
  });

  // [SEOUL_YEYAK 등 targetTable:'multi' 부분 실패] base-collector-adapter.mjs가
  // hasPartialFailure:true를 반환하면 failed:true가 아니어도(성공한 테이블 건수는 계속
  // 보고해야 하므로) FAILED로 기록해야 한다.
  it('hasPartialFailure가 true면 count가 있어도 FAILED로 기록한다', async () => {
    const { client, insertMock } = makeClient();
    createAdminClient.mockReturnValue(client);

    await recordBatchRun({
      batchName: 'Daily Events Batch',
      results: [
        {
          sourceKey: 'SEOUL_YEYAK',
          source: 'seoul_public_reservation',
          targetTable: 'multi',
          count: 40,
          perTable: { open_spaces: 40, events: 0 },
          hasPartialFailure: true,
          note: '테이블별 부분 실패: events(timeout)',
        },
      ],
    });

    expect(insertMock.mock.calls[0][0][0]).toMatchObject({ status: 'FAILED', error_message: '테이블별 부분 실패: events(timeout)' });
  });

  it('등록되지 않은 sourceKey여도 description은 null로, 나머지는 정상 기록한다', async () => {
    const { client, insertMock } = makeClient();
    createAdminClient.mockReturnValue(client);

    await recordBatchRun({
      batchName: 'Daily Events Batch',
      results: [{ sourceKey: 'UNKNOWN_FUTURE_SOURCE', targetTable: 'events', count: 1, errorCount: 0 }],
    });

    expect(insertMock.mock.calls[0][0][0]).toMatchObject({ agent_name: 'UNKNOWN_FUTURE_SOURCE', description: null });
  });

  it('results가 비어 있으면 insert를 호출하지 않는다', async () => {
    const { client, insertMock } = makeClient();
    createAdminClient.mockReturnValue(client);

    await recordBatchRun({ batchName: 'Daily Events Batch', results: [] });

    expect(insertMock).not.toHaveBeenCalled();
  });

  it('DB insert가 에러를 반환해도 예외를 던지지 않는다(무중단 원칙)', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: { message: 'insert failed' } });
    createAdminClient.mockReturnValue({ from: vi.fn(() => ({ insert: insertMock })) });

    await expect(
      recordBatchRun({ batchName: 'Daily Events Batch', results: [{ sourceKey: 'CITY_PARK', count: 1, errorCount: 0 }] })
    ).resolves.toBeUndefined();
  });
});
