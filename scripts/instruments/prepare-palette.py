#!/usr/bin/env python3
"""Prepare licensed palette sources, never modifying ~/Music/sfz.
Usage: python3 scripts/instruments/prepare-palette.py OUTPUT [--download]
Downloads are pinned and SHA256 checked; needs 7z, ffmpeg (pack build) and local SFZ libraries.
"""
import array, concurrent.futures, hashlib, json, math, random, re, shutil, subprocess, sys, tarfile, urllib.parse, urllib.request, wave
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = Path(sys.argv[1]).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
INV = json.loads((HERE / 'palette-sources.json').read_text())
DEFS = json.loads((HERE / 'palette.json').read_text())
LOCAL = Path.home() / 'Music/sfz'

def fetch(url, dest, sha):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists():
        with urllib.request.urlopen(url, timeout=120) as response:
            dest.write_bytes(response.read())
    if hashlib.sha256(dest.read_bytes()).hexdigest() != sha:
        raise RuntimeError('Source checksum mismatch: ' + str(dest))

def link(source, dest):
    if not dest.exists():
        dest.symlink_to(source, target_is_directory=source.is_dir())

if '--download' in sys.argv:
    def freepats(item):
        archive = ROOT / item['archive']
        fetch(item['url'], archive, item['sha256'])
        out = ROOT / item['folder']
        out.mkdir(exist_ok=True)
        if archive.suffix == '.7z':
            subprocess.run(['7z', 'x', '-y', '-o' + str(out), str(archive)], stdout=subprocess.DEVNULL, check=True)
        else:
            with tarfile.open(archive) as bundle:
                bundle.extractall(out, filter='data')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(freepats, INV['freepats']))
    vsco = INV['vsco']
    base = 'https://raw.githubusercontent.com/' + vsco['repo'] + '/' + vsco['revision'] + '/'
    def orchestral(item):
        fetch(base + urllib.parse.quote(item['path']), ROOT / 'VSCO-CE' / item['path'], item['sha256'])
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(orchestral, vsco['files']))
    for name in vsco['mappings']:
        # Mappings are pinned to the same commit as the recorded samples.
        dest = ROOT / 'VSCO-CE' / name
        fetch(base + name, dest, vsco['mappingHashes'][name])

for item, definition in zip(INV['freepats'], DEFS[:18]):
    folder = ROOT / item['folder']
    sfz = next(folder.rglob('*.sfz'))
    link(sfz.parent, ROOT / definition['id'])

cc0 = (ROOT / 'VSCO-CE/LICENSE').read_bytes()
# Proxy directories allow extra licence files without changing original libraries.
for name in ['Discord-SFZ-GM-Bank', 'SpanishClassicalGuitar-SFZ+FLAC-20190618']:
    dest = ROOT / name
    dest.mkdir(exist_ok=True)
    for child in (LOCAL / name).iterdir():
        link(child, dest / child.name)
    (dest / 'CC0-LICENSE.txt').write_bytes(cc0)
for name in ['kit-analog', 'kalimba']:
    (ROOT / name / 'LICENSE.txt').write_bytes(cc0)

def mapping(dest, regions):
    dest.mkdir(exist_ok=True)
    # One-shot keeps short piano-roll triggers from cutting off the percussion.
    text = '<global> loop_mode=one_shot ampeg_release=0.05\n'
    text += '\n'.join(f'<region> key={key} sample={sample}' for key, sample in regions)
    (dest / 'gm.sfz').write_text(text + '\n')
    (dest / 'LICENSE.txt').write_bytes(cc0)

analog = {36:'Kick04.wav', 38:'Snare09.wav', 39:'Clap01.wav', 42:'ClosedHiHat01-01.wav', 46:'OpenHiHat02-01.wav', 49:'Cymbal01-01.wav', 51:'Cymbal02.wav', 45:'LowTom02-01.wav', 47:'MidTom02-01.wav', 50:'HighTom02-01.wav', 70:'Shaker04.wav', 75:'Claves01.wav'}
mapping(ROOT / 'kit-analog', [(k, 'samples/' + v) for k,v in analog.items()])
# Two genuinely different microphone mixes from the same jazz-kit performances.
kit = {36:('kick','kick_snon_vl4_rr1'), 38:('snare','snare_center_vl8'), 37:('snare','snare_crossstick_vl8'), 42:('hh','hh_closed_vl4_rr1'), 46:('hh','hh_open_vl4_rr1'), 45:('ltom','ltom_center_vl8'), 50:('htom','htom_center_vl8')}
for id, mic in [('kit-acoustic', 'oh'), ('kit-lofi', 'lofi')]:
    dest = ROOT / id
    dest.mkdir(exist_ok=True)
    link(LOCAL / 'virtuosity_drums/Samples' / mic, dest / 'samples')
    regions = [(key, f'samples/{directory}/{mic}_{stem}.flac') for key,(directory,stem) in kit.items()]
    for key, directory, term in [(49,'crash','crash_crash'), (51,'ride','ride_ride')]:
        candidates = sorted((dest / 'samples' / directory).glob(f'{mic}_{term}*'))
        if not candidates:
            raise RuntimeError('Missing cymbal: ' + str(dest / directory))
        regions.append((key, 'samples/' + directory + '/' + candidates[len(candidates)//2].name))
    for key, sample in regions:
        if not (dest / sample).exists():
            raise RuntimeError('Missing drum sample: ' + sample)
    mapping(dest, regions)
    shutil.copyfile(LOCAL / 'virtuosity_drums/README.md', dest / 'SOURCE-README.txt')

# Original FM/noise drum samples. Fixed seed makes the sources reproducible.
rate = 44100
dest = ROOT / 'kit-digital'
(dest / 'samples').mkdir(parents=True, exist_ok=True)
regions = []
for key, kind, seconds in [(36,'kick',1.0),(38,'snare',.5),(39,'clap',.45),(42,'hat',.18),(46,'open',.8),(45,'lowtom',.8),(47,'midtom',.7),(50,'hightom',.6),(49,'crash',2.5),(51,'ride',1.5)]:
    rng = random.Random(317 + key)
    pcm = array.array('h')
    previous = 0.0
    phase = 0.0
    for i in range(round(seconds * rate)):
        t = i/rate
        noise = rng.uniform(-1,1)
        high = (noise - previous)/2
        previous = noise
        if kind == 'kick':
            phase += 2*math.pi*(48+130*math.exp(-t*35))/rate
            y = math.sin(phase)*math.exp(-t*6) + high*.3*math.exp(-t*180)
        elif 'tom' in kind:
            freq = {'lowtom':100,'midtom':145,'hightom':205}[kind]
            phase += 2*math.pi*(freq+80*math.exp(-t*35))/rate
            y = math.sin(phase+1.2*math.sin(phase*1.53)*math.exp(-t*9))*math.exp(-t*7)
        elif kind in ('snare','clap'):
            burst = math.exp(-t*13)
            if kind == 'clap': burst *= .3 + .7*(.5+.5*math.cos(t*2*math.pi*47))**6
            y = high*burst + .25*math.sin(2*math.pi*185*t)*math.exp(-t*25)
        else:
            decay = {'hat':40,'open':7,'crash':2.5,'ride':4}[kind]
            metal = sum(math.sin(2*math.pi*f*t) for f in [2371,3493,4927,6607,8903])/5
            y = (.6*high+.4*metal)*math.exp(-t*decay)
        y *= min(1,i/30) * min(1,(seconds-t)*rate/180)
        pcm.append(round(max(-1,min(1,y*.7))*32767))
    if sys.byteorder != 'little': pcm.byteswap()
    path = f'samples/{kind}.wav'
    with wave.open(str(dest/path),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(rate);out.writeframes(pcm.tobytes())
    regions.append((key,path))
mapping(dest,regions)
print('Prepared',len(DEFS),'palette source mappings at',ROOT)
