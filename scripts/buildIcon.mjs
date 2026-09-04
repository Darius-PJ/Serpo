// Builds public/Rokuro.ico - the desktop-shortcut icon - from
// public/Rokuro-logo.jpg as a circular crop at 256/48/32/16 px. Rerun with
// `npm run build:icon` if the portrait changes. The 256px entry is stored as
// PNG and the small ones as classic 32-bit BMPs, the mix Windows expects.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(projectRoot, "public", "Rokuro-logo.jpg");
const target = path.join(projectRoot, "public", "Rokuro.ico");

const MASTER = 512;
const circle = Buffer.from(
  `<svg width="${MASTER}" height="${MASTER}"><circle cx="${MASTER / 2}" cy="${MASTER / 2}" r="${MASTER / 2}" fill="#fff"/></svg>`,
);

const master = await sharp(readFileSync(source))
  .resize(MASTER, MASTER, { fit: "cover" })
  .composite([{ input: circle, blend: "dest-in" }])
  .png()
  .toBuffer();

function bmpEntry(rgba, size) {
  const xorRow = size * 4;
  const andRow = Math.ceil(size / 32) * 4;
  const data = Buffer.alloc(40 + (xorRow + andRow) * size);
  data.writeUInt32LE(40, 0); // BITMAPINFOHEADER size
  data.writeInt32LE(size, 4);
  data.writeInt32LE(size * 2, 8); // height covers the XOR and AND masks
  data.writeUInt16LE(1, 12); // planes
  data.writeUInt16LE(32, 14); // bits per pixel
  data.writeUInt32LE((xorRow + andRow) * size, 20);
  for (let y = 0; y < size; y++) {
    const srcRow = (size - 1 - y) * xorRow; // BMP rows are bottom-up
    for (let x = 0; x < size; x++) {
      const s = srcRow + x * 4;
      const d = 40 + y * xorRow + x * 4;
      data[d] = rgba[s + 2];
      data[d + 1] = rgba[s + 1];
      data[d + 2] = rgba[s];
      data[d + 3] = rgba[s + 3];
    }
  }
  // The AND mask stays all-zero: 32-bit entries carry alpha instead.
  return data;
}

const sizes = [16, 32, 48, 256];
const images = [];
for (const size of sizes) {
  if (size === 256) {
    images.push(await sharp(master).resize(size, size).png().toBuffer());
  } else {
    const rgba = await sharp(master).resize(size, size).ensureAlpha().raw().toBuffer();
    images.push(bmpEntry(rgba, size));
  }
}

const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2); // resource type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i;
  header[entry] = size === 256 ? 0 : size; // 0 means 256 in ICONDIRENTRY
  header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
});

writeFileSync(target, Buffer.concat([header, ...images]));
console.log(`Wrote ${path.relative(projectRoot, target)} (${sizes.join("/")}px).`);
