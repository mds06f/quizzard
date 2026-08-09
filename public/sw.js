const CACHE_NAME = 'quizzard-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/quiz',
  '/result',
  '/icon.svg',
  '/manifest.json',
  '/js/offlineSync.js',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'
];

const DB_NAME = 'quizzard-offline';
const DB_VERSION = 1;

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cachedQuizzes')) {
        db.createObjectStore('cachedQuizzes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pendingSync')) {
        db.createObjectStore('pendingSync', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function saveToIndexedDBCache(id, data) {
  return getDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cachedQuizzes', 'readwrite');
      const store = tx.objectStore('cachedQuizzes');
      store.put({ id, data, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }).catch((err) => {
    console.error('saveToIndexedDBCache error:', err);
  });
}

function getFromIndexedDBCache(id) {
  return getDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cachedQuizzes', 'readonly');
      const store = tx.objectStore('cachedQuizzes');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  }).catch(() => null);
}

function queueOfflineAttempt(userName, sectionId, score, total) {
  return getDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pendingSync', 'readwrite');
      const store = tx.objectStore('pendingSync');
      const attempt = { userName, sectionId, score, total, timestamp: Date.now() };
      store.add(attempt);
      tx.oncomplete = async () => {
        console.log('[SW] Queued offline attempt:', attempt);
        if (self.registration && self.registration.sync) {
          self.registration.sync.register('sync-quiz-results')
            .then(() => console.log('[SW] Background sync registered'))
            .catch((err) => console.warn('[SW] Sync register failed:', err));
        }
        await broadcastSyncStatus();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  });
}

async function broadcastSyncStatus() {
  const clients = await self.clients.matchAll();
  let count = 0;
  try {
    const db = await getDB();
    count = await new Promise((resolve, reject) => {
      const tx = db.transaction('pendingSync', 'readonly');
      const store = tx.objectStore('pendingSync');
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('[SW] Error getting pending sync count:', err);
  }
  
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_STATUS_UPDATE', pendingCount: count });
  });
}

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept save-result requests when offline or network fails
  if (event.request.method === 'POST' && url.pathname.includes('/api/quiz/save-result')) {
    event.respondWith(
      fetch(event.request.clone())
        .catch(async () => {
          try {
            const requestBody = await event.request.clone().json();
            const { userName, sectionId, result } = requestBody;
            const score = result.score;
            const total = result.total;

            await queueOfflineAttempt(userName, sectionId, score, total);

            return new Response(JSON.stringify({
              message: 'Offline mode. Result queued and will sync when network is restored.'
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (err) {
            console.error('[SW] Error queueing offline attempt:', err);
            return new Response(JSON.stringify({ error: 'Failed to queue offline attempt' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })
    );
    return;
  }

  if (event.request.method !== 'GET') return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Intercept GET quiz sections and questions for IndexedDB offline caching
  if (url.pathname.includes('/api/quiz/sections') || url.pathname.includes('/api/quiz/questions/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseCopy);
            });

            response.clone().json().then((data) => {
              let id = 'sections';
              if (url.pathname.includes('/api/quiz/questions/')) {
                const parts = url.pathname.split('/');
                const len = parts.length;
                const difficulty = parts[len - 1];
                const sectionId = parts[len - 2];
                id = `questions:${sectionId}:${difficulty}`;
              }
              saveToIndexedDBCache(id, data);
            }).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          let id = 'sections';
          if (url.pathname.includes('/api/quiz/questions/')) {
            const parts = url.pathname.split('/');
            const len = parts.length;
            const difficulty = parts[len - 1];
            const sectionId = parts[len - 2];
            id = `questions:${sectionId}:${difficulty}`;
          }

          const cachedData = await getFromIndexedDBCache(id);
          if (cachedData) {
            return new Response(JSON.stringify(cachedData), {
              headers: { 'Content-Type': 'application/json' }
            });
          }

          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (url.pathname.includes('/api/quiz/questions/')) {
              return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
            }
            return new Response('Offline mode. Please check connection.', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
        })
    );
    return;
  }

  // Fallback to cache-first for other static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseCopy);
          });
        }
        return networkResponse;
      }).catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});

// Background Sync Event
async function syncQuizResults() {
  try {
    const db = await getDB();
    const attempts = await new Promise((resolve, reject) => {
      const tx = db.transaction('pendingSync', 'readonly');
      const store = tx.objectStore('pendingSync');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (attempts.length === 0) return;

    console.log(`[SW] Syncing ${attempts.length} offline attempts...`);
    const response = await fetch('/api/quiz/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attempts })
    });

    if (response.ok) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('pendingSync', 'readwrite');
        const store = tx.objectStore('pendingSync');
        attempts.forEach(attempt => store.delete(attempt.id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      console.log('[SW] Offline attempts synced successfully');
      await broadcastSyncStatus();
    } else {
      console.error('[SW] Failed to sync attempts:', response.statusText);
    }
  } catch (err) {
    console.error('[SW] Error in syncQuizResults:', err);
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-quiz-results') {
    event.waitUntil(syncQuizResults());
  }
});

// Listen for reviews scheduling messages from client
let reviewCheckInterval = null;
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULE_REVIEWS_CHECK') {
    const nextDueTime = event.data.nextDueTime;
    const dueCount = event.data.dueCount;
    
    if (reviewCheckInterval) clearInterval(reviewCheckInterval);
    
    // Setup an interval check to see if we reached nextDueTime
    reviewCheckInterval = setInterval(() => {
      if (Date.now() >= nextDueTime) {
        clearInterval(reviewCheckInterval);
        self.registration.showNotification('Quizzard Review Due!', {
          body: `You have ${dueCount} quiz questions due for spaced repetition review!`,
          icon: '/icon.svg',
          tag: 'spaced-repetition-review',
          data: { url: '/?tab=review' }
        });
      }
    }, 15000); // Check every 15 seconds
  }
});

// Handle notification click to focus or open window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
