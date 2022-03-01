#!/bin/bash

SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

echo "Uploading scripts..."

aws s3 sync $SCRIPTPATH s3://realtime-predictions-code/ --exclude "*" --include "*.py" --include "*.flow"
