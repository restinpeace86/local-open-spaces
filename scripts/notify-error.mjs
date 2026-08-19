// scripts/notify-error.mjs
import fs from 'fs';
import { loadEnv } from './lib/load-env.mjs';

loadEnv();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_ERROR_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;

async function sendErrorAlert() {
  if (!DISCORD_WEBHOOK_URL) {
    console.error('❌ DISCORD_WEBHOOK_URL이 설정되지 않았습니다.');
    return;
  }

  const errorType = process.argv[2] || 'UNKNOWN_ERROR';
  let logContent = '상세 로그가 기록되지 않았습니다.';

  if (fs.existsSync('error.log')) {
    const rawLog = fs.readFileSync('error.log', 'utf8').trim();
    if (rawLog.length > 0) {
      logContent = rawLog.length > 800 ? '... (상단 로그 생략)\n' + rawLog.slice(-800) : rawLog;
    }
  }

  const embed = {
    title: '🚨 [local-open-spaces] 원격 시스템 개입 요청',
    color: 0xff0000,
    fields: [
      { name: '장애 유형', value: `\`${errorType}\``, inline: true },
      { name: '발생 시각', value: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), inline: true },
      { name: '핵심 에러 로그 (Trace)', value: `\`\`\`bash\n${logContent}\n\`\`\`` },
      { name: '💡 원격 복구 가이드', value: '이 에러 로그를 Gemini에게 보여주시면 GitHub `todo.md`에 적을 수정 프롬프트를 작성해 드립니다.' },
    ],
    footer: { text: 'local-open-spaces Remote Harness System' },
  };

  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '@everyone ⚠️ **사람의 개입이 필요한 오류가 발생했습니다!**',
        embeds: [embed],
      }),
    });

    if (!res.ok) {
      throw new Error(`Discord API 응답 에러: ${res.status}`);
    }
    console.log('✅ 안전한 규격으로 디스코드 에러 알림 전송 완료!');
  } catch (err) {
    console.error('Discord 알림 전송 실패:', err.message);
  }
}

sendErrorAlert();
