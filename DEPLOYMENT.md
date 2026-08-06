# Deployment Guide

This guide covers deploying the ONS Trade Data API to various platforms.

## Prerequisites

- Node.js 18+
- npm or yarn
- Prepared data files in `/data` directory

## Build

```bash
npm install
npm run build
```

Output: `.svelte-kit/output` directory ready for deployment

---

## Vercel Deployment

### Option 1: Using Vercel CLI

```bash
npm install -g vercel
vercel
```

Follow the prompts. Vercel will automatically detect the SvelteKit project.

### Option 2: GitHub Integration

1. Push code to GitHub
2. Connect repository to Vercel
3. Vercel auto-deploys on push

### Configuration

Create `vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".svelte-kit/output",
  "framework": "sveltekit"
}
```

---

## Netlify Deployment

### Option 1: Using Netlify CLI

```bash
npm install -g netlify-cli
netlify deploy
```

### Option 2: GitHub Integration

1. Connect Vercel GitHub app to your repository
2. Set build command: `npm run build`
3. Set publish directory: `.svelte-kit/output`

### netlify.toml Configuration

```toml
[build]
  command = "npm run build"
  publish = ".svelte-kit/output"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api"
  status = 200
```

---

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/.svelte-kit .svelte-kit
COPY --from=builder /app/data ./data
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", ".svelte-kit/output/index.js"]
```

### Build and Run

```bash
docker build -t ons-trade-api .
docker run -p 3000:3000 ons-trade-api
```

---

## Self-Hosted (Node.js)

### Prerequisites
- Node.js 18+ installed
- Nginx or similar reverse proxy (recommended)

### Installation

```bash
# Clone repository
git clone <repo-url>
cd ons-trade-data-api

# Install dependencies
npm ci

# Build production bundle
npm run build

# Start server
node .svelte-kit/output/index.js
```

The API runs on `http://localhost:3000` by default.

### Systemd Service

Create `/etc/systemd/system/ons-trade-api.service`:

```ini
[Unit]
Description=ONS Trade Data API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/ons-trade-api
ExecStart=/usr/bin/node .svelte-kit/output/index.js
Restart=on-failure
Environment="NODE_ENV=production"
Environment="PORT=3000"

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable ons-trade-api
sudo systemctl start ons-trade-api
sudo systemctl status ons-trade-api
```

### Nginx Configuration

```nginx
upstream ons_api {
    server localhost:3000;
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://ons_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable HTTPS with Let's Encrypt:
```bash
sudo certbot --nginx -d api.example.com
```

---

## Environment Variables

Create `.env` for production:

```env
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

Available variables:
- `NODE_ENV` - Set to `production` for optimized build
- `PORT` - Server port (default: 3000)
- `LOG_LEVEL` - Logging level (default: info)

---

## Performance Optimization

### 1. Enable Compression
Most hosting providers enable gzip automatically.

### 2. CDN Configuration
Serve data files through CDN for faster global access.

### 3. Caching Headers
Add to Nginx configuration:
```nginx
location /api {
    proxy_cache_valid 200 1h;
    proxy_cache_key "$scheme$request_method$host$request_uri";
    add_header X-Cache-Status $upstream_cache_status;
}
```

### 4. Data Compression
For large datasets, consider pre-gzipping JSON files:
```bash
gzip -k data/**/*.json
```

---

## Monitoring

### Application Logs
```bash
# For systemd service
sudo journalctl -u ons-trade-api -f

# Direct output
NODE_ENV=production node .svelte-kit/output/index.js
```

### Health Check Endpoint
```bash
curl http://localhost:3000/api/meta/schema
```

Monitor this endpoint with uptime monitoring service.

---

## Updating Data

### Manual Update
1. Place new Excel files in `data/raw/`
2. Run processing scripts locally
3. Commit and push updated JSON files
4. Restart application or redeploy

### Automated Updates (Future)
When GitHub Actions are implemented:
```bash
git pull origin main
# Changes automatically deployed
```

---

## Troubleshooting

### Port Already in Use
```bash
lsof -i :3000
kill -9 <PID>
```

### Memory Issues
```bash
# Increase Node memory
NODE_OPTIONS=--max-old-space-size=4096 node .svelte-kit/output/index.js
```

### Data Files Not Loading
Check file permissions:
```bash
ls -la data/
chmod 644 data/**/*.json
```

### API Returns 404
Verify data directory structure:
```bash
find data -type f -name "*.json" | head -20
```

---

## Performance Benchmarks

Expected performance on standard server:
- **Latency:** <50ms for metadata endpoints
- **Throughput:** >1000 requests/sec (metadata)
- **Memory Usage:** ~150MB resident
- **Concurrent Connections:** >500

---

## Support

For deployment issues:
1. Check logs: `systemctl status ons-trade-api`
2. Verify data files exist
3. Test endpoint: `curl http://localhost:3000/api/meta/schema`
4. Check Node version: `node --version`
