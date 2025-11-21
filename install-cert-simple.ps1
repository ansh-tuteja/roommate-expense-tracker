# ExpenseHub Certificate Installer
Write-Host "🔐 ExpenseHub Certificate Installer" -ForegroundColor Cyan
Write-Host "===================================`n" -ForegroundColor White

$certPath = "certs\ca-cert.pem"

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "❌ Administrator privileges required!" -ForegroundColor Red
    Write-Host "`n📋 To install certificate:" -ForegroundColor Yellow
    Write-Host "   1. Right-click on PowerShell" -ForegroundColor White
    Write-Host "   2. Select 'Run as Administrator'" -ForegroundColor White
    Write-Host "   3. Run this script again" -ForegroundColor White
    exit 1
}

if (Test-Path $certPath) {
    try {
        Write-Host "👑 Installing Root CA certificate..." -ForegroundColor Green
        
        # Import certificate to Trusted Root Certification Authorities
        $cert = Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\Root
        
        Write-Host "✅ Certificate installed successfully!" -ForegroundColor Green
        Write-Host "   Subject: $($cert.Subject)" -ForegroundColor White
        Write-Host "   Thumbprint: $($cert.Thumbprint)" -ForegroundColor White
        Write-Host "`n🎉 HTTPS will now work without warnings!" -ForegroundColor Green
        Write-Host "   Visit: https://localhost:3443" -ForegroundColor Cyan
        
    } catch {
        Write-Host "❌ Failed to install certificate: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Certificate file not found: $certPath" -ForegroundColor Red
}

Write-Host "`nPress any key to continue..." -ForegroundColor Gray
Read-Host