@echo off
title Auto-Dev Runner

:LOOP
cls
echo [Auto-Dev] Checking todo.md...

git pull origin main

findstr /C:"[ ]" "implementation\todo.md" > nul
if errorlevel 1 goto SLEEP

echo [1/2] Checking DB...
node scripts/check-db.mjs
if errorlevel 1 goto ERR_DB

for /f %%h in ('git rev-parse HEAD') do set BEFORE_HASH=%%h

echo [2/2] Running Claude...
call claude --dangerously-skip-permissions -p "Read CLAUDE.md and implementation/todo.md. Execute all unchecked tasks [ ] in implementation/todo.md. Run typecheck, lint, build tests and push to git with discord notification upon completion."
if errorlevel 1 goto ERR_CLAUDE

git pull origin main
for /f %%h in ('git rev-parse HEAD') do set AFTER_HASH=%%h

if "%AFTER_HASH%"=="%BEFORE_HASH%" goto WAIT_SPEC

echo [Success] Task completed. (%BEFORE_HASH% to %AFTER_HASH%)
goto SLEEP

:ERR_DB
echo [Error] DB failed.
node scripts/notify-error.mjs SUPABASE_INACTIVE DB_CONN_FAIL
goto RETRY

:ERR_CLAUDE
echo [Error] Claude failed.
node scripts/notify-error.mjs CLAUDE_BUILD_OR_GIT_ERROR CLAUDE_EXEC_FAIL
goto RETRY

:WAIT_SPEC
echo [Notice] No new commits after this run.
node scripts/notify-error.mjs CLAUDE_WAITING_OR_SPEC_ISSUE NO_CHANGES_SPEC_ISSUE
goto SLEEP

:SLEEP
echo Sleeping 5 minutes...
timeout /t 300 /nobreak
goto LOOP

:RETRY
echo Retrying in 3 minutes...
timeout /t 180 /nobreak
goto LOOP
