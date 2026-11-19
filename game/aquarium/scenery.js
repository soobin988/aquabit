// public/js/aquarium.js의 buildScene/drawWeeds/drawWater/frame 방식을 참고했습니다.
// 동일한 4~5px 픽셀 격자·수초 위쪽의 파동·분산된 바닥 배치를 사용하며,
// 그림 자체는 편집 가능한 PNG에서 읽습니다. Vue와 저장 계층에는 의존하지 않습니다.
import { drawLandingLight } from './landing-light.mjs';

export function createScenery(canvas, foreground, floorCanvas, images, initialEnvironment, initialPaused = false) {
  const ctx = canvas.getContext('2d');
  const front = foreground.getContext('2d');
  const floor = floorCanvas.getContext('2d');
  let environment = initialEnvironment, paused = initialPaused;
  let width = 1, height = 1, sandTop = 1, stems = [], rocks = [], specks = [], schools = [];
  let elapsed = 0, last = 0, raf = 0, visible = true, disposed = false;
  // 배경 실루엣은 PNG의 알파 모양만 사용합니다. 원본 PNG는 수정하지 않습니다.
  const silhouettes = ['#0b1d3a', '#d4f3ff'].map(color => [images.distant0, images.distant1].map(image => {
    const mask = document.createElement('canvas');
    mask.width = image.width; mask.height = image.height;
    const paint = mask.getContext('2d');
    paint.drawImage(image, 0, 0);
    paint.globalCompositeOperation = 'source-in';
    paint.fillStyle = color; paint.fillRect(0, 0, mask.width, mask.height);
    return mask;
  }));
  // 설정을 바꿀 때 수초 배치가 바뀌지 않도록 배치에만 고정 난수를 사용합니다.
  function buildScene() {
    const rect = canvas.getBoundingClientRect();
    const pixel = rect.width < 600 ? 4 : 5;
    width = Math.max(1, Math.ceil(rect.width / pixel));
    height = Math.max(1, Math.ceil(rect.height / pixel));
    canvas.width = width; canvas.height = height;
    foreground.width = width; foreground.height = height;
    floorCanvas.width = width; floorCanvas.height = height;
    sandTop = height - Math.max(10, Math.round(height * .11));
    let seed = 4827;
    const rand = (min, max) => { seed = (seed * 16807) % 2147483647; return min + (seed / 2147483647) * (max - min); };
    stems = [];
    for (let x = rand(4, 16); x < width - 4; x += rand(14, 35)) {
      stems.push({ x: Math.round(x), h: Math.round(rand(height * .12, height * .32)), phase: rand(0, Math.PI * 2), dark: rand(0, 1) > .5 });
    }
    rocks = Array.from({ length: Math.round(width / 45) }, () => ({ x: Math.round(rand(0, width - 12)), w: Math.round(rand(6, 12)), h: Math.round(rand(3, 6)) }));
    specks = Array.from({ length: Math.round(width / 16) }, () => ({ x: Math.round(rand(0, width)), y: Math.round(rand(0, height * .6)), phase: rand(0, Math.PI * 2) }));
    schools = Array.from({ length: width < 120 ? 2 : 3 }, (_, group) => {
      const members = Array.from({ length: width < 120 ? 4 : 5 }, (_, index) => ({
        size: index === 0 ? rand(24, 31) : rand(12, 21), phase: rand(0, Math.PI * 2),
      }));
      const ratio = images.distant0.height / images.distant0.width;
      const rowGap = (Math.max(...members.slice(0, 3).map(fish => fish.size)) +
        Math.max(...members.slice(3).map(fish => fish.size))) * ratio / 2 + 4;
      members.forEach((fish, index) => {
        const row = Math.floor(index / 3), column = index % 3;
        // 몸 크기만큼 떨어뜨려 겹침 때문에 실루엣이 진한 덩어리로 보이지 않게 합니다.
        fish.dx = column === 0 ? row * 8 : members[index - 1].dx + (members[index - 1].size + fish.size) / 2 + 4;
        fish.dy = row * rowGap + rand(-1, 1);
      });
      return { x: 50 + width * (.18 + group * .3), y: .19 + group * .23,
        direction: group % 2 ? 1 : -1, speed: rand(1.5, 3), tone: group % 2, members };
    });
    render();
  }
  function render() {
    ctx.imageSmoothingEnabled = false;
    front.imageSmoothingEnabled = false;
    floor.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    front.clearRect(0, 0, width, height);
    floor.clearRect(0, 0, width, height);
    ctx.drawImage(images.water, 0, 0, width, height);
    for (const school of schools) {
      const span = width + 100;
      const leadX = ((school.x + elapsed * school.speed * school.direction) % span + span) % span - 50;
      for (const fish of school.members) {
        const x = Math.round(leadX - fish.dx * school.direction);
        const y = Math.round(school.y * sandTop + fish.dy + Math.sin(elapsed * .7 + fish.phase) * 1.2);
        const frame = Math.floor(elapsed * 2 + fish.phase) % 2;
        ctx.save();
        ctx.globalAlpha = school.tone === 0 ? .14 : .08;
        ctx.translate(x, y); ctx.scale(school.direction > 0 ? -1 : 1, 1);
        const sprite = silhouettes[school.tone][frame], fishHeight = fish.size * sprite.height / sprite.width;
        ctx.drawImage(sprite, -fish.size / 2, -fishHeight / 2, fish.size, fishHeight);
        ctx.restore();
      }
    }
    if (environment.lighting && environment.lightStrength > 0) {
      drawLandingLight(front, width, sandTop, elapsed, environment.lightColor, environment.lightStrength / 35, { beamWidth: 9, length: 1 });
    }
    for (const speck of specks) {
      const alpha = (Math.sin(elapsed * 1.6 + speck.phase) + 1) / 2;
      if (alpha <= .6) continue;
      ctx.globalAlpha = (alpha - .6) * 1.5;
      ctx.fillStyle = '#e3f6ff'; ctx.fillRect(speck.x, speck.y, 1, 1);
    }
    ctx.globalAlpha = 1;
    const plant = images[environment.plant];
    const motion = { aquatic: { amplitude: 3, speed: 1.2 }, coral: { amplitude: 1.1, speed: .55 }, tree: { amplitude: .75, speed: .4 } }[environment.plant];
    for (const stem of stems) {
      ctx.filter = stem.dark ? 'brightness(.82)' : 'none';
      for (let y = 0; y < stem.h; y++) {
        const sway = environment.sway ? Math.round(Math.sin(elapsed * motion.speed + stem.phase + y * .25) * (y / stem.h) * motion.amplitude) : 0;
        const sourceY = Math.round((1 - y / Math.max(1, stem.h - 1)) * (plant.height - 1));
        ctx.drawImage(plant, 0, sourceY, plant.width, 1, Math.round(stem.x - plant.width / 2) + sway, sandTop - y, plant.width, 1);
      }
    }
    ctx.filter = 'none';
    for (let x = 0; x < width; x += images.sand.width) {
      floor.drawImage(images.sand, x, sandTop - 1, images.sand.width, height - sandTop + 1);
    }
    for (const rock of rocks) floor.drawImage(images.rock, rock.x, sandTop - rock.h, rock.w, rock.h + 1);
  }
  function frame(now) {
    elapsed += last ? Math.min(.05, (now - last) / 1000) : 0;
    last = now; render(); raf = requestAnimationFrame(frame);
  }
  function sync() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; last = 0;
    if (!disposed && !paused && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const observer = new ResizeObserver(buildScene);
  observer.observe(canvas);
  const visibility = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); });
  visibility.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  buildScene(); sync();
  return {
    setEnvironment(value) { environment = value; render(); },
    setPaused(value) { paused = value; sync(); render(); },
    destroy() { disposed = true; sync(); observer.disconnect(); visibility.disconnect(); document.removeEventListener('visibilitychange', sync); },
  };
}
