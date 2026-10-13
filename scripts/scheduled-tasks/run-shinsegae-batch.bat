@echo off
set IS_SCHEDULED_RUN=true
cd /d D:\workspace\local-open-spaces
node scripts\ingest\shinsegae-culture-club.mjs >> C:\Users\momob\local-open-spaces-shinsegae-culture-club.log 2>&1
