@echo off
echo 🔐 Installing ExpenseHub Root CA Certificate...
echo ========================================
echo.

cd /d "%~dp0"
set CERT_PATH=%~dp0certs\ca-cert.pem
echo Certificate path: %CERT_PATH%
echo.

if exist "%CERT_PATH%" (
    echo ✓ Certificate file found
    echo Installing Root CA certificate...
    certutil -addstore "Root" "%CERT_PATH%"
) else (
    echo ❌ Certificate file not found at: %CERT_PATH%
    echo Please make sure you're running this from the ExpenseHub directory
)

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Certificate installed successfully!
    echo 🎉 Now visit: https://localhost:3443
    echo 🔒 You should see a trusted, secure connection!
) else (
    echo.
    echo ❌ Installation failed. Please run this file as Administrator.
    echo 📋 Right-click this file and select "Run as administrator"
)

echo.
echo Press any key to continue...
pause > nul