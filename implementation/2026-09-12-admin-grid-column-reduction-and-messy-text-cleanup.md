# 관리자 그리드 ID 컬럼 숨김 + 원문 필드 정돈해서 보기 (Step 125)

## 구현 일시
2026-09-12

## 배경 (사용자 지시 원문)
> "관리자화면 events 탭도 좀 그리드 컬럼 축소해줘 ID컬럼 숨겨줘
> 그리고 DTLCONT 해당 컬럼에 대하여 html로 안되어있는것들에 \r\n&nbsp;&nbsp; -
> 4회차 - 14:30~15:50 &nbsp;(60명) \r\n&nbsp;&nbsp; - 5회차 - ... 이런식으로
> 되어있으면 \r \n같은거 적용해서 정돈된 글로 볼수있게해줘.. html이면 html로
> 지금처럼 볼수있게하는데 html이 아닌경우 이와 같이 되어있는지 확인하고 해당
> 컬럼 글만 정돈돼서 볼수있게 html처럼"

## 변경 사항

### 1. events 탭 ID 컬럼 숨김
`src/components/admin/data-grid-client.tsx`: 헤더 조건을 `tab !== 'open_spaces'`
(events+raw_ingest_data에 노출)에서 `tab === 'raw_ingest_data'`로 좁혔다 — 2026-09-07에
open_spaces에서 이미 "ID(external_id)는 출처(source)와 중복 정보"라는 이유로 숨긴
것과 동일한 이유로 events도 숨긴다. raw_ingest_data는 제목/명칭 컬럼 자체가 없어
source_id가 유일한 식별자라 그대로 유지. 대응하는 events 행의 `<td>{r.external_id}</td>`
셀도 제거.

### 2. 원문 JSON 필드 "정돈해서 보기" (HTML이 아닌 필드용)
Step 116(2026-09-06)에서 만든 "HTML로 보기"는 `<tag>` 형태의 진짜 HTML 마크업이 있는
필드만 잡는다. 이번엔 그 반대 케이스 — 태그는 없지만 `\r\n`(실제 개행 문자)과
`&nbsp;` 등 HTML 엔티티만 뒤섞여, `JSON.stringify`로 그대로 보면 `\r\n&nbsp;&nbsp; -
4회차...`처럼 한 줄에 다 뭉쳐 보이는 필드용 병행 기능을 추가했다.

- `src/lib/admin/cleanup-messy-text.ts` (신규):
  - `looksLikeMessyText(value)`: 문자열이면서 실제 개행(`\r`/`\n`) 또는 HTML 엔티티
    패턴(`&xxx;`/`&#123;`)을 포함하는지 판별. `looksLikeHtml`과 상호 배타적으로
    쓰인다(호출부에서 `!looksLikeHtml(v) && looksLikeMessyText(v)`로 순서 보장 —
    진짜 태그가 있으면 기존 "HTML로 보기" 버튼이, 없으면 이 새 버튼이 뜬다).
  - `cleanupMessyText(value)`: `\r\n`/`\r`을 실제 개행으로 통일 → 브라우저의 실제
    HTML 파서로 엔티티 디코딩(`<textarea>` 트릭 — DOM에 붙이지 않으므로 XSS 위험
    없이 `&nbsp;`/`&rarr;`/`&ldquo;` 등 표준 엔티티를 전부 안전하게 해석, 수동
    매핑표 유지 불필요) → naver-blog-body.ts(Step 116)와 동일한 관례로 연속 공백
    통합 + 3개 이상 연속 개행을 빈 줄 하나로 정리.
- `src/lib/admin/cleanup-messy-text.test.ts` (신규, 9개): 사용자가 제시한 실제
  예시 문구를 그대로 테스트 케이스로 사용.
- `src/components/admin/raw-data-modal.tsx`: `messyTextFields` 계산(htmlLikeFields와
  동일한 위치·패턴), "📄 {key} 정돈해서 보기" 버튼, `CleanedTextPreviewModal` 신규
  (HtmlFieldPreviewModal과 형태는 같지만 `dangerouslySetInnerHTML` 대신 정돈된
  일반 텍스트를 `whitespace-pre-line`으로 렌더링 — 엔티티를 마크업으로 오인해
  렌더링할 위험이 없음).

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 135 files / 1581 tests 전체 통과. 신규:
  - `cleanup-messy-text.test.ts` 9개(엔티티 디코딩, 개행 정리, 사용자 제시 예문 검증 등).
  - `raw-data-modal.test.tsx`에 "정돈해서 보기" 4개(버튼 노출/정돈 결과 확인, HTML
    필드와의 상호 배타 확인, 닫기, 대상 없을 때 버튼 미노출) + 기존 "ID 컬럼" 테스트
    갱신(events 탭 ID 숨김으로 기대값 변경, raw_ingest_data는 여전히 노출 확인 신규 추가).
- `npm run build`: 성공(라우트 목록 변화 없음).

## 특이 사항
- `looksLikeMessyText`는 "오탐이 있어도 무해하다"는 기존 `looksLikeHtml`과 동일한
  철학을 따른다 — 버튼이 잘못 뜨더라도 관리자가 누르지 않으면 그만이고, 눌러도
  단순 텍스트 정돈만 시도할 뿐 위험한 동작이 없다.
- 이 기능은 원문 JSON(raw_data/raw_payload) 뷰어 전용 디버그 도구다(제5장 제6조와
  무관 — 서비스 데이터 자체가 아니라 관리자가 원본을 확인하는 보조 화면).
