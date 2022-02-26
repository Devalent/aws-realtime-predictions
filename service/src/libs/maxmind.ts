import { Reader, ReaderModel } from '@maxmind/geoip2-node';
import axios from 'axios';
import * as temp from 'temp';
import * as tarStream from 'tar-stream';
import * as zlib from 'zlib';

import config from '@config';
import { Readable } from 'stream';

let task:Promise<any>;
let dbAsn:ReaderModel;
let dbCity:ReaderModel;

const processFile = async (url:string) => {
  const dbSource = await axios(url, { responseType: 'stream' });

  const db = temp.createWriteStream({ suffix: '.mmdb' });
  const extract = tarStream.extract();

  extract.on('entry', (header, stream, next) => {
    if (header.name.endsWith('.mmdb')) {
      stream.on('data', (chunk) => {
        db.write(chunk);
      });
    }

    stream.on('end', () => next());  
    stream.resume();
  });

  (dbSource.data as Readable)
    .pipe(zlib.createGunzip())
    .pipe(extract);

  try {
    await new Promise((resolve, reject) => {
      extract.on('finish', () => {
        db.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve(undefined);
          }
        });
      });
    });
  } finally {

  }

  return await Reader.open(db.path as string, {});
};

const handler = async () => {
  const [db1, db2] = await Promise.all([
    processFile(`https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=${config.maxmind_license_key}&suffix=tar.gz`),
    processFile(`https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${config.maxmind_license_key}&suffix=tar.gz`),
  ]);

  dbAsn = db1;
  dbCity = db2;
};

export const getGeo2Ip = async () => {
  if (!config.maxmind_license_key) {
    return null;
  }

  if (!task) {
    console.log('Downloading databases...');
    task = handler();
  }

  try {
    await task;
  } catch (error) {
    task = undefined;

    console.error('Database download error', error);

    throw error;
  }

  return { asn: dbAsn, city: dbCity };
};
