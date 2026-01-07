#!/bin/bash
# Run boardsmith dev with optional timeout (default 60s)
# Usage: dev.sh [timeout_seconds]

TIMEOUT=${1:-60}
timeout $TIMEOUT npx boardsmith dev 2>&1
