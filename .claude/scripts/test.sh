#!/bin/bash
# Run tests with optional timeout (default 60s)
# Usage: test.sh [timeout_seconds] [extra_args...]

TIMEOUT=${1:-60}
shift 2>/dev/null

timeout $TIMEOUT npm test -- --run "$@"
