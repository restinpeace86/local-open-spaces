@echo off
set IS_SCHEDULED_RUN=true
cd /d D:\workspace\local-open-spaces
node scripts\ingest\akplaza-culture-club.mjs >> C:\Users\momob\local-open-spaces-akplaza-batch.log 2>&1
