# Instrument palette

36 downloadable additions, 83,618,140 bytes in total. Together with the existing keys: 42 instruments, at least four in each of ten categories. Install individual instruments through Instruments → Category → Download → Preview → Use. Installed instruments remain available offline.

| Category | New instruments | Total download |
|---|---|---|
| leads | Surge bass & lead, Surge fifths lead, Square lead, Calliope lead | 7.9 MB |
| pads | Choir pad, Sweep pad, New Age pad, Bowed pad | 10.8 MB |
| bass | Lately FM bass, Analog synth bass, DX-style bass, Fingered electric bass | 5.0 MB |
| plucks | Kalimba, Concert harp, Nylon guitar, Steel guitar | 8.9 MB |
| mallets | Water glass bells, Glockenspiel, Marimba, Tubular bells | 2.8 MB |
| strings | Violin ensemble, Pizzicato strings, Solo violin, Cello ensemble | 13.2 MB |
| winds | Flute, Clarinet, Oboe, Muted trumpet | 19.3 MB |
| textures | Goblins texture, Soundtrack texture, Sci-fi texture, Crystal texture | 13.2 MB |
| drums | Analog drum kit, Acoustic jazz kit, Lo-fi jazz kit, Digital drum kit | 2.3 MB |

Keys: Mini piano (bundled), Upright piano, Grand piano, Yamaha CP80 electric grand, Hohner Pianet T and Wurlitzer EP200.

All new samples are CC0. FreePats release URLs and archive SHA256s, plus the pinned VSCO CE commit and per-file SHA256s, are in `scripts/instruments/palette-sources.json`. The three local source libraries (Discord GM, Spanish Classical Guitar and Virtuosity Drums) are read without changes; their required local versions are not pinned. Rebuilding those packs requires the same local libraries. Their licence notices and original mappings are shipped in each pack. Acoustic and lo-fi jazz are different microphone mixes of the same kit. The digital kit is original reproducible FM/noise synthesis.

Verification: 1129 unit tests, zero typecheck errors/warnings, production build, real Chromium decode of all 647 new AAC files, actual sampler renders for all 36 additions, full velocity coverage on every mapped key, valid decoded loop bounds, and sustained pad/texture sound at 7–8 seconds. The independent review's soft-note finger-bass failure was reproduced, fixed by retaining all layers and regression-tested. Physical phone listening and performance are to check.

Hugging Face asset release: `501bb9e7b48b50858273f49893e88a6701c22875`; the merged manifest preserves all ten existing generation/instrument pack entries. See `instruments.md` for the source recipe, browser verification tool and sampler limits.
