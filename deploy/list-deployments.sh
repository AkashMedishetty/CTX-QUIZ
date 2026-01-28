#!/bin/bash
# =============================================================================
# List Deployments - Shows all available deployments for rollback
# =============================================================================

DEPLOY_DIR="/opt/ctx-quiz"
DEPLOYMENTS_DIR="$DEPLOY_DIR/deployments"
CURRENT_LINK="$DEPLOY_DIR/current"
HISTORY_FILE="$DEPLOY_DIR/deployment-history.json"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}                        CTX Quiz - Deployments                              ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

# Get current deployment
CURRENT_DEPLOY=""
if [ -L "$CURRENT_LINK" ]; then
    CURRENT_DEPLOY=$(basename "$(readlink -f "$CURRENT_LINK")")
fi

echo -e "${BLUE}Current Active Deployment:${NC} ${GREEN}$CURRENT_DEPLOY${NC}"
echo ""

# List all deployments
echo -e "${BLUE}Available Deployments:${NC}"
echo ""
printf "%-40s %-25s %-10s\n" "DEPLOYMENT ID" "CREATED" "STATUS"
echo "────────────────────────────────────────────────────────────────────────────"

ls -1t "$DEPLOYMENTS_DIR" 2>/dev/null | while read DEPLOY; do
    METADATA_FILE="$DEPLOYMENTS_DIR/$DEPLOY/metadata.json"
    
    if [ -f "$METADATA_FILE" ]; then
        CREATED=$(jq -r '.created_at' "$METADATA_FILE" 2>/dev/null | cut -d'T' -f1,2 | tr 'T' ' ')
    else
        CREATED=$(stat -c %y "$DEPLOYMENTS_DIR/$DEPLOY" 2>/dev/null | cut -d'.' -f1)
    fi
    
    if [ "$DEPLOY" = "$CURRENT_DEPLOY" ]; then
        STATUS="${GREEN}● ACTIVE${NC}"
    else
        STATUS="${YELLOW}○ Available${NC}"
    fi
    
    printf "%-40s %-25s " "$DEPLOY" "$CREATED"
    echo -e "$STATUS"
done

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Rollback Commands:${NC}"
echo ""
echo "  # Rollback to specific deployment:"
echo "  ./deploy/atomic-deploy.sh --deployment-id <DEPLOYMENT_ID> --rollback"
echo ""
echo "  # Rollback to previous deployment:"
echo "  ./deploy/atomic-deploy.sh --rollback-to-previous"
echo ""
echo "  # Via GitHub Actions:"
echo "  gh workflow run deploy.yml -f rollback_to=<DEPLOYMENT_ID>"
echo ""
