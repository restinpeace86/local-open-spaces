# 어린이도서관 뱃지 라벨 3개 수정

## 구현 대상
사용자 지시(2026-09-29): "어린이도서관 뱃지 관련 기존것들에 대하여 뱃지
3개 하기와 같이 바꿔줘
#신발벗는 온돌·마루방 ➡️ #신발벗는 마루방
#영유아 전용 자료실 분리 ➡️ #영유아 전용 공간 분리
#영어 그림책 전문 ➡️ #영어 그림책·원서 특화"

## 변경 사항
키(`floor_seating`/`lib_infant_reading_room`/`lib_english_picture_books`)는
그대로 두고 **라벨 문구만** 바꿨다 — 키가 그대로라 이미
`spot_curations.curation_badges`에 저장된 값은 손대지 않아도 새 라벨로
자동 표시된다(별도 데이터 마이그레이션 불필요).

### `src/lib/admin/curation-badges.ts`
`CHILDREN_LIBRARY_CONFIG.badgeOptions`의 라벨 3개 수정.

### `src/lib/admin/curation-badges.test.tsx`
15개 뱃지 목록 검증 테스트의 기대값을 새 라벨로 수정.

### `scripts/export-children-library-full-data.mjs`
CSV 내보내기용 `BADGE_KEY_TO_LABEL` 매핑(curation-badges.ts와 동일한 값을
scripts/ 관례상 복제해 둔 것)도 함께 수정 — 안 그러면 다음 실행 때 CSV에
옛 라벨이 나온다.

### `scripts/export-children-library-full-data.test.mjs`
라벨 검증 테스트 기대값 수정.

## 검증
- `npx vitest run src/lib/admin/curation-badges.test.tsx scripts/export-children-library-full-data.test.mjs` — 78개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 223개 파일 2,510개) / `npm run build` 모두 통과.

## 특이 사항
과거 구현 기록(implementation/2026-09-28-children-library-badges.md 등)과
이미 생성된 CSV(children_libraries_analysis_batch7.csv,
어린이도서관_전체데이터.csv)는 그 시점의 기록이라 옛 라벨 텍스트를 그대로
두었다 — 수정하지 않음.
