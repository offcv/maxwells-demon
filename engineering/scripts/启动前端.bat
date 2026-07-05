@echo off
cd ..\frontend || exit /b 1

if not exist node_modules (
    echo [INFO] node_modules not found, running npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo Starting frontend dev server...
call npm run dev
pause