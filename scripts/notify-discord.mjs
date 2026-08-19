import { loadEnv } from './lib/load-env.mjs';

loadEnv();

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

if (!webhookUrl) {
  console.warn('⚠️ DISCORD_WEBHOOK_URL이 .env.local에 설정되지 않았습니다. 알림을 건너뜁니다.');
  process.exit(0);
}

// 인자 없이 호출하면 기존과 동일하게 "작업 완료" 메시지를 보낸다(하위 호환).
// 스킵 등 다른 상황을 알릴 때는 인자로 제목/내용/상태를 넘긴다:
//   node scripts/notify-discord.mjs "<title>" "<description>" "<status>"
const [titleArg, descriptionArg, statusArg] = process.argv.slice(2);

async function sendDiscordNotification() {
  const message = {
    embeds: [
      {
        title: titleArg ?? '✅ [local-open-spaces] 작업 완료 알림',
        description: descriptionArg ?? '모든 빌드 검증이 성공적으로 완료되었습니다.',
        color: titleArg ? 0xed4245 : 0x5865f2, // 커스텀 알림(스킵 등)은 빨간색으로 구분
        fields: [
          { name: '상태', value: statusArg ?? '✅ Passed (tsc, test, build)', inline: true },
          { name: '시간', value: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), inline: true },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Discord API 응답 에러: ${response.status}`);
    }

    console.log('✅ Discord 배포 완료 알림 전송 성공!');
  } catch (error) {
    console.error('❌ Discord 알림 전송 실패:', error.message);
    process.exit(1);
  }
}

sendDiscordNotification();
