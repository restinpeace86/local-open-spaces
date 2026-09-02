# [개발요청] 로딩 이미지 교체 및 브랜드 표기 영문 제거

## 구현 일시
2026-09-03

## 구현 내용

### 로딩 이미지 교체
- 사용자가 `reference/loading/loading_image.gif`(480×270, 약 3.1MB)에 넣어둔 움직이는
  이미지를 `public/loading/loading_image.gif`로 복사해 정적 자산으로 등록.
- `src/components/common/brand-splash.tsx`의 회전 스피너(`animate-spin` div)를 이
  GIF로 교체. `next/image` 대신 순수 `<img>` 태그를 썼다 — `next/image`는 GIF를
  재인코딩해 애니메이션이 깨질 수 있어(최적화 파이프라인 특성), 원본 그대로 재생하려면
  순수 `<img>`가 안전하다(이 프로젝트에도 이미 여러 곳에 동일한 이유로 `<img>`를
  쓰는 관례가 있음).
- `BrandSplash`는 이 프로젝트의 **유일한** 로딩 스피너 컴포넌트였고
  (`grep animate-spin` 결과 이 파일 하나뿐), `app/loading.tsx`(초기 진입/라우트
  Suspense)와 `bottom-tabs.tsx`(탭 전환 오버레이) 둘 다 이 컴포넌트 하나를 공유해서
  쓰고 있어 — 이 한 곳만 고치면 "화면 초기 로딩"과 "화면 전환" 두 요구사항이 모두
  해결된다.

### 브랜드 표기 영문 제거
`brand-splash.tsx`의 "나드리픽 (NadriPick)" → "나드리픽"으로 변경. 전체 코드베이스에서
"NadriPick" 문자열이 등장하는 곳은 이 파일 한 곳뿐이었음을 `grep`으로 확인했다(루트
레이아웃의 `<title>` 메타데이터는 "local-open-spaces"로 이번 요청과 무관한 별개 문구라
건드리지 않았다).

## 검증
### 코드 검증
`npx tsc --noEmit`/`npm run test`(96파일 964건, 회귀 없음)/`npm run build` 통과.

### 실측 검증
- dev 서버 curl로 `/loading/loading_image.gif`가 `200 image/gif`로 정상 서빙됨을 확인
  (3,157,115 bytes).
- 홈 화면 RSC 페이로드에 "나드리픽"만 나오고 "(NadriPick)"이 사라졌음을 확인.

## 특이 사항
- 원본 GIF 파일 크기가 약 3.1MB로, 모든 페이지 전환마다 로딩 시 반복 요청되는 자산치고는
  꽤 큰 편이다(브라우저 캐시로 최초 1회 이후는 재요청되지 않지만, 최초 접속 시 체감
  로딩이 오히려 느려질 수 있음). 사용자가 지정한 파일을 그대로 반영했고, 필요시 추후
  압축/리사이즈된 버전으로 교체를 권장한다.
