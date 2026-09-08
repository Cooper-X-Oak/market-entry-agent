$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
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
$remoteRepo = $config.remoteProjectRoot
$composeFile = $config.composeFile
$remoteEnvironmentPath = $config.remoteEnvironmentPath
$sshArgs = @(
    '-F', 'NUL',
    '-p', '22',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', "UserKnownHostsFile=$knownHostsPath",
    '-i', $sshKeyPath,
    $sshTarget
)

if (-not (Test-Path -LiteralPath $sshKeyPath -PathType Leaf)) {
    throw "SSH private key was not found: $sshKeyPath"
}

Push-Location $repoRoot
try {
    tar.exe -C $repoRoot `
        --exclude=.git `
        --exclude=node_modules `
        --exclude=.next `
        --exclude=.turbo `
        --exclude=.codex-transfer* `
        --exclude='*.tsbuildinfo' `
        --exclude=dist `
        --exclude=coverage `
        --exclude=playwright-report `
        --exclude=test-results `
        --exclude=.env `
        --exclude=.env.local `
        -cf - . |
        ssh.exe @sshArgs "sudo mkdir -p $remoteRepo && sudo tar -xf - -C $remoteRepo && sudo chown -R deployer:deployer $remoteRepo"
    if ($LASTEXITCODE -ne 0) {
        throw "Source synchronization failed (ssh exit code $LASTEXITCODE)."
    }

    ssh.exe @sshArgs "cd $remoteRepo && docker compose --env-file $remoteEnvironmentPath -f $composeFile run --rm deps"
    if ($LASTEXITCODE -ne 0) {
        throw "Remote dependency installation failed (ssh exit code $LASTEXITCODE)."
    }

    ssh.exe @sshArgs "cd $remoteRepo && docker compose --env-file $remoteEnvironmentPath -f $composeFile run --rm deps sh -lc 'corepack enable && for project in packages/contracts/tsconfig.json packages/domain/tsconfig.json packages/config/tsconfig.json packages/evidence/tsconfig.json packages/policies/tsconfig.json packages/connectors/tsconfig.json packages/database/tsconfig.json packages/agents/tsconfig.json packages/workflows/tsconfig.json packages/observability/tsconfig.json; do pnpm exec tsc -p `"`$project`" --pretty false || exit 1; done && pnpm exec tsc -p apps/api/tsconfig.json --noCheck --tsBuildInfoFile /tmp/imea-api.tsbuildinfo'"
    if ($LASTEXITCODE -ne 0) {
        throw "Remote development artifact build failed (ssh exit code $LASTEXITCODE)."
    }

    ssh.exe @sshArgs "cd $remoteRepo && docker compose --env-file $remoteEnvironmentPath -f $composeFile up -d"
    if ($LASTEXITCODE -ne 0) {
        throw "Remote development stack startup failed (ssh exit code $LASTEXITCODE)."
    }

    ssh.exe @sshArgs "cd $remoteRepo && docker compose --env-file $remoteEnvironmentPath -f $composeFile restart api worker projector web"
    if ($LASTEXITCODE -ne 0) {
        throw "Remote application restart failed (ssh exit code $LASTEXITCODE)."
    }

    ssh.exe @sshArgs "cd $remoteRepo && docker compose --env-file $remoteEnvironmentPath -f $composeFile ps"
    if ($LASTEXITCODE -ne 0) {
        throw "Remote service status command failed (ssh exit code $LASTEXITCODE)."
    }
}
finally {
    Pop-Location
}
