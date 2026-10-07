import { WEAPONS, EQUIPMENT, weaponState } from './weapons.mjs';
const weaponSlot = (w) => (WEAPONS[w.id].category === 'pistol' ? 'secondary' : 'primary');
export const RULES = {
  freeze: 10,
  round: 115,
  bomb: 40,
  plant: 3.2,
  defuse: 10,
  kit: 5,
  buy: 20,
  win: 16,
  half: 15,
};
export class Match {
  constructor({ team = 'T', spawns, sites, seed = 42 } = {}) {
    this.seed = seed;
    this.time = 0;
    this.round = 0;
    this.scores = { T: 0, CT: 0 };
    this.losses = { T: 0, CT: 0 };
    this.spawns = spawns || {
      T: Array.from({ length: 5 }, (_, i) => ({ x: i * 2, y: 0, z: 0 })),
      CT: Array.from({ length: 5 }, (_, i) => ({ x: i * 2, y: 0, z: 40 })),
    };
    this.sites = sites || [
      { x: 0, y: 0, z: 20 },
      { x: 20, y: 0, z: 20 },
    ];
    this.events = [];
    this.drops = [];
    this.players = Array.from({ length: 10 }, (_, id) => ({
      id,
      name:
        id === 0
          ? 'YOU'
          : ['', 'Atlas', 'Vega', 'Rook', 'Echo', 'Mako', 'Sable', 'Orion', 'Flint', 'Nova'][id],
      team: id < 5 ? team : team === 'T' ? 'CT' : 'T',
      human: id === 0,
      money: 800,
      kills: 0,
      deaths: 0,
      armor: 0,
      helmet: false,
      kit: false,
      grenades: [],
      inventory: [],
      weapon: null,
    }));
    this.newRound(true);
  }
  random() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  emit(type, data = {}) {
    this.events.push({ type, time: this.time, ...data });
  }
  equip(p, id) {
    let w = p.inventory.find((x) => x.id === id);
    if (!w) {
      w = weaponState(id);
      p.inventory.push(w);
    }
    this.switchWeapon(p, w);
    return w;
  }
  switchWeapon(p, weapon) {
    if (!weapon || !p.inventory.includes(weapon)) return false;
    if (p.weapon !== weapon && p.weapon) p.weapon.reloading = 0;
    p.weapon = weapon;
    return true;
  }
  dropWeapon(p) {
    if (!p.alive || p.weapon.id === 'knife' || !['live', 'freeze'].includes(this.phase))
      return false;
    const weapon = p.weapon;
    weapon.reloading = 0;
    this.drops.push({
      position: { ...p.position },
      weapon,
      notBefore: this.time + 0.7,
    });
    p.inventory = p.inventory.filter((w) => w !== weapon);
    p.weapon = p.inventory.find((w) => w.id !== 'knife') || p.inventory[0];
    return true;
  }
  pickupWeapon(p, swap = false, canReach = () => true) {
    if (!p.alive || !['live', 'freeze'].includes(this.phase)) return false;
    const candidates = this.drops
      .filter(
        (drop) =>
          drop.weapon.id !== 'knife' &&
          this.time >= (drop.notBefore || 0) &&
          distance(p.position, drop.position) < 0.9 &&
          Math.abs(p.position.y - drop.position.y) < 0.6 &&
          canReach(drop.position),
      )
      .sort((a, b) => distance(p.position, a.position) - distance(p.position, b.position));
    for (const drop of candidates) {
      const old = p.inventory.find(
        (w) => w.id !== 'knife' && weaponSlot(w) === weaponSlot(drop.weapon),
      );
      if (old && !swap) continue;
      this.drops.splice(this.drops.indexOf(drop), 1);
      if (old) {
        old.reloading = 0;
        p.inventory = p.inventory.filter((w) => w !== old);
        this.drops.push({ position: { ...p.position }, weapon: old, notBefore: this.time + 0.7 });
      }
      drop.weapon.reloading = 0;
      p.inventory.push(drop.weapon);
      this.switchWeapon(p, drop.weapon);
      this.emit('weaponPickup', { player: p.id, weapon: drop.weapon.id });
      return true;
    }
    return false;
  }
  newRound(first = false) {
    this.round++;
    this.phase = 'freeze';
    this.timer = RULES.freeze;
    this.elapsed = 0;
    this.winner = null;
    this.drops = [];
    this.bomb = {
      state: 'carried',
      carrier: null,
      position: null,
      timer: 0,
      progress: 0,
      actor: null,
    };
    const counts = { T: 0, CT: 0 };
    for (const p of this.players) {
      const dead = !p.alive;
      p.position = { ...this.spawns[p.team][counts[p.team]++ % this.spawns[p.team].length] };
      p.health = 100;
      p.alive = true;
      p.vy = 0;
      p.grounded = true;
      p.crouch = false;
      p.cooldown = 0;
      p.path = [];
      p.target = null;
      p.reaction = 0;
      p.lastSeen = null;
      p.navAt = 0;
      p.stuck = 0;
      p.fireHeld = false;
      if (first || dead) {
        p.inventory = [];
        p.armor = 0;
        p.helmet = false;
        p.kit = false;
        p.grenades = [];
        this.equip(p, p.team === 'T' ? 'glock-18' : 'usp-s');
        this.equip(p, 'knife');
        p.weapon = p.inventory[0];
      }
      for (const w of p.inventory) {
        w.ammo = WEAPONS[w.id].mag;
        w.reserve = WEAPONS[w.id].reserve;
        w.reloading = 0;
        w.nextFire = 0;
      }
      if (!p.human) this.botBuy(p);
    }
    this.bomb.carrier = this.players.find((p) => p.team === 'T').id;
    this.emit('round', { round: this.round });
  }
  botBuy(p) {
    if (p.money >= 3700) {
      this.buy(p, p.team === 'T' ? 'ak-47' : 'm4a1_s', true);
      this.buy(p, 'helmet', true);
    } else if (p.money >= 1900) {
      this.buy(p, p.team === 'T' ? 'galil_ar' : 'mp9', true);
      this.buy(p, 'armor', true);
    } else this.buy(p, 'armor', true);
    if (p.team === 'CT') this.buy(p, 'kit', true);
    this.buy(p, 'smoke', true);
    this.buy(p, 'flash', true);
    const primary = p.inventory.find((w) => !['knife', 'pistol'].includes(WEAPONS[w.id].category));
    if (primary) p.weapon = primary;
  }
  canBuy(p) {
    return (
      p.alive &&
      (this.phase === 'freeze' || (this.phase === 'live' && this.elapsed <= RULES.buy)) &&
      this.spawns[p.team].some((s) => distance(s, p.position) < 9)
    );
  }
  buy(p, id, bot = false) {
    if (!bot && !this.canBuy(p)) return false;
    const item = WEAPONS[id] || EQUIPMENT.find((x) => x.id === id);
    if (
      !item ||
      (item.team !== 'both' && item.team !== p.team) ||
      p.money < item.price ||
      id === 'knife'
    )
      return false;
    if (WEAPONS[id]) {
      const slot = WEAPONS[id].category === 'pistol' ? 'secondary' : 'primary';
      const old = p.inventory.find(
        (w) =>
          w.id !== 'knife' &&
          (WEAPONS[w.id].category === 'pistol' ? 'secondary' : 'primary') === slot,
      );
      if (old) {
        this.drops.push({ position: { ...p.position }, weapon: { ...old } });
        p.inventory = p.inventory.filter((w) => w !== old);
      }
      this.equip(p, id);
    } else if (id === 'armor' || id === 'helmet') {
      if (p.armor === 100 && (id === 'armor' || p.helmet)) return false;
      p.armor = 100;
      if (id === 'helmet') p.helmet = true;
    } else if (id === 'kit') {
      if (p.kit) return false;
      p.kit = true;
    } else {
      if (
        p.grenades.length >= 4 ||
        p.grenades.filter((x) => x === id).length >= (id === 'flash' ? 2 : 1)
      )
        return false;
      p.grenades.push(id);
    }
    p.money -= item.price;
    this.emit('buy', { player: p.id, item: id });
    return true;
  }
  reload(p) {
    const w = p.weapon;
    if (!p.alive || w.reloading || w.ammo === WEAPONS[w.id].mag || !w.reserve) return false;
    w.reloading = WEAPONS[w.id].reload;
    this.emit('reload', { player: p.id, weapon: w.id });
    return true;
  }
  fire(p) {
    const w = p.weapon;
    const d = WEAPONS[w.id];
    if (!p.alive || this.phase !== 'live' || w.reloading || w.nextFire > this.time || !w.ammo)
      return false;
    if (d.category !== 'knife') w.ammo--;
    w.nextFire = this.time + 60 / d.rpm;
    p.lastShotAt = this.time;
    w.shots++;
    this.emit('fire', { player: p.id, weapon: w.id });
    return true;
  }
  damage(victim, amount, attacker, head = false) {
    if (!victim.alive || this.phase !== 'live') return;
    if (victim.armor > 0 && (!head || victim.helmet)) {
      const absorbed = Math.min(victim.armor, amount * 0.45);
      victim.armor -= absorbed;
      amount -= absorbed;
    }
    victim.health = Math.max(0, victim.health - amount);
    this.emit('damage', { player: victim.id, amount, head, attacker: attacker?.id });
    if (victim.health > 0) return;
    victim.alive = false;
    victim.deaths++;
    if (attacker && attacker.team !== victim.team) {
      attacker.kills++;
      attacker.money = Math.min(16000, attacker.money + 300);
    }
    this.drops.push({ position: { ...victim.position }, weapon: { ...victim.weapon } });
    if (this.bomb.carrier === victim.id) {
      this.bomb.state = 'dropped';
      this.bomb.position = { ...victim.position };
      this.bomb.carrier = null;
    }
    if (this.bomb.actor === victim.id) {
      this.bomb.progress = 0;
      this.bomb.actor = null;
    }
    this.emit('kill', {
      victim: victim.id,
      attacker: attacker?.id,
      weapon: attacker?.weapon.id,
      head,
    });
  }
  interact(p, dt, held) {
    if (!p.alive || this.phase !== 'live') return;
    const b = this.bomb;
    if (b.state === 'dropped' && p.team === 'T' && distance(p.position, b.position) < 1.8) {
      b.state = 'carried';
      b.carrier = p.id;
      this.emit('pickup', { player: p.id });
    }
    const plant =
      b.state === 'carried' &&
      b.carrier === p.id &&
      this.sites.some((s) => distance(s, p.position) < 4);
    const defuse =
      b.state === 'planted' && p.team === 'CT' && distance(b.position, p.position) < 2.5;
    if (held && (plant || defuse)) {
      if (b.actor !== null && b.actor !== p.id) return;
      b.actor = p.id;
      b.progress += dt;
      const duration = plant ? RULES.plant : p.kit ? RULES.kit : RULES.defuse;
      if (b.progress >= duration) {
        b.progress = 0;
        b.actor = null;
        if (plant) {
          b.state = 'planted';
          b.position = { ...p.position };
          b.carrier = null;
          b.timer = RULES.bomb;
          p.money = Math.min(16000, p.money + 300);
          this.emit('plant', { player: p.id });
        } else {
          b.state = 'defused';
          this.endRound('CT', 'Bomb defused');
        }
      }
    } else if (b.actor === p.id) {
      b.progress = 0;
      b.actor = null;
    }
  }
  endRound(team, reason) {
    if (this.phase !== 'live') return;
    this.phase = 'over';
    this.timer = 6;
    this.winner = team;
    this.reason = reason;
    this.scores[team]++;
    const loser = team === 'T' ? 'CT' : 'T';
    this.losses[team] = 0;
    this.losses[loser]++;
    for (const p of this.players)
      p.money = Math.min(
        16000,
        p.money + (p.team === team ? 3250 : Math.min(3400, 1400 + 500 * (this.losses[loser] - 1))),
      );
    this.emit('roundEnd', { team, reason });
  }
  tick(dt) {
    this.time += dt;
    for (const p of this.players)
      for (const w of p.inventory)
        if (w.reloading > 0) {
          w.reloading -= dt;
          if (w.reloading <= 0) {
            const n = Math.min(WEAPONS[w.id].mag - w.ammo, w.reserve);
            w.ammo += n;
            w.reserve -= n;
            w.reloading = 0;
          }
        }
    if (this.phase === 'match') return;
    this.timer -= dt;
    if (this.phase === 'freeze') {
      if (this.timer <= 0) {
        this.phase = 'live';
        this.timer = RULES.round;
        this.emit('live');
      }
      return;
    }
    if (this.phase === 'over') {
      if (this.timer > 0) return;
      if (Math.max(this.scores.T, this.scores.CT) >= RULES.win || this.round >= 30) {
        this.phase = 'match';
        this.emit('matchEnd');
        return;
      }
      if (this.round === RULES.half) {
        for (const p of this.players) {
          p.team = p.team === 'T' ? 'CT' : 'T';
          p.money = 800;
          p.alive = false;
        }
        [this.scores.T, this.scores.CT] = [this.scores.CT, this.scores.T];
        this.losses = { T: 0, CT: 0 };
      }
      this.newRound();
      return;
    }
    this.elapsed += dt;
    if (this.bomb.state === 'planted') {
      this.bomb.timer -= dt;
      if (this.bomb.timer <= 0) {
        this.bomb.state = 'exploded';
        this.endRound('T', 'Bomb detonated');
        return;
      }
    }
    const ct = this.players.some((p) => p.alive && p.team === 'CT'),
      t = this.players.some((p) => p.alive && p.team === 'T');
    if (!ct) this.endRound('T', 'Counter-Terrorists eliminated');
    else if (!t && this.bomb.state !== 'planted') this.endRound('CT', 'Terrorists eliminated');
    else if (this.timer <= 0 && this.bomb.state !== 'planted') this.endRound('CT', 'Time expired');
  }
}
export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
