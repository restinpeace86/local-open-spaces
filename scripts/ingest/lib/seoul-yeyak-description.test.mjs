import { describe, expect, it } from 'vitest';
import { extractYeyakDescription } from './seoul-yeyak-description.mjs';

// 실측(2026-08-27, is_active=true seoul_public_reservation 표본)으로 확보한 실제 DTLCONT
// 원문을 그대로 축약해 사용한다(추측 데이터 아님).
const REAL_SAMPLE_DTLCONT =
  '<p>1. 공공시설 예약서비스 이용시 필수 준수사항</p><p>모든 서비스의 이용은 담당 기관의 규정에 따릅니다. 각 시설의 규정 및 허가조건을 반드시 준수하여야 합니다.</p>' +
  '<p>2. 시설예약</p><p>비회원일 경우에는 실명 확인을 통하여 사용하실 수 있습니다.</p>' +
  '<p>3. 상세내용</p><span style="font-family:맑은 고딕;"><strong>○ 시설 개요</strong><br />' +
  '- 위치 : &nbsp;서초구 청두곶길 36, 3층(방배동)<br />' +
  '- 면적 : 165.4㎡<br />' +
  '- 수용인원 : 30명<br /></span>' +
  '<p>4. 주의사항</p><span>○ 모든 대관은 현장 설치 및 철거시간을 포함한 시간입니다.<br />○ 예약취소 : 사용일로부터 3일 전까지<br /></span>';

describe('extractYeyakDescription', () => {
  it('"3. 상세내용"~"4. 주의사항" 구간만 추출하고 앞뒤 정형 안내문/주의사항은 제외한다', () => {
    const result = extractYeyakDescription(REAL_SAMPLE_DTLCONT);

    expect(result).not.toContain('공공시설 예약서비스 이용시 필수 준수사항');
    expect(result).not.toContain('현장 설치 및 철거시간');
    expect(result).toContain('시설 개요');
    expect(result).toContain('서초구 청두곶길 36');
    expect(result).toContain('165.4㎡');
  });

  it('HTML 태그를 제거하고 <br/>는 줄바꿈으로 바꾼다', () => {
    const result = extractYeyakDescription(REAL_SAMPLE_DTLCONT);

    expect(result).not.toMatch(/<[^>]+>/);
    expect(result).toContain('\n');
  });

  it('&nbsp; 등 HTML 엔티티를 사람이 읽을 수 있는 문자로 바꾼다', () => {
    const result = extractYeyakDescription(REAL_SAMPLE_DTLCONT);

    expect(result).not.toContain('&nbsp;');
    expect(result).toContain('위치 :  서초구');
  });

  it('"3. 상세내용" 마커가 없으면 원문 전체를 정리해 그대로 쓴다(추측으로 버리지 않음)', () => {
    const result = extractYeyakDescription('<p>일반 안내 텍스트입니다.</p>');
    expect(result).toBe('일반 안내 텍스트입니다.');
  });

  it('빈 값/문자열이 아닌 값은 null을 반환한다', () => {
    expect(extractYeyakDescription(null)).toBeNull();
    expect(extractYeyakDescription('')).toBeNull();
    expect(extractYeyakDescription(undefined)).toBeNull();
  });

  it('태그만 있고 실제 텍스트가 없으면 null을 반환한다', () => {
    expect(extractYeyakDescription('<p></p><br />')).toBeNull();
  });
});
