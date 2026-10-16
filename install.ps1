param([string]$Workspace, [ValidateSet('ko','en','es')][string]$Language, [switch]$NoShortcut, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$pintoRoot = $PSScriptRoot
Set-Location -LiteralPath $pintoRoot
if (-not (Test-Path -LiteralPath (Join-Path $pintoRoot 'package-lock.json'))) { throw 'Download the full PINTO source repository first.' }
$pintoRuntime = Join-Path $pintoRoot '.pinto\runtime'
$pintoNode = $null
$pintoExisting = Get-Command node -ErrorAction SilentlyContinue
if ($pintoExisting) {
    & $pintoExisting.Source -e "let [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||a===22&&b>=12?0:1)"
    if ($LASTEXITCODE -eq 0) { $pintoNode = $pintoExisting.Source }
}
if (-not $pintoNode) {
    $pintoVersion = '24.18.0'
    $pintoArch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    $pintoName = "node-v$pintoVersion-win-$pintoArch"
    $pintoNode = Join-Path $pintoRuntime "$pintoName\node.exe"
    if (-not (Test-Path -LiteralPath $pintoNode)) {
        New-Item -ItemType Directory -Force -Path $pintoRuntime | Out-Null
        $pintoZip = Join-Path $pintoRuntime "$pintoName.zip"
        $pintoBase = "https://nodejs.org/dist/v$pintoVersion"
        Write-Host 'Preparing the local Node.js runtime...'
        Invoke-WebRequest -UseBasicParsing -Uri "$pintoBase/$pintoName.zip" -OutFile $pintoZip
        $pintoSums = (Invoke-WebRequest -UseBasicParsing -Uri "$pintoBase/SHASUMS256.txt").Content
        $pintoExpected = (($pintoSums -split "`n" | Where-Object { $_.Trim().EndsWith(" $pintoName.zip") }) -split '\s+')[0]
        $pintoActual = (Get-FileHash -LiteralPath $pintoZip -Algorithm SHA256).Hash.ToLowerInvariant()
        if (-not $pintoExpected -or $pintoActual -ne $pintoExpected) { throw 'Node.js checksum verification failed.' }
        Expand-Archive -LiteralPath $pintoZip -DestinationPath $pintoRuntime -Force
    }
}
$pintoNodeDir = Split-Path -Parent $pintoNode
$env:PATH = "$pintoNodeDir;$env:PATH"
$pintoNpm = Join-Path $pintoNodeDir 'node_modules\npm\bin\npm-cli.js'
if (-not (Test-Path -LiteralPath $pintoNpm)) { throw 'npm was not found beside Node.js. Use an official Node.js installation.' }
$env:electron_config_cache = Join-Path $pintoRoot '.pinto\electron-cache'
& $pintoNode $pintoNpm ci --no-audit --no-fund --cache (Join-Path $pintoRoot '.pinto\npm-cache')
if ($LASTEXITCODE -ne 0) { throw 'Package installation failed.' }
& $pintoNode (Join-Path $pintoRoot 'node_modules\electron\install.js')
if ($LASTEXITCODE -ne 0) { throw 'Electron setup failed.' }
& $pintoNode $pintoNpm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
$pintoArgs = @((Join-Path $pintoRoot 'scripts\setup.mjs'))
if ($Workspace) { $pintoArgs += @('--workspace', (Resolve-Path -LiteralPath $Workspace).Path) }
if ($NoShortcut) { $pintoArgs += '--no-shortcut' }
if ($NoLaunch) { $pintoArgs += '--no-launch' }
if ($Language) { $pintoArgs += @('--language', $Language) }
& $pintoNode @pintoArgs
if ($LASTEXITCODE -ne 0) { throw 'PINTO setup did not complete.' }
