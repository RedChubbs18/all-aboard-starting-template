import sharp from "sharp";
const src = new URL("../public/brand/official/horse-mark.svg", import.meta.url).pathname;
const out = new URL("./assets/lloyds-horse-180.png", import.meta.url).pathname;
await sharp(src, { density: 600 })
  .resize(180, 180, { fit: "contain", position: "centre", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(out);
const meta = await sharp(out).metadata();
const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
let transparent = 0, white = 0;
for (let i = 0; i < data.length; i += info.channels) {
  if (data[i + 3] === 0) transparent++;
  if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245 && data[i + 3] > 0) white++;
}
const corners = [0, 179, 179 * 180, 180 * 180 - 1].map((p) => data[p * 4 + 3]);
console.log({ width: meta.width, height: meta.height, channels: meta.channels, hasAlpha: meta.hasAlpha, transparentPixels: transparent, opaqueWhitePixels: white, cornerAlpha: corners });
