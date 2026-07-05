@echo off
cd ..\backend || exit /b 1

netstat -ano | findstr :8000 >nul
if %errorlevel% equ 0 (
    echo [WARNING] Port 8000 is already in use.
    pause
    exit /b 0
)

if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate || exit /b 1
pip install -r requirements.txt
echo Starting backend service on port 8000...
uvicorn app.main:app --host 0.0.0.0 --port 8000
pause