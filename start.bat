@echo off
echo ============================================
echo  WorkflowApp - Starting all services
echo ============================================
echo.

:: Backend API (FastAPI + uvicorn)
echo [1/2] Starting backend API on http://localhost:8000 ...
start "WorkflowApp - Backend" cmd /k "cd /d C:\Users\joohu\claude_workspace\workflowapp\backend && C:\Users\joohu\venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"

:: Wait a moment so the backend starts first
timeout /t 2 /nobreak >nul

:: Frontend (Vite dev server)
echo [2/2] Starting frontend on http://localhost:5173 ...
start "WorkflowApp - Frontend" cmd /k "cd /d C:\Users\joohu\claude_workspace\workflowapp\frontend && npm run dev"

:: Open browser after a short delay
echo.
echo Waiting for servers to start...
timeout /t 4 /nobreak >nul
start http://localhost:5173

echo.
echo ============================================
echo  All services running!
echo    Frontend:  http://localhost:5173
echo    API:       http://localhost:8000
echo    API Docs:  http://localhost:8000/docs
echo ============================================
echo.
echo Close the two terminal windows to stop the servers.
pause
