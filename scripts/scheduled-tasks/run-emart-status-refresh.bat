@echo off
set IS_SCHEDULED_RUN=true
cd /d D:\workspace\local-open-spaces
node scripts\ingest\emart-culture-club-status-refresh.mjs >> C:\Users\momob\local-open-spaces-emart-status-refresh.log 2>&1
