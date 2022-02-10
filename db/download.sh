#!/bin/bash

if [ -z "$MAXMIND_LICENSE_KEY" ]; then
  echo "MAXMIND_LICENSE_KEY not provided."
  exit 1
fi

rm -f *.mmdb

curl -L "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=$MAXMIND_LICENSE_KEY&suffix=tar.gz" | bsdtar -xvf - -s'|[^/]*/||'
curl -L "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=$MAXMIND_LICENSE_KEY&suffix=tar.gz" | bsdtar -xvf - -s'|[^/]*/||'

rm -f *.txt
