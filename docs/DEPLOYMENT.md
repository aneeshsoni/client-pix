# Deployment Guide

This guide covers deploying Client Pix to production, including security considerations, local testing, and deployment on platforms like Coolify.

## Table of Contents

1. [Local Testing](#local-testing)
2. [Security Considerations](#security-considerations)
3. [Environment Variables](#environment-variables)
4. [Coolify Deployment](#coolify-deployment)
5. [Share Links & DNS](#share-links--dns)

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

- User authentication (admin login)
- JWT tokens for API authentication
- Rate limiting
- File scanning/virus detection
- Audit logging

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

**Q: Does Coolify pick up `.env.template` files?**

No, Coolify doesn't automatically read `.env.template`. Instead:

1. Use Coolify's "Environment Variables" UI to set variables
2. Or create a `.env` file in the Coolify UI
3. The `.env.template` serves as documentation for which variables are needed

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
