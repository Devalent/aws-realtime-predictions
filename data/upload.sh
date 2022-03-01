#!/bin/bash

SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

echo "Uploading data..."

aws s3 sync $SCRIPTPATH s3://realtime-predictions-raw/ --exclude "*" --include "*.json"
