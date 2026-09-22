@echo off
setlocal
set "BUNDLED_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%BUNDLED_PYTHON%" (
  "%BUNDLED_PYTHON%" -B "%~dp0serve.py" --open
  goto done
)
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -B "%~dp0serve.py" --open
  goto done
)
python -B "%~dp0serve.py" --open
:done
if errorlevel 1 pause
