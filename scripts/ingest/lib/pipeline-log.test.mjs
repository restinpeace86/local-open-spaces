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
});
