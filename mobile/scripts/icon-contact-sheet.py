#!/usr/bin/env python3
"""Real-pixel icon inventory; run after Expo prebuild and sync-icons.sh.
Requires ImageMagick. Output: docs/icons/OWNVOICE-icons-contact-sheet.png.
"""
from pathlib import Path
import subprocess
import tempfile
import argparse
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scratch', type=Path, required=True)
args = parser.parse_args()
font = subprocess.check_output(['fc-match', '-f', '%{file}', 'sans-serif'], text=True)
densities = [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]

def magick(*args):
    subprocess.run(['magick', *map(str, args)], check=True)

with tempfile.TemporaryDirectory(dir=args.scratch) as scratch:
    scratch = Path(scratch)
    tiles = []
    def tile(path, label):
        output = scratch / f'tile-{len(tiles):03}.png'
        magick(path, '-background', '#E4E5E7', '-gravity', 'center', '-extent', '560x520',
               '-background', 'white', '-gravity', 'south', '-splice', '0x50',
               '-font', font, '-pointsize', '13', '-fill', '#222222',
               '-annotate', '+0+10', label, output)
        tiles.append(output)

    for app, folder, extension in [('Expo dev.ownvoice.next', root / 'mobile/android/app/src/main/res', 'webp'),
                                   ('Kotlin dev.ownvoice.app', root / 'app/src/main/res', 'png')]:
        for kind in ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_monochrome']:
            for density, size in densities:
                path = folder / f'mipmap-{density}/{kind}.{extension}'
                tile(path, f'{app}\nmipmap-{density}/{kind}.{extension} (native pixels)')
        for shape in ['circle', 'squircle', 'themed']:
            for density, size in densities:
                fg = folder / f'mipmap-{density}/ic_launcher_{"monochrome" if shape == "themed" else "foreground"}.{extension}'
                viewport = int(size * 1.5)
                offset = int(size * .375)
                cropped = scratch / 'cropped.png'
                magick(fg, '-crop', f'{viewport}x{viewport}+{offset}+{offset}', '+repage', '-resize', f'{size}x{size}', cropped)
                if shape == 'themed':
                    magick(cropped, '-channel', 'RGB', '-fill', '#523A37', '-colorize', '100', '+channel', cropped)
                composed = scratch / 'composed.png'
                magick('-size', f'{size}x{size}', 'xc:#FFF0EA', cropped, '-composite', composed)
                mask = scratch / 'mask.png'
                radius = size/2 if shape != 'squircle' else size*.22
                magick('-size', f'{size}x{size}', 'xc:none', '-fill', 'white', '-draw',
                       f'roundrectangle 0,0 {size-1},{size-1} {radius},{radius}', mask)
                magick(composed, mask, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', composed)
                tile(composed, f'{app}\nAdaptive {shape} / {density} ({size} px)')

    ns = '{http://schemas.android.com/apk/res/android}'
    vector = ET.parse(root / 'app/src/main/res/drawable/ic_stat_ownvoice.xml').getroot()
    path = vector.find('.//path').get(ns+'pathData')
    svg = scratch / 'notification.svg'
    for density, size in densities:
        svg.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{size//2}" height="{size//2}" viewBox="0 0 24 24"><g transform="translate(.3,-.675) scale(.195)"><path fill="white" fill-rule="evenodd" d="{path}"/></g></svg>')
        notification = scratch / 'notification.png'
        magick('-background', 'none', svg, notification)
        tile(notification, f'Both apps: white notification asset / {density}\n{size//2} px; no notification producer in this checkout')
    tile(root / 'mobile/assets/icon/store/play-store.png', 'Both apps: Play listing / 512x512 opaque square')
    output = root / 'docs/icons/OWNVOICE-icons-contact-sheet.png'
    magick('montage', *tiles, '-tile', '5x', '-geometry', '+0+0', '-background', 'white', output)
    print(output)
