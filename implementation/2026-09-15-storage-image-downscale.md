# 업로드 이미지 서버 측 다운스케일 강제 + 기존 저장 이미지 일괄 정리

## 구현 대상
사용자 지시: "우리 여기말고도 다른거 이벤트 픽이라던가 이미지 사용하는것도
1400px보다 더 큰거 들어오면 1400px로 바꿔서 저장하도록 해... 혹시 현재
1400px 이상인것 저장된것도 있으면 다 확인하고 바꿔서 다시저장하고.."

Step 158까지는 맘스픽 글쓰기의 얼굴 스티커 편집기(`face-sticker-editor.tsx`)
에서만 클라이언트 측(canvas)으로 업로드 전 1400px 다운스케일을 했다. 이번
지시는 (1) 그 처리를 우회하는 경로(구형 브라우저, 관리자 업로드 등)에도
서버 측에서 동일하게 강제하고, (2) 이미 저장되어 있는 기존 이미지 중
1400px보다 큰 것도 전부 찾아서 줄이라는 요청이다.

## 조사 결과 — "이벤트픽" 업로드 경로는 존재하지 않음
저장소 전체(`src/app/api/`)를 검색한 결과, 사용자/관리자가 이미지를
업로드해 Supabase Storage에 저장하는 경로는 **두 개뿐**이다.
- `src/app/api/mom-pick/upload-image/route.ts` → 버킷 `mom-pick-post-images`
- `src/app/api/admin/spot-curations/upload-image/route.ts` → 버킷
  `spot-curation-images`

이벤트픽(`events` 테이블)은 공공데이터 자동 수집으로 채워지며, 표시되는
이미지도 원천 데이터의 외부 URL을 그대로 참조할 뿐 우리 Storage에 업로드/
저장하는 경로 자체가 없다 — "고칠 이벤트픽 업로드"는 존재하지 않는다는
점을 확인 후 진행했다(추측으로 없는 기능을 만들지 않음, 제3장 제5조).

## 변경 사항
### 1) 서버 측 강제 다운스케일
- `sharp`를 직접 의존성으로 추가(`npm install sharp`, 0.35.4 — 기존에는
  Next.js의 선택적 트랜지티브 의존성으로만 node_modules에 있었을 뿐,
  package.json에 명시된 의존성이 아니었다. 부수적으로 sharp의 기존 취약점
  `<0.35.4`(libheif 관련)도 함께 해소됨).
- 신규 `src/lib/images/resize-for-storage.ts`: `resizeImageForStorage(buffer,
  mimeType)` — sharp로 메타데이터를 읽어 가로·세로 모두 1400px
  (`STORAGE_IMAGE_MAX_LONG_SIDE`) 이내면 재인코딩 없이 원본을 그대로
  반환하고, 초과하면 비율을 유지한 채(`fit: 'inside', withoutEnlargement:
  true`) 줄인다. GIF는 `{ animated: true }`로 열어 모든 프레임을 보존한다.
- 두 업로드 라우트 모두 `Buffer.from(...)`으로 원본 버퍼를 만든 직후
  `resizeImageForStorage()`를 거치도록 수정 — 클라이언트가 무엇을 보내든
  서버가 최종 방어선 역할을 한다.
- `src/lib/images/resize-for-storage.test.ts`: sharp로 실제 합성 이미지를
  만들어(가로로 긴 것/세로로 긴 것/이미 상한 이내인 것/상한과 정확히 같은
  것) 4개 케이스 검증.

### 2) 기존 저장 이미지 일괄 확인 및 재저장
임시 스크립트(`scripts/tmp-resize-existing-images.mjs`, 작업 후 삭제)로
두 버킷의 모든 파일을 재귀적으로 나열(`mom-pick-post-images`는
`{user_id}/{uuid}.ext` 하위 폴더 구조라 재귀 필요)하고, 각 파일을 다운로드해
sharp로 실제 치수를 확인한 뒤 1400px 초과분만 리사이즈해 **같은 경로에
upsert로 재업로드**(공개 URL이 바뀌지 않도록 — DB에 이미 저장된 photoUrls를
건드릴 필요가 없다).

- 실행 전 `--dry-run`으로 먼저 스캔: 총 23개 파일 중 11개가 1400px 초과
  (전부 `mom-pick-post-images`, 특정 테스트 계정 799c25c1... 소유 — 이번
  기능을 실사용해보며 올린 사진들). `spot-curation-images`(9개)는 전부
  이미 기준 이내였다.
- 실제 리사이즈 실행: 11개 전부 성공, 파일당 최대 4,000,511B → 244,623B
  (약 94% 감소) 등 큰 폭으로 용량 감소. `list()` API로 확인한 저장소
  메타데이터(`size`, `eTag`, `updated_at`)가 정확히 새 값으로 갱신됨을
  확인했다.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1689개, 신규 4개 포함),
  `npm run build` 모두 통과.
- 운영 Storage에 대해 dry-run → 실제 실행 → 재검증까지 실측으로 확인.

## 특이 사항 — 캐시 지연(실제 버그 아님)
리사이즈 직후 같은 파일을 `.download()`로 다시 받아보면 잠시 예전(큰)
파일이 나온다 — Supabase Storage 응답 헤더에 `cacheControl: max-age=3600`
(1시간)이 설정되어 있어, CDN/엣지 캐시가 예전 응답을 최대 1시간까지 계속
서빙할 수 있기 때문이다. `list()` API로 조회한 메타데이터는 즉시 새 값
(작아진 size, 새 eTag, 새 updated_at)을 보여주므로, **저장소 자체는 정상적
으로 갱신되었음**을 확인했다 — 다만 이미 캐시된 공개 URL 응답은 최대
1시간 정도 예전 큰 파일을 계속 보여줄 수 있다는 점은 알아둘 필요가 있다
(이번 케이스는 대상이 11개뿐이고 자연 소멸되는 시간 제한적 현상이라 별도
캐시 무효화 작업은 하지 않았다).
