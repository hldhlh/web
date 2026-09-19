"""Generate the locally served annotation face from upstream Noto Sans SC."""
import argparse
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
args = parser.parse_args()
font = instantiateVariableFont(TTFont(args.source), {'wght': 500}, inplace=True)
characters = set(range(0x20, 0x250)) | set(range(0x2000, 0x2070)) | set(range(0x3000, 0x3040)) | set(range(0xff00, 0xffef))
for first in range(0xa1, 0xf8):
    for second in range(0xa1, 0xff):
        try:
            characters.update(map(ord, bytes([first, second]).decode('gb2312')))
        except UnicodeDecodeError:
            pass
options = subset.Options()
options.layout_features = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=characters)
subsetter.subset(font)
font.flavor = 'woff2'
target = Path(__file__).resolve().parents[1] / 'apps/academy/pages/dimensions/fonts/annotation-sans-medium.woff2'
font.save(target)
print(f'{target}: {target.stat().st_size:,} bytes')
