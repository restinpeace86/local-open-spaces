// [긴급 아키텍처 개편] recordPipelineRun이 RAW 적재 건수를 새 칸으로 별도 기록하는지 검증.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { recordPipelineRun } from './pipeline-log.mjs';

const HEADER = [
  '# ETL Data Ingestion & Pipeline Health Log',
  '',
  '| 실행 일시 | 수집 권역 | RAW 적재 건수 | Service 적재 건수 | 파싱 에러 | 상태 | 비고 |',
  '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
  '',
].join('\n');

describe('recordPipelineRun', () => {
  let writtenContent;

  beforeEach(() => {
    writtenContent = HEADER;
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => writtenContent);
    vi.spyOn(fs, 'writeFileSync').mockImplementation((_path, content) => {
      writtenContent = content;
    });
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_path, content) => {
      writtenContent += content;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rawArchivedCount를 넘기면 RAW 적재 건수 칸에 그 값을 기록한다', () => {
    recordPipelineRun({ sourceKey: 'SEOUL_YEYAK', rawCount: 100, rawArchivedCount: 100, count: 95, status: 'OK' });
    expect(writtenContent).toContain('| SEOUL_YEYAK | 100 | 95 | 5 | ✅ [OK] |');
  });

  it('rawArchivedCount를 넘기지 않으면(RAW 레이어 미적용 어댑터) 그 칸에 "-"를 기록한다', () => {
    recordPipelineRun({ sourceKey: 'GG_CULTURE_EVENTS', rawCount: 3000, count: 2955, status: 'OK' });
    expect(writtenContent).toContain('| GG_CULTURE_EVENTS | - | 2955 |');
  });

  it('로그 파일이 없으면 아무것도 하지 않는다', () => {
    fs.existsSync.mockReturnValue(false);
    recordPipelineRun({ sourceKey: 'SEOUL_YEYAK', rawCount: 100, rawArchivedCount: 100, count: 95, status: 'OK' });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });

  // Decision 017(2026-08-25) 8항: 다중 테이블 어댑터는 detail을 넘겨 테이블별 건수/중복·병합
  // 건수/원인별 에러 건수를 접이식 상세 블록으로 남긴다.
  describe('detail (Decision 017 정밀 리포트)', () => {
    it('detail을 넘기면 표 아래에 <details> 상세 블록을 추가한다', () => {
      recordPipelineRun({
        sourceKey: 'SEOUL_YEYAK',
        rawCount: 500,
        rawArchivedCount: 500,
        count: 413,
        status: 'OK',
        detail: {
          perTable: {
            open_spaces: { fetched: 120, inserted: 118, duplicateWithinBatch: 2, mergedWithExisting: 5 },
            events: { fetched: 300, inserted: 295, duplicateWithinBatch: 3, mergedWithExisting: 10 },
          },
          excludedCount: 45,
          errorCounts: { DATE_PARSE_FAIL: 2, MISSING_SVCID: 0 },
        },
      });

      expect(writtenContent).toContain('<details>');
      expect(writtenContent).toContain('SEOUL_YEYAK 상세 리포트');
      expect(writtenContent).toContain('| open_spaces | 120 | 118 | 2 | 5 |');
      expect(writtenContent).toContain('| events | 300 | 295 | 3 | 10 |');
      expect(writtenContent).toContain('**범위 제외**: 45건');
      expect(writtenContent).toContain('| DATE_PARSE_FAIL | 2 |');
      // 0건인 에러 유형은 상세 블록에서 생략한다(노이즈 방지).
      expect(writtenContent).not.toContain('MISSING_SVCID');
      expect(writtenContent).toContain('</details>');
    });

    it('detail을 넘기지 않으면(기존 24개 어댑터) 상세 블록이 전혀 추가되지 않는다', () => {
      recordPipelineRun({ sourceKey: 'GG_CULTURE_EVENTS', rawCount: 3000, count: 2955, status: 'OK' });
      expect(writtenContent).not.toContain('<details>');
    });
  });
});
