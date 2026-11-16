// The HUD: every DOM readout and overlay. The sim never touches the DOM
// directly — it calls these setters, which is also what the play-test reads
// through window.__sable.
import { WEAPONS, GRENADES, ARMOR_PRICE } from './config.js';

const $ = (id) => document.getElementById(id);

export function createHud(callbacks) {
  const elements = {
    health: $('health-value'),
    healthBar: $('health-bar'),
    armor: $('armor-value'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    money: $('money-value'),
    timer: $('timer-value'),
    timerLabel: $('timer-label'),
    scoreSable: $('score-sable'),
    scoreVulture: $('score-vulture'),
    roundLabel: $('round-label'),
    aliveSable: $('alive-sable'),
    aliveVulture: $('alive-vulture'),
    killfeed: $('killfeed'),
    bombStatus: $('bomb-status'),
    hint: $('hint'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    playButton: $('play'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    buyMenu: $('buy-menu'),
    buyItems: $('buy-items'),
    buyMoney: $('buy-money'),
  };


  function renderBuy(money, loadout) {
    // Buy keys are 1-7 and are separate from the in-play weapon slots:
    // while the menu is open, number keys buy instead of switching.
    const items = [];
    for (const [id, key] of [['vk47', '1'], ['viper', '2'], ['breacher', '3'], ['longshot', '4']]) {
      const def = WEAPONS[id];
      const owned = loadout.slots[1] && loadout.slots[1].def.id === id || loadout.slots[2] && loadout.slots[2].def.id === id;
      items.push({ id, name: def.name, price: def.price, detail: `${def.damage} dmg · ${def.mag} rnd`, owned, key });
    }
    items.push({ id: 'frag', name: 'FRAG GRENADE', price: GRENADES.frag.price, detail: `blast ${GRENADES.frag.damage} dmg`, owned: false, count: loadout.frag, key: '5' });
    items.push({ id: 'smoke', name: 'SMOKE GRENADE', price: GRENADES.smoke.price, detail: `blocks sight ${GRENADES.smoke.duration}s`, owned: false, count: loadout.smoke, key: '6' });
    items.push({ id: 'armor', name: 'KEVLAR VEST', price: ARMOR_PRICE, detail: 'absorbs half of all damage', owned: loadout.armor >= 100, key: '7' });
    elements.buyItems.innerHTML = '';
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      if (item.owned) button.classList.add('owned');
      if (money < item.price && !item.owned) button.classList.add('poor');
      const count = item.count ? ` ×${item.count}` : '';
      button.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}${count}</span><span class="buy-detail">${item.detail}</span><span class="buy-price">${item.owned ? 'OWNED' : '$' + item.price}</span>`;
      button.addEventListener('click', () => callbacks.onBuy(item.id));
      elements.buyItems.appendChild(button);
    }
    elements.buyMoney.textContent = `$${money}`;
  }

  return {
    setHealth(hp, armor) {
      elements.health.textContent = Math.ceil(hp);
      elements.healthBar.style.width = `${Math.max(0, hp)}%`;
      elements.healthBar.classList.toggle('low', hp <= 30);
      elements.armor.textContent = Math.ceil(armor);
    },
    setAmmo(mag, reserve, name) {
      elements.ammoMag.textContent = mag;
      elements.ammoReserve.textContent = `/ ${reserve}`;
      elements.weaponName.textContent = name;
    },
    setMoney(money) {
      elements.money.textContent = `$${money}`;
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      elements.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      elements.timerLabel.textContent = phase === 'freeze' ? 'BUY PHASE' : phase === 'live' ? 'ROUND' : phase === 'ended' ? 'ROUND OVER' : 'MATCH';
    },
    setScore(sable, vulture, round) {
      elements.scoreSable.textContent = sable;
      elements.scoreVulture.textContent = vulture;
      const matchPoint = sable === 6 || vulture === 6;
      elements.roundLabel.textContent = matchPoint ? `ROUND ${round} — MATCH POINT` : `ROUND ${round}`;
    },
    setAlive(sable, vulture) {
      elements.aliveSable.textContent = `${sable} alive`;
      elements.aliveVulture.textContent = `${vulture} alive`;
    },
    setBombStatus(text, urgent) {
      elements.bombStatus.textContent = text;
      elements.bombStatus.classList.toggle('urgent', !!urgent);
    },
    hint(text) {
      elements.hint.textContent = text;
      elements.hint.hidden = !text;
    },
    killfeed(entries) {
      elements.killfeed.innerHTML = '';
      for (const entry of entries.slice(-5)) {
        const line = document.createElement('div');
        line.className = 'feed-line';
        const killer = entry.killer ? `<span class="feed-killer">${entry.killer}</span>` : '<span class="feed-killer">—</span>';
        line.innerHTML = `${killer}<span class="feed-weapon">${entry.headshot ? '◉' : '✕'}</span><span class="feed-victim">${entry.victim}</span>`;
        elements.killfeed.appendChild(line);
      }
    },
    hitmarker(kill, holdMs) {
      elements.hitmarker.classList.add('on');
      elements.hitmarker.classList.toggle('kill', kill);
      // In ?shot= captures the first paint can land many seconds after the
      // shot (software-renderer shader compile), so the marker holds long
      // enough to survive until the capture.
      const hold = holdMs ?? (new URLSearchParams(window.location.search).get('shot') ? 30000 : kill ? 220 : 120);
      window.setTimeout(() => elements.hitmarker.classList.remove('on', 'kill'), hold);
    },
    setCrosshairGap(pixels) {
      elements.crosshair.style.setProperty('--gap', `${pixels.toFixed(1)}px`);
    },
    setScoped(scoped) {
      elements.crosshair.classList.toggle('scoped', scoped);
    },
    banner(title, sub, team) {
      elements.bannerTitle.textContent = title;
      elements.bannerSub.textContent = sub;
      elements.banner.className = `banner show ${team || ''}`;
      const hold = new URLSearchParams(window.location.search).get('shot') ? 30000 : 3200;
      window.setTimeout(() => elements.banner.classList.remove('show'), hold);
    },
    showOverlay(mode, data = {}) {
      const overlay = elements.overlay;
      overlay.hidden = false;
      if (mode === 'start') {
        elements.overlayTitle.textContent = 'SABLE BREACH';
        elements.overlayCopy.textContent = 'Plant the spike at Site A or Site B — or eliminate all five VULTURE defenders. First to 7 rounds takes the yard.';
        elements.playButton.textContent = 'Click to play';
        elements.playButton.hidden = false;
      } else if (mode === 'paused') {
        elements.overlayTitle.textContent = 'PAUSED';
        elements.overlayCopy.textContent = 'Click to return to the yard.';
        elements.playButton.textContent = 'Resume';
        elements.playButton.hidden = false;
      } else if (mode === 'matchover') {
        const winner = data.winner === 'sable' ? 'SABLE TAKES THE YARD' : data.winner === 'vulture' ? 'VULTURE HOLDS THE YARD' : 'DRAW';
        elements.overlayTitle.textContent = winner;
        elements.overlayCopy.textContent = `Final score — SABLE ${data.score.sable} : ${data.score.vulture} VULTURE.`;
        elements.playButton.textContent = 'Play again';
        elements.playButton.hidden = false;
      }
    },
    hideOverlay() {
      elements.overlay.hidden = true;
    },
    showBuy(money, loadout) {
      renderBuy(money, loadout);
      elements.buyMenu.hidden = false;
    },
    hideBuy() {
      elements.buyMenu.hidden = true;
    },
    get buyOpen() {
      return !elements.buyMenu.hidden;
    },
    onPlay(callback) {
      elements.playButton.addEventListener('click', callback);
    },
  };
}
