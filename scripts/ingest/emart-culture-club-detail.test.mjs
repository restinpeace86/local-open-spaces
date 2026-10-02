// [이마트 컬처클럽 강좌 상세정보 1회성 수집](2026-10-03 사용자 지시) —
// buildDetailUpdate() 단위 테스트. 실측 표본 그대로(2026-10-03 getClassByFiltering
// classId 단건 조회 직접 호출).
import { describe, expect, it } from 'vitest';
import { buildDetailUpdate } from './emart-culture-club-detail.mjs';

describe('buildDetailUpdate', () => {
  it('실측 샘플(상세 내용 있음)을 올바른 업데이트 행으로 변환한다', () => {
    const item = {
      classId: '2055o2ahC2026S3410',
      classDetail: {
        classDetailInfo: {
          classDetailInfoTitle: '월요오후도구힐링 바른자세',
          classDetailInfoContent: '*수강자만 입장 가능 합니다.',
        },
      },
      mainImage: {
        bucket: 'prod-cognitos3-master-imagestoragemaster7fb7b897-1850xqwn768gg',
        region: 'ap-northeast-2',
        key: 'category/2/205/4039a153-fe25-4bae-853d-f49de7a00672',
      },
    };

    const update = buildDetailUpdate(item);

    expect(update).toMatchObject({
      class_detail_title: '월요오후도구힐링 바른자세',
      class_detail_content: '*수강자만 입장 가능 합니다.',
      main_image_bucket: 'prod-cognitos3-master-imagestoragemaster7fb7b897-1850xqwn768gg',
      main_image_region: 'ap-northeast-2',
      main_image_key: 'category/2/205/4039a153-fe25-4bae-853d-f49de7a00672',
    });
    expect(update.detail_fetched_at).toBeTruthy();
  });

  it('실측 샘플(상세 내용이 빈 문자열) — 빈 문자열은 null로 정규화한다', () => {
    const item = {
      classId: '206TzEcTX2026S3830',
      classDetail: { classDetailInfo: { classDetailInfoTitle: '', classDetailInfoContent: '' } },
      mainImage: { bucket: 'b', region: 'ap-northeast-2', key: 'k' },
    };

    const update = buildDetailUpdate(item);

    expect(update.class_detail_title).toBeNull();
    expect(update.class_detail_content).toBeNull();
  });

  it('classDetail/mainImage 자체가 없으면 null로 채운다(추측 금지)', () => {
    const update = buildDetailUpdate({ classId: 'x', classDetail: null, mainImage: null });

    expect(update.class_detail_title).toBeNull();
    expect(update.class_detail_content).toBeNull();
    expect(update.main_image_bucket).toBeNull();
    expect(update.main_image_region).toBeNull();
    expect(update.main_image_key).toBeNull();
  });

  it('item 자체가 null이어도(강좌가 그 사이 사라짐) 에러 없이 빈 값을 반환한다', () => {
    const update = buildDetailUpdate(null);

    expect(update.class_detail_title).toBeNull();
    expect(update.detail_fetched_at).toBeTruthy();
  });

  it('detail_fetched_at은 항상 현재 시각(ISO 문자열)으로 채운다', () => {
    const update = buildDetailUpdate({ classId: 'x' });
    expect(() => new Date(update.detail_fetched_at).toISOString()).not.toThrow();
  });
});
