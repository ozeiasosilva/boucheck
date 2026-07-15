# Deploy BoucheckBackendStack with parameters from params/backend.json
$params = Get-Content -Raw params/backend.json | ConvertFrom-Json



# Deletar o cluster ECS órfão
#aws ecs delete-cluster --cluster boucheck-backend --region us-east-1

# Deletar o log group órfão
#aws logs delete-log-group --log-group-name /ecs/boucheck-backend --region us-east-1

# Listar services no cluster
#aws ecs list-services --cluster boucheck-backend --region us-east-1

# Forçar deleção do service (substituir pelo ARN retornado)
aws ecs delete-service --cluster boucheck-backend --service NOME_DO_SERVICE --force --region us-east-1

# Agora deletar o cluster
##aws ecs delete-cluster --cluster boucheck-backend --region us-east-1



$paramArgs = @()
foreach ($prop in $params.PSObject.Properties) {
    $paramArgs += "--parameters"
    $paramArgs += "BoucheckBackendStack:$($prop.Name)=$($prop.Value)"
}

npx cdk deploy BoucheckBackendStack -c vpcId=vpc-0715b91386ff3b9b1 @paramArgs
