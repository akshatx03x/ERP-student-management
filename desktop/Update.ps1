# ============================================================
# SchoolERP Safe Update Tool
# ============================================================
# HOW TO USE:
#   1. Receive the new version folder from your developer.
#   2. Extract it anywhere on the USB (e.g. SchoolERP_v2\).
#   3. Close School ERP completely if it is open.
#   4. Double-click Update.bat inside the NEW version folder.
#   5. Enter the path to your existing School ERP installation.
#   6. The update preserves ALL your school data automatically.
# ============================================================

param(
    [string]$InstallPath = ""
)

$ErrorActionPreference = "Stop"
$NewVersionDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── Header ──────────────────────────────────────────────────
Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "   SchoolERP Safe Update Tool                       " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This tool will update your School ERP application." -ForegroundColor White
Write-Host "Your database, uploads, backups and config will"    -ForegroundColor White
Write-Host "NEVER be deleted or overwritten."                   -ForegroundColor White
Write-Host ""

# ── Step 1: Check if ERP is running ─────────────────────────
Write-Host "[1/5] Checking if School ERP is currently running..." -ForegroundColor Yellow
$erpProcess = Get-Process -Name "SchoolERP Desktop" -ErrorAction SilentlyContinue
if ($erpProcess) {
    Write-Host ""
    Write-Host "ERROR: School ERP is currently running." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please close the School ERP application completely" -ForegroundColor Red
    Write-Host "before running the update, then try again."         -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  School ERP is not running. Safe to continue." -ForegroundColor Green

# ── Step 2: Get the existing installation path ──────────────
Write-Host ""
Write-Host "[2/5] Locating your existing School ERP installation..." -ForegroundColor Yellow

if (-not $InstallPath) {
    Write-Host ""
    Write-Host "Enter the full path to your EXISTING School ERP folder." -ForegroundColor White
    Write-Host "Example: E:\School ERP" -ForegroundColor Gray
    Write-Host ""
    $InstallPath = Read-Host "Existing installation path"
}

$InstallPath = $InstallPath.Trim('"').TrimEnd('\').TrimEnd('/')

if (-not (Test-Path "$InstallPath\SchoolERP Desktop.exe")) {
    Write-Host ""
    Write-Host "ERROR: Could not find 'SchoolERP Desktop.exe' at:" -ForegroundColor Red
    Write-Host "  $InstallPath"                                       -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check the path and try again."                -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "  Found existing installation at: $InstallPath" -ForegroundColor Green

# ── Step 3: Confirm ─────────────────────────────────────────
Write-Host ""
Write-Host "[3/5] Ready to update." -ForegroundColor Yellow
Write-Host ""
Write-Host "  New version source : $NewVersionDir"  -ForegroundColor Cyan
Write-Host "  Existing install   : $InstallPath"    -ForegroundColor Cyan
Write-Host ""
Write-Host "  The following folders will be PRESERVED (never touched):" -ForegroundColor Green
Write-Host "    data\      — your school database"    -ForegroundColor Green
Write-Host "    uploads\   — uploaded student files"  -ForegroundColor Green
Write-Host "    backups\   — database backups"        -ForegroundColor Green
Write-Host "    config\    — application settings"    -ForegroundColor Green
Write-Host "    logs\      — application logs"        -ForegroundColor Green
Write-Host ""

$confirm = Read-Host "Type 'yes' and press Enter to proceed with the update"
if ($confirm.Trim().ToLower() -ne "yes") {
    Write-Host ""
    Write-Host "Update cancelled. No files were changed." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 0
}

# ── Step 4: Copy new application files ──────────────────────
Write-Host ""
Write-Host "[4/5] Copying updated application files..." -ForegroundColor Yellow
Write-Host ""

# These folder/file names are NEVER overwritten — they contain client data
$protected = @(
    "data",
    "uploads",
    "backups",
    "config",
    "logs"
)

$copyCount = 0
$skipCount = 0
$errorCount = 0

$items = Get-ChildItem -Path $NewVersionDir -Force
foreach ($item in $items) {
    # Always skip protected data folders
    if ($protected -contains $item.Name) {
        Write-Host "  [SKIP]  $($item.Name)  (protected — your data is safe)" -ForegroundColor DarkGray
        $skipCount++
        continue
    }

    $destination = Join-Path $InstallPath $item.Name

    try {
        if ($item.PSIsContainer) {
            Write-Host "  [UPDATE] $($item.Name)\" -ForegroundColor Cyan
            # Use robocopy for reliable directory mirroring of app files
            # /E = all subdirectories, /IS = overwrite same-size files,
            # /IT = overwrite files with same timestamp, /NFL /NDL = quiet output
            $robocopyArgs = @($item.FullName, $destination, "/E", "/IS", "/IT", "/NFL", "/NDL", "/NJH", "/NJS")
            $null = & robocopy @robocopyArgs
            # robocopy returns 0-7 for success (8+ = error)
            if ($LASTEXITCODE -ge 8) {
                throw "robocopy exited with code $LASTEXITCODE"
            }
        } else {
            Write-Host "  [UPDATE] $($item.Name)" -ForegroundColor Cyan
            Copy-Item -Path $item.FullName -Destination $destination -Force
        }
        $copyCount++
    } catch {
        Write-Host "  [ERROR]  $($item.Name): $($_.Exception.Message)" -ForegroundColor Red
        $errorCount++
    }
}

Write-Host ""
Write-Host "  Files updated : $copyCount" -ForegroundColor Green
Write-Host "  Folders kept  : $skipCount" -ForegroundColor DarkGray
if ($errorCount -gt 0) {
    Write-Host "  Errors        : $errorCount (see above)" -ForegroundColor Red
}

# ── Step 5: Done ─────────────────────────────────────────────
Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "   Update completed successfully!                    " -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your database, uploads, backups and configuration"    -ForegroundColor Green
Write-Host "are completely intact."                                -ForegroundColor Green
Write-Host ""

if ($errorCount -gt 0) {
    Write-Host "WARNING: $errorCount file(s) could not be updated (see above)." -ForegroundColor Yellow
    Write-Host "The application may still work. If you see errors after launching," -ForegroundColor Yellow
    Write-Host "please contact your system administrator."                          -ForegroundColor Yellow
    Write-Host ""
}

$launch = Read-Host "Launch School ERP now? (yes/no)"
if ($launch.Trim().ToLower() -eq "yes") {
    Write-Host ""
    Write-Host "Starting School ERP..." -ForegroundColor Cyan
    Start-Process -FilePath (Join-Path $InstallPath "SchoolERP Desktop.exe")
}

Write-Host ""
Read-Host "Press Enter to close this window"
