// The yard in three.js: every MAP box becomes a textured mesh and a
// collider, plus a dusk sky, warm sun with shadows, site markers and a
// skyline silhouette. All textures are drawn on canvas at load time —
// no image files, no network.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { MAP } from './map.js';

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speckle(ctx, size, base, dots, alpha) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i += 1) {
    const shade = Math.random();
    ctx.fillStyle = shade > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.6})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function makeTextures() {
  return {
    concrete: canvasTexture(256, (ctx, s) => {
      speckle(ctx, s, PALETTE.surface, 900, 0.05);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, s - 2, s - 2);
    }),
    floor: canvasTexture(256, (ctx, s) => {
      speckle(ctx, s, '#2e2820', 1200, 0.06);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 3;
      for (let i = 0; i <= 2; i += 1) {
        ctx.beginPath(); ctx.moveTo((i * s) / 2, 0); ctx.lineTo((i * s) / 2, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, (i * s) / 2); ctx.lineTo(s, (i * s) / 2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(185,141,84,0.08)';
      ctx.fillRect(0, 0, s, s);
    }),
    containerA: canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = PALETTE.containerA;
      ctx.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x, 0, 6, s);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + 6, 0, 3, s);
      }
      speckle(ctx, s, 'rgba(0,0,0,0)', 200, 0.08);
    }),
    containerB: canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = PALETTE.containerB;
      ctx.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x, 0, 6, s);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + 6, 0, 3, s);
      }
    }),
    containerC: canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = PALETTE.containerC;
      ctx.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x, 0, 6, s);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + 6, 0, 3, s);
      }
    }),
    steel: canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = PALETTE.steel;
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 8) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, y, s, 2);
      }
      speckle(ctx, s, 'rgba(0,0,0,0)', 300, 0.06);
    }),
    hazard: canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = PALETTE.hazard;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#171310';
      for (let x = -s; x < s * 2; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, s); ctx.lineTo(x + 24, 0); ctx.lineTo(x + 48, 0); ctx.lineTo(x + 24, s);
        ctx.closePath(); ctx.fill();
      }
    }),
  };
}

function letterSprite(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20,16,12,0.55)';
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.2, 2.2, 1);
  return sprite;
}

export function createWorld(scene) {
  const textures = makeTextures();
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  function materialFor(mat, w, h) {
    const texture = textures[mat] || textures.concrete;
    const clone = texture.clone();
    clone.needsUpdate = true;
    clone.repeat.set(Math.max(1, Math.round(w / 2.5)), Math.max(1, Math.round(h / 2.5)));
    return new THREE.MeshStandardMaterial({ map: clone, roughness: 0.9, metalness: 0.06 });
  }

  // Floor.
  const floorTexture = textures.floor.clone();
  floorTexture.needsUpdate = true;
  floorTexture.repeat.set(11, 9);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(44.4, 36.4),
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.95, metalness: 0.02 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  shootables.push(floor);

  // Map boxes.
  for (const box of MAP.boxes) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(box.w, box.h, box.d),
      materialFor(box.mat, box.w, box.h),
    );
    mesh.position.set(box.x, box.h / 2, box.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    shootables.push(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(box.x - box.w / 2, 0, box.z - box.d / 2),
      new THREE.Vector3(box.x + box.w / 2, box.h, box.z + box.d / 2),
    ));
  }

  // Bomb site markers: a ground ring and a floating letter.
  const siteMarkers = {};
  for (const name of ['A', 'B']) {
    const site = MAP.sites[name];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.0, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    const sprite = letterSprite(name, PALETTE.accent);
    sprite.position.set(site.x, 3.6, site.z);
    group.add(sprite);
    siteMarkers[name] = { ring, sprite };
  }

  // Skyline silhouettes outside the walls, for depth at the edges.
  const skylineMat = new THREE.MeshBasicMaterial({ color: 0x33261c });
  const skylineBoxes = [
    [-30, -26, 10, 14], [30, -24, 12, 18], [-32, 10, 8, 10], [32, 14, 9, 12],
    [-10, -30, 14, 11], [14, 30, 11, 16], [0, -34, 8, 9], [-26, 26, 7, 8],
  ];
  for (const [x, z, w, h] of skylineBoxes) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skylineMat);
    mesh.position.set(x, h / 2, z);
    group.add(mesh);
  }

  // Dusk lighting: warm low sun, cool fill, soft hemisphere. Bright
  // enough that the yard (and the north wall) reads in a still frame.
  const sky = new THREE.HemisphereLight(0x9a7a55, 0x2a2018, 1.7);
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffb36b, 3.4);
  sun.position.set(18, 22, -14);
  sun.target.position.set(0, 0, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0x5a6b8a, 0.85);
  fill.position.set(-16, 12, 16);
  scene.add(fill);

  const lampA = new THREE.PointLight(0xf0a830, 14, 18, 1.6);
  lampA.position.set(16, 4.2, -12);
  scene.add(lampA);
  const lampB = new THREE.PointLight(0x2f7f7a, 14, 18, 1.6);
  lampB.position.set(16, 4.2, 12);
  scene.add(lampB);

  return {
    colliders,
    shootables,
    group,
    siteMarkers,
    update(time) {
      for (const name of ['A', 'B']) {
        const marker = siteMarkers[name];
        marker.sprite.position.y = 3.6 + Math.sin(time * 1.4 + (name === 'A' ? 0 : 2)) * 0.12;
        marker.ring.material.opacity = 0.5 + Math.sin(time * 2 + (name === 'A' ? 0 : 1.5)) * 0.12;
      }
      lampA.intensity = 14 + Math.sin(time * 7.3) * 0.8;
    },
  };
}
