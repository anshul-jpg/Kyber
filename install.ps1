# Kyber Universal Installer - PowerShell
# Autonomous Pocket Supervisor and Tool Gatekeeper for Google Antigravity IDE
# Usage:
#   irm https://raw.githubusercontent.com/<repo>/master/install.ps1 | iex
#   or locally: powershell -ExecutionPolicy Bypass -File .\install.ps1

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Show-Banner {
    Write-Host ""
    Write-Host "===============================================================" -ForegroundColor Cyan
    Write-Host "   KYBER // AUTONOMOUS POCKET SUPERVISOR                       " -ForegroundColor Cyan
    Write-Host "   Remote Gatekeeper for Google Antigravity IDE                " -ForegroundColor Cyan
    Write-Host "===============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step([string]$step, [string]$msg) {
    Write-Host "[$step] " -ForegroundColor Green -NoNewline
    Write-Host $msg -ForegroundColor White
}

function Write-Info([string]$msg) {
    Write-Host "  -> " -ForegroundColor Cyan -NoNewline
    Write-Host $msg
}

function Write-Success([string]$msg) {
    Write-Host "  [OK] " -ForegroundColor Green -NoNewline
    Write-Host $msg
}

function Write-Warn([string]$msg) {
    Write-Host "  [!] " -ForegroundColor Yellow -NoNewline
    Write-Host $msg
}

Show-Banner

# 1. Detect Antigravity and VS Code
Write-Step "1/4" "Detecting IDE Environments..."

$IdeCommands = @("antigravity", "code", "cursor", "windsurf")
$DetectedIDEs = @()

foreach ($cmd in $IdeCommands) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($found) {
        $DetectedIDEs += $cmd
        Write-Success "Found IDE binary in PATH: $cmd"
    }
}

if ($DetectedIDEs.Count -eq 0) {
    $AntigravityPath = Join-Path $env:LOCALAPPDATA "Programs\antigravity\antigravity.exe"
    if (Test-Path $AntigravityPath) {
        Write-Success "Found Antigravity IDE at $AntigravityPath"
        $DetectedIDEs += $AntigravityPath
    } else {
        Write-Info "Manual VSIX install can be completed inside the IDE."
    }
}

# 2. Locate or Download VSIX Extension
Write-Step "2/4" "Locating Self-Contained Extension Bundle..."

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) {
    $ScriptDir = (Get-Location).Path
}

$LocalVsix = Join-Path $ScriptDir "packages\vscode-extension\antigravity-companion-0.1.0.vsix"
if (-not (Test-Path $LocalVsix)) {
    $LocalVsix = Join-Path (Get-Location) "packages\vscode-extension\antigravity-companion-0.1.0.vsix"
}

if (Test-Path $LocalVsix) {
    Write-Success "Found local VSIX bundle: $LocalVsix"
    $TargetVsix = $LocalVsix
} else {
    Write-Info "Checking for remote release on GitHub..."
    $TempVsix = Join-Path $env:TEMP "kyber-companion.vsix"
    try {
        $ReleaseUrl = "https://github.com/anshul-jpg/Kyber/releases/latest/download/antigravity-companion-0.1.0.vsix"
        Invoke-WebRequest -Uri $ReleaseUrl -OutFile $TempVsix -UseBasicParsing -ErrorAction Stop
        $TargetVsix = $TempVsix
        Write-Success "Downloaded release bundle to $TempVsix"
    } catch {
        Write-Warn "Could not fetch remote GitHub release. Using local repo build if available."
        $TargetVsix = $null
    }
}

# 3. Install Extension into IDEs
if ($TargetVsix -and (Test-Path $TargetVsix)) {
    Write-Step "3/4" "Installing Extension..."
    $installedCli = $false
    foreach ($ide in $DetectedIDEs) {
        if ($ide -match "code|cursor|windsurf" -and -not ($ide.EndsWith(".exe"))) {
            try {
                Write-Info "Installing into $ide..."
                & $ide --install-extension $TargetVsix --force | Out-Null
                Write-Success "Installed into $ide successfully!"
                $installedCli = $true
            } catch {
                Write-Warn "Could not run $ide CLI auto-install."
            }
        }
    }
    if (-not $installedCli) {
        Write-Success "Extension bundle ready: $TargetVsix"
        Write-Info "To install in Antigravity IDE: Press Ctrl+Shift+X -> ... -> 'Install from VSIX...'"
    }
} else {
    Write-Step "3/4" "Extension ready in repo. Build via: npm run package:ext"
}

# 4. Universal Hook Setup (~/.gemini/config/hooks.json)
Write-Step "4/4" "Configuring Universal Tool Approval Interceptor..."

$GlobalConfigDir = Join-Path $env:USERPROFILE ".gemini\config"
if (-not (Test-Path $GlobalConfigDir)) {
    New-Item -ItemType Directory -Path $GlobalConfigDir -Force | Out-Null
}

$GlobalHooksFile = Join-Path $GlobalConfigDir "hooks.json"
$GlobalInterceptor = Join-Path $GlobalConfigDir "interceptor.js"

# Copy canonical interceptor
$LocalInterceptor = Join-Path $ScriptDir "packages\cli\assets\interceptor.js"
if (Test-Path $LocalInterceptor) {
    Copy-Item -Path $LocalInterceptor -Destination $GlobalInterceptor -Force
    Write-Success "Copied interceptor to $GlobalInterceptor"
}

# Update or create hooks.json
$HookConfig = @{
    "companion-interceptor" = @{
        "PreToolUse" = @(
            @{
                "matcher" = "run_command|write_to_file|replace_file_content|multi_replace_file_content|ask_question"
                "hooks" = @(
                    @{
                        "type" = "command"
                        "command" = ('node "' + $GlobalInterceptor + '"')
                        "timeout" = 130
                    }
                )
            }
        )
    }
}

$HookConfig | ConvertTo-Json -Depth 6 | Set-Content -Path $GlobalHooksFile -Encoding UTF8
Write-Success "Universal Global Hook enabled at $GlobalHooksFile"

# Ensure global mode and policy files exist
$GlobalModeFile = Join-Path $env:USERPROFILE ".agy-companion-mode"
if (-not (Test-Path $GlobalModeFile)) {
    Set-Content -Path $GlobalModeFile -Value "remote" -Encoding ASCII
}
Write-Success "Companion Mode initialized to: $(Get-Content $GlobalModeFile)"

$GlobalPolicyFile = Join-Path $env:USERPROFILE ".agy-companion-policy"
if (-not (Test-Path $GlobalPolicyFile)) {
    Set-Content -Path $GlobalPolicyFile -Value "always_proceed" -Encoding ASCII
}
Write-Success "Execution Policy initialized to: $(Get-Content $GlobalPolicyFile)"

# 5. Antigravity IDE User Settings Injection (Permanent always-proceed)
$AgyCandidateDirs = @(
    (Join-Path $env:APPDATA "Antigravity IDE\User"),
    (Join-Path $env:APPDATA "Antigravity\User"),
    (Join-Path $env:APPDATA "Code\User")
)

foreach ($TargetDir in $AgyCandidateDirs) {
    if (Test-Path $TargetDir -PathType Container) {
        $TargetSettings = Join-Path $TargetDir "settings.json"
        $CurrentSettings = @{}
        if (Test-Path $TargetSettings) {
            try {
                $RawContent = Get-Content $TargetSettings -Raw -Encoding UTF8
                if ($RawContent) {
                    $CurrentSettings = $RawContent | ConvertFrom-Json -AsHashtable
                }
            } catch {}
        }
        $CurrentSettings["antigravity.toolExecutionPolicy"] = "always-proceed"
        $CurrentSettings["antigravity.autoExecutionPolicy"] = "always-proceed"
        $CurrentSettings["antigravity.artifactReviewMode"] = "always-proceed"
        
        try {
            $CurrentSettings | ConvertTo-Json -Depth 10 | Set-Content -Path $TargetSettings -Encoding UTF8
            Write-Success "Injected always-proceed keys into $TargetSettings"
        } catch {
            Write-Warning "Could not update settings in $TargetSettings"
        }
    }
}

Write-Host ""
Write-Host "===============================================================" -ForegroundColor Green
Write-Host "   KYBER SETUP COMPLETE! READY FOR AUTONOMOUS OPERATION       " -ForegroundColor Green
Write-Host "===============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Open Antigravity IDE" -ForegroundColor Cyan
Write-Host "  2. Look at the left Activity Bar for the KYBER icon" -ForegroundColor Cyan
Write-Host "  3. Scan the QR code with your phone camera"
Write-Host "  4. Switch your phone to Remote Mode and walk away!" -ForegroundColor Magenta
Write-Host ""
