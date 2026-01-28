# Load Testing for Live Quiz Platform

This directory contains Artillery load test configurations for testing the Live Quiz Platform's WebSocket server performance.

## Requirements Validated

| Requirement | Description | Target |
|-------------|-------------|--------|
| **11.1** | Support 500 concurrent WebSocket connections on 2GB RAM, 2 vCPU VPS | 500 connections |
| **11.2** | Maintain WebSocket connection latency below 100ms under normal load | p95 < 100ms |
| **11.5** | Handle thundering herd scenarios (500 simultaneous submissions) | 0% dropped |

## Prerequisites

1. **Node.js 20+** installed
2. **Artillery** installed globally or via npx
3. **Backend server** running on localhost:3001
4. **MongoDB** and **Redis** services available

## Installation

Install Artillery globally (recommended):

```bash
npm install -g artillery@latest
npm install -g artillery-engine-socketio
```

Or use npx (no installation required):

```bash
npx artillery run load-tests/artillery.config.yml
```

## Quick Start

### Option 1: Run All Tests with Script (Recommended)

The easiest way to run all load tests is using the provided script:

```bash
# Make the script executable (first time only)
chmod +x load-tests/run-tests.sh

# Run all load tests (100, 250, 500 users)
./load-tests/run-tests.sh

# Run specific test levels
./load-tests/run-tests.sh --light-only    # 100 users
./load-tests/run-tests.sh --default-only  # 250 users
./load-tests/run-tests.sh --stress-only   # 500 users
```

The script will:
1. Check prerequisites (Artillery, backend server)
2. Create a test session automatically
3. Run the selected load tests
4. Generate JSON and HTML reports
5. Analyze results against requirements

### Option 2: Manual Execution

#### 1. Start the Backend Server

```bash
# From project root
npm run dev:backend
```

#### 2. Create a Test Session

```bash
node load-tests/scripts/setup-test-session.js
```

This will output a `TEST_SESSION_ID` to use with the load tests.

#### 3. Run Load Tests

```bash
# Set the session ID from the setup script
export TEST_SESSION_ID="your-session-id-here"

# Run the default load test (250 concurrent users)
npm run load-test

# Or run directly with Artillery
artillery run load-tests/artillery.config.yml
```

## Test Configurations

### Light Test (`artillery.light.yml`)

- **Target**: 100 concurrent users
- **Duration**: ~2 minutes
- **Use case**: Development, CI/CD pipelines

| Phase | Duration | Users/sec |
|-------|----------|-----------|
| Warm-up | 10s | 5 |
| Ramp-up | 20s | 10 → 50 |
| Sustained | 60s | 50 |
| Cool-down | 10s | 20 → 5 |

```bash
npm run load-test:light
# or
./load-tests/run-tests.sh --light-only
```

### Default Test (`artillery.config.yml`)

- **Target**: 250 concurrent users
- **Duration**: ~5 minutes
- **Use case**: Pre-production validation

| Phase | Duration | Users/sec |
|-------|----------|-----------|
| Warm-up | 30s | 5 → 20 |
| Ramp-up | 60s | 20 → 100 |
| Sustained | 120s | 100 |
| Peak | 30s | 150 |
| Cool-down | 30s | 50 → 10 |

```bash
npm run load-test
# or
./load-tests/run-tests.sh --default-only
```

### Stress Test (`artillery.stress.yml`)

- **Target**: 500+ concurrent users
- **Duration**: ~6 minutes
- **Use case**: Finding system limits, validating Requirement 11.1

| Phase | Duration | Users/sec |
|-------|----------|-----------|
| Warm-up | 30s | 10 → 50 |
| Ramp to Target | 60s | 50 → 150 |
| Sustained at Target | 120s | 150 |
| Stress Beyond Target | 60s | 200 → 300 |
| Peak Stress | 30s | 300 |
| Recovery | 60s | 100 → 50 |
| Cool-down | 30s | 50 → 10 |

⚠️ **Warning**: May cause system instability. Run only on dedicated test environments.

```bash
npm run load-test:stress
# or
./load-tests/run-tests.sh --stress-only
```

## Test Scenarios

### 1. Participant Quiz Flow (80% of users)

Simulates a typical participant:
1. Connect to WebSocket server
2. Authenticate with session
3. Submit answers to 5 questions
4. Disconnect gracefully

### 2. Controller Monitor (5% of users)

Simulates quiz controllers:
1. Connect and authenticate as controller
2. Stay connected monitoring the quiz
3. Receive real-time updates

### 3. Big Screen Display (5% of users)

Simulates big screen displays:
1. Connect and authenticate as bigscreen
2. Stay connected receiving broadcasts

### 4. Thundering Herd (10% of users)

Simulates simultaneous answer submissions:
1. Connect and authenticate
2. Submit answer immediately (minimal think time)
3. Tests system under burst load

## Metrics and Thresholds

### Success Criteria

| Metric | Threshold | Description |
|--------|-----------|-------------|
| p95 Latency | < 100ms | 95th percentile response time |
| p99 Latency | < 200ms | 99th percentile response time |
| Error Rate | < 1% | Maximum acceptable error rate |

### Custom Metrics

The tests collect additional metrics:
- `websocket.connection_time`: Time to establish WebSocket connection
- `answer.submission_time`: Time to submit and acknowledge an answer

## Output and Reports

### Console Output

Artillery provides real-time console output showing:
- Request rate
- Response times (min, max, median, p95, p99)
- Error counts
- Scenario completion rates

### HTML Report

Generate an HTML report:

```bash
artillery run load-tests/artillery.config.yml --output report.json
artillery report report.json --output report.html
```

### JSON Report

Save raw metrics to JSON:

```bash
artillery run load-tests/artillery.config.yml --output metrics.json
```

### Automated Reports

When using the `run-tests.sh` script, reports are automatically generated in `load-tests/reports/`:

```
load-tests/reports/
├── light_YYYYMMDD_HHMMSS.json      # Raw metrics from light test
├── light_YYYYMMDD_HHMMSS.html      # HTML report for light test
├── default_YYYYMMDD_HHMMSS.json    # Raw metrics from default test
├── default_YYYYMMDD_HHMMSS.html    # HTML report for default test
├── stress_YYYYMMDD_HHMMSS.json     # Raw metrics from stress test
└── stress_YYYYMMDD_HHMMSS.html     # HTML report for stress test
```

## Analyzing Results

### Success Criteria

| Metric | Light (100) | Default (250) | Stress (500) |
|--------|-------------|---------------|--------------|
| p95 Latency | < 100ms | < 100ms | < 200ms |
| p99 Latency | < 200ms | < 200ms | < 500ms |
| Error Rate | < 1% | < 1% | < 5% |
| Dropped Connections | 0 | 0 | 0 |

### Requirements Validation

| Requirement | Description | How to Verify |
|-------------|-------------|---------------|
| **11.1** | 500 concurrent connections | Stress test completes with 0 dropped connections |
| **11.2** | Latency < 100ms | p95 latency in default test < 100ms |
| **11.5** | Thundering herd handling | Thundering herd scenario shows 0% errors |

### Results Template

Use the `RESULTS_TEMPLATE.md` file to document your load test results:

```bash
# Copy template for a new test run
cp load-tests/RESULTS_TEMPLATE.md load-tests/reports/results_$(date +%Y%m%d).md

# Edit with your results
vim load-tests/reports/results_$(date +%Y%m%d).md
```

The template includes:
- Detailed metrics tables for each test level
- Requirement validation checklists
- System resource monitoring sections
- Thundering herd analysis
- Recommendations section

## Troubleshooting

### "Connection refused" errors

Ensure the backend server is running:
```bash
npm run dev:backend
```

### "Session not found" errors

Create a new test session:
```bash
node load-tests/scripts/setup-test-session.js
```

### High latency warnings

Check system resources:
```bash
# Monitor CPU and memory
top

# Check Redis connection
redis-cli ping

# Check MongoDB connection
mongosh --eval "db.adminCommand('ping')"
```

### Socket.IO transport issues

The tests use WebSocket transport only. Ensure:
1. No proxy is blocking WebSocket connections
2. The server supports WebSocket transport
3. No firewall rules blocking the connection

## Directory Structure

```
load-tests/
├── artillery.config.yml      # Default load test (500 users)
├── artillery.light.yml       # Light load test (100 users)
├── artillery.stress.yml      # Stress test (1000 users)
├── data/
│   └── nicknames.csv         # Test nicknames for participants
├── processors/
│   └── quiz-processor.js     # Custom Artillery functions
├── scripts/
│   └── setup-test-session.js # Setup script for test sessions
└── README.md                 # This file
```

## Integration with CI/CD

Example GitHub Actions workflow:

```yaml
name: Load Tests

on:
  schedule:
    - cron: '0 2 * * *'  # Run daily at 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Start backend
        run: npm run dev:backend &
        env:
          MONGODB_URI: ${{ secrets.MONGODB_URI }}
          
      - name: Wait for backend
        run: sleep 10
        
      - name: Setup test session
        run: node load-tests/scripts/setup-test-session.js > setup.json
        
      - name: Run load tests
        run: |
          export TEST_SESSION_ID=$(cat setup.json | jq -r '.sessionId')
          npx artillery run load-tests/artillery.light.yml --output report.json
          
      - name: Generate report
        run: npx artillery report report.json --output report.html
        
      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: load-test-report
          path: report.html
```

## Performance Tuning Tips

### Server-Side

1. **Increase file descriptor limits**:
   ```bash
   ulimit -n 65535
   ```

2. **Tune Node.js memory**:
   ```bash
   NODE_OPTIONS="--max-old-space-size=1536" npm run start
   ```

3. **Enable cluster mode**:
   ```bash
   npm run start:cluster
   ```

### Client-Side (Artillery)

1. **Increase concurrent connections**:
   ```bash
   ulimit -n 65535
   ```

2. **Use multiple Artillery workers**:
   ```bash
   artillery run --workers 4 load-tests/artillery.config.yml
   ```

## References

- [Artillery Documentation](https://www.artillery.io/docs)
- [Socket.IO Engine for Artillery](https://github.com/artilleryio/artillery-engine-socketio)
- [Live Quiz Platform Requirements](../.kiro/specs/live-quiz-platform/requirements.md)
