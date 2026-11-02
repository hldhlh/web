import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const bytes = readFileSync('apps/academy/pages/store-model/assets/shop.glb');
const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
test('wood tint survives optimization without merging distinct source colors', () => {
  const woods = ['浅木色', '实拍_瓦檐暖棕木架', '实拍_餐架暖竹木'].map(name => doc.materials.find(m => m.name === name));
  for (const material of woods) {
    assert.equal(material?.extras?.sourceColorBake, 1);
    assert.ok(material.pbrMetallicRoughness.baseColorTexture);
  }
  assert.equal(new Set(woods.map(m => m.pbrMetallicRoughness.baseColorTexture.index)).size, 3);
});
test('curtain and countertop procedural colors are packaged as baked textures', () => {
  for (const name of ['帘布｜暗红厚重麻布', '吧台｜近照灰底黑细粒_曲折白矿脉']) {
    const materials = doc.materials.filter(m => m.name?.startsWith(name + '__baked_'));
    assert.ok(materials.length > 0, name);
    for (const material of materials) {
      assert.equal(material.extras.proceduralColorBake, 1);
      assert.ok(material.pbrMetallicRoughness.baseColorTexture);
    }
  }
});
