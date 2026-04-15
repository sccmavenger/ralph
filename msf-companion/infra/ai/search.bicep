@description('Location for AI Search')
param location string

param tags object = {}

@description('AI Search service name')
param name string

resource search 'Microsoft.Search/searchServices@2024-03-01-preview' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'basic'
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
  }
}

output name string = search.name
output endpoint string = 'https://${search.name}.search.windows.net'
#disable-next-line outputs-should-not-contain-secrets
output adminKey string = search.listAdminKeys().primaryKey
