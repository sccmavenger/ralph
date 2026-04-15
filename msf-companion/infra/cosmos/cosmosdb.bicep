@description('Location for Cosmos DB')
param location string

param tags object = {}

@description('Cosmos DB account name')
param accountName string

@description('Database name')
param databaseName string

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: accountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

resource videosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'videos'
  properties: {
    resource: {
      id: 'videos'
      partitionKey: {
        paths: ['/channelId']
        kind: 'Hash'
      }
    }
  }
}

resource knowledgeContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'knowledge'
  properties: {
    resource: {
      id: 'knowledge'
      partitionKey: {
        paths: ['/category']
        kind: 'Hash'
      }
    }
  }
}

resource blogPostsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: 'blogPosts'
  properties: {
    resource: {
      id: 'blogPosts'
      partitionKey: {
        paths: ['/source']
        kind: 'Hash'
      }
    }
  }
}

output accountName string = cosmosAccount.name
output connectionString string = cosmosAccount.listConnectionStrings().connectionStrings[0].connectionString
output endpoint string = cosmosAccount.properties.documentEndpoint
