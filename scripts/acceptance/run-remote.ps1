param([Parameter(Mandatory=$true)][int]$Run, [switch]$A10Only)
$ErrorActionPreference='Stop'
$root=Resolve-Path (Join-Path $PSScriptRoot '../..')
Push-Location $root
try {
  $archive=Join-Path $root '.grok/verify-artifacts/20260908-module-correction/remote-input/followup.tar'
  tar -czf $archive scripts/acceptance patches/postgres-3.4.9-closed-transaction.patch packages/workflows/src packages/contracts/src/workflows.ts apps/worker/src/main.ts apps/worker/src/activities.ts apps/worker/src/run-store.ts apps/api/src/market/market.service.ts packages/agents/src
  $server=Get-Content (Join-Path $env:LOCALAPPDATA 'MarketEntryAgent/Vultr/state.json') -Raw|ConvertFrom-Json
  $known=Join-Path $env:LOCALAPPDATA 'MarketEntryAgent/Vultr/known_hosts'
  $common=@('-F','NUL','-o','BatchMode=yes','-o','ConnectTimeout=8','-o','StrictHostKeyChecking=yes','-o',"UserKnownHostsFile=$known",'-i',"$env:USERPROFILE/.ssh/astsoso_vultr")
  scp.exe @common $archive "deployer@$($server.mainIp):/tmp/imea-a10-followup.tar"
  if ($LASTEXITCODE) { throw 'Acceptance upload failed' }
  $code=@'
import tarfile,subprocess,os
base='/opt/market-entry-agent';stage=base+'/.grok/verify-artifacts/a10-remote-20260908'
with tarfile.open('/tmp/imea-a10-followup.tar') as archive:
 for member in archive.getmembers():assert os.path.realpath(stage+'/'+member.name).startswith(stage+'/')
 archive.extractall(stage,filter='data')
run=RUN_NUMBER
subprocess.run(['docker','run','-d','--name',f'imea-a10-runner-20260908-{run}','--label','imea.scope=module-correction-isolated','--network','host','--memory','1024m','-v',base+':'+base+':ro','-v',stage+':'+stage,'-w',stage,'-e','IMEA_ISOLATED_REMOTE=1','-e','IMEA_TEST_POSTGRES_PATCH=1','node:22','sh','-c',f'node scripts/acceptance/prepare-postgres-patch.mjs && node node_modules/vitest/vitest.mjs run -c scripts/acceptance/vitest.config.ts TEST_FILTER --reporter=verbose > database-remote-{run}.txt 2>&1'],check=True,stdout=subprocess.DEVNULL)
print('Remote isolated acceptance started',run)
'@
  $filter=if ($A10Only) { '-t "A10|cancellation"' } else { '' }
  $code.Replace('RUN_NUMBER', [string]$Run).Replace('TEST_FILTER', $filter) | ssh.exe @common "deployer@$($server.mainIp)" 'python3 -'
  if ($LASTEXITCODE) { throw 'Remote acceptance failed to start' }
} finally { Pop-Location }
