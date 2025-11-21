@echo off
echo 🔒 ExpenseHub Certificate Installer
echo ==================================
echo.
echo Installing Root CA certificate for trusted HTTPS...
echo.

PowerShell.exe -ExecutionPolicy Bypass -Command "& '%~dp0install-certificate.ps1'"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Installation complete!
) else (
    echo.
    echo ❌ Installation failed. Please run as Administrator.
)

pause