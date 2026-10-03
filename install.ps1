param(
    [switch]$NoDesktopShortcut
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "        FACSIMILE INSTALLER" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

function Require-Command {
    param(
        [string]$Name,
        [string]$InstallHint
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "Missing required command: $Name" -ForegroundColor Red
        Write-Host $InstallHint -ForegroundColor Yellow
        exit 1
    }
}

Require-Command "python" "Install Python 3.11 or newer, then run this installer again."
Require-Command "node" "Install Node.js 20 or newer, then run this installer again."
Require-Command "npm" "npm should be installed with Node.js."

$PythonVersion = python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
$VersionParts = $PythonVersion.Split(".")
if ([int]$VersionParts[0] -lt 3 -or ([int]$VersionParts[0] -eq 3 -and [int]$VersionParts[1] -lt 11)) {
    Write-Host "Python 3.11+ is required. Found Python $PythonVersion." -ForegroundColor Red
    exit 1
}

Write-Host "[1/5] Creating Python virtual environment..." -ForegroundColor Green
if (-not (Test-Path ".venv")) {
    python -m venv .venv
}

$PythonExe = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$PipExe = Join-Path $RepoRoot ".venv\Scripts\pip.exe"
$FacsimileExe = Join-Path $RepoRoot ".venv\Scripts\facsimile.exe"

Write-Host "[2/5] Installing Facsimile backend..." -ForegroundColor Green
& $PythonExe -m pip install --upgrade pip
& $PipExe install -e .

Write-Host "[3/5] Installing frontend dependencies..." -ForegroundColor Green
Push-Location (Join-Path $RepoRoot "frontend")
if (Test-Path "package-lock.json") {
    npm ci
} else {
    npm install
}

Write-Host "[4/5] Building frontend..." -ForegroundColor Green
npm run build
Pop-Location

Write-Host "[5/5] Creating launch helpers..." -ForegroundColor Green

$Launcher = @"
@echo off
cd /d "$RepoRoot"
"$FacsimileExe" %*
"@
Set-Content -Path (Join-Path $RepoRoot "Facsimile.cmd") -Value $Launcher -Encoding ASCII

if (-not $NoDesktopShortcut) {
    try {
        $Desktop = [Environment]::GetFolderPath("Desktop")
        $ShortcutPath = Join-Path $Desktop "Facsimile.lnk"
        $Shell = New-Object -ComObject WScript.Shell
        $Shortcut = $Shell.CreateShortcut($ShortcutPath)
        $Shortcut.TargetPath = Join-Path $RepoRoot "Facsimile.cmd"
        $Shortcut.WorkingDirectory = $RepoRoot
        $Shortcut.Description = "Launch Facsimile Scanner Workstation"
        $Shortcut.Save()
        Write-Host "Desktop shortcut created: $ShortcutPath" -ForegroundColor Cyan
    }
    catch {
        Write-Host "Could not create desktop shortcut; Facsimile.cmd was still created." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host ""
Write-Host "Launch Facsimile with:" -ForegroundColor White
Write-Host "  .\Facsimile.cmd" -ForegroundColor Cyan
Write-Host ""
Write-Host "The workstation will open at http://127.0.0.1:8765" -ForegroundColor White
