## 🚨 자율 실행 및 작업 진행 지침 (Strict Execution Rules)

1. **GitHub `todo.md` 기반 작업 수행**: 본 문서에 명시된 Task 목록과 세부 작업 지시를 최우선 가이드라인으로 삼아 순차적으로 작업을 진행한다.
2. **충돌 발생 시 즉시 스킵 (Skip on Conflict)**:
   - 기존 Spec 문서 (`spec/`), Decision Log (`project/decision-log.md`), 또는 기존 모듈과 구조적/논리적 충돌이 발생하는 경우, 절대로 무리하게 코드를 수정하지 말고 즉시 **[스킵 (보류)]** 처리한다.
3. **스킵 처리 시 필수 기록 사항**:
   - 충돌로 인해 작업을 스킵할 경우, 해당 Task 하단에 **① 상세 스킵 사유**를 명확히 기록한다.
   - 해당 Task를 재개하기 위해 **② 선행되어야 할 작업**(예: 신규 Decision 기록 필요, Spec 문서 선행 수정 필요 등)을 구체적인 가이드로 명시한다.
4. **원격 문서 갱신 반영 및 동기화**:
   - 원격 저장소의 `project/decision-log.md` (Decision 010) 및 `spec/map/spatial-search.md` (2.2 레이어 분리) 변경 내역을 확인하고, 충돌이 해소된 상태에서 안전하게 다음 Task를 진행한다.
5. **결과 업데이트 및 정합성 유지**:
   - 작업 완료 시 관련 테스트/빌드를 검증하고 `todo.md` 내 체크박스(`[x]`) 및 진행 상태를 최신화한다.

---


[개선사항 1] 현재 Next.js 프로젝트의 도메인을 `vercel.app`에서 커스텀 도메인 `https://nadri-pick.com`으로 변경하려고 해. 
이 작업과 관련해서 프로젝트 코드베이스 전체를 스캔하고 수정해야 할 부분을 파악해 줘.

[체크해 줬으면 하는 내용]
1. 코드 내에 하드코딩되어 있는 기존 도메인(`vercel.app` 등)이나 `localhost` 주소가 있는지 검색해 줘.
2. Next.js App Router 메타데이터 설정(예: `metadataBase` 또는 OG 태그) 중 도메인 변경이 필요한 부분이 있는지 확인해 줘.
3. 환경 변수 파일(`.env.example` 등)에 추가하거나 수정해야 할 도메인 관련 환경 변수가 있는지 점검해 줘.
4. 그 외에 API 라우트나 백엔드 로직 중 도메인 주소에 의존하는 코드가 있는지 검토해 줘.

수정이 필요한 파일 경로와 구체적인 수정 방향을 리스트업해 줘.

[개선사항 2] 클라우드플레어 이메일 라우팅과 워커를 통해 *@nadri-pick.com으로 수신된 모든 메일을 Next.js 백엔드로 전달하는 웹훅 엔드포인트를 구현하려고 해.
Next.js App Router 환경(`app/api/webhooks/email/route.ts`)에 맞게 POST API 핸들러를 작성해 줘.

[요구사항]
1. 클라우드플레어 워커에서 다음과 같은 JSON 형식으로 POST 요청을 보냄:
   - `from`: 보낸 사람 주소 (string)
   - `to`: 받는 사람 주소 (string)
   - `raw`: 이메일 원본 텍스트/MIME (string)

2. 수신된 `raw` 이메일 데이터를 파싱하여 (필요한 라이브러리 `mailparser` 등 활용 추천) 제목(subject), 본문(text), 발신자/수신자 정보를 추출할 수 있게 해줘.

3. 파싱된 이메일 데이터를 Supabase DB에 저장하거나 콘솔에 로깅하는 기본 비즈니스 로직 구조를 포함해 줘.

4. TypeScript 타입 정의와 예외 처리(try/catch 및 적절한 응답 코드 반환)를 견고하게 짜 줘.
5. 
[개선사항 3] Next.js App Router 환경에서 클라우드플레어 이메일 워커(Cloudflare Email Worker)가 보내는 웹훅(POST 요청)을 받아 처리할 API 엔드포인트(`app/api/webhooks/email/route.ts`)를 개발해 주세요.

### 📋 요구사항 및 명세:
1. **파일 경로:** `app/api/webhooks/email/route.ts` (TypeScript 사용)
2. **요청 처리 (POST):**
   - 클라우드플레어 워커가 보내는 JSON payload를 안전하게 파싱합니다.
   - 페이로드에 포함될 주요 필드: `from` (보낸사람), `to` (수신자/농장주소, 예: `farm-test@nadri-pick.com`), `subject` (제목), `text` 또는 `html` (본문)
3. **핵심 기능:**
   - 수신된 `to` 주소를 파싱하여 어떤 농장(또는 테스트 계정)인지 식별합니다.
   - 현재 진행 중인 구글 지메일 전달 인증 메일인 경우, 본문에서 **인증 코드(숫자)**를 정규식 등으로 추출해 콘솔에 눈에 띄게 로그를 남깁니다.
   - 일반 예약 메일인 경우, '네이버 예약' 키워드와 본문 내용을 확인하고 추후 DB(Supabase 등)에 저장할 수 있는 형태로 구조화합니다.
4. **응답 (Response):**
   - 클라우드플레어 워커가 실패로 인식하지 않도록 정상 수신 시 무조건 `200 OK`와 `{ success: true }`를 반환합니다.
   - 에러 발생 시 try-catch로 감싸서 500 에러와 함께 로그를 남깁니다.
   - 
이 API 라우트 코드와 함께, 테스트로 이메일 페이로드를 모의(Mock) 전송해 볼 수 있는 간단한 curl 명령어 예시도 함께 작성해 주세요.

하기 소스코드는 CloudFlare에 배포된 것으로, 웹훅 url 주소를 포함하고 있으니 참고하세요.
export default {
  async email(message, env, ctx) {
    const rawStream = message.raw;
    const reader = rawStream.getReader();
    let rawEmail = "";
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      rawEmail += new TextDecoder().decode(value);
    }

    const webhookUrl = "https://nadri-pick.com/api/webhooks/email";

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: message.from,
          to: message.to,
          raw: rawEmail
        })
      });

      if (!response.ok) {
        console.error(`Webhook failed with status: ${response.status}`);
      }
    } catch (err) {
      console.error("Error sending email webhook:", err);
    }
  }
};
