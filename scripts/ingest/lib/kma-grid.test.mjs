import { describe, expect, it } from 'vitest';
import { latLngToKmaGrid } from './kma-grid.mjs';

// [기상청 단기예보 조회서비스 연동 어댑터](2026-09-01 사용자 지시): 기상청 공식 격자변환
// 프로그램/문서에서 흔히 알려진 기준 지점들의 (nx, ny) 값과 정확히 일치하는지로 검증한다
// (임의의 근사값이 아니라 결정적 좌표 변환 공식이라 실측 대신 기준값 비교가 정확한 검증
// 방법이다).
describe('latLngToKmaGrid', () => {
  it('서울시청(37.5665, 126.9780) → (60, 127)', () => {
    expect(latLngToKmaGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 });
  });

  it('부산시청(35.1796, 129.0756) → (98, 76)', () => {
    expect(latLngToKmaGrid(35.1796, 129.0756)).toEqual({ nx: 98, ny: 76 });
  });

  it('제주시(33.4996, 126.5312) → (53, 38)', () => {
    expect(latLngToKmaGrid(33.4996, 126.5312)).toEqual({ nx: 53, ny: 38 });
  });

  it('유효하지 않은 좌표(NaN/문자열)는 예외를 던진다', () => {
    expect(() => latLngToKmaGrid(NaN, 127)).toThrow(/유효하지 않은 좌표/);
    expect(() => latLngToKmaGrid('37.5', 127)).toThrow(/유효하지 않은 좌표/);
  });

  it('같은 5km 격자 안의 서로 다른 좌표는 같은 (nx, ny)로 매핑될 수 있다(격자 그룹핑 근거)', () => {
    const a = latLngToKmaGrid(37.3826, 127.1189);
    const b = latLngToKmaGrid(37.3835, 127.1195);
    expect(a).toEqual(b);
  });
});
