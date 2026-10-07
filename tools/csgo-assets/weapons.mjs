// Prototype tuning, not validated against a specific CS:GO build.
// name, price, magazine, reserve, damage, RPM, reload seconds, category, team.
const rows = [
  ['glock-18', 200, 20, 120, 30, 400, 2.3, 'pistol', 'T'],
  ['p2000', 200, 13, 52, 35, 352, 2.2, 'pistol', 'CT'],
  ['usp-s', 200, 12, 24, 35, 352, 2.2, 'pistol', 'CT'],
  ['dual_berettas', 300, 30, 120, 38, 500, 3.8, 'pistol', 'both'],
  ['p250', 300, 13, 26, 38, 400, 2.2, 'pistol', 'both'],
  ['five-seven', 500, 20, 100, 32, 400, 2.2, 'pistol', 'CT'],
  ['tec-9', 500, 18, 90, 33, 500, 2.5, 'pistol', 'T'],
  ['cz_75', 500, 12, 12, 31, 600, 2.7, 'pistol', 'both'],
  ['desert_eagle', 700, 7, 35, 53, 267, 2.2, 'pistol', 'both'],
  ['revolver', 600, 8, 8, 86, 150, 2.3, 'pistol', 'both'],
  ['mac-10', 1050, 30, 100, 29, 800, 2.6, 'smg', 'T'],
  ['mp9', 1250, 30, 120, 26, 857, 2.1, 'smg', 'CT'],
  ['mp7', 1500, 30, 120, 29, 750, 3.1, 'smg', 'both'],
  ['mp5sd', 1500, 30, 120, 27, 750, 2.9, 'smg', 'both'],
  ['ump-45', 1200, 25, 100, 35, 667, 3.5, 'smg', 'both'],
  ['p90', 2350, 50, 100, 26, 857, 3.4, 'smg', 'both'],
  ['bizon', 1400, 64, 120, 27, 750, 2.4, 'smg', 'both'],
  ['nova', 1050, 8, 32, 26, 68, 3.8, 'shotgun', 'both'],
  ['xm1014', 2000, 7, 32, 20, 171, 3.5, 'shotgun', 'both'],
  ['mag-7', 1300, 5, 32, 30, 71, 2.4, 'shotgun', 'CT'],
  ['sawed-off', 1100, 7, 32, 32, 71, 3.2, 'shotgun', 'T'],
  ['galil_ar', 1800, 35, 90, 30, 667, 3, 'rifle', 'T'],
  ['famas', 2050, 25, 90, 30, 667, 3.3, 'rifle', 'CT'],
  ['ak-47', 2700, 30, 90, 36, 600, 2.4, 'rifle', 'T'],
  ['m4a4', 3100, 30, 90, 33, 667, 3.1, 'rifle', 'CT'],
  ['m4a1_s', 2900, 20, 80, 38, 600, 3.1, 'rifle', 'CT'],
  ['sg_553', 3000, 30, 90, 30, 545, 2.8, 'rifle', 'T'],
  ['aug', 3300, 30, 90, 28, 600, 3.8, 'rifle', 'CT'],
  ['ssg_08', 1700, 10, 90, 88, 48, 3.7, 'sniper', 'both'],
  ['awp', 4750, 5, 30, 115, 41, 3.7, 'sniper', 'both'],
  ['g3sg1', 5000, 20, 90, 80, 240, 4.7, 'sniper', 'T'],
  ['scar-20', 5000, 20, 90, 80, 240, 3.1, 'sniper', 'CT'],
  ['m249', 5200, 100, 200, 32, 750, 5.7, 'heavy', 'both'],
  ['negev', 1700, 150, 300, 35, 800, 5.7, 'heavy', 'both'],
  ['knife', 0, 1, 0, 40, 100, 0, 'knife', 'both'],
];
export const WEAPONS = Object.fromEntries(
  rows.map(([id, price, mag, reserve, damage, rpm, reload, category, team]) => [
    id,
    {
      id,
      name: id.replaceAll('_', ' ').toUpperCase(),
      price,
      mag,
      reserve,
      damage,
      rpm,
      reload,
      category,
      team,
      automatic:
        !['pistol', 'sniper', 'knife'].includes(category) ||
        ['cz_75', 'g3sg1', 'scar-20'].includes(id),
      scoped: ['sniper'].includes(category) || ['aug', 'sg_553'].includes(id),
    },
  ]),
);
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
  return { id, ammo: w.mag, reserve: w.reserve, reloading: 0, nextFire: 0, shots: 0 };
}
