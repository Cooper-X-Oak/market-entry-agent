param(
    [ValidateSet('gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-luna')]
    [string]$Model = 'gpt-6-astra'
)

$ErrorActionPreference = 'Stop'

$controlRoot = Join-Path $env:LOCALAPPDATA 'MarketEntryAgent\Vultr'
$secretPath = Join-Path $env:LOCALAPPDATA 'MarketEntryAgent\Secrets\provider.env'
$configPath = Join-Path $controlRoot 'config.json'
$statePath = Join-Path $controlRoot 'state.json'
$knownHostsPath = Join-Path $controlRoot 'known_hosts'

foreach ($requiredPath in @($secretPath, $configPath, $statePath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required file was not found: $requiredPath"
    }
}

$providerValues = @{}
foreach ($line in Get-Content -LiteralPath $secretPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $parts = $trimmed -split '=', 2
    if ($parts.Count -eq 2) {
        $providerValues[$parts[0].Trim()] = $parts[1].Trim()
    }
}

foreach ($requiredName in @('OPENAI_BASE_URL', 'OPENAI_API_KEY')) {
    if ([string]::IsNullOrWhiteSpace($providerValues[$requiredName])) {
        throw "$requiredName is missing from the local provider file."
    }
}

$providerUri = $null
if (-not [Uri]::TryCreate($providerValues['OPENAI_BASE_URL'], [UriKind]::Absolute, [ref]$providerUri) -or $providerUri.Scheme -ne 'https') {
    throw 'OPENAI_BASE_URL must be an absolute HTTPS URL.'
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($config.projectName -ne 'market-entry-agent') {
    throw "Unexpected managed project: $($config.projectName)"
}
if ([string]::IsNullOrWhiteSpace($state.instanceId) -or [string]::IsNullOrWhiteSpace($state.mainIp)) {
    throw 'Managed Vultr test server state is incomplete.'
}

$sshTarget = "$($config.sshUser)@$($state.mainIp)"
$remoteEnvironmentPath = $config.remoteEnvironmentPath
$remoteSecretPath = "/tmp/imea-provider-$($state.instanceId).env"
$sshCommon = @(
    '-F', 'NUL',
    '-p', '22',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', "UserKnownHostsFile=$knownHostsPath",
    '-i', $config.sshPrivateKeyPath
)
$scpCommon = @(
    '-F', 'NUL',
    '-P', '22',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', "UserKnownHostsFile=$knownHostsPath",
    '-i', $config.sshPrivateKeyPath
)

$installScript = @'
set -euo pipefail
provider_file="$1"
target_file="$2"
selected_model="$3"
temporary_file="$(mktemp "${target_file}.tmp.XXXXXX")"
cleanup() {
  rm -f "$provider_file" "$temporary_file"
}
trap cleanup EXIT
chown --reference="$target_file" "$temporary_file"
chmod --reference="$target_file" "$temporary_file"
awk -F= -v selected_model="$selected_model" '
BEGIN {
  allowed["OPENAI_API_KEY"] = 1
  allowed["OPENAI_BASE_URL"] = 1
  replacement["OPENAI_MODEL_RESEARCH"] = selected_model
  replacement["OPENAI_MODEL_EXTRACTION"] = selected_model
  replacement["OPENAI_MODEL_WRITING"] = selected_model
  replacement["MOCK_CONNECTORS"] = "false"
  replacement["MOCK_MODEL_PROVIDER"] = "false"
}
NR == FNR {
  if ($1 in allowed) replacement[$1] = substr($0, index($0, "=") + 1)
  next
}
{
  if ($1 in replacement) {
    print $1 "=" replacement[$1]
    written[$1] = 1
  } else {
    print $0
  }
}
END {
  for (key in replacement) if (!(key in written)) print key "=" replacement[key]
}
' "$provider_file" "$target_file" > "$temporary_file"
mv -f "$temporary_file" "$target_file"
trap - EXIT
rm -f "$provider_file"
'@

try {
    ssh.exe @sshCommon $sshTarget "install -m 600 /dev/null '$remoteSecretPath'"
    if ($LASTEXITCODE -ne 0) { throw "Remote secret staging failed (ssh exit code $LASTEXITCODE)." }

    scp.exe @scpCommon $secretPath "${sshTarget}:$remoteSecretPath"
    if ($LASTEXITCODE -ne 0) { throw "Provider upload failed (scp exit code $LASTEXITCODE)." }

    $installScript | ssh.exe @sshCommon $sshTarget "sudo bash -s -- '$remoteSecretPath' '$remoteEnvironmentPath' '$Model'"
    if ($LASTEXITCODE -ne 0) { throw "Remote provider installation failed (ssh exit code $LASTEXITCODE)." }

    Write-Output "Provider configuration installed for managed instance $($state.instanceId)."
}
finally {
    ssh.exe @sshCommon $sshTarget "rm -f '$remoteSecretPath'" 2>$null | Out-Null
}
