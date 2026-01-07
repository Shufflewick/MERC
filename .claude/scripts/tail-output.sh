#!/bin/bash
# Read output from a file, optionally waiting first
# Usage: tail-output.sh <file> [wait_seconds] [lines]

FILE=$1
WAIT=${2:-0}
LINES=${3:-20}

if [ -z "$FILE" ]; then
  echo "Usage: tail-output.sh <file> [wait_seconds] [lines]"
  exit 1
fi

if [ "$WAIT" -gt 0 ]; then
  sleep "$WAIT"
fi

tail -n "$LINES" "$FILE"
