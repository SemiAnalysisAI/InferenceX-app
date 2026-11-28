/** Road geometry is shared by the painter, the buses and the snowball hit tests. */
type C = CanvasRenderingContext2D;
export interface Obstacle {
  id: number;
  lane: number;
  x: number;
  age: number;
  kind: number;
}
export interface Snowball {
  x: number;
  y: number;
  age: number;
  lane: number;
}
const base = [0.3, 0.49, 0.68, 0.87];
export function road(zone: number, lane: number, t: number) {
  const y = base[lane],
    s = Math.sin(Math.PI * t),
    bend = Math.sin(2 * Math.PI * t);
  switch (zone) {
    case 0: {
      return y - 0.09 * s + 0.035 * bend;
    }
    case 1: {
      return y + 0.054 * Math.tanh(8 * (t - 0.34)) - 0.04 * Math.tanh(9 * (t - 0.75));
    }
    case 2: {
      return y + (lane < 2 ? -1 : 1) * 0.13 * s + 0.045 * bend;
    }
    case 3: {
      return y + ((lane < 2 ? 0.36 : 0.76) - y) * s ** 4 - 0.04 * bend;
    }
    default: {
      return y - (0.065 + lane * 0.008) * Math.sin(t * Math.PI * 3) - 0.025 * s;
    }
  }
}
export function target(zone: number, o: Obstacle) {
  const drift = o.kind === 4 ? Math.sin(o.age * 1.85 + o.id) * 0.045 : 0;
  return { x: 0.06 + 0.82 * o.x, y: road(zone, o.lane, o.x) + drift };
}
const board = ['#e4efdc', '#e8dcc3', '#b6dcdc', '#d9e2cc', '#dfb9a5'];
const verge = ['#a6b8a2', '#af9276', '#71a5a4', '#8ea180', '#bb8371'];
const pavement = ['#e9eaD9', '#e2dac9', '#d8eeea', '#e4e2cc', '#edd1ae'];
const dark = '#32483f';
function poly(c: C, points: number[][], fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}
export function paintRoads(
  c: C,
  zone: number,
  w: number,
  h: number,
  gateRed: boolean,
  clock: number,
  reduce: boolean,
) {
  c.fillStyle = board[zone];
  c.fillRect(0, h * 0.19, w, h * 0.81);
  if (zone === 2 || zone === 4) {
    c.fillStyle = zone === 2 ? '#81bfc6' : '#63a6aa';
    c.beginPath();
    c.ellipse(w * 0.48, h * 0.59, w * 0.35, h * 0.23, -0.04, 0, 7);
    c.fill();
    for (let i = 0; i < 9; i++) {
      c.fillStyle = zone === 2 ? '#daefde' : '#a7ddd2';
      const x = w * (0.22 + (i % 4) * 0.17),
        y = h * (0.5 + (i % 3) * 0.09);
      poly(
        c,
        [
          [x, y],
          [x + 18, y - 3],
          [x + 38, y - 1],
          [x + 9, y + 2],
        ],
        c.fillStyle,
      );
    }
  }
  if (zone === 1) {
    c.fillStyle = '#9f927c';
    c.fillRect(w * 0.46, h * 0.19, w * 0.1, h * 0.81);
    for (let j = 0; j < 13; j++) {
      c.fillStyle = '#fcf0ce';
      c.fillRect(w * 0.47, h * (0.21 + j * 0.06), w * 0.08, 4);
    }
  }
  if (zone === 3) {
    c.fillStyle = '#b29870';
    c.fillRect(w * 0.39, h * 0.41, w * 0.22, h * 0.18);
    c.strokeStyle = '#fff1cd';
    c.lineWidth = 1.5;
    c.strokeRect(w * 0.4, h * 0.42, w * 0.2, h * 0.16);
    c.beginPath();
    c.arc(w * 0.5, h * 0.5, 8, 0, 7);
    c.stroke();
  }
  if (zone === 4) {
    poly(
      c,
      [
        [w * 0.02, h * 0.23],
        [w * 0.23, h * 0.21],
        [w * 0.39, h * 0.5],
        [w * 0.28, h * 0.54],
        [w * 0.17, h * 0.41],
        [0, h * 0.45],
      ],
      '#986650',
    );
    c.fillStyle = '#523e3c';
    c.fillRect(w * 0.2, h * 0.34, w * 0.14, 4);
    c.fillRect(w * 0.24, h * 0.34, 4, 14);
  }
  for (let lane = 0; lane < 4; lane++) {
    const trace = () => {
      c.beginPath();
      for (let i = 0; i <= 48; i++) {
        const t = i / 48,
          x = w * (0.06 + 0.82 * t),
          y = h * road(zone, lane, t);
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
    };
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = verge[zone];
    c.lineWidth = h * 0.092;
    trace();
    c.stroke();
    c.strokeStyle = pavement[zone];
    c.lineWidth = h * 0.081;
    trace();
    c.stroke();
    c.strokeStyle = zone === 2 ? '#86aaa8' : '#b49e79';
    c.lineWidth = 1.4;
    c.setLineDash([5, 7]);
    trace();
    c.stroke();
    c.setLineDash([]);
    for (const x of [0.47, 0.76]) {
      const y = h * road(zone, lane, x);
      c.fillStyle = zone === 2 ? '#78aab3' : '#718d77';
      c.fillRect(w * (0.06 + 0.82 * x), y - 4, 2, 8);
    }
    if (zone === 1) {
      const y = h * road(zone, lane, 0.56);
      c.fillStyle = '#3a473e';
      c.fillRect(w * 0.51 - 5, y - 15, 10, 15);
      c.fillStyle = gateRed ? '#e86b4c' : '#abcf7f';
      c.beginPath();
      c.arc(w * 0.51, y - 9, 3, 0, 7);
      c.fill();
    }
  }
  if (zone === 2) {
    c.strokeStyle = '#f8ffff';
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const x = w * (0.31 + i * 0.105),
        y = h * (0.32 + (i % 2) * 0.33);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 9, y + 6);
      c.lineTo(x + 4, y + 10);
      c.lineTo(x + 15, y + 13);
      c.stroke();
    }
  }
  if (zone === 3) {
    for (const y of [0.36, 0.76]) {
      c.save();
      c.translate(w * 0.47, h * y - 10);
      c.fillStyle = '#f8d174';
      c.strokeStyle = dark;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-7, -7);
      c.lineTo(7, -7);
      c.lineTo(0, 5);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    }
  }
  if (zone === 4) {
    const pulse = reduce ? 0 : Math.sin(clock * 3) * 2;
    c.strokeStyle = '#e8f7e6';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(w * 0.38, h * 0.55, 12 + pulse, 4, 0, 0, 7);
    c.stroke();
  }
}
export function paintObstacle(c: C, x: number, y: number, kind: number, selected: boolean) {
  c.save();
  c.translate(x, y);
  c.strokeStyle = '#fff8dd';
  c.lineWidth = 2;
  c.setLineDash([3, 3]);
  c.beginPath();
  c.arc(0, 0, 15, 0, 7);
  c.stroke();
  c.setLineDash([]);
  if (kind === 2) {
    poly(
      c,
      [
        [-12, 6],
        [-5, -6],
        [0, -3],
        [6, -11],
        [12, 6],
      ],
      '#438fa4',
    );
    poly(
      c,
      [
        [-8, 3],
        [-5, -4],
        [-1, -1],
        [6, -9],
        [4, -1],
      ],
      '#ebfffc',
    );
  } else if (kind === 4) {
    c.fillStyle = '#693f62';
    c.beginPath();
    c.arc(-3, 4, 5, 0, 7);
    c.fill();
    c.fillRect(0, -11, 3, 16);
    poly(
      c,
      [
        [2, -11],
        [12, -7],
        [10, -3],
        [2, -6],
      ],
      '#e5af40',
    );
  } else if (kind === 5) {
    poly(
      c,
      [
        [-13, 4],
        [-10, -8],
        [-3, -2],
        [1, -12],
        [5, -3],
        [12, -8],
        [11, 4],
        [0, 9],
      ],
      '#3995a2',
    );
  } else {
    c.fillStyle = '#4c5549';
    c.fillRect(-9, 2, 3, 8);
    c.fillRect(6, 2, 3, 8);
    c.fillStyle = kind === 3 ? '#d9ae33' : '#be6648';
    c.fillRect(-13, -6, 26, 11);
    for (let i = 0; i < 3; i++) {
      poly(
        c,
        [
          [-11 + i * 8, -5],
          [-6 + i * 8, -5],
          [-10 + i * 8, 4],
          [-15 + i * 8, 4],
        ],
        '#fff0bf',
      );
    }
  }
  if (selected) {
    c.strokeStyle = dark;
    c.lineWidth = 1.5;
    c.strokeRect(-18, -18, 36, 36);
  }
  c.restore();
}
