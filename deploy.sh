#!/bin/bash

echo "Deploying the service..."

cd service && npm run deploy && cd ..

echo "Deploying the AWS CDK..."

cd infrastructure && npm run bootstrap && cd ..

echo "Deploying the infrastructure..."

cd infrastructure && npm run deploy && cd ..

echo "Deploying the runtime..."

cd infrastructure && npm run runtime && cd ..
