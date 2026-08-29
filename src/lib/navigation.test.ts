import { describe, expect, it } from 'vitest';
import { buildNaverMapDirectionsUrl, buildNaverPlaceSearchUrl } from './navigation';

describe('buildNaverMapDirectionsUrl (Task 9-5-1: 네이버 지도 길안내 출발지 자동 매핑)', () => {
  it('출발지(origin)가 있으면 slat/slng/sname을 "내 위치"로 자동 채운다', () => {
    const url = buildNaverMapDirectionsUrl(
      { name: '율동공원', lat: 37.38, lng: 127.12 },
      { lat: 37.4, lng: 127.1 },
      'https://example.com'
    );

    expect(url).toContain('nmap://route/car?');
    expect(url).toContain('slat=37.4');
    expect(url).toContain('slng=127.1');
    expect(url).toContain('sname=%EB%82%B4+%EC%9C%84%EC%B9%98'); // "내 위치" URL 인코딩
    expect(url).toContain('dlat=37.38');
    expect(url).toContain('dlng=127.12');
    expect(url).toContain(`dname=${encodeURIComponent('율동공원')}`);
    expect(url).toContain('appname=https%3A%2F%2Fexample.com');
  });

  it('출발지가 없으면(origin 미전달) slat/slng/sname을 아예 넣지 않는다(네이버 지도가 자체 GPS로 대체)', () => {
    const url = buildNaverMapDirectionsUrl({ name: '율동공원', lat: 37.38, lng: 127.12 }, null, 'https://example.com');

    expect(url).not.toContain('slat=');
    expect(url).not.toContain('slng=');
    expect(url).not.toContain('sname=');
  });

  it('appname을 명시하지 않으면 호출 시점의 window.location.origin을 사용한다', () => {
    const url = buildNaverMapDirectionsUrl({ name: '율동공원', lat: 37.38, lng: 127.12 });
    expect(url).toContain(`appname=${encodeURIComponent(window.location.origin)}`);
  });
});

// [농장 및 전체 스팟 상세 바텀시트 네이버 딥링크 연동](2026-08-29 사용자 지시)
describe('buildNaverPlaceSearchUrl', () => {
  it('이름과 주소를 조합해 검색어(query)로 넘긴다(동명 장소 지역 구분을 위해)', () => {
    const url = buildNaverPlaceSearchUrl(
      { name: '버섯구지마을', address: '경기도 가평군 하면 대보간선로 173' },
      'https://example.com'
    );

    expect(url).toContain('nmap://search?');
    const query = new URL(url.replace('nmap://', 'https://x/')).searchParams.get('query');
    expect(query).toBe('버섯구지마을 경기도 가평군 하면 대보간선로 173');
    expect(url).toContain('appname=https%3A%2F%2Fexample.com');
  });

  it('주소가 없으면 이름만으로 검색어를 만든다', () => {
    const url = buildNaverPlaceSearchUrl({ name: '버섯구지마을', address: null }, 'https://example.com');

    const query = new URL(url.replace('nmap://', 'https://x/')).searchParams.get('query');
    expect(query).toBe('버섯구지마을');
  });

  it('appname을 명시하지 않으면 호출 시점의 window.location.origin을 사용한다', () => {
    const url = buildNaverPlaceSearchUrl({ name: '버섯구지마을', address: null });
    expect(url).toContain(`appname=${encodeURIComponent(window.location.origin)}`);
  });
});
