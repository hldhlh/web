"""Bake the source Blender chair tint into its glTF base-color texture.
Matches 墨绿坐垫.002: sRGB -> RGB to BW -> clamped Map Range -> Multiply.
Only the chair receives the new image; geometry and other materials are unchanged.
Run after model export/optimization. Safe to rerun on the patched GLB.
"""
import io, json, struct
from pathlib import Path
import numpy as np
from PIL import Image

path = Path(__file__).resolve().parents[1] / 'apps/academy/pages/store-model/assets/shop.glb'
data = path.read_bytes()
length, kind = struct.unpack_from('<II', data, 12)
doc = json.loads(data[20:20+length])
material = next(m for m in doc['materials'] if m.get('name') == '墨绿坐垫.002')
if material.get('extras', {}).get('chairTintBake') == 1:
    print('Chair tint already baked.'); raise SystemExit(0)
bin_length, bin_kind = struct.unpack_from('<II', data, 20+length)
assert bin_kind == 0x004e4942
binary = bytearray(data[28+length:28+length+bin_length])
pbr = material['pbrMetallicRoughness']
texture = doc['textures'][pbr['baseColorTexture']['index']]
image = doc['images'][texture['extensions']['EXT_texture_webp']['source']]
view = doc['bufferViews'][image['bufferView']]
start = view.get('byteOffset', 0)
source = Image.open(io.BytesIO(binary[start:start+view['byteLength']])).convert('RGB')
srgb = np.asarray(source, dtype=np.float32) / 255
linear = np.where(srgb <= .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4)
luminance = linear[..., 0] * .2126 + linear[..., 1] * .7152 + linear[..., 2] * .0722
variation = .88 + .15 * np.clip((luminance - .015) / (.6 - .015), 0, 1)
# Source Blender MixRGB Color1, linear scene color (sRGB approx #173329).
green = np.array([.008568125776946545, .03310476616024971, .022173885256052017])
color = variation[..., None] * green
encoded = np.where(color <= .0031308, color * 12.92, 1.055 * color ** (1 / 2.4) - .055)
baked = Image.fromarray(np.rint(np.clip(encoded, 0, 1) * 255).astype(np.uint8))
output = io.BytesIO(); baked.save(output, format='WEBP', lossless=True)
blob = output.getvalue(); binary.extend(b'\0' * (-len(binary) % 4)); offset = len(binary); binary.extend(blob)
doc['bufferViews'].append({'buffer':0, 'byteOffset':offset, 'byteLength':len(blob)})
doc['images'].append({'name':'chair-deep-green-leather-baked', 'mimeType':'image/webp', 'bufferView':len(doc['bufferViews'])-1})
new_texture = json.loads(json.dumps(texture)); new_texture['extensions']['EXT_texture_webp']['source'] = len(doc['images'])-1
doc['textures'].append(new_texture); pbr['baseColorTexture']['index'] = len(doc['textures'])-1
# Blender Sheen Weight .1 must modulate the glTF sheen color.
material['extensions']['KHR_materials_sheen']['sheenColorFactor'] = [.1, .1, .1]
material['extensions']['KHR_materials_clearcoat']['clearcoatRoughnessFactor'] = .03
material.setdefault('extras', {})['chairTintBake'] = 1
doc['buffers'][0]['byteLength'] = len(binary)
js = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
binary.extend(b'\0' * (-len(binary) % 4))
result = struct.pack('<III', 0x46546c67, 2, 28 + len(js) + len(binary)) + struct.pack('<II', len(js), 0x4e4f534a) + js + struct.pack('<II', len(binary), bin_kind) + binary
path.write_bytes(result)
print('Baked chair tint:', source.size, 'texture bytes:', len(blob), 'sRGB range:', np.asarray(baked).min(axis=(0,1)), np.asarray(baked).max(axis=(0,1)))
