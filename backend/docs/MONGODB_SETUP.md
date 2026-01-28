# MongoDB Atlas Setup Guide

This guide walks you through setting up MongoDB Atlas for the Live Quiz Platform.

## Prerequisites

- A MongoDB Atlas account (free tier available at https://www.mongodb.com/cloud/atlas)
- Internet connection

## Step 1: Create MongoDB Atlas Account

1. Go to https://www.mongodb.com/cloud/atlas
2. Click "Try Free" or "Sign In"
3. Create an account or sign in with Google/GitHub

## Step 2: Create a Cluster

1. After logging in, click "Build a Database"
2. Choose a deployment option:
   - **Shared (Free)**: M0 Sandbox - Good for development
   - **Dedicated**: M10+ - Recommended for production
3. Select your cloud provider and region:
   - Choose a region close to your VPS location for lower latency
   - Recommended: AWS or Google Cloud
4. Name your cluster (e.g., "quiz-platform-cluster")
5. Click "Create Cluster"
6. Wait 3-5 minutes for cluster provisioning

## Step 3: Configure Network Access

1. In the left sidebar, click "Network Access" under "Security"
2. Click "Add IP Address"
3. For development:
   - Click "Allow Access from Anywhere" (0.0.0.0/0)
   - **Warning**: This is not secure for production!
4. For production:
   - Add your VPS IP address
   - Add your development machine IP
5. Click "Confirm"

## Step 4: Create Database User

1. In the left sidebar, click "Database Access" under "Security"
2. Click "Add New Database User"
3. Choose authentication method: "Password"
4. Enter username (e.g., "quiz_admin")
5. Click "Autogenerate Secure Password" or enter your own
6. **Important**: Copy and save the password securely!
7. Set database user privileges:
   - Built-in Role: "Read and write to any database"
8. Click "Add User"

## Step 5: Get Connection String

1. Go back to "Database" in the left sidebar
2. Click "Connect" on your cluster
3. Choose "Connect your application"
4. Select:
   - Driver: Node.js
   - Version: 5.5 or later
5. Copy the connection string (looks like):
   ```
   mongodb+srv://username:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` with your actual password
7. Add the database name before the `?`:
   ```
   mongodb+srv://username:password@cluster.mongodb.net/quiz_platform?retryWrites=true&w=majority
   ```

## Step 6: Configure Environment Variables

1. Open `backend/.env` (create from `.env.example` if needed)
2. Update the MongoDB configuration:
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/quiz_platform?retryWrites=true&w=majority
   MONGODB_DB_NAME=quiz_platform
   ```

## Step 7: Test Connection

1. Start the backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. You should see:
   ```
   Connecting to MongoDB Atlas...
   ✓ Connected to MongoDB database: quiz_platform
   Creating MongoDB indexes...
   ✓ All MongoDB indexes created successfully
   ```

## Database Schema

The application automatically creates the following collections:

### Collections

1. **quizzes** - Quiz configurations and questions
2. **sessions** - Active quiz sessions
3. **participants** - Participant records
4. **answers** - Answer submissions
5. **auditLogs** - Audit trail for all actions

### Indexes

The application automatically creates optimized indexes for:

- **quizzes**: `createdBy`, `createdAt`
- **sessions**: `joinCode` (unique), `state`, `sessionId` (unique)
- **participants**: `sessionId + isActive`, `sessionId + totalScore`, `participantId` (unique)
- **answers**: `sessionId + questionId`, `participantId + questionId`, `answerId` (unique)
- **auditLogs**: `timestamp`, `sessionId + timestamp`, `eventType + timestamp`

## Production Recommendations

### Security

1. **Network Access**:
   - Only whitelist specific IP addresses
   - Never use 0.0.0.0/0 in production

2. **Database Users**:
   - Use strong, unique passwords
   - Create separate users for different environments
   - Use least privilege principle

3. **Connection String**:
   - Store in environment variables, never in code
   - Use secrets management (AWS Secrets Manager, HashiCorp Vault)

### Performance

1. **Cluster Tier**:
   - M10 minimum for production (2GB RAM)
   - M20 recommended for 500+ concurrent users (4GB RAM)
   - Enable auto-scaling for variable load

2. **Connection Pooling**:
   - Default: 50 max connections, 10 min connections
   - Adjust based on your load testing results

3. **Monitoring**:
   - Enable MongoDB Atlas monitoring
   - Set up alerts for:
     - High connection count (>80% of max)
     - Slow queries (>100ms)
     - High CPU usage (>80%)
     - Low available storage (<20%)

### Backup

1. **Automated Backups**:
   - Enable continuous backups (available on M10+)
   - Set retention period (7-90 days)

2. **Point-in-Time Recovery**:
   - Available on M10+ clusters
   - Allows recovery to any point in the last 7 days

## Troubleshooting

### Connection Timeout

**Error**: `MongoServerSelectionError: connection timed out`

**Solutions**:
1. Check network access whitelist includes your IP
2. Verify connection string is correct
3. Check firewall settings on your machine/VPS
4. Ensure cluster is running (not paused)

### Authentication Failed

**Error**: `MongoServerError: Authentication failed`

**Solutions**:
1. Verify username and password are correct
2. Check password doesn't contain special characters that need URL encoding
3. Ensure database user has correct permissions

### Database Not Found

**Error**: Database doesn't exist

**Solution**:
- MongoDB creates databases automatically on first write
- The application will create collections on startup
- No manual database creation needed

## Monitoring and Maintenance

### Atlas Dashboard

Monitor your cluster health:
1. Go to MongoDB Atlas dashboard
2. Click on your cluster
3. View metrics:
   - Operations per second
   - Network traffic
   - Connections
   - Query performance

### Query Performance

1. Use the "Performance Advisor" in Atlas
2. Review slow query logs
3. Add indexes as recommended
4. Monitor index usage

### Scaling

When to scale up:
- CPU usage consistently >70%
- Memory usage consistently >80%
- Connection count approaching max
- Query latency increasing

## Cost Optimization

### Free Tier (M0)
- 512MB storage
- Shared RAM
- Good for: Development, testing, small demos
- Limitations: No backups, no auto-scaling

### Paid Tiers
- M10: $0.08/hour (~$57/month) - Production minimum
- M20: $0.20/hour (~$144/month) - Recommended for 500+ users
- M30: $0.54/hour (~$389/month) - High-traffic production

### Tips
1. Use free tier for development
2. Scale up only when needed
3. Enable auto-scaling for variable load
4. Monitor usage to avoid over-provisioning

## Support

- MongoDB Atlas Documentation: https://docs.atlas.mongodb.com/
- MongoDB University (Free Courses): https://university.mongodb.com/
- Community Forums: https://www.mongodb.com/community/forums/
