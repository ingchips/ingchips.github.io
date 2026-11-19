param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$siteDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceRoot = Split-Path -Parent $siteDir
$script = Join-Path $siteDir '.github\scripts\sync_books.py'

if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
    throw "Book sync script was not found: $script"
}

$arguments = @(
    $script,
    '--site-dir', $siteDir,
    '--source-root', $sourceRoot
)

if ($DryRun) {
    $arguments += '--dry-run'
}

python @arguments
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
