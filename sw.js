// Service Worker - 캐시 완전 비활성화 버전
// 이전 캐시를 모두 삭제하고 네트워크 요청을 그대로 통과시킵니다.

const CACHE_VERSION = 'after-v0-nocache';

self.addEventListener('install', event => {
    // 즉시 활성화
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    // 모든 이전 캐시 삭제
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(key => {
                console.log('[SW] 캐시 삭제:', key);
                return caches.delete(key);
            }))
        ).then(() => self.clients.claim())
    );
});

// 모든 fetch 요청을 캐시 없이 네트워크에서 직접 가져옴
self.addEventListener('fetch', event => {
    event.respondWith(fetch(event.request));
});
