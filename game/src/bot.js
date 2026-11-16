// Bot AI. One brain per bot: a role for the round (rush a lane, hold a
// site, roam mid), a waypoint path from the nav graph, sight and hearing,
// burst fire with a reaction delay, and the bomb jobs (plant / defuse /
// pick up). Bots use the same actors, weapons and combat as the player.
import * as THREE from 'three';
import { BOT, ARMOR_PRICE } from './config.js';
import { MAP, findPath, nearestWaypoint, inSite } from './map.js';
import { range, chance } from './rng.js';
import { createLoadout, currentWeapon, fire, startReload, updateLoadout, buy } from './weapons.js';

const tmpEye = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpChest = new THREE.Vector3();

const ATTACK_PLANS = {
  'rush-a': { site: 'A', path: [1, 2, 3, 4, 5] },
  'rush-a2': { site: 'A', path: [1, 2, 3, 4, 5] },
  'rush-b': { site: 'B', path: [6, 7, 8, 9, 10] },
  mid: { site: null, path: [11, 12, 13, 14] },
};
const DEFEND_SPOTS = {
  'hold-a': 17, 'hold-a2': 18, 'hold-b': 19, 'hold-b2': 20, roam: 21,
};

export class Bot {
  constructor(actor, role, random) {
    this.actor = actor;
    this.role = role;
    this.random = random;
    this.loadout = createLoadout();
    this.state = 'hold';
    this.path = [];
    this.destination = -1;
    this.target = null;
    this.lastKnown = new THREE.Vector3();
    this.lastSeen = -99;
    this.reactionUntil = 0;
    this.burstLeft = 0;
    this.burstPauseUntil = 0;
    this.perceiveAt = random() * 0.12;
    this.holdUntil = 0;
    this.scanPhase = random() * Math.PI * 2;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.hasGrenade = false;
    this.grenadeThrown = false;
    this.hasSmoke = false;
    this.smokeThrown = false;
    this.strafeDir = 1;
    this.strafeUntil = 0;
    this.investigateUntil = 0;
  }

  // New round: buy a gun with the bot's money, then armour and grenades
  // with what is left, and take the role's plan. Returns the money spent
  // so the match can deduct it.
  assignRound(money, time) {
    this.loadout = createLoadout();
    let spent = 0;
    if (money >= 2700 && chance(this.random, 0.7)) spent += buy(this.loadout, 'vk47', money).cost;
    else if (money >= 1500 && chance(this.random, 0.7)) spent += buy(this.loadout, 'viper', money).cost;
    // Kevlar after the gun: armour absorbs half of all damage (actor.js).
    if (money - spent >= ARMOR_PRICE && chance(this.random, BOT.armorChance)) {
      spent += buy(this.loadout, 'armor', money - spent).cost;
    }
    this.hasGrenade = money - spent >= 300 && chance(this.random, BOT.grenadeChance);
    if (this.hasGrenade) spent += buy(this.loadout, 'frag', money - spent).cost;
    // A smoke for the site push: it blocks defender sight (combat.js).
    this.hasSmoke = money - spent >= 300 && chance(this.random, BOT.smokeChance);
    if (this.hasSmoke) spent += buy(this.loadout, 'smoke', money - spent).cost;
    this.grenadeThrown = false;
    this.smokeThrown = false;
    this.target = null;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.burstLeft = 0;
    if (this.actor.team === 'sable') {
      const plan = ATTACK_PLANS[this.role] || ATTACK_PLANS.mid;
      this.path = plan.path.slice();
      this.destination = plan.path[plan.path.length - 1];
      this.state = 'move';
    } else {
      const spot = DEFEND_SPOTS[this.role] ?? 21;
      this.destination = spot;
      this.path = [spot];
      this.state = 'move';
      this.holdUntil = 0;
    }
    return spent;
  }

  eyePosition() {
    return this.actor.eyePosition(tmpEye);
  }

  // Nearest visible enemy, or null. Staggered so nine bots do not all
  // raycast on the same step.
  perceive(ctx) {
    const now = ctx.time;
    if (now < this.perceiveAt) return;
    this.perceiveAt = now + 0.12;
    const eye = this.eyePosition();
    let best = null;
    let bestDistance = Infinity;
    for (const other of ctx.actors) {
      if (other === this.actor || !other.alive || other.team === this.actor.team) continue;
      tmpTarget.copy(other.pos);
      tmpTarget.y += 1.2;
      const dx = tmpTarget.x - eye.x;
      const dy = tmpTarget.y - eye.y;
      const dz = tmpTarget.z - eye.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance > BOT.viewDistance || distance < bestDistance) continue;
      // Frontal cone: the bot must be roughly facing the enemy.
      tmpDir.set(-Math.sin(this.actor.yaw), 0, -Math.cos(this.actor.yaw));
      const facing = (dx * tmpDir.x + dz * tmpDir.z) / (distance || 1);
      if (facing < BOT.fovCos) continue;
      if (!ctx.combat.hasLineOfSight(eye, tmpTarget)) continue;
      best = other;
      bestDistance = distance;
    }
    if (best) {
      if (this.target !== best) this.reactionUntil = now + range(this.random, BOT.reactionMin, BOT.reactionMax);
      this.target = best;
      this.lastKnown.copy(best.pos);
      this.lastSeen = now;
    }
  }

  hear(ctx) {
    if (this.state === 'engage' || this.state === 'plant' || this.state === 'defuse') return;
    for (const sound of ctx.sounds) {
      if (ctx.time - sound.time > 1.0) continue;
      const dx = sound.x - this.actor.pos.x;
      const dz = sound.z - this.actor.pos.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > BOT.hearRadius * BOT.hearRadius) continue;
      // Defenders hold their site unless the sound is close by; attackers
      // investigate anything they hear.
      if (this.actor.team === 'vulture' && distanceSq > 14 * 14) continue;
      const node = nearestWaypoint(sound.x, sound.z);
      if (node === nearestWaypoint(this.actor.pos.x, this.actor.pos.z)) continue;
      this.path = findPath(nearestWaypoint(this.actor.pos.x, this.actor.pos.z), node) || [];
      this.state = 'move';
      this.investigateUntil = ctx.time + 4;
      return;
    }
  }

  // Follow the waypoint path. Returns the wish direction (world space).
  followPath(dt) {
    if (this.path.length === 0) return { x: 0, z: 0, arrived: true };
    const node = MAP.waypoints[this.path[0]];
    const dx = node.x - this.actor.pos.x;
    const dz = node.z - this.actor.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.9) {
      this.path.shift();
      return { x: 0, z: 0, arrived: this.path.length === 0 };
    }
    return { x: dx / distance, z: dz / distance, arrived: false };
  }

  aimAt(target) {
    const dx = target.x - this.actor.pos.x;
    const dz = target.z - this.actor.pos.z;
    this.actor.yaw = Math.atan2(-dx, -dz);
  }

  // One burst round at the current target. Returns an event for the main
  // loop (or null) so audio / kill feed stay in one place.
  shootAtTarget(ctx) {
    const weapon = currentWeapon(this.loadout);
    if (!weapon || weapon.grenade) return null;
    if (this.loadout.slots[this.loadout.current] && this.loadout.slots[this.loadout.current].mag === 0) {
      startReload(this.loadout, ctx.time);
      return null;
    }
    const def = fire(this.loadout, ctx.time);
    if (!def) return null;
    const eye = this.eyePosition();
    tmpChest.copy(this.target.pos);
    const headshotAim = chance(this.random, 0.1);
    tmpChest.y += headshotAim ? 1.64 : 1.2;
    tmpDir.copy(tmpChest).sub(eye);
    const distance = tmpDir.length();
    tmpDir.normalize();
    const targetSpeed = this.target.groundSpeed();
    let error = BOT.aimErrorBase + distance * BOT.aimErrorPerMetre;
    if (targetSpeed > 3) error *= 1.5;
    if (this.actor.groundSpeed() > 1) error *= 2;
    tmpDir.x += (this.random() * 2 - 1) * error;
    tmpDir.y += (this.random() * 2 - 1) * error;
    tmpDir.z += (this.random() * 2 - 1) * error;
    tmpDir.normalize();
    const muzzle = tmpEye.copy(eye).addScaledVector(tmpDir, 0.7);
    const targets = ctx.shootTargets(this.actor);
    const result = ctx.combat.shoot(muzzle, tmpDir, targets);
    ctx.combat.tracer(muzzle, result.point, def.tracer);
    ctx.combat.muzzleFlash(muzzle);
    const event = { type: 'shot', x: eye.x, z: eye.z, weapon: def.id, far: true };
    if (result.hit) {
      if (result.actor) {
        const damageAmount = def.damage * (result.part === 'head' ? def.headMult : 1);
        const outcome = result.actor.damage(damageAmount);
        event.damage = { victim: result.actor, killer: this.actor, headshot: result.part === 'head', died: outcome.died };
        if (result.actor.isPlayer) event.hitPlayer = true;
      } else {
        ctx.combat.impact(result.point);
      }
    }
    return event;
  }

  // Lob a grenade at a point (frag or smoke). The arc is solved for a
  // fixed flight time, so the throw lands where it is aimed.
  throwGrenadeAt(ctx, point, type) {
    const eye = this.eyePosition();
    const flightTime = 1.1;
    const vx = (point.x - eye.x) / flightTime;
    const vz = (point.z - eye.z) / flightTime;
    const vy = (point.y + 1.0 - eye.y + 0.5 * 12 * flightTime * flightTime) / flightTime;
    ctx.combat.throwGrenade(eye, new THREE.Vector3(vx, vy, vz), type, this.actor);
  }

  throwFragAt(ctx, point) {
    this.throwGrenadeAt(ctx, point, 'frag');
    this.grenadeThrown = true;
  }

  update(dt, ctx) {
    const actor = this.actor;
    if (!actor.alive) return;
    const now = ctx.time;
    updateLoadout(this.loadout, dt, now);
    this.perceive(ctx);
    this.hear(ctx);

    const bomb = ctx.match.bomb;
    const targetVisible = this.target && this.target.alive && now - this.lastSeen < 0.4;

    // Bomb jobs override everything else.
    if (bomb.state === 'planted' && actor.team === 'vulture' && this.state !== 'defuse') {
      if (Math.hypot(bomb.x - actor.pos.x, bomb.z - actor.pos.z) < 1.6) {
        this.state = 'defuse';
      } else if (this.state !== 'engage') {
        const node = nearestWaypoint(bomb.x, bomb.z);
        const here = nearestWaypoint(actor.pos.x, actor.pos.z);
        if (this.destination !== node) {
          this.path = findPath(here, node) || [];
          this.destination = node;
          this.state = 'move';
        }
      }
    }
    if (bomb.state === 'dropped' && actor.team === 'sable' && bomb.carrier !== actor) {
      if (Math.hypot(bomb.x - actor.pos.x, bomb.z - actor.pos.z) < 1.4) {
        ctx.match.pickupBomb(actor);
      } else if (this.state !== 'engage' && this.state !== 'plant') {
        const node = nearestWaypoint(bomb.x, bomb.z);
        const here = nearestWaypoint(actor.pos.x, actor.pos.z);
        if (this.destination !== node) {
          this.path = findPath(here, node) || [];
          this.destination = node;
          this.state = 'move';
        }
      }
    }
    if (bomb.state === 'carried' && bomb.carrier === actor && this.state !== 'plant' && this.state !== 'engage') {
      const site = inSite(actor.pos.x, actor.pos.z);
      if (site) {
        this.state = 'plant';
        this.plantProgress = 0;
      } else {
        const plan = ATTACK_PLANS[this.role] || ATTACK_PLANS.mid;
        const siteNode = plan.site === 'B' ? 10 : 5;
        const here = nearestWaypoint(actor.pos.x, actor.pos.z);
        if (this.destination !== siteNode) {
          this.path = findPath(here, siteNode) || [];
          this.destination = siteNode;
          this.state = 'move';
        }
      }
    }

    // Smoke the site on the push: an attacker close to its target site
    // covers the plant with a cloud defenders cannot see through
    // (combat.hasLineOfSight treats smoke as opaque).
    if (this.hasSmoke && !this.smokeThrown && this.actor.team === 'sable'
      && this.state !== 'engage' && this.state !== 'plant' && this.state !== 'defuse') {
      const plan = ATTACK_PLANS[this.role];
      if (plan && plan.site) {
        const site = MAP.sites[plan.site];
        const siteDistance = Math.hypot(site.x - actor.pos.x, site.z - actor.pos.z);
        if (siteDistance < BOT.smokeThrowRange && chance(this.random, 0.05)) {
          this.throwGrenadeAt(ctx, { x: site.x, y: 0.5, z: site.z }, 'smoke');
          this.smokeThrown = true;
          ctx.events.push({ type: 'grenade', x: actor.pos.x, z: actor.pos.z });
        }
      }
    }

    // Engage: face the target, strafe, fire in bursts.
    if (targetVisible && now >= this.reactionUntil) {
      this.state = 'engage';
      this.aimAt(this.target.pos);
      let wishX = 0;
      let wishZ = 0;
      if (now >= this.strafeUntil) {
        this.strafeDir = chance(this.random, 0.6) ? -this.strafeDir : this.strafeDir;
        this.strafeUntil = now + range(this.random, 0.7, 1.4);
      }
      const forwardX = -Math.sin(actor.yaw);
      const forwardZ = -Math.cos(actor.yaw);
      wishX = -forwardZ * this.strafeDir;
      wishZ = forwardX * this.strafeDir;
      const distance = Math.hypot(this.target.pos.x - actor.pos.x, this.target.pos.z - actor.pos.z);
      if (distance > 18) { wishX += forwardX * 0.6; wishZ += forwardZ * 0.6; }
      if (distance < 4) { wishX -= forwardX * 0.5; wishZ -= forwardZ * 0.5; }
      const length = Math.hypot(wishX, wishZ) || 1;
      actor.move(dt, wishX / length, wishZ / length, BOT.walkSpeed, ctx.colliders, false);
      if (this.burstLeft <= 0 && now >= this.burstPauseUntil) {
        this.burstLeft = Math.floor(range(this.random, BOT.burstMin, BOT.burstMax + 1));
      }
      if (this.burstLeft > 0) {
        const event = this.shootAtTarget(ctx);
        if (event) {
          this.burstLeft -= 1;
          if (this.burstLeft <= 0) this.burstPauseUntil = now + range(this.random, BOT.burstPauseMin, BOT.burstPauseMax);
          ctx.events.push(event);
        }
      }
      return;
    }

    // Lost the target: go to where it was last seen, then resume the plan.
    if (this.state === 'engage') {
      this.state = 'move';
      const node = nearestWaypoint(this.lastKnown.x, this.lastKnown.z);
      const here = nearestWaypoint(actor.pos.x, actor.pos.z);
      this.path = findPath(here, node) || [];
      this.destination = node;
    }

    // Grenade at a hidden enemy we heard recently.
    if (this.hasGrenade && !this.grenadeThrown && this.lastSeen > 0 && now - this.lastSeen > 2 && now - this.lastSeen < 6) {
      const distance = Math.hypot(this.lastKnown.x - actor.pos.x, this.lastKnown.z - actor.pos.z);
      if (distance < 20 && chance(this.random, 0.02)) {
        this.throwFragAt(ctx, this.lastKnown);
        ctx.events.push({ type: 'grenade', x: actor.pos.x, z: actor.pos.z });
      }
    }

    if (this.state === 'plant') {
      const site = inSite(actor.pos.x, actor.pos.z);
      if (!site || bomb.carrier !== actor) {
        this.state = 'move';
      } else {
        this.plantProgress += dt;
        ctx.events.push({ type: 'planting', actor, progress: this.plantProgress });
        if (this.plantProgress >= 3.2) {
          ctx.match.completePlant(site, actor);
          this.state = 'move';
        }
      }
      return;
    }

    if (this.state === 'defuse') {
      if (bomb.state !== 'planted' || Math.hypot(bomb.x - actor.pos.x, bomb.z - actor.pos.z) > 1.8) {
        this.state = 'move';
      } else {
        this.defuseProgress += dt;
        ctx.events.push({ type: 'defusing', actor, progress: this.defuseProgress });
        if (this.defuseProgress >= 5) {
          ctx.match.completeDefuse(actor);
          this.state = 'move';
        }
      }
      return;
    }

    if (this.state === 'move') {
      const step = this.followPath(dt);
      if (step.arrived) {
        if (actor.team === 'sable') {
          // Attackers who reach their site hold it and watch the entrances.
          this.state = 'hold';
          this.holdUntil = now + 6;
          this.scanPhase = this.random() * Math.PI * 2;
        } else {
          this.state = 'hold';
          this.holdUntil = now + 999;
        }
      } else {
        this.aimAt({ x: actor.pos.x + step.x, z: actor.pos.z + step.z });
        actor.move(dt, step.x, step.z, BOT.runSpeed, ctx.colliders, false);
      }
      return;
    }

    // Hold: scan the surroundings. Defenders stay; attackers push on when
    // their hold timer runs out (towards the other site or mid).
    this.scanPhase += dt * 0.9;
    actor.yaw += Math.sin(this.scanPhase) * dt * 0.55;
    actor.group.rotation.y = actor.yaw;
    if (actor.team === 'sable' && now >= this.holdUntil && now >= this.investigateUntil) {
      const otherSite = this.destination === 5 ? 10 : 5;
      const here = nearestWaypoint(actor.pos.x, actor.pos.z);
      this.path = findPath(here, otherSite) || [];
      this.destination = otherSite;
      this.state = 'move';
    }
  }
}

