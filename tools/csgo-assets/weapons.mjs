import { WEAPON_REFERENCE } from './weapon-reference.mjs';
// Reload times and categorical loadout rules remain prototype values.
// All firearm numeric attributes apart from reload timing come from the pinned schema.
const rows = [
  ['glock-18', 2.3, 'pistol', 'T'],
  ['p2000', 2.2, 'pistol', 'CT'],
  ['usp-s', 2.2, 'pistol', 'CT'],
  ['dual_berettas', 3.8, 'pistol', 'both'],
  ['p250', 2.2, 'pistol', 'both'],
  ['five-seven', 2.2, 'pistol', 'CT'],
  ['tec-9', 2.5, 'pistol', 'T'],
  ['cz_75', 2.7, 'pistol', 'both'],
  ['desert_eagle', 2.2, 'pistol', 'both'],
  ['revolver', 2.3, 'pistol', 'both'],
  ['mac-10', 2.6, 'smg', 'T'],
  ['mp9', 2.1, 'smg', 'CT'],
  ['mp7', 3.1, 'smg', 'both'],
  ['mp5sd', 2.9, 'smg', 'both'],
  ['ump-45', 3.5, 'smg', 'both'],
  ['p90', 3.4, 'smg', 'both'],
  ['bizon', 2.4, 'smg', 'both'],
  ['nova', 3.8, 'shotgun', 'both'],
  ['xm1014', 3.5, 'shotgun', 'both'],
  ['mag-7', 2.4, 'shotgun', 'CT'],
  ['sawed-off', 3.2, 'shotgun', 'T'],
  ['galil_ar', 3, 'rifle', 'T'],
  ['famas', 3.3, 'rifle', 'CT'],
  ['ak-47', 2.4, 'rifle', 'T'],
  ['m4a4', 3.1, 'rifle', 'CT'],
  ['m4a1_s', 3.1, 'rifle', 'CT'],
  ['sg_553', 2.8, 'rifle', 'T'],
  ['aug', 3.8, 'rifle', 'CT'],
  ['ssg_08', 3.7, 'sniper', 'both'],
  ['awp', 3.7, 'sniper', 'both'],
  ['g3sg1', 4.7, 'sniper', 'T'],
  ['scar-20', 3.1, 'sniper', 'CT'],
  ['m249', 5.7, 'heavy', 'both'],
  ['negev', 5.7, 'heavy', 'both'],
  ['knife', 0, 'knife', 'both'],
];
export const WEAPONS = Object.fromEntries(
  rows.map(([id, reload, category, team]) => [
    id,
    {
      id,
      name: id.replaceAll('_', ' ').toUpperCase(),
      reload,
      category,
      team,
      automatic: false,
      scoped: ['sniper'].includes(category) || ['aug', 'sg_553'].includes(id),
    },
  ]),
);
for (const [id, reference] of Object.entries(WEAPON_REFERENCE)) {
  const a = reference.attributes;
  Object.assign(WEAPONS[id], {
    price: a['in game price'],
    mag: a['primary clip size'],
    reserve: a['primary reserve ammo max'],
    damage: a.damage,
    rpm: 60 / a.cycletime,
    automatic: Boolean(a['is full auto']),
    armorRatio: a['armor ratio'],
    headMultiplier: a['headshot multiplier'],
    range: a.range,
    rangeModifier: a['range modifier'],
    pellets: a.bullets,
    killAward: a['kill award'],
    maxSpeed: a['max player speed'],
    scopedSpeed: a['max player speed alt'],
    spread: a.spread / 1000,
    scopedSpread: a['spread alt'] / 1000,
    accuracy: Object.fromEntries(
      ['stand', 'crouch', 'move', 'jump', 'fire'].map((key) => [
        key,
        a[`inaccuracy ${key}`] / 1000,
      ]),
    ),
    scopedAccuracy: Object.fromEntries(
      ['stand', 'crouch', 'move', 'jump', 'fire'].map((key) => [
        key,
        a[`inaccuracy ${key} alt`] / 1000,
      ]),
    ),
    recovery: a['recovery time stand'],
    crouchRecovery: a['recovery time crouch'],
    recoilSeed: a['recoil seed'] || 0,
    recoilMagnitude: a['recoil magnitude'],
    zoomLevels: a['zoom levels'],
    zoomFov: [a['zoom fov 1'], a['zoom fov 2']],
  });
}
Object.assign(WEAPONS.knife, {
  price: 0,
  mag: 1,
  reserve: 0,
  damage: 40,
  rpm: 100,
  maxSpeed: 250,
  scopedSpeed: 250,
  killAward: 1500,
});
export const EQUIPMENT = [
  { id: 'armor', name: 'Kevlar', price: 650, team: 'both' },
  { id: 'helmet', name: 'Kevlar + helmet', price: 1000, team: 'both' },
  { id: 'kit', name: 'Defuse kit', price: 400, team: 'CT' },
  { id: 'he', name: 'HE grenade', price: 300, team: 'both' },
  { id: 'flash', name: 'Flashbang', price: 200, team: 'both' },
  { id: 'smoke', name: 'Smoke grenade', price: 300, team: 'both' },
  { id: 'fire', name: 'Molotov / incendiary', price: 400, team: 'both' },
  { id: 'decoy', name: 'Decoy', price: 50, team: 'both' },
];
export function weaponState(id) {
  const w = WEAPONS[id];
  return {
    id,
    ammo: w.mag,
    reserve: w.reserve,
    reloading: 0,
    nextFire: 0,
    shots: 0,
    accuracyPenalty: 0,
    recoilIndex: 0,
    lastShot: -Infinity,
  };
}
