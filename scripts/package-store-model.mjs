import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const base=new URL('../apps/academy/pages/store-model/assets/',import.meta.url);
const data=readFileSync(new URL('shop.glb',base));
const zipped=gzipSync(data,{level:9});
const manifest={version:createHash('sha256').update(data).digest('hex'),bytes:data.length,gzipBytes:zipped.length,url:'./assets/shop.glb',gzipUrl:'./assets/shop.glb.gz'};
writeFileSync(new URL('shop.glb.gz',base),zipped);
writeFileSync(new URL('model.json',base),JSON.stringify(manifest,null,2)+'\n');
