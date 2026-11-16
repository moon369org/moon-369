// Renders SVG to PNG for link previews. Only used by /v1/card.png.
import { createRequire } from 'node:module';
import { writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SYNCOPATE_700_TTF, JETBRAINS_MONO_400_TTF } from './card-fonts.js';

const require = createRequire(import.meta.url);
let fontFiles: string[] | undefined;

/** resvg reads fonts from files, so write the embedded subsets to the function's temp folder once. */
function fonts(): string[] {
  if (fontFiles) return fontFiles;
  const dir = tmpdir();
  const out: string[] = [];
  for (const [name, b64] of [['moon-syncopate-700.ttf', SYNCOPATE_700_TTF], ['moon-jetbrains-mono-400.ttf', JETBRAINS_MONO_400_TTF]] as const) {
    const f = join(dir, name.replace('.ttf', `-${b64.length}.ttf`));   // the size in the name, so a changed subset never reuses an old file
    if (!existsSync(f)) writeFileSync(f, Buffer.from(b64, 'base64'));
    out.push(f);
  }
  return (fontFiles = out);
}

export function svgToPng(svg: string, width: number): Buffer {
  const { Resvg } = require('@resvg/resvg-js') as typeof import('@resvg/resvg-js');
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { fontFiles: fonts(), loadSystemFonts: false, defaultFontFamily: 'JetBrains Mono' } });
  return r.render().asPng();
}
