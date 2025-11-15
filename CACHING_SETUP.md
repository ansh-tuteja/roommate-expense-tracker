# ExpenseHub - HTTPS, Redis & Caching Setup

## ✅ New Features Added:

### 1. **HTTPS Support** 
- Self-signed SSL certificate generated in `./certs/`
- Server now runs on both HTTP (port 3000) and HTTPS (port 3443)
- Access via: `https://localhost:3443` or `http://localhost:3000`

### 2. **Redis Caching**
- Server-side caching for dashboard data, expenses, and groups
- Automatic cache invalidation when data changes
- Improves performance by reducing database queries

### 3. **Browser-Side Caching**
- LocalStorage caching for frequent data
- Service Worker for offline functionality
- IndexedDB for offline expense submission
- Automatic cache management and cleanup

## 🚀 Getting Started

### Prerequisites
1. **Install Redis** (for server-side caching):
   ```bash
   # Windows (via Chocolatey)
   choco install redis-64
   
   # Or download from: https://redis.io/download
   # Start Redis: redis-server
   ```

2. **Update Environment** (optional):
   ```bash
   cp .env.example .env
   # Edit .env file with your Redis/MongoDB settings
   ```

### Running the Server
```bash
# Install dependencies (already done)
npm install

# Start the server
node server.js
```

The server will now start on:
- **HTTP**: `http://localhost:3000` 
- **HTTPS**: `https://localhost:3443` (if certificates exist)

## 📱 Caching Features

### Server-Side (Redis)
- **Dashboard data**: Cached for 5 minutes
- **Expense lists**: Cached for 3 minutes  
- **Group data**: Cached for 10 minutes
- **Auto-invalidation**: When expenses/groups are created/updated/deleted

### Browser-Side (LocalStorage)
- **Dashboard data**: Cached for 2 minutes
- **Expense data**: Cached for 2 minutes
- **Group data**: Cached for 5 minutes
- **Offline support**: Expenses saved locally when offline

### Offline Features
- **Service Worker**: Caches static assets
- **Offline expense submission**: Stores in IndexedDB, syncs when online
- **Background sync**: Automatic sync when connection restored

## 🔧 Configuration

### Redis Settings (in .env):
```env
REDIS_HOST=localhost
REDIS_PORT=6379
```

### HTTPS Settings (in .env):
```env
PORT=3000
HTTPS_PORT=3443
```

## 📊 Monitoring

### Cache Status
- Browser console shows caching operations
- Server logs show Redis connections and cache hits/misses
- Cache size and keys visible in browser DevTools → Application → Storage

### Performance Benefits
- **Faster load times**: Cached data loads instantly
- **Reduced server load**: Fewer database queries
- **Offline functionality**: App works without internet
- **Better UX**: Instant responses for cached data

## 🛠 Troubleshooting

### Redis Not Running
```bash
# Start Redis manually
redis-server

# Or install as Windows service
redis-server --service-install
redis-server --service-start
```

### HTTPS Certificate Issues
- Self-signed certificates will show browser warnings
- Click "Advanced" → "Proceed to localhost" to continue
- For production, use proper SSL certificates

### Cache Issues
- Clear browser cache: Ctrl+Shift+R
- Clear Redis cache: `redis-cli FLUSHALL`
- Disable caching: Remove Redis configuration

## 🎯 Next Steps

1. **Production Setup**:
   - Get proper SSL certificates (Let's Encrypt)
   - Configure Redis persistence
   - Set up Redis clustering for scale

2. **Advanced Caching**:
   - Add cache warming strategies
   - Implement cache analytics
   - Add cache versioning

3. **Performance Monitoring**:
   - Add cache hit/miss metrics
   - Monitor cache memory usage
   - Track performance improvements

The ExpenseHub app now has enterprise-grade caching and HTTPS support! 🎉