"""Export the two original kitchen-floor meshes without simplification.
Run inside Blender after opening the source blend. Does not save/change the scene.
"""
import bpy, json
from pathlib import Path
names = ['建筑｜后厨全域红色防滑砖_重新铺设', '建筑｜后厨抬高基层_前厅完成面以上170mm']
result = []
for name in names:
    obj = bpy.data.objects[name]
    mesh = obj.data
    mesh.calc_loop_triangles()
    normals = obj.matrix_world.to_3x3().inverted().transposed()
    groups = {}
    for tri in mesh.loop_triangles:
        material = obj.material_slots[tri.material_index].material.name
        group = groups.setdefault(material, {'material': material, 'positions': [], 'normals': []})
        normal = (normals @ tri.normal).normalized()
        for vertex in tri.vertices:
            point = obj.matrix_world @ mesh.vertices[vertex].co
            group['positions'].extend([point.x, point.z, -point.y])
            group['normals'].extend([normal.x, normal.z, -normal.y])
    result.append({'name': name, 'groups': list(groups.values())})
root = Path('/Users/hulidehulihua/Documents/web') if '__file__' not in globals() else Path(__file__).resolve().parents[1]
output = root / 'output/store-model/floor-original.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
print('Floor geometry exported:', sum(len(g['positions']) // 9 for o in result for g in o['groups']), 'triangles')
