// public/js/offlineSync.js

(function(global) {
  const DB_NAME = 'quizzard-offline';
  const DB_VERSION = 1;
  let dbPromise = null;

  function getDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
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
    return dbPromise;
  }

  const offlineSync = {
    // Save sections or questions cache package
    async cacheQuizPackage(id, data) {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cachedQuizzes', 'readwrite');
        const store = tx.objectStore('cachedQuizzes');
        store.put({ id, data, updatedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    // Retrieve cached sections or questions
    async getCachedQuizPackage(id) {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('cachedQuizzes', 'readonly');
        const store = tx.objectStore('cachedQuizzes');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result ? request.result.data : null);
        request.onerror = () => reject(request.error);
      });
    },

    // Queue completed attempt
    async queueOfflineAttempt(userName, sectionId, score, total) {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('pendingSync', 'readwrite');
        const store = tx.objectStore('pendingSync');
        const attempt = { userName, sectionId, score, total, timestamp: Date.now() };
        store.add(attempt);
        tx.oncomplete = () => {
          console.log('[Offline Sync] Queued offline attempt:', attempt);
          // Register background sync
          if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then((reg) => {
              return reg.sync.register('sync-quiz-results');
            }).then(() => {
              console.log('[Offline Sync] Background sync registered');
            }).catch((err) => {
              console.warn('[Offline Sync] Background sync registration failed:', err);
            });
          }
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    },

    // Get all pending sync count
    async getPendingSyncCount() {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('pendingSync', 'readonly');
        const store = tx.objectStore('pendingSync');
        const request = store.count();
        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error);
      });
    },

    // Get all pending syncs list
    async getPendingSyncs() {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('pendingSync', 'readonly');
        const store = tx.objectStore('pendingSync');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    },

    // Clear specific pending syncs by id
    async removePendingSyncs(ids) {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('pendingSync', 'readwrite');
        const store = tx.objectStore('pendingSync');
        ids.forEach(id => store.delete(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  };

  global.offlineSync = offlineSync;
})(typeof window !== 'undefined' ? window : this);
