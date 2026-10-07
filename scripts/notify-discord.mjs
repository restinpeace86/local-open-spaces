import { pathToFileURL } from 'url';
import { loadEnv } from './lib/load-env.mjs';

// [배치 결과 디스코드 알림 — 재사용 가능한 함수로 분리](2026-10-07 todo.md
// 개선사항2-4): "배치가 성공적으로 끝났을 때나 에러가 터졌을 때... 디스코드
// 웹훅으로 결과 리포트를 쏴주는 로직" — 기존엔 이 파일이 CLI 전용(하네스가
// 커밋/푸시 뒤 `node scripts/notify-discord.mjs`로만 호출)이라 다른 스크립트
// (emart-culture-club.mjs 등)가 재사용할 수 없었다. 웹훅 전송 로직을 export
// 함수로 빼고, CLI 동작(인자 없이 실행 시 "작업 완료" 메시지)은 그대로
// 유지한다(기존 하네스 호출 방식과 하위 호환).
export async function sendDiscordNotification({ title, description, status, color } = {}) {
  const env = loadEnv();
  const webhookUrl = env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('⚠️ DISCORD_WEBHOOK_URL이 .env.local에 설정되지 않았습니다. 알림을 건너뜁니다.');
    return;
  }

  const message = {
    embeds: [
      {
        title: title ?? '✅ [local-open-spaces] 작업 완료 알림',
        description: description ?? '모든 빌드 검증이 성공적으로 완료되었습니다.',
        color: color ?? (title ? 0xed4245 : 0x5865f2), // 커스텀 알림(스킵/실패 등)은 기본 빨간색으로 구분
        fields: [
          { name: '상태', value: status ?? '✅ Passed (tsc, test, build)', inline: true },
          { name: '시간', value: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), inline: true },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Discord API 응답 에러: ${response.status}`);
  }
}

// 인자 없이 호출하면 기존과 동일하게 "작업 완료" 메시지를 보낸다(하위 호환).
// 스킵 등 다른 상황을 알릴 때는 인자로 제목/내용/상태를 넘긴다:
//   node scripts/notify-discord.mjs "<title>" "<description>" "<status>"
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [titleArg, descriptionArg, statusArg] = process.argv.slice(2);
  sendDiscordNotification({ title: titleArg, description: descriptionArg, status: statusArg })
    .then(() => console.log('✅ Discord 배포 완료 알림 전송 성공!'))
    .catch((error) => {
      console.error('❌ Discord 알림 전송 실패:', error.message);
      process.exit(1);
    });
}
