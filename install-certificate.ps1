# ExpenseHub Certificate Installation Script
# This script installs the Root CA certificate in Windows trusted store

Write-Host "🔒 ExpenseHub Certificate Installation" -ForegroundColor Green
Write-Host "=====================================`n" -ForegroundColor Green

$certPath = Join-Path $PSScriptRoot "certs\ca-cert.pem"

if (Test-Path $certPath) {
    Write-Host "📁 Found certificate at: $certPath" -ForegroundColor Yellow
    
    try {
        # Check if running as administrator
        $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        
        if (-not $isAdmin) {
            Write-Host "⚠️  This script needs to run as Administrator to install certificates." -ForegroundColor Red
            Write-Host "`n🔧 To run as Administrator:" -ForegroundColor Yellow
            Write-Host "   1. Right-click on PowerShell" -ForegroundColor White
            Write-Host "   2. Select 'Run as Administrator'" -ForegroundColor White
            Write-Host "   3. Navigate to this folder and run the script again" -ForegroundColor White
            Write-Host "`n📍 Current folder: $PSScriptRoot" -ForegroundColor Cyan
            Write-Host "`n💡 Alternative: Double-click 'install-certificate.bat' to run as admin" -ForegroundColor Green
            exit 1
        }
        
        Write-Host "👑 Running as Administrator - Installing certificate..." -ForegroundColor Green
        
        # Import certificate to Trusted Root Certification Authorities
        $cert = Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\Root
        
        Write-Host "✅ Certificate installed successfully!" -ForegroundColor Green
        Write-Host "   Subject: $($cert.Subject)" -ForegroundColor White
        Write-Host "   Thumbprint: $($cert.Thumbprint)" -ForegroundColor White
        Write-Host "`n🎉 HTTPS will now work without warnings!" -ForegroundColor Green
        Write-Host "   Visit: https://localhost:3443" -ForegroundColor Cyan
        
    } catch {
        Write-Host "❌ Failed to install certificate: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "`n🔧 Manual Installation Steps:" -ForegroundColor Yellow
        Write-Host "   1. Double-click: $certPath" -ForegroundColor White
        Write-Host "   2. Click 'Install Certificate'" -ForegroundColor White
        Write-Host "   3. Choose 'Local Machine'" -ForegroundColor White
        Write-Host "   4. Select 'Trusted Root Certification Authorities'" -ForegroundColor White
        Write-Host "   5. Click 'Finish'" -ForegroundColor White
    }
} else {
    Write-Host "❌ Certificate file not found: $certPath" -ForegroundColor Red
    Write-Host "   Make sure you're in the ExpenseHub directory" -ForegroundColor Yellow
}

Write-Host "`nPress any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")