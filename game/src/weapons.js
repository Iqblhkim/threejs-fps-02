// Loadout state machine: weapons, grenades, armour, reload and spread.
// Pure logic (no three.js) so the unit tests can drive it in Node.
import { WEAPONS, GRENADES, ARMOR_PRICE } from './config.js';

export function makeWeapon(id) {
  const def = WEAPONS[id];
  return { def, mag: def.mag, reserve: def.reserve, cooldown: 0, reloadUntil: 0, bloom: 0 };
}

export function createLoadout() {
  return {
    slots: { 1: null, 2: makeWeapon('p2000') },
    current: 2,
    frag: 0,
    smoke: 0,
    armor: 0,
  };
}

export function currentWeapon(loadout) {
  if (loadout.current === 4) return loadout.frag > 0 ? { grenade: GRENADES.frag } : null;
  if (loadout.current === 5) return loadout.smoke > 0 ? { grenade: GRENADES.smoke } : null;
  return loadout.slots[loadout.current] || null;
}

export function currentName(loadout) {
  const w = currentWeapon(loadout);
  if (!w) return '—';
  return w.grenade ? w.grenade.name : w.def.name;
}

// Switch to a numbered slot. Grenade slots need stock; primary needs a gun.
export function switchTo(loadout, slot, now) {
  if (slot === 1 && !loadout.slots[1]) return false;
  if (slot === 4 && loadout.frag <= 0) return false;
  if (slot === 5 && loadout.smoke <= 0) return false;
  if (slot !== 1 && slot !== 2 && slot !== 4 && slot !== 5) return false;
  if (loadout.current === slot) return false;
  const weapon = loadout.slots[loadout.current];
  if (weapon) weapon.reloadUntil = 0; // switching cancels a reload
  loadout.current = slot;
  return true;
}

export function canFire(loadout, now) {
  const weapon = currentWeapon(loadout);
  if (!weapon || weapon.grenade) return false;
  return weapon.mag > 0 && weapon.cooldown <= 0 && weapon.reloadUntil <= now;
}

// Fire one trigger pull. Returns the weapon definition (and pellet count)
// or null when nothing fired. Auto weapons call this every frame while held.
export function fire(loadout, now) {
  const weapon = currentWeapon(loadout);
  if (!weapon || weapon.grenade) return null;
  if (weapon.mag <= 0 || weapon.cooldown > 0 || weapon.reloadUntil > now) return null;
  weapon.mag -= 1;
  weapon.cooldown = weapon.def.rate;
  weapon.bloom = Math.min(0.05, weapon.bloom + weapon.def.bloom);
  return weapon.def;
}

export function startReload(loadout, now) {
  const weapon = currentWeapon(loadout);
  if (!weapon || weapon.grenade) return false;
  if (weapon.reloadUntil > now || weapon.mag >= weapon.def.mag || weapon.reserve <= 0) return false;
  weapon.reloadUntil = now + weapon.def.reload;
  return true;
}

// Advance cooldowns and finish reloads. `now` is game time in seconds.
export function updateLoadout(loadout, dt, now) {
  for (const slot of [1, 2]) {
    const weapon = loadout.slots[slot];
    if (!weapon) continue;
    weapon.cooldown = Math.max(0, weapon.cooldown - dt);
    weapon.bloom = Math.max(0, weapon.bloom - dt * 0.03);
    if (weapon.reloadUntil > 0 && now >= weapon.reloadUntil) {
      const needed = weapon.def.mag - weapon.mag;
      const taken = Math.min(needed, weapon.reserve);
      weapon.mag += taken;
      weapon.reserve -= taken;
      weapon.reloadUntil = 0;
    }
  }
}

// Current spread in radians: base + movement + bloom, crouching and
// scoping tighten it, sprinting widens it.
export function spreadOf(loadout, moving, crouched, scoped, sprinting) {
  const weapon = currentWeapon(loadout);
  if (!weapon || weapon.grenade) return 0.02;
  const def = weapon.def;
  let spread = def.spread + weapon.bloom;
  if (moving) spread += def.moveSpread;
  if (sprinting) spread += 0.02;
  if (crouched) spread *= 0.55;
  if (scoped && def.zoom > 0) spread *= 0.25;
  return spread;
}

// Buy an item. Returns { ok, cost } and mutates the loadout on success.
// Weapon ids replace the primary slot; 'frag'/'smoke' add stock; 'armor'
// fills the armour meter.
export function buy(loadout, itemId, money) {
  if (itemId === 'frag' || itemId === 'smoke') {
    const def = GRENADES[itemId];
    if (money < def.price) return { ok: false, cost: 0 };
    loadout[itemId] += 1;
    return { ok: true, cost: def.price };
  }
  if (itemId === 'armor') {
    if (loadout.armor >= 100 || money < ARMOR_PRICE) return { ok: false, cost: 0 };
    loadout.armor = 100;
    return { ok: true, cost: ARMOR_PRICE };
  }
  const def = WEAPONS[itemId];
  if (!def) return { ok: false, cost: 0 };
  if (money < def.price) return { ok: false, cost: 0 };
  if (def.slot === 1) {
    loadout.slots[1] = makeWeapon(itemId);
    loadout.current = 1;
  } else {
    loadout.slots[2] = makeWeapon(itemId);
    loadout.current = 2;
  }
  return { ok: true, cost: def.price };
}
