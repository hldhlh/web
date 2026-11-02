import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file=readFileSync('apps/academy/pages/store-model/assets/shop.glb');
const size=file.readUInt32LE(12), doc=JSON.parse(file.subarray(20,20+size));
const binary=file.subarray(28+size);
function values(index){
 const a=doc.accessors[index],v=doc.bufferViews[a.bufferView];
 assert.equal(a.componentType,5126,'floor coordinates must retain Float32 precision');
 assert.equal(v.extensions?.EXT_meshopt_compression,undefined,'do not quantize thin floor layers');
 const offset=(v.byteOffset||0)+(a.byteOffset||0);
 return Array.from({length:a.count*3},(_,i)=>binary.readFloatLE(offset+i*4));
}
test('original floor top surfaces remain planar and above grout after packaging',()=>{
 const nodes=doc.nodes.filter(n=>n.name?.endsWith('_FullPrecision'));
 assert.equal(nodes.length,2);
 const red=[],gray=[];
 let triangles=0;
 for(const n of nodes){
  for(const p of doc.meshes[n.mesh].primitives){
   const positions=values(p.attributes.POSITION),normals=values(p.attributes.NORMAL);
   triangles+=positions.length/9;
   if(n.name.includes('抬高基层'))continue;
   const target=doc.materials[p.material].name.includes('红棕')?red:gray;
   for(let i=0;i<positions.length;i+=9){
    if(normals[i+1]<.99)continue;
    assert.ok(Math.abs(positions[i+1]-positions[i+4])<1e-7);
    assert.ok(Math.abs(positions[i+1]-positions[i+7])<1e-7);
    target.push(positions[i+1]);
   }
  }
 }
 assert.equal(triangles,20532,'the original floor must not be decimated');
 assert.ok(red.length>0&&gray.length>0);
 assert.ok(Math.min(...red)-Math.max(...gray)>.0006,'grout must not intersect the tile tops');
});
