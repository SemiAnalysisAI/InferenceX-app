export const SOUND_NAMES = {
  'ak-47': 'ak47',
  'glock-18': 'glock18',
  m4a1_s: 'm4a1',
  m4a4: 'm4a1',
  'usp-s': 'usp',
  desert_eagle: 'deagle',
  ssg_08: 'ssg08',
  sg_553: 'sg556',
  galil_ar: 'galilar',
  'five-seven': 'fiveseven',
  dual_berettas: 'elite',
  'ump-45': 'ump45',
  cz_75: 'cz75a',
  'mac-10': 'mac10',
  'mag-7': 'mag7',
  'sawed-off': 'sawedoff',
  'scar-20': 'scar20',
  'tec-9': 'tec9',
  mp5sd: 'mp5',
  p2000: 'hkp2000',
};
const SPECIAL_FIRE = {
  awp: 'awp/awp1',
  'usp-s': 'usp/usp1',
  mp5sd: 'mp5/mp5_01',
  galil_ar: 'galilar/galil-1',
  'scar-20': 'scar20/scar20_unsil-1',
  m4a4: 'm4a1/m4a1_unsil-1',
  m4a1_s: 'm4a1/m4a1-1',
  revolver: 'revolver/revolver-1_01',
  knife: 'knife/knife_slash1',
};
export function fireSound(id) {
  const name = SOUND_NAMES[id] || id;
  return `weapons/${SPECIAL_FIRE[id] || `${name}/${name}-1`}.wav`;
}
export function resolveSound(paths, fragment) {
  const key = fragment.toLowerCase().replace(/\.wav$/, '');
  return (
    paths.find((p) => p.toLowerCase().endsWith(`${key}.wav`)) ||
    paths.find((p) => p.toLowerCase().includes(key) && p.endsWith('.wav') && !p.includes('distant'))
  );
}
