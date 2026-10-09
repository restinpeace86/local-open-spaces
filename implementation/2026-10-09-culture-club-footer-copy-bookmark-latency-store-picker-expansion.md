# 문화센터 안내 문구 수정 + 찜 반응 지연 해소 + 지점 뱃지 드릴다운 6개 브랜드 확장

## 구현 대상
사용자 지시(2026-10-09): "일단 문구 마지막 업데이트 10.9 12:39 되어있는데
... 이거 각각의 브랜드마다 다르잖아.. 그리고 접수상태는 하루 1회
갱신된다는것도 찜하면 더 자주 확인해 알려드린다는것도 뭔가.. 일단
마지막 업데이트는 시간은 빼... 일자만 넣어.. 접수상태는 하루 1회
갱신 맞아 ? 찜하면 더 자주 확인해 알려드려요는 일단 넣고.. .. 찜하면
이제 색깔 바뀌긴 한데 바뀌기 까지 꽤오래걸리네 1~2초걸리는거 같아.
그리고 현재 신세계꺼는 위치 신세계사우스시티 5.8km 나오는데 .. 신세계
브랜드 선택시 데이터는 나오는데 그 상세지점 왜안나와 ?" → 지점 뱃지
확장 범위 질문에 "6개 브랜드 전부 지금 추가(권장)" 선택.

## 구현 일시
2026-10-09

## 실측 확인

### "마지막 업데이트" — 시간 제거, 일자만
화면에 보이는 값은 첫 강좌 1건의 `collected_at`일 뿐인데, 브랜드마다
배치 시각이 달라 분 단위까지 보여주면 "전체가 그 시각에 갱신됐다"는
오해를 준다 — 사용자 지시대로 일자(M.D)만 보여준다.

### "접수상태는 하루 1회 갱신" — 사실 확인(브랜드마다 다름)
Windows 작업 스케줄러를 직접 조회(`schtasks /query ... /fo LIST /v`)해
"반복: 매" 값을 실측했다:
- 이마트: 전용 경량 배치(`emart-culture-club-status-refresh.mjs`)가
  **30분마다** 전체 강좌 상태를 갱신(실측: 마지막 실행 17:05, 다음 실행
  17:35).
- 롯데마트/현대백화점/신세계/AK플라자/스타필드/롯데백화점: 일일 목록
  배치가 상태를 같이 갱신해 **하루 1회**뿐(별도 경량 상태 전용 배치
  없음 — `scripts/ingest` 전체 조회로 확인, `emart-culture-club-status-
  refresh.mjs`가 유일).
- "하루 1회"로 단정하면 이마트는 과소평가, 반대로 "30분마다"로 단정하면
  나머지 브랜드는 과대평가가 된다 — 혼합 브랜드 목록에 공통으로 보여줄
  문구라 "최소 하루 1회"로 바꿔 양쪽 다 거짓이 되지 않게 했다.
- "찜하면 더 자주 확인해 알려드려요"는 그대로 둔다(사용자 지시) —
  `culture-club-status-watch.mjs`가 찜한 강좌만 5분 주기로 재확인하는
  게 실제로 있고, 찜 버튼 자체가 이마트/롯데마트에만 보이므로(다른
  브랜드는 `toBookmarkTarget`이 null) 이 문구가 적용되는 범위와도
  일치한다.

### 찜 버튼 반응 지연(1~2초) — 낙관적 갱신 누락
`addBookmark`/`removeBookmark`가 auth.getUser → getMyProfile → 캡 개수
확인 → (강좌면) resolveCultureClubClassId → insert/delete까지 최대
5번의 순차 Supabase 왕복을 거친다(왕복마다 ~400~600ms 고정 지연 —
Branch-First 최적화 때 이미 실측된 사실과 동일). `bookmark-button.tsx`
는 그 전체가 끝나야 `isBookmarked` state를 바꾸는 구조라 체감 지연이
컸다 — `mom-pick-feed.tsx`/`booking-card.tsx`의 기존 낙관적 갱신 관례와
동일하게, 클릭 즉시 state를 먼저 바꾸고 실패 시에만 되돌리도록 고쳤다.

### 신세계 등 6개 브랜드 지점 뱃지 미노출 — 버그 아니라 Decision 029 범위상 미구현
2026-10-08 Decision 029 당시 이마트/롯데마트 2개만 지점 선택 UI를
연결하고 나머지 6개(현대백화점/신세계/AK플라자/스타필드/롯데백화점/
이랜드리테일)는 "API는 만들어뒀지만 화면 연결은 나중에"로 미뤄뒀었다
(관리자 패널은 이미 6개 다 쓰고 있었음). 사용자가 지금 추가하기로
확정해, 관리자 패널과 동일한 API(hyundai-stores/shinsegae-stores/
akplaza-stores/starfield-stores/lotte-department-stores/eland-retail-
stores)를 재사용해 연결했다.

## 변경 사항
- `src/components/home/culture-club-tab-view.tsx`:
  - `formatUpdatedAt()`에서 시/분 제거, `M.D`만 반환.
  - 안내 문구 "접수 상태는 하루 1회 갱신돼요" → "최소 하루 1회 갱신돼요".
  - `STORE_ENDPOINT_BY_BRAND` 신규 상수(8개 브랜드 전부) 추가, 지점 목록
    조회 useEffect를 "all만 빈 목록, 나머지는 맵에서 엔드포인트 조회"로
    단순화(기존 "6개 브랜드는 미지원"이라 빈 목록 처리하던 분기 제거).
- `src/components/community/bookmark-button.tsx`: `handleToggle`을
  낙관적 갱신으로 변경 — 클릭 즉시 `isBookmarked`를 뒤집고, 실패하면
  되돌린다(그 외엔 기존과 동일하게 `BookmarkCapExceededError`만 토스트).
- `src/components/home/culture-club-tab-view.test.tsx`: 날짜 포맷(시간
  제외)/"최소 하루 1회" 문구 검증 테스트 수정. 6개 브랜드 지점 뱃지
  드릴다운 신규 테스트(`it.each`, 브랜드 선택 시 전용 지점 API 조회 +
  뱃지 노출 확인) 추가.
- `src/components/community/bookmark-button.test.tsx`: 클릭 즉시(서버
  응답 전) 하트 라벨이 바뀌는지 검증하는 낙관적 갱신 신규 테스트 추가.

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(314개 파일 **3,176개**) /
  `npm run build` 전부 통과.
- 라이브 API 호출로 재확인: `/api/culture-club/shinsegae-stores`,
  `/api/culture-club/akplaza-stores` 등 지점 목록 정상 응답.
- 찜 버튼 실제 클릭→색 변경까지의 체감 지연 단축은 코드 레벨(동기적
  state 변경)로 확정했지만, 실제 브라우저 로그인 세션에서의 체감
  확인은 사용자가 직접 재현해 확인이 필요하다.

## 특이 사항
- `formatStoreNameWithBrand()`가 붙이는 브랜드 접두사와 지점 뱃지의
  실제 지점명이 100% 일치하지 않는 브랜드(이랜드리테일)가 있다는 점은
  지난 구현 기록에 이미 남겼다 — 이번 변경과는 무관.
- 이마트의 "30분마다 상태 갱신"은 이 세션에서 실측으로 처음 정량
  확인된 사실이라, 추후 다른 안내 문구에도 참고할 수 있게 기록해 둔다.
