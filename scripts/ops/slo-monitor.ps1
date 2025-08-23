# SLO Monitor PowerShell Script
# Windows-compatible wrapper for the SLO monitoring CLI tool

param(
    [switch]$Continuous,
    [switch]$Dashboard,
    [int]$Period = 24,
    [string]$Output = "",
    [switch]$MockData,
    [switch]$Verbose,
    [switch]$Help
)

# Set error handling
$ErrorActionPreference = "Stop"

# Colors for output
$Colors = @{
    Success = "Green"
    Warning = "Yellow" 
    Error = "Red"
    Info = "Cyan"
    Header = "Magenta"
}

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Show-Help {
    Write-ColorOutput "Unit Talk SLO Monitor" -Color $Colors.Header
    Write-ColorOutput ""
    Write-ColorOutput "USAGE:" -Color $Colors.Info
    Write-ColorOutput "  .\scripts\ops\slo-monitor.ps1 [OPTIONS]"
    Write-ColorOutput ""
    Write-ColorOutput "OPTIONS:" -Color $Colors.Info
    Write-ColorOutput "  -Continuous     Start continuous monitoring (runs until stopped)"
    Write-ColorOutput "  -Dashboard      Generate dashboard data only"
    Write-ColorOutput "  -Period HOURS   Report period in hours (default: 24)"
    Write-ColorOutput "  -Output PATH    Output directory (default: out\ops)"
    Write-ColorOutput "  -MockData       Use mock data for testing (no database required)"
    Write-ColorOutput "  -Verbose        Enable verbose logging"
    Write-ColorOutput "  -Help           Show this help message"
    Write-ColorOutput ""
    Write-ColorOutput "EXAMPLES:" -Color $Colors.Info
    Write-ColorOutput "  .\scripts\ops\slo-monitor.ps1                    # Generate 24-hour SLO report"
    Write-ColorOutput "  .\scripts\ops\slo-monitor.ps1 -Period 48         # Generate 48-hour report"  
    Write-ColorOutput "  .\scripts\ops\slo-monitor.ps1 -Dashboard         # Dashboard data only"
    Write-ColorOutput "  .\scripts\ops\slo-monitor.ps1 -Continuous        # Continuous monitoring"
    Write-ColorOutput "  .\scripts\ops\slo-monitor.ps1 -MockData -Verbose # Test with mock data"
    Write-ColorOutput ""
    Write-ColorOutput "OUTPUT:" -Color $Colors.Info
    Write-ColorOutput "  Reports are saved to out\ops\slo-report-YYYY-MM-DD.json"
    Write-ColorOutput "  Dashboard data is saved to out\ops\slo.json"
    Write-ColorOutput ""
    Write-ColorOutput "SLO METRICS:" -Color $Colors.Info
    Write-ColorOutput "  - ingest_to_processed_latency: raw_props.inserted_at -> raw_props.processed_at"
    Write-ColorOutput "  - processed_to_promoted_latency: raw_props.processed_at -> unified_picks.promoted_at"  
    Write-ColorOutput "  - end_to_end_latency: raw_props.inserted_at -> unified_picks.promoted_at"
}

function Test-Prerequisites {
    Write-ColorOutput "Checking prerequisites..." -Color $Colors.Info
    
    # Check if Node.js is available
    try {
        $nodeVersion = node --version 2>$null
        Write-ColorOutput "  ✅ Node.js: $nodeVersion" -Color $Colors.Success
    }
    catch {
        Write-ColorOutput "  ❌ Node.js not found. Please install Node.js." -Color $Colors.Error
        exit 1
    }
    
    # Check if npm is available
    try {
        $npmVersion = npm --version 2>$null
        Write-ColorOutput "  ✅ npm: v$npmVersion" -Color $Colors.Success
    }
    catch {
        Write-ColorOutput "  ❌ npm not found. Please install npm." -Color $Colors.Error
        exit 1
    }
    
    # Check if TypeScript files exist
    $tsConfigPath = "tsconfig.json"
    if (Test-Path $tsConfigPath) {
        Write-ColorOutput "  ✅ TypeScript configuration found" -Color $Colors.Success
    }
    else {
        Write-ColorOutput "  ⚠️  TypeScript configuration not found - proceeding anyway" -Color $Colors.Warning
    }
    
    # Check if SLO config exists
    $sloConfigPath = "config\slo.json"
    if (Test-Path $sloConfigPath) {
        Write-ColorOutput "  ✅ SLO configuration found" -Color $Colors.Success
    }
    else {
        Write-ColorOutput "  ⚠️  SLO configuration not found at $sloConfigPath" -Color $Colors.Warning
    }
}

function Invoke-SLOMonitor {
    param(
        [string[]]$Arguments
    )
    
    try {
        Write-ColorOutput "Starting SLO monitoring..." -Color $Colors.Info
        Write-ColorOutput "Arguments: $($Arguments -join ' ')" -Color $Colors.Info
        Write-ColorOutput ""
        
        # Build the command
        $tsNodeCommand = "npx"
        $tsNodeArgs = @("tsx", "scripts/ops/slo-monitor.ts") + $Arguments
        
        # Execute the command
        & $tsNodeCommand $tsNodeArgs
        
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput ""
            Write-ColorOutput "✅ SLO monitoring completed successfully" -Color $Colors.Success
        }
        else {
            Write-ColorOutput ""
            Write-ColorOutput "❌ SLO monitoring failed with exit code: $LASTEXITCODE" -Color $Colors.Error
            exit $LASTEXITCODE
        }
    }
    catch {
        Write-ColorOutput ""
        Write-ColorOutput "❌ Error executing SLO monitor: $($_.Exception.Message)" -Color $Colors.Error
        exit 1
    }
}

# Main execution
try {
    Write-ColorOutput "Unit Talk SLO Monitor (PowerShell)" -Color $Colors.Header
    Write-ColorOutput "=================================" -Color $Colors.Header
    Write-ColorOutput ""
    
    if ($Help) {
        Show-Help
        exit 0
    }
    
    # Test prerequisites
    Test-Prerequisites
    Write-ColorOutput ""
    
    # Build arguments array
    $arguments = @()
    
    if ($Continuous) {
        $arguments += "--continuous"
    }
    
    if ($Dashboard) {
        $arguments += "--dashboard"
    }
    
    if ($Period -ne 24) {
        $arguments += "--period", $Period
    }
    
    if ($Output -ne "") {
        # Convert Windows path separators to forward slashes for Node.js
        $normalizedOutput = $Output -replace '\\', '/'
        $arguments += "--output", $normalizedOutput
    }
    
    if ($MockData) {
        $arguments += "--mock-data"
    }
    
    if ($Verbose) {
        $arguments += "--verbose"
    }
    
    # Ensure output directory exists
    $outputDir = if ($Output -ne "") { $Output } else { "out\ops" }
    if (-not (Test-Path $outputDir)) {
        Write-ColorOutput "Creating output directory: $outputDir" -Color $Colors.Info
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }
    
    # Execute the SLO monitor
    Invoke-SLOMonitor -Arguments $arguments
    
    # Display output files if they exist
    Write-ColorOutput ""
    Write-ColorOutput "📂 Output Files:" -Color $Colors.Info
    
    $sloJsonPath = Join-Path $outputDir "slo.json"
    if (Test-Path $sloJsonPath) {
        $sloFileSize = (Get-Item $sloJsonPath).Length
        Write-ColorOutput "   📊 Dashboard Data: $sloJsonPath ($sloFileSize bytes)" -Color $Colors.Success
    }
    
    $reportFiles = Get-ChildItem -Path $outputDir -Filter "slo-report-*.json" -ErrorAction SilentlyContinue
    if ($reportFiles) {
        foreach ($reportFile in $reportFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1) {
            Write-ColorOutput "   📈 Latest Report: $($reportFile.FullName) ($($reportFile.Length) bytes)" -Color $Colors.Success
        }
    }
}
catch {
    Write-ColorOutput ""
    Write-ColorOutput "❌ PowerShell script error: $($_.Exception.Message)" -Color $Colors.Error
    Write-ColorOutput "Stack trace: $($_.ScriptStackTrace)" -Color $Colors.Error
    exit 1
}

Write-ColorOutput ""
Write-ColorOutput "SLO Monitor PowerShell execution completed." -Color $Colors.Info