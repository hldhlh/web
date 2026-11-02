import test from 'node:test';
import assert from 'node:assert/strict';
import { repairAnisotropy } from '../apps/academy/pages/store-model/materials.js';
const geometry = (...attributes) => ({ hasAttribute: name => attributes.includes(name) });
function material(anisotropy) {
  return { anisotropy, metalness: 1, roughness: .29, map: {}, roughnessMap: {}, clone() { return { ...this }; } };
}
test('metal without a tangent frame uses finite isotropic lighting without discarding PBR data', () => {
  const original = material(.25);
  const fixed = repairAnisotropy(original, geometry('position', 'normal'));
  assert.notEqual(fixed, original);
  assert.equal(fixed.anisotropy, 0);
  assert.equal(original.anisotropy, .25);
  for (const key of ['metalness', 'roughness', 'map', 'roughnessMap']) assert.equal(fixed[key], original[key]);
});
test('valid directional metal and ordinary textured materials are untouched', () => {
  const steel = material(.25), stone = material(0);
  assert.equal(repairAnisotropy(steel, geometry('uv')), steel);
  assert.equal(repairAnisotropy(steel, geometry('tangent')), steel);
  assert.equal(repairAnisotropy(stone, geometry()), stone);
});
