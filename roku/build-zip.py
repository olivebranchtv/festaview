"""Builds festaview-roku-sideload.zip for the Roku developer installer.

Run from the project folder:   python roku/build-zip.py

The Roku installer needs a real zip with the manifest at the top level, forward slashes in the names and no folder entries.
(Git Bash's tar cannot make zip files and silently writes a tar file instead, which the Roku rejects as corrupt. Use this script.)
"""
import os
import sys
import zipfile

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(os.path.dirname(here), 'festaview-roku-sideload.zip')

files = ['manifest']
for folder in ('components', 'source', 'images'):
    base = os.path.join(here, folder)
    if not os.path.isdir(base):
        continue
    for root, _dirs, names in os.walk(base):
        for name in sorted(names):
            rel = os.path.relpath(os.path.join(root, name), here).replace(os.sep, '/')
            files.append(rel)

if os.path.exists(out):
    os.remove(out)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for rel in files:
        z.write(os.path.join(here, rel), rel)

with zipfile.ZipFile(out) as z:
    bad = z.testzip()
    names = z.namelist()
if bad or names[0] != 'manifest':
    print('Zip check failed:', bad, names[:3])
    sys.exit(1)
print('Built', out, '-', len(names), 'files, manifest at the top level, zip check passed')
