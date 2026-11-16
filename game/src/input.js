// Keyboard + mouse + pointer lock. Holds the live key set and accumulates
// mouse-look deltas; edge-triggered keys (buy, plant, reload, slots) go
// through takePressed() so the sim consumes each press exactly once.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    lookX: 0,
    lookY: 0,
    firing: false,
    scoped: false,
    locked: false,
  };
  const pressed = new Set();

  function onKeyDown(event) {
    if (event.repeat) return;
    state.keys.add(event.code);
    pressed.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  function onKeyUp(event) {
    state.keys.delete(event.code);
  }

  function onMouseMove(event) {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  }

  function onMouseDown(event) {
    // Only clicks on the canvas itself fire the weapon — clicks on the
    // title overlay or the buy menu must not. Pointer lock is not required:
    // if it is unavailable (headless capture, denied permission) the game
    // still plays with keyboard + click, just without mouse look.
    if (event.target !== canvas) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.scoped = true;
  }

  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.scoped = false;
  }

  function onLock() {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      state.firing = false;
      state.scoped = false;
    }
    onLockChange(state.locked);
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    state,
    requestLock() {
      try {
        const promise = canvas.requestPointerLock();
        if (promise && promise.catch) promise.catch(() => {});
      } catch {
        // Pointer lock is unavailable (headless capture); the game still runs.
      }
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    // Returns and clears the set of codes pressed since the last call.
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
    clearPressed() {
      pressed.clear();
    },
  };
}
