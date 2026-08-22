targetScope = 'resourceGroup'

@description('Name of the existing production Key Vault')
param keyVaultName string

@secure()
@description('Existing PostgreSQL administrator password; this module never generates or rotates it')
param databasePassword string

@secure()
@description('Existing PostgreSQL connection string; this module never changes the database')
param databaseConnectionString string

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource databasePasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'database-password'
  properties: {
    value: databasePassword
  }
}

resource databaseConnectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'database-connection-string'
  properties: {
    value: databaseConnectionString
  }
}

output secretNames array = [
  databasePasswordSecret.name
  databaseConnectionStringSecret.name
]
