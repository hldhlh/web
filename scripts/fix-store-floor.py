"""Replace only the kitchen floor with full-precision, unsimplified source meshes.
Run after export-store-floor.py and after global GLB optimization. Existing binary
buffers (including other geometry and textures) remain byte-for-byte intact.
"""
import json, struct
from pathlib import Path
root = Path(__file__).resolve().parents[1]
path = root / 'apps/academy/pages/store-model/assets/shop.glb'
source = json.loads((root / 'output/store-model/floor-original.json').read_text())
data = path.read_bytes()
length, kind = struct.unpack_from('<II', data, 12)
doc = json.loads(data[20:20+length])
if doc.get('extras', {}).get('preciseKitchenFloor') == 1:
    print('Full-precision kitchen floor already installed.'); raise SystemExit(0)
size, kind = struct.unpack_from('<II', data, 20+length)
binary = bytearray(data[28+length:28+length+size])
materials = {m.get('name'): i for i, m in enumerate(doc['materials'])}
# The optimizer deduplicates the two identical gray/brown materials.
materials['后厨红砖_压槽底'] = materials['后厨红砖_灰褐砖缝']
floor_materials = {i for name, i in materials.items() if name.startswith('后厨红砖_')}
# Meshes may contain other joined primitives; preserve those exactly.
removed = 0
for i, mesh in enumerate(doc['meshes']):
    old = mesh['primitives']
    keep = [p for p in old if p.get('material') not in floor_materials]
    removed += len(old) - len(keep)
    if keep:
        mesh['primitives'] = keep
    elif old:
        # Retain the unused mesh definition so all existing indices stay valid.
        for node in doc['nodes']:
            if node.get('mesh') == i:
                del node['mesh']
def accessor(values, bounds=False):
    binary.extend(b'\0' * (-len(binary) % 4))
    offset = len(binary)
    payload = struct.pack('<' + 'f' * len(values), *values)
    binary.extend(payload)
    doc['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(payload), 'target': 34962})
    item = {'bufferView': len(doc['bufferViews']) - 1, 'componentType': 5126, 'count': len(values) // 3, 'type': 'VEC3'}
    if bounds:
        item['min'] = [min(values[i::3]) for i in range(3)]
        item['max'] = [max(values[i::3]) for i in range(3)]
    doc['accessors'].append(item)
    return len(doc['accessors']) - 1
for obj in source:
    primitives = []
    for group in obj['groups']:
        primitives.append({'attributes': {'POSITION': accessor(group['positions'], True), 'NORMAL': accessor(group['normals'])}, 'material': materials[group['material']], 'mode': 4})
    doc['meshes'].append({'name': obj['name'] + '_FullPrecision', 'primitives': primitives})
    doc['nodes'].append({'name': obj['name'] + '_FullPrecision', 'mesh': len(doc['meshes']) - 1})
    doc['scenes'][doc.get('scene', 0)].setdefault('nodes', []).append(len(doc['nodes']) - 1)
doc.setdefault('extras', {})['preciseKitchenFloor'] = 1
doc['buffers'][0]['byteLength'] = len(binary)
js = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
binary.extend(b'\0' * (-len(binary) % 4))
path.write_bytes(struct.pack('<III', 0x46546c67, 2, 28 + len(js) + len(binary)) + struct.pack('<II', len(js), 0x4e4f534a) + js + struct.pack('<II', len(binary), 0x004e4942) + binary)
print('Replaced floor primitives:', removed, '| preserved full-precision layers in', len(source), 'meshes')
