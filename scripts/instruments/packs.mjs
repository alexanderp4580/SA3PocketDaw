/**
 * Pack definitions. `libraryDir` and `sfz` are relative to the source root (default ~/Music/sfz).
 * `tails` lists the longest kept sample length by register (centre key `upTo`, seconds); looped samples end at their loop.
 */
const GRAND_TAILS = [{ upTo: 47, sec: 8 }, { upTo: 71, sec: 6 }, { upTo: 91, sec: 4 }, { upTo: 127, sec: 3 }];
const EP_TAILS = [{ upTo: 47, sec: 10 }, { upTo: 71, sec: 8 }, { upTo: 127, sec: 5 }];

const GREG = (name, dir, id) => ({
  id,
  name,
  libraryDir: 'GregSullivan.E-Pianos',
  sfz: `${dir}/${dir}.sfz`,
  credits: [`${name} samples by Greg Sullivan (sullivang.net), licensed CC BY 3.0. SFZ mapping by kinwie.`],
  license: 'CC BY 3.0',
  sourceUrl: 'http://www.sullivang.net/',
  copy: [{ from: 'LICENSE', to: 'LICENSE.txt' }, { from: 'README.md', to: 'SOURCE-README.md' }],
  layers: 4,
  channels: 'auto',
  maxDecodedMB: 80,
  maxDownloadMB: 12,
  tails: EP_TAILS,
});

export const PACKS = {
  upright: {
    id: 'upright',
    name: 'Upright piano',
    libraryDir: 'UprightPianoKW-SFZ+FLAC-20220221',
    sfz: 'UprightPianoKW-20220221.sfz',
    credits: ['Upright Piano KW, recorded by Gonzalo and Roberto (FreePats), released under CC0 1.0.'],
    license: 'CC0 1.0',
    sourceUrl: 'http://freepats.zenvoid.org/Piano/acoustic-grand-piano.html#UprightKW',
    copy: [{ from: 'cc0.txt', to: 'LICENSE.txt' }, { from: 'readme.txt', to: 'SOURCE-README.txt' }],
    layers: 99,
    /** The loop tail is crossfaded into the material before the loop start, so the wrap is continuous after lossy encoding. */
    bakeLoops: true,
    channels: 'auto',
    maxDecodedMB: 120,
    maxDownloadMB: 25,
    tails: [{ upTo: 127, sec: 30 }],
  },
  grand: {
    id: 'grand',
    name: 'Grand piano',
    libraryDir: 'SalamanderGrandPiano',
    sfz: 'Salamander Grand Piano V3.sfz',
    credits: ['Salamander Grand Piano V3 by Alexander Holm, licensed CC BY 3.0 (archive.org/details/SalamanderGrandPianoV3). SFZ mapping by kinwie.'],
    license: 'CC BY 3.0',
    sourceUrl: 'https://archive.org/details/SalamanderGrandPianoV3',
    copy: [{ from: 'LICENSE', to: 'LICENSE.txt' }, { from: 'README.md', to: 'SOURCE-README.md' }],
    layers: 5,
    channels: 'mono',
    maxDecodedMB: 120,
    maxDownloadMB: 45,
    tails: GRAND_TAILS,
    /** String resonance release samples are not used. */
    excludeSample: /(^|\/)harm[A-Z]/,
  },
  'ep-cp80': GREG('Yamaha CP80 electric grand', 'CP80', 'ep-cp80'),
  'ep-pianet': GREG('Hohner Pianet T', 'Pianet T', 'ep-pianet'),
  'ep-wurlitzer': GREG('Wurlitzer EP200', 'Wurlitzer EP200', 'ep-wurlitzer'),
  'mini-piano': {
    id: 'mini-piano',
    name: 'Mini piano',
    libraryDir: 'UprightPianoKW-SFZ+FLAC-20220221',
    sfz: 'UprightPianoKW-20220221.sfz',
    credits: ['Mini piano from Upright Piano KW, recorded by Gonzalo and Roberto (FreePats), released under CC0 1.0.'],
    license: 'CC0 1.0',
    sourceUrl: 'http://freepats.zenvoid.org/Piano/acoustic-grand-piano.html#UprightKW',
    copy: [{ from: 'cc0.txt', to: 'LICENSE.txt' }],
    layers: 1,
    keyStep: 2,
    channels: 'mono',
    maxDecodedMB: 16,
    maxDownloadMB: 2.5,
    /** Loops are not kept: notes fade with the sample tail. */
    dropLoops: true,
    tails: [{ upTo: 47, sec: 4 }, { upTo: 71, sec: 3 }, { upTo: 127, sec: 2 }],
    outDir: 'public/instruments/mini-piano',
  },
};
