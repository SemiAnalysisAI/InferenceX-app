export function shouldHideArms(name, team) {
  const ct = name.includes('ct_arms');
  const t = !ct && name.includes('t_arms');
  return (team === 'T' && ct) || (team === 'CT' && t);
}
