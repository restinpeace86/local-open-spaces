import { describe, expect, it } from 'vitest';
import { toUnifiedEmartRow, toUnifiedLottemartRow } from './culture-club-unified-row.mjs';

describe('toUnifiedEmartRow', () => {
  it('이마트 행을 통합 테이블 행으로 변환한다', () => {
    const row = {
      class_id: 'E1',
      class_title: '테스트 강좌',
      store_code: '964',
      store_name: '제천',
      class_fee: 2000,
      filter_status: '접수중',
      normalized_status: 'OPEN',
      register_start_at: '2026-08-10T10:00:00+09:00',
      is_excluded: false,
      channel_online: true,
      semester_year: '2026',
    };
    const result = toUnifiedEmartRow(row);

    expect(result.brand).toBe('emart');
    expect(result.source_class_id).toBe('E1');
    expect(result.raw_status).toBe('접수중');
    expect(result.normalized_status).toBe('OPEN');
    expect(result.register_start_at).toBe('2026-08-10T10:00:00+09:00');
    expect(result.raw_extra.channel_online).toBe(true);
    expect(result.raw_extra.semester_year).toBe('2026');
  });

  it('collected_at 등 타임스탬프가 원본에 없으면 결과 객체에 키 자체가 존재하지 않는다(대량 upsert에서 명시적 null로 보내져 NOT NULL을 위반하는 걸 막음 — 실측으로 발견)', () => {
    const result = toUnifiedEmartRow({ class_id: 'E1', class_title: 'T', filter_status: '접수중', normalized_status: 'OPEN' });
    expect('collected_at' in result).toBe(false);
    expect('created_at' in result).toBe(false);
    expect('updated_at' in result).toBe(false);
    expect('detail_fetched_at' in result).toBe(false);
  });
});

describe('toUnifiedLottemartRow', () => {
  it('롯데마트 행을 통합 테이블 행으로 변환하고 register_start_at은 항상 null이다', () => {
    const row = {
      class_id: 'L1',
      class_title: '테스트 강좌',
      store_code: '455',
      store_name: '고양점',
      registration_status: '바로신청',
      normalized_status: 'OPEN',
      is_excluded: false,
      target_code: '4',
      semester_code: '202603',
    };
    const result = toUnifiedLottemartRow(row);

    expect(result.brand).toBe('lottemart');
    expect(result.source_class_id).toBe('L1');
    expect(result.raw_status).toBe('바로신청');
    expect(result.register_start_at).toBeNull();
    expect(result.raw_extra.target_code).toBe('4');
    expect(result.raw_extra.semester_code).toBe('202603');
  });

  it('main_image_url(상세수집으로 채워진 썸네일)을 raw_extra에 담는다(2026-10-07 — 사진 있는데 왜 안보이는지 사용자 지적)', () => {
    const row = {
      class_id: 'L1',
      class_title: '테스트 강좌',
      registration_status: '바로신청',
      normalized_status: 'OPEN',
      main_image_url: 'https://culture.lottemart.com/files/culture/LMC/Storage/attach/Lecture/2026/01/x_IMG.jpg',
    };
    const result = toUnifiedLottemartRow(row);

    expect(result.raw_extra.main_image_url).toBe('https://culture.lottemart.com/files/culture/LMC/Storage/attach/Lecture/2026/01/x_IMG.jpg');
  });
});
