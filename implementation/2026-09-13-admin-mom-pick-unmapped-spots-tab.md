# 관리자 화면 — 노출 중분류 미지정 + 맘스픽 글 있음 우선순위 큐 탭

## 구현 대상
사용자 지시(2026-09-13):
> 어 구현해줘.. 관리자 쪽 .. 맘스픽에 대하여 노출 중분류가 없는 건 별도의
> 관리자화면의 탭에서 맘스픽글 올라왔고 이게 장소연결됐는데 장소에 대한
> 노출중분류가 안되어 있다.. 그리고 해당탭에 그런게 수시로 올라올수 있으니
> 탭 자체에 1건이라도 있을경우 탭에 표시...해줘
> 그럼 아 그 표시 보고 관리자가 새로 들어온글이 있고 노출중분류 안된장소가
> 있나보다 파악하고 그 탭 열고 작업하지

직전 Step 144에서 "맘스픽 우수글을 스팟 상세에 보여주기" vs "관리자 화면에
노출 중분류 미지정 + 맘스픽 글 있음 우선순위 목록을 두기" 중 후자를 추천했고,
이번이 그 승인·구현이다.

## 구현 일시
2026-09-13

## 1. 신규 API: `GET /api/admin/mom-pick-unmapped-spots`
- `mom_pick_posts`에서 `spot_id`가 있는 글을 전부 조회.
- 그 스팟들 중 `open_spaces.service_category_id`가 아직 `null`인 것만 필터.
- 작성자 닉네임(`profiles`), 기존 블로그 큐레이션(`spot_curations.blog_url_1..3`,
  `is_active=true`)을 별도 조회해 JS에서 이어붙인다 — `mom-pick-dashboard.ts`가
  이미 쓰는 "여러 번 조회해 이어붙이기" 관례 그대로다. `!inner` + 임베디드 컬럼
  null 필터(`.is('open_spaces.service_category_id', null)`)로 한 번에 처리하는
  방법도 있었지만, 이 프로젝트에 검증된 선례가 없어(스팟 큐레이션 라우트의
  `!inner`는 `.or()` 텍스트 검색용이지 null 필터가 아님) 추측으로 쓰지 않았다.
- 응답: `{ spots: [{ id, name, address, category_min, sigungu_name,
  service_category_id, posts: [{id, post_type, rating, content, created_at,
  author_nickname}], curatedBlogUrls: string[] }] }`, 최근 글이 달린 스팟이
  먼저 오도록 정렬.
- 공유 타입(`MomPickUnmappedSpot`/`MomPickUnmappedSpotPost`)은
  `src/lib/admin/mom-pick-unmapped-spots.ts`에 뒀다 — `route.ts`는 Next.js
  특수 파일이라 클라이언트 컴포넌트가 거기서 직접 타입을 임포트하지 않게
  분리했다.

## 2. 신규 8번째 관리자 탭 — "🚩 노출 중분류 필요"
`data-grid-client.tsx`의 `AdminTable`에 `'mom_pick_unmapped_spots'`를 추가하고,
자기완결적인 `MomPickUnmappedSpotsPanel`로 렌더링한다(기존 `curated_items`/
`spot_curations`/`mom_pick_posts`/`spot_dedup`/`category_mapping`과 동일한
패턴). 기존 `mom_pick_posts`(채택 관리) 탭과는 목적이 달라 합치지 않았다.

패널 안에서:
- 다른 자기완결 패널(예: `MomPickPostsPanel`)은 "탭을 열어도 자동으로 조회하지
  않고 버튼을 눌러야 조회"하는 게 관례("관리자 페이지 성능 최적화", 2026-08-30)
  지만, 이 패널은 마운트되자마자 자동으로 조회한다 — 애초에 탭 배지를 보고
  들어온 것이므로 또 한 번 눌러야 하면 배지의 의미가 없다(데이터 규모도 원래
  작아 무겁지 않다). 이 편차는 코드 주석으로 명시했다.
- 스팟별로 이름/주소/표준 중분류, 맘스픽 글 목록(글 타입/작성자/날짜/평점/
  내용), 기존 블로그 큐레이션 링크(있으면)를 보여준다.
- "노출 중분류 지정하기"를 누르면 `category-mapping-panel.tsx`가 이미 쓰는
  `MobileCurationWorkbench`를 그대로 재사용해 연다(블로그 검색/뱃지 태깅/노출
  중분류 저장까지 한 화면). 저장으로 노출 중분류가 채워지면(`onServiceCategoryUpdated`
  콜백의 `next`가 값 있음) 이 큐의 정의상 더 이상 여기 속하지 않으므로
  목록에서 완전히 제거한다(`category-mapping-panel.tsx`의 RowPicker처럼 값만
  갱신하지 않음 — 거기는 "미지정만 조회" 스냅샷이 그대로 남아도 되지만, 여기는
  "미지정"이 곧 이 목록에 있을 자격이라 다르다).

## 3. 탭 배지("1건이라도 있으면 표시")
`AdminDataGridClient` 최상위에 `unmappedMomPickSpotCount` state를 두고,
마운트 시 한 번 `/api/admin/mom-pick-unmapped-spots`를 조회해 개수만 저장한다
(패널이 탭이 열릴 때 같은 엔드포인트를 다시 조회하는 것과 별개 — 배지는 탭을
열기 전에 이미 필요하므로 어쩔 수 없이 한 번 더 부른다, 관리자 전용·저빈도
화면이라 비용은 무시할 만하다). 1건 이상이면 탭 버튼 우측 상단에 빨간 숫자
배지(`aria-label="노출 중분류 미지정 N건"`)를 띄운다.

## 검증
- `npx tsc --noEmit`: 통과(신규 탭 추가로 `AdminTable` 유니온이 넓어지면서
  `FilterOptions`/`hasLoaded` 등 exhaustive Record 타입들이 요구한 누락 키
  보강 — `src/app/admin/data-grid/page.tsx`, `data-grid-client.tsx`,
  `raw-data-modal.tsx`, `data-grid-client.test.tsx`).
- `npm run test -- --run`: 142 파일 / 1668건 전체 통과.
  - 신규 `mom-pick-unmapped-spots-panel.test.tsx`(5건): 자동 조회, 스팟/글/
    블로그 큐레이션 표시, 빈 상태, 워크벤치 진입·닫기(내부 동작은
    `mobile-curation-workbench.test.tsx`가 이미 담당 — 재검증하지 않음),
    조회 실패 에러 표시.
  - `data-grid-client.test.tsx`(+3건, 신규 describe): 배지 표시(2건 이상),
    배지 미표시(0건), 탭 전환 시 패널 렌더링.
- `npm run build`: 성공, `/api/admin/mom-pick-unmapped-spots` 라우트 확인.

## 특이 사항
- 이 탭은 "노출 중분류가 없어서 안 보이는 스팟"을 근본적으로 해결하는
  방향이라, 해결되면 맘스픽 딥링크(Step 143/144)로 우회할 필요 자체가
  줄어든다 — 두 기능은 서로 대체가 아니라 보완 관계(딥링크는 즉시 임시 대응,
  이 탭은 근본 해결)다.
