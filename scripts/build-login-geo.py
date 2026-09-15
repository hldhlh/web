"""Build same-origin, on-demand IP region shards from pinned ip2region XDB files.
Usage: python3 scripts/build-login-geo.py /path/to/downloaded/ip2region-data
No login data is read. Source license and provenance ship with the derived data.
"""
import gzip, hashlib, json, struct, sys
from pathlib import Path
from datetime import datetime, timezone

REVISION = 'c1a1fc7d5941760db3f8431dc05c48cf7f0e30a1'
SOURCE_HASHES = {4: '8e31bbdccb5bf21028af10592d4312ec975da0bffa108c0c5d862a12190f9ad3', 6: '939f6b46bd2b8bec3cf7c5ceb8ba782266ae9b1f35b5ba7916700dec0b7506ed'}
ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'apps/academy/data/login-geo/20260901'

def build(source):
    for version, expected in SOURCE_HASHES.items():
        if hashlib.sha256((source / f'ip2region_v{version}.xdb').read_bytes()).hexdigest() != expected:
            raise ValueError('Source differs from the pinned dataset')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for old in OUTPUT.glob('v*-*.json.gz'):
        old.unlink()
    manifest = {'format': 1, 'source': 'ip2region', 'revision': REVISION, 'generatedFrom': {}, 'shards': {}}
    for version, width, prefix_bits in [(4, 4, 8), (6, 16, 12)]:
        blob = (source / f'ip2region_v{version}.xdb').read_bytes()
        if hashlib.sha256(blob).hexdigest() != SOURCE_HASHES[version]:
            raise ValueError('Source differs from the pinned dataset; update version and provenance explicitly')
        start, end = struct.unpack_from('<II', blob, 8)
        step = width * 2 + 6
        if start > end or (end - start) % step or end + step > len(blob):
            raise ValueError('Invalid XDB index')
        manifest['generatedFrom'][str(version)] = {
            'sha256': hashlib.sha256(blob).hexdigest(),
            'builtAt': datetime.fromtimestamp(struct.unpack_from('<I', blob, 4)[0], timezone.utc).isoformat()}
        shards = {}
        shift = width * 8 - prefix_bits
        previous_end = -1
        for offset in range(start, end + 1, step):
            byteorder = 'little' if version == 4 else 'big'
            lo = int.from_bytes(blob[offset:offset + width], byteorder)
            hi = int.from_bytes(blob[offset + width:offset + 2 * width], byteorder)
            if lo > hi or lo <= previous_end:
                raise ValueError('Unordered or overlapping XDB range')
            previous_end = hi
            length, ptr = struct.unpack_from('<HI', blob, offset + 2 * width)
            fields = blob[ptr:ptr + length].decode('utf8').split('|')
            if len(fields) != 5 or len(fields[4]) != 2 or not fields[4].isalpha():
                continue  # No geographic claim for unassigned/private addresses.
            region = tuple('' if part == '0' else part for part in fields)
            for prefix in range(lo >> shift, (hi >> shift) + 1):
                a, b = max(lo, prefix << shift), min(hi, ((prefix + 1) << shift) - 1)
                key = f'v4-{prefix:03d}' if version == 4 else f'v6-{prefix:03x}'
                shard = shards.setdefault(key, {'regions': [], 'rows': [], 'ids': {}})
                if region not in shard['ids']:
                    shard['ids'][region] = len(shard['regions'])
                    shard['regions'].append(region)
                region_id = shard['ids'][region]
                rows = shard['rows']
                if rows and rows[-1][1] + 1 == a and rows[-1][2] == region_id:
                    rows[-1][1] = b
                else:
                    rows.append([a, b, region_id])
        for key, shard in sorted(shards.items()):
            manifest['shards'][key] = []
            # Bound mobile downloads and decoding work even for dense IPv6 prefixes.
            for index in range(0, len(shard['rows']), 8192):
                rows, regions, ids = [], [], {}
                for a, b, old_id in shard['rows'][index:index + 8192]:
                    if old_id not in ids:
                        ids[old_id] = len(regions)
                        regions.append(shard['regions'][old_id])
                    rows.append([a, b, ids[old_id]] if version == 4 else [f'{a:032x}', f'{b:032x}', ids[old_id]])
                data = gzip.compress(json.dumps({'regions': regions, 'rows': rows}, ensure_ascii=False, separators=(',', ':')).encode(), compresslevel=9, mtime=0)
                name = key + f'-{index // 8192}.json.gz'
                (OUTPUT / name).write_bytes(data)
                manifest['shards'][key].append({'start': rows[0][0], 'end': rows[-1][1], 'file': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    (OUTPUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (OUTPUT / 'LICENSE.md').write_bytes((source / 'LICENSE.md').read_bytes())
    total = sum(v['bytes'] for entries in manifest['shards'].values() for v in entries)
    print(json.dumps({'shards': len(manifest['shards']), 'bytes': total, 'largest': max(v['bytes'] for entries in manifest['shards'].values() for v in entries)}))

if __name__ == '__main__':
    build(Path(sys.argv[1]))
