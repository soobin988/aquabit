// 랜딩 배너의 픽셀 도형과 팔레트를 편집 가능한 PNG 원본으로 내보냅니다.
// 원본 PNG를 직접 수정한 뒤에는 이 스크립트를 다시 실행하지 않아도 됩니다.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'game/public/assets');
const landing = fs.readFileSync(path.join(root, 'public/js/aquarium.js'), 'utf8');
function readLiteral(name) {
  const match = landing.match(new RegExp('var ' + name + ' = ([\\s\\S]*?);'));
  if (!match) throw new Error('랜딩 팔레트를 찾을 수 없습니다. ' + name);
  return vm.runInNewContext('(' + match[1] + ')');
}
const sprites = readLiteral('SPRITES');
const palettes = readLiteral('PALETTES');
const water = readLiteral('WATER');
const ink = '#0b1d3a';
const only = process.argv.find(argument => argument.startsWith('--only='))?.slice(7).split(',');

function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, checksum]);
}
function texture(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  return {
    pixels,
    rect(x, y, w, h, color, alpha = 255) {
      const rgb = color.slice(1).match(/../g).map(value => parseInt(value, 16));
      for (let row = Math.max(0, y); row < Math.min(height, y + h); row++) {
        for (let col = Math.max(0, x); col < Math.min(width, x + w); col++) {
          const index = (row * width + col) * 4;
          pixels.set([...rgb, alpha], index);
        }
      }
    },
    grid(rows, colors, x, y, scale = 1) {
      rows.forEach((row, rowIndex) => [...row].forEach((symbol, column) => {
        if (colors[symbol]) this.rect(x + column * scale, y + rowIndex * scale, scale, scale, colors[symbol]);
      }));
    },
    save(name) {
      if (only && !only.includes(name)) return;
      const header = Buffer.alloc(13);
      header.writeUInt32BE(width, 0);
      header.writeUInt32BE(height, 4);
      header[8] = 8;
      header[9] = 6;
      const rows = [];
      for (let y = 0; y < height; y++) rows.push(Buffer.from([0]), pixels.subarray(y * width * 4, (y + 1) * width * 4));
      fs.writeFileSync(path.join(destination, name + '.png'), Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
        chunk('IEND', Buffer.alloc(0)),
      ]));
    },
  };
}

function fish(name, shape, palette, scale = 2) {
  const image = texture(48, 32);
  const width = Math.max(...shape.map(row => row.length));
  const x = Math.floor((48 - width * scale) / 2);
  const y = Math.min(10, 31 - shape.length * scale);
  image.grid(shape, { K: ink, W: '#ffffff', ...palette }, x, y, scale);
  image.save('fish-' + name);
  const second = texture(48, 32);
  second.pixels.set(image.pixels);
  if (name === 'shrimp') {
    // 몸과 발끝 높이는 유지하고 다리의 좌우 위치만 번갈아 바꿉니다.
    second.rect(0, y + 9 * scale, 48, 32 - y - 9 * scale, '#000000', 0);
    second.grid(['..K.K.K.K.K.........', '...K.K.K.KK.........'], { K: ink }, x, y + 9 * scale, scale);
  } else {
    // 꼬리만 접습니다. 머리·몸·장식의 기준점은 두 프레임이 같습니다.
    const tailStart = x + (width - (name === 'betta' ? 5 : name === 'guppy' ? 2 : 3)) * scale;
    const centerY = y + (shape.length * scale - 1) / 2;
    second.rect(tailStart, 0, 48 - tailStart, 32, '#000000', 0);
    for (let row = 0; row < 32; row++) for (let col = tailStart; col < 48; col++) {
      const offset = (row * 48 + col) * 4;
      if (!image.pixels[offset + 3]) continue;
      const targetY = Math.round(centerY + (row - centerY) * .62);
      image.pixels.copy(second.pixels, (targetY * 48 + col) * 4, offset, offset + 4);
    }
  }
  second.save('fish-' + name + '-2');
}
fish('gold', sprites.big, palettes[1]);
fish('guppy', sprites.small, palettes[4], 3);
fish('betta', [
  '...KKKKK....KKKK',
  '..KAAAAAK..KCCCK',
  '.KAWAAAAAKKCCCCK',
  'KAAKAAAAAAKCCCCK',
  'KAAAAAAAAAKCCCCK',
  'KLLLLAAAAAKCCCCK',
  '.KLLLLLAAKKCCCCK',
  '..KLLLLLK..KCCCK',
  '...KKKKK....KKKK',
], palettes[2]);
fish('angel', [
  '.......K.......',
  '......KAK......',
  '.....KAAK......',
  '....KAAAK......',
  '..KKAAAAAK..KK.',
  '.KAWAAAAAAKKCK.',
  'KAAKAAAAAAAKCK.',
  'KAAAAAKAAAAACCK',
  'KLLLAAKAAAAACK.',
  '.KLLLLAAAKKKCK.',
  '..KKLLLLK...KK.',
  '....KLLK.......',
  '.....KLK.......',
  '......KK.......',
], palettes[0]);

fish('neon', [
  '.......KKK..........',
  '...KKKKAAAKKK...KK..',
  '..KAWAAAAAAAAKKCK..',
  '.KBBBBBBBBBBBBBCCK..',
  'KAKBBBBBBBBBBBKCCK..',
  '.KLLLLLEEEEEEEKCK...',
  '..KKLLLEEEEKK..KK...',
  '....KKKKKKK.........',
], { A: '#6f86a6', B: '#4fd1e8', L: '#c9f3ff', C: '#ff7a6b', E: '#ff5b61' });
fish('shrimp', [
  'KK.KK...............',
  '..K..K....KKKKK.....',
  '...K.K.KKKAAAAAKK...',
  '....KKKABLAAKAAAKK..',
  '...KABKBLAKAAKAALK..',
  '..KABBBBLAAKAALK.KK.',
  '.KABWBBBBBLALKK.KALK',
  '..KBBBBBBBKKKK..KALK',
  '...KKKKKKKK......KK.',
  '...K.K.K.KK.........',
  '..K.K.K.K.K.........',
  '....................',
], { A: '#2b8be8', B: '#1565c0', L: '#4fd1e8' });

const waterImage = texture(128, 128);
water.forEach((color, index) => waterImage.rect(0, index * 19, 128, 19, color));
waterImage.save('water-interior');

const rays = texture(128, 128);
for (let beam = 0; beam < 4; beam++) {
  for (let y = 0; y < 104; y += 2) rays.rect(beam * 37 - 15 + Math.round(y * .35), y, 6, 2, '#ffffff', 16);
}
rays.save('pixel-rays');

const sand = texture(128, 16);
for (let x = 0; x < 128; x += 6) sand.rect(x, x % 18 === 0 ? 0 : 1, 6, 16, '#e7c46a');
sand.rect(0, 2, 128, 14, '#ffe6a3');
for (let x = 1; x < 128; x += 5) sand.rect(x, 3 + (x * 7) % 12, 1, 1, '#d9b25a');
sand.save('sand');

function plant(name) {
  const image = texture(32, 48);
  if (name === 'tree') {
    for (let y = 8; y < 48; y++) {
      const x = 15 + Math.round(Math.sin(y / 12) * 3);
      image.rect(x - 2, y, 5, 1, ink);
      image.rect(x - 1, y, 2, 1, '#b8844f');
      if (y > 18 && y < 30) image.rect(x - (y - 18), y, 3, 2, '#b8844f');
      if (y > 10 && y < 21) image.rect(x + (21 - y), y, 3, 2, '#2fbf85');
    }
  } else {
    const color = name === 'coral' ? '#ff7a6b' : '#2fbf85';
    for (let y = 2; y < 48; y++) {
      const x = 15 + Math.round(Math.sin(y * .19) * 3);
      image.rect(x - 1, y, 4, 1, ink);
      image.rect(x, y, 2, 1, color);
      if (y % 9 === 4) {
        image.rect(x + 2, y - 1, 4, 3, ink);
        image.rect(x + 2, y, 3, 1, color);
      }
      if (name === 'coral' && y > 20 && y < 34) {
        image.rect(x - Math.floor((34 - y) / 2) - 1, y, 4, 1, ink);
        image.rect(x - Math.floor((34 - y) / 2), y, 2, 1, '#ffd1b8');
      }
    }
  }
  image.save('plant-' + name);
}
['aquatic', 'coral', 'tree'].forEach(plant);

const rock = texture(16, 10);
rock.rect(1, 1, 13, 9, ink);
rock.rect(3, 3, 9, 7, '#6f86a6');
rock.rect(3, 3, 4, 2, '#9fb3cc');
rock.save('rock');

const bubble = texture(4, 4);
bubble.grid(['.W..', 'W.W.', '.W..', '....'], { W: '#e3f6ff' }, 0, 0);
bubble.save('bubble');
const bubbleDot = texture(1, 1);
bubbleDot.rect(0, 0, 1, 1, '#e3f6ff');
bubbleDot.save('bubble-dot');

const accessories = {
  bow: ['KK...KK', 'KPK.KPK', 'KPPKPPK', '.KPPPK.', 'KPPKPPK', 'KPK.KPK', 'KK...KK'],
  flower: ['..KKK..', '.KPPPK.', 'KPPYPPK', 'KPYWYPK', 'KPPYPPK', '.KPPPK.', '..KKK..'],
  crown: ['K..K..K', 'KYKYKYK', 'KYYYYYK', 'KYLYLYK', 'KYYYYYK', 'KKKKKKK'],
};
for (const [name, shape] of Object.entries(accessories)) {
  const image = texture(48, 32);
  image.grid(shape, { K: ink, P: '#ff7a6b', Y: '#ffd34e', L: '#fff3c4', W: '#ffffff' }, 19, name === 'crown' ? 3 : 4);
  image.save('accessory-' + name);
}
const sparkle = texture(48, 32);
for (const [x, y] of [[3, 11], [35, 5], [39, 23], [9, 25]]) {
  sparkle.grid(['.W.', 'WYW', '.W.'], { W: '#e3f6ff', Y: '#ffd34e' }, x, y);
}
sparkle.save('effect-sparkle');

const can = texture(32, 48);
can.rect(3, 4, 26, 6, ink);
can.rect(5, 10, 22, 32, ink);
can.rect(7, 10, 18, 30, '#ffd34e');
can.rect(9, 15, 14, 18, '#fff3c4');
can.grid(sprites.small, { K: ink, A: '#ff9a3c', L: '#ffe0b0', C: '#ff7a6b' }, 12, 21);
can.save('food-can');
const pellet = texture(4, 4);
pellet.rect(0, 0, 4, 4, ink);
pellet.rect(1, 1, 2, 2, '#ffd34e');
pellet.save('food-pellet');
console.log('랜딩 배너의 팔레트로 게임 PNG 원본을 내보냈습니다.');
