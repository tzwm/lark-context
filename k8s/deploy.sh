#!/bin/bash

set -e

cd "$(dirname "$0")"

NAMESPACE=${NAMESPACE:-default}
IMAGE_TAG=${IMAGE_TAG:-latest}
IMAGE_NAME=${IMAGE_NAME:-lark-context}

echo "Deploying lark-context to namespace: $NAMESPACE"
echo "Image: $IMAGE_NAME:$IMAGE_TAG"

kubectl apply -f k8s-secret.yaml -n $NAMESPACE

sed "s|image: lark-context:latest|image: $IMAGE_NAME:$IMAGE_TAG|g" k8s-deployment.yaml | kubectl apply -f - -n $NAMESPACE

echo "Deployment completed successfully!"
echo ""
echo "Services:"
kubectl get svc -n $NAMESPACE -l app=lark-context
echo ""
echo "Pods:"
kubectl get pods -n $NAMESPACE -l app=lark-context
