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
test('soup pots, rolled rims and all hot-pot bodies retain curved geometry',()=>{
  const expected = [
    ['R2_E17_圆柱桶式大汤锅_直壁平底.002',1722],
    ['实拍锅圈｜整体压制翻边_1.001',36000],
    ['R4_第01层_矮身双耳圆锅.002',8064],
    ['火锅0_0_薄壁圆底卷边.001',8064]
  ];
  for(const [name,count] of expected){
    const node=d.nodes.find(n=>n.name===name);assert.ok(node,name);
    const p=d.meshes[node.mesh].primitives[0];
    assert.equal(d.accessors[p.indices??p.attributes.POSITION].count,count,name);
    assert.equal(d.accessors[p.attributes.POSITION].componentType,5126);
    assert.equal(d.accessors[p.attributes.NORMAL].componentType,5126);
  }
  assert.equal(d.nodes.filter(n=>/^火锅\d_\d_空心提手/.test(n.name)).length,16);
  assert.equal(d.nodes.filter(n=>/^R4_第\d+层_矮身双耳圆锅/.test(n.name)).length,9);
});
