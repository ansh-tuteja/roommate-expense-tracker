// ExpenseHub Service Worker for Browser-side Caching
const CACHE_NAME = 'expensehub-v1';
const CACHE_URLS = [
  '/',
  '/dashboard',
  '/css/style.css',
  '/css/dashboard.css',
  '/css/profile.css',
  '/css/settlement.css',
  '/css/member-list.css',
  '/css/dashboard-additions.css',
  '/js/dashboard.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('ExpenseHub: Caching static assets');
        return cache.addAll(CACHE_URLS);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('ExpenseHub: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', event => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip chrome-extension and other non-http(s) URLs
  if (!event.request.url.startsWith('http')) return;
  
  // Skip chrome extension URLs specifically
  if (event.request.url.startsWith('chrome-extension://')) return;
  
  // Skip cache for API endpoints that need fresh data
  if (event.request.url.includes('/api/') && 
      (event.request.url.includes('/expenses') || 
       event.request.url.includes('/dashboard'))) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version if available
        if (response) {
          return response;
        }
        
        // Otherwise fetch from network
        return fetch(event.request)
          .then(response => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Don't cache chrome-extension or non-http URLs
            if (!event.request.url.startsWith('http')) {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            // Add to cache for future use
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              })
              .catch(err => {
                console.log('ExpenseHub: Cache put failed:', err);
              });
            
            return response;
          });
      })
      .catch(() => {
        // Fallback for offline scenarios
        if (event.request.destination === 'document') {
          return caches.match('/');
        }
      })
  );
});

// Handle background sync for offline expense submission
self.addEventListener('sync', event => {
  if (event.tag === 'expense-sync') {
    event.waitUntil(syncExpenses());
  }
});

// Sync pending expenses when back online
async function syncExpenses() {
  try {
    const pendingExpenses = await getStoredExpenses();
    for (const expense of pendingExpenses) {
      await submitExpense(expense);
    }
    await clearStoredExpenses();
  } catch (error) {
    console.log('ExpenseHub: Sync failed:', error);
  }
}

// Get stored offline expenses
async function getStoredExpenses() {
  return new Promise((resolve) => {
    const request = indexedDB.open('ExpenseHubOffline', 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['expenses'], 'readonly');
      const store = transaction.objectStore('expenses');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        resolve(getAllRequest.result || []);
      };
    };
    request.onerror = () => resolve([]);
  });
}

// Submit expense to server
async function submitExpense(expense) {
  const response = await fetch('/expenses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(expense)
  });
  return response.ok;
}

// Clear stored expenses after sync
async function clearStoredExpenses() {
  return new Promise((resolve) => {
    const request = indexedDB.open('ExpenseHubOffline', 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['expenses'], 'readwrite');
      const store = transaction.objectStore('expenses');
      store.clear();
      transaction.oncomplete = () => resolve();
    };
  });
}