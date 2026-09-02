// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 2.5: 우수맘 이상 Web Push
// 수신용 최소 서비스 워커. 이 앱은 오프라인 캐싱/PWA 설치 같은 다른 서비스 워커 용도가
// 아직 없어(known gap), push 이벤트 처리만 담당하는 단일 목적 파일로 둔다.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: '나드리픽', body: event.data.text() };
  }

  const title = payload.title || '나드리픽';
  // 이 프로젝트에는 아직 브랜드 앱 아이콘 자산이 없어(known gap) icon/badge는 지정하지
  // 않는다 — 존재하지 않는 이미지 경로를 지어내지 않고(추측 금지) 브라우저 기본 아이콘에
  // 맡긴다. 아이콘 자산이 준비되면 이 옵션에 추가하면 된다.
  const options = {
    body: payload.body || '',
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림을 클릭하면 이미 열린 탭이 있으면 포커스하고, 없으면 새 탭으로 연다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
