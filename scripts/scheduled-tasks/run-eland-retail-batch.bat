@echo off
set IS_SCHEDULED_RUN=true
cd /d D:\workspace\local-open-spaces
node scripts\ingest\eland-retail-culture-club.mjs >> C:\Users\momob\local-open-spaces-eland-retail-batch.log 2>&1
