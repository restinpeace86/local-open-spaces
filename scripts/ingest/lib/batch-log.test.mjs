// [배치 자동화 및 로깅 체계 확정](2026-08-25): recordBatchRun이 사용자 지정 포맷대로
// docs/pipeline-log.md에 배치 리포트를 추가(Append)하는지, 드롭 검증 문구가 정확한지 검증한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { recordBatchRun } from './batch-log.mjs';

const HEADER = ['# ETL Data Ingestion & Pipeline Health Log', '', '| 실행 일시 | ... |', ''].join('\n');

describe('recordBatchRun', () => {
  let writtenContent;

  beforeEach(() => {
    writtenContent = HEADER;
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_path, content) => {
      writtenContent += content;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('배치 헤더와 표를 사용자 지정 포맷대로 추가한다', () => {
    recordBatchRun({
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

    expect(writtenContent).toContain('## [');
    expect(writtenContent).toContain('] [Daily Events Batch] Ingestion Log');
    expect(writtenContent).toContain(
      '| API 출처 식별자 (`source`) | RAW 수신 건수 | events 적재 건수 | open_spaces 적재 건수 | Safe Merge 건수 | 에러 건수 | 비고 |'
    );
    expect(writtenContent).toContain('| seoul_public_reservation | 2906 | 1595 | 1282 | 1407 | 15 |');
  });

  it('드롭 0건이면 검증 문구에 드롭 0건 확인을 명시한다', () => {
    recordBatchRun({
      batchName: 'Weekly Spaces Batch',
      results: [
        {
          sourceKey: 'CITY_PARK',
          source: 'city_park',
          targetTable: 'open_spaces',
          rawCount: 100,
          count: 100,
          safeMergeCount: 0,
          errorCount: 0,
        },
      ],
    });

    expect(writtenContent).toContain('드롭 0건 확인');
  });

  it('드롭이 발견되면(수신-적재-에러-제외 합이 안 맞으면) 드롭 건수를 명시한다', () => {
    recordBatchRun({
      batchName: 'Weekly Spaces Batch',
      results: [
        {
          sourceKey: 'CITY_PARK',
          source: 'city_park',
          targetTable: 'open_spaces',
          rawCount: 100,
          count: 90,
          safeMergeCount: 0,
          errorCount: 5, // 100 - 90(적재) - 5(에러) - 0(제외) = 5건 미상
        },
      ],
    });

    expect(writtenContent).toContain('드롭 5건 발견');
  });

  it('실행 자체가 실패한 소스는 실패로 표시하고 무중단으로 나머지 소스를 표에 남긴다', () => {
    recordBatchRun({
      batchName: 'Weekly Spaces Batch',
      results: [
        { failed: true, sourceKey: 'GO_CAMPING', source: 'tourapi_4.0', note: 'HTTP 500' },
        { sourceKey: 'CITY_PARK', source: 'city_park', targetTable: 'open_spaces', rawCount: 100, count: 100, errorCount: 0 },
      ],
    });

    expect(writtenContent).toContain('❌ 실행 실패: HTTP 500');
    expect(writtenContent).toContain('| city_park | 100 | 0 | 100 | 0 | 0 |');
  });

  it('multi 테이블 소스는 events/open_spaces 적재 건수를 perTable 기준으로 나눠 기록한다', () => {
    recordBatchRun({
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

    expect(writtenContent).toContain('| seoul_public_reservation | 100 | 55 | 40 |');
  });

  it('excludeFromVerification 행은 표에는 남지만 드롭 검증 합계에서는 제외한다(후처리 단계용)', () => {
    recordBatchRun({
      batchName: 'Daily Events Batch',
      results: [
        { sourceKey: 'GG_CULTURE_EVENTS', source: 'gg_public', targetTable: 'events', rawCount: 100, count: 100, errorCount: 0 },
        {
          sourceKey: 'GG_CULTURE_LOCATION_ENRICHMENT',
          source: 'gg_public',
          targetTable: 'events',
          rawCount: 50,
          count: 50,
          errorCount: 0,
          excludeFromVerification: true,
          note: '좌표 정밀도 보강 후처리(신규 적재 아님)',
        },
      ],
    });

    // 검증 합계는 첫 행(100건)만 반영해야 한다 — 두 번째 행(50건)까지 더해지면 왜곡된다.
    expect(writtenContent).toContain('전체 RAW 수신 100건');
    expect(writtenContent).toContain('드롭 0건 확인');
    expect(writtenContent).toContain('좌표 정밀도 보강 후처리');
  });

  it('로그 파일이 없으면 아무것도 하지 않는다', () => {
    fs.existsSync.mockReturnValue(false);
    recordBatchRun({ batchName: 'Daily Events Batch', results: [] });
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });
});
