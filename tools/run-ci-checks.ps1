[CmdletBinding()]
param(
    [ValidateSet(
        "all",
        "frontend",
        "backend-api",
        "aviation-poller",
        "maritime-poller",
        "rf-pulse",
        "space-pulse",
        "infra-poller",
        "gdelt-pulse",
        "js8call"
    )]
    [string[]]$Jobs = @("all"),

    [string[]]$ChangedFiles = @(),

    [switch]$InstallDeps,

    [switch]$ContinueOnFailure,

    [switch]$VerbosePytest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvPythonWindows = Join-Path $repoRoot ".venv/Scripts/python.exe"
$venvPythonUnix = Join-Path $repoRoot ".venv/bin/python"
$pythonExe = "python"

if (Test-Path $venvPythonWindows) {
    $pythonExe = $venvPythonWindows
}
elseif (Test-Path $venvPythonUnix) {
    $pythonExe = $venvPythonUnix
}

function Write-Section {
    param([string]$Message)
    Write-Host ""
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Exe,
        [Parameter()][string[]]$Args = @()
    )

    Push-Location $WorkingDirectory
    try {
        Write-Host ("[{0}] > {1} {2}" -f (Split-Path $WorkingDirectory -Leaf), $Exe, ($Args -join " ")) -ForegroundColor DarkGray
        & $Exe @Args
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) {
            $exitCode = 0
        }
        if ($exitCode -ne 0) {
            throw ("Command failed with exit code {0}: {1} {2}" -f $exitCode, $Exe, ($Args -join " "))
        }
    }
    finally {
        Pop-Location
    }
}

function Normalize-RepoPath {
    param([string]$Path)

    $p = $Path -replace "\\", "/"
    if ($p -match "^[A-Za-z]:/") {
        $rootNorm = $repoRoot -replace "\\", "/"
        if ($p.StartsWith($rootNorm, [System.StringComparison]::OrdinalIgnoreCase)) {
            $p = $p.Substring($rootNorm.Length).TrimStart("/")
        }
    }
    return $p.TrimStart("/")
}

$jobDefinitions = [ordered]@{
    "frontend" = @{
        WorkingDir  = "frontend"
        InstallCmds = @(@("pnpm", @("install", "--frozen-lockfile")))
        TestCmds    = @(
            @("pnpm", @("run", "lint")),
            @("pnpm", @("run", "test"))
        )
    }
    "backend-api" = @{
        WorkingDir  = "backend/api"
        InstallCmds = @(
            @($pythonExe, @("-m", "pip", "install", "--quiet",
                "-e", ".",
                "pytest==9.0.2",
                "pytest-asyncio==1.3.0"
            ))
        )
        TestCmds    = @(@($pythonExe, @("-m", "pytest", "tests/", "-v")))
    }
    "aviation-poller" = @{
        WorkingDir  = "backend/ingestion/aviation_poller"
        InstallCmds = @(
            @($pythonExe, @("-m", "pip", "install", "--quiet",
                "-e", ".",
                "pytest==9.0.2",
                "pytest-asyncio==1.3.0",
                "fakeredis==2.34.1"
            ))
        )
        TestCmds    = @(@($pythonExe, @("-m", "pytest", "tests/", "-v")))
    }
    "maritime-poller" = @{
        WorkingDir  = "backend/ingestion/maritime_poller"
        InstallCmds = @(@($pythonExe, @("-m", "pip", "install", "--quiet", "-e", ".", "pytest==9.0.2")))
        TestCmds    = @(@($pythonExe, @("-m", "pytest", "tests/", "-v")))
    }
    "rf-pulse" = @{
        WorkingDir  = "backend/ingestion/rf_pulse"
        InstallCmds = @(@($pythonExe, @("-m", "pip", "install", "--quiet", "-e", ".", "pytest==9.0.2", "pytest-asyncio==1.3.0")))
        TestCmds    = @(@($pythonExe, @("-m", "pytest", "tests/", "-v")))
    }
    "space-pulse" = @{
        WorkingDir  = "backend/ingestion/space_pulse"
        InstallCmds = @(
            @($pythonExe, @("-m", "pip", "install", "--quiet",
                "-e", ".",
                "pytest==9.0.2"
            ))
        )
        TestCmds    = @(@($pythonExe, @("-m", "pytest", "tests/", "-v")))
    }
    "infra-poller" = @{
        WorkingDir  = "backend/ingestion/infra_poller"
        InstallCmds = @(@($pythonExe, @("-m", "pip", "install", "--quiet", "-e", ".", "pytest==9.0.2")))
        TestCmds    = @(@($pythonExe, @("-m", "pytest", "tests/", "-v")))
    }
    "gdelt-pulse" = @{
        WorkingDir  = "backend/ingestion/gdelt_pulse"
        InstallCmds = @(@($pythonExe, @("-m", "pip", "install", "--quiet", "-e", ".", "pytest==9.0.2", "pytest-asyncio==1.3.0")))
        TestCmds    = @(@($pythonExe, @("-m", "pytest", "tests/", "-v")))
    }
    "js8call" = @{
        WorkingDir  = "js8call"
        InstallCmds = @(@($pythonExe, @("-m", "pip", "install", "--quiet", "-e", ".", "pytest==9.0.2", "pytest-asyncio==1.3.0")))
        TestCmds    = @(@($pythonExe, @("-m", "pytest", "tests/", "-v")))
    }
}

$filterMap = [ordered]@{
    "frontend"        = @("frontend/**", ".github/workflows/ci.yml")
    "backend-api"     = @("backend/api/**", ".github/workflows/ci.yml")
    "aviation-poller" = @("backend/ingestion/aviation_poller/**", ".github/workflows/ci.yml")
    "maritime-poller" = @("backend/ingestion/maritime_poller/**", ".github/workflows/ci.yml")
    "rf-pulse"        = @("backend/ingestion/rf_pulse/**", ".github/workflows/ci.yml")
    "space-pulse"     = @("backend/ingestion/space_pulse/**", ".github/workflows/ci.yml")
    "infra-poller"    = @("backend/ingestion/infra_poller/**", ".github/workflows/ci.yml")
    "gdelt-pulse"     = @("backend/ingestion/gdelt_pulse/**", ".github/workflows/ci.yml")
    "js8call"         = @("js8call/**", ".github/workflows/ci.yml")
}

function Expand-GlobLikePattern {
    param([string]$Pattern)
    if ($Pattern.EndsWith("/**")) {
        return $Pattern.Substring(0, $Pattern.Length - 3) + "/*"
    }
    return $Pattern
}

function Resolve-JobsFromChangedFiles {
    param([string[]]$Files)

    if ($Files.Count -eq 0) {
        return @()
    }

    $normalized = @($Files | ForEach-Object { Normalize-RepoPath $_ })
    $selected = New-Object System.Collections.Generic.HashSet[string]

    foreach ($job in $filterMap.Keys) {
        $patterns = $filterMap[$job]
        foreach ($file in $normalized) {
            foreach ($pattern in $patterns) {
                $glob = Expand-GlobLikePattern $pattern
                if ($file -like $glob) {
                    [void]$selected.Add($job)
                    break
                }
            }
        }
    }

    return @($selected)
}

if ($VerbosePytest) {
    foreach ($job in $jobDefinitions.Keys) {
        for ($i = 0; $i -lt $jobDefinitions[$job].TestCmds.Count; $i++) {
            $cmd = $jobDefinitions[$job].TestCmds[$i]
            if ($cmd[0] -eq "python" -and ($cmd[1] -contains "pytest")) {
                $jobDefinitions[$job].TestCmds[$i][1] = @("-m", "pytest", "tests/", "-vv")
            }
        }
    }
}

$jobsToRun = @()

if ($ChangedFiles.Count -gt 0) {
    $jobsToRun = Resolve-JobsFromChangedFiles -Files $ChangedFiles
    if ($jobsToRun.Count -eq 0) {
        throw "No matching jobs found for provided ChangedFiles."
    }
}
elseif ($Jobs -contains "all") {
    $jobsToRun = @($jobDefinitions.Keys)
}
else {
    $jobsToRun = @($Jobs)
}

Write-Section "CI Dry Run"
Write-Host ("Repository: {0}" -f $repoRoot)
Write-Host ("Jobs: {0}" -f ($jobsToRun -join ", "))
Write-Host ("InstallDeps: {0}" -f $InstallDeps.IsPresent)

$results = @()

foreach ($jobName in $jobsToRun) {
    $definition = $jobDefinitions[$jobName]
    $workDir = Join-Path $repoRoot $definition.WorkingDir

    $start = Get-Date
    $status = "passed"
    $errorMessage = ""

    Write-Section $jobName

    try {
        $installCommands = @($definition.InstallCmds)
        if ($installCommands.Count -gt 0 -and $installCommands[0] -is [string]) {
            # Single command pairs can be flattened by PowerShell array semantics.
            # Wrap back into a one-item command list: @(@("exe", @("arg1", ...)))
            $installCommands = @(,$installCommands)
        }

        $testCommands = @($definition.TestCmds)
        if ($testCommands.Count -gt 0 -and $testCommands[0] -is [string]) {
            $testCommands = @(,$testCommands)
        }

        if ($InstallDeps) {
            foreach ($installCmd in $installCommands) {
                Invoke-External -WorkingDirectory $workDir -Exe $installCmd[0] -Args $installCmd[1]
            }
        }

        foreach ($testCmd in $testCommands) {
            Invoke-External -WorkingDirectory $workDir -Exe $testCmd[0] -Args $testCmd[1]
        }
    }
    catch {
        $status = "failed"
        $errorMessage = $_.Exception.Message
        Write-Host ("FAILED: {0}" -f $errorMessage) -ForegroundColor Red
        if (-not $ContinueOnFailure) {
            $results += [PSCustomObject]@{
                Job      = $jobName
                Status   = $status
                Seconds  = [math]::Round(((Get-Date) - $start).TotalSeconds, 2)
                Error    = $errorMessage
            }
            break
        }
    }

    $results += [PSCustomObject]@{
        Job      = $jobName
        Status   = $status
        Seconds  = [math]::Round(((Get-Date) - $start).TotalSeconds, 2)
        Error    = $errorMessage
    }
}

Write-Section "Summary"
$results | Format-Table -AutoSize

if ($results.Where({ $_.Status -eq "failed" }).Count -gt 0) {
    exit 1
}

exit 0
