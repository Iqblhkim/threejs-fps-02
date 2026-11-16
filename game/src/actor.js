// One actor: the player or a bot. Shared movement physics (acceleration,
// axis-separated AABB collision against the map boxes, jumping, crouching),
// health + armour, and the low-poly body whose head and torso are the
// raycast hitboxes. Bots and the player differ only in who drives it.
import * as THREE from 'three';
import { PLAYER } from './config.js';

const tmpBox = new THREE.Box3();
const tmpMin = new THREE.Vector3();
const tmpMax = new THREE.Vector3();

function overlapsBox(pos, radius, height, box) {
  return (
    pos.x + radius > box.min.x && pos.x - radius < box.max.x &&
    pos.z + radius > box.min.z && pos.z - radius < box.max.z &&
    pos.y < box.max.y && pos.y + height > box.min.y
  );
}

export class Actor {
  constructor({ team, name, isPlayer, color }) {
    this.team = team;
    this.name = name;
    this.isPlayer = !!isPlayer;
    this.color = color;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.hp = PLAYER.hp;
    this.armor = 0;
    this.alive = true;
    this.crouched = false;
    this.grounded = true;
    this.height = PLAYER.height;
    this.group = new THREE.Group();
    this.buildMesh();
  }

  buildMesh() {
    const teamMat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.75, metalness: 0.15 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.9, metalness: 0.05 });
    const visorMat = new THREE.MeshStandardMaterial({
      color: this.team === 'sable' ? 0xf0a830 : 0xe5484d, emissive: this.team === 'sable' ? 0x8a5c00 : 0x8a1013, roughness: 0.4,
    });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2a2723, roughness: 0.5, metalness: 0.6 });

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.2), darkMat);
    legL.position.set(-0.11, 0.375, 0);
    const legR = legL.clone();
    legR.position.x = 0.11;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), teamMat);
    torso.position.set(0, 1.11, 0);
    torso.userData = { actor: this, part: 'body' };
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), darkMat);
    head.position.set(0, 1.64, 0);
    head.userData = { actor: this, part: 'head' };
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.05), visorMat);
    visor.position.set(0, 1.66, -0.15);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.72), gunMat);
    gun.position.set(0.2, 1.32, -0.3);

    this.group.add(legL, legR, torso, head, visor, gun);
    this.group.traverse((mesh) => { if (mesh.isMesh) { mesh.castShadow = true; } });
    this.headMesh = head;
    this.bodyMesh = torso;
    this.hitMeshes = [head, torso];
  }

  eyeHeight() {
    return this.crouched ? PLAYER.crouchEye : PLAYER.eye;
  }

  eyePosition(out) {
    out.set(this.pos.x, this.pos.y + this.eyeHeight(), this.pos.z);
    return out;
  }

  forward(out) {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out;
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.hp = PLAYER.hp;
    this.armor = 0; // armour is re-applied from the loadout after reset
    this.alive = true;
    this.crouched = false;
    this.grounded = true;
    this.group.rotation.set(0, yaw, 0);
    this.group.position.copy(this.pos);
    // The player's own body never renders: the camera sits inside the
    // head, so the visor would fill the screen (and the torso when
    // crouched). The viewmodel gun is the visible weapon. Hit-testing
    // still works — the raycaster does not skip invisible meshes.
    this.group.visible = !this.isPlayer;
  }

  groundSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  // wishX/wishZ: desired move direction in world space (unit or zero).
  // speed: top speed. jump: true on the frame the jump key is pressed.
  move(dt, wishX, wishZ, speed, colliders, jump) {
    if (!this.alive) return;
    const accel = PLAYER.accel * dt;
    const targetX = wishX * speed;
    const targetZ = wishZ * speed;
    this.vel.x = approach(this.vel.x, targetX, accel);
    this.vel.z = approach(this.vel.z, targetZ, accel);
    if (jump && this.grounded) {
      this.vel.y = PLAYER.jumpSpeed;
      this.grounded = false;
    }
    this.vel.y -= PLAYER.gravity * dt;
    const radius = PLAYER.radius;
    const height = this.crouched ? PLAYER.height * 0.72 : PLAYER.height;

    // X axis, then Z axis: slide along walls instead of stopping dead.
    this.pos.x += this.vel.x * dt;
    for (const box of colliders) {
      if (overlapsBox(this.pos, radius, height, box)) {
        this.pos.x = this.vel.x > 0 ? box.min.x - radius : box.max.x + radius;
        this.vel.x = 0;
      }
    }
    this.pos.z += this.vel.z * dt;
    for (const box of colliders) {
      if (overlapsBox(this.pos, radius, height, box)) {
        this.pos.z = this.vel.z > 0 ? box.min.z - radius : box.max.z + radius;
        this.vel.z = 0;
      }
    }

    // Y axis: land on the ground or on a box top, bump the head on a ceiling.
    const oldY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    if (this.vel.y <= 0) {
      let ground = 0;
      for (const box of colliders) {
        const footprint =
          this.pos.x + radius > box.min.x && this.pos.x - radius < box.max.x &&
          this.pos.z + radius > box.min.z && this.pos.z - radius < box.max.z;
        if (footprint && box.max.y <= oldY + 0.01 && box.max.y >= this.pos.y) {
          ground = Math.max(ground, box.max.y);
        }
      }
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.vel.y = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    } else {
      for (const box of colliders) {
        const footprint =
          this.pos.x + radius > box.min.x && this.pos.x - radius < box.max.x &&
          this.pos.z + radius > box.min.z && this.pos.z - radius < box.max.z;
        if (footprint && box.min.y >= oldY + height && box.min.y <= this.pos.y + height) {
          this.pos.y = box.min.y - height;
          this.vel.y = 0;
          break;
        }
      }
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }

  // Raw damage (already multiplied for headshots by the caller). Armour
  // absorbs half the damage until it is gone.
  damage(amount) {
    if (!this.alive) return { died: false, dealt: 0, absorbed: 0 };
    const absorbed = Math.min(this.armor, amount * 0.5);
    this.armor -= absorbed;
    const dealt = amount - absorbed;
    this.hp -= dealt;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.die();
    }
    return { died: !this.alive, dealt, absorbed };
  }

  die() {
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = this.pos.y + 0.25;
  }

  // Keep the mesh in sync when the sim moved the actor without move()
  // (teleports at round start).
  syncMesh() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.alive ? 0 : -Math.PI / 2, this.yaw, 0);
  }
}

function approach(value, target, step) {
  if (value < target) return Math.min(target, value + step);
  if (value > target) return Math.max(target, value - step);
  return value;
}

// Shared scratch: a ray from `origin` along `dir` against Box3 colliders.
// Returns the distance to the nearest blocking box, or Infinity.
export function raycastBoxes(origin, dir, maxDistance, colliders) {
  let nearest = Infinity;
  for (const box of colliders) {
    tmpMin.copy(box.min);
    tmpMax.copy(box.max);
    tmpBox.min.copy(tmpMin);
    tmpBox.max.copy(tmpMax);
    const hit = rayBox(origin, dir, tmpBox);
    if (hit !== null && hit < nearest && hit <= maxDistance) nearest = hit;
  }
  return nearest;
}

// Slab-method ray vs AABB. Returns entry distance or null.
export function rayBox(origin, dir, box) {
  let tmin = 0;
  let tmax = Infinity;
  for (const axis of ['x', 'y', 'z']) {
    const d = dir[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < box.min[axis] || o > box.max[axis]) return null;
    } else {
      let t1 = (box.min[axis] - o) / d;
      let t2 = (box.max[axis] - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
