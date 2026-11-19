/* AQUABIT 픽셀 그림 — "글자 지도 + 팔레트" 방식
   지도 한 글자 = 픽셀 한 칸. '.'은 투명.
   o 외곽선 / b 몸 / d 몸 그늘 / l 배(밝은 부분) / f 지느러미 / p 무늬(3단계부터)
   w 눈 흰자 / e 눈동자 / m 입
   모든 물고기는 오른쪽을 보고 그려져 있고, 왼쪽으로 갈 때는 좌우 반전한다. */
(function () {
  'use strict';

  const INK = '#10365c';

  // 몸 색 6가지
  const COLORS = {
    orange: { label: '주황', b: '#ff8a3d', d: '#d9581f', l: '#ffd08a', f: '#ffb067', p: '#fff3e0' },
    coral:  { label: '분홍', b: '#ff6b8b', d: '#cf3f63', l: '#ffc6d2', f: '#ff9bb0', p: '#ffffff' },
    lemon:  { label: '노랑', b: '#ffd43b', d: '#d6a312', l: '#fff3ad', f: '#ffe57a', p: '#ff8a3d' },
    mint:   { label: '민트', b: '#4fd8a8', d: '#1f9e74', l: '#c8f8e4', f: '#8af0c8', p: '#16684d' },
    sky:    { label: '하늘', b: '#4aa8ff', d: '#2368c9', l: '#cbe7ff', f: '#8cc8ff', p: '#ffe066' },
    grape:  { label: '보라', b: '#a57bff', d: '#6f45d2', l: '#e4d7ff', f: '#c8adff', p: '#ffe066' },
  };

  // 물고기 3종. tail: 꼬리 칸 수, tailAlt: 두 번째 프레임에서 바뀌는 꼬리 칸, head: 장신구를 얹을 머리 위치
  const SPECIES = {
    goldfish: {
      label: '금붕어',
      rows: [
        '..........ooo.....',
        '........oofffo....',
        '......oobbbbbboo..',
        'oo...obbbbbbbbbbo.',
        'ofo.obbpbbbbbbwwbo',
        'offobbppbbbbbbweo.',
        'offfobbpbbbbbbbbmo',
        'offobllllbbbbbbbo.',
        'ofo.oblllllbbbbo..',
        'oo...oollllbbfoo..',
        '.......oooofffo...',
        '...........ooo....',
      ],
      tail: 4,
      tailAlt: ['....', '....', '....', '....', 'oo..', 'ofoo', '.off', 'ofoo', 'oo..', '....', '....', '....'],
      head: { x: 11, y: 2 },
    },
    tropical: {
      label: '열대어',
      rows: [
        '........o.......',
        '.......ofo......',
        '.......offo.....',
        '......obbbo.....',
        'o....obbpbbo....',
        'oo..obbbpbbwwo..',
        'ofo.obbbpbbweo..',
        'offobbbbpbbbbmo.',
        'ofo.obbbpblllo..',
        'oo..obbbplllo...',
        'o....obbpllo....',
        '......obbbo.....',
        '.......offo.....',
        '.......ofo......',
        '........o.......',
      ],
      tail: 4,
      tailAlt: ['....', '....', '....', '....', '....', 'o...', 'ofo.', 'offo', 'ofo.', 'o...', '....', '....', '....', '....', '....'],
      head: { x: 11, y: 4 },
    },
    puffer: {
      label: '복어',
      rows: [
        '......o...o......',
        '....o.obbbbbo.o..',
        '.....obbbbbbbbo..',
        '....obbpbbpbbbbo.',
        'oo.obbbbbbbbbwwbo',
        'ofoobbpbbpbbbweoo',
        'offobbbbbbbbbbbmo',
        'ofoolllllllllbbo.',
        'oo.ollllllllllo..',
        '....olllllllllo..',
        '...o..ollllo..o..',
        '.......o..o......',
      ],
      tail: 3,
      tailAlt: ['...', '...', '...', '...', '...', 'oo.', 'ofo', 'oo.', '...', '...', '...', '...'],
      head: { x: 10, y: 2 },
    },
  };

  // 장신구 (아래쪽 가운데를 머리 위치에 맞춘다)
  const ACCESSORIES = {
    ribbon: {
      label: '리본', price: 30,
      rows: ['oo...oo', 'oro.oro', 'orrkrro', 'oro.oro', 'oo...oo'],
      pal: { r: '#ff4f7b', k: '#ffd1dc' },
    },
    hat: {
      label: '모자', price: 60,
      rows: ['.ooooo.', '.ohhho.', '.ohhho.', '.ogggo.', 'ohhhhho', 'ooooooo'],
      pal: { h: '#3a4f86', g: '#ff5a5f' },
    },
    crown: {
      label: '왕관', price: 120,
      rows: ['o..o..o', 'oyoyoyo', 'oyyjyyo', 'oYYYYYo', 'ooooooo'],
      pal: { y: '#ffd43b', Y: '#d6a312', j: '#ff5a8a' },
    },
  };

  // 아이콘
  const ICONS = {
    pearl: {
      rows: ['..oooo..', '.owwppo.', 'owwppppo', 'owpppppo', 'opppppso', 'oppppsso', '.opssso.', '..oooo..'],
      pal: { w: '#ffffff', p: '#f7e6f2', s: '#c8afd8' },
    },
    food: {
      rows: ['..oooo..', '.oaAaao.', 'oaAAaaao', 'oaAaaaao', 'oaaaaado', 'oaaaaddo', '.oadddo.', '..oooo..'],
      pal: { a: '#e8a04a', A: '#ffd08a', d: '#b86e25' },
    },
    pellet: { rows: ['.o.', 'oao', '.o.'], pal: { a: '#e8a04a', o: '#8a4a12' } },
    // HUD 아이콘
    brush: {
      rows: ['.......oo', '......obo', '.....obbo', '....obbo.', '...obbo..', '..owwo...', '.occo....', 'occo.....', 'oo.......'],
      pal: { b: '#b07a3e', w: '#cfd8e0', c: '#ff5a8a' },
    },
    task: {
      rows: ['ooooooo..', 'owwwwwwo.', 'owkkkkwo.', 'owwwwwwo.', 'owkkkwwo.', 'owwwwwwo.', 'owkkkkwo.', 'owwwwwwo.', '.ooooooo.'],
      pal: { w: '#fff6e3', k: '#8fb0c9' },
    },
    shop: {
      rows: ['...ooo...', '..o...o..', '.ooooooo.', 'obbbbbbbo', 'obbpbbbbo', 'obbbbbbbo', 'odddddddo', '.ooooooo.'],
      pal: { b: '#ff8a3d', d: '#d9581f', p: '#ffffff' },
    },
    team: {
      rows: ['..oo...oo..', '.obbo.oyyo.', '.obbo.oyyo.', '..oo...oo..', '.oooo.oooo.', 'obbbboyyyyo', 'obbbboyyyyo', 'ooooooooooo'],
      pal: { b: '#4aa8ff', y: '#ff8a3d' },
    },
    gear: {
      rows: ['...ooo...', '.oogggoo.', '.ogggggo.', 'oggoooggo', 'oggo.oggo', 'oggoooggo', '.ogggggo.', '.oogggoo.', '...ooo...'],
      pal: { g: '#cfe0ea' },
    },
    chat: {
      rows: ['ooooooooo', 'owwwwwwwo', 'owkwkwkwo', 'owwwwwwwo', 'ooowwoooo', '..owo....', '..oo.....'],
      pal: { w: '#ffffff', k: '#10365c' },
    },
    back: {
      rows: ['...o....', '..oo....', '.oooooo.', 'oooooooo', '.oooooo.', '..oo....', '...o....'],
      pal: {},
    },
  };

  // ── 렌더링 ──────────────────────────────────────────
  function mix(hex, toward, t) {
    const a = parseInt(hex.slice(1), 16), b = parseInt(toward.slice(1), 16);
    const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }

  /** 지도 + 팔레트 → 1칸=1px 캔버스 */
  function paint(rows, pal, w) {
    const width = w || Math.max(...rows.map((r) => r.length));
    const c = document.createElement('canvas');
    c.width = width; c.height = rows.length;
    const ctx = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = pal[row[x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    return c;
  }

  function fishPalette(color, { pattern, faded, white }) {
    const c = COLORS[color] || COLORS.orange;
    if (white) return { o: '#ffffff', b: '#ffffff', d: '#fff6c8', l: '#ffffff', f: '#ffffff', p: '#ffffff', w: '#ffffff', e: '#ffe066', m: '#fff6c8' };
    let pal = { o: INK, b: c.b, d: c.d, l: c.l, f: c.f, p: pattern ? c.p : c.b, w: '#ffffff', e: INK, m: c.d };
    if (faded) {
      // 시무룩: 색이 옅어진다
      const out = {};
      for (const k in pal) out[k] = mix(pal[k], '#dfeef0', k === 'o' || k === 'e' ? 0.35 : 0.55);
      pal = out;
    }
    return pal;
  }

  function fishRows(sp, frame) {
    if (frame % 2 === 0) return sp.rows;
    return sp.rows.map((r, i) => sp.tailAlt[i] + r.slice(sp.tail));
  }

  const ACC_PAD = 6; // 장신구 높이만큼 위쪽 여백
  const cache = new Map();

  /**
   * 물고기 한 프레임 (장신구 포함). 1칸=1px 캔버스와 머리/몸 위치 정보를 돌려준다.
   * opts: { species, color, accessory, stage, faded, frame }
   */
  function fishSprite(opts) {
    const sp = SPECIES[opts.species] || SPECIES.goldfish;
    const pattern = (opts.stage || 1) >= 3;
    const key = [opts.species, opts.color, opts.accessory || '', pattern ? 1 : 0, opts.faded ? 1 : 0, opts.frame % 2, opts.white ? 1 : 0].join('|');
    let hit = cache.get(key);
    if (hit) return hit;

    const body = paint(fishRows(sp, opts.frame), fishPalette(opts.color, { pattern, faded: opts.faded, white: opts.white }));
    const c = document.createElement('canvas');
    c.width = body.width; c.height = body.height + ACC_PAD;
    const ctx = c.getContext('2d');
    ctx.drawImage(body, 0, ACC_PAD);
    const acc = opts.accessory && ACCESSORIES[opts.accessory];
    if (acc) {
      const pal = Object.assign({ o: INK }, acc.pal);
      if (opts.faded) for (const k in pal) pal[k] = mix(pal[k], '#dfeef0', 0.45);
      const a = paint(acc.rows, pal);
      ctx.drawImage(a, sp.head.x - Math.floor(a.width / 2), ACC_PAD + sp.head.y - a.height + 1);
    }
    hit = { canvas: c, bodyTop: ACC_PAD, bodyH: body.height, w: c.width, h: c.height };
    cache.set(key, hit);
    return hit;
  }

  function icon(name) {
    const key = 'icon|' + name;
    if (!cache.has(key)) {
      const ic = ICONS[name];
      cache.set(key, paint(ic.rows, Object.assign({ o: INK }, ic.pal)));
    }
    return cache.get(key);
  }

  function accessorySprite(name) {
    const key = 'acc|' + name;
    if (!cache.has(key)) {
      const a = ACCESSORIES[name];
      cache.set(key, paint(a.rows, Object.assign({ o: INK }, a.pal)));
    }
    return cache.get(key);
  }

  /** 성장 단계별 크기 배율: 1배 → 1.5배 → 2배 → 2배 */
  const STAGE_SCALE = [1, 1, 1.5, 2, 2];
  const STAGE_NAMES = ['', '아기', '꼬마', '어른', '반짝'];
  const STAGE_NEED = [0, 0, 5, 15, 40];

  /** DOM에 넣을 미리보기 캔버스 (프로필, 목록 타일, 꾸미기) */
  function previewCanvas(fish, scale, frame) {
    const spr = fishSprite(Object.assign({ frame: frame || 0 }, fish));
    const c = document.createElement('canvas');
    c.width = spr.w * scale; c.height = spr.h * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spr.canvas, 0, 0, c.width, c.height);
    c.className = 'pixel-canvas';
    return c;
  }

  function iconCanvas(name, scale) {
    const src = name in ACCESSORIES ? accessorySprite(name) : icon(name);
    const c = document.createElement('canvas');
    c.width = src.width * scale; c.height = src.height * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    c.className = 'pixel-canvas';
    c.setAttribute('aria-hidden', 'true');
    return c;
  }

  window.PixelArt = {
    INK, COLORS, SPECIES, ACCESSORIES, STAGE_SCALE, STAGE_NAMES, STAGE_NEED,
    fishSprite, icon, accessorySprite, previewCanvas, iconCanvas, mix,
  };
})();
