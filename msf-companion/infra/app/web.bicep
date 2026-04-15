param location string
param tags object
param name string
param containerAppsEnvironmentName string
param containerRegistryName string
param logAnalyticsWorkspaceId string
param applicationInsightsConnectionString string

@secure()
param databaseUrl string

@secure()
param msfApiKey string

@secure()
param scopelyClientId string

@secure()
param scopelyClientSecret string

@secure()
param sessionSecret string

@secure()
param stripeSecretKey string

@secure()
param openAiEndpoint string = ''

@secure()
param openAiKey string = ''

@secure()
param searchEndpoint string = ''

@secure()
param searchKey string = ''

@secure()
param stripeWebhookSecret string

@description('Stripe publishable key (safe for client)')
param stripePublishableKey string

@description('Stripe price ID')
param stripePriceId string

@description('Scopely OAuth redirect URI')
param scopelyRedirectUri string

@description('Container image to deploy (set by azd deploy)')
param webImageName string = ''

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: reference(logAnalyticsWorkspaceId, '2023-09-01').customerId
        sharedKey: listKeys(logAnalyticsWorkspaceId, '2023-09-01').primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          username: containerRegistry.listCredentials().username
          passwordSecretRef: 'registry-password'
        }
      ]
      secrets: [
        {
          name: 'registry-password'
          value: containerRegistry.listCredentials().passwords[0].value
        }
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'msf-api-key'
          value: msfApiKey
        }
        {
          name: 'scopely-client-id'
          value: scopelyClientId
        }
        {
          name: 'scopely-client-secret'
          value: scopelyClientSecret
        }
        {
          name: 'session-secret'
          value: sessionSecret
        }
        {
          name: 'stripe-secret-key'
          value: stripeSecretKey
        }
        {
          name: 'stripe-webhook-secret'
          value: stripeWebhookSecret
        }
        {
          name: 'openai-endpoint'
          value: openAiEndpoint
        }
        {
          name: 'openai-key'
          value: openAiKey
        }
        {
          name: 'search-endpoint'
          value: searchEndpoint
        }
        {
          name: 'search-key'
          value: searchKey
        }
      ]
    }
    template: {
      containers: [
        {
          image: !empty(webImageName) ? webImageName : 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          name: 'web'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'MSF_API_KEY'
              secretRef: 'msf-api-key'
            }
            {
              name: 'SCOPELY_CLIENT_ID'
              secretRef: 'scopely-client-id'
            }
            {
              name: 'SCOPELY_CLIENT_SECRET'
              secretRef: 'scopely-client-secret'
            }
            {
              name: 'SESSION_SECRET'
              secretRef: 'session-secret'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: applicationInsightsConnectionString
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'SCOPELY_REDIRECT_URI'
              value: scopelyRedirectUri
            }
            {
              name: 'STRIPE_SECRET_KEY'
              secretRef: 'stripe-secret-key'
            }
            {
              name: 'STRIPE_WEBHOOK_SECRET'
              secretRef: 'stripe-webhook-secret'
            }
            {
              name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'
              value: stripePublishableKey
            }
            {
              name: 'STRIPE_PRICE_ID'
              value: stripePriceId
            }
            {
              name: 'AZURE_OPENAI_ENDPOINT'
              secretRef: 'openai-endpoint'
            }
            {
              name: 'AZURE_OPENAI_KEY'
              secretRef: 'openai-key'
            }
            {
              name: 'AZURE_OPENAI_GPT4O_MINI_DEPLOYMENT'
              value: 'gpt-4o'
            }
            {
              name: 'AZURE_AI_SEARCH_ENDPOINT'
              secretRef: 'search-endpoint'
            }
            {
              name: 'AZURE_AI_SEARCH_KEY'
              secretRef: 'search-key'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output name string = containerApp.name
output uri string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output id string = containerApp.id
