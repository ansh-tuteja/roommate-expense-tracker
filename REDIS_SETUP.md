# ExpenseHub Redis Setup Guide

## Setting up Online Redis

### Option 1: Redis Cloud (Recommended)

1. **Create Account**
   - Go to: https://redis.com/try-free/
   - Click "Get started free"
   - Sign up with your email

2. **Create Database**
   - Click "Create subscription"
   - Choose "Fixed" plan (FREE - 30MB)
   - Select a region (choose closest to your location)
   - Database name: `expensehub-cache`
   - Click "Create subscription"

3. **Get Connection Details**
   After database creation, click on your database:
   - **Public endpoint**: Copy this (e.g., `redis-12345.redislabs.com:12345`)
   - **Default user password**: Copy this password
   
4. **Update .env file**
   ```
   REDIS_HOST=redis-12345.redislabs.com
   REDIS_PORT=12345
   REDIS_PASSWORD=your_copied_password
   REDIS_USERNAME=default
   ```

### Option 2: Upstash Redis

1. **Create Account**
   - Go to: https://upstash.com/
   - Sign up with GitHub or Google

2. **Create Database**
   - Click "Create Database"
   - Name: `expensehub`
   - Region: Choose closest to you
   - Type: Regional (Free)

3. **Get Connection String**
   - Go to your database dashboard
   - Copy the "Redis Connect URL"
   - Example: `redis://default:password@host:port`

4. **Update .env file**
   ```
   REDIS_URL=redis://default:your_password@your_host:port
   ```

### Option 3: Railway Redis (Alternative)

1. **Create Account**
   - Go to: https://railway.app/
   - Sign up with GitHub

2. **Deploy Redis**
   - Create new project
   - Add Redis from templates
   - Get connection details from Variables tab

## Testing Connection

After setting up, run:
```bash
node server.js
```

You should see:
```
ExpenseHub HTTP running on http://localhost:3000
ExpenseHub HTTPS running on https://localhost:3443
MongoDB connected
Redis connected
```

## Troubleshooting

**Connection timeout errors:**
- Check if your Redis host/port are correct
- Verify password is correct
- Some services require username `default`

**SSL/TLS errors:**
- Try adding `tls: {}` to Redis config for secure connections

**Free tier limits:**
- Redis Cloud: 30MB, 30 connections
- Upstash: 10,000 requests/day, 256MB

## Features Enabled with Redis

✅ **Dashboard Data Caching** - 5 minutes
✅ **Expense List Caching** - 3 minutes  
✅ **Group Data Caching** - 10 minutes
✅ **Automatic Cache Invalidation** - On data changes
✅ **Browser-side Local Storage** - Offline support
✅ **Service Worker Caching** - Static assets