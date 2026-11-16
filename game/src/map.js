// SABLE YARD — the map. One flat freight yard at dusk: attackers spawn west,
// bomb sites A (north-east) and B (south-east), three lanes between them.
// Boxes are {x, z, w, d, h, mat}: a solid box standing on the ground (y 0..h).
// Waypoints are a nav graph for the bots; bots slide around box corners with
// the same collision the player uses, so edges only need to be roughly clear.
export const MAP = {
  bounds: { minX: -22, maxX: 22, minZ: -18, maxZ: 18, wallH: 4.5 },
  boxes: [
    // Outer walls.
    { x: -22.2, z: 0, w: 0.4, d: 36.4, h: 4.5, mat: 'concrete' },
    { x: 22.2, z: 0, w: 0.4, d: 36.4, h: 4.5, mat: 'concrete' },
    { x: 0, z: -18.2, w: 44.4, d: 0.4, h: 4.5, mat: 'concrete' },
    { x: 0, z: 18.2, w: 44.4, d: 0.4, h: 4.5, mat: 'concrete' },
    // Mid lane cover.
    { x: -6, z: 0, w: 1.6, d: 1.6, h: 1.6, mat: 'containerC' },
    { x: 0, z: -1.8, w: 2.4, d: 1.2, h: 1.1, mat: 'containerB' },
    { x: 0, z: 1.8, w: 1.2, d: 2.4, h: 1.1, mat: 'containerA' },
    { x: 6, z: 0, w: 2.0, d: 1.0, h: 1.2, mat: 'hazard' },
    { x: -12, z: -4, w: 1.2, d: 1.2, h: 1.1, mat: 'containerB' },
    { x: -12, z: 4, w: 1.2, d: 1.2, h: 1.1, mat: 'containerA' },
    { x: -8, z: -6, w: 4.0, d: 0.4, h: 2.6, mat: 'concrete' },
    { x: -8, z: 6, w: 4.0, d: 0.4, h: 2.6, mat: 'concrete' },
    { x: 9.5, z: -4, w: 1.0, d: 1.0, h: 3.2, mat: 'steel' },
    { x: 9.5, z: 4, w: 1.0, d: 1.0, h: 3.2, mat: 'steel' },
    // A-long (north lane) cover.
    { x: -14, z: -13, w: 2.0, d: 1.2, h: 1.1, mat: 'containerA' },
    { x: -4, z: -13, w: 1.6, d: 1.6, h: 1.4, mat: 'containerB' },
    { x: 4, z: -15, w: 2.4, d: 1.2, h: 1.1, mat: 'containerC' },
    // B-short (south lane) cover.
    { x: -14, z: 13, w: 2.0, d: 1.2, h: 1.1, mat: 'containerC' },
    { x: -4, z: 13, w: 1.6, d: 1.6, h: 1.4, mat: 'containerA' },
    { x: 4, z: 15, w: 2.4, d: 1.2, h: 1.1, mat: 'containerB' },
    // Site A container stacks.
    { x: 15, z: -14.5, w: 6.0, d: 2.4, h: 2.6, mat: 'containerA' },
    { x: 18.5, z: -9.5, w: 2.4, d: 2.4, h: 2.6, mat: 'containerB' },
    { x: 12.5, z: -9.5, w: 1.2, d: 1.2, h: 1.1, mat: 'containerC' },
    { x: 15, z: -11, w: 1.2, d: 1.2, h: 2.2, mat: 'steel' },
    // Site B container stacks.
    { x: 15, z: 14.5, w: 6.0, d: 2.4, h: 2.6, mat: 'containerB' },
    { x: 18.5, z: 9.5, w: 2.4, d: 2.4, h: 2.6, mat: 'containerC' },
    { x: 12.5, z: 9.5, w: 1.2, d: 1.2, h: 1.1, mat: 'containerA' },
    { x: 15, z: 11, w: 1.2, d: 1.2, h: 2.2, mat: 'steel' },
    // Spawn cover.
    { x: -17, z: -5, w: 1.2, d: 1.2, h: 1.1, mat: 'containerA' },
    { x: -17, z: 5, w: 1.2, d: 1.2, h: 1.1, mat: 'containerB' },
  ],
  sites: {
    A: { x: 16, z: -12, minX: 11.5, maxX: 20.5, minZ: -16.5, maxZ: -7.5 },
    B: { x: 16, z: 12, minX: 11.5, maxX: 20.5, minZ: 7.5, maxZ: 16.5 },
  },
  spawns: {
    sable: [
      { x: -19.5, z: -2 }, { x: -19.5, z: 2 }, { x: -19, z: 0 },
      { x: -18, z: -3.5 }, { x: -18, z: 3.5 },
    ],
    vulture: [
      { x: 10, z: -8 }, { x: 11, z: -13 }, { x: 10, z: 8 },
      { x: 11, z: 13 }, { x: 2, z: -2 },
    ],
  },
  // Nav graph. Indices: 0 spawn, 1-5 A lane, 6-10 B lane, 11-14 mid,
  // 15-16 mid connectors, 17-21 defender holds.
  waypoints: [
    { x: -19, z: 0 }, { x: -16, z: -13 }, { x: -6, z: -13 }, { x: 4, z: -13 },
    { x: 11, z: -11 }, { x: 16, z: -12 }, { x: -16, z: 13 }, { x: -6, z: 13 },
    { x: 4, z: 13 }, { x: 11, z: 11 }, { x: 16, z: 12 }, { x: -13, z: 0 },
    { x: -5, z: 0 }, { x: 1, z: 0 }, { x: 6, z: -2.5 }, { x: 8, z: -5 },
    { x: 8, z: 5 }, { x: 10, z: -8 }, { x: 11, z: -13 }, { x: 10, z: 8 },
    { x: 11, z: 13 }, { x: 2, z: -2 },
  ],
  edges: [
    [0, 1], [0, 6], [0, 11],
    [1, 2], [2, 3], [3, 4], [4, 5], [4, 15], [15, 5],
    [6, 7], [7, 8], [8, 9], [9, 10], [9, 16], [16, 10],
    [11, 12], [12, 13], [13, 14], [13, 21], [14, 15], [14, 16], [14, 21],
    [17, 4], [17, 15], [17, 5], [18, 5], [18, 4],
    [19, 9], [19, 16], [19, 10], [20, 10], [20, 9],
    [21, 15], [21, 16],
  ],
};

const adjacency = MAP.waypoints.map(() => []);
for (const [a, b] of MAP.edges) {
  adjacency[a].push(b);
  adjacency[b].push(a);
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < MAP.waypoints.length; i += 1) {
    const dx = MAP.waypoints[i].x - x;
    const dz = MAP.waypoints[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

// Breadth-first path over the nav graph. Returns waypoint indices from the
// node after `from` through `to` (empty when already there), or null when the
// graph is disconnected there (never happens on this map).
export function findPath(from, to) {
  if (from === to) return [];
  const previous = new Array(MAP.waypoints.length).fill(-1);
  const queue = [from];
  previous[from] = from;
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of adjacency[current]) {
      if (previous[next] !== -1) continue;
      previous[next] = current;
      if (next === to) {
        const path = [to];
        let node = to;
        while (previous[node] !== node) {
          node = previous[node];
          path.unshift(node);
        }
        return path.slice(1);
      }
      queue.push(next);
    }
  }
  return null;
}

// Which bomb site (if any) a ground position stands in.
export function inSite(x, z) {
  for (const name of ['A', 'B']) {
    const s = MAP.sites[name];
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return name;
  }
  return null;
}
