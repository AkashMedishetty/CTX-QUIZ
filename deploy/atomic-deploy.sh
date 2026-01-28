#!/bin/bash
# =============================================================================
# CTX Quiz - Atomic Deployment Script
# =============================================================================
# Vercel-like atomic deployments with:
# - Zero-downtime deployments
# - Instant rollbacks
# - Deployment versioning
# - Health checks
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
DEPLOY_DIR="/opt/ctx-quiz"
DEPLOYMENTS_DIR="$DEPLOY_DIR/deployments"
CURRENT_LINK="$DEPLOY_DIR/current"
LOGS_DIR="$DEPLOY_DIR/logs"
MAX_DEPLOYMENTS=10

# Parse arguments
DEPLOYMENT_ID=""
REGISTRY=""
IMAGE_NAME=""
DOMAIN=""
IS_ROLLBACK=false
ROLLBACK_TO_PREVIOUS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --deployment-id) DEPLOYMENT_ID="$2"; shift 2 ;;
        --registry) REGISTRY="$2"; shift 2 ;;
        --image-name) IMAGE_NAME="$2"; shift 2 ;;
        --domain) DOMAIN="$2"; shift 2 ;;
        --rollback) IS_ROLLBACK=true; shift ;;
        --rollback-to-previous) ROLLBACK_TO_PREVIOUS=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# =============================================================================
# Helper Functions
# =============================================================================

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# =============================================================================
# Get Previous Deployment
# =============================================================================

get_previous_deployment() {
    if [ -L "$CURRENT_LINK" ]; then
        CURRENT_DEPLOY=$(readlink -f "$CURRENT_LINK")
        CURRENT_ID=$(basename "$CURRENT_DEPLOY")
        
        # Find the deployment before current
        PREV_ID=$(ls -1t "$DEPLOYMENTS_DIR" 2>/dev/null | grep -v "^$CURRENT_ID$" | head -1)
        echo "$PREV_ID"
    fi
}

# =============================================================================
# Rollback to Previous
# =============================================================================

if [ "$ROLLBACK_TO_PREVIOUS" = true ]; then
    header "🔄 Rolling Back to Previous Deployment"
    
    PREV_DEPLOYMENT=$(get_previous_deployment)
    
    if [ -z "$PREV_DEPLOYMENT" ]; then
        error "No previous deployment found!"
        exit 1
    fi
    
    log "Rolling back to: $PREV_DEPLOYMENT"
    DEPLOYMENT_ID="$PREV_DEPLOYMENT"
    IS_ROLLBACK=true
fi

# =============================================================================
# Validate Arguments
# =============================================================================

if [ -z "$DEPLOYMENT_ID" ]; then
    error "Deployment ID is required!"
    exit 1
fi

header "🚀 CTX Quiz Atomic Deployment"
log "Deployment ID: $DEPLOYMENT_ID"
log "Is Rollback: $IS_ROLLBACK"
log "Domain: $DOMAIN"

# =============================================================================
# Setup Directories
# =============================================================================

mkdir -p "$DEPLOYMENTS_DIR"
mkdir -p "$LOGS_DIR"
mkdir -p "$DEPLOY_DIR/data/mongodb"
mkdir -p "$DEPLOY_DIR/data/redis"
mkdir -p "$DEPLOY_DIR/data/uploads"
mkdir -p "$DEPLOY_DIR/ssl"

DEPLOY_PATH="$DEPLOYMENTS_DIR/$DEPLOYMENT_ID"

# =============================================================================
# Handle Rollback
# =============================================================================

if [ "$IS_ROLLBACK" = true ]; then
    header "🔄 Executing Rollback"
    
    if [ ! -d "$DEPLOY_PATH" ]; then
        error "Deployment $DEPLOYMENT_ID not found!"
        exit 1
    fi
    
    log "Switching to deployment: $DEPLOYMENT_ID"
    
    # Update symlink atomically
    ln -sfn "$DEPLOY_PATH" "${CURRENT_LINK}.new"
    mv -Tf "${CURRENT_LINK}.new" "$CURRENT_LINK"
    
    # Restart services with the rolled-back configuration
    cd "$CURRENT_LINK"
    docker compose -f docker-compose.prod.yml pull
    docker compose -f docker-compose.prod.yml up -d --remove-orphans
    
    success "Rollback to $DEPLOYMENT_ID complete!"
    exit 0
fi

# =============================================================================
# Create New Deployment
# =============================================================================

header "📦 Creating New Deployment"

mkdir -p "$DEPLOY_PATH"

# Copy configuration files
cp "$DEPLOY_DIR/docker-compose.prod.yml" "$DEPLOY_PATH/"
cp "$DEPLOY_DIR/nginx.prod.conf" "$DEPLOY_PATH/"

# Create deployment-specific .env file
# Note: Uses existing .env from /opt/ctx-quiz/.env for MongoDB Atlas credentials
cat > "$DEPLOY_PATH/.env" << EOF
# Deployment: $DEPLOYMENT_ID
# Generated: $(date -Iseconds)

# Docker Images
BACKEND_IMAGE=${REGISTRY}/${IMAGE_NAME}/backend:${DEPLOYMENT_ID}
FRONTEND_IMAGE=${REGISTRY}/${IMAGE_NAME}/frontend:${DEPLOYMENT_ID}

# Domain
DOMAIN=${DOMAIN}

# Paths
DATA_DIR=$DEPLOY_DIR/data
SSL_DIR=$DEPLOY_DIR/ssl

# Application
NODE_ENV=production
JWT_SECRET=$(openssl rand -hex 32)

# MongoDB Atlas (Cloud Database) - loaded from base .env
MONGODB_URI=\${MONGODB_URI:-mongodb+srv://quizdb:9wpPQmEML1uqvXy0@quiz.lxlv4nr.mongodb.net/?appName=quiz}
MONGODB_DB_NAME=quiz_platform

# Redis
REDIS_URL=redis://redis:6379

# URLs
FRONTEND_URL=https://${DOMAIN}
NEXT_PUBLIC_API_URL=https://${DOMAIN}
NEXT_PUBLIC_WS_URL=wss://${DOMAIN}
EOF

# Merge with base .env if it exists (for MongoDB Atlas credentials)
if [ -f "$DEPLOY_DIR/.env" ]; then
    # Extract MONGODB_URI from base .env if not already set
    BASE_MONGO_URI=$(grep "^MONGODB_URI=" "$DEPLOY_DIR/.env" | cut -d'=' -f2-)
    if [ -n "$BASE_MONGO_URI" ]; then
        sed -i "s|MONGODB_URI=.*|MONGODB_URI=$BASE_MONGO_URI|" "$DEPLOY_PATH/.env"
    fi
fi

# Store deployment metadata
cat > "$DEPLOY_PATH/metadata.json" << EOF
{
  "deployment_id": "$DEPLOYMENT_ID",
  "created_at": "$(date -Iseconds)",
  "registry": "$REGISTRY",
  "image_name": "$IMAGE_NAME",
  "domain": "$DOMAIN",
  "git_sha": "${GITHUB_SHA:-unknown}"
}
EOF

# =============================================================================
# Pull Images
# =============================================================================

header "📥 Pulling Docker Images"

cd "$DEPLOY_PATH"

# Source the env file
set -a
source .env
set +a

docker pull "${REGISTRY}/${IMAGE_NAME}/backend:${DEPLOYMENT_ID}"
docker pull "${REGISTRY}/${IMAGE_NAME}/frontend:${DEPLOYMENT_ID}"

success "Images pulled successfully"

# =============================================================================
# Health Check Function
# =============================================================================

health_check() {
    local max_attempts=30
    local attempt=1
    
    log "Running health checks..."
    
    while [ $attempt -le $max_attempts ]; do
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/api/health" 2>/dev/null || echo "000")
        
        if [ "$HTTP_STATUS" = "200" ]; then
            success "Health check passed!"
            return 0
        fi
        
        log "Attempt $attempt/$max_attempts - Status: $HTTP_STATUS"
        sleep 2
        ((attempt++))
    done
    
    error "Health check failed after $max_attempts attempts"
    return 1
}

# =============================================================================
# Deploy with Zero Downtime
# =============================================================================

header "🚀 Deploying with Zero Downtime"

# Start new containers alongside old ones
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# Wait for containers to be healthy
sleep 10

# Run health check
if ! health_check; then
    error "New deployment failed health check!"
    
    # Rollback to previous
    PREV_DEPLOYMENT=$(get_previous_deployment)
    if [ -n "$PREV_DEPLOYMENT" ]; then
        warn "Rolling back to previous deployment: $PREV_DEPLOYMENT"
        ln -sfn "$DEPLOYMENTS_DIR/$PREV_DEPLOYMENT" "${CURRENT_LINK}.new"
        mv -Tf "${CURRENT_LINK}.new" "$CURRENT_LINK"
        cd "$CURRENT_LINK"
        docker compose -f docker-compose.prod.yml up -d --remove-orphans
    fi
    
    exit 1
fi

# =============================================================================
# Atomic Symlink Switch
# =============================================================================

header "🔗 Switching to New Deployment"

# Create new symlink
ln -sfn "$DEPLOY_PATH" "${CURRENT_LINK}.new"

# Atomic move
mv -Tf "${CURRENT_LINK}.new" "$CURRENT_LINK"

success "Symlink updated: $CURRENT_LINK -> $DEPLOY_PATH"

# =============================================================================
# Cleanup Old Deployments
# =============================================================================

header "🧹 Cleaning Up Old Deployments"

# Keep only the last N deployments
DEPLOYMENT_COUNT=$(ls -1 "$DEPLOYMENTS_DIR" | wc -l)

if [ "$DEPLOYMENT_COUNT" -gt "$MAX_DEPLOYMENTS" ]; then
    DEPLOYMENTS_TO_DELETE=$((DEPLOYMENT_COUNT - MAX_DEPLOYMENTS))
    
    ls -1t "$DEPLOYMENTS_DIR" | tail -n "$DEPLOYMENTS_TO_DELETE" | while read OLD_DEPLOY; do
        log "Removing old deployment: $OLD_DEPLOY"
        rm -rf "$DEPLOYMENTS_DIR/$OLD_DEPLOY"
    done
    
    success "Cleaned up $DEPLOYMENTS_TO_DELETE old deployments"
else
    log "No cleanup needed ($DEPLOYMENT_COUNT deployments, max $MAX_DEPLOYMENTS)"
fi

# Prune unused Docker images
docker image prune -f --filter "until=24h"

# =============================================================================
# Final Status
# =============================================================================

header "✅ Deployment Complete"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎉 Deployment Successful!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Deployment ID:${NC}  $DEPLOYMENT_ID"
echo -e "  ${CYAN}Domain:${NC}         https://$DOMAIN"
echo -e "  ${CYAN}Status:${NC}         ${GREEN}LIVE${NC}"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
