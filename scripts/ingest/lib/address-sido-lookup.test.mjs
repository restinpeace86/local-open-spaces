import { describe, expect, it } from 'vitest';
import { extractSidoName, SIDO_NAMES } from './address-sido-lookup.mjs';

describe('SIDO_NAMES', () => {
  it('공식 17개 시/도를 정확히 담는다', () => {
    expect(SIDO_NAMES).toHaveLength(17);
    expect(new Set(SIDO_NAMES).size).toBe(17);
  });
});

describe('extractSidoName', () => {
  it('정식 명칭에서 약칭을 추출한다', () => {
    expect(extractSidoName('서울특별시 강남구 테헤란로 1')).toBe('서울');
    expect(extractSidoName('경기도 성남시 분당구 대왕판교로 1')).toBe('경기');
    expect(extractSidoName('제주특별자치도 제주시 신성로13길 21')).toBe('제주');
    expect(extractSidoName('강원특별자치도 강릉시 모산로224번길 3')).toBe('강원');
    expect(extractSidoName('전북특별자치도 전주시 완산구')).toBe('전북');
  });

  it('실측 관측된 약칭/구형 명칭도 처리한다', () => {
    expect(extractSidoName('경기 양주시 장흥면 일영리 382-2')).toBe('경기');
    expect(extractSidoName('충남 청양군 화성면 무한로 88')).toBe('충남');
    expect(extractSidoName('강원도 춘천시 모수물길 60')).toBe('강원');
    expect(extractSidoName('제주특별자치시 제주시 어딘가')).toBe('제주'); // 실측 오탈자성 변형(19건)
  });

  it('경기도/경상남도/경상북도 두 글자 약칭을 정확히 구분한다', () => {
    expect(extractSidoName('경남 밀양시 산내면')).toBe('경남');
    expect(extractSidoName('경북 경주시 산내면')).toBe('경북');
  });

  it('"광주시"는 경기도 광주시/광주광역시 약칭 중 판별 불가능해 null을 반환한다', () => {
    expect(extractSidoName('광주시 광산구 어딘가')).toBeNull();
  });

  it('17개 표준 시/도 어디에도 대응되지 않는 표기는 추측하지 않고 null을 반환한다', () => {
    expect(extractSidoName('전남광주통합특별시 고흥군 점암면 팔봉길 21')).toBeNull();
  });

  it('빈 주소/null은 null을 반환한다', () => {
    expect(extractSidoName(null)).toBeNull();
    expect(extractSidoName('')).toBeNull();
  });
});
