/**
 * The animated plane of the GTA scene: a night freeway in front of the skyline, drawn on one
 * 2D canvas at about 24 frames a second. Headlights run one way and tail lights the other,
 * police units join with the wanted level, rain puts reflections on the road, stars twinkle
 * above and an aircraft light crosses now and then. Nothing here loads an asset.
 */
import { getGtaState, prefersReducedMotion } from './gta-store';

interface Car {
  x: number;
  lane: number;
  speed: number;
  length: number;
  police: boolean;
  tint: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

const FRAME_MS = 1000 / 24;
const LANES = 4;
const ROAD_HEIGHT = 46;
const HEAD_TINTS = ['#fff6d8', '#ffffff', '#ffe9a8', '#dff0ff'];

export function mountGtaTraffic(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  const root = document.documentElement;
  let width = 0;
  let height = 0;
  let cars: Car[] = [];
  let stars: Star[] = [];
  let frame: number | undefined;
  let last = 0;
  let clock = 0;
  let disposed = false;
  // A small deterministic generator keeps the layout stable between resizes.
  let seed = 20_130_917;
  const random = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return seed / 4_294_967_296;
  };

  const spawn = (police: boolean, x = random() * width): Car => {
    const lane = Math.floor(random() * LANES);
    const forward = lane < LANES / 2;
    return {
      x,
      lane,
      speed: (forward ? 1 : -1) * (police ? 150 + random() * 60 : 46 + random() * 70),
      length: police ? 16 : 9 + random() * 8,
      police,
      tint: Math.floor(random() * HEAD_TINTS.length),
    };
  };

  const resize = () => {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    canvas.width = width;
    canvas.height = height;
    seed = 20_130_917;
    const count = Math.round(Math.min(46, Math.max(14, width / 34)));
    cars = Array.from({ length: count }, () => spawn(false));
    stars = Array.from({ length: Math.round(Math.min(90, width / 16)) }, () => ({
      x: random() * width,
      y: random() * height * 0.52,
      size: 0.6 + random() * 1.1,
      phase: random() * Math.PI * 2,
    }));
    draw(0);
  };

  const syncPolice = () => {
    const wanted = getGtaState().wanted;
    const units = cars.filter((car) => car.police).length;
    if (units < wanted) {
      for (let index = units; index < wanted; index++) {
        const car = spawn(true, 0);
        car.x = car.speed > 0 ? -40 - index * 70 : width + 40 + index * 70;
        cars.push(car);
      }
    } else if (units > wanted) {
      let extra = units - wanted;
      cars = cars.filter((car) => !car.police || extra-- <= 0);
    }
  };

  function draw(dt: number) {
    if (!context) return;
    const { weather } = getGtaState();
    const slow = root.dataset.gtaFx === 'slowmo' ? 0.2 : 1;
    const step = dt * slow;
    clock += step;
    context.clearRect(0, 0, width, height);

    // Stars fade out behind smog and rain.
    const starAlpha = weather === 'clear' ? 1 : 0.25;
    context.fillStyle = '#fff';
    for (const star of stars) {
      context.globalAlpha = starAlpha * (0.35 + 0.4 * (1 + Math.sin(clock * 1.3 + star.phase)));
      context.fillRect(star.x, star.y, star.size, star.size);
    }

    // An aircraft light crosses the sky every forty seconds or so.
    const flight = (clock % 40) / 40;
    if (flight < 0.6) {
      const x = width * (1.05 - flight * 1.9);
      const y = height * (0.1 + flight * 0.12);
      context.globalAlpha = Math.sin(clock * 9) > 0.2 ? 1 : 0.25;
      context.fillStyle = '#ff4a4a';
      context.fillRect(x, y, 3, 3);
      context.globalAlpha = 0.8;
      context.fillStyle = '#fff';
      context.fillRect(x + 7, y + 1, 2, 2);
    }

    // The freeway: a dark deck with lane marks, just above the bottom edge.
    const roadTop = height - ROAD_HEIGHT - 6;
    context.globalAlpha = 1;
    context.fillStyle = '#07090b';
    context.fillRect(0, roadTop, width, ROAD_HEIGHT);
    context.fillStyle = 'rgba(255, 255, 255, 0.2)';
    context.fillRect(0, roadTop, width, 1);
    context.fillStyle = 'rgba(240, 200, 80, 0.55)';
    context.fillRect(0, roadTop + ROAD_HEIGHT / 2 - 1, width, 2);
    context.fillStyle = 'rgba(255, 255, 255, 0.22)';
    const offset = (clock * 30) % 44;
    for (let x = -offset; x < width; x += 44) {
      context.fillRect(x, roadTop + ROAD_HEIGHT * 0.25, 18, 1);
      context.fillRect(width - x - 18, roadTop + ROAD_HEIGHT * 0.75, 18, 1);
    }

    const laneHeight = ROAD_HEIGHT / LANES;
    const wet = weather === 'rain';
    for (const car of cars) {
      car.x += car.speed * step;
      if (car.speed > 0 && car.x > width + 60) car.x = -60;
      else if (car.speed < 0 && car.x < -60) car.x = width + 60;
      const y = roadTop + car.lane * laneHeight + laneHeight / 2;
      const forward = car.speed > 0;
      const nose = forward ? car.x + car.length : car.x - car.length;
      const tail = car.x;
      context.globalAlpha = 1;
      context.fillStyle = car.police ? '#e8e8ea' : '#15191d';
      context.fillRect(Math.min(nose, tail), y - 2.5, car.length, 5);
      // Headlight cone ahead, tail lights behind.
      const beam = context.createLinearGradient(nose, 0, nose + (forward ? 46 : -46), 0);
      beam.addColorStop(0, 'rgba(255, 244, 210, 0.5)');
      beam.addColorStop(1, 'rgba(255, 244, 210, 0)');
      context.fillStyle = beam;
      context.fillRect(forward ? nose : nose - 46, y - 3.5, 46, 7);
      context.fillStyle = HEAD_TINTS[car.tint];
      context.fillRect(nose - (forward ? 2 : 0), y - 2.5, 2, 5);
      context.fillStyle = '#ff2a2a';
      context.fillRect(tail - (forward ? 0 : 2), y - 2.5, 2, 5);
      if (car.police) {
        const flash = Math.floor(clock * 6 + car.lane) % 2 === 0;
        const mid = (nose + tail) / 2;
        context.fillStyle = flash ? '#ff2a2a' : '#3aa0ff';
        context.fillRect(mid - 3, y - 4, 3, 3);
        context.fillStyle = flash ? '#3aa0ff' : '#ff2a2a';
        context.fillRect(mid, y - 4, 3, 3);
        context.globalAlpha = 0.16;
        context.fillStyle = flash ? '#ff2a2a' : '#3aa0ff';
        context.fillRect(mid - 60, roadTop - 40, 120, ROAD_HEIGHT + 40);
      }
      if (wet) {
        // Wet tarmac smears each light downward.
        context.globalAlpha = 0.28;
        context.fillStyle = HEAD_TINTS[car.tint];
        context.fillRect(nose - 1, y + 3, 2, 12);
        context.fillStyle = '#ff2a2a';
        context.fillRect(tail - 1, y + 3, 2, 10);
      }
    }
    context.globalAlpha = 1;
  }

  const tick = (now: number) => {
    frame = undefined;
    if (disposed) return;
    schedule();
    if (document.hidden || now - last < FRAME_MS) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    syncPolice();
    draw(dt);
  };
  const schedule = () => {
    // Reduced motion keeps the single still frame drawn on resize.
    if (frame === undefined && !disposed && !prefersReducedMotion())
      frame = requestAnimationFrame(tick);
  };

  window.addEventListener('resize', resize, { passive: true });
  resize();
  last = performance.now();
  schedule();

  return () => {
    disposed = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
  };
}
