// Combat: hitscan shooting against the world and actor hitboxes, tracers,
// impact sparks, muzzle flashes, and grenades (frag + smoke). Pools are
// reused so a firefight allocates nothing per frame.
import * as THREE from 'three';
import { GRENADES } from './config.js';
import { raycastBoxes } from './actor.js';

const TRACER_COUNT = 16;
const SPARK_COUNT = 8;
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

function smokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(200,200,200,0.85)');
  gradient.addColorStop(1, 'rgba(200,200,200,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createCombat(scene, world) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;

  // Tracer pool: one line each, round-robin.
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  // Spark pool: one Points burst each, round-robin.
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffc46b, size: 0.14, transparent: true, opacity: 0 }));
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, velocities: [], life: 0 });
  }
  let sparkIndex = 0;

  const muzzle = new THREE.PointLight(0xffc46b, 0, 9, 1.8);
  scene.add(muzzle);
  let muzzleLife = 0;

  const grenades = [];
  const smokes = [];
  const smokeTex = smokeTexture();

  function tracer(from, to, color) {
    const entry = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_COUNT;
    const positions = entry.line.geometry.attributes.position.array;
    positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
    positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
    entry.line.geometry.attributes.position.needsUpdate = true;
    entry.line.material.color.setHex(color);
    entry.line.material.opacity = 0.9;
    entry.life = 0.07;
  }

  function impact(point) {
    const entry = sparks[sparkIndex];
    sparkIndex = (sparkIndex + 1) % SPARK_COUNT;
    const positions = entry.points.geometry.attributes.position.array;
    entry.velocities = [];
    for (let i = 0; i < 8; i += 1) {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
      entry.velocities.push(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4));
    }
    entry.points.geometry.attributes.position.needsUpdate = true;
    entry.points.material.opacity = 1;
    entry.life = 0.28;
  }

  function muzzleFlash(position) {
    muzzle.position.copy(position);
    muzzle.intensity = 26;
    muzzleLife = 0.05;
  }

  // One hitscan shot. `targets` is world meshes + alive actors' hit meshes
  // (the caller's job to exclude the shooter's own). Returns the first hit.
  // The matrices are refreshed first: scripted shots fire between renders,
  // when the scene graph has moved but no frame has updated it yet.
  function shoot(origin, dir, targets) {
    scene.updateMatrixWorld(true);
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return { hit: false, distance: 120, point: tmpVec.copy(origin).addScaledVector(dir, 120).clone() };
    const first = hits[0];
    const userData = first.object.userData || {};
    return {
      hit: true,
      distance: first.distance,
      point: first.point.clone(),
      actor: userData.actor || null,
      part: userData.part || null,
      normal: first.face ? first.face.normal.clone() : null,
    };
  }

  function throwGrenade(position, velocity, type, owner) {
    grenades.push({
      position: position.clone(),
      velocity: velocity.clone(),
      type,
      owner,
      fuse: GRENADES[type].fuse,
      bounced: false,
    });
  }

  // Segment vs sphere: true when the line from a to b passes through a
  // smoke cloud. Bots treat smoke as opaque; players just see the cloud.
  function segmentHitsSmoke(a, b) {
    for (const smoke of smokes) {
      tmpVec.copy(b).sub(a);
      const lengthSq = tmpVec.lengthSq();
      if (lengthSq < 1e-9) continue;
      const t = Math.max(0, Math.min(1, tmpVec2.copy(smoke.position).sub(a).dot(tmpVec) / lengthSq));
      const closestX = a.x + tmpVec.x * t;
      const closestY = a.y + tmpVec.y * t;
      const closestZ = a.z + tmpVec.z * t;
      const dx = smoke.position.x - closestX;
      const dy = smoke.position.y - closestY;
      const dz = smoke.position.z - closestZ;
      if (dx * dx + dy * dy + dz * dz < smoke.radius * smoke.radius) return true;
    }
    return false;
  }

  function hasLineOfSight(a, b) {
    tmpVec.copy(b).sub(a);
    const distance = tmpVec.length();
    if (distance < 0.01) return true;
    tmpVec.multiplyScalar(1 / distance);
    const blocked = raycastBoxes(a, tmpVec, distance, world.colliders);
    if (blocked < distance) return false;
    return !segmentHitsSmoke(a, b);
  }

  function spawnSmokeCloud(position, radius) {
    const group = new THREE.Group();
    for (let i = 0; i < 14; i += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.5, depthWrite: false }));
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius * 0.55;
      sprite.position.set(position.x + Math.cos(angle) * distance, position.y + 0.4 + Math.random() * 1.6, position.z + Math.sin(angle) * distance);
      const scale = 2 + Math.random() * 2.5;
      sprite.scale.set(scale, scale, 1);
      group.add(sprite);
    }
    scene.add(group);
    smokes.push({ position: position.clone(), radius, until: 0, group });
    return smokes[smokes.length - 1];
  }

  // Advance tracers, sparks, grenades and smoke. `ctx` carries the live
  // actors (for frag damage), the game time, and an event sink.
  function update(dt, ctx) {
    for (const entry of tracers) {
      if (entry.life > 0) {
        entry.life -= dt;
        entry.line.material.opacity = Math.max(0, entry.life / 0.07) * 0.9;
      }
    }
    for (const entry of sparks) {
      if (entry.life > 0) {
        entry.life -= dt;
        const positions = entry.points.geometry.attributes.position.array;
        for (let i = 0; i < 8; i += 1) {
          const v = entry.velocities[i];
          positions[i * 3] += v.x * dt;
          positions[i * 3 + 1] += v.y * dt;
          positions[i * 3 + 2] += v.z * dt;
          v.y -= 9 * dt;
        }
        entry.points.geometry.attributes.position.needsUpdate = true;
        entry.points.material.opacity = Math.max(0, entry.life / 0.28);
      }
    }
    if (muzzleLife > 0) {
      muzzleLife -= dt;
      muzzle.intensity = Math.max(0, (muzzleLife / 0.05) * 26);
    }

    // Grenades: gravity, bounce off boxes and the floor, fuse, detonate.
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.velocity.y -= 12 * dt;
      const next = tmpVec.copy(g.position).addScaledVector(g.velocity, dt);
      let bounced = false;
      if (next.y < 0.1) {
        next.y = 0.1;
        g.velocity.y = Math.abs(g.velocity.y) * 0.4;
        g.velocity.x *= 0.7;
        g.velocity.z *= 0.7;
        bounced = true;
      }
      for (const box of world.colliders) {
        if (next.x > box.min.x - 0.1 && next.x < box.max.x + 0.1 && next.y > box.min.y - 0.1 && next.y < box.max.y + 0.1 && next.z > box.min.z - 0.1 && next.z < box.max.z + 0.1) {
          const dxMin = Math.min(Math.abs(next.x - box.min.x), Math.abs(next.x - box.max.x));
          const dzMin = Math.min(Math.abs(next.z - box.min.z), Math.abs(next.z - box.max.z));
          const dyMin = Math.min(Math.abs(next.y - box.min.y), Math.abs(next.y - box.max.y));
          if (dxMin <= dzMin && dxMin <= dyMin) { g.velocity.x *= -0.4; next.x = g.position.x; }
          else if (dzMin <= dyMin) { g.velocity.z *= -0.4; next.z = g.position.z; }
          else { g.velocity.y *= -0.4; next.y = g.position.y; }
          bounced = true;
        }
      }
      g.position.copy(next);
      if (bounced && !g.bounced) { g.bounced = true; if (ctx.onBounce) ctx.onBounce(g.position); }
      if (g.fuse <= 0) {
        grenades.splice(i, 1);
        if (g.type === 'frag') {
          if (ctx.onFrag) ctx.onFrag(g.position, g.owner);
        } else {
          const cloud = spawnSmokeCloud(g.position, GRENADES.smoke.radius);
          cloud.until = ctx.time + GRENADES.smoke.duration;
          if (ctx.onSmoke) ctx.onSmoke(g.position);
        }
      }
    }

    // Smoke clouds fade out and are removed when their time is up.
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const smoke = smokes[i];
      if (ctx.time >= smoke.until) {
        scene.remove(smoke.group);
        smokes.splice(i, 1);
      } else {
        const remaining = smoke.until - ctx.time;
        const opacity = Math.min(0.5, remaining * 0.1);
        for (const sprite of smoke.group.children) sprite.material.opacity = opacity;
      }
    }
  }

  function clear() {
    for (const g of grenades) grenades.splice(0, grenades.length);
    for (const smoke of smokes) {
      scene.remove(smoke.group);
      smokes.splice(0, smokes.length);
    }
  }

  return {
    shoot, tracer, impact, muzzleFlash, throwGrenade, hasLineOfSight,
    segmentHitsSmoke, update, clear,
    get grenadeCount() { return grenades.length; },
    get smokeCount() { return smokes.length; },
  };
}
