#!/bin/bash
# Keep the production Next.js server alive by restarting on death
cd /home/z/my-project
while true; do
  if ! curl -s -o /dev/null --max-time 3 http://localhost:3000; then
    echo "[$(date)] Server down, restarting..." >> /tmp/keepalive.log
    pkill -f "next start" 2>/dev/null
    sleep 1
    setsid env NODE_OPTIONS="--max-old-space-size=384" nohup npx next start -p 3000 > /tmp/nextstart.log 2>&1 < /dev/null &
    disown
    sleep 6
  fi
  sleep 15
done
