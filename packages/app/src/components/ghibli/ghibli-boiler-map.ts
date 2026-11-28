/**
 * The sea-railway route map for the campaign: a long painted sea the camera pans along as the
 * train glides between the eight stations. It repaints only while the train is moving.
 */
import {
  SPRITES,
  STILLS,
  drawSprite,
  loadImage,
  ready,
  seeded,
  wash,
  type Images,
  type SpriteName,
} from './ghibli-boiler-render';

export const MAP_W = 1560;
export const MAP_VIEW_W = 480;
export const MAP_H = 260;

const STATION_ICONS: Record<string, SpriteName> = {
  boiler: 'flame',
  river: 'haku',
  bathhouse: 'nofacePeek',
  castle: 'castle',
  forest: 'kodama',
  flood: 'jelly',
  tower: 'heron',
  banquet: 'noface',
};

export function stationX(index: number): number {
  return 120 + index * 188;
}

export function stationY(index: number): number {
  return 150 + Math.sin(index * 1.1) * 22;
}

export interface MapStation {
  name: string;
  medal: number;
  locked: boolean;
}

export class MapPainter {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly images: Images = {};
  private backdrop: HTMLCanvasElement | null = null;
  private backdropWidth = 0;
  private scale = 1;

  constructor(canvas: HTMLCanvasElement, onLoad: () => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    for (const name of new Set(Object.values(STATION_ICONS)))
      this.images[name] = loadImage(SPRITES[name], onLoad);
    this.images.still = loadImage(STILLS.spirited, () => {
      this.backdropWidth = 0;
      onLoad();
    });
  }

  resize(): number {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(((rect.width * MAP_H) / MAP_VIEW_W) * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.backdropWidth = 0;
    }
    this.scale = width / MAP_VIEW_W;
    return MAP_VIEW_W / Math.max(1, rect.width);
  }

  private ensureBackdrop() {
    if (this.backdrop && this.backdropWidth === this.canvas.width) return;
    const canvas = this.backdrop ?? document.createElement('canvas');
    canvas.width = Math.round(MAP_W * this.scale);
    canvas.height = this.canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const random = seeded(7);
    const sky = ctx.createLinearGradient(0, 0, 0, MAP_H);
    sky.addColorStop(0, '#9cc3d6');
    sky.addColorStop(0.42, '#e9d9b8');
    sky.addColorStop(0.46, '#7fb3c4');
    sky.addColorStop(1, '#3f7d97');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    // Dusk deepens along the route, the way the sea railway runs into night.
    const dusk = ctx.createLinearGradient(0, 0, MAP_W, 0);
    dusk.addColorStop(0, 'rgba(0,0,0,0)');
    dusk.addColorStop(1, 'rgba(40, 24, 70, 0.55)');
    ctx.fillStyle = dusk;
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    const still = this.images.still;
    if (ready(still)) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      const height = MAP_H;
      const width = (still.naturalWidth / still.naturalHeight) * height;
      for (let x = 0; x < MAP_W; x += width) ctx.drawImage(still, x, 0, width, height);
      ctx.restore();
    }
    for (let index = 0; index < 60; index++)
      wash(ctx, random() * MAP_W, 20 + random() * 80, 30 + random() * 60, '#fff4dc', 0.12);
    for (let index = 0; index < 90; index++) {
      ctx.strokeStyle = `rgba(230, 245, 250, ${0.15 + random() * 0.2})`;
      ctx.lineWidth = 1;
      const x = random() * MAP_W;
      const y = 125 + random() * 130;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 14 + random() * 20, y);
      ctx.stroke();
    }
    // The submerged track: sleepers and two rails just under the water line.
    ctx.strokeStyle = 'rgba(60, 46, 36, 0.7)';
    ctx.lineWidth = 3;
    for (let x = 20; x < MAP_W - 20; x += 12) {
      const y = this.trackY(x);
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 5);
      ctx.stroke();
    }
    for (const offset of [-3.5, 3.5]) {
      ctx.strokeStyle = 'rgba(210, 200, 190, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let x = 20; x < MAP_W - 20; x += 6) {
        const y = this.trackY(x) + offset;
        if (x === 20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let index = 0; index < 1800; index++) {
      ctx.fillStyle = random() < 0.5 ? 'rgba(255, 250, 235, 0.07)' : 'rgba(20, 30, 40, 0.06)';
      ctx.fillRect(random() * MAP_W, random() * MAP_H, 1.2, 1.2);
    }
    this.backdrop = canvas;
    this.backdropWidth = this.canvas.width;
  }

  trackY(x: number): number {
    const index = (x - 120) / 188;
    return 150 + Math.sin(index * 1.1) * 22;
  }

  cameraFor(trainX: number): number {
    return Math.max(0, Math.min(MAP_W - MAP_VIEW_W, trainX - MAP_VIEW_W / 2));
  }

  draw(trainX: number, stations: MapStation[], selected: number, actLabels: string[]) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.ensureBackdrop();
    const camera = this.cameraFor(trainX);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.backdrop) ctx.drawImage(this.backdrop, -camera * this.scale, 0);
    ctx.setTransform(this.scale, 0, 0, this.scale, -camera * this.scale, 0);

    // Act banners along the top.
    const acts = [
      [0, 2],
      [3, 3],
      [4, 5],
      [6, 7],
    ];
    acts.forEach(([from, to], index) => {
      const x0 = stationX(from) - 70;
      const x1 = stationX(to) + 70;
      ctx.fillStyle = 'rgba(60, 30, 22, 0.55)';
      ctx.beginPath();
      ctx.roundRect(x0 + 6, 12, x1 - x0 - 12, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#fbefd6';
      ctx.font = '600 12px ui-serif, Georgia, serif';
      ctx.textAlign = 'center';
      // The label slides along its banner so it stays readable while the camera pans.
      const left = Math.max(x0 + 6, camera) + 70;
      const right = Math.min(x1 - 6, camera + MAP_VIEW_W) - 70;
      const middle = left <= right ? Math.min(right, Math.max(left, (x0 + x1) / 2)) : (x0 + x1) / 2;
      ctx.fillText(actLabels[index] ?? '', middle, 27);
    });

    stations.forEach((station, index) => {
      const x = stationX(index);
      const y = stationY(index);
      const active = index === selected;
      // Platform and signpost.
      ctx.fillStyle = station.locked ? 'rgba(80, 70, 70, 0.7)' : '#7a5434';
      ctx.fillRect(x - 34, y + 8, 68, 7);
      ctx.fillStyle = '#4a3020';
      ctx.fillRect(x - 2, y - 46, 4, 54);
      ctx.fillStyle = station.locked ? '#9a9088' : active ? '#fff3d0' : '#f1e2c0';
      ctx.strokeStyle = active ? '#c8452f' : '#4a3020';
      ctx.lineWidth = active ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.roundRect(x - 54, y - 74, 108, 30, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3a2418';
      ctx.font = '600 11px ui-serif, Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${index + 1}. ${station.name}`, x, y - 55, 100);
      const icon = this.images[STATION_ICONS[Object.keys(STATION_ICONS)[index]]];
      drawSprite(
        ctx,
        icon,
        x + 32,
        y - 12,
        index === 1 ? 54 : index === 3 ? 40 : 30,
        false,
        station.locked ? 0.35 : 1,
      );
      if (station.medal > 0) {
        const colour = ['', '#b87333', '#c0c4cc', '#e8b830'][station.medal];
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x - 34, y - 14, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#5a3a20';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      if (station.locked) {
        ctx.fillStyle = 'rgba(40, 30, 30, 0.8)';
        ctx.fillRect(x - 40, y - 20, 12, 9);
        ctx.strokeStyle = 'rgba(40, 30, 30, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x - 34, y - 21, 4, Math.PI, 0);
        ctx.stroke();
      }
    });

    // The train: a little two-window tram car riding the rails.
    const y = this.trackY(trainX);
    ctx.save();
    ctx.translate(trainX, y - 14);
    ctx.fillStyle = '#7a1f1a';
    ctx.beginPath();
    ctx.roundRect(-30, -14, 60, 24, 5);
    ctx.fill();
    ctx.fillStyle = '#e9d2a2';
    ctx.fillRect(-30, -2, 60, 3);
    ctx.fillStyle = '#ffe7a8';
    for (const wx of [-22, -8, 6]) ctx.fillRect(wx, -10, 10, 7);
    ctx.fillStyle = '#2a1a14';
    ctx.fillRect(-26, 10, 52, 3);
    ctx.restore();
    wash(ctx, trainX + 30, y - 12, 18, '#ffe7a8', 0.6);
  }
}
