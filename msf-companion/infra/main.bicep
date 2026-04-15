targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment (e.g., dev, prod)')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

@description('Name of the web container app')
param webServiceName string = ''

@secure()
@description('PostgreSQL administrator password')
param databasePassword string

@secure()
@description('MSF API key')
param msfApiKey string

@secure()
@description('Scopely OAuth Client ID')
param scopelyClientId string

@secure()
@description('Scopely OAuth Client Secret')
param scopelyClientSecret string

@secure()
@description('Session encryption secret')
param sessionSecret string

@secure()
@description('Stripe secret key')
param stripeSecretKey string

@secure()
@description('Stripe webhook secret')
param stripeWebhookSecret string

@description('Stripe publishable key (safe for client)')
param stripePublishableKey string

@description('Stripe price ID')
param stripePriceId string

@description('Scopely OAuth redirect URI for production')
param scopelyRedirectUri string

@description('Container image for the web service')
param webImageName string = ''

@secure()
@description('YouTube API key for video discovery')
param youtubeApiKey string = ''

@secure()
@description('Azure AI Search endpoint')
param searchEndpoint string = ''

@secure()
@description('Azure AI Search admin key')
param searchKey string = ''

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

// Monitoring (Log Analytics + Application Insights)
module monitoring './shared/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    location: location
    tags: tags
    logAnalyticsName: '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
    applicationInsightsName: '${abbrs.insightsComponents}${resourceToken}'
  }
}

// Container Registry
module registry './shared/registry.bicep' = {
  name: 'registry'
  scope: rg
  params: {
    location: location
    tags: tags
    name: '${abbrs.containerRegistryRegistries}${resourceToken}'
  }
}

// Key Vault
module keyVault './shared/keyvault.bicep' = {
  name: 'keyVault'
  scope: rg
  params: {
    location: location
    tags: tags
    name: '${abbrs.keyVaultVaults}${resourceToken}'
  }
}

// PostgreSQL Flexible Server
module database './db/postgresql.bicep' = {
  name: 'database'
  scope: rg
  params: {
    location: location
    tags: tags
    name: '${abbrs.dBforPostgreSQLServers}${resourceToken}'
    databaseName: 'msfcompanion'
    administratorLogin: 'msfadmin'
    administratorPassword: databasePassword
    keyVaultName: keyVault.outputs.name
  }
}

// Container Apps Environment + App
module web './app/web.bicep' = {
  name: 'web'
  scope: rg
  params: {
    location: location
    tags: tags
    name: !empty(webServiceName) ? webServiceName : '${abbrs.appContainerApps}web-${resourceToken}'
    containerAppsEnvironmentName: '${abbrs.appManagedEnvironments}${resourceToken}'
    containerRegistryName: registry.outputs.name
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    applicationInsightsConnectionString: monitoring.outputs.applicationInsightsConnectionString
    databaseUrl: database.outputs.connectionString
    msfApiKey: msfApiKey
    scopelyClientId: scopelyClientId
    scopelyClientSecret: scopelyClientSecret
    sessionSecret: sessionSecret
    stripeSecretKey: stripeSecretKey
    stripeWebhookSecret: stripeWebhookSecret
    stripePublishableKey: stripePublishableKey
    stripePriceId: stripePriceId
    webImageName: webImageName
    scopelyRedirectUri: scopelyRedirectUri
    openAiEndpoint: openAi.outputs.endpoint
    openAiKey: openAi.outputs.key
    searchEndpoint: searchEndpoint
    searchKey: searchKey
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = registry.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = registry.outputs.name
output AZURE_KEY_VAULT_NAME string = keyVault.outputs.name
output AZURE_RESOURCE_GROUP string = rg.name
output SERVICE_WEB_NAME string = web.outputs.name
output SERVICE_WEB_URI string = web.outputs.uri

// Cosmos DB (NoSQL API — serverless)
module cosmosDb './cosmos/cosmosdb.bicep' = {
  name: 'cosmosDb'
  scope: rg
  params: {
    location: location
    tags: tags
    accountName: '${abbrs.documentDBDatabaseAccounts}${resourceToken}'
    databaseName: 'msf-knowledge'
  }
}

// Azure AI Search (Basic tier)
module aiSearch './ai/search.bicep' = {
  name: 'aiSearch'
  scope: rg
  params: {
    location: location
    tags: tags
    name: '${abbrs.searchSearchServices}${resourceToken}'
  }
}

// Azure OpenAI (GPT-4o + GPT-4o-mini)
module openAi './ai/openai.bicep' = {
  name: 'openAi'
  scope: rg
  params: {
    location: location
    tags: tags
    name: '${abbrs.cognitiveServicesAccounts}${resourceToken}'
  }
}

// Azure Functions (Intelligence Pipeline)
module functions './functions/functions.bicep' = {
  name: 'functions'
  scope: rg
  params: {
    location: location
    tags: tags
    name: '${abbrs.webSitesFunctions}${resourceToken}'
    planName: '${abbrs.webServerFarms}func-${resourceToken}'
    storageName: '${abbrs.storageStorageAccounts}func${resourceToken}'
    applicationInsightsConnectionString: monitoring.outputs.applicationInsightsConnectionString
    cosmosConnectionString: cosmosDb.outputs.connectionString
    cosmosDatabaseName: 'msf-knowledge'
    searchEndpoint: aiSearch.outputs.endpoint
    searchKey: aiSearch.outputs.adminKey
    openAiEndpoint: openAi.outputs.endpoint
    openAiKey: openAi.outputs.key
    youtubeApiKey: youtubeApiKey
    databaseUrl: database.outputs.connectionString
  }
}

output COSMOS_DB_ENDPOINT string = cosmosDb.outputs.endpoint
output AZURE_AI_SEARCH_ENDPOINT string = aiSearch.outputs.endpoint
output AZURE_OPENAI_ENDPOINT string = openAi.outputs.endpoint
output SERVICE_FUNCTIONS_NAME string = functions.outputs.name
output SERVICE_FUNCTIONS_URI string = functions.outputs.uri
