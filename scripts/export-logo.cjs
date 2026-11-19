// 기존 랜딩페이지 SVG의 픽셀 도형을 그대로 투명 PNG로 저장합니다.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const directory = path.resolve(__dirname, '../public/img');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function exportLogo(source, target, scale) {
  const svg = fs.readFileSync(path.join(directory, source), 'utf8');
  const width = 58 * scale, height = 9 * scale;
  const pixels = Buffer.alloc(width * height * 4);
  for (const [, fill, data] of svg.matchAll(/<path fill="(#[\da-f]{6})" d="([^"]+)"/gi)) {
    const rgb = [1, 3, 5].map(offset => parseInt(fill.slice(offset, offset + 2), 16));
    const rectangle = /M(\d+) (\d+)h(\d+)v(\d+)h-(\d+)z/g;
    if (data.replace(rectangle, '').trim()) throw new Error('지원하지 않는 SVG 도형: ' + source);
    for (const [, x, y, w, h, back] of data.matchAll(rectangle)) {
      if (w !== back) throw new Error('직사각형 너비를 확인하세요.');
      for (let row = Number(y) * scale; row < (Number(y) + Number(h)) * scale; row++) {
        for (let col = Number(x) * scale; col < (Number(x) + Number(w)) * scale; col++) {
          pixels.set([...rgb, 255], (row * width + col) * 4);
        }
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row++) pixels.copy(rows, row * (width * 4 + 1) + 1, row * width * 4, (row + 1) * width * 4);
  fs.writeFileSync(path.join(directory, target), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
  ]));
  console.log(target + ': ' + width + ' × ' + height + ', 투명 배경');
}
exportLogo('logo.svg', 'logo.png', 4);
exportLogo('logo.svg', 'logo-pixel.png', 1);
exportLogo('logo-light.svg', 'logo-light.png', 4);
