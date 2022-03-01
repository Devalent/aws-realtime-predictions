#!/bin/bash

echo "Installing the service dependencies..."

cd service && npm i && cd ..

echo "Installing the infrastructure dependencies..."

cd infrastructure && npm i && cd ..

