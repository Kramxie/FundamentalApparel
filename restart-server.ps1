# Quick Server Restart Script

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  SERVER RESTART UTILITY" -ForegroundColor Yellow
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Find server process on port 5000
$serverProcess = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
    $connections = Get-NetTCPConnection -OwningProcess $_.Id -ErrorAction SilentlyContinue
    $connections | Where-Object { $_.LocalPort -eq 5000 -and $_.State -eq 'Listen' }
}

if ($serverProcess) {
    Write-Host "✓ Found server process (PID: $($serverProcess.Id))" -ForegroundColor Green
    Write-Host "  Stopping server..." -ForegroundColor Yellow
    
    Stop-Process -Id $serverProcess.Id -Force
    Start-Sleep -Seconds 2
    
    Write-Host "✓ Server stopped" -ForegroundColor Green
} else {
    Write-Host "! No server running on port 5000" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Starting server..." -ForegroundColor Cyan
Write-Host ""

# Start server in new window
$serverPath = "D:\InternetLanguages\BBT\ecommerce-project\server"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$serverPath'; Write-Host 'Starting server on port 5000...' -ForegroundColor Green; npm start"

Start-Sleep -Seconds 3

# Verify server is running
$newProcess = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
    $connections = Get-NetTCPConnection -OwningProcess $_.Id -ErrorAction SilentlyContinue
    $connections | Where-Object { $_.LocalPort -eq 5000 -and $_.State -eq 'Listen' }
}

if ($newProcess) {
    Write-Host ""
    Write-Host "Server restarted successfully!" -ForegroundColor Green
    Write-Host "Running on https://fundamental-apparel-backend.onrender.com" -ForegroundColor Cyan
    Write-Host "Process ID: $($newProcess.Id)" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "Server failed to start" -ForegroundColor Red
    Write-Host "Check the new terminal window for errors" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
