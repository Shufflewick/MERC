#!/bin/bash
# Run boardsmith dev in background with timeout, output to temp file
# Usage: dev-bg.sh [timeout_seconds]
# Returns: path to output file

TIMEOUT=${1:-60}
OUTPUT_FILE=$(mktemp /tmp/boardsmith-dev.XXXXXX)

timeout $TIMEOUT npx boardsmith dev > "$OUTPUT_FILE" 2>&1 &
PID=$!

echo "PID: $PID"
echo "Output: $OUTPUT_FILE"
echo "Kill with: kill $PID"
