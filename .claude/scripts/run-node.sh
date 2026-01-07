#!/bin/bash
# Run a node script with timeout (default 60s)
# Usage: run-node.sh <script> [timeout_seconds]

SCRIPT=$1
TIMEOUT=${2:-60}

if [ -z "$SCRIPT" ]; then
  echo "Usage: run-node.sh <script> [timeout_seconds]"
  exit 1
fi

timeout $TIMEOUT node "$SCRIPT"
