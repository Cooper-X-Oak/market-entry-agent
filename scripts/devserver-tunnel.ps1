$ErrorActionPreference = 'Stop'

$controlRoot = Join-Path $env:LOCALAPPDATA 'MarketEntryAgent\Vultr'
$configPath = Join-Path $controlRoot 'config.json'
$statePath = Join-Path $controlRoot 'state.json'
$knownHostsPath = Join-Path $controlRoot 'known_hosts'

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "Vultr configuration was not found: $configPath"
}
if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
    throw "No managed Vultr test server is recorded: $statePath"
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($config.projectName -ne 'market-entry-agent') {
    throw "Unexpected managed project: $($config.projectName)"
}
if ([string]::IsNullOrWhiteSpace($state.mainIp) -or [string]::IsNullOrWhiteSpace($state.instanceId)) {
    throw 'Managed Vultr test server state is incomplete.'
}

$sshKeyPath = $config.sshPrivateKeyPath
$sshTarget = "$($config.sshUser)@$($state.mainIp)"

if (-not (Test-Path -LiteralPath $sshKeyPath -PathType Leaf)) {
    throw "SSH private key was not found: $sshKeyPath"
}

ssh.exe `
    -F NUL `
    -N `
    -T `
    -o ServerAliveInterval=15 `
    -o ServerAliveCountMax=3 `
    -o StrictHostKeyChecking=accept-new `
    -o "UserKnownHostsFile=$knownHostsPath" `
    -i $sshKeyPath `
    -L 3000:127.0.0.1:3000 `
    -L 4000:127.0.0.1:4000 `
    -L 8080:127.0.0.1:8080 `
    -L 9001:127.0.0.1:9001 `
    -L 5432:127.0.0.1:5432 `
    $sshTarget
