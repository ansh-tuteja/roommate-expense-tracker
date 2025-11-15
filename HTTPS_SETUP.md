# ExpenseHub HTTPS Setup Guide

## Problem: Browser shows "Not secure" for HTTPS

This is normal for **self-signed certificates** in development. Here are the solutions:

## Solution 1: Accept the Certificate (Recommended for Development)

1. **Visit**: https://localhost:3443
2. **Click "Advanced"** when you see the security warning
3. **Click "Proceed to localhost (unsafe)"**
4. **The site will now work with HTTPS!**

## Solution 2: Enable Chrome Flag (One-time setup)

1. **Open Chrome** and go to: `chrome://flags/#allow-insecure-localhost`
2. **Enable** the flag
3. **Restart Chrome**
4. **Visit**: https://localhost:3443 (should work without warnings)

## Solution 3: Add to Trusted Certificates (Advanced)

### Windows:
1. **Open** `certs/localhost.crt` (double-click)
2. **Click** "Install Certificate"
3. **Choose** "Local Machine" → "Place all certificates in the following store"
4. **Select** "Trusted Root Certification Authorities"
5. **Restart browser**

### Alternative: Use mkcert (Professional)
```bash
# Install mkcert
choco install mkcert
mkcert -install
mkcert localhost 127.0.0.1
```

## Why This Happens:

- **Self-signed certificates** are not trusted by browsers by default
- **Production websites** use certificates from trusted Certificate Authorities (CA)
- **For development**, self-signed certificates are perfectly fine

## What Works Now:

✅ **HTTP**: http://localhost:3000 (always works)  
✅ **HTTPS**: https://localhost:3443 (after accepting warning)  
✅ **All features work on both HTTP and HTTPS**

## For Production:

Use certificates from:
- **Let's Encrypt** (free)
- **Cloudflare** (free)
- **Commercial CA** (paid)

---

**📝 Note**: The "Not secure" warning doesn't mean your app is broken - it just means the browser doesn't trust our self-signed certificate. This is completely normal in development!