#!/bin/bash
# =============================================================================
# Record Deployment - Tracks all deployments for history and rollback
# =============================================================================

DEPLOY_DIR="/opt/ctx-quiz"
HISTORY_FILE="$DEPLOY_DIR/deployment-history.json"

DEPLOYMENT_ID="$1"
GIT_SHA="$2"
ACTOR="$3"
STATUS="$4"

# Initialize history file if it doesn't exist
if [ ! -f "$HISTORY_FILE" ]; then
    echo '{"deployments": []}' > "$HISTORY_FILE"
fi

# Add new deployment record
TIMESTAMP=$(date -Iseconds)

# Create new entry
NEW_ENTRY=$(cat << EOF
{
  "id": "$DEPLOYMENT_ID",
  "git_sha": "$GIT_SHA",
  "deployed_by": "$ACTOR",
  "deployed_at": "$TIMESTAMP",
  "status": "$STATUS"
}
EOF
)

# Add to history (keep last 50 deployments)
jq --argjson entry "$NEW_ENTRY" '.deployments = ([$entry] + .deployments) | .deployments = .deployments[:50]' "$HISTORY_FILE" > "${HISTORY_FILE}.tmp"
mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE"

echo "✅ Deployment recorded: $DEPLOYMENT_ID"
