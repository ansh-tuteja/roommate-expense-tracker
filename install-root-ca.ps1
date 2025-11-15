    # ExpenseHub Root CA Certificate Installer
Write-Host "🔐 ExpenseHub Root CA Certificate Installer" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor White

# Get the script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$certPath = Join-Path $scriptDir "certs\ca-cert.pem"

Write-Host "`nScript directory: $scriptDir" -ForegroundColor Gray
Write-Host "Certificate path: $certPath" -ForegroundColor Gray

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "`n❌ Administrator privileges required!" -ForegroundColor Red
    Write-Host "📋 Please run PowerShell as Administrator and try again" -ForegroundColor Yellow
    Read-Host "`nPress Enter to exit"
    exit 1
}

if (Test-Path $certPath) {
    Write-Host "`n✓ Certificate file found" -ForegroundColor Green
    
    try {
        Write-Host "Installing Root CA certificate..." -ForegroundColor Yellow
        
        # Import certificate to Trusted Root Certification Authorities
        $cert = Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\Root
        
        Write-Host "`n✅ Certificate installed successfully!" -ForegroundColor Green
        Write-Host "   Subject: $($cert.Subject)" -ForegroundColor White
        Write-Host "   Thumbprint: $($cert.Thumbprint)" -ForegroundColor White
        Write-Host "`n🎉 HTTPS will now work without warnings!" -ForegroundColor Green
        Write-Host "   Visit: https://localhost:3443" -ForegroundColor Cyan
        
    } catch {
        Write-Host "`n❌ Failed to install certificate: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "`n💡 Try running: certutil -addstore `"Root`" `"$certPath`"" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n❌ Certificate file not found at: $certPath" -ForegroundColor Red
    Write-Host "   Make sure you're in the ExpenseHub directory" -ForegroundColor Yellow
}

Read-Host "`nPress Enter to continue"