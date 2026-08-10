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
    },

    // Execute conflict-aware background sync with backend /api/quiz/sync
    async syncPendingResults(userName, resolveAction = null) {
      const pendingItems = await this.getPendingSyncs();
      if (!pendingItems || pendingItems.length === 0) return { count: 0 };

      const clientRev = parseInt(localStorage.getItem('quizzard_sync_revision') || '0', 10);
      const lastSyncTs = parseInt(localStorage.getItem('quizzard_last_sync_ts') || '0', 10);

      try {
        const res = await fetch('/api/quiz/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName: userName || 'anonymous',
            clientRevision: clientRev,
            lastSyncTimestamp: lastSyncTs,
            attempts: pendingItems,
            resolveAction: resolveAction
          })
        });

        if (res.status === 409) {
          const conflictData = await res.json();
          console.warn('[Offline Sync] Sync conflict detected:', conflictData);
          if (typeof this.onConflictDetected === 'function') {
            this.onConflictDetected({ conflictData, pendingItems, userName });
          }
          return { conflict: true, data: conflictData };
        }

        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('quizzard_sync_revision', data.serverRevision || (clientRev + pendingItems.length));
          localStorage.setItem('quizzard_last_sync_ts', Date.now().toString());

          const ids = pendingItems.map(item => item.id).filter(Boolean);
          if (ids.length > 0) {
            await this.removePendingSyncs(ids);
          }
          console.log('[Offline Sync] Successfully synced pending attempts:', data);
          return { success: true, syncedCount: pendingItems.length };
        }
      } catch (err) {
        console.error('[Offline Sync] Failed to sync pending attempts:', err);
      }
      return { success: false };
    }
  };

  global.offlineSync = offlineSync;
})(typeof window !== 'undefined' ? window : this);
