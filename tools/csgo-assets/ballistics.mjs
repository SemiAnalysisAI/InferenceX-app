export const SOURCE_UNIT = 0.01905;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function bulletDamage(weapon, distance, hitGroup, armor = 0, helmet = false) {
  if (!['head', 'chest', 'stomach', 'leg'].includes(hitGroup)) throw new Error('Invalid hitgroup');
  const multiplier =
    hitGroup === 'head'
      ? weapon.headMultiplier
      : hitGroup === 'stomach'
        ? 1.25
        : hitGroup === 'leg'
          ? 0.75
          : 1;
  const raw =
    weapon.damage *
    multiplier *
    weapon.rangeModifier ** (Math.max(0, distance) / SOURCE_UNIT / 500);
  const protectedHit = armor > 0 && hitGroup !== 'leg' && (hitGroup !== 'head' || helmet);
  if (!protectedHit) return { health: raw, armor: 0 };
  const reduced = raw * clamp(weapon.armorRatio / 2, 0, 1);
  const absorbed = Math.min(armor, (raw - reduced) / 2);
  return { health: raw - absorbed * 2, armor: absorbed };
}

export function maxMoveSpeed(weapon, { scoped = false, crouch = false, walking = false } = {}) {
  return (
    (scoped ? weapon.scopedSpeed : weapon.maxSpeed) *
    SOURCE_UNIT *
    (crouch ? 0.34 : walking ? 0.52 : 1)
  );
}

export function shotAccuracy(weapon, state, player) {
  if (weapon.category === 'knife') return { spread: 0, inaccuracy: 0 };
  const a = player.scoped ? weapon.scopedAccuracy : weapon.accuracy;
  const speed = maxMoveSpeed(weapon, { scoped: player.scoped });
  // Interpolation and recovery are authored approximations; schema values are exact.
  const movement = clamp(((player.speed || 0) / speed - 0.34) / 0.61, 0, 1);
  return {
    spread: player.scoped ? weapon.scopedSpread : weapon.spread,
    inaccuracy:
      (player.crouch ? a.crouch : a.stand) +
      a.move * movement +
      (player.grounded === false ? a.jump : 0) +
      (state.accuracyPenalty || 0),
  };
}

export function recoverWeapon(state, weapon, dt, time, crouch) {
  if (!weapon.accuracy) return;
  const recovery = Math.max(0.01, crouch ? weapon.crouchRecovery : weapon.recovery);
  state.accuracyPenalty *= Math.exp((-Math.LN10 * dt) / recovery);
  if (time - state.lastShot > Math.max(0.25, 60 / weapon.rpm)) {
    state.recoilIndex = Math.max(0, state.recoilIndex - dt * 5);
  }
}

export function recoilKick(weapon, index) {
  if (!weapon.recoilMagnitude) return { pitch: 0, yaw: 0 };
  // Stable, weapon-specific approximation. This is not Valve's RNG/spray table.
  const seed = Math.imul(weapon.recoilSeed + Math.floor(index) * 7919, 1664525) >>> 0;
  const horizontal = (seed / 4294967296 - 0.5) * 2;
  const strength = (weapon.recoilMagnitude * 0.04 * Math.PI) / 180;
  return { pitch: strength, yaw: horizontal * strength * Math.min(1, index / 5) };
}

export function spreadOffset(accuracy, random) {
  const radiusA = random() * accuracy.inaccuracy,
    angleA = random() * Math.PI * 2;
  const radiusB = random() * accuracy.spread,
    angleB = random() * Math.PI * 2;
  return {
    x: Math.cos(angleA) * radiusA + Math.cos(angleB) * radiusB,
    y: Math.sin(angleA) * radiusA + Math.sin(angleB) * radiusB,
  };
}

export function verticalFov(horizontalFourThree) {
  return (Math.atan(Math.tan((horizontalFourThree * Math.PI) / 360) * 0.75) * 360) / Math.PI;
}
