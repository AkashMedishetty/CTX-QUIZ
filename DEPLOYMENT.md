# CTX Quiz - Deployment Guide

## 🚀 Atomic Deployment System

CTX Quiz uses a Vercel-like atomic deployment system with:
- **Unique Deployment IDs** - Every deployment gets a unique ID (e.g., `deploy-20240115-143022-abc12345`)
- **Instant Rollbacks** - Roll back to any previous deployment in seconds
- **Zero-Downtime Deployments** - New versions are deployed without interrupting users
- **Automatic SSL** - Let's Encrypt certificates with auto-renewal
- **Health Checks** - Automatic rollback if deployment fails health checks

## 📋 Quick Start

### 1. Initial VPS Setup (One-time)

SSH into your VPS and run:

```bash
# Download and run setup script
curl -sSL https://raw.githubusercontent.com/AkashMedishetty/CTX-QUIZ/main/deploy/setup-vps.sh | bash
```

This will:
- Install Docker and Docker Compose
- Configure firewall (UFW)
- Set up SSL certificates
- Create directory structure
- Configure Nginx

### 2. Configure GitHub Secrets

Go to your repository settings → Secrets → Actions and add:

| Secret | Value |
|--------|-------|
| `VPS_SSH_KEY` | Your SSH private key for the VPS |

### 3. Deploy

Push to `main` branch - deployment happens automatically!

```bash
git push origin main
```

## 🔄 Deployment Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Push to   │────▶│   GitHub    │────▶│   Build     │
│    main     │     │   Actions   │     │   Images    │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Health    │◀────│   Deploy    │◀────│   Push to   │
│   Check     │     │   to VPS    │     │   Registry  │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Success   │────▶│    LIVE!    │
└─────────────┘     └─────────────┘
       │
       ▼ (on failure)
┌─────────────┐
│  Auto       │
│  Rollback   │
└─────────────┘
```

## 📊 Deployment Management

### List Deployments

```bash
# On VPS
ctx-deploy list

# Output:
# DEPLOYMENT ID                              CREATED              STATUS
# ─────────────────────────────────────────────────────────────────────────
# deploy-20240115-143022-abc12345            2024-01-15           ● ACTIVE
# deploy-20240114-091533-def67890            2024-01-14           ○ Ready
# deploy-20240113-162045-ghi11223            2024-01-13           ○ Ready
```

### Check Status

```bash
ctx-deploy status

# Output:
# Current Deployment:  deploy-20240115-143022-abc12345
# Domain:              https://vm701294211.manageserver.in
#
# Services:
#   ● ctx-nginx: running (healthy)
#   ● ctx-backend: running (healthy)
#   ● ctx-frontend: running (healthy)
#   ● ctx-mongodb: running (healthy)
#   ● ctx-redis: running (healthy)
```

### Rollback

```bash
# Rollback to previous deployment
ctx-deploy rollback

# Rollback to specific deployment
ctx-deploy rollback deploy-20240114-091533-def67890

# Via GitHub Actions (from your local machine)
gh workflow run deploy.yml -f rollback_to=deploy-20240114-091533-def67890
```

### View Logs

```bash
ctx-deploy logs backend
ctx-deploy logs frontend
ctx-deploy logs nginx
```

### Health Check

```bash
ctx-deploy health
```

## 🔐 SSL Certificates

SSL certificates are automatically managed:

1. **Initial Setup**: Self-signed certificate is created during VPS setup
2. **Let's Encrypt**: Real certificate is obtained automatically
3. **Auto-Renewal**: Certificates renew automatically every 12 hours (if needed)

### Manual Certificate Renewal

```bash
docker exec ctx-certbot certbot renew --force-renewal
docker exec ctx-nginx nginx -s reload
```

## 📁 Directory Structure

```
/opt/ctx-quiz/
├── current -> deployments/deploy-xxx    # Symlink to active deployment
├── deployments/                          # All deployment versions
│   ├── deploy-20240115-143022-abc12345/
│   ├── deploy-20240114-091533-def67890/
│   └── ...
├── data/                                 # Persistent data
│   ├── mongodb/                          # MongoDB data
│   ├── redis/                            # Redis data
│   └── uploads/                          # User uploads
├── ssl/                                  # SSL certificates
├── logs/                                 # Application logs
├── deploy/                               # Deployment scripts
│   ├── atomic-deploy.sh
│   ├── ctx-deploy
│   └── ...
├── docker-compose.prod.yml
└── nginx.prod.conf
```

## 🔧 Configuration

### Environment Variables

Each deployment has its own `.env` file with:

```env
# Docker Images
BACKEND_IMAGE=ghcr.io/akashmedishetty/ctx-quiz/backend:deploy-xxx
FRONTEND_IMAGE=ghcr.io/akashmedishetty/ctx-quiz/frontend:deploy-xxx

# Domain
DOMAIN=vm701294211.manageserver.in

# Application
NODE_ENV=production
JWT_SECRET=<auto-generated>

# Database
MONGODB_URI=mongodb://admin:<password>@mongodb:27017/quiz_platform?authSource=admin
REDIS_URL=redis://redis:6379

# URLs
FRONTEND_URL=https://vm701294211.manageserver.in
NEXT_PUBLIC_API_URL=https://vm701294211.manageserver.in
NEXT_PUBLIC_WS_URL=wss://vm701294211.manageserver.in
```

### Resource Limits

Default resource limits (can be adjusted in `docker-compose.prod.yml`):

| Service | Memory Limit |
|---------|--------------|
| Backend | 512MB |
| Frontend | 256MB |
| MongoDB | 512MB |
| Redis | 256MB |

## 🚨 Troubleshooting

### Deployment Failed

1. Check GitHub Actions logs
2. SSH to VPS and check:
   ```bash
   ctx-deploy status
   ctx-deploy logs backend
   ```
3. Manual rollback if needed:
   ```bash
   ctx-deploy rollback
   ```

### Services Not Starting

```bash
# Check all container logs
docker compose -f /opt/ctx-quiz/docker-compose.prod.yml logs

# Restart all services
docker compose -f /opt/ctx-quiz/docker-compose.prod.yml restart
```

### SSL Certificate Issues

```bash
# Check certificate status
openssl s_client -connect vm701294211.manageserver.in:443 -servername vm701294211.manageserver.in

# Force renewal
docker exec ctx-certbot certbot renew --force-renewal
```

### Database Connection Issues

```bash
# Check MongoDB
docker exec ctx-mongodb mongosh --eval "db.adminCommand('ping')"

# Check Redis
docker exec ctx-redis redis-cli ping
```

## 📈 Monitoring

### Health Endpoint

```bash
curl https://vm701294211.manageserver.in/api/health
```

### Resource Usage

```bash
docker stats ctx-backend ctx-frontend ctx-mongodb ctx-redis ctx-nginx
```

## 🔒 Security

- All traffic is encrypted via HTTPS
- WebSocket connections use WSS
- Rate limiting on API endpoints
- Non-root users in containers
- Firewall configured (UFW)
- Fail2ban for SSH protection

## 📞 Support

- **Repository**: https://github.com/AkashMedishetty/CTX-QUIZ
- **Issues**: https://github.com/AkashMedishetty/CTX-QUIZ/issues
