// The match: rounds, freeze time, the bomb, the economy and the score.
// Pure logic (no three.js) so the unit tests can play whole rounds in Node.
// The main loop drains `events` after every step; the HUD and audio react
// to those events, never to the match internals.
import { MATCH, ECONOMY } from './config.js';
import { buy as buyItem } from './weapons.js';

export class Match {
  constructor() {
    this.round = 0;
    this.score = { sable: 0, vulture: 0 };
    this.phase = 'idle';
    this.timer = 0;
    this.bomb = { state: 'carried', site: null, x: 0, z: 0, timer: 0, carrier: null };
    this.money = new Map();
    this.lossStreak = { sable: 0, vulture: 0 };
    this.kills = { sable: 0, vulture: 0 };
    this.feed = [];
    this.events = [];
    this.winner = null;
    this.roundWinner = null;
    this.roundReason = '';
  }

  startMatch(actors, carrier) {
    this.round = 0;
    this.score = { sable: 0, vulture: 0 };
    this.lossStreak = { sable: 0, vulture: 0 };
    this.kills = { sable: 0, vulture: 0 };
    this.winner = null;
    for (const actor of actors) this.money.set(actor, MATCH.startMoney);
    this.startRound(actors, carrier);
  }

  startRound(actors, carrier) {
    this.round += 1;
    this.phase = 'freeze';
    this.timer = MATCH.freezeSeconds;
    this.bomb = { state: 'carried', site: null, x: 0, z: 0, timer: 0, carrier };
    this.feed = [];
    this.roundWinner = null;
    this.roundReason = '';
    this.events.push({ type: 'round-freeze', round: this.round });
  }

  moneyFor(actor) {
    return this.money.get(actor) ?? MATCH.startMoney;
  }

  buyFor(actor, itemId, loadout) {
    const money = this.moneyFor(actor);
    const result = buyItem(loadout, itemId, money);
    if (result.ok) this.money.set(actor, money - result.cost);
    return result;
  }

  addMoney(actor, amount) {
    const next = Math.min(ECONOMY.maxMoney, this.moneyFor(actor) + amount);
    this.money.set(actor, next);
  }

  onKill(killer, victim, headshot, time) {
    if (killer && killer !== victim) {
      this.addMoney(killer, ECONOMY.kill);
      this.kills[killer.team] += 1;
    }
    this.feed.push({ killer: killer ? killer.name : null, victim: victim.name, headshot, time });
    if (this.feed.length > 5) this.feed.shift();
    this.events.push({ type: 'kill', killer, victim, headshot });
    if (this.bomb.carrier === victim) {
      this.bomb.state = 'dropped';
      this.bomb.x = victim.pos.x;
      this.bomb.z = victim.pos.z;
      this.bomb.carrier = null;
      this.events.push({ type: 'bomb-dropped', x: this.bomb.x, z: this.bomb.z });
    }
  }

  pickupBomb(actor) {
    if (this.bomb.state !== 'dropped' || actor.team !== 'sable') return false;
    this.bomb.state = 'carried';
    this.bomb.carrier = actor;
    this.events.push({ type: 'bomb-pickup', actor });
    return true;
  }

  completePlant(site, actor) {
    if (this.bomb.state !== 'carried' || this.bomb.carrier !== actor) return false;
    this.bomb.state = 'planted';
    this.bomb.site = site;
    this.bomb.x = actor.pos.x;
    this.bomb.z = actor.pos.z;
    this.bomb.timer = MATCH.bombSeconds;
    this.addMoney(actor, ECONOMY.plant);
    this.events.push({ type: 'bomb-planted', site, actor });
    return true;
  }

  completeDefuse(actor) {
    if (this.bomb.state !== 'planted') return false;
    this.bomb.state = 'defused';
    this.events.push({ type: 'bomb-defused', actor });
    this.endRound('vulture', 'defuse');
    return true;
  }

  endRound(winner, reason) {
    if (this.phase === 'ended' || this.phase === 'matchover') return;
    this.phase = 'ended';
    this.timer = MATCH.roundEndSeconds;
    this.score[winner] += 1;
    this.roundWinner = winner;
    this.roundReason = reason;
    const loser = winner === 'sable' ? 'vulture' : 'sable';
    this.lossStreak[winner] = 0;
    this.lossStreak[loser] += 1;
    const lossPay = Math.min(
      ECONOMY.lossStreakMax,
      ECONOMY.loss + ECONOMY.lossStreakBonus * (this.lossStreak[loser] - 1),
    );
    for (const [actor, money] of this.money) {
      const pay = actor.team === winner ? ECONOMY.win : lossPay;
      this.money.set(actor, Math.min(ECONOMY.maxMoney, money + pay));
    }
    this.events.push({ type: 'round-end', winner, reason, score: { ...this.score } });
  }

  // Advance timers and check the round end conditions. `alive` is
  // { sable, vulture } counts of living actors this step.
  tick(dt, alive) {
    if (this.phase === 'freeze') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'live';
        this.timer = MATCH.roundSeconds;
        this.events.push({ type: 'round-start', round: this.round });
      }
      return;
    }
    if (this.phase === 'live') {
      this.timer -= dt;
      if (this.bomb.state === 'planted') {
        this.bomb.timer -= dt;
        if (this.bomb.timer <= 0) {
          this.bomb.state = 'detonated';
          this.events.push({ type: 'bomb-exploded', site: this.bomb.site, x: this.bomb.x, z: this.bomb.z });
          this.endRound('sable', 'detonation');
          return;
        }
      }
      if (alive.sable === 0 && this.bomb.state !== 'planted') {
        this.endRound('vulture', 'elimination');
        return;
      }
      if (alive.vulture === 0) {
        this.endRound('sable', 'elimination');
        return;
      }
      if (this.timer <= 0) {
        this.endRound('vulture', 'time');
      }
      return;
    }
    if (this.phase === 'ended') {
      this.timer -= dt;
      if (this.timer <= 0) {
        const sableWon = this.score.sable >= MATCH.winRounds;
        const vultureWon = this.score.vulture >= MATCH.winRounds;
        const outOfRounds = this.round >= MATCH.maxRounds;
        if (sableWon || vultureWon || outOfRounds) {
          this.phase = 'matchover';
          this.winner = sableWon ? 'sable' : vultureWon ? 'vulture' : (this.score.sable > this.score.vulture ? 'sable' : this.score.vulture > this.score.sable ? 'vulture' : 'draw');
          this.events.push({ type: 'match-end', winner: this.winner, score: { ...this.score } });
        } else {
          this.events.push({ type: 'next-round' });
        }
      }
    }
  }
}
