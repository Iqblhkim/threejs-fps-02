// SABLE BREACH — boot and the one loop: a fixed 60 Hz simulation feeding
// a render at the display's rate. ?shot=start|buy|play|end with &seed=N
// sets up a deterministic frame for a capture, renders it twice, then
// freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE, MATCH, PLAYER } from './config.js';
import { mulberry32 } from './rng.js';
import { MAP, inSite } from './map.js';
import { createWorld } from './world.js';
import { Actor } from './actor.js';
import { Bot } from './bot.js';
import { Match } from './match.js';
import { createCombat } from './combat.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import {
  createLoadout, currentWeapon, currentName, fire, startReload,
  updateLoadout, switchTo, spreadOf,
} from './weapons.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);
// ?lowfx=1 drops shadows and antialiasing: the same sim, just cheaper to
// render — used by the headless play-test, where the software renderer
// would otherwise starve the fixed-step loop of frames.
const lowfx = params.get('lowfx') === '1';

const renderer = new THREE.WebGLRenderer({ antialias: !lowfx, powerPreference: 'high-performance' });
renderer.setPixelRatio(lowfx ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !lowfx;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x201812);
scene.fog = new THREE.Fog(new THREE.Color(0x201812), 30, 90);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const combat = createCombat(scene, world);
const audio = createAudio();
const hud = createHud({ onBuy });
hud.onPlay(onPlayButton);
const input = createInput(renderer.domElement, onLockChange);
const match = new Match();

const tmpDir = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const tmpMuzzle = new THREE.Vector3();

// --- Actors ---------------------------------------------------------------
const player = new Actor({ team: 'sable', name: 'YOU', isPlayer: true, color: 0xf0a830 });
scene.add(player.group);
const playerLoadout = createLoadout();

const SABLE_NAMES = ['DUST', 'HAVOC', 'WREN', 'JINX'];
const SABLE_ROLES = ['rush-a', 'rush-a2', 'rush-b', 'mid'];
const VULTURE_NAMES = ['VIPER', 'GHOST', 'RAZOR', 'MOTH', 'COBRA'];
const VULTURE_ROLES = ['hold-a', 'hold-a2', 'hold-b', 'hold-b2', 'roam'];
const bots = [];
for (let i = 0; i < 4; i += 1) {
  const actor = new Actor({ team: 'sable', name: SABLE_NAMES[i], isPlayer: false, color: 0xf0a830 });
  scene.add(actor.group);
  bots.push(new Bot(actor, SABLE_ROLES[i], mulberry32(seed * 1000 + i + 11)));
}
for (let i = 0; i < 5; i += 1) {
  const actor = new Actor({ team: 'vulture', name: VULTURE_NAMES[i], isPlayer: false, color: 0xe5484d });
  scene.add(actor.group);
  bots.push(new Bot(actor, VULTURE_ROLES[i], mulberry32(seed * 1000 + i + 101)));
}
const allActors = [player, ...bots.map((b) => b.actor)];

// --- Viewmodel: the player's gun, attached to the camera ------------------
const viewmodel = new THREE.Group();
{
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x2a2723, roughness: 0.45, metalness: 0.65 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), gunMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), gunMat);
  barrel.position.set(0, 0.03, -0.4);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.1), accentMat);
  sight.position.set(0, 0.09, -0.1);
  viewmodel.add(body, barrel, sight);
  viewmodel.scale.setScalar(0.8);
  viewmodel.rotation.y = -0.1;
  viewmodel.position.set(0.3, -0.25, -0.55);
  camera.add(viewmodel);
}

// --- Explosion effect ------------------------------------------------------
const explosionMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0 }),
);
explosionMesh.visible = false;
scene.add(explosionMesh);
const explosionLight = new THREE.PointLight(0xff9a3c, 0, 30, 1.5);
scene.add(explosionLight);
let explosionLife = 0;

// --- State ------------------------------------------------------------------
let time = 0;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let recoilPitch = 0;
let recoilYaw = 0;
let walkCycle = 0;
let viewKick = 0;
let cameraShake = 0;
let plantProgress = 0;
let prevWeaponSlot = 2;
let dead = false;
let wasFiring = false;
const sounds = [];
const botEvents = [];

function shootTargets(shooter) {
  const targets = world.shootables.slice();
  for (const actor of allActors) {
    if (actor !== shooter && actor.alive) targets.push(...actor.hitMeshes);
  }
  return targets;
}

const botCtx = {
  get time() { return time; },
  match,
  combat,
  world,
  actors: allActors,
  colliders: world.colliders,
  sounds,
  events: botEvents,
  shootTargets,
};

function aliveCounts() {
  let sable = 0;
  let vulture = 0;
  for (const actor of allActors) {
    if (!actor.alive) continue;
    if (actor.team === 'sable') sable += 1;
    else vulture += 1;
  }
  return { sable, vulture };
}

// --- Round setup ------------------------------------------------------------
function setupRound() {
  const sableSpawns = MAP.spawns.sable;
  const vultureSpawns = MAP.spawns.vulture;
  player.reset(sableSpawns[2].x, sableSpawns[2].z, -Math.PI / 2);
  player.armor = playerLoadout.armor;
  dead = false;
  plantProgress = 0;
  const sableBots = bots.filter((b) => b.actor.team === 'sable');
  const vultureBots = bots.filter((b) => b.actor.team === 'vulture');
  sableBots.forEach((bot, i) => {
    const spawn = sableSpawns[[0, 1, 3, 4][i]];
    bot.actor.reset(spawn.x, spawn.z, -Math.PI / 2);
    const spent = bot.assignRound(match.moneyFor(bot.actor), time);
    match.addMoney(bot.actor, -spent);
  });
  vultureBots.forEach((bot, i) => {
    const spawn = vultureSpawns[i];
    bot.actor.reset(spawn.x, spawn.z, Math.PI / 2);
    const spent = bot.assignRound(match.moneyFor(bot.actor), time);
    match.addMoney(bot.actor, -spent);
  });
  combat.clear();
  syncHud();
}

// --- HUD ----------------------------------------------------------------------
function syncHud() {
  const weapon = currentWeapon(playerLoadout);
  hud.setHealth(player.hp, player.armor);
  hud.setAmmo(weapon && !weapon.grenade ? weapon.mag : 0, weapon && !weapon.grenade ? weapon.reserve : 0, currentName(playerLoadout));
  hud.setMoney(match.moneyFor(player));
  hud.setScore(match.score.sable, match.score.vulture, match.round);
  const counts = aliveCounts();
  hud.setAlive(counts.sable, counts.vulture);
  hud.killfeed(match.feed);
  if (match.phase === 'freeze') hud.setTimer(match.timer, 'freeze');
  else if (match.phase === 'live') hud.setTimer(match.bomb.state === 'planted' ? match.bomb.timer : match.timer, 'live');
  else hud.setTimer(0, match.phase);
  if (match.bomb.state === 'planted') hud.setBombStatus(`SPIKE PLANTED — SITE ${match.bomb.site} — ${Math.ceil(match.bomb.timer)}s`, true);
  else if (match.bomb.state === 'carried') hud.setBombStatus(match.bomb.carrier === player ? 'YOU CARRY THE SPIKE' : `SPIKE: ${match.bomb.carrier ? match.bomb.carrier.name : '—'}`);
  else if (match.bomb.state === 'dropped') hud.setBombStatus('SPIKE DROPPED — PICK IT UP');
  else hud.setBombStatus('');
}

function onBuy(itemId) {
  if (match.phase !== 'freeze') return;
  const result = match.buyFor(player, itemId, playerLoadout);
  if (result.ok) {
    audio.buy();
    player.armor = playerLoadout.armor;
    hud.showBuy(match.moneyFor(player), playerLoadout);
    syncHud();
  } else {
    audio.dry();
  }
}

function onPlayButton() {
  audio.resume();
  if (match.phase === 'matchover') {
    match.startMatch(allActors, player);
    setupRound();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (dead) return;
  // Start immediately; pointer lock is best-effort — if it fails, the game
  // still runs (keyboard + click) instead of stranding the player on the
  // title screen.
  started = true;
  hud.hideOverlay();
  input.requestLock();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (match.phase !== 'matchover' && !dead) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

// --- Player shooting ----------------------------------------------------------
function playerShoot() {
  const def = fire(playerLoadout, time);
  if (!def) {
    if (currentWeapon(playerLoadout) && currentWeapon(playerLoadout).mag === 0) {
      audio.dry();
      startReload(playerLoadout, time);
    }
    return;
  }
  const spread = spreadOf(playerLoadout, player.groundSpeed() > 0.5, player.crouched, input.state.scoped, input.state.keys.has('ShiftLeft'));
  camera.getWorldDirection(tmpDir);
  player.eyePosition(tmpEye);
  tmpMuzzle.copy(tmpEye).addScaledVector(tmpDir, 0.6);
  const targets = shootTargets(player);
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    tmpDir.x += (random() * 2 - 1) * spread;
    tmpDir.y += (random() * 2 - 1) * spread;
    tmpDir.z += (random() * 2 - 1) * spread;
    tmpDir.normalize();
    const result = combat.shoot(tmpEye, tmpDir, targets);
    combat.tracer(tmpMuzzle, result.point, def.tracer);
    if (result.hit) {
      if (result.actor) {
        const falloff = result.distance > 30 && def.id !== 'longshot' ? 0.75 : 1;
        const damageAmount = def.damage * (result.part === 'head' ? def.headMult : 1) * falloff;
        const outcome = result.actor.damage(damageAmount);
        hud.hitmarker(outcome.died);
        audio.hit(outcome.died);
        if (outcome.died) match.onKill(player, result.actor, result.part === 'head', time);
      } else {
        combat.impact(result.point);
      }
    }
    camera.getWorldDirection(tmpDir);
  }
  combat.muzzleFlash(tmpMuzzle);
  sounds.push({ x: player.pos.x, z: player.pos.z, time });
  audio.shot(def.id);
  recoilPitch = Math.min(0.07, recoilPitch + def.recoil);
  recoilYaw += (random() * 2 - 1) * def.recoil * 0.4;
  viewKick = 0.09;
  syncHud();
}

function throwPlayerGrenade() {
  const weapon = currentWeapon(playerLoadout);
  if (!weapon || !weapon.grenade) return;
  const type = weapon.grenade.id;
  camera.getWorldDirection(tmpDir);
  player.eyePosition(tmpEye);
  const velocity = tmpDir.clone().multiplyScalar(15);
  velocity.y += 2.5;
  combat.throwGrenade(tmpEye, velocity, type, player);
  if (type === 'frag') playerLoadout.frag -= 1;
  else playerLoadout.smoke -= 1;
  audio.click();
  if ((type === 'frag' && playerLoadout.frag <= 0) || (type === 'smoke' && playerLoadout.smoke <= 0)) {
    switchTo(playerLoadout, prevWeaponSlot, time);
  }
  syncHud();
}

// --- Match + bot events -------------------------------------------------------
function handleMatchEvents() {
  for (const event of match.events.splice(0)) {
    if (event.type === 'round-freeze') {
      syncHud();
    } else if (event.type === 'round-start') {
      hud.hideBuy();
      syncHud();
    } else if (event.type === 'kill') {
      hud.killfeed(match.feed);
      if (event.victim === player) {
        dead = true;
        document.getElementById('damage-flash').classList.add('dead');
        hud.hint('Eliminated — the round plays on without you.');
        input.exitLock();
      }
      if (event.killer === player) audio.hit(true);
      syncHud();
    } else if (event.type === 'bomb-planted') {
      hud.banner('SPIKE PLANTED', `Site ${event.site} — ${MATCH.bombSeconds}s to detonation`, 'sable');
      audio.plantBeep(true);
      syncHud();
    } else if (event.type === 'bomb-dropped') {
      hud.setBombStatus('SPIKE DROPPED — PICK IT UP');
    } else if (event.type === 'bomb-pickup') {
      syncHud();
    } else if (event.type === 'bomb-defused') {
      audio.lose();
      syncHud();
    } else if (event.type === 'bomb-exploded') {
      explodeAt(event.x, event.z);
      syncHud();
    } else if (event.type === 'round-end') {
      const won = event.winner === 'sable';
      const reasons = {
        elimination: won ? 'VULTURE team eliminated' : 'SABLE team eliminated',
        detonation: 'The spike detonated',
        defuse: 'The spike was defused',
        time: 'Time expired — spike never planted',
      };
      hud.banner(won ? 'SABLE WINS THE ROUND' : 'VULTURE WINS THE ROUND', reasons[event.reason] || '', event.winner);
      if (won) audio.win(); else audio.lose();
      syncHud();
    } else if (event.type === 'next-round') {
      match.startRound(allActors, player);
      setupRound();
    } else if (event.type === 'match-end') {
      hud.showOverlay('matchover', { winner: event.winner, score: event.score });
      input.exitLock();
    }
  }
}

function handleBotEvents() {
  for (const event of botEvents.splice(0)) {
    if (event.type === 'shot') {
      sounds.push({ x: event.x, z: event.z, time });
      const distance = Math.hypot(event.x - player.pos.x, event.z - player.pos.z);
      if (distance < 30) audio.distantShot();
      if (event.damage) {
        const { victim, killer, headshot, died } = event.damage;
        if (victim === player) {
          document.getElementById('damage-flash').classList.remove('flash');
          void document.getElementById('damage-flash').offsetWidth;
          document.getElementById('damage-flash').classList.add('flash');
          audio.hit(false);
        }
        if (died) match.onKill(killer, victim, headshot, time);
      }
    }
  }
}

function explodeAt(x, z) {
  explosionMesh.position.set(x, 1.2, z);
  explosionMesh.visible = true;
  explosionLife = 0.6;
  explosionLight.position.set(x, 2, z);
  explosionLight.intensity = 60;
  cameraShake = 0.35;
  audio.explosion();
  sounds.push({ x, z, time });
  // The blast kills anyone caught in it.
  for (const actor of allActors) {
    if (!actor.alive) continue;
    const distance = Math.hypot(actor.pos.x - x, actor.pos.z - z);
    if (distance < MATCH.bombRadius) {
      const damageAmount = MATCH.bombMaxDamage * (1 - distance / MATCH.bombRadius) + 30;
      const outcome = actor.damage(damageAmount);
      if (outcome.died) match.onKill(null, actor, false, time);
    }
  }
}

// --- Fixed step ---------------------------------------------------------------
function step(dt) {
  time += dt;
  match.tick(dt, aliveCounts());
  handleMatchEvents();
  if (match.phase === 'matchover') return;

  const keys = input.state.keys;
  const pressed = input.takePressed();

  // Enter also starts the game (keyboard-only players, no pointer lock).
  if (pressed.has('Enter') && !started && match.phase !== 'matchover' && !dead) {
    audio.resume();
    started = true;
    hud.hideOverlay();
    input.requestLock();
  }

  // Buy menu (freeze phase only).
  if (pressed.has('KeyB') && match.phase === 'freeze' && !dead) {
    if (hud.buyOpen) hud.hideBuy();
    else { hud.showBuy(match.moneyFor(player), playerLoadout); audio.click(); }
  }
  if (hud.buyOpen) {
    if (pressed.has('Escape') || match.phase !== 'freeze') hud.hideBuy();
    const buyKeys = { Digit1: 'vk47', Digit2: 'viper', Digit3: 'breacher', Digit4: 'longshot', Digit5: 'frag', Digit6: 'smoke', Digit7: 'armor' };
    for (const [code, id] of Object.entries(buyKeys)) {
      if (pressed.has(code)) onBuy(id);
    }
  }

  // Player look + movement.
  const look = input.takeLook();
  if (!shot && started && !dead) {
    player.yaw -= look.x * 0.0022;
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - look.y * 0.0022));
  }
  recoilPitch = Math.max(0, recoilPitch - dt * 0.25);
  recoilYaw *= Math.max(0, 1 - dt * 8);

  const forwardX = -Math.sin(player.yaw);
  const forwardZ = -Math.cos(player.yaw);
  const rightX = Math.cos(player.yaw);
  const rightZ = -Math.sin(player.yaw);
  let wishX = 0;
  let wishZ = 0;
  if (!dead && (match.phase === 'live' || match.phase === 'freeze') && (started || shot)) {
    if (keys.has('KeyW')) { wishX += forwardX; wishZ += forwardZ; }
    if (keys.has('KeyS')) { wishX -= forwardX; wishZ -= forwardZ; }
    if (keys.has('KeyA')) { wishX -= rightX; wishZ -= rightZ; }
    if (keys.has('KeyD')) { wishX += rightX; wishZ += rightZ; }
  }
  const wishLength = Math.hypot(wishX, wishZ);
  if (wishLength > 0) { wishX /= wishLength; wishZ /= wishLength; }
  const sprinting = keys.has('ShiftLeft') && !player.crouched;
  player.crouched = keys.has('ControlLeft') || keys.has('KeyC');
  const speed = player.crouched ? PLAYER.crouchSpeed : sprinting ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const jump = pressed.has('Space');
  player.move(dt, wishX, wishZ, speed, world.colliders, jump);
  if (wishLength > 0 && player.grounded) {
    walkCycle += dt * player.groundSpeed() * 1.6;
    if (Math.sin(walkCycle) > 0.96 && time - (step.lastStep || 0) > 0.28) {
      step.lastStep = time;
      audio.step();
    }
  }

  // Weapons: switch, reload, fire, grenade. Semi-auto weapons and grenades
  // fire on the frame the button goes down; automatics fire every frame.
  // While the buy menu is open, number keys buy instead of switching.
  if (!dead && (started || shot) && !hud.buyOpen) {
    if (pressed.has('Digit1')) { prevWeaponSlot = playerLoadout.current; switchTo(playerLoadout, 1, time); syncHud(); }
    if (pressed.has('Digit2')) { prevWeaponSlot = playerLoadout.current; switchTo(playerLoadout, 2, time); syncHud(); }
    if (pressed.has('Digit4')) { prevWeaponSlot = playerLoadout.current; switchTo(playerLoadout, 4, time); syncHud(); }
    if (pressed.has('Digit5')) { prevWeaponSlot = playerLoadout.current; switchTo(playerLoadout, 5, time); syncHud(); }
    if (pressed.has('KeyR')) startReload(playerLoadout, time);
    if (pressed.has('KeyG')) throwPlayerGrenade();
    if (input.state.firing && match.phase === 'live' && !hud.buyOpen) {
      const weapon = currentWeapon(playerLoadout);
      if (weapon && weapon.grenade) {
        if (!wasFiring) throwPlayerGrenade();
      } else if (weapon && weapon.def.auto) {
        playerShoot();
      } else if (!wasFiring) {
        playerShoot();
      }
    }
    wasFiring = input.state.firing;
  }
  updateLoadout(playerLoadout, dt, time);
  playerLoadout.armor = player.armor;

  // Planting: hold E inside a site while carrying the spike.
  if (!dead && match.phase === 'live' && match.bomb.state === 'carried' && match.bomb.carrier === player) {
    const site = inSite(player.pos.x, player.pos.z);
    if (site && keys.has('KeyE') && player.groundSpeed() < 1.5) {
      plantProgress += dt;
      hud.hint(`PLANTING THE SPIKE… ${Math.ceil((MATCH.plantSeconds - plantProgress) * 10) / 10}s`);
      if (Math.floor(plantProgress * 2) !== Math.floor((plantProgress - dt) * 2)) audio.plantBeep(false);
      if (plantProgress >= MATCH.plantSeconds) {
        match.completePlant(site, player);
        plantProgress = 0;
        hud.hint('');
      }
    } else {
      if (site) hud.hint('Hold E to plant the spike');
      else hud.hint('');
      plantProgress = 0;
    }
  } else if (match.bomb.state === 'planted') {
    const distance = Math.hypot(match.bomb.x - player.pos.x, match.bomb.z - player.pos.z);
    if (distance < 30) hud.hint(`SPIKE AT SITE ${match.bomb.site} — ${Math.ceil(match.bomb.timer)}s`);
    else hud.hint('');
  } else {
    plantProgress = 0;
  }

  // Bots only move once the round is live — freeze time is for buying.
  if (match.phase === 'live') {
    for (const bot of bots) bot.update(dt, botCtx);
  }
  handleBotEvents();

  // Grenades and smoke.
  combat.update(dt, {
    time,
    onBounce: (pos) => { if (Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z) < 20) audio.bounce(); },
    onSmoke: () => {},
    onFrag: (pos, owner) => {
      audio.explosion();
      cameraShake = Math.max(cameraShake, Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z) < 12 ? 0.2 : 0);
      explosionMesh.position.set(pos.x, pos.y + 0.5, pos.z);
      explosionMesh.visible = true;
      explosionLife = 0.35;
      for (const actor of allActors) {
        if (!actor.alive) continue;
        const distance = Math.hypot(actor.pos.x - pos.x, actor.pos.z - pos.z);
        if (distance < 6) {
          const outcome = actor.damage(120 * (1 - distance / 6) + 10);
          if (outcome.died) match.onKill(owner, actor, false, time);
        }
      }
      sounds.push({ x: pos.x, z: pos.z, time });
    },
  });

  // Prune old sounds.
  while (sounds.length > 0 && time - sounds[0].time > 2) sounds.shift();

  // Explosion visual + camera shake decay.
  if (explosionLife > 0) {
    explosionLife -= dt;
    const t = 1 - explosionLife / 0.6;
    explosionMesh.scale.setScalar(1 + t * 8);
    explosionMesh.material.opacity = Math.max(0, 0.55 * (1 - t));
    explosionLight.intensity = Math.max(0, 60 * (1 - t));
    if (explosionLife <= 0) explosionMesh.visible = false;
  }
  cameraShake = Math.max(0, cameraShake - dt * 0.9);

  world.update(time);
  syncHud();
}

function syncCamera() {
  player.eyePosition(tmpEye);
  camera.position.set(
    tmpEye.x + (cameraShake > 0 ? (random() - 0.5) * cameraShake * 0.3 : 0),
    tmpEye.y + (cameraShake > 0 ? (random() - 0.5) * cameraShake * 0.3 : 0),
    tmpEye.z,
  );
  camera.rotation.set(player.pitch + recoilPitch, player.yaw + recoilYaw, 0, 'YXZ');
  const scoped = input.state.scoped && currentWeapon(playerLoadout) && currentWeapon(playerLoadout).def && currentWeapon(playerLoadout).def.zoom > 0;
  const targetFov = scoped ? 74 / 2.6 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
  hud.setScoped(scoped);
  viewmodel.visible = !scoped;
  const bobAmount = player.grounded && player.groundSpeed() > 0.5 ? 0.012 : 0.003;
  viewKick = Math.max(0, viewKick - 0.012);
  viewmodel.position.set(
    0.3 + Math.cos(walkCycle) * bobAmount,
    -0.25 + Math.abs(Math.sin(walkCycle)) * bobAmount * 1.4,
    -0.55 + viewKick,
  );
  const weapon = currentWeapon(playerLoadout);
  const spread = weapon && !weapon.grenade ? spreadOf(playerLoadout, player.groundSpeed() > 0.5, player.crouched, scoped, false) : 0.02;
  hud.setCrosshairGap(4 + spread * 900);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function aimPlayerAt(x, y, z) {
  const dx = x - player.pos.x;
  const dy = y - (player.pos.y + player.eyeHeight());
  const dz = z - player.pos.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
}

function runShot(name) {
  hud.hideOverlay();
  started = true;
  if (name === 'start') {
    player.reset(MAP.spawns.sable[2].x, MAP.spawns.sable[2].z, -Math.PI / 2);
    settle(30);
    hud.showOverlay('start');
  } else if (name === 'buy') {
    player.reset(MAP.spawns.sable[2].x, MAP.spawns.sable[2].z, -Math.PI / 2);
    match.addMoney(player, 3200);
    hud.showBuy(match.moneyFor(player), playerLoadout);
    settle(30);
  } else if (name === 'play') {
    match.phase = 'live';
    match.timer = 62;
    match.score = { sable: 2, vulture: 1 };
    match.round = 4;
    player.reset(2, -2, 0);
    const target = bots.find((b) => b.actor.team === 'vulture' && b.role === 'hold-a');
    target.actor.reset(10, -8, Math.PI / 2);
    const mid = bots.find((b) => b.actor.team === 'vulture' && b.role === 'roam');
    mid.actor.reset(6, -2.5, Math.PI / 2);
    const mate = bots.find((b) => b.actor.team === 'sable' && b.role === 'rush-a');
    mate.actor.reset(0, -4, -Math.PI / 2);
    settle(10);
    aimPlayerAt(target.actor.pos.x, 1.3, target.actor.pos.z);
    syncCamera();
    playerShoot();
    settle(10); // past the pistol's 0.15 s cooldown, so the second shot fires
    aimPlayerAt(target.actor.pos.x, 1.3, target.actor.pos.z);
    playerShoot();
    settle(8);
  } else if (name === 'end') {
    match.phase = 'ended';
    match.timer = 2;
    match.score = { sable: 3, vulture: 1 };
    match.round = 5;
    match.roundWinner = 'sable';
    player.reset(12, -6, 0);
    const fallen = bots.find((b) => b.actor.team === 'vulture' && b.role === 'hold-a2');
    fallen.actor.reset(15, -13, Math.PI / 2);
    fallen.actor.damage(500);
    const mate = bots.find((b) => b.actor.team === 'sable' && b.role === 'rush-a');
    mate.actor.reset(14, -10, -Math.PI / 2);
    settle(10);
    aimPlayerAt(16, 0.8, -13);
    hud.banner('SABLE WINS THE ROUND', 'VULTURE team eliminated', 'sable');
    settle(10);
  }
  syncHud();
  paintTwiceThenReady();
}

// --- Debug handle for the headless play-test ---------------------------------
window.__sable = {
  snapshot() {
    const counts = aliveCounts();
    return {
      screen: match.phase === 'matchover' ? 'matchover' : match.phase === 'idle' ? 'title' : started ? 'play' : 'title',
      phase: match.phase,
      round: match.round,
      score: { ...match.score },
      hp: Math.ceil(player.hp),
      armor: Math.ceil(player.armor),
      money: match.moneyFor(player),
      mag: currentWeapon(playerLoadout) && !currentWeapon(playerLoadout).grenade ? currentWeapon(playerLoadout).mag : 0,
      reserve: currentWeapon(playerLoadout) && !currentWeapon(playerLoadout).grenade ? currentWeapon(playerLoadout).reserve : 0,
      weapon: currentName(playerLoadout),
      aliveSable: counts.sable,
      aliveVulture: counts.vulture,
      bomb: match.bomb.state,
      timeLeft: Math.ceil(match.phase === 'live' && match.bomb.state === 'planted' ? match.bomb.timer : match.timer),
      kills: { ...match.kills },
      dead,
      pos: { x: Math.round(player.pos.x * 100) / 100, z: Math.round(player.pos.z * 100) / 100 },
      botPos: (() => {
        const bot = bots[0];
        return { x: Math.round(bot.actor.pos.x * 100) / 100, z: Math.round(bot.actor.pos.z * 100) / 100, alive: bot.actor.alive };
      })(),
    };
  },
  // Debug access for headless verification (not used by the game itself).
  debug: {
    scene, camera, player, bots, world, combat, match,
    freeze(value) { frozen = value; },
    setPlayer(x, z, yaw, pitch = 0) {
      player.pos.set(x, 0, z);
      player.vel.set(0, 0, 0);
      player.yaw = yaw;
      player.pitch = pitch;
      player.group.position.copy(player.pos);
    },
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Boot ---------------------------------------------------------------------
match.startMatch(allActors, player);
setupRound();
hud.showOverlay('start');
syncHud();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
