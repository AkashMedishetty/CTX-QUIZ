# MongoDB Atlas Backup Configuration Guide

## Overview

This guide documents the backup configuration for the CTX Quiz platform using MongoDB Atlas automated backups.

## Backup Configuration

### MongoDB Atlas Automated Backups

MongoDB Atlas provides automated backup functionality. Configure the following settings in the Atlas UI:

1. **Navigate to**: Atlas Dashboard → Your Cluster → Backup

2. **Enable Continuous Backup**:
   - Backup Policy: Continuous
   - Retention: 7 days of continuous backup
   - Point-in-time recovery enabled

3. **Scheduled Snapshots**:
   - Daily snapshots at 02:00 UTC
   - Weekly snapshots retained for 4 weeks
   - Monthly snapshots retained for 12 months

### Environment Variables

Ensure these are set in production:

```bash
# MongoDB Atlas connection (already configured)
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/ctxquiz?retryWrites=true&w=majority

# Backup notification webhook (optional)
BACKUP_WEBHOOK_URL=https://your-webhook-url
```

### Data Retention Policy

| Collection    | Retention Period | TTL Index |
|---------------|------------------|-----------|
| sessions      | 90 days          | Yes (createdAt) |
| participants  | 90 days          | Cascade with session |
| answers       | 90 days          | Cascade with session |
| auditLogs     | 365 days         | Yes (timestamp) |
| quizzes       | Indefinite       | No |

### Backup Verification

To verify backups are working:

1. Check Atlas Dashboard → Backup → Snapshots
2. Verify daily snapshots are being created
3. Test restore to a staging cluster periodically

### Manual Backup Script

For additional safety, use mongodump for manual backups:

```bash
#!/bin/bash
# manual-backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mongodb/$DATE"

mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR"

# Compress backup
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"

# Keep only last 7 manual backups
ls -t /backups/mongodb/*.tar.gz | tail -n +8 | xargs -r rm
```

### Restore Procedure

1. **From Atlas Snapshot**:
   - Atlas Dashboard → Backup → Restore
   - Select snapshot date/time
   - Choose target cluster

2. **From Manual Backup**:
   ```bash
   mongorestore --uri="$MONGODB_URI" --drop /path/to/backup
   ```

## Monitoring

- Atlas sends email alerts for backup failures
- Configure PagerDuty/Slack integration for critical alerts
- Review backup status weekly
