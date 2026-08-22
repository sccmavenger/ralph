$ErrorActionPreference = "Stop"

if ($env:AZURE_ENV_NAME -ne "msf-companion-prod") {
    exit 0
}

$expectedApproval = "reviewed-production-what-if"

if ($env:ALLOW_FULL_INFRA_PROVISION -ne $expectedApproval) {
    Write-Error @"
Full production infrastructure provisioning is blocked.

The current full-stack preview contains unrelated drift in PostgreSQL, Cosmos DB,
Azure OpenAI, Search, ACR, and Application Insights. Use a targeted Bicep/CLI
deployment for an approved resource instead.

Only after reviewing a clean full what-if in the current session may an operator
set the process-scoped variable below and rerun the command:

  `$env:ALLOW_FULL_INFRA_PROVISION = "$expectedApproval"

Do not persist this value with 'azd env set'.
"@
    exit 42
}

Write-Warning "Production full-infrastructure override accepted for this process."
