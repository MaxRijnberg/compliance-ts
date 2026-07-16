@echo off
setlocal

REM Start docker compose (blocking)
docker compose up --build --force-recreate

REM Open localhost:80 after compose starts/ends
start "" "http://localhost:80"

endlocal
