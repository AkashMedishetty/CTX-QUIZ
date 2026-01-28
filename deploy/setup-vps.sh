#!/bin/bash
# =============================================================================
# CTX Quiz - VPS Initial Setup Script
# =============================================================================
# Run this script ONCE on a fresh Ubuntu 24.04 VPS to set up everything
# Usage: curl -sSL https://raw.githubusercontent.com/AkashMedishetty/CTX-QUIZ/main/deploy/setup-vps.sh | bash
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
DOMAIN="${DOMAIN:-vm701294211.manageserver.in}"
EMAIL="${EMAIL:-admin@ctx.works}"
DEPLOY_DIR="/opt/ctx-quiz"

log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }

header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# =============================================================================
header "🚀 CTX Quiz VPS Setup"
# =============================================================================

log "Domain: $DOMAIN"
log "Deploy Directory: $DEPLOY_DIR"

# =============================================================================
header "📦 Installing System Dependencies"
# =============================================================================

apt-get update
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    software-properties-common \
    ufw \
    fail2ban \
    htop \
    jq \
    git

success "System dependencies installed"

# =============================================================================
header "🐳 Installing Docker"
# =============================================================================

if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    success "Docker installed"
else
    log "Docker already installed"
fi

# Install Docker Compose plugin
apt-get install -y docker-compose-plugin
success "Docker Compose installed"

# =============================================================================
header "🔒 Configuring Firewall"
# =============================================================================

ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

success "Firewall configured"

# =============================================================================
header "📁 Creating Directory Structure"
# =============================================================================

mkdir -p "$DEPLOY_DIR"/{deployments,logs,data/{mongodb,redis,uploads},ssl}
chmod -R 755 "$DEPLOY_DIR"

success "Directory structure created"

# =============================================================================
header "🔐 Installing Certbot for SSL"
# =============================================================================

apt-get install -y certbot

# Create initial self-signed certificate for nginx to start
if [ ! -f "$DEPLOY_DIR/ssl/fullchain.pem" ]; then
    log "Creating temporary self-signed certificate..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$DEPLOY_DIR/ssl/privkey.pem" \
        -out "$DEPLOY_DIR/ssl/fullchain.pem" \
        -subj "/CN=$DOMAIN"
    success "Temporary SSL certificate created"
fi

# =============================================================================
header "📝 Creating Docker Compose Production File"
# =============================================================================

cat > "$DEPLOY_DIR/docker-compose.prod.yml" << 'COMPOSE_EOF'
version: '3.8'

services:
  # MongoDB
  mongodb:
    image: mongo:7
    container_name: ctx-mongodb
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_INITDB_ROOT_USERNAME:-admin}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_INITDB_ROOT_PASSWORD:-changeme}
      MONGO_INITDB_DATABASE: quiz_platform
    volumes:
      - ${DATA_DIR:-/opt/ctx-quiz/data}/mongodb:/data/db
    networks:
      - ctx-network
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Redis
  redis:
    image: redis:7-alpine
    container_name: ctx-redis
    restart: unless-stopped
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly yes
    volumes:
      - ${DATA_DIR:-/opt/ctx-quiz/data}/redis:/data
    networks:
      - ctx-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Backend API
  backend:
    image: ${BACKEND_IMAGE:-ghcr.io/akashmedishetty/ctx-quiz/backend:latest}
    container_name: ctx-backend
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3001
      MONGODB_URI: ${MONGODB_URI}
      REDIS_URL: ${REDIS_URL:-redis://redis:6379}
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_URL: ${FRONTEND_URL}
    volumes:
      - ${DATA_DIR:-/opt/ctx-quiz/data}/uploads:/app/uploads
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - ctx-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3001/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Frontend
  frontend:
    image: ${FRONTEND_IMAGE:-ghcr.io/akashmedishetty/ctx-quiz/frontend:latest}
    container_name: ctx-frontend
    restart: unless-stopped
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
      NEXT_PUBLIC_WS_URL: ${NEXT_PUBLIC_WS_URL}
    depends_on:
      - backend
    networks:
      - ctx-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: ctx-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.prod.conf:/etc/nginx/nginx.conf:ro
      - ${SSL_DIR:-/opt/ctx-quiz/ssl}:/etc/nginx/ssl:ro
      - /var/www/certbot:/var/www/certbot:ro
    depends_on:
      - backend
      - frontend
    networks:
      - ctx-network

  # Certbot for SSL renewal
  certbot:
    image: certbot/certbot
    container_name: ctx-certbot
    volumes:
      - ${SSL_DIR:-/opt/ctx-quiz/ssl}:/etc/letsencrypt
      - /var/www/certbot:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew --webroot -w /var/www/certbot; sleep 12h & wait $${!}; done;'"
    networks:
      - ctx-network

networks:
  ctx-network:
    driver: bridge
COMPOSE_EOF

success "Docker Compose file created"

# =============================================================================
header "📝 Creating Nginx Production Config"
# =============================================================================

cat > "$DEPLOY_DIR/nginx.prod.conf" << NGINX_EOF
events {
    worker_connections 2048;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '\$remote_addr - \$remote_user [\$time_local] "\$request" '
                    '\$status \$body_bytes_sent "\$http_referer" '
                    '"\$http_user_agent" "\$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api_limit:10m rate=100r/m;
    limit_req_zone \$binary_remote_addr zone=join_limit:10m rate=10r/m;
    limit_conn_zone \$binary_remote_addr zone=conn_limit:10m;

    # WebSocket upgrade map
    map \$http_upgrade \$connection_upgrade {
        default upgrade;
        '' close;
    }

    # Upstreams
    upstream backend {
        server backend:3001;
        keepalive 32;
    }

    upstream frontend {
        server frontend:3000;
        keepalive 32;
    }

    # HTTP -> HTTPS redirect
    server {
        listen 80;
        server_name $DOMAIN;

        # Let's Encrypt challenge
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        # Redirect all other traffic to HTTPS
        location / {
            return 301 https://\$server_name\$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name $DOMAIN;

        # SSL Configuration
        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;

        # Security headers
        add_header Strict-Transport-Security "max-age=63072000" always;
        add_header X-Frame-Options DENY always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # Connection limits
        limit_conn conn_limit 50;

        # Frontend
        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection \$connection_upgrade;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }

        # Backend API
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        # Join endpoint (stricter rate limit)
        location /api/sessions/join {
            limit_req zone=join_limit burst=5 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        # WebSocket (Socket.IO)
        location /socket.io/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection \$connection_upgrade;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            
            # WebSocket timeouts
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
            proxy_connect_timeout 60s;
            
            # Disable buffering
            proxy_buffering off;
            proxy_socket_keepalive on;
        }

        # Health check
        location /health {
            proxy_pass http://backend/api/health;
            access_log off;
        }
    }
}
NGINX_EOF

success "Nginx config created"

# =============================================================================
header "🔐 Obtaining SSL Certificate"
# =============================================================================

mkdir -p /var/www/certbot

# Stop any running nginx first
docker stop ctx-nginx 2>/dev/null || true

# Get real SSL certificate
log "Obtaining SSL certificate for $DOMAIN..."
certbot certonly --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --domains "$DOMAIN" \
    --cert-path "$DEPLOY_DIR/ssl/fullchain.pem" \
    --key-path "$DEPLOY_DIR/ssl/privkey.pem" \
    || warn "Could not obtain Let's Encrypt certificate. Using self-signed."

# Copy certificates to the right location
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$DEPLOY_DIR/ssl/"
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$DEPLOY_DIR/ssl/"
    success "SSL certificate obtained and installed"
fi

# Setup auto-renewal
cat > /etc/cron.d/certbot-renew << CRON_EOF
0 0,12 * * * root certbot renew --quiet --deploy-hook "docker exec ctx-nginx nginx -s reload"
CRON_EOF

success "SSL auto-renewal configured"

# =============================================================================
header "📋 Creating Deployment Scripts"
# =============================================================================

mkdir -p "$DEPLOY_DIR/deploy"

# Copy deployment scripts (they should be in the repo)
log "Deployment scripts will be copied from the repository during first deployment"

# Create a simple manual deploy script
cat > "$DEPLOY_DIR/manual-deploy.sh" << 'MANUAL_EOF'
#!/bin/bash
# Manual deployment script - use when GitHub Actions is not available

set -e

DEPLOY_DIR="/opt/ctx-quiz"
cd "$DEPLOY_DIR"

# Pull latest images
docker compose -f docker-compose.prod.yml pull

# Deploy with zero downtime
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# Wait and check health
sleep 10
curl -f http://localhost:3001/api/health || exit 1

echo "✅ Deployment complete!"
MANUAL_EOF

chmod +x "$DEPLOY_DIR/manual-deploy.sh"

success "Deployment scripts created"

# =============================================================================
header "🔑 SSH Key Setup Instructions"
# =============================================================================

echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  IMPORTANT: GitHub Actions SSH Key Setup${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "To enable automatic deployments, you need to:"
echo ""
echo "1. Generate an SSH key pair (if not already done):"
echo "   ssh-keygen -t ed25519 -C 'github-actions-deploy' -f ~/.ssh/github_deploy"
echo ""
echo "2. Add the public key to this server:"
echo "   cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys"
echo ""
echo "3. Add the private key to GitHub Secrets:"
echo "   - Go to: https://github.com/AkashMedishetty/CTX-QUIZ/settings/secrets/actions"
echo "   - Create secret: VPS_SSH_KEY"
echo "   - Paste the contents of: ~/.ssh/github_deploy"
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# =============================================================================
header "✅ Setup Complete!"
# =============================================================================

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎉 VPS Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Domain:${NC}         https://$DOMAIN"
echo -e "  ${CYAN}Deploy Dir:${NC}     $DEPLOY_DIR"
echo -e "  ${CYAN}SSL Status:${NC}     $([ -f "$DEPLOY_DIR/ssl/fullchain.pem" ] && echo "✅ Configured" || echo "⚠️ Self-signed")"
echo ""
echo -e "  ${BLUE}Next Steps:${NC}"
echo "  1. Add VPS_SSH_KEY to GitHub Secrets"
echo "  2. Push to main branch to trigger deployment"
echo "  3. Or run: $DEPLOY_DIR/manual-deploy.sh"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
