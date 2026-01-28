#!/bin/bash

# =============================================================================
# Load Test Runner Script for Live Quiz Platform
# =============================================================================
#
# This script runs all three load test configurations sequentially and
# generates reports for analysis.
#
# Requirements Validated:
#   - 11.1: Support 500 concurrent WebSocket connections on 2GB RAM, 2 vCPU VPS
#   - 11.2: Maintain WebSocket connection latency below 100ms under normal load
#   - 11.5: Handle thundering herd scenarios (500 simultaneous submissions)
#
# Usage:
#   ./load-tests/run-tests.sh [options]
#
# Options:
#   --light-only     Run only the light test (100 users)
#   --default-only   Run only the default test (250 users)
#   --stress-only    Run only the stress test (500 users)
#   --all            Run all tests (default)
#   --skip-setup     Skip test session setup
#   --help           Show this help message
#
# Prerequisites:
#   1. Backend server running on localhost:3001
#   2. MongoDB and Redis services available
#   3. Artillery installed (npm install -g artillery artillery-engine-socketio)
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPORTS_DIR="$SCRIPT_DIR/reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
API_URL="${API_URL:-http://localhost:3001}"

# Test configurations
LIGHT_CONFIG="$SCRIPT_DIR/artillery.light.yml"
DEFAULT_CONFIG="$SCRIPT_DIR/artillery.config.yml"
STRESS_CONFIG="$SCRIPT_DIR/artillery.stress.yml"

# Default options
RUN_LIGHT=true
RUN_DEFAULT=true
RUN_STRESS=true
SKIP_SETUP=false

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}=============================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=============================================================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

show_help() {
    head -40 "$0" | tail -35
    exit 0
}

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check if Artillery is installed
    if ! command -v artillery &> /dev/null; then
        print_error "Artillery is not installed"
        echo "Install with: npm install -g artillery artillery-engine-socketio"
        exit 1
    fi
    print_success "Artillery is installed"
    
    # Check if backend is running
    if curl -s "$API_URL/api/health" > /dev/null 2>&1; then
        print_success "Backend server is running at $API_URL"
    else
        print_error "Backend server is not running at $API_URL"
        echo "Start with: npm run dev:backend"
        exit 1
    fi
    
    # Create reports directory
    mkdir -p "$REPORTS_DIR"
    print_success "Reports directory ready: $REPORTS_DIR"
}

setup_test_session() {
    print_header "Setting Up Test Session"
    
    # Run setup script and capture output
    SETUP_OUTPUT=$(node "$SCRIPT_DIR/scripts/setup-test-session.js" 2>&1)
    
    # Extract session ID from JSON output
    SESSION_ID=$(echo "$SETUP_OUTPUT" | grep -A5 "JSON Output" | grep "sessionId" | sed 's/.*: "\(.*\)".*/\1/')
    
    if [ -z "$SESSION_ID" ]; then
        print_error "Failed to create test session"
        echo "$SETUP_OUTPUT"
        exit 1
    fi
    
    export TEST_SESSION_ID="$SESSION_ID"
    print_success "Test session created: $TEST_SESSION_ID"
}

run_load_test() {
    local config_file="$1"
    local test_name="$2"
    local report_prefix="$3"
    
    print_header "Running $test_name"
    
    local json_report="$REPORTS_DIR/${report_prefix}_${TIMESTAMP}.json"
    local html_report="$REPORTS_DIR/${report_prefix}_${TIMESTAMP}.html"
    
    print_info "Configuration: $config_file"
    print_info "Session ID: $TEST_SESSION_ID"
    print_info "Output: $json_report"
    echo ""
    
    # Run Artillery test
    if artillery run "$config_file" --output "$json_report"; then
        print_success "$test_name completed"
        
        # Generate HTML report
        if artillery report "$json_report" --output "$html_report" 2>/dev/null; then
            print_success "HTML report generated: $html_report"
        else
            print_warning "Could not generate HTML report"
        fi
        
        # Analyze results
        analyze_results "$json_report" "$test_name"
        
        return 0
    else
        print_error "$test_name failed"
        return 1
    fi
}

analyze_results() {
    local json_file="$1"
    local test_name="$2"
    
    echo ""
    print_info "Analyzing results for $test_name..."
    echo ""
    
    # Extract key metrics using Node.js
    node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('$json_file', 'utf8'));
        
        const aggregate = data.aggregate || {};
        const counters = aggregate.counters || {};
        const summaries = aggregate.summaries || {};
        
        // Connection metrics
        const totalRequests = counters['vusers.created'] || 0;
        const completedRequests = counters['vusers.completed'] || 0;
        const failedRequests = counters['vusers.failed'] || 0;
        
        // Latency metrics
        const latency = summaries['socketio.response_time'] || summaries['http.response_time'] || {};
        const p50 = latency.p50 || 'N/A';
        const p95 = latency.p95 || 'N/A';
        const p99 = latency.p99 || 'N/A';
        const min = latency.min || 'N/A';
        const max = latency.max || 'N/A';
        
        // Calculate success rate
        const successRate = totalRequests > 0 
            ? ((completedRequests / totalRequests) * 100).toFixed(2) 
            : 'N/A';
        
        // Check requirements
        const latencyOk = typeof p95 === 'number' && p95 < 100;
        const noDropped = failedRequests === 0;
        
        console.log('┌─────────────────────────────────────────────────────────────┐');
        console.log('│                    LOAD TEST RESULTS                        │');
        console.log('├─────────────────────────────────────────────────────────────┤');
        console.log('│ Metric                          │ Value                     │');
        console.log('├─────────────────────────────────────────────────────────────┤');
        console.log('│ Total Virtual Users             │ ' + String(totalRequests).padEnd(25) + '│');
        console.log('│ Completed                       │ ' + String(completedRequests).padEnd(25) + '│');
        console.log('│ Failed                          │ ' + String(failedRequests).padEnd(25) + '│');
        console.log('│ Success Rate                    │ ' + String(successRate + '%').padEnd(25) + '│');
        console.log('├─────────────────────────────────────────────────────────────┤');
        console.log('│ Latency (ms)                                                │');
        console.log('│   Min                           │ ' + String(min).padEnd(25) + '│');
        console.log('│   p50 (Median)                  │ ' + String(p50).padEnd(25) + '│');
        console.log('│   p95                           │ ' + String(p95).padEnd(25) + '│');
        console.log('│   p99                           │ ' + String(p99).padEnd(25) + '│');
        console.log('│   Max                           │ ' + String(max).padEnd(25) + '│');
        console.log('├─────────────────────────────────────────────────────────────┤');
        console.log('│ REQUIREMENT CHECKS                                          │');
        console.log('│   11.2 Latency < 100ms (p95)    │ ' + (latencyOk ? '✓ PASS' : '✗ FAIL').padEnd(25) + '│');
        console.log('│   11.5 No Dropped Connections   │ ' + (noDropped ? '✓ PASS' : '✗ FAIL').padEnd(25) + '│');
        console.log('└─────────────────────────────────────────────────────────────┘');
    " 2>/dev/null || print_warning "Could not parse results JSON"
}

generate_summary() {
    print_header "Test Summary"
    
    echo "Reports generated in: $REPORTS_DIR"
    echo ""
    echo "Files:"
    ls -la "$REPORTS_DIR"/*_${TIMESTAMP}.* 2>/dev/null || echo "No reports found"
    echo ""
    
    print_info "To view HTML reports, open them in a browser:"
    for report in "$REPORTS_DIR"/*_${TIMESTAMP}.html; do
        if [ -f "$report" ]; then
            echo "  file://$report"
        fi
    done
}

# =============================================================================
# Parse Command Line Arguments
# =============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --light-only)
            RUN_LIGHT=true
            RUN_DEFAULT=false
            RUN_STRESS=false
            shift
            ;;
        --default-only)
            RUN_LIGHT=false
            RUN_DEFAULT=true
            RUN_STRESS=false
            shift
            ;;
        --stress-only)
            RUN_LIGHT=false
            RUN_DEFAULT=false
            RUN_STRESS=true
            shift
            ;;
        --all)
            RUN_LIGHT=true
            RUN_DEFAULT=true
            RUN_STRESS=true
            shift
            ;;
        --skip-setup)
            SKIP_SETUP=true
            shift
            ;;
        --help|-h)
            show_help
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# =============================================================================
# Main Execution
# =============================================================================

print_header "Live Quiz Platform - Load Test Runner"

echo "Configuration:"
echo "  API URL: $API_URL"
echo "  Reports Directory: $REPORTS_DIR"
echo "  Timestamp: $TIMESTAMP"
echo ""
echo "Tests to run:"
[ "$RUN_LIGHT" = true ] && echo "  - Light Test (100 users)"
[ "$RUN_DEFAULT" = true ] && echo "  - Default Test (250 users)"
[ "$RUN_STRESS" = true ] && echo "  - Stress Test (500 users)"
echo ""

# Check prerequisites
check_prerequisites

# Setup test session
if [ "$SKIP_SETUP" = false ]; then
    setup_test_session
else
    if [ -z "$TEST_SESSION_ID" ]; then
        print_error "TEST_SESSION_ID environment variable is required when using --skip-setup"
        exit 1
    fi
    print_info "Using existing session: $TEST_SESSION_ID"
fi

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

# Run Light Test (100 users)
if [ "$RUN_LIGHT" = true ]; then
    if run_load_test "$LIGHT_CONFIG" "Light Load Test (100 users)" "light"; then
        ((TESTS_PASSED++))
    else
        ((TESTS_FAILED++))
    fi
fi

# Run Default Test (250 users)
if [ "$RUN_DEFAULT" = true ]; then
    if run_load_test "$DEFAULT_CONFIG" "Default Load Test (250 users)" "default"; then
        ((TESTS_PASSED++))
    else
        ((TESTS_FAILED++))
    fi
fi

# Run Stress Test (500 users)
if [ "$RUN_STRESS" = true ]; then
    if run_load_test "$STRESS_CONFIG" "Stress Load Test (500 users)" "stress"; then
        ((TESTS_PASSED++))
    else
        ((TESTS_FAILED++))
    fi
fi

# Generate summary
generate_summary

# Final status
print_header "Final Results"

echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    print_success "All load tests completed successfully!"
    exit 0
else
    print_error "Some load tests failed. Check the reports for details."
    exit 1
fi
