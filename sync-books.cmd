@echo off
setlocal
set "SITE_DIR=%~dp0"
set "SOURCE_ROOT=%~dp0.."
python "%SITE_DIR%.github\scripts\sync_books.py" --site-dir "%SITE_DIR%" --source-root "%SOURCE_ROOT%" %*
exit /b %ERRORLEVEL%
