@description('Location for the Function App resources')
param location string

param tags object = {}

@description('Name for the Function App')
param name string

@description('Name for the App Service Plan')
param planName string

@description('Name for the Storage Account')
param storageName string

@description('Application Insights connection string')
param applicationInsightsConnectionString string

@description('Cosmos DB connection string')
@secure()
param cosmosConnectionString string

@description('Cosmos DB database name')
param cosmosDatabaseName string

@description('Azure AI Search endpoint')
param searchEndpoint string

@description('Azure AI Search key')
@secure()
param searchKey string

@description('Azure OpenAI endpoint')
param openAiEndpoint string

@description('Azure OpenAI key')
@secure()
param openAiKey string

@description('YouTube API key')
@secure()
param youtubeApiKey string

@description('PostgreSQL database connection string')
@secure()
param databaseUrl string

// Storage Account for Functions runtime
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// Consumption App Service Plan
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'functionapp'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
}

// Function App
resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: name
  location: location
  tags: union(tags, { 'azd-service-name': 'functions' })
  kind: 'functionapp'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      nodeVersion: '~22'
      appSettings: [
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}' }
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}' }
        { name: 'WEBSITE_CONTENTSHARE', value: toLower(name) }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~22' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: applicationInsightsConnectionString }
        { name: 'COSMOS_CONNECTION_STRING', value: cosmosConnectionString }
        { name: 'COSMOS_DATABASE_NAME', value: cosmosDatabaseName }
        { name: 'AZURE_AI_SEARCH_ENDPOINT', value: searchEndpoint }
        { name: 'AZURE_AI_SEARCH_KEY', value: searchKey }
        { name: 'AZURE_OPENAI_ENDPOINT', value: openAiEndpoint }
        { name: 'AZURE_OPENAI_KEY', value: openAiKey }
        { name: 'AZURE_OPENAI_GPT4O_DEPLOYMENT', value: 'gpt-4o' }
        { name: 'AZURE_OPENAI_GPT4O_MINI_DEPLOYMENT', value: 'gpt-4o-mini' }
        { name: 'YOUTUBE_API_KEY', value: youtubeApiKey }
        { name: 'DATABASE_URL', value: databaseUrl }
      ]
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
    }
  }
}

output name string = functionApp.name
output uri string = 'https://${functionApp.properties.defaultHostName}'
