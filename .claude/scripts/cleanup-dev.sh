#!/bin/bash
# Kill processes on common dev ports
for port in 8787 5173 4173; do
  lsof -i :$port | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null
done
pkill -f "boardsmith dev" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 2
echo "Processes killed"
