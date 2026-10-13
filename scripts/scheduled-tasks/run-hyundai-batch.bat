@echo off
set IS_SCHEDULED_RUN=true
cd /d D:\workspace\local-open-spaces
node scripts\ingest\hyundai-culture-club.mjs >> C:\Users\momob\local-open-spaces-hyundai-batch.log 2>&1
