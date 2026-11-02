import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const b=readFileSync('apps/academy/pages/store-model/assets/shop.glb');
const d=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
test('thin E08 cookware retains its original round mesh outside simplification',()=>{
  const node=d.nodes.find(n=>n.name==='E08实拍_370炒锅.001');
  assert.ok(node);
  const primitive=d.meshes[node.mesh].primitives[0];
  assert.equal(d.accessors[primitive.indices].count,3168);
  assert.equal(d.accessors[primitive.attributes.POSITION].componentType,5126);
  assert.equal(d.accessors[primitive.attributes.NORMAL].componentType,5126);
  assert.ok(d.nodes.find(n=>n.name==='E08实拍_水盆直径320高90.001'));
});
