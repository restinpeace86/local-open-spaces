@echo off
set IS_SCHEDULED_RUN=true
cd /d D:\workspace\local-open-spaces
node scripts\ingest\parking-realtime-seoul.mjs >> C:\Users\momob\local-open-spaces-parking-realtime-seoul.log 2>&1
