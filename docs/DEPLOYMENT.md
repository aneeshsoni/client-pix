# Deployment Guide

This guide covers deploying Client Pix to production, including security considerations, local testing, and deployment options.

## Table of Contents

1. [Local Testing](#local-testing)
2. [Security Considerations](#security-considerations)
3. [Environment Variables](#environment-variables)
4. [Self-Hosted Deployment (VPS/Server)](#self-hosted-deployment-vpsserver)
5. [Coolify Deployment](#coolify-deployment)
6. [Share Links & DNS](#share-links--dns)
7. [Troubleshooting](#troubleshooting)
   - [Forgot Admin Password](#forgot-admin-password)
8. [Upgrading](#upgrading)

---

## Local Testing

### Testing Without a Custom Domain

You can fully test share links and all features locally using `http://localhost`. The current setup routes all traffic through Nginx on port 80.

```bash
# Start all services with the start script, it'll automatically build and start the docker containers for the project
./start.sh

# Access the app
open http://localhost

# API docs
open http://localhost/docs
```

### Testing Share Links Locally

Share links work out of the box at `http://localhost/share/{token}`. To test:

1. Create an album and upload photos
2. Click "Share" and generate a share link
3. Copy the link (e.g., `http://localhost/share/abc123...`)
4. Open in an incognito window to test the public view

### Simulating a Custom Domain

If you want to test with a custom domain locally:

1. Edit `/etc/hosts` (Mac/Linux) or `C:\Windows\System32\drivers\etc\hosts` (Windows):

   ```
   127.0.0.1   gallery.local
   ```

2. Update `.env` files:

   ```bash
   # apps/python/.env
   BASE_URL=http://gallery.local
   ALLOWED_ORIGINS=http://gallery.local,http://localhost

   # apps/nextjs/.env.local
   NEXT_PUBLIC_API_URL=http://gallery.local
   ```

3. Update `docker/nginx/nginx.dev.conf` to accept the new hostname:

   ```nginx
   server_name localhost gallery.local;
   ```

4. Restart services and access at `http://gallery.local`

---

## Security Considerations

### Current Security Features ✅

| Feature               | Implementation                         | Status         |
| --------------------- | -------------------------------------- | -------------- |
| Password hashing      | bcrypt with salt                       | ✅ Secure      |
| Password strength     | Minimum 8 characters required          | ✅ Implemented |
| JWT authentication    | Access + refresh tokens                | ✅ Implemented |
| Rate limiting         | slowapi (5/min login, 3/min register)  | ✅ Implemented |
| 2FA/TOTP              | With hashed backup codes               | ✅ Implemented |
| Share link tokens     | `secrets.token_urlsafe(32)` (256-bit)  | ✅ Secure      |
| Share link expiration | Configurable per link                  | ✅ Implemented |
| Share link revocation | Can revoke links                       | ✅ Implemented |
| SQL injection         | SQLAlchemy ORM (parameterized queries) | ✅ Protected   |
| CORS                  | Configurable allowed origins           | ✅ Implemented |
| File type validation  | MIME type checking                     | ✅ Implemented |
| Large upload handling | Streaming (no memory issues)           | ✅ Implemented |

### Security Headers (via Nginx)

The production Nginx config includes:

- `X-Frame-Options: SAMEORIGIN` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` - XSS protection

### HTTPS/SSL

- **Coolify**: Automatically handles SSL via Traefik (Let's Encrypt)
- **Manual deployment**: Use Certbot or your hosting provider's SSL

### Recommendations Before Production

1. **Change default database password**

   ```bash
   POSTGRES_PASSWORD=<generate-strong-password>
   ```

2. **Set appropriate CORS origins**

   ```bash
   ALLOWED_ORIGINS=https://yourdomain.com
   ```

3. **Disable debug mode**

   ```bash
   DEBUG=false
   ```

4. **Use HTTPS** (handled by Coolify/Traefik)

5. **Consider rate limiting** (can add to Nginx for API endpoints)

### What's NOT Implemented (Future Considerations)

- File scanning/virus detection
- Audit logging
- IP-based blocking
- Account lockout after failed attempts

---

## Environment Variables

### Required for Production

| Variable              | Description                  | Example                                       |
| --------------------- | ---------------------------- | --------------------------------------------- |
| `BASE_URL`            | Public URL of your app       | `https://gallery.yourdomain.com`              |
| `NEXT_PUBLIC_API_URL` | Same as BASE_URL             | `https://gallery.yourdomain.com`              |
| `DATABASE_URL`        | PostgreSQL connection string | `postgresql+asyncpg://user:pass@host:5432/db` |
| `POSTGRES_PASSWORD`   | Database password            | `<strong-password>`                           |

### Optional

| Variable            | Default            | Description                  |
| ------------------- | ------------------ | ---------------------------- |
| `APP_NAME`          | `Client Pix API`   | Application name             |
| `DEBUG`             | `false`            | Enable debug mode            |
| `UPLOAD_DIR`        | `/app/uploads`     | Upload directory path        |
| `WEB_MAX_DIMENSION` | `2400`             | Max dimension for web images |
| `ALLOWED_ORIGINS`   | `http://localhost` | CORS allowed origins         |

---

## Self-Hosted Deployment (VPS/Server)

This section covers deploying Client Pix on your own server (VPS, dedicated server, home server, etc.) using just Docker and docker-compose.

### Prerequisites

- Any machine that can run Docker
- A domain name pointing to your server (if you want it publicly available)
- SSH access to your machine/server/home lab

### Step 1: Server Setup

```bash
# SSH into your server
ssh user@your-server-ip

# Install Docker (if not already installed)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Log out and back in for group changes to take effect
exit
ssh user@your-server-ip
```

### Step 2: Clone the Repository

```bash
# Clone Client Pix
git clone https://github.com/your-username/client-pix.git
cd client-pix
```

### Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Create .env file
cat > .env << 'EOF'
# Database (CHANGE THIS PASSWORD!)
POSTGRES_PASSWORD=your-secure-password-here
POSTGRES_USER=clientpix
POSTGRES_DB=clientpix

# App Settings
APP_NAME=Client Pix
DEBUG=false
WEB_MAX_DIMENSION=2400

# JWT Secret (optional - auto-generated if not set)
# JWT_SECRET=your-secret-here
EOF
```

### Step 4: Configure Your Domain

#### Option A: Using Cloudflare (Recommended)

Cloudflare provides free SSL and DDoS protection:

1. Add your domain to Cloudflare
2. Create an A record pointing to your server:
   ```
   Type: A
   Name: gallery (or @ for root domain)
   Content: YOUR_SERVER_IP
   Proxy status: Proxied (orange cloud)
   ```
3. In Cloudflare SSL/TLS settings, set mode to "Full"

With this setup, Cloudflare handles HTTPS termination. Your server only needs to serve HTTP on port 80.

#### Option B: Direct DNS (No Cloudflare)

Point your domain directly to your server:

```
Type: A
Name: gallery (or @ for root domain)
Content: YOUR_SERVER_IP
TTL: Auto
```

You'll need to set up SSL separately (see Step 5b).

### Step 5: Configure Nginx for Your Domain

#### Step 5a: Update Nginx Config

Edit `docker/nginx/nginx.conf` to use your domain:

```nginx
server {
    listen 80;
    server_name gallery.yourdomain.com;  # Change this to your domain

    # ... rest of config stays the same
}
```

#### Step 5b: Adding SSL with Let's Encrypt (if not using Cloudflare)

If you're not using Cloudflare, you need SSL certificates. The easiest approach is using a reverse proxy with automatic SSL:

**Option 1: Caddy (Simplest)**

Replace the nginx service in `docker-compose.prod.yml` with Caddy:

```yaml
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      frontend:
        condition: service_started
      backend:
        condition: service_healthy

volumes:
  postgres_data:
  uploads_data:
  caddy_data:
  caddy_config:
```

Create a `Caddyfile` in your project root:

```
gallery.yourdomain.com {
    # API routes
    handle /api/* {
        reverse_proxy backend:8000
    }

    # OpenAPI docs
    handle /docs {
        reverse_proxy backend:8000
    }
    handle /openapi.json {
        reverse_proxy backend:8000
    }

    # Everything else to frontend
    handle {
        reverse_proxy frontend:3000
    }
}
```

**Option 2: Traefik**

Add Traefik as a reverse proxy with automatic Let's Encrypt:

```yaml
traefik:
  image: traefik:v2.10
  restart: unless-stopped
  command:
    - "--api.insecure=true"
    - "--providers.docker=true"
    - "--providers.docker.exposedbydefault=false"
    - "--entrypoints.web.address=:80"
    - "--entrypoints.websecure.address=:443"
    - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
    - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    - "--certificatesresolvers.letsencrypt.acme.email=your-email@example.com"
    - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - traefik_certs:/letsencrypt

nginx:
  # ... existing config ...
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.clientpix.rule=Host(`gallery.yourdomain.com`)"
    - "traefik.http.routers.clientpix.entrypoints=websecure"
    - "traefik.http.routers.clientpix.tls.certresolver=letsencrypt"
    - "traefik.http.services.clientpix.loadbalancer.server.port=80"
```

**Option 3: Host-level Nginx + Certbot**

Install Nginx and Certbot directly on the host:

```bash
# Install Nginx and Certbot
sudo apt install nginx certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d gallery.yourdomain.com

# Configure Nginx to proxy to Docker
sudo nano /etc/nginx/sites-available/clientpix
```

```nginx
server {
    listen 443 ssl;
    server_name gallery.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/gallery.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gallery.yourdomain.com/privkey.pem;

    client_max_body_size 0;  # Unlimited uploads

    location / {
        proxy_pass http://127.0.0.1:8080;  # Docker nginx port
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for large uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}

server {
    listen 80;
    server_name gallery.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

Then update `docker-compose.prod.yml` to expose nginx on 8080:

```yaml
nginx:
  # ...
  ports:
    - "8080:80" # Expose on 8080, host nginx handles 80/443
```

### Step 6: Update docker-compose.prod.yml for External Access

For direct deployment (without Cloudflare/Traefik), expose nginx on port 80:

```yaml
nginx:
  build:
    context: ./docker/nginx
    dockerfile: Dockerfile
  restart: unless-stopped
  ports:
    - "80:80" # Expose port 80 to the internet
  depends_on:
    frontend:
      condition: service_started
    backend:
      condition: service_healthy
```

### Step 7: Build and Deploy

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f docker-compose.prod.yml logs -f backend
```

### Step 8: Initial Setup

1. Open your browser to `https://gallery.yourdomain.com`
2. You'll be redirected to the setup page
3. Create your admin account
4. Start uploading photos!

### Step 9: Firewall Configuration

Ensure your firewall allows web traffic:

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Or iptables
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

### Updating Your Deployment

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Or rebuild specific service
docker compose -f docker-compose.prod.yml up -d --build backend
```

### Backup Strategy

```bash
# Backup database
docker exec clientpix-postgres pg_dump -U clientpix clientpix > backup_$(date +%Y%m%d).sql

# Backup uploads (if using named volume)
docker run --rm -v client-pix_uploads_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads_backup_$(date +%Y%m%d).tar.gz -C /data .

# Restore database
cat backup_20240115.sql | docker exec -i clientpix-postgres psql -U clientpix clientpix

# Restore uploads
docker run --rm -v client-pix_uploads_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/uploads_backup_20240115.tar.gz -C /data
```

---

## Coolify Deployment

### Prerequisites

- Coolify instance running
- Domain pointing to your Coolify server
- Git repository with your code

### Step 1: Create New Project

1. In Coolify dashboard, click "New Project"
2. Select "Docker Compose" as the deployment method
3. Connect your Git repository

### Step 2: Configure Compose File

Select `docker-compose.prod.yml` as your compose file.

### Step 3: Set Environment Variables

In Coolify's environment settings, add:

```env
# Required
BASE_URL=https://gallery.yourdomain.com
NEXT_PUBLIC_API_URL=https://gallery.yourdomain.com
POSTGRES_PASSWORD=<generate-strong-password>

# Optional (use defaults or customize)
APP_NAME=Client Pix
DEBUG=false
POSTGRES_USER=clientpix
POSTGRES_DB=clientpix
ALLOWED_ORIGINS=https://gallery.yourdomain.com
```

### Step 4: Configure Domain

1. In Coolify, go to your project's "Domains" section
2. Add your domain (e.g., `gallery.yourdomain.com`)
3. Coolify will automatically provision SSL via Traefik

### Step 5: Configure Volumes

Ensure persistent storage is configured:

- `postgres_data` - Database storage
- `uploads_data` - Photo uploads

Coolify handles this automatically with Docker volumes.

### Step 6: Deploy

Click "Deploy" and monitor the build logs.

### Coolify & Environment Variables

**Q: How do I set environment variables in Coolify?**

1. Use Coolify's "Environment Variables" UI to set variables
2. See `.env.example` in the repo for all available options
3. Only `POSTGRES_PASSWORD` is required - everything else has sensible defaults

Coolify will inject environment variables into your containers at runtime.

---

## Share Links & DNS

### How Share Links Work

1. User creates a share link via the UI
2. Backend generates a secure token (`secrets.token_urlsafe(32)`)
3. Full URL is built using `BASE_URL` environment variable
4. Link format: `{BASE_URL}/share/{token}`

### DNS Configuration

For share links to work publicly:

1. Point your domain's DNS to your server's IP:

   ```
   A record: gallery.yourdomain.com -> YOUR_SERVER_IP
   ```

2. If using Coolify, it handles routing via Traefik

3. Set `BASE_URL` to your full domain:
   ```
   BASE_URL=https://gallery.yourdomain.com
   ```

### Nginx Routing

The Nginx config routes `/share/*` to the Next.js frontend:

```nginx
location / {
    proxy_pass http://frontend;
    # ...
}
```

Next.js handles the `/share/[token]` route and communicates with the backend API.

---

## Troubleshooting

### Forgot Admin Password

Since Client Pix is self-hosted and doesn't use email, password resets are done via a CLI script that requires server access.

**Reset password via Docker (recommended):**

```bash
docker compose exec backend uv run python scripts/reset_password.py
```

This interactive script will:

1. List all admin accounts
2. Let you select which account to reset
3. Prompt for a new password (min 8 characters)
4. Optionally disable 2FA if it was enabled

**If running locally (hybrid development):**

```bash
cd apps/python
uv run python scripts/reset_password.py
```

**Direct database reset (advanced):**

If the script doesn't work, you can reset directly in the database:

```bash
# Generate a bcrypt hash for your new password
docker compose exec backend python -c "
from utils.security_util import hash_password
print(hash_password('your-new-password'))
"

# Update the password in the database
docker compose exec postgres psql -U clientpix -d clientpix -c "
UPDATE admins SET password_hash = 'PASTE_HASH_HERE' WHERE email = 'your@email.com';
"

# If you also need to disable 2FA:
docker compose exec postgres psql -U clientpix -d clientpix -c "
UPDATE admins SET totp_enabled = false, totp_secret = NULL, backup_codes = NULL WHERE email = 'your@email.com';
"
```

### Share links return 404

1. Check `BASE_URL` is set correctly
2. Verify Nginx is routing to the frontend
3. Check the share token exists in the database

### CORS errors

1. Verify `ALLOWED_ORIGINS` includes your domain
2. Check that the protocol matches (http vs https)
3. Restart the backend after changing CORS settings

### Images not loading

1. Check uploads volume is mounted correctly
2. Verify Nginx has read access to uploads directory
3. Check Nginx logs: `docker logs clientpix-nginx`

### Database connection errors

1. Verify `DATABASE_URL` format is correct
2. Check PostgreSQL container is healthy
3. Ensure password matches in both `DATABASE_URL` and `POSTGRES_PASSWORD`

---

## Upgrading

> **Using Coolify or a managed platform?** You don't need these scripts - Coolify handles upgrades automatically (pulls from GitHub, rebuilds containers, preserves volumes). The scripts below are for manual self-hosted deployments on a VPS or server.

### Quick Upgrade (Recommended)

Use the unified upgrade script for one-command upgrades with automatic backup and rollback:

```bash
./upgrade.sh
```

This will:

1. Create a database backup
2. Pull latest code from git
3. Rebuild and restart containers
4. Run health checks
5. Offer automatic rollback if something fails

**Options:**

```bash
./upgrade.sh --help              # Show all options
./upgrade.sh --no-backup         # Skip backup (fresh installs)
./upgrade.sh --rollback <file>   # Rollback from backup
```

### Rollback

If you need to restore from a previous backup:

```bash
./upgrade.sh --rollback ./backups/YYYYMMDD_HHMMSS/database.sql
```

### Data Safety

Your data is stored in Docker volumes (`postgres_data`, `uploads_data`). These are preserved during normal upgrades. The upgrade script automatically creates backups and keeps the last 5.

> **Note:** The `-v` flag in `docker compose down -v` deletes volumes. The upgrade script never uses this flag.

### Manual Upgrade (Advanced)

If you prefer manual control:

```bash
# 1. Create backup
./scripts/pre-upgrade.sh docker-compose.selfhost.yml

# 2. Pull and rebuild
git pull origin main
docker compose -f docker-compose.selfhost.yml up -d --build

# 3. Verify
./scripts/health-check.sh docker-compose.selfhost.yml

# 4. Rollback if needed
./scripts/rollback.sh docker-compose.selfhost.yml ./backups/*/database.sql
```
