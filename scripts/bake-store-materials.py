"""Bake supported Blender image/color graphs before glTF deduplication.
Uses source shader recipes, with linear-space math and sRGB only at image I/O.
Unsupported procedural/attribute graphs are reported explicitly, never guessed.
Input/output are raw (pre-optimizer) GLBs; geometry/binary prefix are preserved.
"""
import io, json, struct, sys, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
AUDIT=ROOT/'output/store-model/material-audit'
recipes=json.loads((ROOT/'scripts/store-materials/source-materials.json').read_text())
source=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'output/store-model/source.glb'
target=Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/'output/store-model/materials-baked.glb'
data=source.read_bytes();length=struct.unpack_from('<I',data,12)[0]
doc=json.loads(data[20:20+length]);binary=bytearray(data[28+length:])
SIZE=1024
cache={}
def linear(v):return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
def srgb(v):return np.where(v<=.0031308,v*12.92,1.055*np.maximum(v,0)**(1/2.4)-.055)
def scalar(v):
    a=np.asarray(v)
    if a.ndim and a.shape[-1] in (3,4):return a[...,:3].mean(axis=-1,keepdims=True)
    return a

def evaluate(e):
    if 'value' in e:
        a=np.asarray(e['value'],dtype=np.float32)
        return a[:3] if a.ndim and a.shape[-1]==4 else a
    typ=e['type']
    if typ=='TEX_IMAGE':
        key=(e['image'],e['colorSpace'])
        if key not in cache:
            im=Image.open(AUDIT/recipes['images'][e['image']]).convert('RGB').resize((SIZE,SIZE),Image.Resampling.LANCZOS)
            a=np.asarray(im,dtype=np.float32)/255
            cache[key]=linear(a) if e['colorSpace']=='sRGB' else a
        return cache[key]
    if typ not in {'MIX_RGB','RGBTOBW','MAP_RANGE','VALTORGB'}:raise NotImplementedError(typ)
    inputs={i['name']:i['expression'] for i in e['inputs']}
    get=lambda name:evaluate(inputs[name])
    if typ=='RGBTOBW':
        a=get('Color');return (a[...,0]*.2126+a[...,1]*.7152+a[...,2]*.0722)[...,None]
    if typ=='MAP_RANGE':
        if e['interpolation_type']!='LINEAR':raise NotImplementedError('Map Range '+e['interpolation_type'])
        v=scalar(get('Value'));lo=get('From Min');hi=get('From Max')
        t=(v-lo)/(hi-lo)
        if e['clamp']:t=np.clip(t,0,1)
        return get('To Min')+(get('To Max')-get('To Min'))*t
    if typ=='MIX_RGB':
        f=scalar(get('Factor'));a=get('Color1');b=get('Color2')
        blend=e['blend_type']
        mixed=a*b if blend=='MULTIPLY' else b if blend=='MIX' else None
        if mixed is None:raise NotImplementedError('Mix '+blend)
        result=a*(1-f)+mixed*f
        return np.clip(result,0,1) if e['use_clamp'] else result
    if typ=='VALTORGB':
        ramp=e['ramp']
        if ramp['mode']!='RGB' or ramp['interpolation']!='LINEAR':raise NotImplementedError('Color Ramp')
        factor=scalar(get('Factor'))
        if np.ndim(factor)>0 and factor.shape[-1]==1:factor=factor[...,0]
        stops=ramp['elements'];pos=[p for p,c in stops]
        return np.stack([np.interp(factor,pos,[c[k] for p,c in stops]) for k in range(3)],axis=-1)

def image_texture(values,name,color=True):
    a=np.broadcast_to(values,(SIZE,SIZE,3))
    if not np.isfinite(a).all():raise ValueError('Nonfinite shader bake: '+name)
    pixels=np.rint(np.clip(srgb(a) if color else a,0,1)*255).astype(np.uint8)
    output=io.BytesIO();Image.fromarray(pixels).save(output,format='PNG',optimize=True)
    blob=output.getvalue();digest=hashlib.sha256(blob).hexdigest()
    if digest in texture_cache:return texture_cache[digest]
    binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(blob)
    doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(blob)})
    doc['images'].append({'name':name,'mimeType':'image/png','bufferView':len(doc['bufferViews'])-1})
    doc['textures'].append({'source':len(doc['images'])-1,'sampler':0})
    index=len(doc['textures'])-1;texture_cache[digest]=index
    return index

def constant(ch,name):
    return ch.get(name,{}).get('value')
def assign_texture(pbr,key,index):
    info=pbr.get(key,{}).copy();info['index']=index;pbr[key]=info
texture_cache={};by_name={r['name']:r['channels'] for r in recipes['materials']};report=[]
for m in doc['materials']:
    name=m.get('name');ch=by_name.get(name)
    if ch is None:report.append({'name':name,'status':'no-source-principled'});continue
    pbr=m.setdefault('pbrMetallicRoughness',{});row={'name':name,'baked':[],'unbaked':[]}
    base=ch['Base Color']
    if base.get('type') and base['type']!='TEX_IMAGE':
        try:
            colors=evaluate(base)
            if 'baseColorTexture' not in pbr:raise NotImplementedError('no exported UV texture binding')
            assign_texture(pbr,'baseColorTexture',image_texture(colors,name+'__BaseColor'))
            pbr['baseColorFactor']=[1,1,1,1];row['baked'].append('Base Color')
            m.setdefault('extras',{})['sourceColorBake']=1
            if name=='墨绿坐垫.002':m['extras']['chairTintBake']=1
        except NotImplementedError as e:row['unbaked'].append('Base Color: '+str(e))
    rough=ch['Roughness']
    if rough.get('type') and rough['type']!='TEX_IMAGE':
        try:
            r=scalar(evaluate(rough));metal=scalar(evaluate(ch['Metallic']))
            mr=np.ones((SIZE,SIZE,3),dtype=np.float32);mr[...,1:2]=r;mr[...,2:3]=metal
            if 'metallicRoughnessTexture' not in pbr:raise NotImplementedError('no exported UV texture binding')
            assign_texture(pbr,'metallicRoughnessTexture',image_texture(mr,name+'__MetalRough',False))
            pbr['roughnessFactor']=1;pbr['metallicFactor']=1;row['baked'].append('Roughness')
        except NotImplementedError as e:row['unbaked'].append('Roughness: '+str(e))
    ext=m.setdefault('extensions',{})
    weight=constant(ch,'Sheen Weight')
    if 'KHR_materials_sheen' in ext and weight is not None:
        tint=constant(ch,'Sheen Tint');ext['KHR_materials_sheen']['sheenColorFactor']=[v*weight for v in tint[:3]]
        ext['KHR_materials_sheen']['sheenRoughnessFactor']=constant(ch,'Sheen Roughness')
    if 'KHR_materials_clearcoat' in ext:
        coat=ext['KHR_materials_clearcoat'];coat['clearcoatFactor']=constant(ch,'Coat Weight');coat['clearcoatRoughnessFactor']=constant(ch,'Coat Roughness')
    if not ext:m.pop('extensions',None)
    row['status']='review' if row['unbaked'] else 'corrected' if row['baked'] else 'direct-source'
    report.append(row)
doc['buffers'][0]['byteLength']=len(binary)
js=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*(-len(js)%4);binary.extend(b'\0'*(-len(binary)%4))
target.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)
(ROOT/'output/store-model/material-audit/report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('Corrected:',sum(bool(r.get('baked')) for r in report),'Needs procedural baking:',sum(r['status']=='review' for r in report))
for r in report:
    if r.get('baked') or r.get('unbaked'):print(r['name'],r.get('baked'),r.get('unbaked'))
