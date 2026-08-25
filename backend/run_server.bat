@echo off
REM Launches the Face Detection System backend, bound to 0.0.0.0 over HTTPS
REM (self-signed cert — getUserMedia needs a secure context for anyone but
REM localhost). Meant to be run by the "FaceDetectionSystemBackend" Scheduled
REM Task (see docs/warehouse-architecture.md) so it survives logoff/reboot
REM instead of dying when an interactive session closes.

cd /d "%~dp0"
if not exist logs mkdir logs

venv_prod\Scripts\python.exe -m uvicorn app.main:app ^
  --host 0.0.0.0 --port 8000 ^
  --ssl-certfile certs\cert.pem --ssl-keyfile certs\key.pem ^
  >> logs\server.log 2>&1
