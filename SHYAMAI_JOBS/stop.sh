#!/bin/bash
fuser -k 8001/tcp 2>/dev/null && echo "Backend stopped" || echo "Backend was not running"
rm -f /tmp/shyamai_jobs.pid
