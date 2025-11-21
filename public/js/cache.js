// ExpenseHub Browser-side Caching Utilities

// localStorage cache with TTL support
class ExpenseHubCache {
  constructor() {
    this.prefix = 'expensehub_';
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
  }

  // Set data in localStorage with TTL
  set(key, data, ttl = this.defaultTTL) {
    try {
      const item = {
        data: data,
        timestamp: Date.now(),
        ttl: ttl
      };
      localStorage.setItem(this.prefix + key, JSON.stringify(item));
      return true;
    } catch (error) {
      console.log('Cache set error:', error);
      return false;
    }
  }

  // Get data from localStorage if not expired
  get(key) {
    try {
      const itemStr = localStorage.getItem(this.prefix + key);
      if (!itemStr) return null;

      const item = JSON.parse(itemStr);
      const now = Date.now();

      // Check if expired
      if (now - item.timestamp > item.ttl) {
        this.remove(key);
        return null;
      }

      return item.data;
    } catch (error) {
      console.log('Cache get error:', error);
      return null;
    }
  }

  // Remove specific item from cache
  remove(key) {
    try {
      localStorage.removeItem(this.prefix + key);
      return true;
    } catch (error) {
      console.log('Cache remove error:', error);
      return false;
    }
  }

  // Clear all ExpenseHub cache
  clear() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
      return true;
    } catch (error) {
      console.log('Cache clear error:', error);
      return false;
    }
  }

  // Get all cached keys
  getKeys() {
    try {
      const keys = Object.keys(localStorage);
      return keys
        .filter(key => key.startsWith(this.prefix))
        .map(key => key.replace(this.prefix, ''));
    } catch (error) {
      console.log('Cache getKeys error:', error);
      return [];
    }
  }

  // Check if key exists and is not expired
  exists(key) {
    return this.get(key) !== null;
  }

  // Get cache size info
  getInfo() {
    const keys = this.getKeys();
    let totalSize = 0;
    
    keys.forEach(key => {
      const item = localStorage.getItem(this.prefix + key);
      if (item) {
        totalSize += item.length;
      }
    });

    return {
      keys: keys.length,
      size: totalSize,
      sizeFormatted: this.formatBytes(totalSize)
    };
  }

  // Format bytes for display
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// sessionStorage cache for temporary session data
class SessionCache {
  constructor() {
    this.prefix = 'expensehub_session_';
  }

  // Set data in sessionStorage (no TTL needed - cleared on browser close)
  set(key, data) {
    try {
      const item = {
        data: data,
        timestamp: Date.now()
      };
      sessionStorage.setItem(this.prefix + key, JSON.stringify(item));
      return true;
    } catch (error) {
      console.log('Session cache set error:', error);
      return false;
    }
  }

  // Get data from sessionStorage
  get(key) {
    try {
      const itemStr = sessionStorage.getItem(this.prefix + key);
      if (!itemStr) return null;

      const item = JSON.parse(itemStr);
      return item.data;
    } catch (error) {
      console.log('Session cache get error:', error);
      return null;
    }
  }

  // Remove specific item from session cache
  remove(key) {
    try {
      sessionStorage.removeItem(this.prefix + key);
      return true;
    } catch (error) {
      console.log('Session cache remove error:', error);
      return false;
    }
  }

  // Clear all ExpenseHub session cache
  clear() {
    try {
      const keys = Object.keys(sessionStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          sessionStorage.removeItem(key);
        }
      });
      return true;
    } catch (error) {
      console.log('Session cache clear error:', error);
      return false;
    }
  }

  // Get all cached keys
  getKeys() {
    try {
      const keys = Object.keys(sessionStorage);
      return keys
        .filter(key => key.startsWith(this.prefix))
        .map(key => key.replace(this.prefix, ''));
    } catch (error) {
      console.log('Session cache getKeys error:', error);
      return [];
    }
  }

  // Store current page navigation data
  setPageData(page, data) {
    this.set(`page_${page}`, data);
  }

  // Get page navigation data
  getPageData(page) {
    return this.get(`page_${page}`);
  }

  // Store form data for recovery
  setFormData(formId, data) {
    this.set(`form_${formId}`, data);
  }

  // Get form data for recovery
  getFormData(formId) {
    return this.get(`form_${formId}`);
  }
}

// Dashboard data caching
class DashboardCache extends ExpenseHubCache {
  constructor() {
    super();
    this.dashboardTTL = 2 * 60 * 1000; // 2 minutes for dashboard
  }

  // Cache dashboard data
  cacheDashboard(userId, data) {
    return this.set(`dashboard_${userId}`, data, this.dashboardTTL);
  }

  // Get cached dashboard data
  getDashboard(userId) {
    return this.get(`dashboard_${userId}`);
  }

  // Cache expenses list
  cacheExpenses(userId, expenses) {
    return this.set(`expenses_${userId}`, expenses, this.dashboardTTL);
  }

  // Get cached expenses
  getExpenses(userId) {
    return this.get(`expenses_${userId}`);
  }

  // Cache group data
  cacheGroups(userId, groups) {
    return this.set(`groups_${userId}`, groups, 5 * 60 * 1000); // 5 minutes for groups
  }

  // Get cached groups
  getGroups(userId) {
    return this.get(`groups_${userId}`);
  }

  // Invalidate user-specific caches
  invalidateUser(userId) {
    this.remove(`dashboard_${userId}`);
    this.remove(`expenses_${userId}`);
    this.remove(`groups_${userId}`);
  }
}

// Offline storage for expenses
class OfflineStorage {
  constructor() {
    this.dbName = 'ExpenseHubOffline';
    this.version = 1;
    this.db = null;
    this.init();
  }

  // Initialize IndexedDB
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create expenses store for offline submissions
        if (!db.objectStoreNames.contains('expenses')) {
          const store = db.createObjectStore('expenses', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // Store expense for offline submission
  async storeExpense(expenseData) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['expenses'], 'readwrite');
      const store = transaction.objectStore('expenses');
      
      const expense = {
        ...expenseData,
        timestamp: Date.now(),
        synced: false
      };
      
      const request = store.add(expense);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get all unsynced expenses
  async getPendingExpenses() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['expenses'], 'readonly');
      const store = transaction.objectStore('expenses');
      const request = store.getAll();
      
      request.onsuccess = () => {
        const expenses = request.result.filter(expense => !expense.synced);
        resolve(expenses);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Mark expense as synced
  async markSynced(id) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['expenses'], 'readwrite');
      const store = transaction.objectStore('expenses');
      
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const expense = getRequest.result;
        if (expense) {
          expense.synced = true;
          const putRequest = store.put(expense);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
    });
  }

  // Get all expenses (for demo purposes)
  async getAllExpenses() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['expenses'], 'readonly');
      const store = transaction.objectStore('expenses');
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Clear all expenses (for demo purposes)
  async clearAll() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['expenses'], 'readwrite');
      const store = transaction.objectStore('expenses');
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Clear synced expenses
  async clearSynced() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['expenses'], 'readwrite');
      const store = transaction.objectStore('expenses');
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Initialize caching systems
window.ExpenseHubCache = new ExpenseHubCache();
window.DashboardCache = new DashboardCache();
window.OfflineStorage = new OfflineStorage();

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('ExpenseHub: SW registered:', registration);
      })
      .catch(error => {
        console.log('ExpenseHub: SW registration failed:', error);
      });
  });
}

// Online/offline handling
window.addEventListener('online', () => {
  console.log('ExpenseHub: Back online - syncing data');
  if (
    'serviceWorker' in navigator &&
    window.ServiceWorkerRegistration &&
    'sync' in window.ServiceWorkerRegistration.prototype
  ) {
    navigator.serviceWorker.ready.then(registration => {
      registration.sync.register('expense-sync');
    });
  }
});

window.addEventListener('offline', () => {
  console.log('ExpenseHub: Gone offline - enabling offline mode');
});