/* Teselo 1.2.0 | (c) Cesar Pereiro | code and sounds original; third-party art credited in gamekit/CREDITS.md */

/* ---- gamekit/meta/util.js ---- */
/* gamekit util: seeded RNG, string hash, calendar days, deep merge. Platform layer: no game code. */
(function (root) {
  'use strict';
  function hashString(str) {
    var h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function utc(key) { var p = key.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  // whole calendar days from `epoch` to `key` (YYYY-MM-DD), 1 on the epoch day
  function dayNumber(key, epoch) { return Math.round((utc(key) - utc(epoch)) / 86400000) + 1; }
  function prevKey(key) {
    var t = new Date(utc(key) - 86400000);
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }
  // deep merge for config: plain objects merge, arrays listed in `concat` are appended, everything else replaces
  function merge(base, over, concat) {
    concat = concat || [];
    var out = {};
    Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });
    Object.keys(over || {}).forEach(function (k) {
      var b = out[k], o = over[k];
      if (Array.isArray(b) && Array.isArray(o) && concat.indexOf(k) >= 0) out[k] = b.concat(o);
      else if (b && o && typeof b === 'object' && typeof o === 'object' && !Array.isArray(b) && !Array.isArray(o)) out[k] = merge(b, o, concat);
      else out[k] = o;
    });
    return out;
  }
  var U = { hashString: hashString, rng: rng, dateKey: dateKey, dayNumber: dayNumber, prevKey: prevKey, merge: merge };
  if (typeof module !== 'undefined' && module.exports) module.exports = U;
  else root.GamekitUtil = U;
})(this);

/* ---- gamekit/economy/config.js ---- */
/* gamekit platform defaults: economy, meta loops, ads and store numbers shared by every game.
 * A game adds its own section (boosters, skins, quest pool, coin rates per mode, extra products) in its
 * game config; Gamekit merges both (GamekitUtil.merge(GamekitConfig, gameConfig, ['products', 'skins'])).
 * Values follow MONETIZATION.md sections 2 and 7. Remote Config (meta/remote.js) can override any number
 * at runtime; keys are the dotted paths, e.g. "ads.interstitialMinGapMs".
 * One soft currency only (coins). Real-money items are priced in euros by the store, never in coins.
 */
(function (root) {
  'use strict';
  var CONFIG = {
    platform: { epoch: '2026-10-26' },   // a Monday: day #1 for daily numbering, weeks and seasons

    // ---- coins earned by play (rates per mode come from the game: coins.modes) ----
    // economy v2 (MONETIZATION.md addendum B): coins are scarce enough that a booster is a decision. A free player
    // affords about one booster every 4-6 levels from play + daily rewards; rewarded ads add a bounded extra.
    coins: {
      modes: {},             // { endless: { base: 0, per100: 1 }, ... }   coins = base + floor(score/100) * per100
      levelWin: 10,          // fallback when a level has no difficulty tier
      // first win of a level, by its difficulty tier (level spec .difficulty): hard levels pay more
      tierWin: { facil: 4, normal: 8, dificil: 16, superdificil: 30 },
      tierMult: { facil: 1, normal: 1, dificil: 1.5, superdificil: 2 },   // x star coins and x pass XP of a first win
      firstWinOnly: true,    // a replayed level pays only the stars it improves (no farming level 1)
      perNewStar: 1,         // each star above the previous best on that level (x tierMult)
      firstThreeStars: 3,    // bonus the first time a level gets 3 stars (x tierMult)
      doubleWithAd: true,    // R2: rewarded ad doubles the coins of one result screen ...
      doublePerDay: 6        // ... at most 6 times a day (was 4)
    },

    // ---- boosters: ids, start counts and prices come from the game ----
    boosters: { start: {}, price: {}, max: 99 },
    continueCoins: 400,      // continue without an ad (fail screen); retry is always free, no lives. v2: ~1 per 3 sessions

    // ---- cosmetics: provided by the game (price: coins | iap: product id | passOnly | starterOnly) ----
    skins: [],

    // ---- chests: EARNED by play only. Timer based. FIXED contents, shown on the chest. Never sold. ----
    chests: {
      slots: 4,
      // rarity tiers: common / rare / epic / legendary (colours in shell/fun.css)
      types: {
        wood: { unlockMin: 15, coins: 25, boosters: 0, rarity: 'common' },
        silver: { unlockMin: 60, coins: 50, boosters: 1, rarity: 'rare' },
        gold: { unlockMin: 180, coins: 100, boosters: 2, rarity: 'epic' },
        crystal: { unlockMin: 360, coins: 250, boosters: 3, rarity: 'legendary' }
      },
      order: ['wood', 'silver', 'gold', 'crystal'],
      // lucky upgrade when opening a chest EARNED by play: chance to become the next tier (shown on the chest).
      // Chests from paid sources (premium pass) are fixed and never roll.
      lucky: { wood: 0.10, silver: 0.06, gold: 0.03 },
      boosterOrder: [],      // game: which boosters a chest gives, in order
      levelMilestone: 20,    // a silver chest every 20 levels won for the first time
      adSkipsPerDay: 3       // R3: a rewarded ad opens the chest that is unlocking
    },

    // ---- streak (Duolingo-style flame) ----
    streak: {
      freezePrice: 300, maxFreezes: 2, startFreezes: 1,
      milestones: { 3: 30, 7: 60, 14: 120, 30: 250, 100: 600 },    // coins, once each
      repairEveryDays: 7,    // R5: one rewarded streak repair per 7 days, for a streak broken yesterday
      multipliers: { 3: 1.1, 7: 1.15, 14: 1.2, 30: 1.25 },          // result-screen coins (games and levels) x by live streak; not quests
      gifts: { 3: { spins: 1 }, 7: { chest: 'silver' }, 14: { chest: 'gold', spins: 1 }, 30: { chest: 'crystal', spins: 2 } }  // fixed, once each
    },

    // ---- daily prize wheel: free spin + 1 rewarded-ad spin per day + spins EARNED by play. Never sold. ----
    //      weights are the exact odds shown in the (i) sheet (weight / sum). Coins-only EV ~13 / spin (v2).
    //      Segment ids keep their v1 names (c10 ... c80) so saved spin history and analytics stay comparable.
    wheel: {
      freePerDay: 1, adPerDay: 2, maxBank: 5,   // adPerDay was 1
      questSpins: 1,         // claiming all daily quests banks a spin
      segments: [
        { id: 'c10', weight: 33, reward: { coins: 5 } },
        { id: 'c20', weight: 24, reward: { coins: 10 } },
        { id: 'c40', weight: 18, reward: { coins: 20 } },
        { id: 'boost', weight: 4, reward: { booster: 1 } },
        { id: 'c80', weight: 11, reward: { coins: 40 } },
        { id: 'chest1', weight: 6, reward: { chest: 'wood' } },
        { id: 'chest2', weight: 3, reward: { chest: 'silver' } },
        { id: 'skin', weight: 1, reward: { skin: true, orCoins: 80 } }
      ]
    },

    // ---- player level (lifetime XP, same XP as the pass): need(n) = base + step * (n - 1) ----
    levels: { base: 120, step: 30, coins: 12, coinsStep: 2, spinEvery: 3, chestEvery: 10, chest: 'silver' },

    // ---- lucky moment: the game reports a big moment (combo); chance of x2 game coins, bounded ----
    lucky: { chance: 0.12, minStrength: 3, maxPerDay: 2, mult: 2, cap: 60 },

    // ---- weekly league: 30 players, top 5 up, bottom 5 down, chest by rank. League points = XP this week ----
    league: {
      tiers: ['bronze', 'silver', 'gold', 'sapphire', 'ruby', 'emerald', 'amethyst', 'diamond'],
      size: 30, promote: 5, demote: 5,
      base: 420, growth: 1.18,           // rivals' typical week at tier t: base * growth^t (nudged by the player's own pace)
      rewards: [{ to: 1, chest: 'gold' }, { to: 3, chest: 'silver' }, { to: 10, chest: 'wood' }],
      legendaryFrom: 4                   // 1st place from tier 4 (ruby) up gets the legendary chest
    },

    // ---- ranking (daily challenge): rewards granted by the server next login; CPU rivals top up thin tables ----
    ranking: { rewards: { top3: 120, top10: 50, play: 10 }, fillTo: 20, botScore: {} },

    // ---- gamekit-api (build sets window.GAMEKIT_API; empty = offline only) ----
    online: { timeoutMs: 9000 },

    // ---- other rewarded placements (opt-in) ----
    rewarded: {
      dailyGiftBoosters: 1,  // R4: once a day, one booster of the player's choice
      shopCoins: 20,         // R6: free coins in the shop
      shopCoinsPerDay: 5     // was 3
    },

    // ---- quests: the pool (metrics the game reports) comes from the game ----
    quests: { dailyCount: 3, weeklyCount: 3, daily: [], weekly: [], allDailyChest: 'wood', allWeeklyChest: 'gold' },

    // ---- season pass: free row for everyone, premium row = one non-consumable product per season ----
    pass: {
      seasonDays: 28,
      tiers: 30,
      xpPerTier: 200,           // v2: an engaged player (~450 XP/day) finishes 30 tiers in ~2 weeks, a casual one in ~4
      xp: { game: 10, daily: 25, levelWin: 20, star: 5 },
      // games override these two with their own skins / boosters
      free: function (t) { return t % 10 === 0 ? { chest: 'silver' } : { coins: 15 }; },
      premium: function (t) { return t % 5 === 0 ? { chest: 'gold' } : { coins: 80 }; }
    },

    // ---- offers ----
    starterPack: { afterLevel: 10, windowHours: 72 },
    piggy: { share: 0.30, breakAt: 1200, cap: 3000 },   // v2: income is lower, so a bigger share fills it in ~2 weeks
    // limited-time offers + the between-games rhythm (meta/offers.js, MONETIZATION.md addendum D). Every number is a
    // Remote Config key (offers.breakMin, offers.oneshot.1.cooldownDays, ...). Timers are real: an offer that ends is gone.
    offers: {
      breakMin: 3, breakMax: 5,      // one interruption (interstitial OR offer) every 3-5 finished games, random; never 2 within 3 games
      offerShare: 0.34,              // a due slot shows an offer instead of the interstitial ~1 in 3 (when an offer is eligible)
      offerFallback: true,           // an eligible offer may take a slot whose interstitial cannot show (not loaded, gap, grace)
      noAdsOfferShare: 0.1,          // remove_ads buyers: never an interstitial; an offer in 1 of 10 slots, otherwise nothing
      minGapMin: 20,                 // minutes between two offer popups (between games or app start)
      maxPerDay: 3,                  // offer popups per day
      perOffer: 2,                   // popups per timed offer (league / weekend / starter); afterwards only its shop card
      minValuePct: 20,               // a value badge needs at least +20%
      leagueHours: 24,               // a league-up pack lives 24 h from the promotion
      // first promotion to tier t -> this product ('' = none). Tiers: bronze silver gold sapphire ruby emerald amethyst diamond
      leagueProducts: ['', 'offer_silver', 'offer_gold', 'offer_gold', 'offer_gold', 'offer_diamond', 'offer_diamond', 'offer_diamond'],
      weekendProduct: 'offer_weekend', weekendStartDay: 5, weekendDays: 3, weekendEveryWeeks: 2,   // Fri 00:00 - Mon 00:00, every 2nd week
      oneshotMinutes: 15,            // a one-shot offer is valid while its popup is open (15 min at most), then gone
      // one-shot "OFERTA ÚNICA" pool: weight, and days before the same product can be offered again
      oneshot: [
        { product: 'offer_oneshot_s', weight: 3, cooldownDays: 3 },
        { product: 'offer_oneshot_m', weight: 1, cooldownDays: 14 },
        { product: 'double_2h', weight: 2, cooldownDays: 2 }
      ],
      appStart: { minSessions: 2, minGames: 3 }   // app-start popup: never on the first launch, only after 3 finished games
    },

    // ---- feature unlock order (avoid day-1 overload): reached level OR finished games ----
    unlocks: {
      boosters: { level: 3, games: 2 },
      quests: { level: 5, games: 4 },
      chests: { level: 8, games: 6 },
      pass: { level: 15, games: 12 },
      freeze: { days: 2 },
      starter: { level: 10 },
      piggy: { level: 20 },
      offers: { level: 6, games: 5 }   // offer popups (also gated by the day-0 grace of the ads)
    },

    // ---- ads policy (the adapter enforces it) ----
    ads: {
      // Policy-safe: only at a result-screen tap (natural break after a user action), never on launch, never mid-level,
      // always closable, preloaded only. HOW OFTEN is decided by the between-games rhythm in `offers` (one interruption,
      // ad or offer, every 3-5 games; code 5). These numbers are the ads layer's own floors.
      interstitialMinGapMs: 75000,   // >= 75 s between two interstitials
      sessionStartGapMs: 90000,      // none in the first 90 s after launch (no app-open ads)
      afterRewardedGapMs: 60000,     // none in the 60 s after a rewarded
      levelsBetweenInterstitials: 3, // the ads layer's own floor; the rhythm (3-5 games, ad or offer) is offers.breakMin/Max
      graceLevel: 4,                 // day 0: none before level 4 (first 3 levels ad-free) ...
      graceGames: 3,                 // ... or the 3rd finished non-level game
      continueExtraMoves: 5,
      maxAdContentRating: 'T'
    },

    // ---- store (Google Play Billing; ids must match the Play Console). Prices are fallbacks: cards show the
    //      store's localised price (IAP.price) and exactly what each item grants. Games append their own. ----
    products: [
      { id: 'remove_ads', type: 'non_consumable', price: '4,99 €', grant: { noAds: true } },
      // v2: sized in boosters (~300 coins each): S = 6-7, M = 18, L = 40. Multiples of 200 (cheapest booster)
      { id: 'coins_s', type: 'consumable', price: '1,99 €', grant: { coins: 2000 } },
      { id: 'coins_m', type: 'consumable', price: '4,99 €', grant: { coins: 5600 } },
      { id: 'coins_l', type: 'consumable', price: '9,99 €', grant: { coins: 12000 } },
      { id: 'piggy_bank', type: 'consumable', price: '2,99 €', offer: 'piggy', grant: { piggy: true } },
      // one product per season: pass_s01, pass_s02, ... (meta.passProductId())
      { id: 'pass_s{NN}', type: 'non_consumable', price: '4,99 €', season: true, grant: { passPremium: true } },
      // offers (meta/offers.js). Same bundle as coins_l (9,99 €) for 2,99 €: a true -70%, only in its one-shot popup
      { id: 'offer_oneshot_m', type: 'consumable', price: '2,99 €', offer: 'oneshot', sameAs: 'coins_l', grant: { coins: 12000 } },
      // x2 coins from games for 2 h (regular shop item, sometimes offered between games)
      { id: 'double_2h', type: 'consumable', price: '0,99 €', grant: { doubleHours: 2 } }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.GamekitConfig = CONFIG;
})(this);

/* ---- gamekit/economy/economy.js ---- */
/* gamekit economy: one soft currency (coins), boosters, cosmetics, piggy bank, reward granting.
 * Pure logic over a plain state object that lives inside the save (save.data.economy).
 *
 *   var eco = GamekitEconomy.create(state, config, { onChange, track, onGrant, now })
 *   eco.coins, eco.earn(n, source), eco.spend(n, sink) -> bool
 *   eco.boosters(id), eco.useBooster(id) -> bool, eco.buyBooster(id) -> bool, eco.addBooster(id, n, source)
 *   eco.owns(skin), eco.buySkin(skin) -> bool (coin skins only), eco.equip(skin), eco.equipped(kind)
 *   eco.noAds            remove_ads bought, or inside a timed no-ads window (starter pack)
 *   eco.piggy, eco.piggyBreakable()
 *   eco.grant(reward, source) -> what was granted
 *        reward: {coins, boosters:{id:n}, skin, noAds, noAdsDays, doubleHours, passPremium:'s3', piggy, chest, xp, freeze}
 *   eco.doubleActive(), eco.doubleLeft()   "Monedas x2" hours (doubleHours grant): coins from games x2 until then
 *   eco.gameCoins(mode, score) / eco.levelCoins(stars, prevStars)
 * chest / xp / freeze in a reward are handed to the meta layer through hooks.onGrant.
 */
(function (root) {
  'use strict';

  function defaults(cfg) {
    var b = {};
    Object.keys(cfg.boosters.start).forEach(function (k) { b[k] = cfg.boosters.start[k]; });
    // every free skin (price 0) is owned from the start; the first free skin of each kind is equipped
    var free = cfg.skins.filter(function (s) { return s.price === 0; }), eq = {};
    free.forEach(function (s) { if (!eq[s.kind]) eq[s.kind] = s.id; });
    return { coins: 0, boosters: b, skins: free.map(function (s) { return s.id; }), equipped: eq,
      noAds: false, noAdsUntil: 0, doubleUntil: 0, passPremium: {}, piggy: 0, owned: [], earned: 0, spent: 0 };
  }

  function create(state, cfg, hooks) {
    hooks = hooks || {};
    var now = hooks.now || function () { return Date.now(); };
    var changed = function () { if (hooks.onChange) hooks.onChange(state); };
    var track = function (name, p) { if (hooks.track) hooks.track(name, p); };
    var skinById = {};
    cfg.skins.forEach(function (s) { skinById[s.id] = s; });
    state.piggy = state.piggy || 0;
    state.owned = state.owned || [];
    state.noAdsUntil = state.noAdsUntil || 0;
    state.doubleUntil = state.doubleUntil || 0;

    var eco = {
      state: state,
      get coins() { return state.coins; },
      get noAds() { return !!state.noAds || now() < state.noAdsUntil; },
      // "Monedas x2": coins from games are doubled until doubleUntil (bought hours, persisted, real clock)
      doubleActive: function () { return now() < state.doubleUntil; },
      doubleLeft: function () { return Math.max(0, state.doubleUntil - now()); },
      get piggy() { return Math.floor(state.piggy); },
      piggyBreakable: function () { return state.piggy >= cfg.piggy.breakAt; },
      earn: function (n, source) {
        n = Math.max(0, Math.floor(n || 0));
        if (!n) return 0;
        state.coins += n; state.earned += n;
        // 10% of coins earned by playing also drop into the piggy bank (not purchased coins)
        if (!/^(iap_|piggy)/.test(source || '')) state.piggy = Math.min(cfg.piggy.cap, state.piggy + n * cfg.piggy.share);
        track('currency_earn', { currency: 'coins', amount: n, source: source || '' });
        changed();
        return n;
      },
      spend: function (n, sink) {
        n = Math.floor(n);
        if (n < 0 || state.coins < n) return false;
        state.coins -= n; state.spent += n;
        track('currency_spend', { currency: 'coins', amount: n, sink: sink || '' });
        changed();
        return true;
      },
      boosters: function (id) { return state.boosters[id] || 0; },
      addBooster: function (id, n, source) {
        state.boosters[id] = Math.min(cfg.boosters.max, (state.boosters[id] || 0) + (n || 1));
        track('booster_earn', { booster: id, amount: n || 1, source: source || '' });
        changed();
      },
      useBooster: function (id) {
        if (!state.boosters[id]) return false;
        state.boosters[id]--;
        track('booster_used', { booster: id });
        changed();
        return true;
      },
      buyBooster: function (id) {
        var price = cfg.boosters.price[id];
        if (price == null || (state.boosters[id] || 0) >= cfg.boosters.max) return false;
        if (!eco.spend(price, 'booster_' + id)) return false;
        state.boosters[id] = (state.boosters[id] || 0) + 1;
        changed();
        return true;
      },
      skin: function (id) { return skinById[id] || null; },
      owns: function (id) { return state.skins.indexOf(id) >= 0; },
      // coin skins only; iap / pass / starter skins arrive through grant()
      buySkin: function (id) {
        var s = skinById[id];
        if (!s || eco.owns(id) || s.iap || s.passOnly || s.starterOnly || typeof s.price !== 'number') return false;
        if (!eco.spend(s.price, 'skin_' + id)) return false;
        state.skins.push(id);
        changed();
        return true;
      },
      equip: function (id) {
        var s = skinById[id];
        if (!s || !eco.owns(id)) return false;
        state.equipped[s.kind] = id;
        changed();
        return true;
      },
      equipped: function (kind) { return skinById[state.equipped[kind]] || cfg.skins.filter(function (s) { return s.kind === kind; })[0]; },
      // non-consumable products already granted (restore must not grant twice)
      ownsProduct: function (id) { return state.owned.indexOf(id) >= 0; },
      markProduct: function (id) { if (state.owned.indexOf(id) < 0) state.owned.push(id); },
      grant: function (reward, source) {
        var got = {};
        if (!reward) return got;
        if (reward.coins) got.coins = eco.earn(reward.coins, source);
        if (reward.boosters) {
          got.boosters = {};
          Object.keys(reward.boosters).forEach(function (k) { eco.addBooster(k, reward.boosters[k], source); got.boosters[k] = reward.boosters[k]; });
        }
        if (reward.skin && skinById[reward.skin] && !eco.owns(reward.skin)) { state.skins.push(reward.skin); got.skin = reward.skin; }
        if (reward.noAds) { state.noAds = true; got.noAds = true; }
        if (reward.noAdsDays) { state.noAdsUntil = Math.max(now(), state.noAdsUntil) + reward.noAdsDays * 86400000; got.noAdsDays = reward.noAdsDays; }
        if (reward.doubleHours) { state.doubleUntil = Math.max(now(), state.doubleUntil) + reward.doubleHours * 3600000; got.doubleHours = reward.doubleHours; }
        if (reward.passPremium) { state.passPremium[reward.passPremium === true ? 'current' : reward.passPremium] = true; got.passPremium = true; }
        if (reward.piggy) {
          var p = Math.floor(state.piggy);
          state.piggy = 0;
          got.coins = (got.coins || 0) + eco.earn(p, 'piggy');
        }
        if (hooks.onGrant) hooks.onGrant(reward, got, source); // chest, xp, freeze -> meta
        changed();
        return got;
      },
      gameCoins: function (mode, score) {
        var m = (cfg.coins.modes || {})[mode];
        return m ? (m.base || 0) + Math.floor(score / 100) * (m.per100 || 0) : 0;
      },
      // economy v2 (MONETIZATION.md addendum B): the win itself pays once (first win), scaled by the level's
      // difficulty tier; a replay pays only stars it improves. Hard levels pay more (tierWin, tierMult).
      levelCoins: function (stars, prevStars, difficulty) {
        var c = cfg.coins, prev = prevStars || 0;
        var win = c.tierWin && c.tierWin[difficulty] != null ? c.tierWin[difficulty] : c.levelWin;
        var mult = c.tierMult && c.tierMult[difficulty] != null ? c.tierMult[difficulty] : 1;
        var n = (prev === 0 || !c.firstWinOnly ? win : 0) + Math.round(Math.max(0, stars - prev) * c.perNewStar * mult);
        if (stars === 3 && prev < 3) n += Math.round(c.firstThreeStars * mult);
        return n;
      }
    };
    return eco;
  }

  var Economy = { defaults: defaults, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = Economy;
  else root.GamekitEconomy = Economy;
})(this);

/* ---- gamekit/meta/remote.js ---- */
/* gamekit remote config stub: tune config.js numbers without a release.
 *
 * Overrides are flat dotted keys, e.g. { "ads.interstitialMinGapMs": 240000, "boosters.price.bomb": 100 }.
 * Only keys that already exist in config.js and keep the same type (number / string / boolean) are applied;
 * functions and unknown keys are ignored, so a bad payload cannot break the game.
 *
 * Boot (before the economy is created):
 *   1. last fetched payload from localStorage ('<gameId>.remote')   -> applied now
 *   2. window.GAMEKIT_REMOTE (build-time / test overrides)         -> applied now
 *   3. Firebase Remote Config in the Android wrapper (@capacitor-firebase/remote-config), parameter
 *      '<gameId>_config' holding the JSON -> fetched in the background and cached for the NEXT launch
 *      (never mid-session: prices and gaps stay consistent within a session).
 */
(function (root) {
  'use strict';

  function apply(cfg, overrides) {
    var applied = [];
    if (!overrides || typeof overrides !== 'object') return applied;
    Object.keys(overrides).forEach(function (path) {
      var parts = path.split('.'), o = cfg;
      for (var i = 0; i < parts.length - 1; i++) {
        if (!o || typeof o[parts[i]] !== 'object') return;
        o = o[parts[i]];
      }
      var last = parts[parts.length - 1], v = overrides[path];
      if (!o || !(last in o) || typeof o[last] === 'function' || typeof o[last] === 'object') return;
      if (typeof o[last] !== typeof v) return;
      o[last] = v;
      applied.push(path);
    });
    return applied;
  }

  function boot(cfg) {
    var id = (cfg.game && cfg.game.id) || 'gamekit', KEY = id + '.remote';
    var applied = [];
    try { applied = applied.concat(apply(cfg, JSON.parse(root.localStorage.getItem(KEY) || 'null'))); } catch (e) { /* no storage */ }
    applied = applied.concat(apply(cfg, root.GAMEKIT_REMOTE));
    try {
      var RC = root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.FirebaseRemoteConfig;
      if (RC) {
        RC.fetchAndActivate()
          .then(function () { return RC.getString({ key: id + '_config' }); })
          .then(function (r) {
            var parsed = JSON.parse((r && r.value) || '{}');
            try { root.localStorage.setItem(KEY, JSON.stringify(parsed)); } catch (e) { /* ignore */ }
          })
          .catch(function () { /* offline: keep the cache */ });
      }
    } catch (e) { /* ignore */ }
    return applied;
  }

  var Remote = { apply: apply, boot: boot };
  if (typeof module !== 'undefined' && module.exports) module.exports = Remote;
  else root.GamekitRemote = Remote;
})(this);

/* ---- gamekit/meta/analytics.js ---- */
/* gamekit analytics stub. The game calls Analytics.track(name, params); nothing leaves the device until a
 * provider is registered (Firebase / GameAnalytics in the Android wrapper; portals have their own stats).
 *
 * Events: app_open, game_start, game_end, daily_end, level_start, level_complete, level_fail,
 *         booster_used, booster_earn, currency_earn, currency_spend, ad_requested, ad_shown, ad_rewarded,
 *         purchase, purchase_failed, quest_complete, chest_earned, chest_open, pass_tier, streak
 *
 *   Analytics.addProvider(function (name, params) { ... })     e.g. FirebaseAnalytics.logEvent({name, params})
 *   Analytics.recent()   last 200 events (debug overlay, tests)
 */
(function (root) {
  'use strict';
  var buf = [], providers = [], debug = false;
  try { debug = /[?&]debug=1/.test(root.location ? root.location.search : ''); } catch (e) { /* node */ }

  var A = {
    track: function (name, params) {
      var e = { name: name, params: params || {}, t: Date.now() };
      buf.push(e);
      if (buf.length > 200) buf.shift();
      if (debug && root.console) root.console.log('[analytics]', name, params || {});
      for (var i = 0; i < providers.length; i++) { try { providers[i](name, e.params); } catch (err) { /* never break the game */ } }
    },
    addProvider: function (fn) { providers.push(fn); },
    recent: function () { return buf.slice(); },
    clear: function () { buf.length = 0; }
  };

  // Capacitor Firebase Analytics, if the Android wrapper installs it (@capacitor-firebase/analytics)
  try {
    var FA = root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.FirebaseAnalytics;
    if (FA) A.addProvider(function (name, params) { FA.logEvent({ name: name, params: params }); });
  } catch (e) { /* ignore */ }

  if (typeof module !== 'undefined' && module.exports) module.exports = A;
  else root.Analytics = A;
})(this);

/* ---- gamekit/meta/save.js ---- */
/* gamekit save: one versioned JSON document in localStorage, with a backup copy, migrations and
 * export/import strings (for a later cloud save: upload save.exportString(), download, importString()).
 *
 *   var save = GamekitSave.create({ key, storage, defaults: fn -> fresh data })
 *   save.data          the live object (mutate it, then save.commit())
 *   save.commit()      write now (cheap: one JSON.stringify)
 *   save.exportString() -> 'TSL1.<base64 json>.<checksum>'
 *   save.importString(s) -> true/false (validated, migrated, replaces data, writes)
 *   save.reset()
 * Every storage access is wrapped: private mode, blocked cookies or a full quota never break the game.
 */
(function (root) {
  'use strict';
  var VERSION = 2;
  var KEY = 'gamekit.save'; // default; games pass opts.key ('<gameId>.save')

  // v(n) -> v(n+1). Add a function here whenever the shape of the data changes.
  var MIGRATIONS = {
    1: function (d) {
      // v1 (early web build) kept a flat {best, muted, theme, daily:{}} object
      return { v: 2, settings: { muted: !!d.muted, theme: d.theme || null }, endless: { best: d.best || 0, run: null },
        daily: { results: d.daily || {}, run: null } };
    }
  };

  function merge(base, over) {
    // fill missing keys of `over` from `base` (deep for plain objects), keep everything `over` has
    if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
    var out = {};
    Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });
    Object.keys(over).forEach(function (k) {
      var b = base ? base[k] : undefined, o = over[k];
      out[k] = b && typeof b === 'object' && !Array.isArray(b) && o && typeof o === 'object' && !Array.isArray(o) ? merge(b, o) : o;
    });
    return out;
  }

  function migrate(d, defaults) {
    if (!d || typeof d !== 'object') return null;
    var v = d.v || 1, guard = 0;
    while (v < VERSION && MIGRATIONS[v] && guard++ < 50) { d = MIGRATIONS[v](d); v = d.v || v + 1; d.v = v; }
    if (v !== VERSION) return null;
    return merge(defaults(), d);
  }

  function checksum(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function b64(s) {
    if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(s)));
    return Buffer.from(s, 'utf8').toString('base64');
  }
  function unb64(s) {
    if (typeof atob === 'function') return decodeURIComponent(escape(atob(s)));
    return Buffer.from(s, 'base64').toString('utf8');
  }

  function create(opts) {
    var storage = opts.storage;
    if (storage === undefined) { try { storage = root.localStorage; } catch (e) { storage = null; } }
    var defaults = opts.defaults, KEY = opts.key || Save.KEY, BAK = KEY + '.bak';
    function read(k) { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } }
    function write(k, v) { try { if (!storage) return false; storage.setItem(k, v); return true; } catch (e) { return false; } }

    function load() {
      var keys = [KEY, BAK];
      for (var i = 0; i < keys.length; i++) {
        var raw = read(keys[i]);
        if (!raw) continue;
        try { var d = migrate(JSON.parse(raw), defaults); if (d) return d; } catch (e) { /* corrupt: try backup */ }
      }
      var fresh = defaults();
      fresh.v = VERSION;
      fresh.isNew = true;
      return fresh;
    }

    var api = {
      VERSION: VERSION,
      data: load(),
      persistent: false,
      commit: function () {
        api.data.v = VERSION;
        api.data.savedAt = Date.now();
        var s = JSON.stringify(api.data);
        var prev = read(KEY);
        if (prev && prev !== s) write(BAK, prev);
        api.persistent = write(KEY, s);
        return api.persistent;
      },
      exportString: function () {
        var s = JSON.stringify(api.data);
        return 'TSL1.' + b64(s) + '.' + checksum(s);
      },
      importString: function (str) {
        try {
          var m = /^TSL1\.([A-Za-z0-9+/=]+)\.([0-9a-z]+)$/.exec(String(str || '').trim());
          if (!m) return false;
          var s = unb64(m[1]);
          if (checksum(s) !== m[2]) return false;
          var d = migrate(JSON.parse(s), defaults);
          if (!d) return false;
          api.data = d;
          api.commit();
          return true;
        } catch (e) { return false; }
      },
      reset: function () { api.data = defaults(); api.data.v = VERSION; api.commit(); }
    };
    api.data.v = VERSION;
    return api;
  }

  var Save = { VERSION: VERSION, KEY: KEY, create: create, migrate: migrate, merge: merge, checksum: checksum };
  if (typeof module !== 'undefined' && module.exports) module.exports = Save;
  else root.GamekitSave = Save;
})(this);

/* ---- gamekit/meta/meta.js ---- */
/* gamekit meta loops: login streak with freezes, daily/weekly quests, season pass, earned chests.
 * Pure logic over save.data.meta; time comes in through deps.now() and deps.today() so tests can drive it.
 *
 *   var meta = GamekitMeta.create(state, config, { economy, track, now, today })
 *   meta.touchStreak()            call once a game/level is finished: extends the flame, uses freezes for missed days
 *   meta.liveStreak()             what the flame shows now
 *   meta.buyFreeze()              coins -> one streak freeze (max config.streak.maxFreezes)
 *   meta.refresh()                re-roll quests on a new day/week, roll the pass on a new season
 *   meta.progress(metric, n)      -> quests just completed  (platform metrics: games levels stars daily boosters; any other = the game's)
 *   meta.claimQuest(id)           -> granted reward (all daily claimed -> chest)
 *   meta.addXp(n), meta.passTier(), meta.claimPass(tier, 'free'|'premium')
 *   meta.earnChest(type), meta.startUnlock(i), meta.chestState(i), meta.openChest(i), meta.adSkip(i), meta.chestContents(type)
 *   meta.canDailyGift/claimDailyGift(booster), meta.canShopCoins/claimShopCoins(), meta.canRepairStreak/repairStreak()
 *   meta.unlocked(feature, {level, games}), meta.starterOpen(level), meta.passProductId()
 * Chests are only earned by playing, never sold, and their contents are fixed and shown up front (chestContents).
 */
(function (root) {
  'use strict';
  var U = root.GamekitUtil || (typeof require === 'function' ? require('./util.js') : null);
  // result.stats keys that are bookkeeping, or metrics the platform counts itself (see onGameEnd)
  var NOT_METRICS = ['score', 'movesLeft', 'progress', 'timeMs', 'level', 'games', 'levels', 'stars', 'daily'];

  function defaults(cfg) {
    return {
      streak: { last: '', count: 0, best: 0, freezes: cfg.streak.startFreezes, frozen: 0 },
      quests: { day: '', daily: [], week: '', weekly: [], dailyChestGiven: '', weeklyChestGiven: '' },
      pass: { season: -1, xp: 0, free: [], premium: [] },
      chests: [],
      adSkips: { day: '', n: 0 },
      firstWins: 0,
      firstDay: '',       // first day played (unlock order)
      gift: '',           // day the daily gift was claimed
      shopCoins: null,    // { day, n } rewarded free coins in the shop
      repairDay: '',      // last streak repair
      starterFrom: 0      // when the starter pack window opened
    };
  }

  function daysBetween(a, b) { return U.dayNumber(b, a) - 1; }

  function pickQuests(pool, n, seedKey) {
    var r = U.rng(U.hashString('quests:' + seedKey)), idx = pool.map(function (_, i) { return i; }), out = [];
    for (var i = 0; i < n && idx.length; i++) {
      var k = Math.floor(r() * idx.length);
      var q = pool[idx[k]];
      idx.splice(k, 1);
      out.push({ id: q.id, progress: 0, claimed: false });
    }
    return out;
  }

  function create(state, cfg, deps) {
    var eco = deps.economy, track = deps.track || function () {};
    var now = deps.now || function () { return Date.now(); };
    var today = deps.today || function () { return U.dateKey(new Date()); };
    var epoch = (cfg.platform && cfg.platform.epoch) || '2026-10-26'; // a Monday: weeks start on Mondays
    var dayNo = function (d) { return U.dayNumber(d, epoch); };
    var qById = {};
    cfg.quests.daily.concat(cfg.quests.weekly).forEach(function (q) { qById[q.id] = q; });

    function seasonOf(day) { return Math.floor((dayNo(day) - 1) / cfg.pass.seasonDays); }
    function weekOf(day) { return 'W' + Math.floor((dayNo(day) - 1) / 7); }

    var meta = {
      state: state,
      // ---- streak ----
      touchStreak: function () {
        var s = state.streak, d = today();
        if (s.last === d) return { count: s.count, frozen: 0 };
        var gap = s.last ? daysBetween(s.last, d) : 0, used = 0;
        if (s.last && gap === 1) s.count++;
        else if (s.last && gap > 1 && gap - 1 <= s.freezes) { used = gap - 1; s.freezes -= used; s.frozen += used; s.count++; }
        else s.count = 1;
        s.last = d;
        s.best = Math.max(s.best, s.count);
        track('streak', { count: s.count, frozen: used });
        var gift = null, ms = cfg.streak.milestones;
        s.given = s.given || [];
        if (ms[s.count] && s.given.indexOf(s.count) < 0) {
          s.given.push(s.count);
          gift = eco.grant({ coins: ms[s.count] }, 'streak_' + s.count);
        }
        var surprise = deps.onStreak ? deps.onStreak(s.count) : null; // fixed streak gifts (spins / chests)
        var out = { count: s.count, frozen: used, gift: gift };
        if (surprise) out.surprise = surprise;
        return out;
      },
      liveStreak: function () {
        var s = state.streak, d = today();
        if (!s.last) return 0;
        var gap = daysBetween(s.last, d);
        return gap <= 1 || gap - 1 <= s.freezes ? s.count : 0;
      },
      playedToday: function () { return state.streak.last === today(); },
      buyFreeze: function () {
        if (state.streak.freezes >= cfg.streak.maxFreezes) return false;
        if (!eco.spend(cfg.streak.freezePrice, 'streak_freeze')) return false;
        state.streak.freezes++;
        return true;
      },

      // ---- quests ----
      refresh: function () {
        var d = today(), q = state.quests;
        if (!state.firstDay) state.firstDay = d;
        if (q.day !== d) { q.day = d; q.daily = pickQuests(cfg.quests.daily, cfg.quests.dailyCount, d); }
        var w = weekOf(d);
        if (q.week !== w) { q.week = w; q.weekly = pickQuests(cfg.quests.weekly, cfg.quests.weeklyCount, w); }
        var se = seasonOf(d);
        if (state.pass.season !== se) { state.pass = { season: se, xp: 0, free: [], premium: [] }; }
      },
      quests: function () {
        meta.refresh();
        var f = function (list, kind) {
          return list.map(function (x) {
            var def = qById[x.id];
            return { id: x.id, kind: kind, metric: def.metric, target: def.target, progress: Math.min(x.progress, def.target),
              done: x.progress >= def.target, claimed: x.claimed, reward: def.reward };
          });
        };
        return f(state.quests.daily, 'daily').concat(f(state.quests.weekly, 'weekly'));
      },
      progress: function (metric, n) {
        meta.refresh();
        var done = [];
        state.quests.daily.concat(state.quests.weekly).forEach(function (x) {
          var def = qById[x.id];
          if (!def || def.metric !== metric || x.claimed) return;
          var was = x.progress >= def.target;
          x.progress += n == null ? 1 : n;
          if (!was && x.progress >= def.target) { done.push(x.id); track('quest_complete', { quest: x.id }); }
        });
        return done;
      },
      claimQuest: function (id) {
        meta.refresh();
        var q = state.quests, list = q.daily.concat(q.weekly), x = list.filter(function (e) { return e.id === id; })[0];
        var def = qById[id];
        if (!x || !def || x.claimed || x.progress < def.target) return null;
        x.claimed = true;
        var got = eco.grant(def.reward, 'quest_' + id);
        if (q.daily.every(function (e) { return e.claimed; }) && q.dailyChestGiven !== q.day) {
          q.dailyChestGiven = q.day; got.chest = meta.earnChest(cfg.quests.allDailyChest) ? cfg.quests.allDailyChest : null;
          if (deps.onAllDaily) got.spins = deps.onAllDaily();
        }
        if (q.weekly.every(function (e) { return e.claimed; }) && q.weeklyChestGiven !== q.week) {
          q.weeklyChestGiven = q.week; got.chest2 = meta.earnChest(cfg.quests.allWeeklyChest) ? cfg.quests.allWeeklyChest : null;
        }
        return got;
      },

      // ---- season pass ----
      seasonKey: function () { meta.refresh(); return 's' + state.pass.season; },
      hasPremiumPass: function () { var p = eco.state.passPremium || {}; return !!p[meta.seasonKey()]; },
      addXp: function (n) {
        meta.refresh();
        var before = meta.passTier();
        state.pass.xp += Math.max(0, n | 0);
        if (deps.onXp) deps.onXp(Math.max(0, n | 0)); // player level + weekly league points
        var after = meta.passTier();
        if (after > before) track('pass_tier', { tier: after, season: state.pass.season });
        return after - before;
      },
      passTier: function () { return Math.min(cfg.pass.tiers, Math.floor(state.pass.xp / cfg.pass.xpPerTier)); },
      passReward: function (t, row) { return row === 'premium' ? cfg.pass.premium(t) : cfg.pass.free(t); },
      claimPass: function (t, row) {
        meta.refresh();
        var list = row === 'premium' ? state.pass.premium : state.pass.free;
        if (t < 1 || t > meta.passTier() || list.indexOf(t) >= 0) return null;
        if (row === 'premium' && !meta.hasPremiumPass()) return null;
        list.push(t);
        return eco.grant(meta.passReward(t, row), 'pass_' + row + '_' + t);
      },

      // ---- chests (earned, timer/key based, contents shown up front) ----
      chestOdds: function (type) { return cfg.chests.types[type]; },
      // opts.fixed: a chest from a paid source (premium pass) never rolls the lucky upgrade
      earnChest: function (type, opts) {
        if (!cfg.chests.types[type] || state.chests.length >= cfg.chests.slots) return false;
        state.chests.push({ type: type, earnedAt: now(), opensAt: 0, fixed: !!(opts && opts.fixed) });
        track('chest_earned', { type: type });
        return true;
      },
      chestState: function (i) {
        var c = state.chests[i];
        if (!c) return null;
        var luck = c.fixed ? 0 : meta.upgradeChance(c.type);
        if (!c.opensAt) return { type: c.type, status: 'locked', lucky: luck };
        var left = c.opensAt - now();
        return left <= 0 ? { type: c.type, status: 'ready', lucky: luck } : { type: c.type, status: 'unlocking', msLeft: left, lucky: luck };
      },
      startUnlock: function (i) {
        var c = state.chests[i];
        if (!c || c.opensAt) return false;
        if (state.chests.some(function (x) { return x.opensAt && x.opensAt > now(); })) return false; // one at a time
        c.opensAt = now() + cfg.chests.types[c.type].unlockMin * 60000;
        return true;
      },
      canAdSkip: function () {
        var d = today();
        if (state.adSkips.day !== d) state.adSkips = { day: d, n: 0 };
        return state.adSkips.n < cfg.chests.adSkipsPerDay;
      },
      // call after a rewarded ad finished: the chest becomes ready now
      adSkip: function (i) {
        var c = state.chests[i];
        if (!c || !meta.canAdSkip()) return false;
        state.adSkips.n++;
        c.opensAt = now();
        return true;
      },
      // fixed contents: exactly what the chest card shows (no randomness anywhere)
      chestContents: function (type) {
        var t = cfg.chests.types[type], order = cfg.chests.boosterOrder, b = {};
        for (var k = 0; k < (t.boosters || 0); k++) { var id = order[k % order.length]; b[id] = (b[id] || 0) + 1; }
        return { coins: t.coins, boosters: b };
      },
      // lucky upgrade odds of an earned chest of this type (config chests.lucky), 0 for the top tier
      upgradeChance: function (type) {
        var order = cfg.chests.order || [], i = order.indexOf(type);
        return i >= 0 && i < order.length - 1 ? ((cfg.chests.lucky || {})[type] || 0) : 0;
      },
      // r: random number in [0, 1) for the lucky roll (tests pass it). Contents are the fixed contents of the
      // final type. got.chestType / got.from / got.lucky tell the UI what happened.
      openChest: function (i, r) {
        var st = meta.chestState(i);
        if (!st || st.status !== 'ready') return null;
        var c = state.chests[i], type = c.type, lucky = false;
        if (!c.fixed && (r == null ? Math.random() : r) < meta.upgradeChance(type)) {
          type = cfg.chests.order[cfg.chests.order.indexOf(type) + 1];
          lucky = true;
        }
        var reward = meta.chestContents(type);
        state.chests.splice(i, 1);
        track('chest_open', { type: type, from: c.type, lucky: lucky, coins: reward.coins });
        var got = eco.grant(reward, 'chest_' + type);
        got.chestType = type; got.from = c.type; got.lucky = lucky;
        return got;
      },

      // ---- other rewarded placements (caller shows the ad first, then calls these) ----
      canDailyGift: function () { return state.gift !== today(); },
      claimDailyGift: function (booster) {
        if (!meta.canDailyGift() || cfg.boosters.start[booster] == null) return null;
        state.gift = today();
        var b = {}; b[booster] = cfg.rewarded.dailyGiftBoosters;
        return eco.grant({ boosters: b }, 'daily_gift');
      },
      canShopCoins: function () {
        if (!state.shopCoins || state.shopCoins.day !== today()) state.shopCoins = { day: today(), n: 0 };
        return state.shopCoins.n < cfg.rewarded.shopCoinsPerDay;
      },
      claimShopCoins: function () {
        if (!meta.canShopCoins()) return null;
        state.shopCoins.n++;
        return eco.grant({ coins: cfg.rewarded.shopCoins }, 'shop_ad');
      },
      // a streak broken yesterday (one missed day, no freeze left) can be repaired once per N days
      canRepairStreak: function () {
        var s = state.streak, d = today();
        if (!s.last || s.count < 2 || daysBetween(s.last, d) !== 2 || s.freezes > 0) return false;
        return !state.repairDay || daysBetween(state.repairDay, d) >= cfg.streak.repairEveryDays;
      },
      repairStreak: function () {
        if (!meta.canRepairStreak()) return false;
        state.repairDay = today();
        state.streak.last = U.prevKey(today()); // as if played yesterday: today's game continues the flame
        track('streak_repair', { count: state.streak.count });
        return true;
      },

      // ---- unlock order and offers ----
      // ctx: { level: highest adventure level reached, games: finished games }
      unlocked: function (feature, ctx) {
        var u = cfg.unlocks[feature];
        if (!u) return true;
        if (u.days) return daysBetween(state.firstDay || today(), today()) >= u.days - 1;
        return (u.level && ctx.level >= u.level) || (u.games && ctx.games >= u.games) || false;
      },
      // starter pack: a 72 h window that opens the first time the player reaches level N
      starterOpen: function (level) {
        var sp = cfg.starterPack;
        if (!state.starterFrom && level >= sp.afterLevel) state.starterFrom = now();
        return !!state.starterFrom && now() < state.starterFrom + sp.windowHours * 3600000;
      },
      passProductId: function () { var n = state.pass.season + 1; return 'pass_s' + (n < 10 ? '0' : '') + n; },

      // ---- hooks the game calls ----
      onGameEnd: function (mode, stats) {
        // stats: { <game metric>: n, ... } e.g. Teselo { lines, pieces, combo3, gems }, Atascazo { cars, nocrane }.
        // Every positive number is a quest metric, except the bookkeeping keys below and the metrics the platform
        // counts itself (games levels stars daily; boosters when the game reports them).
        meta.lastStreak = meta.touchStreak(); // { count, frozen, gift } for the result screen
        var done = [];
        done = done.concat(meta.progress('games', 1));
        Object.keys(stats).forEach(function (k) {
          if (NOT_METRICS.indexOf(k) >= 0 || typeof stats[k] !== 'number' || !(stats[k] > 0)) return;
          done = done.concat(meta.progress(k, stats[k]));
        });
        if (mode === 'daily') { done = done.concat(meta.progress('daily', 1)); meta.addXp(cfg.pass.xp.daily); }
        meta.addXp(cfg.pass.xp.game);
        return done;
      },
      onLevelWin: function (level, stars, prevStars, firstWin) {
        var done = meta.progress('levels', 1).concat(meta.progress('stars', Math.max(0, stars - (prevStars || 0))));
        meta.addXp(cfg.pass.xp.levelWin + cfg.pass.xp.star * stars);
        var chest = null;
        if (firstWin) {
          state.firstWins++;
          if (state.firstWins % cfg.chests.levelMilestone === 0 && meta.earnChest('silver')) chest = 'silver';
        }
        return { quests: done, chest: chest };
      }
    };
    // economy grants that belong to meta (chest in a pass tier, xp in a quest, freezes)
    meta.onGrant = function (reward, got, source) {
      if (reward.chest) got.chest = meta.earnChest(reward.chest, { fixed: /^(iap_|pass_premium)/.test(source || '') }) ? reward.chest : null;
      if (reward.xp) meta.addXp(reward.xp);
      if (reward.freeze) state.streak.freezes = Math.min(cfg.streak.maxFreezes, state.streak.freezes + reward.freeze);
    };
    meta.refresh();
    return meta;
  }

  var Meta = { defaults: defaults, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = Meta;
  else root.GamekitMeta = Meta;
})(this);

/* ---- gamekit/meta/fun.js ---- */
/* gamekit "fun" loops: daily prize wheel, player level (lifetime XP), streak multiplier + streak gifts,
 * lucky moments, lucky chest upgrades. Pure logic over save.data.fun; platform layer, no game code.
 *
 *   var fun = GamekitFun.create(state, cfg, { economy, meta, today, now, rand, track })
 *
 * Honesty rules (MONETIZATION.md addendum A):
 *   - every random outcome has its odds in config and in the UI (wheel.odds(), luckyChance, chest upgrade odds);
 *   - spins are NEVER sold: grantSpins() refuses any real-money source ('iap_*'), no product grants spins,
 *     and there is no coin price for a spin (spins come from the free daily spin, one rewarded ad, quests,
 *     streak gifts and player levels);
 *   - chests from paid sources (premium pass) are 'fixed': they never roll the lucky upgrade.
 */
(function (root) {
  'use strict';
  var U = root.GamekitUtil || (typeof require === 'function' ? require('./util.js') : null);

  function defaults() {
    return {
      xp: 0, level: 1,                                      // lifetime XP and player level
      spins: { day: '', free: 0, ad: 0, bank: 0, total: 0 }, // free/ad used today; bank = earned extra spins
      lucky: { day: '', n: 0, active: false, given: 0 },
      gifts: [],                                            // streak gift days already given
      levelUps: [],                                         // pending level-up reveals for the UI
      history: []                                           // last 20 spins (debug / tests)
    };
  }

  function create(state, cfg, deps) {
    var eco = deps.economy, meta = deps.meta, track = deps.track || function () {};
    var today = deps.today || function () { return U.dateKey(new Date()); };
    var rand = deps.rand || Math.random;
    var W = cfg.wheel, LV = cfg.levels, LK = cfg.lucky;
    var paid = function (source) { return /^iap_/.test(String(source || '')); };

    function rollDay() {
      var d = today();
      if (state.spins.day !== d) { state.spins.day = d; state.spins.free = 0; state.spins.ad = 0; }
      if (state.lucky.day !== d) { state.lucky.day = d; state.lucky.n = 0; }
    }

    var fun = {
      state: state,

      // ---------------- wheel ----------------
      // segments with their exact probability (weight / sum). The UI shows exactly this list.
      odds: function () {
        var sum = W.segments.reduce(function (a, s) { return a + Math.max(0, s.weight); }, 0);
        return W.segments.map(function (s) { return { id: s.id, reward: s.reward, weight: s.weight, p: Math.max(0, s.weight) / sum }; });
      },
      freeLeft: function () { rollDay(); return Math.max(0, W.freePerDay - state.spins.free); },
      adLeft: function () { rollDay(); return Math.max(0, W.adPerDay - state.spins.ad); },
      bank: function () { return state.spins.bank; },
      // spins playable now without an ad
      spinsReady: function () { return fun.freeLeft() + state.spins.bank; },
      // extra spins EARNED by play (quests, streak gifts, levels). Never from a purchase.
      grantSpins: function (n, source) {
        if (paid(source) || !(n > 0)) return 0;
        var before = state.spins.bank;
        state.spins.bank = Math.min(W.maxBank, state.spins.bank + Math.floor(n));
        track('spin_earned', { n: state.spins.bank - before, source: source || '' });
        return state.spins.bank - before;
      },
      // weighted pick; r in [0, 1)
      pick: function (r) {
        var o = fun.odds(), x = r, i;
        for (i = 0; i < o.length; i++) { x -= o[i].p; if (x < 0) return i; }
        return o.length - 1;
      },
      // kind: 'free' | 'bank' | 'ad' (call 'ad' only after the rewarded ad finished)
      spin: function (kind, r) {
        rollDay();
        if (kind === 'free' && fun.freeLeft() <= 0) return null;
        if (kind === 'bank' && state.spins.bank <= 0) return null;
        if (kind === 'ad' && fun.adLeft() <= 0) return null;
        if (kind === 'free') state.spins.free++;
        else if (kind === 'bank') state.spins.bank--;
        else if (kind === 'ad') state.spins.ad++;
        else return null;
        var i = fun.pick(r == null ? rand() : r), seg = W.segments[i];
        var got = fun.resolve(seg.reward, 'wheel');
        state.spins.total++;
        state.history.unshift({ i: i, id: seg.id, kind: kind, day: today() });
        if (state.history.length > 20) state.history.length = 20;
        track('wheel_spin', { segment: seg.id, kind: kind });
        return { index: i, segment: seg, got: got };
      },
      // what a reward spec turns into for this player (booster in turn, chest or its coins, skin or coins)
      resolve: function (rw, source) {
        var g = {};
        if (rw.coins) g.coins = rw.coins;
        if (rw.booster) {
          var order = (cfg.chests && cfg.chests.boosterOrder) || [];
          if (order.length) { g.boosters = {}; g.boosters[order[state.spins.total % order.length]] = rw.booster; }
          else g.coins = (g.coins || 0) + 40;
        }
        if (rw.chest) {
          if (meta.earnChest(rw.chest)) g.chestOnly = rw.chest;
          else g.coins = (g.coins || 0) + meta.chestContents(rw.chest).coins; // slots full: the chest's coins now
        }
        if (rw.skin) {
          var s = fun.nextSkin();
          if (s) g.skin = s.id; else g.coins = (g.coins || 0) + (rw.orCoins || 100);
        }
        var chest = g.chestOnly;
        delete g.chestOnly;
        var got = eco.grant(g, source);
        if (chest) got.chest = chest;
        return got;
      },
      // cheapest coin skin the player does not own yet (what a "skin" segment gives)
      nextSkin: function () {
        return cfg.skins.filter(function (s) { return typeof s.price === 'number' && s.price > 0 && !eco.owns(s.id); })
          .sort(function (a, b) { return a.price - b.price; })[0] || null;
      },

      // ---------------- player level ----------------
      need: function (level) { return LV.base + LV.step * (level - 1); },
      levelInfo: function () {
        var need = fun.need(state.level);
        return { level: state.level, into: state.xp, need: need, pct: Math.min(1, state.xp / need) };
      },
      levelReward: function (level) {
        var r = { coins: LV.coins + LV.coinsStep * level };
        if (LV.spinEvery && level % LV.spinEvery === 0) r.spins = 1;
        if (LV.chestEvery && level % LV.chestEvery === 0) r.chest = LV.chest;
        var skin = (cfg.levelSkins || {})[level];
        if (skin) r.skin = skin;
        return r;
      },
      // XP from the pass hooks (every game, daily, level win, quest): xp carries over level by level
      addXp: function (n) {
        n = Math.max(0, n | 0);
        if (!n) return [];
        state.xp += n;
        var ups = [];
        while (state.xp >= fun.need(state.level) && ups.length < 20) {
          state.xp -= fun.need(state.level);
          state.level++;
          var rw = fun.levelReward(state.level), got = eco.grant({ coins: rw.coins, skin: rw.skin }, 'level_' + state.level);
          if (rw.spins) got.spins = fun.grantSpins(rw.spins, 'level');
          if (rw.chest) { if (meta.earnChest(rw.chest)) got.chest = rw.chest; else got.coins = (got.coins || 0) + eco.earn(meta.chestContents(rw.chest).coins, 'level_chest'); }
          ups.push({ level: state.level, reward: rw, got: got });
          track('player_level', { level: state.level });
        }
        state.levelUps = state.levelUps.concat(ups).slice(-5);
        return ups;
      },
      takeLevelUps: function () { var u = state.levelUps; state.levelUps = []; return u; },

      // ---------------- streak ----------------
      // coin multiplier for game coins, from the live streak (config: streak.multipliers {days: x})
      streakMult: function (count) {
        var m = 1, t = cfg.streak.multipliers || {};
        Object.keys(t).forEach(function (k) { if (count >= +k && t[k] > m) m = t[k]; });
        return m;
      },
      // streak gift on fixed days (3/7/14/30): contents are fixed and listed in the streak sheet
      streakGift: function (count) {
        var g = (cfg.streak.gifts || {})[count];
        if (!g || state.gifts.indexOf(count) >= 0) return null;
        state.gifts.push(count);
        var got = {};
        if (g.spins) got.spins = fun.grantSpins(g.spins, 'streak');
        if (g.chest) { if (meta.earnChest(g.chest)) got.chest = g.chest; else got.coins = eco.earn(meta.chestContents(g.chest).coins, 'streak_chest'); }
        if (g.coins) got.coins = (got.coins || 0) + eco.earn(g.coins, 'streak_gift');
        track('streak_gift', { day: count });
        return { day: count, gift: g, got: got };
      },

      // ---------------- lucky moments ----------------
      // the game reports a big moment (e.g. combo x3). 1-in-N chance of "x2 coins this game", max N per day.
      moment: function (strength, r) {
        rollDay();
        if (state.lucky.active || state.lucky.n >= LK.maxPerDay || (strength || 0) < LK.minStrength) return false;
        if ((r == null ? rand() : r) >= LK.chance) return false;
        state.lucky.active = true;
        state.lucky.n++;
        track('lucky_moment', { strength: strength || 0 });
        return true;
      },
      luckyActive: function () { return !!state.lucky.active; },
      // at the end of the game: extra coins (bounded), then the moment is used up
      applyLucky: function (coins) {
        if (!state.lucky.active) return 0;
        state.lucky.active = false;
        var extra = Math.min(LK.cap, Math.max(0, Math.round(coins * (LK.mult - 1))));
        if (extra) eco.earn(extra, 'lucky');
        state.lucky.given += extra;
        return extra;
      },

      // ---------------- chests: rarity + lucky upgrade ----------------
      rarity: function (type) { return (cfg.chests.types[type] || {}).rarity || 'common'; },
      nextChest: function (type) {
        var order = cfg.chests.order || [], i = order.indexOf(type);
        return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
      },
      upgradeChance: function (type) { return (cfg.chests.lucky || {})[type] || 0; }
    };
    rollDay();
    return fun;
  }

  var Fun = { defaults: defaults, create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = Fun;
  else root.GamekitFun = Fun;
})(this);

/* ---- gamekit/meta/league.js ---- */
/* gamekit weekly league + ranking rivals. Pure logic over save.data.league; platform layer, no game code.
 *
 *   var lg = GamekitLeague.create(state, cfg, { economy, meta, today, now, seed, track })
 *   lg.roll()                 new week? settle the old one (promotion / demotion / reward chest by rank)
 *   lg.addXp(n)               league points = XP earned this week (same XP as the pass and the player level)
 *   lg.table()                30 rows: real players (from the server, when known) + me + CPU rivals
 *   lg.setReal(rows)          standings from gamekit-api (rows: {name, country, xp, me})
 *   lg.takeResult()           last week's result for the UI (once)
 *   GamekitLeague.rankingBots(cfg, game, mode, period, day, n)   CPU rivals for a thin ranking table
 *
 * CPU rivals ("rivales CPU") behave like people: varied names, avatar and flag, a skill level, a usual
 * play time, days off, some stop mid-week, some have a strong day. Everything is seeded by (week, tier,
 * player), so the table is stable on every reload. Every CPU row carries cpu: true; the UI marks it with a
 * small icon and the info sheet says "Includes CPU rivals". Rankings never present CPU rows as real players.
 */
(function (root) {
  'use strict';
  var U = root.GamekitUtil || (typeof require === 'function' ? require('./util.js') : null);

  // ---- human-like names, by country ----
  var NAMES = {
    es: ['Lucía', 'Mateo', 'Sofía', 'Hugo', 'Martina', 'Leo', 'Valeria', 'Daniel', 'Paula', 'Álvaro', 'Carmen', 'Javi', 'Nerea', 'Iker',
      'Alba', 'Marcos', 'Irene', 'Pablo', 'Elena', 'Sergio', 'Noa', 'Raúl', 'Vega', 'Óscar', 'Inés', 'Bruno', 'Lola', 'Adrián', 'Marta', 'Diego',
      'Rocío', 'Unai', 'Ainhoa', 'Gonzalo', 'Pilar', 'Nacho', 'Maite', 'Rubén', 'Celia', 'Toni'],
    en: ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Mia', 'Lucas', 'Chloe', 'Jack', 'Grace', 'Owen', 'Ruby', 'Finn', 'Isla', 'Theo',
      'Harper', 'Sam', 'Ellie', 'Ben'],
    fr: ['Louis', 'Camille', 'Léa', 'Jules', 'Manon', 'Arthur', 'Inès', 'Hugo'],
    it: ['Giulia', 'Marco', 'Sara', 'Luca', 'Chiara', 'Matteo', 'Elisa', 'Paolo'],
    de: ['Lena', 'Jonas', 'Mia', 'Felix', 'Hannah', 'Paul', 'Lea', 'Max'],
    pt: ['Inês', 'Tiago', 'Beatriz', 'João', 'Mariana', 'Rui', 'Leonor', 'Duarte']
  };
  var WORDS = ['zen', 'pixel', 'luna', 'sol', 'mar', 'nova', 'calma', 'tile', 'blue', 'fox', 'kiwi', 'nube', 'ola', 'bloq', 'cubo', 'puzz', 'cafe', 'gato'];
  var COUNTRIES = [['ES', 'es', 38], ['MX', 'es', 10], ['AR', 'es', 7], ['CO', 'es', 5], ['CL', 'es', 3], ['PE', 'es', 3], ['US', 'en', 8], ['GB', 'en', 5],
    ['FR', 'fr', 4], ['IT', 'it', 4], ['PT', 'pt', 4], ['DE', 'de', 4]];
  var AVATAR = ['#7fb3a3', '#86a8d8', '#e5b567', '#e39a85', '#a99bd8', '#d98fb0', '#9cc27a', '#7fb0d6', '#c9a27f', '#8fa3ad'];

  function pick(r, list) { return list[Math.floor(r() * list.length)]; }
  function weighted(r, list) {
    var sum = list.reduce(function (a, x) { return a + x[2]; }, 0), x = r() * sum;
    for (var i = 0; i < list.length; i++) { x -= list[i][2]; if (x < 0) return list[i]; }
    return list[list.length - 1];
  }
  function strip(s) { return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s; }
  // one believable nickname: "Lucía", "javi_92", "MartaZen", "leo.mar", "Iker7"
  function nickname(r, lang) {
    var n = pick(r, NAMES[lang] || NAMES.es), w = pick(r, WORDS), k = r();
    var num = Math.floor(r() * 99) + 1;
    if (k < 0.22) return n;
    if (k < 0.42) return strip(n).toLowerCase() + '_' + (num < 10 ? '0' + num : num);
    if (k < 0.58) return n + w.charAt(0).toUpperCase() + w.slice(1);
    if (k < 0.72) return strip(n).toLowerCase() + '.' + w;
    if (k < 0.84) return n + num;
    return (w + strip(n).toLowerCase()).slice(0, 12);
  }
  function person(r) {
    var c = weighted(r, COUNTRIES), name = nickname(r, c[1]);
    return { name: name, country: c[0], color: AVATAR[Math.floor(r() * AVATAR.length)], initial: strip(name).charAt(0).toUpperCase() };
  }
  // a normal-ish sample (Irwin-Hall) in about [-3, 3]
  function gauss(r) { return r() + r() + r() + r() + r() + r() - 3; }

  // 7 days of league XP for one rival: skill target spread over the days it plays
  function schedule(r, target) {
    var pPlay = 0.45 + r() * 0.53, quit = r() < 0.18 ? 2 + Math.floor(r() * 4) : 7, burst = r() < 0.3 ? Math.floor(r() * 7) : -1;
    var hour = 7 + Math.floor(r() * 16), span = 1 + r() * 4;   // usual play time and how long the session runs
    var days = [], active = 0;
    for (var d = 0; d < 7; d++) { var on = d < quit && r() < pPlay; days.push(on ? 1 : 0); active += on ? 1 : 0; }
    if (!active) { days[0] = 1; active = 1; }
    var per = target / Math.max(1, active * pPlay + (1 - pPlay));
    var xp = days.map(function (on, d) { return on ? Math.round(per * (0.6 + r() * 0.8) * (d === burst ? 1.9 : 1)) : 0; });
    return { xp: xp, hour: hour, span: span, quit: quit };
  }
  // XP shown at a point of the week: whole past days + the part of today already played
  function xpAt(s, dayIdx, hourNow) {
    var t = 0;
    for (var d = 0; d < Math.min(7, dayIdx); d++) t += s.xp[d];
    if (dayIdx < 7) {
      var k = Math.max(0, Math.min(1, (hourNow - s.hour) / s.span));
      t += Math.round(s.xp[dayIdx] * k);
    }
    return t;
  }

  function defaults() {
    return { week: -1, tier: 0, xp: 0, joined: false, lastXp: 0, ref: 0, real: null, realAt: 0, result: null, best: 0, history: [] };
  }

  function create(state, cfg, deps) {
    var C = cfg.league, eco = deps.economy, meta = deps.meta, track = deps.track || function () {};
    var today = deps.today || function () { return U.dateKey(new Date()); };
    var now = deps.now || function () { return Date.now(); };
    var epoch = (cfg.platform && cfg.platform.epoch) || '2026-10-26';
    var seed = String(deps.seed || 'local');

    function weekOf(day) { return Math.floor((U.dayNumber(day, epoch) - 1) / 7); }
    function dayIdx() { return (U.dayNumber(today(), epoch) - 1) % 7; }
    function hourNow() { var d = new Date(now()); return d.getHours() + d.getMinutes() / 60; }
    function base(tier) { return Math.round(C.base * Math.pow(C.growth, tier)); }

    // rivals for (week, tier): fixed for the whole week
    function rivals(week, tier, n) {
      var r = U.rng(U.hashString('league:' + seed + ':' + week + ':' + tier));
      var ref = state.week === week && state.ref ? state.ref : base(tier), out = [];
      for (var i = 0; i < n; i++) {
        var p = person(r);
        // skill spread: from casual (0.15x) to try-hard (2.1x) around the reference, plus noise
        var q = (i + r()) / n, f = Math.max(0.08, 0.15 + 1.95 * Math.pow(q, 1.2) + gauss(r) * 0.08);
        out.push({ name: p.name, country: p.country, color: p.color, initial: p.initial, cpu: true, s: schedule(r, ref * f) });
      }
      return out;
    }

    var lg = {
      state: state,
      tiers: function () { return C.tiers; },
      weekId: function () { return weekOf(today()); },
      // ms until the week ends (Monday 00:00 local)
      msLeft: function () {
        var d = new Date(now()), left = 7 - dayIdx();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() + left).getTime() - d.getTime();
      },
      table: function (at) {
        lg.roll();
        var di = at ? at.day : dayIdx(), h = at ? at.hour : hourNow();
        var real = (state.real || []).filter(function (x) { return !x.me; }).slice(0, C.size - 1);
        var rows = real.map(function (x) {
          var p = person(U.rng(U.hashString('avatar:' + x.name)));
          return { name: x.name, country: x.country, xp: x.xp, color: p.color, initial: (x.name || '?').charAt(0).toUpperCase(), cpu: false, real: true };
        });
        rows.push({ name: deps.myName ? deps.myName() : 'You', country: deps.myCountry ? deps.myCountry() : '', xp: state.xp, me: true, cpu: false,
          color: '#5f9d8c', initial: '★' });
        rivals(state.week, state.tier, C.size - rows.length).forEach(function (b) {
          rows.push({ name: b.name, country: b.country, color: b.color, initial: b.initial, cpu: true, xp: xpAt(b.s, di, h) });
        });
        rows.sort(function (a, b) { return b.xp - a.xp || (a.me ? -1 : b.me ? 1 : 0); });
        rows.forEach(function (x, i) { x.rank = i + 1; x.zone = lg.zone(i + 1); });
        return rows;
      },
      zone: function (rank) {
        if (rank <= C.promote && state.tier < C.tiers.length - 1) return 'up';
        if (rank > C.size - C.demote && state.tier > 0) return 'down';
        return '';
      },
      myRank: function () { var t = lg.table(); for (var i = 0; i < t.length; i++) if (t[i].me) return t[i].rank; return C.size; },
      rewardFor: function (rank, tier) {
        for (var i = 0; i < C.rewards.length; i++) {
          var rw = C.rewards[i];
          if (rank <= rw.to) return { chest: rank === 1 && tier >= C.legendaryFrom ? 'crystal' : rw.chest };
        }
        return null;
      },
      addXp: function (n) {
        lg.roll();
        n = Math.max(0, n | 0);
        if (!n) return;
        state.xp += n;
        state.joined = true;
      },
      setReal: function (rows, week) {
        if (week != null && week !== state.week) return;
        state.real = (rows || []).map(function (x) { return { name: String(x.name || '').slice(0, 16), country: x.country || '', xp: x.xp | 0, me: !!x.me }; });
        state.realAt = now();
      },
      // new week: settle the previous one with the standings as they stood at its end
      roll: function () {
        var w = weekOf(today());
        if (state.week === w) return null;
        var res = null;
        if (state.week >= 0 && state.joined && state.xp > 0) {
          var keepWeek = state.week, t = lg.table.call(null, { day: 7, hour: 0 });
          var me = t.filter(function (x) { return x.me; })[0], rank = me ? me.rank : C.size;
          var from = state.tier, to = from;
          if (rank <= C.promote && from < C.tiers.length - 1) to = from + 1;
          else if (rank > C.size - C.demote && from > 0) to = from - 1;
          var rw = lg.rewardFor(rank, from), got = null;
          if (rw && rw.chest) {
            got = meta.earnChest(rw.chest) ? { chest: rw.chest } : { coins: eco.earn(meta.chestContents(rw.chest).coins, 'league_' + rw.chest) };
          }
          res = { week: keepWeek, rank: rank, from: from, to: to, xp: state.xp, reward: rw, got: got };
          state.history.unshift({ week: keepWeek, rank: rank, tier: from, xp: state.xp });
          if (state.history.length > 12) state.history.length = 12;
          state.tier = to;
          state.best = Math.max(state.best, to);
          state.lastXp = state.xp;
          track('league_end', { rank: rank, tier: from, to: to });
        } else if (state.week >= 0 && state.week < w - 1) {
          state.lastXp = 0; // a skipped week cools the reference down
        }
        state.week = w;
        state.xp = 0;
        state.joined = false;
        state.real = null;
        // rivals' reference: the tier's base, nudged toward what this player really does in a week
        var b = base(state.tier);
        state.ref = Math.round(state.lastXp ? Math.max(b * 0.6, Math.min(b * 1.8, state.lastXp * 0.95)) : b);
        state.result = res || state.result;
        return res;
      },
      takeResult: function () { var r = state.result; state.result = null; return r; }
    };
    // settle the week while computing the table at the end of it: rivals must use that week's seed
    var tableAt = lg.table;
    lg.table = function (at) {
      if (at && at.day === 7) {
        var di = 7, rows = (state.real || []).filter(function (x) { return !x.me; }).slice(0, C.size - 1).map(function (x) { return { name: x.name, xp: x.xp }; });
        rows.push({ name: 'me', xp: state.xp, me: true });
        rivals(state.week, state.tier, C.size - rows.length).forEach(function (b) { rows.push({ name: b.name, xp: xpAt(b.s, di, 0), cpu: true }); });
        rows.sort(function (a, b) { return b.xp - a.xp || (a.me ? -1 : b.me ? 1 : 0); });
        rows.forEach(function (x, i) { x.rank = i + 1; });
        return rows;
      }
      return tableAt(at);
    };
    return lg;
  }

  // CPU rivals for a ranking table with few real players (same for everyone on that day/week)
  // hourNow: when `day` is today, rivals whose usual play time has not come yet are not on the table yet
  function rankingBots(cfg, game, mode, period, day, n, hourNow) {
    var spec = ((cfg.ranking || {}).botScore || {})[mode];
    if (!spec || n <= 0) return [];
    var epoch = (cfg.platform && cfg.platform.epoch) || '2026-10-26', dn = U.dayNumber(day, epoch), wk = Math.floor((dn - 1) / 7);
    var r = U.rng(U.hashString('rank:' + game + ':' + mode + ':' + wk)), out = [];
    var one = function (rr, skill) { return Math.max(spec[0] * 0.1, Math.min(spec[2], Math.round(spec[0] * skill + gauss(rr) * spec[1] * 0.6))); };
    for (var i = 0; i < n; i++) {
      var p = person(r), skill = 0.5 + r() * 1.0, pPlay = 0.4 + r() * 0.55, hour = 6 + r() * 17, score = 0;
      if (hourNow != null && hour > hourNow && period === 'daily') continue;
      if (period === 'daily') { var rd = U.rng(U.hashString('rank:' + game + ':' + day + ':' + i)); score = one(rd, skill); }
      else {
        var from = period === 'weekly' ? wk * 7 + 1 : Math.max(1, dn - 60), to = dn;
        for (var d = from; d <= to; d++) {
          var rr = U.rng(U.hashString('rank:' + game + ':' + d + ':' + i));
          if (rr() < pPlay || d === to) { var s = one(rr, skill); score = period === 'weekly' ? score + s : Math.max(score, s); }
        }
      }
      out.push({ name: p.name, country: p.country, color: p.color, initial: p.initial, cpu: true, score: score });
    }
    return out;
  }

  var League = { defaults: defaults, create: create, rankingBots: rankingBots, nickname: nickname, _person: person };
  if (typeof module !== 'undefined' && module.exports) module.exports = League;
  else root.GamekitLeague = League;
})(this);

/* ---- gamekit/meta/online.js ---- */
/* gamekit online: rankings / leagues / ranking rewards through gamekit-api, offline-first.
 * Platform layer, no game code. The ONLY platform file allowed to make network requests (build.py checks it).
 *
 *   var on = GamekitOnline.create({ base, game, storage, now, fetch, subtle, lang, country })
 *   on.enabled                    false when no API is configured (portal builds, local dev) -> games stay offline
 *   on.profile / on.setProfile({ nickname, showFlag, hidden })
 *   on.submitScore({ mode, day, score, moves })     queued, retried until accepted (idempotent on the server)
 *   on.leagueProgress({ week, tier, xp })           -> standings (also cached)
 *   on.leaderboard(mode, period, day)               -> table (cached copy returned on failure, never throws)
 *   on.cached(mode, period, day)                    last table from the cache (instant render)
 *   on.claimRewards()                               -> { granted: [...], coins } granted once by the server
 *   on.warm()                                       wakes the free server (cold start ~50 s) in the background
 * Every call has a timeout; failures back off (15 s .. 5 min) and the game never waits on the network.
 */
(function (root) {
  'use strict';

  var ADJ = { es: ['Veloz', 'Zen', 'Audaz', 'Sereno', 'Astuto', 'Brillante', 'Tranquilo', 'Valiente', 'Sabio', 'Lunar', 'Ágil', 'Feliz'],
    en: ['Swift', 'Calm', 'Bold', 'Clever', 'Lucky', 'Bright', 'Quiet', 'Brave', 'Wise', 'Lunar', 'Nimble', 'Sunny'] };
  var ANIMAL = { es: ['Tortuga', 'Lince', 'Panda', 'Zorro', 'Búho', 'Delfín', 'Halcón', 'Koala', 'Nutria', 'Gato', 'Erizo', 'Pingüino'],
    en: ['Otter', 'Falcon', 'Panda', 'Fox', 'Owl', 'Dolphin', 'Lynx', 'Koala', 'Tiger', 'Cat', 'Hedgehog', 'Penguin'] };
  var NICK_RE = /^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñÇç_.\- ]{3,16}$/;
  // the server has the full filter; this one only gives instant feedback while typing
  var BAD = /(fuck|cunt|nigg|fagg|hijo ?de ?put|gilipoll|malparid|maric[oó]n|nazi|hitler|whore|bitch|polla|co[ñn]o|retard|subnormal|\bput[ao]s?\b|\bmierda\b|\bzorra\b|\bcabr[oó]n|\bshit\b|\bdick\b|\bcock\b|\bslut\b|\bporno?\b)/i;

  function funName(rand, lang) {
    var L = lang === 'es' ? 'es' : 'en', a = ADJ[L][Math.floor(rand() * 12)], b = ANIMAL[L][Math.floor(rand() * 12)];
    var n = 10 + Math.floor(rand() * 90);
    return (L === 'es' ? b + a : a + b) + n;
  }
  function validNick(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    var folded = s.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/[@]/g, 'a');
    return NICK_RE.test(s) && !BAD.test(folded) && !BAD.test(folded.replace(/[^A-Za-zñÑ ]/g, '')) ? s : null;
  }
  function flag(cc) {
    cc = String(cc || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return '';
    return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65);
  }
  function uuid(cr) {
    if (cr && cr.randomUUID) return cr.randomUUID();
    var b = new Uint8Array(16);
    if (cr && cr.getRandomValues) cr.getRandomValues(b); else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }

  function create(o) {
    var game = o.game, KEY = game + '.online', storage = o.storage;
    if (storage === undefined) { try { storage = root.localStorage; } catch (e) { storage = null; } }
    var fetchFn = o.fetch || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    var cr = o.crypto || root.crypto, subtle = cr && cr.subtle;
    var now = o.now || function () { return Date.now(); };
    var base = String(o.base || '').replace(/\/+$/, '');
    var timeout = o.timeoutMs || 9000;
    var S = load();
    var fails = 0, nextTry = 0, flushing = null;

    function load() {
      var d = null;
      try { d = JSON.parse((storage && storage.getItem(KEY)) || 'null'); } catch (e) { d = null; }
      d = d && typeof d === 'object' ? d : {};
      if (!d.id) d.id = uuid(cr);
      if (!d.nickname) d.nickname = funName(Math.random, o.lang);
      if (d.country === undefined) d.country = String(o.country || '').toUpperCase().slice(0, 2);
      if (d.showFlag === undefined) d.showFlag = true;
      d.hidden = !!d.hidden;
      d.queue = d.queue || [];
      d.cache = d.cache || {};
      d.dirtyProfile = d.dirtyProfile !== false;
      return d;
    }
    function persist() { try { if (storage) storage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* quota / private mode */ } }
    persist();

    function sign(ts, body) {
      if (!subtle) return Promise.reject(new Error('no webcrypto'));
      var enc = new TextEncoder();
      return subtle.importKey('raw', enc.encode(S.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        .then(function (k) { return subtle.sign('HMAC', k, enc.encode(ts + '.' + body)); }).then(hex);
    }
    function http(method, path, body, signed) {
      if (!on.enabled) return Promise.reject(new Error('offline'));
      var raw = body == null ? null : JSON.stringify(body), ts = String(now());
      var go = function (sig) {
        var ctl = typeof AbortController === 'function' ? new AbortController() : null, timer;
        var headers = { 'Content-Type': 'application/json' };
        if (signed) { headers['X-Player'] = S.id; headers['X-Ts'] = ts; headers['X-Sig'] = sig; }
        var p = fetchFn(base + path, { method: method, headers: method === 'GET' ? undefined : headers, body: raw, signal: ctl ? ctl.signal : undefined, mode: 'cors' });
        var t = new Promise(function (_, rej) { timer = setTimeout(function () { if (ctl) ctl.abort(); rej(new Error('timeout')); }, timeout); });
        return Promise.race([p, t]).then(function (res) {
          clearTimeout(timer);
          return res.json().catch(function () { return {}; }).then(function (j) {
            if (!res.ok) { var e = new Error(j.detail || ('http ' + res.status)); e.status = res.status; throw e; }
            return j;
          });
        }, function (e) { clearTimeout(timer); throw e; });
      };
      return signed ? sign(ts, raw).then(go) : go();
    }
    function ok() { fails = 0; nextTry = 0; on.online = true; }
    function failed(e) {
      if (e && e.status && e.status < 500 && e.status !== 429) return; // the server answered: not a connectivity problem
      fails++; on.online = false;
      nextTry = now() + Math.min(300000, 15000 * Math.pow(2, Math.min(5, fails - 1)));
    }
    function register() {
      var body = { id: S.id, game: game, nickname: S.nickname, country: S.showFlag ? S.country : null, hidden: S.hidden };
      return http('POST', '/v1/players', body, false).then(function (j) {
        S.secret = j.secret; S.nickname = j.nickname; S.dirtyProfile = false; persist(); ok();
        if (j.nicknameChanged && on.onNickChanged) on.onNickChanged(j.nickname);
      }, function (e) {
        if (e.status === 409) { S.id = uuid(cr); S.secret = null; persist(); return register(); } // id known with another key
        throw e;
      });
    }
    function ensure() { return S.secret ? Promise.resolve() : register(); }
    // signed call; an unknown player (server storage reset) re-registers once and retries
    function call(path, body) {
      return ensure().then(function () { return http('POST', path, body, true); }).catch(function (e) {
        if (e.status === 401) { S.secret = null; persist(); return register().then(function () { return http('POST', path, body, true); }); }
        throw e;
      }).then(function (j) { ok(); return j; });
    }

    // ---- queue: everything the server must eventually know (scores, league xp, profile) ----
    function enqueue(item) {
      S.queue = S.queue.filter(function (q) { return q.k !== item.k; });
      S.queue.push(item);
      if (S.queue.length > 40) S.queue = S.queue.slice(-40);
      persist();
    }
    function flush() {
      if (!on.enabled) return Promise.resolve(false);
      if (flushing) return flushing;
      if (now() < nextTry) return Promise.resolve(false);
      var step = function () {
        if (S.dirtyProfile && S.secret) {
          return call('/v1/players/me', { nickname: S.nickname, country: S.showFlag ? S.country : null, hidden: S.hidden })
            .then(function (j) { S.dirtyProfile = false; if (j.nicknameChanged) { S.nickname = j.nickname; if (on.onNickChanged) on.onNickChanged(j.nickname); } persist(); return step(); });
        }
        var q = S.queue[0];
        if (!q) return Promise.resolve(true);
        return call(q.path, q.body).then(function (j) {
          if (q.onDone && on.handlers[q.onDone]) on.handlers[q.onDone](j, q.body);
          S.queue.shift(); persist(); return step();
        }, function (e) {
          if (e.status && e.status < 500 && e.status !== 429 && e.status !== 401) { S.queue.shift(); persist(); if (on.onRejected) on.onRejected(q, e); return step(); }
          throw e;
        });
      };
      flushing = ensure().then(step).catch(function (e) { failed(e); return false; }).then(function (v) { flushing = null; return v; });
      return flushing;
    }

    var on = {
      enabled: !!(base && fetchFn),
      online: null,
      handlers: {},
      get profile() { return { id: S.id, nickname: S.nickname, country: S.country, showFlag: S.showFlag, hidden: S.hidden, flag: S.showFlag ? flag(S.country) : '' }; },
      setProfile: function (p) {
        if (p.nickname != null) { var n = validNick(p.nickname); if (!n) return false; S.nickname = n; }
        if (p.showFlag != null) S.showFlag = !!p.showFlag;
        if (p.hidden != null) S.hidden = !!p.hidden;
        S.dirtyProfile = true;
        persist();
        flush();
        return true;
      },
      submitScore: function (s) {
        if (S.hidden) return Promise.resolve(false);
        enqueue({ k: 'score:' + s.mode + ':' + s.day, path: '/v1/scores', body: { game: game, mode: s.mode, day: s.day, score: s.score | 0, moves: s.moves || undefined }, onDone: 'score' });
        return flush();
      },
      leagueProgress: function (p) {
        if (S.hidden) return Promise.resolve(false);
        enqueue({ k: 'league:' + p.week, path: '/v1/league/progress', body: { game: game, week: p.week, tier: p.tier, xp: p.xp | 0 }, onDone: 'league' });
        return flush();
      },
      cached: function (mode, period, day) { var c = S.cache[mode + ':' + period + ':' + day]; return c ? c.data : null; },
      leaderboard: function (mode, period, day) {
        var key = mode + ':' + period + ':' + day, cached = on.cached(mode, period, day);
        if (!on.enabled || now() < nextTry) return Promise.resolve(cached);
        var qs = '?game=' + encodeURIComponent(game) + '&mode=' + encodeURIComponent(mode) + '&period=' + period + '&day=' + day + '&player=' + S.id + '&top=50';
        return flush().then(function () { return http('GET', '/v1/leaderboard' + qs, null, false); }).then(function (j) {
          ok();
          S.cache[key] = { at: now(), data: j };
          var keys = Object.keys(S.cache);
          if (keys.length > 12) keys.sort(function (a, b) { return S.cache[a].at - S.cache[b].at; }).slice(0, keys.length - 12).forEach(function (k) { delete S.cache[k]; });
          persist();
          return j;
        }, function (e) { failed(e); return cached; });
      },
      claimRewards: function () {
        if (!on.enabled || now() < nextTry) return Promise.resolve(null);
        return flush().then(function () { return call('/v1/rewards/claim', { game: game }); }).catch(function (e) { failed(e); return null; });
      },
      warm: function () {
        if (!on.enabled) return Promise.resolve(false);
        return http('GET', '/health', null, false).then(function (j) { ok(); on.server = j; return flush(); }, function (e) { failed(e); return false; });
      },
      flush: flush,
      _state: S
    };
    return on;
  }

  var Online = { create: create, funName: funName, validNick: validNick, flag: flag, uuid: uuid };
  if (typeof module !== 'undefined' && module.exports) module.exports = Online;
  else root.GamekitOnline = Online;
})(this);

/* ---- gamekit/meta/offers.js ---- */
/* gamekit offers engine: limited-time packs and the between-games rhythm. Pure logic over save.data.offers; no UI,
 * no game code. The popups, shop cards and the HUD x2 badge live in shell/offers-ui.js.
 *
 *   var off = GamekitOffers.create(state, cfg, deps)
 *     deps: { products() -> catalogue (P.products()), league, now(), rnd(), track(name, p),
 *             iapAvailable(), micros(id) -> store price in micros or null, noAds(), allowed() (unlock + day-0 grace),
 *             owns(productId), doubleActive(), starterEnd() -> ms or 0, games() -> finished games }
 *
 * Offer kinds. Each one is a product in config.products with `offer: <kind>`:
 *   league   a pack the FIRST time the player is promoted to a league tier (offers.leagueProducts[tier]),
 *            live for offers.leagueHours from the moment the promotion is seen
 *   weekend  Friday 00:00 to Monday 00:00 local time, every offers.weekendEveryWeeks weeks
 *   starter  the starter pack window that already exists (meta.starterOpen: 72 h after level 10)
 *   oneshot  "OFERTA ÚNICA": created when its popup opens, gone for good when it closes (offers.oneshot list)
 *   promo    a regular product from the same pool (double_2h, always in the shop): same popup, no urgency wording
 *
 * Genuine urgency (EU UCPD Annex I no. 7, Google Play policy): every live offer gets a fixed expiresAt when it is
 * created. It is never extended and its key is never created again (state.seen keeps every key), so a countdown always
 * ends for real and a gone offer never comes back with a fresh timer. A different offer may appear later.
 *
 * Between games (P.afterResult): off.decide(adOk) -> { kind: 'none' | 'ad' | 'offer' | 'skip', offer }
 *   One interruption every offers.breakMin..breakMax finished games (a random number in that range, drawn again after
 *   each interruption), so two interruptions are never closer than breakMin games and never after every game.
 *   On a due slot: an offer with chance offerShare (when one is eligible), else the interstitial (adOk), else an
 *   eligible offer (offerFallback), else nothing and the slot stays due. remove_ads buyers never get an interstitial:
 *   their slot shows an offer with chance noAdsOfferShare, otherwise it is skipped.
 *
 * Value claims: GamekitOffers.claims(id, catalogue, cfg, priceOf) -> { valuePct, coinMult, discountPct, was, ref }
 *   from the contents and the price of the regular coin packs (MONETIZATION.md addendum D). Rounded DOWN, so a claim
 *   is never overstated. A strike-through "was" price exists only when the offer is the same bundle as a regular
 *   product (`sameAs`) that is sold at a higher price.
 */
(function (root) {
  'use strict';
  var U = root.GamekitUtil || (typeof require === 'function' ? require('./util.js') : null);
  var HOUR = 3600000, DAY = 86400000;
  var ORDER = { league: 0, weekend: 1, starter: 2 };

  function defaults() {
    return {
      live: [],          // live offers: { key, kind, product, createdAt, expiresAt, shows, tier?, bought? }
      seen: {},          // every timed key ever created -> createdAt (never created twice)
      seq: 0,            // one-shot counter (their keys are unique)
      lastShown: {},     // product id -> last popup time (one-shot cooldowns)
      lastOneshot: '',   // never the same one-shot twice in a row
      gamesSince: 0,     // finished games since the last interruption (ad or offer)
      nextBreak: 0,      // the next interruption is due after this many games (breakMin..breakMax)
      lastPopupAt: 0, day: '', dayN: 0,
      sessions: 0, startSession: 0,
      leagueSeen: -1,    // highest league tier already seen (-1: not initialised yet)
      log: []            // last interruptions, for analytics / tests: { g: games since previous, k: 'ad' | 'offer' | 'skip' }
    };
  }

  function euros(price) { var v = parseFloat(String(price || '').replace(/[^\d,.]/g, '').replace(',', '.')); return isFinite(v) ? v : 0; }
  function sortKeys(o) {
    if (!o || typeof o !== 'object') return o;
    var out = {};
    Object.keys(o).sort().forEach(function (k) { out[k] = sortKeys(o[k]); });
    return out;
  }
  function sameGrant(a, b) { return JSON.stringify(sortKeys(a || {})) === JSON.stringify(sortKeys(b || {})); }
  // what a grant is worth in coins: coins + boosters at their shop price. Skins, ad-free days and x2 hours count as 0,
  // so the value claims only ever understate.
  function coinValue(grant, cfg) {
    var v = (grant && grant.coins) || 0, b = (grant && grant.boosters) || {};
    Object.keys(b).forEach(function (k) { v += b[k] * ((cfg.boosters.price || {})[k] || 0); });
    return v;
  }
  function isCoinPack(p) { return !p.offer && !p.sameAs && p.grant && p.grant.coins > 0 && Object.keys(p.grant).length === 1; }

  // priceOf(product) -> euros (or the store's local currency: only ratios matter, so all prices must come from the
  // same source). Reference rate = the BEST coins per euro among the regular coin packs, the most demanding comparison.
  function claims(id, catalogue, cfg, priceOf) {
    priceOf = priceOf || function (p) { return euros(p.price); };
    var byId = {};
    catalogue.forEach(function (p) { byId[p.id] = p; });
    var p = byId[id];
    if (!p) return null;
    var price = priceOf(p), rate = 0, ref = null;
    catalogue.forEach(function (q) {
      if (!isCoinPack(q)) return;
      var r = q.grant.coins / priceOf(q);
      if (r > rate) { rate = r; ref = q.id; }
    });
    var out = { id: id, price: price, coinValue: coinValue(p.grant, cfg), rate: rate, ref: ref, mult: 0, valuePct: 0, coinMult: 0, discountPct: 0, was: null };
    if (rate > 0 && price > 0 && !isCoinPack(p)) {
      out.mult = out.coinValue / (price * rate);
      out.valuePct = Math.max(0, Math.floor((out.mult - 1) * 10 + 1e-9) * 10);        // x2.54 -> "+150%"
      var cm = ((p.grant && p.grant.coins) || 0) / (price * rate);
      out.coinMult = cm >= 2 ? Math.floor(cm + 1e-9) : 0;                             // x3.34 coins per euro -> "x3"
    }
    var base = p.sameAs && byId[p.sameAs];
    if (base && sameGrant(base.grant, p.grant) && priceOf(base) > price) {
      out.discountPct = Math.floor((1 - price / priceOf(base)) * 100 + 1e-9);         // 2,99 vs 9,99 -> "-70%"
      out.was = base.id;
    }
    return out;
  }

  function create(state, cfg, deps) {
    var O = cfg.offers, noop = function () {};
    var now = deps.now || function () { return Date.now(); };
    var rnd = deps.rnd || function () { return Math.random(); }, track = deps.track || noop;   // looked up per call (tests stub it)
    var D = defaults();
    Object.keys(D).forEach(function (k) { if (state[k] === undefined || state[k] === null) state[k] = D[k]; });

    function catalogue() { return deps.products(); }
    function product(id) { return catalogue().filter(function (p) { return p.id === id; })[0] || null; }
    function rollBreak() {
      var lo = Math.max(2, O.breakMin | 0), hi = Math.max(lo, O.breakMax | 0);   // never after every game, whatever Remote Config says
      state.nextBreak = lo + Math.floor(rnd() * (hi - lo + 1));
    }
    if (!state.nextBreak) rollBreak();
    function dayCount() {
      var k = U.dateKey(new Date(now()));
      if (state.day !== k) { state.day = k; state.dayN = 0; }
      return state.dayN;
    }
    function get(key) { return state.live.filter(function (o) { return o.key === key; })[0] || null; }

    function expire() {
      var t = now();
      state.live = state.live.filter(function (o) {
        if (!o.bought && o.expiresAt > t) return true;
        track('offer_end', { product: o.product, kind: o.kind, bought: !!o.bought });
        return false;
      });
    }
    // timed offers are remembered in state.seen forever; one-shot keys are unique by construction (state.seq)
    function add(key, kind, pid, expiresAt, extra) {
      if (state.seen[key] || !product(pid) || expiresAt <= now()) return null;
      var o = { key: key, kind: kind, product: pid, createdAt: now(), expiresAt: expiresAt, shows: 0 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      if (ORDER[kind] != null) state.seen[key] = o.createdAt;
      state.live.push(o);
      track('offer_created', { product: pid, kind: kind, hours: Math.round((expiresAt - o.createdAt) / HOUR) });
      return o;
    }
    // create the timed offers that are due now (league promotion, weekend, starter window)
    function refresh() {
      expire();
      if (!deps.iapAvailable()) return;           // web: nothing to sell, and no key is used up
      var lg = deps.league && deps.league.state;
      if (lg) {
        if (state.leagueSeen < 0) state.leagueSeen = lg.tier;   // first run: no offer for the tier the player already holds
        else if (lg.tier > state.leagueSeen) {
          var t = lg.tier, pid = (O.leagueProducts || [])[t];
          state.leagueSeen = t;
          if (pid) add('league:' + t, 'league', pid, now() + O.leagueHours * HOUR, { tier: t });
        }
      }
      if (deps.allowed()) {
        var dt = new Date(now()), since = (dt.getDay() - O.weekendStartDay + 7) % 7;
        if (since < O.weekendDays) {
          var start = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - since), sk = U.dateKey(start);
          var week = Math.floor((U.dayNumber(sk, cfg.platform.epoch) - 1) / 7);
          if (week % Math.max(1, O.weekendEveryWeeks | 0) === 0) {
            add('weekend:' + sk, 'weekend', O.weekendProduct, new Date(start.getFullYear(), start.getMonth(), start.getDate() + O.weekendDays).getTime());
          }
        }
      }
      var end = deps.starterEnd ? deps.starterEnd() : 0;
      if (end && !deps.owns('starter_pack')) add('starter', 'starter', 'starter_pack', end);
    }

    function popupOk() {
      return deps.iapAvailable() && deps.allowed() && dayCount() < O.maxPerDay && now() - state.lastPopupAt >= O.minGapMin * 60000;
    }
    function timedCandidate() {
      var t = now();
      return state.live.filter(function (o) { return ORDER[o.kind] != null && !o.bought && o.shows < O.perOffer && o.expiresAt - t > 60000; })
        .sort(function (a, b) { return ORDER[a.kind] - ORDER[b.kind] || a.expiresAt - b.expiresAt; })[0] || null;
    }
    function oneshotPick() {
      var t = now();
      var list = (O.oneshot || []).filter(function (s) {
        var p = product(s.product);
        if (!p || !(s.weight > 0) || s.product === state.lastOneshot) return false;
        if (t - (state.lastShown[s.product] || 0) < s.cooldownDays * DAY) return false;
        if (p.type !== 'consumable' && deps.owns(p.id)) return false;
        if (p.grant && p.grant.doubleHours && deps.doubleActive()) return false;
        return true;
      });
      if (!list.length) return null;
      var sum = list.reduce(function (a, s) { return a + s.weight; }, 0), r = rnd() * sum;
      for (var i = 0; i < list.length; i++) { r -= list[i].weight; if (r < 0) return list[i].product; }
      return list[list.length - 1].product;
    }
    function candidate() {
      var c = timedCandidate();
      if (c) return c;
      var pid = oneshotPick();
      return pid ? { kind: 'oneshot', product: pid } : null;
    }
    function taken(kind) {
      state.log.push({ g: state.gamesSince, k: kind });
      if (state.log.length > 40) state.log.splice(0, state.log.length - 40);
      track('break', { kind: kind, games: state.gamesSince });
      state.gamesSince = 0;
      rollBreak();
    }

    var off = {
      state: state,
      get: get,
      refresh: refresh,
      session: function () { state.sessions++; },
      onGameEnd: function () { state.gamesSince++; },
      due: function () { return state.gamesSince >= state.nextBreak; },
      // timed offers for the shop and the app-start popup (refreshes first)
      live: function () { refresh(); return state.live.filter(function (o) { return ORDER[o.kind] != null && !o.bought; }); },
      canBuy: function (key) { var o = get(key); return !!o && !o.bought && o.expiresAt > now() && deps.iapAvailable(); },
      // after a grant of this product (any path): its live offer is used up
      bought: function (pid) { state.live.forEach(function (o) { if (o.product === pid && o.expiresAt > now()) o.bought = true; }); expire(); },
      msLeft: function (key) { var o = get(key); return o ? Math.max(0, o.expiresAt - now()) : 0; },
      claims: function (id) {
        var cat = catalogue(), micros = deps.micros || function () { return null; };
        // store prices only when every product involved has one (same currency); else the catalogue's euro prices
        var p = product(id), need = cat.filter(function (q) { return isCoinPack(q) || q.id === id || (p && q.id === p.sameAs); });
        var store = need.length && need.every(function (q) { return micros(q.id) > 0; });
        return claims(id, cat, cfg, store ? function (q) { return micros(q.id) / 1e6; } : null);
      },
      // between games: what fills this slot (see the header). adOk = an interstitial is allowed and loaded right now
      decide: function (adOk) {
        refresh();
        if (state.gamesSince < state.nextBreak) return { kind: 'none' };
        var cand = popupOk() ? candidate() : null, r = rnd();
        if (deps.noAds()) return cand && r < O.noAdsOfferShare ? { kind: 'offer', offer: cand } : { kind: 'skip' };
        if (cand && r < O.offerShare) return { kind: 'offer', offer: cand };
        if (adOk) return { kind: 'ad' };
        if (cand && O.offerFallback) return { kind: 'offer', offer: cand };
        return { kind: 'none' };
      },
      // the slot was filled: kind 'ad' (an interstitial really showed) or 'skip' (remove_ads, no offer this time)
      taken: taken,
      // a popup opens: a one-shot offer is created now (gone when closed); a timed one counts a show
      // A regular product in the one-shot pool (double_2h, always in the shop) opens as kind 'promo': no urgency wording.
      open: function (cand, where) {
        var p = !cand.key && product(cand.product), kind = p && p.offer === 'oneshot' ? 'oneshot' : 'promo';
        if (!cand.key) state.seq = (state.seq || 0) + 1;
        var o = cand.key ? get(cand.key) : add(kind + ':' + state.seq, kind, cand.product, now() + O.oneshotMinutes * 60000);
        if (!o) return null;
        o.shows++;
        dayCount();
        state.dayN++;
        state.lastPopupAt = now();
        state.lastShown[o.product] = now();
        if (!cand.key) state.lastOneshot = o.product;
        if (where === 'break') taken('offer');
        if (where === 'start') state.startSession = state.sessions;
        track('offer_shown', { product: o.product, kind: o.kind, where: where || '' });
        return o;
      },
      // the popup closed: a one-shot offer is gone for good; a timed one stays in the shop until it expires
      close: function (key) {
        var o = get(key);
        if (o && (o.kind === 'oneshot' || o.kind === 'promo')) { state.live.splice(state.live.indexOf(o), 1); track('offer_end', { product: o.product, kind: o.kind, bought: !!o.bought }); }
      },
      // app start: at most one popup per session, never on the first launches, only for a live timed offer
      startOffer: function () {
        refresh();
        var A = O.appStart;
        if (state.startSession === state.sessions || state.sessions < A.minSessions || deps.games() < A.minGames || !popupOk()) return null;
        var c = timedCandidate();
        return c ? off.open(c, 'start') : null;
      }
    };
    return off;
  }

  var Offers = { defaults: defaults, create: create, claims: claims, coinValue: coinValue, euros: euros };
  if (typeof module !== 'undefined' && module.exports) module.exports = Offers;
  else root.GamekitOffers = Offers;
})(this);

/* ---- gamekit/ads/ads.js ---- */
/* gamekit ads adapter.
 *
 * The game only ever calls this small interface:
 *   Ads.init()                 -> Promise, resolves when the provider is ready (or at once)
 *   Ads.loadingDone()          -> the game finished loading
 *   Ads.gameplayStart()        -> a round is being played
 *   Ads.gameplayStop()         -> menu, game over, pause, tab hidden
 *   Ads.showInterstitial(ctx)  -> Promise; between games only (a result-screen tap), never on launch or mid-level.
 *                                 Pacing from config.ads: interstitialMinGapMs between two, sessionStartGapMs after
 *                                 launch, afterRewardedGapMs after a rewarded, levelsBetweenInterstitials finished
 *                                 levels/games (Ads.levelEnded()); never when "remove ads" was bought, only if already
 *                                 preloaded, and only if the game's gate (Ads.setGate: day-0 grace) agrees
 *   Ads.showRewarded(cb, where)-> cb(true) if the player earned the reward (continue, double coins, chest, booster)
 *   Ads.setPolicy(cfg.ads), Ads.setNoAds(bool), Ads.rewardedReady(), Ads.privacyOptionsRequired(), Ads.showPrivacyOptions()
 *   Ads.happy()                -> a big moment (CrazyGames "happytime"), optional
 *   Ads.hooks.pause / .resume  -> set by the game: mute + freeze while an ad plays
 *
 * Provider is chosen by window.GAMEKIT_ADS (set by build.py in a portal build):
 *   'none' (default)   no ads, no network. Rewarded is granted immediately, interstitial resolves at once.
 *   'crazygames'       CrazyGames HTML5 SDK v3. Needs <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js">
 *                      before this file (build.py adds it only to dist/portal-crazygames.zip).
 *   'poki'             Poki SDK v2. Needs <script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js">.
 *   'gamedistribution' GameDistribution HTML5 SDK. Needs window.GD_OPTIONS + main.min.js (see portals.md).
 *   'admob'            Android wrapper (Capacitor + @capacitor-community/admob). Ad unit ids in window.GAMEKIT_ADMOB.
 * If the chosen SDK is missing at runtime (blocked, offline, local file) the adapter falls back to 'none'.
 */
(function (root) {
  'use strict';

  // defaults = the conservative portal policy; config.ads (setPolicy) sets the real numbers
  var MIN_GAP = 180000;   // between two interstitials (CrazyGames and Poki also throttle on their side)
  var START_GAP = 180000; // none this long after launch (never on app open)
  var REW_GAP = 180000;   // none this long after a rewarded
  var startedAt = Date.now(), lastInter = 0, lastRew = 0;
  var LEVEL_GAP = 2, levelsSince = 0, noAds = false;

  function noop() {}
  var hooks = { pause: noop, resume: noop };

  // ---- default: no ads --------------------------------------------------
  var none = {
    name: 'none',
    init: function () { return Promise.resolve(); },
    loadingDone: noop, gameplayStart: noop, gameplayStop: noop, happy: noop,
    interstitial: function () { return Promise.resolve(); },
    rewarded: function () { return Promise.resolve(true); }
  };

  // ---- CrazyGames SDK v3 (docs.crazygames.com/sdk/html5-v3) --------------
  function crazy() {
    var SDK = root.CrazyGames && root.CrazyGames.SDK;
    if (!SDK) return null;
    function ad(kind) {
      return new Promise(function (resolve) {
        SDK.ad.requestAd(kind, {
          adStarted: function () { hooks.pause(); },
          adFinished: function () { hooks.resume(); resolve(true); },
          adError: function () { hooks.resume(); resolve(false); } // "unfilled" or "other"
        });
      });
    }
    return {
      name: 'crazygames',
      init: function () { return Promise.resolve(SDK.init ? SDK.init() : null).then(function () { SDK.game.loadingStart && SDK.game.loadingStart(); }); },
      loadingDone: function () { SDK.game.loadingStop && SDK.game.loadingStop(); },
      gameplayStart: function () { SDK.game.gameplayStart(); },
      gameplayStop: function () { SDK.game.gameplayStop(); },
      happy: function () { SDK.game.happytime && SDK.game.happytime(); },
      interstitial: function () { return ad('midgame'); },
      rewarded: function () { return ad('rewarded'); }
    };
  }

  // ---- Poki SDK v2 (sdk.poki.com/html5) -----------------------------------
  function poki() {
    var P = root.PokiSDK;
    if (!P) return null;
    return {
      name: 'poki',
      init: function () { return P.init().catch(function () { /* adblock: game still runs */ }); },
      loadingDone: function () { P.gameLoadingFinished(); },
      gameplayStart: function () { P.gameplayStart(); },
      gameplayStop: function () { P.gameplayStop(); },
      happy: noop,
      interstitial: function () {
        return P.commercialBreak(function () { hooks.pause(); }).then(function () { hooks.resume(); return true; });
      },
      rewarded: function () {
        return P.rewardedBreak(function () { hooks.pause(); }).then(function (ok) { hooks.resume(); return !!ok; });
      }
    };
  }

  // ---- GameDistribution (github.com/GameDistribution/GD-HTML5) ------------
  // Page must define, BEFORE loading main.min.js:
  //   window.GD_OPTIONS = { gameId: '<id from the GD dashboard>', onEvent: function (e) { Ads._gdEvent(e); } };
  function gamedistribution() {
    var gd = root.gdsdk;
    if (!gd) return null;
    return {
      name: 'gamedistribution',
      init: function () { return Promise.resolve(); },
      loadingDone: noop, gameplayStart: noop, gameplayStop: noop, happy: noop,
      interstitial: function () { return Promise.resolve(gd.showAd()).then(function () { return true; }, function () { return false; }); },
      rewarded: function () {
        return Promise.resolve(gd.showAd('rewarded')).then(function () { return !!api._gdReward; }, function () { return false; })
          .then(function (ok) { api._gdReward = false; return ok; });
      }
    };
  }

  // ---- AdMob through Capacitor (@capacitor-community/admob) ----------------
  // window.GAMEKIT_ADMOB = { interstitial: 'ca-app-pub-.../...', rewarded: 'ca-app-pub-.../...', testing: false, testDeviceIds: [] }
  // Boot order (MONETIZATION.md 4): UMP consent info -> consent form if required -> initialize only if
  // canRequestAds -> preload one interstitial + one rewarded. Ads are prepared ahead and after every show;
  // the show path never loads: if nothing is ready the placement is skipped silently.
  // Use Google's test ad unit ids (testing: true) until the store build.
  function admob() {
    var cap = root.Capacitor, A = cap && cap.Plugins && cap.Plugins.AdMob, ids = root.GAMEKIT_ADMOB || {};
    if (!A) return null;
    var loaded = { interstitial: false, rewarded: false }, loading = {};
    function prep(kind) {
      if (loaded[kind] || loading[kind]) return;
      loading[kind] = true;
      var p = kind === 'interstitial' ? A.prepareInterstitial({ adId: ids.interstitial, isTesting: !!ids.testing })
        : A.prepareRewardVideoAd({ adId: ids.rewarded, isTesting: !!ids.testing });
      Promise.resolve(p).then(function () { loaded[kind] = true; }, noop).then(function () { loading[kind] = false; });
    }
    function show(kind, fn) {
      if (!loaded[kind]) { prep(kind); return Promise.resolve(false); }
      loaded[kind] = false;
      hooks.pause();
      return Promise.resolve().then(fn)
        .then(function (r) { hooks.resume(); prep(kind); return r; }, function () { hooks.resume(); prep(kind); return false; });
    }
    return {
      name: 'admob',
      init: function () {
        return Promise.resolve(A.requestConsentInfo ? A.requestConsentInfo() : { canRequestAds: true })
          .then(function (info) {
            return info && info.status === 'REQUIRED' && info.isConsentFormAvailable ? A.showConsentForm() : info;
          })
          .then(function (info) {
            privacyRequired = !!info && info.privacyOptionsRequirementStatus === 'REQUIRED';
            if (info && info.canRequestAds === false) throw new Error('no ad consent');
            var devs = ids.testDeviceIds || []; // hashed ids of dev phones: they get test ads even with live ids
            return A.initialize({ initializeForTesting: !!ids.testing || devs.length > 0, testingDevices: devs, maxAdContentRating: policy.maxAdContentRating || 'T',
              tagForChildDirectedTreatment: false, tagForUnderAgeOfConsent: false });
          })
          .then(function () { prep('interstitial'); prep('rewarded'); });
      },
      ready: function (kind) { if (!loaded[kind]) prep(kind); return loaded[kind]; },
      loadingDone: noop, gameplayStart: noop, gameplayStop: noop, happy: noop,
      interstitial: function () { return show('interstitial', function () { return A.showInterstitial().then(function () { return true; }); }); },
      rewarded: function () { return show('rewarded', function () { return A.showRewardVideoAd().then(function (item) { return !!item; }); }); },
      privacyOptions: function () { return A.showPrivacyOptionsForm ? A.showPrivacyOptionsForm() : Promise.resolve(); }
    };
  }
  var privacyRequired = false, policy = {};

  var wanted = root.GAMEKIT_ADS || 'none';
  var factories = { crazygames: crazy, poki: poki, gamedistribution: gamedistribution, admob: admob };
  var impl = none;
  function pick() {
    var f = factories[wanted];
    var got = null;
    try { got = f ? f() : null; } catch (e) { got = null; }
    impl = got || none;
  }

  var busy = false, playing = false, gate = null;
  function safe(fn) { try { fn(); } catch (e) { /* never let an ad SDK break the game */ } }

  var api = {
    hooks: hooks,
    get provider() { return impl.name; },
    init: function () {
      pick();
      return Promise.resolve().then(function () { return impl.init(); }).catch(function () { impl = none; });
    },
    loadingDone: function () { safe(impl.loadingDone); },
    gameplayStart: function () { if (!playing) { playing = true; safe(impl.gameplayStart); } },
    gameplayStop: function () { if (playing) { playing = false; safe(impl.gameplayStop); } },
    happy: function () { safe(impl.happy); },
    // policy: config.ads ({interstitialMinGapMs, sessionStartGapMs, afterRewardedGapMs, levelsBetweenInterstitials})
    setPolicy: function (p) {
      policy = p || {};
      if (p && p.interstitialMinGapMs) MIN_GAP = p.interstitialMinGapMs;
      START_GAP = p && p.sessionStartGapMs != null ? p.sessionStartGapMs : MIN_GAP;
      REW_GAP = p && p.afterRewardedGapMs != null ? p.afterRewardedGapMs : MIN_GAP;
      if (p && p.levelsBetweenInterstitials) LEVEL_GAP = p.levelsBetweenInterstitials;
    },
    setNoAds: function (on) { noAds = !!on; },
    // plug a custom provider object (same shape as `none` above): tests, or a portal not listed here
    useProvider: function (p, resetClock) {
      impl = p || none;
      if (resetClock) { startedAt = -Infinity; lastInter = -Infinity; lastRew = -Infinity; levelsSince = 0; }
    },
    levelEnded: function () { levelsSince++; },
    // extra rule from the game (day-0 grace: no interstitial before level 8 / the 3rd game)
    setGate: function (fn) { gate = fn; },
    // is a rewarded ad loaded? (buttons that need one hide when not; 'none' = no ads in this build)
    rewardedReady: function () { return impl !== none && !busy && (!impl.ready || impl.ready('rewarded')); },
    privacyOptionsRequired: function () { return privacyRequired && !!impl.privacyOptions; },
    showPrivacyOptions: function () { return impl.privacyOptions ? Promise.resolve(impl.privacyOptions()).catch(noop) : Promise.resolve(); },
    // the game calls this only between games / levels, never on launch and never mid-level.
    // Needs LEVEL_GAP finished levels/games since the last one (Ads.levelEnded() counts both).
    canInterstitial: function (ctx) {
      var now = Date.now();
      if (busy || noAds || impl === none || levelsSince < LEVEL_GAP) return false;
      if (now - startedAt < START_GAP || now - lastInter < MIN_GAP || now - lastRew < REW_GAP) return false;
      if (gate && !gate(ctx)) return false;
      return !impl.ready || impl.ready('interstitial'); // preloaded only: never wait for a load
    },
    showInterstitial: function (ctx) {
      if (!api.canInterstitial(ctx)) return Promise.resolve(false);
      busy = true;
      api.track('ad_requested', { type: 'interstitial', provider: impl.name });
      return Promise.resolve().then(function () { return impl.interstitial(); })
        .catch(function () { return false; })
        .then(function (shown) {
          busy = false;
          if (shown) { lastInter = Date.now(); levelsSince = 0; api.track('ad_shown', { type: 'interstitial', provider: impl.name }); }
          return shown;
        });
    },
    // placement: 'continue' | 'double_coins' | 'chest' | 'booster' (analytics only)
    showRewarded: function (cb, placement) {
      if (busy) { cb(false); return; }
      busy = true;
      api.track('ad_requested', { type: 'rewarded', provider: impl.name, placement: placement || '' });
      Promise.resolve().then(function () { return impl.rewarded(); })
        .catch(function () { return false; })
        .then(function (ok) {
          busy = false;
          if (impl !== none) { lastRew = Date.now(); api.track('ad_shown', { type: 'rewarded', provider: impl.name, placement: placement || '' }); }
          if (ok) api.track('ad_rewarded', { provider: impl.name, placement: placement || '' });
          cb(!!ok);
        });
    },
    track: function (name, p) { if (root.Analytics) root.Analytics.track(name, p); },
    _gdReward: false,
    _gdEvent: function (e) {
      if (!e) return;
      if (e.name === 'SDK_GAME_PAUSE') hooks.pause();
      else if (e.name === 'SDK_GAME_START') hooks.resume();
      else if (e.name === 'SDK_REWARDED_WATCH_COMPLETE') api._gdReward = true;
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Ads = api;
})(this);

/* ---- gamekit/iap/iap.js ---- */
/* gamekit payments adapter (stub). The game only calls:
 *   IAP.init(products)      -> Promise; products from config.products ({id, type, price, grant})
 *   IAP.available           -> false on the web build: the shop hides real-money items
 *   IAP.price(id)           -> localised price string from the store (falls back to config)
 *   IAP.micros(id)          -> store price in micros (null without a store): offer value claims in the local currency
 *   IAP.purchase(id)        -> Promise<{ok, id, grant}>
 *   IAP.restore()           -> Promise<[ids]>  (non-consumables: remove_ads, season pass)
 *   IAP.onEntitlement(fn)   -> fn(product) for purchases that arrive late (pending, restored)
 *
 * Providers (window.GAMEKIT_IAP):
 *   'none'  default. Nothing to buy; web portals forbid their own payments anyway.
 *   'test'  dev only (?iap=test): every purchase succeeds after 400 ms. Never ship it.
 *   'play'  Google Play Billing through cordova-plugin-purchase v13 (works inside Capacitor):
 *           window.CdvPurchase.store. Receipt validation should go through a small server later;
 *           until then purchases are finished locally (fine for remove_ads / coins at this scale).
 * Real-money items are never random: every product grants exactly what its card says.
 */
(function (root) {
  'use strict';
  var catalog = [], byId = {}, listeners = [];
  function grantOf(id) { return byId[id] ? byId[id].grant : null; }
  function emit(id) { listeners.forEach(function (fn) { try { fn(byId[id]); } catch (e) { /* ignore */ } }); }

  var none = {
    name: 'none', available: false,
    init: function () { return Promise.resolve(); },
    purchase: function () { return Promise.resolve(false); },
    restore: function () { return Promise.resolve([]); },
    price: function () { return null; }
  };

  var test = {
    name: 'test', available: true,
    init: function () { return Promise.resolve(); },
    purchase: function () { return new Promise(function (r) { setTimeout(function () { r(true); }, 400); }); },
    restore: function () { return Promise.resolve([]); },
    price: function () { return null; }
  };

  function play() {
    var CP = root.CdvPurchase;
    if (!CP || !CP.store) return null;
    var store = CP.store, P = CP.Platform.GOOGLE_PLAY, pending = {};
    var TYPE = { consumable: CP.ProductType.CONSUMABLE, non_consumable: CP.ProductType.NON_CONSUMABLE,
      non_consumable_season: CP.ProductType.NON_CONSUMABLE };
    return {
      name: 'play', available: true,
      init: function () {
        store.register(catalog.map(function (p) { return { id: p.id, type: TYPE[p.type], platform: P }; }));
        store.when()
          .approved(function (tx) { return tx.verify ? tx.verify() : tx.finish(); })
          .verified(function (receipt) { return receipt.finish(); })
          .finished(function (tx) {
            (tx.products || []).forEach(function (p) {
              if (pending[p.id]) { pending[p.id](true); delete pending[p.id]; } else emit(p.id);
            });
          });
        return store.initialize([P]);
      },
      purchase: function (id) {
        var prod = store.get(id, P), offer = prod && prod.getOffer();
        if (!offer) return Promise.resolve(false);
        return new Promise(function (resolve) {
          pending[id] = resolve;
          store.order(offer).then(function (err) { if (err) { delete pending[id]; resolve(false); } });
        });
      },
      restore: function () {
        return store.restorePurchases().then(function () {
          return catalog.filter(function (p) { return p.type !== 'consumable' && store.owned(p.id); }).map(function (p) { return p.id; });
        });
      },
      price: function (id) { var p = store.get(id, P); return p && p.pricing ? p.pricing.price : null; },
      micros: function (id) { var p = store.get(id, P); return p && p.pricing && p.pricing.priceMicros ? p.pricing.priceMicros : null; }
    };
  }

  var impl = none, plugged = null, wanted = root.GAMEKIT_IAP || 'none';
  try { if (/[?&]iap=test/.test(root.location.search)) wanted = 'test'; } catch (e) { /* ignore */ }

  var api = {
    get provider() { return impl.name; },
    get available() { return impl.available; },
    init: function (products) {
      catalog = products || [];
      byId = {};
      catalog.forEach(function (p) { byId[p.id] = p; });
      impl = plugged || (wanted === 'play' ? (play() || none) : wanted === 'test' ? test : none);
      return Promise.resolve().then(function () { return impl.init(); }).catch(function () { impl = none; });
    },
    price: function (id) { return impl.price(id) || (byId[id] && byId[id].price) || ''; },
    // store price in micros of the local currency (value claims use it when every product involved has one)
    micros: function (id) { return impl.micros ? impl.micros(id) : null; },
    // tests: plug a provider object ({ name, available, init, purchase, restore, price }) like Ads.useProvider
    useProvider: function (p) { plugged = p || null; impl = p || none; },
    purchase: function (id) {
      if (!byId[id] || !impl.available) return Promise.resolve({ ok: false, id: id });
      return Promise.resolve().then(function () { return impl.purchase(id); }).catch(function () { return false; })
        .then(function (ok) { return { ok: !!ok, id: id, grant: ok ? grantOf(id) : null }; });
    },
    restore: function () { return Promise.resolve().then(function () { return impl.restore(); }).catch(function () { return []; }); },
    onEntitlement: function (fn) { listeners.push(fn); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IAP = api;
})(this);

/* ---- gamekit/meta/platform.js ---- */
/* gamekit platform core (no UI, no game code). One object the game talks to; see src/PLATFORM.md.
 *
 *   var P = Gamekit.create({ config, saveDefaults, today })
 *     config        platform defaults merged with the game's config (Gamekit.mergeConfig)
 *     saveDefaults  fn -> the game's own save section (P.data.game)
 *     today         optional fn -> 'YYYY-MM-DD' (tests, ?date=)
 *
 * The game reports: P.started({mode, level}), P.finished(result) and asks: P.continueOffer(),
 * P.requestContinue(cb), P.doubleCoins(n, cb), P.afterResult(ctx, fn), P.acquireBooster(id, cb), P.useBooster(id).
 * Everything else (wallet, quests, streak, pass, chests, ads policy, limited-time offers, store, save) stays inside the
 * platform. P.afterResult runs the between-games rhythm (meta/offers.js): nothing, the interstitial or an offer popup.
 */
(function (root) {
  'use strict';
  var req = function (p) { return typeof require === 'function' ? require(p) : null; };
  var U = root.GamekitUtil || req('./util.js'), Economy = root.GamekitEconomy || req('../economy/economy.js');
  var Meta = root.GamekitMeta || req('./meta.js'), Save = root.GamekitSave || req('./save.js'), Remote = root.GamekitRemote || req('./remote.js');
  var Ads = root.Ads || req('../ads/ads.js'), IAP = root.IAP || req('../iap/iap.js'), An = root.Analytics || req('./analytics.js');
  var Fun = root.GamekitFun || req('./fun.js'), League = root.GamekitLeague || req('./league.js'), Online = root.GamekitOnline || req('./online.js');
  var Offers = root.GamekitOffers || req('./offers.js');

  function mergeConfig(platform, game) { return U.merge(platform, game, ['products', 'skins']); }

  function create(opts) {
    var cfg = opts.config;
    Remote.boot(cfg);                                  // before anything reads a number
    var today = opts.today || function () { return U.dateKey(new Date()); };
    var gameId = (cfg.game && cfg.game.id) || 'game';
    var listeners = {};
    function emit(ev, a, b) { (listeners[ev] || []).forEach(function (fn) { try { fn(a, b); } catch (e) { if (root.console) root.console.error(e); } }); }

    var save = Save.create({ key: gameId + '.save', storage: opts.storage, defaults: function () {
      return { settings: { muted: false, theme: null }, progress: { stars: {}, unlocked: 1, run: null },
        economy: Economy.defaults(cfg), meta: Meta.defaults(cfg), fun: Fun.defaults(), league: League.defaults(), offers: Offers.defaults(),
        stats: { games: 0, levels: 0, byMode: {} }, game: opts.saveDefaults ? opts.saveDefaults() : {} };
    } });
    var D = function () { return save.data; };
    var hooks = { track: function (n, p) { An.track(n, p); }, onChange: function () { emit('wallet'); } };
    var eco = Economy.create(D().economy, cfg, hooks);
    var fun = null, league = null;
    var meta = Meta.create(D().meta, cfg, { economy: eco, track: hooks.track, today: today,
      onXp: function (n) { if (fun) fun.addXp(n); if (league) league.addXp(n); },
      onAllDaily: function () { return fun ? fun.grantSpins(cfg.wheel.questSpins, 'quests') : 0; },
      onStreak: function (count) { return fun ? fun.streakGift(count) : null; } });
    hooks.onGrant = meta.onGrant;
    // rankings / leagues: gamekit-api when the build sets window.GAMEKIT_API (offline-first, never blocks)
    var lang = String((root.navigator && root.navigator.language) || 'en').toLowerCase();
    var apiOff = false;   // ?api=off: offline test runs (no request leaves the page)
    try { apiOff = /[?&]api=off\b/.test(root.location ? root.location.search : ''); } catch (e) { /* node */ }
    var online = Online.create({ base: apiOff ? '' : opts.api != null ? opts.api : root.GAMEKIT_API, game: gameId, lang: lang.indexOf('es') === 0 ? 'es' : 'en',
      country: (lang.split('-')[1] || '').slice(0, 2), timeoutMs: cfg.online.timeoutMs, storage: opts.storage });
    fun = Fun.create(D().fun, cfg, { economy: eco, meta: meta, today: today, track: hooks.track });
    league = League.create(D().league, cfg, { economy: eco, meta: meta, today: today, track: hooks.track, seed: online.profile.id,
      myName: function () { return online.profile.nickname; }, myCountry: function () { return online.profile.showFlag ? online.profile.country : ''; } });
    online.handlers.league = function (j) { if (j && j.standings) league.setReal(j.standings, j.week); emit('league'); };
    online.handlers.score = function (j, body) { emit('ranked', j, body); };

    Ads.setPolicy(cfg.ads);
    Ads.setNoAds(eco.noAds);
    // day-0 grace: no interstitial (and no offer popup) before level N or the Nth finished non-level game on the first day
    function graceOk() {
      var d = D();
      return d.meta.firstDay !== today() || d.progress.unlocked >= cfg.ads.graceLevel || nonLevelGames() >= cfg.ads.graceGames;
    }
    Ads.setGate(graceOk);
    function nonLevelGames() { var b = D().stats.byMode || {}, n = 0; Object.keys(b).forEach(function (k) { if (k !== 'level') n += b[k]; }); return n; }
    // limited-time offers and the between-games rhythm (meta/offers.js); P is defined below, the deps read it lazily
    if (!D().offers) D().offers = Offers.defaults();
    var offers = Offers.create(D().offers, cfg, {
      products: function () { return P.products(); }, league: league, now: opts.now, rnd: opts.rnd, track: hooks.track,
      iapAvailable: function () { return IAP.available; }, micros: function (id) { return IAP.micros(id); },
      noAds: function () { return eco.noAds; }, allowed: function () { return P.unlocked('offers') && graceOk(); },
      owns: function (id) { return eco.ownsProduct(id); }, doubleActive: function () { return eco.doubleActive(); },
      games: function () { return D().stats.games; },
      starterEnd: function () {
        if (!P.unlocked('starter') || !meta.starterOpen(D().progress.unlocked)) return 0;
        return D().meta.starterFrom + cfg.starterPack.windowHours * 3600000;
      }
    });

    var P = {
      cfg: cfg, save: save, eco: eco, meta: meta, fun: fun, league: league, online: online, offers: offers, ads: Ads, iap: IAP, track: hooks.track, today: today,
      // set by the UI (shell/offers-ui.js): fn(offer, where 'break' | 'start', done). Without it no offer popup opens
      offerPresenter: null,
      get data() { return save.data; },
      get settings() { return save.data.settings; },
      get gameData() { return save.data.game; },
      on: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      emit: emit,
      commit: function () { return save.commit(); },

      // ---- progress (level map) ----
      progress: {
        unlocked: function () { return D().progress.unlocked; },
        stars: function (n) { return D().progress.stars[n] || 0; },
        // consecutive fails on level n since its last win (soft dynamic help: the game eases attempt 4+ silently)
        fails: function (n) { return (D().progress.fails || {})[n] || 0; },
        total: function () { var s = D().progress.stars; return Object.keys(s).reduce(function (a, k) { return a + s[k]; }, 0); }
      },
      unlocked: function (feature) { return meta.unlocked(feature, { level: D().progress.unlocked, games: D().stats.games }); },

      // ---- store catalogue (season pass = one product per season) ----
      products: function () {
        return cfg.products.map(function (p) { return p.season ? Object.assign({}, p, { id: meta.passProductId() }) : p; });
      },
      product: function (id) { return P.products().filter(function (p) { return p.id === id; })[0]; },

      // ---- game lifecycle ----
      started: function (info) {
        Ads.gameplayStart();
        hooks.track(info.level ? 'level_start' : 'game_start', { mode: info.mode, level: info.level || 0 });
      },
      // result: { mode, level?, won?, stars?, score, stats: { metric: n }, reason? }   (call once per finished game)
      // -> { coins, chest, streakGift, quests, prevStars, newBest? }
      finished: function (r) {
        Ads.gameplayStop();
        var d = D(), out = { coins: 0, chest: null, quests: [], prevStars: 0 };
        var stats = r.stats || {};
        if (r.level) {
          var fails = d.progress.fails = d.progress.fails || {};
          out.difficulty = r.difficulty || 'normal';
          if (r.won) {
            var prev = d.progress.stars[r.level] || 0;
            out.prevStars = prev;
            out.attempts = (fails[r.level] || 0) + 1;
            delete fails[r.level];
            d.progress.stars[r.level] = Math.max(prev, r.stars || 1);
            d.progress.unlocked = Math.max(d.progress.unlocked, r.level + 1);
            out.coins = eco.earn(eco.levelCoins(r.stars || 1, prev, r.difficulty), 'level');
            out.quests = meta.onGameEnd('level', stats);
            var w = meta.onLevelWin(r.level, r.stars || 1, prev, prev === 0);
            // hard levels also give more pass / level / league XP on their first win
            var xm = (cfg.coins.tierMult || {})[r.difficulty];
            if (prev === 0 && xm > 1) meta.addXp(Math.round(cfg.pass.xp.levelWin * (xm - 1)));
            out.chest = w.chest;
            out.quests = out.quests.concat(w.quests);
            d.stats.levels++;
            hooks.track('level_complete', { level: r.level, stars: r.stars, score: r.score, moves_left: stats.movesLeft || 0, boosters: stats.boosters || 0,
              difficulty: out.difficulty, attempts: out.attempts });
          } else {
            fails[r.level] = (fails[r.level] || 0) + 1;
            out.quests = meta.onGameEnd('level', stats);
            hooks.track('level_fail', { level: r.level, reason: r.reason || '', progress: stats.progress || 0, difficulty: out.difficulty, fails: fails[r.level] });
          }
        } else {
          out.coins = eco.earn(eco.gameCoins(r.mode, r.score || 0), r.mode);
          out.quests = meta.onGameEnd(r.mode, stats);
          hooks.track('game_end', { mode: r.mode, score: r.score || 0 });
        }
        d.stats.games++;
        var bm = d.stats.byMode = d.stats.byMode || {};
        bm[r.level ? 'level' : r.mode] = (bm[r.level ? 'level' : r.mode] || 0) + 1;
        Ads.levelEnded();
        offers.onGameEnd();
        out.streakGift = meta.lastStreak && meta.lastStreak.gift;
        out.surprise = meta.lastStreak && meta.lastStreak.surprise;   // streak gift day 3/7/14/30
        meta.lastStreak = null;
        // streak flame multiplier on this result's coins, then the lucky moment (both bounded, see MONETIZATION.md A)
        var base = out.coins;
        out.mult = fun.streakMult(meta.liveStreak());
        if (out.mult > 1 && base > 0) out.coins += eco.earn(Math.round(base * (out.mult - 1)), 'streak_mult');
        out.lucky = fun.applyLucky(base);
        out.coins += out.lucky;
        // "Monedas x2" hours bought in the store: this result's game coins once more
        if (eco.doubleActive() && base > 0) { out.double = eco.earn(base, 'x2_hours'); out.coins += out.double; }
        out.levelUps = fun.takeLevelUps();
        out.level = fun.levelInfo();
        save.commit();
        emit('wallet');
        if (out.levelUps.length) emit('levelup', out.levelUps);
        P.syncLeague();
        return out;
      },
      // the game reports a big moment (e.g. strength = combo size). true = lucky x2 coins for this game
      moment: function (strength) {
        var hit = fun.moment(strength);
        if (hit) { save.commit(); emit('lucky'); }
        return hit;
      },
      // ranking: the game submits its result (daily challenge with a replayable move log)
      submitScore: function (s) { return online.submitScore(s); },
      syncLeague: function () {
        league.roll();
        if (league.state.joined) online.leagueProgress({ week: league.state.week, tier: league.state.tier, xp: league.state.xp });
      },
      // ranking rewards for finished days, granted by the server once (call at boot / menu)
      claimRankRewards: function () {
        return online.claimRewards().then(function (j) {
          if (!j || !j.coins) return null;
          eco.earn(j.coins, 'ranking');
          save.commit();
          emit('rankreward', j);
          return j;
        });
      },
      // wheel spin: kind 'free' | 'bank' | 'ad'. For 'ad' the platform shows the rewarded ad first.
      spin: function (kind, cb) {
        var go = function () { var res = fun.spin(kind); save.commit(); emit('wallet'); cb(res); };
        if (kind === 'ad') { if (!Ads.rewardedReady() || fun.adLeft() <= 0) { cb(null); return; } Ads.showRewarded(function (ok) { if (ok) go(); else cb(null); }, 'wheel'); return; }
        go();
      },

      // ---- continue: the platform decides rewarded ad vs coins (no lives; retry is always free) ----
      continueOffer: function () {
        var byAd = Ads.rewardedReady();
        return { byAd: byAd, coins: cfg.continueCoins, affordable: byAd || eco.coins >= cfg.continueCoins };
      },
      requestContinue: function (cb) {
        if (Ads.rewardedReady()) { Ads.showRewarded(function (ok) { cb(ok); }, 'continue'); return; }
        var ok = eco.spend(cfg.continueCoins, 'continue');
        if (ok) save.commit();
        cb(ok);
      },
      // R2 double coins: bounded per day (coins.doublePerDay; 0 or missing = no cap)
      doublesLeft: function () {
        var cap = cfg.coins.doublePerDay, s = D().stats.doubles;
        if (!cap) return Infinity;
        return s && s.day === today() ? Math.max(0, cap - s.n) : cap;
      },
      canDouble: function (n) { return n > 0 && cfg.coins.doubleWithAd && P.doublesLeft() > 0 && Ads.rewardedReady(); },
      doubleCoins: function (n, cb) {
        Ads.showRewarded(function (ok) {
          if (ok) {
            var st = D().stats, d = today();
            if (!st.doubles || st.doubles.day !== d) st.doubles = { day: d, n: 0 };
            st.doubles.n++;
            eco.earn(n, 'double_coins'); save.commit();
          }
          cb(ok);
        }, 'double_coins');
      },
      // natural break: call from a result-screen tap (Next / Again / Home), then fn(). The rhythm (offers.decide) picks
      // nothing, the interstitial or an offer popup; one interruption every 3-5 games (config.offers), never mid-level
      afterResult: function (ctx, fn) {
        // fn always runs after the tap's event has finished (as it did when this was a Promise chain): a game may start
        // the next level from fn, and the same click must not reach the new screen
        var once = false, go = function () { if (!once) { once = true; Promise.resolve().then(fn); } };
        var d = offers.decide(Ads.canInterstitial(ctx));
        if (d.kind === 'offer' && P.offerPresenter) {
          var o = offers.open(d.offer, 'break');
          save.commit();
          // when the popup is done, a one-shot offer is gone for good (whatever the UI does)
          if (o) { P.offerPresenter(o, 'break', function () { offers.close(o.key); save.commit(); go(); }); return; }
        }
        if (d.kind === 'skip') { offers.taken('skip'); save.commit(); go(); return; }
        if (d.kind === 'ad' || d.kind === 'offer') {
          Ads.showInterstitial(ctx).then(function (shown) { if (shown) { offers.taken('ad'); save.commit(); } go(); }, go);
          return;
        }
        go();
      },
      // app start (P.init, once the store is ready): one popup per session at most, for a live timed offer
      // (league-up pack, weekend deal, starter pack); never on the first launch (config.offers.appStart)
      startOffers: function () {
        if (!P.offerPresenter) return null;
        var o = offers.startOffer();
        if (o) { save.commit(); P.offerPresenter(o, 'start', function () { offers.close(o.key); save.commit(); }); }
        return o;
      },
      // buy a live offer (only while it is live: popup open or countdown running); the grant marks it bought
      buyOffer: function (key) {
        var o = offers.get(key);
        if (!o || !offers.canBuy(key)) return Promise.resolve(null);
        return P.buy(o.product);
      },

      // ---- boosters: the platform owns counts; the game owns the effect ----
      // cb(true) when one is available (owned, bought with coins, or earned with a rewarded ad)
      acquireBooster: function (id, cb) {
        if (eco.boosters(id) > 0) { cb(true, 'owned'); return; }
        if (eco.buyBooster(id)) { save.commit(); cb(true, 'coins'); return; }
        if (Ads.rewardedReady()) { Ads.showRewarded(function (ok) { if (ok) eco.addBooster(id, 1, 'ad'); cb(ok, 'ad'); }, 'booster'); return; }
        cb(false, 'price');
      },
      useBooster: function (id) { var ok = eco.useBooster(id); if (ok) { meta.progress('boosters', 1); save.commit(); } return ok; },
      // the game calls this right before P.finished() when a win came within a few moves of a booster:
      // info { booster, level, movesAfter }. The shell listens to 'boosterAssistedWin' and celebrates it.
      boosterAssistedWin: function (info) {
        info = info || {};
        hooks.track('booster_assisted_win', { booster: info.booster || '', level: info.level || 0, moves_after: info.movesAfter || 0 });
        emit('boosterAssistedWin', info);
      },

      // ---- purchases (everything real-money goes through the IAP adapter) ----
      grantProduct: function (p, quiet) {
        if (!p) return null;
        if (p.type !== 'consumable' && eco.ownsProduct(p.id)) return null; // restore never grants twice
        var got = eco.grant(p.season ? { passPremium: meta.seasonKey() } : p.grant, 'iap_' + p.id);
        if (p.type !== 'consumable') eco.markProduct(p.id);
        offers.bought(p.id);
        Ads.setNoAds(eco.noAds);
        save.commit();
        emit('granted', got, quiet);
        if (got.skin) emit('skin');
        return got;
      },
      buy: function (id) {
        return IAP.purchase(id).then(function (r) {
          hooks.track(r.ok ? 'purchase' : 'purchase_failed', { product: id });
          return r.ok ? P.grantProduct(P.product(id)) : null;
        });
      },
      restore: function (loud) {
        return IAP.restore().then(function (ids) {
          ids.forEach(function (id) { var p = P.product(id); if (p && p.type !== 'consumable') P.grantProduct(p, !loud); });
          return ids;
        });
      },

      init: function () {
        if (save.data.isNew) { delete save.data.isNew; hooks.track('first_open', {}); }
        save.commit();
        hooks.track('app_open', { ads: Ads.provider });
        IAP.onEntitlement(function (p) { P.grantProduct(p && P.product(p.id)); });
        var adsReady = Ads.init().then(function () { Ads.loadingDone(); Ads.setNoAds(eco.noAds); emit('ads'); });
        offers.session();
        var iapReady = IAP.init(P.products()).then(function () { if (IAP.available) return P.restore(false); }).then(function () { P.startOffers(); });
        // wake the ranking server (free plan cold start) and settle the league week; never awaited by the game
        var res = league.roll();
        if (res) { save.commit(); emit('leagueend', res); }
        online.warm().then(function () { P.syncLeague(); return P.claimRankRewards(); }).catch(function () { /* offline */ });
        return Promise.all([adsReady, iapReady]);
      }
    };
    return P;
  }

  var Gamekit = { create: create, mergeConfig: mergeConfig };
  if (typeof module !== 'undefined' && module.exports) module.exports = Gamekit;
  else root.Gamekit = Gamekit;
})(this);

/* ---- gamekit/shell/shell.js ---- */
/* gamekit UI shell: screens + HUD chips, toast, level map, quests / chests / pass sheet, shop, booster bar,
 * result-screen economy (coins, double coins, continue) and settings (sound, theme, privacy, restore).
 * Platform layer: it never touches game code; the game passes what it needs in `opts` (see gamekit/PLATFORM.md).
 * Art (chests, coins, piggy, shields...) comes from shell/art.js; the look from the tokens in shell.css (ART.md).
 *
 *   var shell = GamekitShell.create(P, opts)
 *   opts.ids: { '<default id>': '<id in this page>' } remaps the element ids below (embedded games use the gk-* ids
 *   that GamekitEmbed.mount() creates). Every element is optional: a missing one is skipped.
 *   opts.levels.difficulty(n) -> 'facil' | 'normal' | 'dificil' | 'superdificil'   (badges on the map, intro popup)
 */
(function (root) {
  'use strict';

  var TEXTS = {
    en: { claim: 'Claim', open: 'Open', dailyQ: 'TODAY', weeklyQ: 'THIS WEEK', boosters: 'BOOSTERS', blocks: 'SKINS', boards: 'BOARDS',
      streak: 'STREAK', store: 'STORE', equip: 'Use', removeAds: 'No ads', pass: 'Pass', wait: 'One chest at a time', min: 'min', h: 'h', d: 'd',
      free: 'FREE', starter: 'Starter pack', piggy: 'Piggy bank', passWhat: 'Premium row: coins, gold chests, 2 skins', restore: 'Restore purchases',
      legal: 'Purchases & refunds', privacy: 'Privacy options', cont: 'Continue',
      legalText: 'Prices include VAT and are charged by Google Play. Every item gives exactly what its card shows; nothing is random. EU right of withdrawal: 14 days, which ends once a digital item is delivered with your consent. Refund requests: Google Play, Order history.',
      popular: 'Popular', best: 'Best value', offer: 'Offer', coinsH: 'COINS', season: 'Season pass', premium: 'Premium', freeRow: 'Free',
      piggyFill: 'Fills up as you play', piggyBreak: 'Ready to break!', left: 'Ends in', empty: 'Empty', locked: 'Locked', owned: 'Owned',
      tap: 'Tap to unlock', unlocking: 'Opening', noAdsWhat: 'No breaks between games', freezeWhat: 'Saves your streak one day',
      hard: 'HARD LEVEL', superHard: 'SUPER HARD!', questsL: 'Quests', shopL: 'Shop', easy: 'Easy', play: 'Play', upTo: 'Up to', level: 'Level',
      x2: 'Coins ×2', x2On: 'Active', q: {}, skins: {} },
    es: { claim: 'Recoger', open: 'Abrir', dailyQ: 'HOY', weeklyQ: 'ESTA SEMANA', boosters: 'AYUDAS', blocks: 'ASPECTOS', boards: 'TABLEROS',
      streak: 'RACHA', store: 'TIENDA', equip: 'Usar', removeAds: 'Sin anuncios', pass: 'Pase', wait: 'Un cofre cada vez', min: 'min', h: 'h', d: 'd',
      free: 'GRATIS', starter: 'Pack inicial', piggy: 'Hucha', passWhat: 'Fila premium: monedas, cofres de oro, 2 aspectos', restore: 'Restaurar compras',
      legal: 'Compras y reembolsos', privacy: 'Privacidad', cont: 'Seguir',
      legalText: 'Precios con IVA, cobrados por Google Play. Cada artículo da exactamente lo que indica su tarjeta; nada es aleatorio. Derecho de desistimiento UE: 14 días, que se pierde al entregar el contenido digital con tu consentimiento. Reembolsos: Google Play, Historial de pedidos.',
      popular: 'Popular', best: 'Mejor valor', offer: 'Oferta', coinsH: 'MONEDAS', season: 'Pase de temporada', premium: 'Premium', freeRow: 'Gratis',
      piggyFill: 'Se llena al jugar', piggyBreak: '¡Lista para romper!', left: 'Termina en', empty: 'Vacío', locked: 'Bloqueado', owned: 'Tuyo',
      tap: 'Toca para abrir', unlocking: 'Abriendo', noAdsWhat: 'Sin pausas entre partidas', freezeWhat: 'Salva tu racha un día',
      hard: 'NIVEL DIFÍCIL', superHard: '¡SÚPER DIFÍCIL!', questsL: 'Misiones', shopL: 'Tienda', easy: 'Fácil', play: 'Jugar', upTo: 'Hasta', level: 'Nivel',
      x2: 'Monedas ×2', x2On: 'Activo', q: {}, skins: {} }
  };
  var BOOST_COL = ['#ff8a3d', '#3f9bff', '#a066ff', '#2fbf71', '#ff4f7b', '#ffb320'];
  var DIFF = { dificil: 'hard', superdificil: 'super', facil: 'easy' };

  function create(P, opts) {
    var IDS = opts.ids || {};
    var doc = root.document, $ = function (id) { return id ? doc.getElementById(IDS[id] || id) : null; };
    var cfg = P.cfg, eco = P.eco, meta = P.meta, Ads = P.ads, IAP = P.iap;
    var Art = root.GamekitArt;
    if (Art) Art.install(doc);
    // opts.lang: a game that only exists in one language (Atascazo, Hilvana) pins the platform texts to it
    var lang = opts.lang || (String(root.navigator.language || 'en').toLowerCase().indexOf('es') === 0 ? 'es' : 'en');
    var TX = Object.assign({}, TEXTS[lang], (opts.texts || {})[lang] || {});
    var sfx = Object.assign({ coin: noop, win: noop, bad: noop, pick: noop, tick: noop }, opts.sfx || {});
    var ico = function (id, cls) { return '<svg' + (cls ? ' class="' + cls + '"' : '') + '><use href="#i-' + id + '"/></svg>'; };
    var gic = function (k, cls) { return '<svg viewBox="0 0 512 512"' + (cls ? ' class="' + cls + '"' : '') + '><use href="#gk-ic-' + k + '"/></svg>'; };
    var chestArt = function (type, cls) { return Art ? Art.chest(type, { cls: cls || 'gk-chestart' }) : ico('chest'); };
    var screens = {}, screen = null, legalOpen = false, lvBuilt = false;
    var BOOST = (opts.boosters && opts.boosters.ids) || [];
    var boostCol = function (id) { var c = opts.boosters && opts.boosters.colors; return (c && c[id]) || BOOST_COL[Math.max(0, BOOST.indexOf(id)) % BOOST_COL.length]; };
    function noop() {}
    function difficulty(n) {
      var L = opts.levels, d = L && L.difficulty ? L.difficulty(n) : null;
      return DIFF[d] ? d : 'normal';
    }

    // ---------- screens ----------
    // def: { el: element id or null, hud: { menu, score, coins, streak, boosters: bool | fn }, onShow, sheet }
    // sheet: a platform sheet (body class gk-open while it is up; embedded games show the gamekit bar then)
    var SHEETS = {
      levels: { el: 'levels', hud: { coins: true }, sheet: true, onShow: function () { renderLevels(); } },
      quests: { el: 'quests', hud: { coins: true }, sheet: true, onShow: function () { renderQuests(true); } },
      shop: { el: 'shop', hud: { coins: true }, sheet: true, onShow: function () { renderShop(); } }
    };
    var base = null;   // last screen that is not a platform sheet (the gamekit bar's back button returns there)
    function register(name, def) { screens[name] = def; }
    Object.keys(SHEETS).forEach(function (k) { register(k, SHEETS[k]); });
    function show(name) {
      var prev = screen, def = screens[name], hud = def.hud || {}, b = doc.body.classList;
      screen = name;
      if (!def.sheet) base = name;
      b.toggle('gk-open', !!def.sheet);
      Object.keys(screens).forEach(function (k) { var d = screens[k]; if (d.el && $(d.el)) $(d.el).classList.toggle('show', k === name); });
      b.toggle('in-menu', !!hud.menu);
      b.toggle('hide-score', !hud.score);
      b.toggle('show-coins', !!hud.coins);
      b.toggle('show-streak', !!hud.streak);
      b.toggle('with-boosters', boostersOn());
      if (def.sheet && def.el && $(def.el)) $(def.el).scrollTop = 0;
      if (def.onShow) def.onShow(prev);
      refresh();
      if (opts.onScreen) opts.onScreen(name, prev);
    }
    function boostersOn() {
      var hud = (screens[screen] || {}).hud || {}, on = typeof hud.boosters === 'function' ? hud.boosters() : !!hud.boosters;
      return on && P.unlocked('boosters');
    }

    // ---------- HUD ----------
    var coinHold = false;   // the engagement UI ticks the number up while coins fly in
    function refresh() {
      var cn = $('coins'), sv = $('streak-v'), sc = $('streak');
      if (!coinHold && cn) cn.textContent = eco.coins;
      if (sv) sv.textContent = meta.liveStreak();
      if (sc) {
        sc.classList.toggle('cold', !meta.playedToday());
        sc.classList.toggle('repair', meta.canRepairStreak() && Ads.rewardedReady());
      }
      if (opts.quests && $(opts.quests.button)) {
        var on = P.unlocked('quests');
        $(opts.quests.button).hidden = !on;
        var n = on ? claimable() : 0, bd = $(opts.quests.badge);
        if (bd && bd.textContent !== (n ? String(n) : '')) { bd.textContent = n ? String(n) : ''; bounce(bd); }
      }
      renderBoosters();
    }
    function bounce(el) { if (el && el.animate && el.textContent) el.animate([{ transform: 'scale(.3)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,1.6,.5,1)' }); }
    P.on('wallet', refresh);
    P.on('ads', function () { doc.body.classList.toggle('no-ads', Ads.provider === 'none'); refresh(); });
    P.on('granted', function (got, quiet) { if (!quiet) toast(rewardText(got) || '✓'); if (screen === 'shop') renderShop(); });
    P.on('skin', function () { if (opts.onSkin) opts.onSkin(); });

    function toast(html) {
      var el = $('toast');
      if (!el) return;
      el.innerHTML = html;
      el.classList.remove('show'); void el.offsetWidth;
      el.classList.add('show');
      clearTimeout(toast.t);
      toast.t = setTimeout(function () { el.classList.remove('show'); }, 1800);
    }
    function rewardText(got) {
      var parts = [];
      if (!got) return '';
      if (got.coins) parts.push('+' + got.coins + ' ' + ico('coin'));
      if (got.boosters) Object.keys(got.boosters).forEach(function (k) { parts.push('+' + got.boosters[k] + ' ' + ico(k)); });
      if (got.chest || got.chest2) parts.push('+1 ' + ico('chest'));
      if (got.skin) parts.push(TX.skins[got.skin] || got.skin);
      if (got.noAds) parts.push(TX.removeAds);
      if (got.doubleHours) parts.push('×2 ' + ico('coin') + ' ' + got.doubleHours + ' ' + TX.h);
      return parts.join(' &nbsp;');
    }
    function contentsHtml(c) {
      var out = [];
      if (c.coins) out.push(c.coins + ' ' + ico('coin'));
      if (c.boosters) Object.keys(c.boosters).forEach(function (k) { out.push(c.boosters[k] + ' ' + ico(k)); });
      if (c.skin) out.push(TX.skins[c.skin] || c.skin);
      if (c.noAds) out.push(TX.removeAds);
      if (c.noAdsDays) out.push(TX.removeAds + ' ' + c.noAdsDays + TX.d);
      if (c.doubleHours) out.push(TX.x2 + ' ' + c.doubleHours + ' ' + TX.h);
      return out.join(' · ');
    }
    // reward tiles: icon on top, amount below (shop contents, pass track, chest contents)
    function rewardTiles(c, cls) {
      var out = [], t = function (icon, txt, x) { out.push('<span class="gk-rt' + (x ? ' ' + x : '') + '">' + icon + '<b>' + txt + '</b></span>'); };
      if (!c) return '';
      if (c.coins) t(ico('coin'), '+' + Number(c.coins).toLocaleString(lang), 'coin');
      if (c.boosters) Object.keys(c.boosters).forEach(function (k) { t('<i class="gk-bt" style="--bc:' + boostCol(k) + '">' + ico(k) + '</i>', '×' + c.boosters[k]); });
      if (c.chest) t(chestArt(c.chest, 'gk-chestmini'), '×1', 'ch');
      if (c.skin) t((opts.skinPreview && eco.skin && eco.skin(c.skin) ? '<i class="gk-skinmini">' + opts.skinPreview(eco.skin(c.skin), currentTheme()) + '</i>' : gic('sparkles')), TX.skins[c.skin] || c.skin, 'skin');
      if (c.noAds) t(Art ? Art.noAds() : '', TX.removeAds, 'noads');
      if (c.noAdsDays) t(Art ? Art.noAds() : '', c.noAdsDays + ' ' + TX.d, 'noads');
      if (c.doubleHours) t('<i class="gk-x2i">' + ico('coin') + '<em>×2</em></i>', c.doubleHours + ' ' + TX.h, 'dbl');
      return '<span class="gk-rts' + (cls ? ' ' + cls : '') + '">' + out.join('') + '</span>';
    }

    // ---------- settings (HUD buttons) ----------
    function setMuted(m) {
      P.settings.muted = m;
      doc.body.classList.toggle('muted', m);
      if (opts.onMute) opts.onMute(m);
      P.commit();
    }
    function currentTheme() {
      var t = P.settings.theme;
      if (t === 'light' || t === 'dark') return t;
      return root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function tap(id, fn) { var el = $(id); if (el) el.addEventListener('click', function (e) { if (opts.onTap) opts.onTap(); fn(e); }); }
    tap('b-sound', function () { setMuted(!P.settings.muted); });
    tap('b-theme', function () {
      P.settings.theme = currentTheme() === 'dark' ? 'light' : 'dark';
      P.commit();
      if (opts.onTheme) opts.onTheme(P.settings.theme);
      if (screen === 'shop') renderShop();
    });
    tap('b-coins', function () { show('shop'); });
    tap('streak', function () {
      if (!(meta.canRepairStreak() && Ads.rewardedReady())) return;
      Ads.showRewarded(function (ok) { if (ok && meta.repairStreak()) { P.commit(); sfx.win(); toast(ico('flame') + ' ' + meta.liveStreak()); refresh(); } }, 'streak_repair');
    });
    if (opts.quests) tap(opts.quests.button, function () { show('quests'); });
    if (opts.shopButton) tap(opts.shopButton, function () { show('shop'); });
    // the dock tiles show their aria-label as a caption: make it the platform's word in this language
    if (opts.quests && $(opts.quests.button)) $(opts.quests.button).setAttribute('aria-label', TX.questsL);
    if (opts.shopButton && $(opts.shopButton)) $(opts.shopButton).setAttribute('aria-label', TX.shopL);

    // ---------- level map ----------
    // round level pucks; the current one carries a marker; hard / super-hard levels a badge and a coloured ring
    function renderLevels() {
      var L = opts.levels, grid = $('lv-grid');
      if (!L || !grid) return;
      var chapter = L.chapter || 15, unlockedTo = Math.min(P.progress.unlocked(), L.count);
      if (!lvBuilt) {
        var html = '';
        for (var n = 1; n <= L.count; n++) {
          if ((n - 1) % chapter === 0) html += '<h4><span>' + n + '–' + Math.min(n + chapter - 1, L.count) + '</span></h4>';
          var d = difficulty(n);
          html += '<button class="lv' + (d !== 'normal' ? ' d-' + DIFF[d] : '') + '" data-n="' + n + '"><span>' + n + '</span><i></i>' +
            (d === 'dificil' ? '<em class="gk-dbadge hard">' + ico('flame') + '</em>' : d === 'superdificil' ? '<em class="gk-dbadge super">' + gic('skull') + '</em>' : '') + '</button>';
        }
        grid.innerHTML = html;
        grid.addEventListener('click', function (e) {
          var b = e.target.closest('.lv');
          if (!b || b.classList.contains('lock')) return;
          if (opts.onTap) opts.onTap();
          var n = +b.dataset.n;
          levelIntro(n, function () { L.start(n); });
        });
        lvBuilt = true;
      }
      grid.querySelectorAll('.lv').forEach(function (b) {
        var n = +b.dataset.n, st = P.progress.stars(n), lock = n > P.progress.unlocked();
        b.classList.toggle('lock', lock);
        b.classList.toggle('cur', n === unlockedTo);
        b.classList.toggle('done', !lock && st > 0);
        b.querySelector('i').innerHTML = lock ? ico('lock', 'lk') : [0, 1, 2].map(function (k) { return ico('star', k < st ? 'on' : ''); }).join('');
      });
      if ($('lv-stars')) $('lv-stars').textContent = P.progress.total();
      var cur = grid.querySelector('.lv.cur');
      if (cur) setTimeout(function () { cur.scrollIntoView({ block: 'center' }); }, 30);
    }
    // hard / super-hard levels open with a dramatic banner and the reward they pay; other levels start at once
    function levelIntro(n, go) {
      var d = difficulty(n);
      if ((d !== 'dificil' && d !== 'superdificil') || !api.introOpener) { go(); return; }
      var coins = eco.levelCoins ? eco.levelCoins(3, P.progress.stars(n), d) : 0;
      api.introOpener({ level: n, difficulty: d, coins: coins, title: d === 'superdificil' ? TX.superHard : TX.hard }, go);
    }

    // ---------- quests, chests, pass ----------
    function unclaimedPass() {
      if (!P.unlocked('pass')) return [];
      var tier = meta.passTier(), out = [], ps = P.data.meta.pass;
      for (var t = 1; t <= tier; t++) {
        if (ps.free.indexOf(t) < 0) out.push([t, 'free']);
        if (meta.hasPremiumPass() && ps.premium.indexOf(t) < 0) out.push([t, 'premium']);
      }
      return out;
    }
    function claimable() {
      var n = meta.quests().filter(function (q) { return q.done && !q.claimed; }).length;
      if (P.unlocked('chests')) P.data.meta.chests.forEach(function (c, i) { if (meta.chestState(i).status === 'ready') n++; });
      if (unclaimedPass().length) n++;
      return n;
    }
    function fmtLeft(ms) {
      var s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
      var p2 = function (v) { return (v < 10 ? '0' : '') + v; };
      return h ? h + ':' + p2(m) + ':' + p2(x) : m + ':' + p2(x);
    }
    function questText(q) { return (TX.q[q.metric] || q.metric + ' {n}').replace('{n}', q.target); }
    var chestSig = '';
    function chestLabel(st, o) {
      var canSkip = st.status === 'unlocking' && Ads.rewardedReady() && meta.canAdSkip();
      if (st.status === 'ready') return '<span class="gk-cl go">' + TX.open + '</span>';
      if (st.status === 'unlocking') return '<span class="gk-cl run">' + gic('stopwatch') + '<b data-left="1">' + fmtLeft(st.msLeft) + '</b>' + (canSkip ? ico('ad') : '') + '</span>';
      return '<span class="gk-cl">' + gic('stopwatch') + (o.unlockMin >= 60 ? o.unlockMin / 60 + ' ' + TX.h : o.unlockMin + ' ' + TX.min) + '</span>';
    }
    function renderChests() {
      var html = '', sig = '';
      for (var i = 0; i < cfg.chests.slots; i++) {
        var st = meta.chestState(i);
        if (!st) { html += '<div class="chest empty"><span class="gk-ghost">' + ico('chest') + '</span><small>' + TX.empty + '</small></div>'; sig += 'e'; continue; }
        var o = meta.chestOdds(st.type), what = meta.chestContents(st.type), rar = o.rarity || 'common';
        sig += st.type + st.status + (st.status === 'unlocking' && Ads.rewardedReady() && meta.canAdSkip() ? 'a' : '');
        // rarity colour + the lucky-upgrade chance, shown before opening
        html += '<button class="chest ' + st.type + ' r-' + rar + (st.status === 'ready' ? ' ready' : '') + (st.status === 'unlocking' ? ' running' : '') + '" data-i="' + i + '">' +
          '<span class="gk-chestglow"></span>' + chestArt(st.type) + chestLabel(st, o) +
          '<small class="gk-cc"><span>' + ico('coin') + what.coins + '</span><span>' + Object.keys(what.boosters || {}).map(function (k) { return '<i class="gk-bt" style="--bc:' + boostCol(k) + '">' + ico(k) + '</i>'; }).join('') + '</span></small>' +
          (st.lucky ? '<small class="luck">✦ ' + Math.round(st.lucky * 100) + '%</small>' : '') + '</button>';
      }
      chestSig = sig;
      return html;
    }
    function rewardMini(r, row, state) {
      var inner = r.coins ? ico('coin') + '<b>' + r.coins + '</b>' : r.chest ? chestArt(r.chest, 'gk-chestmini') : r.skin ? gic('sparkles') + '<b>' + esc(TX.skins[r.skin] || r.skin) + '</b>'
        : r.boosters ? (function () { var ks = Object.keys(r.boosters), n = ks.reduce(function (a, k) { return a + r.boosters[k]; }, 0); return '<i class="gk-bt" style="--bc:' + boostCol(ks[0]) + '">' + ico(ks[0]) + '</i><b>×' + n + '</b>'; })() : r.spins ? '<b>+' + r.spins + '</b>' : '';
      return '<span class="gk-pr ' + row + ' ' + state + '">' + inner + (state === 'got' ? '<em class="gk-ok">✓</em>' : state === 'lock' ? '<em class="gk-lk">' + ico('lock') + '</em>' : '') + '</span>';
    }
    function renderPass() {
      var el = $('pass');
      if (!P.unlocked('pass')) { el.style.display = 'none'; return; }
      var ps = P.data.meta.pass, tier = meta.passTier(), into = ps.xp - tier * cfg.pass.xpPerTier, pend = unclaimedPass(), max = tier >= cfg.pass.tiers, prem = meta.hasPremiumPass();
      var track = '';
      for (var t = 1; t <= cfg.pass.tiers; t++) {
        var reached = t <= tier;
        var fs = ps.free.indexOf(t) >= 0 ? 'got' : reached ? 'ready' : 'todo';
        var pst = !prem ? 'lock' : ps.premium.indexOf(t) >= 0 ? 'got' : reached ? 'ready' : 'todo';
        track += '<div class="gk-tn' + (reached ? ' on' : '') + (t === tier + 1 ? ' next' : '') + '">' + rewardMini(meta.passReward(t, 'free'), 'free', fs) +
          '<span class="gk-tdot">' + t + '</span>' + rewardMini(meta.passReward(t, 'premium'), 'prem', pst) + '</div>';
      }
      el.innerHTML = '<div class="gk-pass-top"><span class="tier"><b>' + tier + '</b></span><div class="gk-pass-info"><b>' + TX.season + '</b>' +
        '<div class="bar gk-bar3"><i style="width:' + (max ? 100 : into / cfg.pass.xpPerTier * 100) + '%"></i><span>' + (max ? 'MAX' : into + '/' + cfg.pass.xpPerTier) + '</span></div></div>' +
        (pend.length ? '<button class="mini cta wig" id="pass-claim">' + TX.claim + ' ' + pend.length + '</button>' : '<span></span>') + '</div>' +
        '<div class="gk-track-rows"><span class="gk-rowlab free">' + TX.freeRow + '</span><span class="gk-rowlab prem">' + TX.premium + '</span></div>' +
        '<div class="gk-track" id="gk-track">' + track + '</div>';
      el.style.display = '';
      var tr = el.querySelector('.gk-track'), cur = tr && tr.children[Math.max(0, tier - 1)];
      if (cur) tr.scrollLeft = Math.max(0, cur.offsetLeft - tr.clientWidth / 2 + cur.offsetWidth / 2);
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
    function renderQuests() {
      if (!$('qlist') || !$('chests') || !$('pass')) return;
      var showChests = P.unlocked('chests');
      $('chests').innerHTML = showChests ? renderChests() : '';
      $('chests').style.display = showChests ? '' : 'none';
      renderPass();
      var qs = meta.quests();
      var row = function (q) {
        var ready = q.done && !q.claimed, pct = Math.min(100, q.progress / q.target * 100);
        return '<div class="q' + (q.claimed ? ' claimed' : '') + (ready ? ' ready' : '') + '"><span class="t">' + questText(q) + '</span>' +
          '<span class="r">' + (ready ? '<button class="mini cta wig" data-q="' + q.id + '">' + TX.claim + '</button>'
            : q.claimed ? '<span class="gk-done">✓</span>' : '<span class="mini gk-prize-pill">+' + q.reward.coins + ' ' + ico('coin') + '</span>') + '</span>' +
          '<div class="gk-qb"><div class="bar gk-bar3"><i style="width:' + pct + '%"></i><span class="n">' + Math.min(q.progress, q.target) + '/' + q.target + '</span></div></div></div>';
      };
      $('qlist').innerHTML = '<h4><span>' + TX.dailyQ + '</span></h4>' + qs.filter(function (q) { return q.kind === 'daily'; }).map(row).join('') +
        '<h4><span>' + TX.weeklyQ + '</span></h4>' + qs.filter(function (q) { return q.kind === 'weekly'; }).map(row).join('');
    }
    // every second: only the chest timers move (a full re-render would restart the animations and the pass scroll)
    function tickQuests() {
      if (!P.unlocked('chests') || !$('chests')) return;
      var sig = '';
      for (var i = 0; i < cfg.chests.slots; i++) { var st = meta.chestState(i); sig += st ? st.type + st.status + (st.status === 'unlocking' && Ads.rewardedReady() && meta.canAdSkip() ? 'a' : '') : 'e'; }
      if (sig !== chestSig) { $('chests').innerHTML = renderChests(); refresh(); return; }
      $('chests').querySelectorAll('.chest[data-i]').forEach(function (b) {
        var st = meta.chestState(+b.dataset.i), t = b.querySelector('[data-left]');
        if (t && st && st.status === 'unlocking') t.textContent = fmtLeft(st.msLeft);
      });
    }
    function mergeGot(a, g) {
      if (g.coins) a.coins = (a.coins || 0) + g.coins;
      if (g.chest) a.chest = g.chest;
      if (g.skin) a.skin = g.skin;
      if (g.boosters) { a.boosters = a.boosters || {}; Object.keys(g.boosters).forEach(function (k) { a.boosters[k] = (a.boosters[k] || 0) + g.boosters[k]; }); }
    }
    if ($('quests')) $('quests').addEventListener('click', function (e) {
      if (opts.onTap) opts.onTap();
      var q = e.target.closest('[data-q]'), ch = e.target.closest('.chest[data-i]'), pc = e.target.closest('#pass-claim');
      if (q) { var before = eco.coins, got = meta.claimQuest(q.dataset.q); if (got) { sfx.coin(); toast(rewardText(got)); if (api.coinFly) api.coinFly(q, eco.coins - before); } }
      if (pc) {
        var all = {}, b0 = eco.coins;
        unclaimedPass().forEach(function (x) { var g = meta.claimPass(x[0], x[1]); if (g) mergeGot(all, g); });
        sfx.coin(); toast(rewardText(all));
        if (api.coinFly) api.coinFly(pc, eco.coins - b0);
      }
      if (ch) {
        var i = +ch.dataset.i, st = meta.chestState(i);
        if (st.status === 'locked') { if (!meta.startUnlock(i)) toast(TX.wait); else sfx.tick(); }
        else if (st.status === 'unlocking' && Ads.rewardedReady() && meta.canAdSkip()) {
          Ads.showRewarded(function (ok) { if (ok && meta.adSkip(i)) { P.commit(); renderQuests(); } }, 'chest');
        } else if (st.status === 'ready') {
          if (api.chestOpener) api.chestOpener(i);   // engagement UI: tap-to-open animation
          else { var got2 = meta.openChest(i); if (got2) { sfx.win(); toast(rewardText(got2)); } }
        }
      }
      if (!q && !pc && !ch) return;
      P.commit(); renderQuests(); refresh();
    });
    setInterval(function () { if (screen === 'quests') tickQuests(); }, 1000);

    // ---------- shop ----------
    function priceBtn(attrs, label, kind, disabled) {
      return '<button class="mini ' + kind + '" ' + attrs + (disabled ? ' disabled' : '') + '>' + label + '</button>';
    }
    function renderShop() {
      if (!$('shoplist')) return;
      var h = '', theme = currentTheme();
      var products = IAP.available ? P.products().filter(function (p) {
        if (cfg.skins.some(function (s) { return s.iap === p.id; })) return false;          // shown with the skins
        if (p.type !== 'consumable' && eco.ownsProduct(p.id)) return false;
        if (p.id === 'remove_ads' && eco.state.noAds) return false;
        if (p.offer === 'starter' && !(P.unlocked('starter') && meta.starterOpen(P.progress.unlocked()))) return false;
        if (p.offer === 'piggy' && !(P.unlocked('piggy') && eco.piggyBreakable())) return false;
        if (p.season && (!P.unlocked('pass') || meta.hasPremiumPass())) return false;
        if (p.offer && p.offer !== 'starter' && p.offer !== 'piggy') return false;   // limited-time offers: only as live offer cards (offers-ui)
        return true;
      }) : [];
      var take = function (fn) { var out = products.filter(fn); products = products.filter(function (p) { return out.indexOf(p) < 0; }); return out; };
      // 1. starter pack: the hero card
      take(function (p) { return p.offer === 'starter'; }).forEach(function (p) {
        var from = P.data.meta.starterFrom, end = from ? from + cfg.starterPack.windowHours * 3600000 : 0, left = end ? Math.max(0, end - Date.now()) : 0;
        h += '<div class="gk-hero"><span class="gk-ribbon hot">' + TX.offer + '</span><div class="gk-hero-head"><b>' + TX.starter + '</b>' +
          (left ? '<small>' + gic('stopwatch') + TX.left + ' ' + Math.floor(left / 3600000) + TX.h + ' ' + Math.floor(left % 3600000 / 60000) + TX.min + '</small>' : '') + '</div>' +
          rewardTiles(p.grant, 'big') + priceBtn('data-iap="' + p.id + '"', IAP.price(p.id), 'cta big') + '</div>';
      });
      // 1b. live limited-time offers (league-up pack, weekend deal) with their real countdown: shell/offers-ui.js
      if (IAP.available && api.shopOffers) h += api.shopOffers();
      // 2. free (rewarded) row
      if (Ads.rewardedReady() && (meta.canDailyGift() || meta.canShopCoins())) {
        h += '<h4><span>' + TX.free + '</span></h4><div class="srow">';
        if (meta.canDailyGift()) BOOST.forEach(function (id) { h += '<div class="item boost free" style="--bc:' + boostCol(id) + '"><i class="gk-bt big">' + ico(id) + '</i><span>+' + cfg.rewarded.dailyGiftBoosters + '</span><button class="mini cta" data-gift="' + id + '">' + ico('ad') + TX.free + '</button></div>'; });
        if (meta.canShopCoins()) h += '<div class="item free"><span class="gk-art">' + (Art ? Art.coinPile(1) : ico('coin')) + '</span><span>+' + cfg.rewarded.shopCoins + '</span><button class="mini cta" data-adcoins="1">' + ico('ad') + TX.free + '</button></div>';
        h += '</div>';
      }
      // 3. coin packs, largest pack = best value, middle = popular
      var packs = take(function (p) { return p.grant && p.grant.coins && Object.keys(p.grant).length === 1; }).sort(function (a, b) { return a.grant.coins - b.grant.coins; });
      if (packs.length) {
        h += '<h4><span>' + TX.coinsH + '</span></h4><div class="srow packs">';
        packs.forEach(function (p, k) {
          var rib = k === packs.length - 1 && packs.length > 1 ? '<span class="gk-ribbon gold">' + TX.best + '</span>' : k === 1 && packs.length > 2 ? '<span class="gk-ribbon hot">' + TX.popular + '</span>' : '';
          h += '<div class="item pack p' + (k + 1) + '">' + rib + '<span class="gk-art">' + (Art ? Art.coinPile(Math.min(3, k + 1)) : ico('coin')) + '</span><span class="gk-amt">' + ico('coin') + p.grant.coins.toLocaleString(lang) + '</span>' +
            priceBtn('data-iap="' + p.id + '"', IAP.price(p.id), 'cta') + '</div>';
        });
        h += '</div>';
      }
      // 4. remove ads, pass, piggy, other bundles: wide cards
      var wide = function (art, title, sub, btn, cls) {
        return '<div class="gk-wide' + (cls ? ' ' + cls : '') + '"><span class="gk-art">' + art + '</span><div><b>' + title + '</b><small>' + sub + '</small></div>' + btn + '</div>';
      };
      take(function (p) { return p.id === 'remove_ads'; }).forEach(function (p) { h += wide(Art ? Art.noAds() : '', TX.removeAds, TX.noAdsWhat, priceBtn('data-iap="' + p.id + '"', IAP.price(p.id), 'cta'), 'noads'); });
      take(function (p) { return p.season; }).forEach(function (p) { h += wide(Art ? Art.star() : '', TX.season, TX.passWhat, priceBtn('data-iap="' + p.id + '"', IAP.price(p.id), 'cta'), 'pass'); });
      take(function (p) { return p.grant && p.grant.doubleHours && Object.keys(p.grant).length === 1; }).forEach(function (p) {
        var left = eco.doubleLeft ? eco.doubleLeft() : 0;
        h += wide('<i class="gk-x2i big">' + ico('coin') + '<em>×2</em></i>', TX.x2, left ? TX.x2On + ' · <span data-ends="' + (Date.now() + left) + '">' + fmtLeft(left) + '</span>' : p.grant.doubleHours + ' ' + TX.h,
          priceBtn('data-iap="' + p.id + '"', IAP.price(p.id), 'cta'), 'x2');
      });
      if (IAP.available && P.unlocked('piggy')) {
        var pig = take(function (p) { return p.offer === 'piggy'; })[0], full = eco.piggy / cfg.piggy.cap;
        h += '<div class="gk-piggy' + (pig ? ' ready' : '') + '"><span class="gk-art">' + (Art ? Art.piggy(full) : '') + '</span><div><b>' + TX.piggy + '</b>' +
          '<div class="bar gk-bar3 gold"><i style="width:' + (full * 100) + '%"></i><span>' + eco.piggy + ' / ' + cfg.piggy.cap + '</span></div><small>' + (pig ? TX.piggyBreak : TX.piggyFill) + '</small></div>' +
          (pig ? priceBtn('data-iap="' + pig.id + '"', IAP.price(pig.id), 'cta') : '<span class="gk-lockpill">' + ico('lock') + cfg.piggy.breakAt + '</span>') + '</div>';
      }
      products.forEach(function (p) { h += wide(rewardTiles(p.grant), p.title || '', '', priceBtn('data-iap="' + p.id + '"', IAP.price(p.id), 'cta'), 'bundle'); });
      // 5. boosters for coins
      if (BOOST.length) {
        h += '<h4><span>' + TX.boosters + '</span></h4><div class="srow">';
        BOOST.forEach(function (id) {
          h += '<div class="item boost" style="--bc:' + boostCol(id) + '"><i class="gk-bt big">' + ico(id) + '<em>×' + eco.boosters(id) + '</em></i>' +
            priceBtn('data-buy="' + id + '"', cfg.boosters.price[id] + ' ' + ico('coin'), 'buy', eco.coins < cfg.boosters.price[id]) + '</div>';
        });
        h += '</div>';
      }
      // 6. skins
      var skinBtn = function (s) {
        if (eco.state.equipped[s.kind] === s.id) return '<span class="mini on">✓</span>';
        if (eco.owns(s.id)) return '<button class="mini" data-eq="' + s.id + '">' + TX.equip + '</button>';
        if (s.iap) return IAP.available ? priceBtn('data-iap="' + s.iap + '"', IAP.price(s.iap), 'cta') : '';
        return priceBtn('data-skin="' + s.id + '"', s.price + ' ' + ico('coin'), 'buy', eco.coins < s.price);
      };
      var visible = function (s) { return eco.owns(s.id) || typeof s.price === 'number' || (s.iap && IAP.available); };
      var kinds = [];
      cfg.skins.forEach(function (s) { if (kinds.indexOf(s.kind) < 0) kinds.push(s.kind); });
      kinds.forEach(function (kind, ki) {
        h += '<h4><span>' + (ki === 0 ? TX.blocks : TX.boards) + '</span></h4><div class="srow">';
        cfg.skins.filter(function (s) { return s.kind === kind && visible(s); }).forEach(function (s) {
          h += '<div class="item skin' + (eco.state.equipped[kind] === s.id ? ' eq' : '') + '"><span class="gk-prev">' + (opts.skinPreview ? opts.skinPreview(s, theme) : '') + '</span>' +
            '<span>' + (TX.skins[s.id] || s.id) + '</span>' + skinBtn(s) + '</div>';
        });
        h += '</div>';
      });
      if (P.unlocked('freeze')) {
        var fz = P.data.meta.streak.freezes;
        h += '<h4><span>' + TX.streak + '</span></h4>' + wide('<span class="gk-freeze">' + ico('flame') + '</span>', '×' + fz, TX.freezeWhat,
          priceBtn('data-freeze="1"', cfg.streak.freezePrice + ' ' + ico('coin'), 'buy', fz >= cfg.streak.maxFreezes || eco.coins < cfg.streak.freezePrice), 'freeze');
      }
      if (IAP.available) {
        h += '<div class="row gk-links"><button class="mini ghost" data-restore="1">' + TX.restore + '</button><button class="mini ghost" data-legal="1">' + TX.legal + '</button></div>';
        if (legalOpen) h += '<p class="gk-legal">' + TX.legalText + '</p>';
      }
      if (Ads.privacyOptionsRequired()) h += '<div class="row gk-links"><button class="mini ghost" data-privacy="1">' + TX.privacy + '</button></div>';
      $('shoplist').innerHTML = h;
    }
    if ($('shop')) $('shop').addEventListener('click', function (e) {
      if (opts.onTap) opts.onTap();
      var t = e.target.closest('button');
      if (!t || t.disabled) return;
      var d = t.dataset, before = eco.coins;
      if (d.buy && eco.buyBooster(d.buy)) { sfx.coin(); if (api.spendFx) api.spendFx(t, before - eco.coins); }
      if (d.skin && eco.buySkin(d.skin)) { eco.equip(d.skin); if (opts.onSkin) opts.onSkin(); sfx.win(); if (api.spendFx) api.spendFx(t, before - eco.coins, true); }
      if (d.eq && eco.equip(d.eq)) { if (opts.onSkin) opts.onSkin(); sfx.pick(); }
      if (d.freeze && meta.buyFreeze()) { sfx.coin(); if (api.spendFx) api.spendFx(t, before - eco.coins); }
      if (d.iap) P.buy(d.iap).then(function () { if (screen === 'shop') renderShop(); });
      if (d.offer && api.onOfferTap) { api.onOfferTap(d.offer, t); return; }
      if (d.restore) P.restore(true).then(function () { toast('✓'); });
      if (d.legal) legalOpen = !legalOpen;
      if (d.privacy) Ads.showPrivacyOptions();
      if (d.gift) Ads.showRewarded(function (ok) { if (ok) { var g = meta.claimDailyGift(d.gift); if (g) { sfx.coin(); toast(rewardText(g)); } } P.commit(); renderShop(); }, 'daily_gift');
      if (d.adcoins) Ads.showRewarded(function (ok) { if (ok) { var g = meta.claimShopCoins(); if (g) { sfx.coin(); toast(rewardText(g)); } } P.commit(); renderShop(); refresh(); }, 'shop_coins');
      P.commit(); renderShop(); refresh();
    });

    // ---------- booster bar ----------
    var activeBooster = null;
    function renderBoosters() {
      var bar = $('boosters');
      if (!bar || !BOOST.length) return;
      if (!bar.children.length) {
        bar.innerHTML = BOOST.map(function (id) { return '<button class="bst" data-b="' + id + '" aria-label="' + id + '" style="--bc:' + boostCol(id) + '">' + ico(id) + '<b></b></button>'; }).join('');
        bar.addEventListener('click', function (e) {
          var b = e.target.closest('.bst');
          if (!b) return;
          if (opts.onTap) opts.onTap();
          pressBooster(b.dataset.b);
        });
      }
      doc.body.classList.toggle('with-boosters', boostersOn());
      bar.querySelectorAll('.bst').forEach(function (b) {
        var id = b.dataset.b, n = eco.boosters(id);
        b.querySelector('b').textContent = n > 0 ? String(n) : '+';
        b.classList.toggle('none', !(n > 0));
        b.classList.toggle('on', activeBooster === id);
        b.classList.toggle('off', !opts.boosters.usable(id));
      });
    }
    function pressBooster(id) {
      if (!opts.boosters.usable(id)) { sfx.bad(); return; }
      P.acquireBooster(id, function (ok, how) {
        if (!ok) { sfx.bad(); toast(cfg.boosters.price[id] + ' ' + ico('coin')); return; }
        if (how === 'coins') { sfx.coin(); toast('−' + cfg.boosters.price[id] + ' ' + ico('coin')); }
        // the game applies the effect; consume() spends one when it really happened
        opts.boosters.press(id, function () { return P.useBooster(id); });
        renderBoosters();
      });
    }

    // ---------- result screen economy ----------
    // summary from P.finished(); cont: { available, onRevive } ; elements #o-coins #o-double #o-cont
    var res = { coins: 0, onRevive: null, byAd: false };
    function result(summary, cont) {
      summary = summary || {};
      res.coins = summary.coins || 0;
      res.onRevive = cont && cont.onRevive;
      var oc = $('o-coins');
      if (oc) {
        oc.innerHTML = res.coins > 0 ? ico('coin') + '<b class="gk-count">+0</b>' : '';
        var num = oc.querySelector('.gk-count');
        if (num && api.count) api.count(num, res.coins, '+'); else if (num) num.textContent = '+' + res.coins;
      }
      if ($('o-double')) $('o-double').hidden = !P.canDouble(res.coins);
      var b = $('o-cont');
      if (b) b.hidden = !(cont && cont.available);
      if (b && !b.hidden) {
        var offer = P.continueOffer();
        res.byAd = offer.byAd;
        var label = opts.contLabel ? opts.contLabel() : '<span>' + TX.cont + '</span>';
        b.innerHTML = offer.byAd ? ico('ad', 'adi') + label : label + ' ' + offer.coins + ' ' + ico('coin');
        b.disabled = !offer.affordable;
      }
      if (summary.chest) setTimeout(function () { toast(ico('chest') + ' +1'); }, 900);
      if (summary.streakGift && summary.streakGift.coins) setTimeout(function () { toast(ico('flame') + ' ' + meta.liveStreak() + ' &nbsp;+' + summary.streakGift.coins + ' ' + ico('coin')); }, 1300);
      if (api.onResult) api.onResult(summary);
      refresh();
    }
    tap('o-cont', function () {
      var b = $('o-cont');
      b.disabled = true;
      P.requestContinue(function (ok) { b.disabled = false; if (ok && res.onRevive) { if (!res.byAd) sfx.coin(); res.onRevive(); } });
    });
    tap('o-double', function () {
      var b = $('o-double');
      b.disabled = true;
      P.doubleCoins(res.coins, function (ok) {
        b.disabled = false;
        if (!ok) return;
        if ($('o-coins')) $('o-coins').innerHTML = ico('coin') + '<b class="gk-count">+' + res.coins * 2 + '</b>';
        if (opts.onDoubled) opts.onDoubled(res.coins * 2);
        if (api.coinFly) api.coinFly($('o-coins'), res.coins);
        b.hidden = true;
        sfx.coin();
      });
    });

    // boot
    doc.body.classList.toggle('muted', !!P.settings.muted);
    doc.body.classList.toggle('no-ads', true);
    var api = {
      lang: lang, TX: TX, ico: ico, gic: gic, show: show, register: register, toast: toast, refresh: refresh, result: result,
      rewardText: rewardText, rewardTiles: rewardTiles, theme: currentTheme, setBoosterActive: function (id) { activeBooster = id; renderBoosters(); },
      holdCoins: function (on) { coinHold = !!on; },
      difficulty: difficulty, levelIntro: levelIntro, boostCol: boostCol,
      chestOpener: null,   // set by the engagement UI (shell/fun-ui.js)
      introOpener: null,   // idem: the hard-level intro popup
      coinFly: null, spendFx: null, count: null,
      onResult: null,
      shopOffers: null,    // set by shell/offers-ui.js: html of the live offer cards at the top of the shop
      onOfferTap: null,    // idem: a [data-offer] button in the shop was tapped
      renderShop: renderShop, fmtLeft: fmtLeft,
      isMenu: function () { var d = screens[screen]; return !!(d && d.hud && d.hud.menu); },
      id: function (defaultId) { return IDS[defaultId] || defaultId; },   // element id in this page
      el: $,
      back: function () { show(base && screens[base] ? base : 'menu'); },
      get base() { return base; },
      get screen() { return screen; }
    };
    return api;
  }

  var Shell = { create: create, TEXTS: TEXTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Shell;
  else root.GamekitShell = Shell;
})(this);

/* ---- gamekit/shell/fx.js ---- */
/* gamekit FX: reward-moment juice shared by every game. Platform layer, no game code.
 *
 *   var fx = GamekitFx.create({ muted: () => bool })
 *   fx.confetti(x, y, { n, spread, colors })   fx.sparks(x, y, color, n)   fx.fireworks(ms)
 *   fx.shake(el, px, ms)        subtle, skipped with prefers-reduced-motion
 *   fx.haptic('light' | 'medium' | 'heavy' | 'success' | [ms...])   Capacitor Haptics when present, else vibrate
 *   fx.sfx.tick() spin() win() big() coin() crack() burst() level() lucky() whoosh() pop() up() down()
 *   fx.fly(fromEl | rect, toEl, html, n, onLand)   icons flying into a HUD chip
 *   fx.count(el, from, to, ms, onDone)            number ticking up
 *   fx.shockwave(x, y, color)   fx.flash(color, ms)   fx.fountain(x, y, n)   coins spraying up and raining down
 *   fx.rays(x, y, color, ms)    rotating god-rays drawn on the canvas (legendary reveals)
 * One fixed canvas on top of the page; the RAF loop only runs while particles are alive.
 */
(function (root) {
  'use strict';
  var PALETTE = ['#7fb3a3', '#86a8d8', '#e5b567', '#e39a85', '#a99bd8', '#d98fb0', '#9cc27a', '#f4d06f'];

  function create(o) {
    o = o || {};
    var doc = root.document, cv = null, g = null, parts = [], running = false, DPR = 1;
    var reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var muted = o.muted || function () { return false; };

    function canvas() {
      if (cv) return;
      cv = doc.createElement('canvas');
      cv.className = 'gk-fx';
      doc.body.appendChild(cv);
      g = cv.getContext('2d');
      size();
      root.addEventListener('resize', size);
    }
    function size() {
      if (!cv) return;
      DPR = Math.min(2, root.devicePixelRatio || 1);
      cv.width = Math.round(root.innerWidth * DPR); cv.height = Math.round(root.innerHeight * DPR);
    }
    function loop() {
      if (!parts.length) { running = false; g.clearRect(0, 0, cv.width, cv.height); return; }
      root.requestAnimationFrame(loop);
      var dt = 1 / 60;
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      var next = [];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.life -= dt;
        if (p.delay > 0) { p.delay -= dt; next.push(p); continue; }
        if (p.life <= 0) { if (p.onDie) p.onDie(p); continue; }
        p.vy += (p.grav == null ? 700 : p.grav) * dt;
        p.vx *= p.drag || 0.99; p.vy *= p.drag || 0.99;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        var a = Math.min(1, p.life / (p.fade || 0.5));
        g.globalAlpha = a;
        g.fillStyle = p.color;
        if (p.kind === 'conf') {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
          g.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.8 + 0.2);
          g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
          g.restore();
        } else if (p.kind === 'coin') {
          g.save(); g.translate(p.x, p.y); g.scale(Math.abs(Math.cos(p.rot)) * 0.85 + 0.15, 1);
          g.fillStyle = '#b86a00'; g.beginPath(); g.arc(0, 1.5, p.s, 0, 6.283); g.fill();
          g.fillStyle = '#ffc93a'; g.beginPath(); g.arc(0, 0, p.s, 0, 6.283); g.fill();
          g.fillStyle = '#fff1a0'; g.beginPath(); g.arc(-p.s * 0.25, -p.s * 0.25, p.s * 0.45, 0, 6.283); g.fill();
          g.restore();
        } else if (p.kind === 'ring') {
          var k = 1 - p.life / p.max;
          g.globalAlpha = Math.max(0, 1 - k) * 0.9; g.strokeStyle = p.color; g.lineWidth = Math.max(1, p.s * (1 - k));
          g.beginPath(); g.arc(p.x, p.y, 8 + p.r * (1 - Math.pow(1 - k, 3)), 0, 6.283); g.stroke();
        } else if (p.kind === 'rays') {
          var kk = 1 - p.life / p.max, al = Math.min(1, kk * 4, p.life * 2) * 0.5;
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = al;
          var gr = g.createRadialGradient(0, 0, 10, 0, 0, p.r); gr.addColorStop(0, p.color); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          for (var q = 0; q < 14; q++) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, p.r, q * 0.449, q * 0.449 + 0.2); g.closePath(); g.fill(); }
          g.restore();
        } else if (p.kind === 'star') {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); star(p.s); g.restore();
        } else {
          g.beginPath(); g.arc(p.x, p.y, p.s * (p.shrink ? a : 1), 0, 6.283); g.fill();
          if (p.trail) { g.globalAlpha = a * 0.35; g.beginPath(); g.arc(p.x - p.vx * 0.03, p.y - p.vy * 0.03, p.s * 0.7, 0, 6.283); g.fill(); }
        }
        next.push(p);
      }
      g.globalAlpha = 1;
      parts = next;
    }
    function star(s) {
      g.beginPath();
      for (var k = 0; k < 10; k++) { var r = k % 2 ? s * 0.45 : s, a = k * Math.PI / 5 - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill();
    }
    function add(list) {
      canvas();
      if (parts.length > 900) list = list.slice(0, Math.max(0, 900 - parts.length));
      parts = parts.concat(list);
      if (!running) { running = true; root.requestAnimationFrame(loop); }
    }

    // ---------------- sound (generated) ----------------
    var actx = null, master = null;
    function ac() {
      if (muted()) return null;
      if (!actx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        try { actx = new AC(); } catch (e) { return null; }
        master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination);
      }
      if (actx.state === 'suspended') actx.resume().catch(function () {});
      return actx;
    }
    function tone(f, at, dur, type, vol, slide) {
      var a = ac();
      if (!a) return;
      var t = a.currentTime + (at || 0), osc = a.createOscillator(), gn = a.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(f, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gn); gn.connect(master);
      osc.start(t); osc.stop(t + dur + 0.03);
    }
    function noise(at, dur, vol, hp) {
      var a = ac();
      if (!a) return;
      var n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      var s = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain();
      s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp || 800; gn.gain.value = vol || 0.15;
      s.connect(f); f.connect(gn); gn.connect(master);
      s.start(a.currentTime + (at || 0));
    }
    var hz = function (semi) { return 523.25 * Math.pow(2, semi / 12); };
    var lastTick = 0;
    var sfx = {
      tick: function () { var t = Date.now(); if (t - lastTick < 28) return; lastTick = t; tone(1900, 0, 0.025, 'square', 0.035); tone(950, 0, 0.03, 'triangle', 0.05); },
      spin: function () { noise(0, 0.35, 0.08, 1500); tone(220, 0, 0.35, 'sine', 0.06, 440); },
      whoosh: function () { noise(0, 0.28, 0.1, 600); },
      pop: function () { tone(660, 0, 0.08, 'sine', 0.09, 990); },
      coin: function () { tone(hz(16), 0, 0.07, 'square', 0.03); tone(hz(23), 0.06, 0.12, 'square', 0.03); },
      win: function () { [0, 4, 7, 12].forEach(function (s, i) { tone(hz(s), i * 0.08, 0.22, 'triangle', 0.09); }); },
      big: function () {
        [0, 4, 7, 12, 16, 19, 24].forEach(function (s, i) { tone(hz(s), i * 0.07, 0.3, 'triangle', 0.08); tone(hz(s + 12), i * 0.07 + 0.02, 0.12, 'sine', 0.03); });
        tone(hz(-12), 0, 0.9, 'sine', 0.08);
      },
      crack: function () { noise(0, 0.09, 0.2, 2000); tone(180, 0, 0.12, 'triangle', 0.1, 90); },
      burst: function () { noise(0, 0.6, 0.18, 300); tone(hz(0), 0.05, 0.5, 'sine', 0.09, hz(12)); },
      level: function () { [0, 4, 7, 11, 12, 16, 19, 24].forEach(function (s, i) { tone(hz(s - 5), i * 0.06, 0.28, 'triangle', 0.08); }); },
      lucky: function () { [12, 16, 19, 24, 28].forEach(function (s, i) { tone(hz(s), i * 0.05, 0.18, 'sine', 0.07); tone(hz(s + 7), i * 0.05 + 0.025, 0.1, 'sine', 0.03); }); },
      up: function () { [0, 7, 12].forEach(function (s, i) { tone(hz(s), i * 0.1, 0.25, 'triangle', 0.09); }); },
      down: function () { [7, 3, 0].forEach(function (s, i) { tone(hz(s - 12), i * 0.12, 0.25, 'sine', 0.08); }); },
      firework: function () { noise(0, 0.5, 0.12, 200); },
      // spending: a quick descending "cha-ching" per coin, a rising power-up sweep, a sting for epic reveals
      spend: function () { tone(hz(19), 0, 0.05, 'square', 0.025); tone(hz(12), 0.04, 0.08, 'triangle', 0.05); },
      power: function () { tone(hz(-5), 0, 0.32, 'sawtooth', 0.04, hz(19)); tone(hz(7), 0.02, 0.3, 'sine', 0.06, hz(31)); noise(0.18, 0.18, 0.08, 2500); },
      boom: function () { noise(0, 0.4, 0.22, 120); tone(90, 0, 0.35, 'sine', 0.16, 45); },
      sting: function () {
        [0, 7, 12, 16, 19, 24].forEach(function (s, i) { tone(hz(s - 12), i * 0.11, 0.6, 'triangle', 0.07); tone(hz(s), i * 0.11 + 0.03, 0.5, 'sine', 0.04); });
        tone(hz(-24), 0, 1.4, 'sine', 0.12); noise(0, 0.9, 0.06, 4000);
      },
      tease: function (k) { tone(hz(k * 3), 0, 0.14, 'triangle', 0.06); tone(hz(k * 3 + 12), 0.02, 0.1, 'sine', 0.03); }
    };

    var fx = {
      reduced: reduced,
      sfx: sfx,
      confetti: function (x, y, opt) {
        opt = opt || {};
        var n = reduced ? Math.min(20, opt.n || 80) : (opt.n || 80), cols = opt.colors || PALETTE, list = [];
        for (var i = 0; i < n; i++) {
          var a = (opt.dir == null ? -Math.PI / 2 : opt.dir) + (Math.random() - 0.5) * (opt.spread || Math.PI * 1.2), v = 250 + Math.random() * (opt.power || 520);
          list.push({ kind: Math.random() < 0.15 ? 'star' : 'conf', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: 7 + Math.random() * 7,
            rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, color: cols[i % cols.length], life: 1.6 + Math.random() * 1.2, fade: 0.6,
            grav: 520, drag: 0.985, delay: (opt.stagger || 0) * Math.random() });
        }
        add(list);
      },
      sparks: function (x, y, color, n) {
        var list = [];
        for (var i = 0; i < (n || 24); i++) {
          var a = Math.random() * 6.283, v = 120 + Math.random() * 380;
          list.push({ kind: Math.random() < 0.3 ? 'star' : 'dot', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: 2 + Math.random() * 3.5, rot: 0, vr: 3,
            color: color || '#f4d06f', life: 0.5 + Math.random() * 0.6, fade: 0.4, grav: 240, drag: 0.96, trail: true, shrink: true });
        }
        add(list);
      },
      fireworks: function (ms) {
        if (reduced) { fx.confetti(root.innerWidth / 2, root.innerHeight * 0.4, { n: 30 }); return; }
        var shots = Math.max(3, Math.round((ms || 2200) / 330)), W = root.innerWidth, H = root.innerHeight;
        for (var k = 0; k < shots; k++) (function (k) {
          var x = W * (0.15 + Math.random() * 0.7), y = H * (0.12 + Math.random() * 0.35), col = PALETTE[k % PALETTE.length];
          add([{ kind: 'dot', x: x, y: H + 10, vx: 0, vy: -(H + 10 - y) * 1.9, s: 3, rot: 0, vr: 0, color: '#fff7d6', life: 0.55, fade: 0.2,
            grav: (H + 10 - y) * 1.9 / 0.55, drag: 1, trail: true, delay: k * 0.33,
            onDie: function (p) { fx.sparks(p.x, p.y, col, 46); sfx.firework(); } }]);
        })(k);
      },
      shake: function (el, px, ms) {
        if (reduced || !el || !el.animate) return;
        px = px || 6;
        var f = [];
        for (var i = 0; i <= 8; i++) { var k = 1 - i / 8; f.push({ transform: 'translate(' + ((i % 2 ? -1 : 1) * px * k).toFixed(1) + 'px,' + ((i % 3 - 1) * px * 0.5 * k).toFixed(1) + 'px)' }); }
        el.animate(f, { duration: ms || 380, easing: 'ease-out' });
      },
      haptic: function (kind) {
        if (muted()) return;
        var H = root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.Haptics;
        var map = { light: [6], medium: [16], heavy: [32], success: [12, 60, 24], lucky: [10, 40, 10, 40, 30] };
        try {
          if (H) {
            if (kind === 'success' || kind === 'lucky') H.notification({ type: 'SUCCESS' });
            else H.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
            return;
          }
          if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(Array.isArray(kind) ? kind : map[kind] || [8]);
        } catch (e) { /* ignore */ }
      },
      // icons flying from an element (or rect) into a HUD element; onLand(i) for each icon
      fly: function (from, to, html, n, onLand) {
        var a = from.getBoundingClientRect ? from.getBoundingClientRect() : from, b = to && to.getBoundingClientRect ? to.getBoundingClientRect() : null;
        if (!b || !b.width) { for (var j = 0; j < (n || 1); j++) if (onLand) onLand(j); return; }
        var ax = a.left + a.width / 2, ay = a.top + a.height / 2, bx = b.left + b.width / 2, by = b.top + b.height / 2;
        n = Math.min(12, n || 6);
        for (var i = 0; i < n; i++) (function (i) {
          var el = doc.createElement('div');
          el.className = 'gk-fly';
          el.innerHTML = html;
          doc.body.appendChild(el);
          var sx = ax + (Math.random() - 0.5) * 60, sy = ay + (Math.random() - 0.5) * 40, mx = (sx + bx) / 2 + (Math.random() - 0.5) * 160, my = Math.min(sy, by) - 60 - Math.random() * 80;
          var dur = reduced ? 300 : 650 + i * 45;
          var anim = el.animate ? el.animate([
            { transform: 'translate(' + sx + 'px,' + sy + 'px) scale(.4)', opacity: 0 },
            { transform: 'translate(' + sx + 'px,' + (sy - 18) + 'px) scale(1.15)', opacity: 1, offset: 0.18 },
            { transform: 'translate(' + mx + 'px,' + my + 'px) scale(1)', opacity: 1, offset: 0.6 },
            { transform: 'translate(' + bx + 'px,' + by + 'px) scale(.55)', opacity: 0.9 }
          ], { duration: dur, delay: i * 70, easing: 'cubic-bezier(.5,0,.4,1)', fill: 'forwards' }) : null;
          var land = function () { el.remove(); if (to.animate) to.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 160 }); sfx.coin(); if (onLand) onLand(i); };
          if (anim) anim.onfinish = land; else setTimeout(land, dur);
        })(i);
      },
      shockwave: function (x, y, color, r) {
        add([{ kind: 'ring', x: x, y: y, vx: 0, vy: 0, s: 10, r: r || 120, rot: 0, vr: 0, color: color || '#fff', life: 0.55, max: 0.55, fade: 0.55, grav: 0, drag: 1 },
          { kind: 'ring', x: x, y: y, vx: 0, vy: 0, s: 5, r: (r || 120) * 0.6, rot: 0, vr: 0, color: '#ffffff', life: 0.4, max: 0.4, fade: 0.4, grav: 0, drag: 1, delay: 0.06 }]);
      },
      flash: function (color, ms) {
        if (reduced) return;
        var el = doc.createElement('div');
        el.className = 'gk-flash';
        el.style.background = color || '#fff';
        doc.body.appendChild(el);
        var a = el.animate ? el.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: ms || 520, easing: 'ease-out' }) : null;
        if (a) a.onfinish = function () { el.remove(); }; else setTimeout(function () { el.remove(); }, ms || 520);
      },
      fountain: function (x, y, n) {
        var list = [];
        n = reduced ? Math.min(10, n || 40) : (n || 40);
        for (var i = 0; i < n; i++) {
          var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.1, v = 420 + Math.random() * 420;
          list.push({ kind: 'coin', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: 7 + Math.random() * 4, rot: Math.random() * 6, vr: 8 + Math.random() * 10,
            color: '#ffc93a', life: 1.8 + Math.random() * 0.8, fade: 0.4, grav: 900, drag: 0.992, delay: i * 0.018 });
        }
        add(list);
      },
      rays: function (x, y, color, ms) {
        if (reduced) return;
        var life = (ms || 2400) / 1000;
        add([{ kind: 'rays', x: x, y: y, vx: 0, vy: 0, s: 0, r: Math.max(root.innerWidth, root.innerHeight) * 0.7, rot: 0, vr: 0.5, color: color || '#fff3c4', life: life, max: life, fade: life, grav: 0, drag: 1 }]);
      },
      count: function (el, from, to, ms, onDone) {
        if (!el) { if (onDone) onDone(); return; }
        var t0 = null, d = reduced ? 1 : (ms || 700);
        var step = function (t) {
          if (t0 == null) t0 = t;
          var k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
          el.textContent = Math.round(from + (to - from) * e);
          if (k < 1) root.requestAnimationFrame(step); else if (onDone) onDone();
        };
        root.requestAnimationFrame(step);
      }
    };
    return fx;
  }

  var Fx = { create: create, PALETTE: PALETTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = Fx;
  else root.GamekitFx = Fx;
})(this);

/* ---- gamekit/shell/icons.js ---- */
/* gamekit icons: silhouettes from game-icons.net (CC BY 3.0), by Lorc (lorcblog.blogspot.com) and Delapouite
 * (delapouite.com). Path data on a 512 x 512 grid; recoloured through CSS (currentColor or a gradient).
 * Generated by gamekit/tools/make_assets.py from gamekit/assets/icons; credits in gamekit/CREDITS.md. */
(function (root) {
  'use strict';
  var PATHS = {
"bomb": "M135.25 38.156c-16.082.46-32.345 7.235-46.47 17.407-17.216 12.4-31.534 30.2-37.31 50.687-5.78 20.488-1.95 44.032 16.155 63.406 14.573 15.595 19.996 29.328 20.563 40.5.566 11.173-3.554 20.304-10.376 27.406-13.643 14.206-37.278 17.995-50.5 6.094l-12.5 13.906c22.224 20.005 56.61 13.645 76.47-7.03 9.93-10.34 16.43-24.836 15.593-41.313-.836-16.478-8.83-34.407-25.594-52.345C67.18 141.782 65.16 126.6 69.47 111.312 73.78 96.025 85.484 80.97 99.72 70.72c14.233-10.253 30.704-15.365 43.218-13.44 9.566 1.474 17.565 6.055 23.062 17.44l15.938-9.19c-8.362-15.432-21.594-24.476-36.157-26.718-2.42-.372-4.866-.596-7.31-.656-1.07-.026-2.148-.03-3.22 0zM243.5 51.563l-120.125 69.374 24.906 43.157c15.03-18.11 33.446-33.898 55-46.344 20.615-11.903 42.444-19.803 64.595-23.938L243.5 51.563zm60.03 57.406c-1.026.01-2.065.034-3.092.06-29.894.803-60.05 8.877-87.813 24.907-88.84 51.298-119.255 164.55-68.03 253.282 51.222 88.73 164.505 119.013 253.343 67.717 88.837-51.295 119.223-164.55 68-253.28-34.666-60.05-97.713-93.346-162.407-92.688z",
"rotate": "M263.09 50c-11.882-.007-23.875 1.018-35.857 3.13C142.026 68.156 75.156 135.026 60.13 220.233 45.108 305.44 85.075 391.15 160.005 434.41c32.782 18.927 69.254 27.996 105.463 27.553 46.555-.57 92.675-16.865 129.957-48.15l-30.855-36.768c-50.95 42.75-122.968 49.05-180.566 15.797-57.597-33.254-88.152-98.777-76.603-164.274 11.55-65.497 62.672-116.62 128.17-128.168 51.656-9.108 103.323 7.98 139.17 43.862L327 192h128V64l-46.34 46.342C370.242 71.962 317.83 50.03 263.09 50z",
"undo": "M208.242 24.629l-52.058 95.205 95.207 52.059 17.271-31.586-42.424-23.198A143.26 143.26 0 0 1 256 114c78.638 0 142 63.362 142 142s-63.362 142-142 142-142-63.362-142-142c0-16.46 2.785-32.247 7.896-46.928l-32.32-16.16C82.106 212.535 78 233.798 78 256c0 98.093 79.907 178 178 178s178-79.907 178-178S354.093 78 256 78c-13.103 0-25.875 1.44-38.18 4.148l22.008-40.25-31.586-17.27zm104.27 130.379L247 253.275V368h18V258.725l62.488-93.733-14.976-9.984z",
"cycle": "M252.314 19.957c-72.036.363-142.99 33.534-189.18 95.97-69.83 94.39-59.125 223.32 19.85 304.993l-37.238 50.332 151.22-22.613L174.35 297.42l-43.137 58.308c-44.08-54.382-47.723-133.646-4.16-192.53 30.676-41.466 77.863-63.504 125.758-63.753 16.344-.085 32.766 2.382 48.645 7.467l-6.963-46.55c-23.858-4.86-47.908-5.026-71.017-.997-59.232 7.322-113.994 39.918-148.157 91.215 35.65-65.89 103.774-105.918 176.043-107.744 1.673-.042 3.347-.063 5.023-.065 14.8-.01 29.748 1.596 44.597 4.905l48.608-7.268c-31.14-13.906-64.32-20.62-97.274-20.453zm212.93 22.055l-151.217 22.61 22.614 151.22 41.126-55.588c42.204 54.29 45.092 132.048 2.187 190.043-40.22 54.367-108.82 75.32-170.19 57.566l6.522 43.598c28.726 5.533 58.236 4.414 86.203-3.07 37.448-5.957 73.34-22.05 103.16-47.728-49.196 54.65-122.615 77.514-191.744 64.34l-55.8 8.344c99.03 43.7 218.402 14.77 285.51-75.938 69.13-93.445 59.34-220.743-17.483-302.53l39.114-52.866z",
"roller": "M87 20v130h8.596c-.196 2.517-.095 4.886.404 7 1.733 7.34 8.458 16 16 16s14.267-8.66 16-16c.5-2.114.6-4.483.404-7h101.27c-2.738 5.914-6.99 16.49-5.674 23 .846 4.188 4.13 9.127 7.814 9.127s6.967-4.94 7.813-9.127c1.315-6.51-2.936-17.086-5.674-23h102.14c1.85 7.268 8.477 15.67 15.907 15.67s14.056-8.402 15.908-15.67H425V94h14v85.99s.417 10.562-9.986 15.13c-.868.223-33.657 8.69-69.08 18.153-17.945 4.794-36.337 9.78-51.182 13.975-14.845 4.194-25.117 7.082-30.656 9.51-6.74 2.954-14.238 6.833-20.422 13.25C251.49 256.425 247 265.748 247 277v103h18V277c0-6.897 2.1-10.83 5.637-14.502 3.538-3.672 8.894-6.717 14.685-9.256 1.548-.678 13.63-4.52 28.324-8.672 14.696-4.15 33.033-9.127 50.932-13.908 35.798-9.562 69.844-18.35 69.844-18.35l.62-.162.59-.248C456.533 203.194 457 179.99 457 179.99V76h-32V20zm18 18h302v47.373c-7.212 4.035-14.646 14.71-23 15.627-21.86 2.4-42.026-16.844-64-16-16.853.647-32.418 22.454-48 16-11.018-4.564-4.686-28.23-16-32-22.627-7.542-40.21 30.31-64 32-16.823 1.196-31.135-16-48-16-12.762 0-28.045 1.332-39 7.906zm39 159s-19.875 31.586-16 48c1.733 7.34 8.458 16 16 16s14.267-8.66 16-16c3.875-16.414-16-48-16-48zm89 201v94h46v-94z",
"crane": "M213.293 19.46L29.691 120.34h37.375l133.489-73.346-15.819 73.346h18.41l11.584-53.701 13.688 53.7h18.574l-19.447-76.294 202.941 76.295h51.147zM25 138.34v30h462v-30zm32 48v30h62v-30zm144 0v46h30v-46zm48 0v46h19.273L279 221.613V186.34zm190 0v141.707a24.618 24.618 0 0 1 9-1.707c3.166 0 6.2.61 9 1.707V186.34zm-238 64v242h30v-242zm247 94c-3.973 0-7 3.027-7 7s3.027 7 7 7 7-3.027 7-7-3.027-7-7-7zm-20.393 21.365l-16.421 24.635h21.63l9.743-14.613c-6.118-1.384-11.417-5.04-14.952-10.022zm40.786 0c-3.535 4.981-8.834 8.638-14.952 10.022l9.743 14.613h21.63zM409 408.34v30h78v-30zm-226 24.5l-60.4 45.3 10.8 14.4 49.6-37.2zm66 0v22.5l49.6 37.2 10.8-14.4z",
"bulb": "M247 18.656c-80.965 0-146.875 65.02-146.875 145.625 0 45.63 15.758 67 33.313 94.845 11.706 18.57 23.767 39.91 30.53 70.563h165.095c6.728-31.387 18.91-53.12 30.718-71.875 17.58-27.92 33.314-48.912 33.314-93.532 0-80.66-65.127-145.624-146.094-145.624zm-99.78 127.906L170.437 167 210 201.813l31.188-34.125 6.78-7.438 6.907 7.344 30.75 32.72 39.97-33.47 22.686-19-7.655 28.594L304.75 310.28l-18.063-4.842 28.22-105.25-24.032 20.125-6.78 5.656-6.033-6.44-29.906-31.78-30.562 33.438-6.188 6.78-6.875-6.062-23.25-20.437 27.94 104.218-18.064 4.812-35.937-134.063-8-29.875zm22.593 201.813V389.5L315 348.375H169.812zm153.593 17.063l-153.594 43.53v29.438l153.594-43.5v-29.47zm0 48.875L203.97 448.156h119.436v-33.844zm-132.562 52.53v20.533h113.282v-20.53h-113.28z",
"magnifier": "M333.78 20.188c-39.97 0-79.96 15.212-110.405 45.656-58.667 58.667-60.796 152.72-6.406 213.97l-15.782 15.748 13.25 13.25 15.75-15.78c61.248 54.39 155.3 52.26 213.968-6.407 60.887-60.886 60.888-159.894 0-220.78C413.713 35.4 373.753 20.187 333.78 20.187zm0 18.562c35.15 0 70.285 13.44 97.158 40.313 53.745 53.745 53.744 140.6 0 194.343-51.526 51.526-133.46 53.643-187.5 6.375l.218-.217c-2.35-2.05-4.668-4.17-6.906-6.407-2.207-2.206-4.288-4.496-6.313-6.812l-.218.22c-47.27-54.04-45.152-135.976 6.374-187.502C263.467 52.19 298.63 38.75 333.78 38.75zm0 18.813c-30.31 0-60.63 11.6-83.81 34.78-46.362 46.362-46.362 121.234 0 167.594 10.14 10.142 21.632 18.077 33.905 23.782-24.91-19.087-40.97-49.133-40.97-82.94 0-15.323 3.292-29.888 9.22-43-4.165 20.485.44 40.88 14.47 54.907 24.583 24.585 68.744 20.318 98.624-9.562 29.88-29.88 34.146-74.04 9.56-98.625-2.375-2.376-4.943-4.473-7.655-6.313 45.13 8.648 79.954 46.345 84.25 92.876 4.44-35.07-6.82-71.726-33.813-98.72-23.18-23.18-53.47-34.78-83.78-34.78zM176.907 297.688L42.094 432.5l34.562 34.563L211.47 332.25l-34.564-34.563zM40 456.813L24 472.78 37.22 486l15.968-16L40 456.812z",
"cone": "M256 16.457c-3.944 0-7.948.71-9.984 1.512-.5.195-.405.172-.62.303l-.005.018s-9.845 37.48-22.8 87.296c18.278 13.215 47.39 13.42 65.992.6l-21.978-87.913c-.218-.13-.123-.11-.62-.304-2.036-.802-6.04-1.513-9.984-1.513zm-52.875 164.38c-2.03 7.883-3.96 15.317-6.004 23.288-4.585 17.886-9.118 35.69-13.538 53.133 53.046 16.998 90.254 17.196 142.92.605l-19.092-76.36c-34.76 15.42-69.524 15.196-104.285-.665zm-39.16 155.007l-.012.05c-4.518 18.527-8.28 34.408-10.896 46.18-1.308 5.886-2.33 10.752-3.008 14.338-.678 3.586-.93 6.52-.93 5.852 0 7.406 2.56 13.51 7.732 19.422 5.17 5.91 13.12 11.357 23.136 15.808 20.032 8.903 48.042 13.71 76.012 13.71s55.98-4.807 76.012-13.71c10.016-4.45 17.965-9.898 23.136-15.808 4.975-5.686 7.47-11.58 7.657-18.61l-16.537-66.148c-55.62 33.65-127.023 33.288-182.303-1.084zm212.248 46.648l4.666 18.664v1.108c0 11.906-4.684 22.7-12.187 31.275-7.502 8.573-17.66 15.198-29.37 20.403-23.424 10.41-53.353 15.26-83.323 15.26-29.97 0-59.9-4.85-83.322-15.26-11.712-5.205-21.87-11.83-29.37-20.404-7.504-8.575-12.187-19.37-12.187-31.276 0-3.082.503-5.28 1.24-9.19.525-2.778 1.262-6.292 2.09-10.137l-84.56 28.186L256 497.003l206.11-85.88-85.897-28.63z",
"piggy": "M255.55 22.36c-30.93 0-56 25.07-56 56 0 30.927 25.07 56 56 56 30.927 0 56-25.073 56-56 0-30.93-25.073-56-56-56zM105.067 144.47c-3.047.028-6.012.55-8.748 1.536-7.296 2.627-12.95 7.77-17.562 13.617-3.63 4.602-6.523 9.754-9.012 14.992-6.79-6.374-14.215-15.785-21.8-30.117l-15.91 8.418c10.115 19.112 20.597 31.962 31.292 40.066-.405 1.802-.907 3.66-1.164 5.364-2.005 13.302 2.913 24.966 9.637 34.736 5.34 7.757 11.825 14.87 18.132 22.367-7.497 15.76-11.35 32.49-11.368 49.366.07 28.777 11.283 56.823 32.082 80.243l3.655-13.117 17.34 4.832-25.13 90.18c20.857 6.423 41.04 6.52 61.62-1.072l18.727-66.73 17.33 4.865-8.892 31.69c17.887 4.99 36.674 7.578 55.607 7.657 12.386-.065 24.727-1.204 36.81-3.396l-8.942-39.63 17.558-3.963 14.996 66.473c24.936 11.267 48.496 10.575 72.764 1.222l-25.115-78.986 17.152-5.455 4.97 15.636c21.796-38.09 68.757-29.083 91.825-40.08 11.686-3.894 5.42-69.874 4.916-73.04-.38-2.39-29.734-3.818-40.16-2.248-5.975.9-16.344-12.078-27.39-27.597-5.387-10.488-12.357-20.405-20.753-29.527-3.988-5.276-2.735-3.092-6.533-6.474.715 6.697 2.12 12.306 4.152 16.23l-15.986 8.277c-7.378-14.252-7.98-32.853-5.662-52.858 1.583-13.67 4.81-27.957 9.03-41.733-11.81 6.755-22.626 17.48-32.02 30.586-13.665 19.064-24.126 42.55-30.647 62.644l-17.12-5.556c2.777-8.56 6.2-17.655 10.255-26.835-14.467-6.574-35.467-9.76-57.426-8.826-23.852 1.01-48.83 6.716-68.043 16.2l-7.97-16.143c22.13-10.923 49.122-16.934 75.25-18.043 3.267-.138 6.52-.203 9.747-.19 20.69.086 40.372 3.378 56.274 10.78 2.234-4.232 4.608-8.425 7.125-12.537-21.74-7.8-45.253-11.897-69.058-12.03-63.206.056-121.303 27.923-151.383 72.614-4.954-5.81-9.525-11.11-12.89-16-5.26-7.64-7.608-13.682-6.695-21.126 10.458 3.152 20.632 2.07 28.694-1.87 10.316-5.044 17.423-13.85 20.473-23.39 1.526-4.77 2.056-9.862.813-14.928-1.243-5.065-4.63-10.034-9.598-12.953-4.862-2.856-10.17-4.187-15.25-4.142zm.328 17.805c.328-.014.66-.005 1 .03 1.362.138 2.86.687 4.803 1.828.864.508.986.713 1.234 1.722.247 1.01.248 2.895-.475 5.157-1.447 4.523-5.713 10-11.235 12.7-4.346 2.125-9.372 2.917-15.66.847 2.174-5.033 4.823-9.984 7.824-13.787 3.257-4.13 6.74-6.828 9.528-7.832 1.045-.375 1.995-.623 2.978-.665zm278.153 98.647c8.835 0 16 7.163 16 16 0 8.836-7.165 16-16 16-8.838 0-16-7.164-16-16 0-8.837 7.162-16 16-16z",
"trophy": "M98.398 21.146a17.092 17.092 0 0 0-4.636.521c-20.49 5.262-33.163 20.63-36.116 38.649-2.952 18.019 2.168 38.346 12.676 58.193 20.695 39.086 63.262 77.08 117.852 85.85-5.61-6.72-11.05-14.246-16.274-22.375-39.008-12.57-70.021-42.344-85.67-71.899-9.206-17.387-12.846-34.491-10.82-46.857C77.437 50.862 83.482 42.89 98.238 39.1c.065-.017.068-.034.092-.053-.065-.143.105-.08 0 0 .022.049.061.11.176.217.527.493 1.689 2.24 2.207 5.14 1.036 5.804-.413 15.593-8.135 25.68l14.293 10.942c10.418-13.61 13.65-28.086 11.56-39.785-1.044-5.85-3.396-11.165-7.628-15.124-3.174-2.969-7.747-4.868-12.405-4.972zm315.204 0c-4.658.104-9.23 2.003-12.405 4.972-4.232 3.96-6.584 9.274-7.629 15.124-2.089 11.699 1.143 26.174 11.56 39.785l14.294-10.942c-7.722-10.087-9.171-19.876-8.135-25.68.518-2.9 1.68-4.647 2.207-5.14a.695.695 0 0 0 .176-.217c-.105-.08.065-.143 0 0 .024.019.027.036.092.053 14.756 3.79 20.801 11.76 22.828 24.127 2.026 12.366-1.614 29.47-10.82 46.857-15.649 29.555-46.662 59.33-85.67 71.899-5.223 8.129-10.665 15.655-16.274 22.375 54.59-8.77 97.157-46.764 117.852-85.85 10.508-19.847 15.628-40.174 12.676-58.193-2.953-18.02-15.626-33.387-36.116-38.649a17.092 17.092 0 0 0-4.636-.521zm-276.166 7.713c2.146 36.533 16.76 83.07 36.537 120.824 10.707 20.442 22.876 38.334 34.761 50.685C220.62 212.72 232 218.858 240 218.858h32c8 0 19.38-6.138 31.266-18.49 11.885-12.351 24.054-30.243 34.761-50.685 19.777-37.755 34.39-84.29 36.537-120.824H137.436zm95.564 208v16h46v-16h-46zm6.445 34c-2.458 25.967-12.796 57.873-24.437 76h81.984c-11.64-18.127-21.979-50.033-24.437-76h-33.11zm-38.445 94v14h110v-14H201zm-32 32v94h174v-94H169zm23 23h128v48H192v-48z",
"crown": "M408.256 119.46l-37.7 52.165 19.57 44.426 34.8-37.214-16.67-59.375zm86.074 12.513L384.44 249.498 334.01 135.02l-75.162 132.947-86.948-131.78-33.334 114.122L17.922 132.83l39.3 127.6c1.945-.348 3.94-.54 5.98-.54 18.812 0 34.26 15.452 34.26 34.262 0 13.823-8.346 25.822-20.235 31.22l5.337 17.33c12.425 25.466 71.863 45.152 176.582 47.206 110.805 2.174 178.12-17.54 189.854-47.207h-.002l4.357-20.26c-16.836-2.114-30.02-16.612-30.02-33.986 0-18.81 15.45-34.262 34.263-34.262 3.513 0 6.91.54 10.11 1.54l26.622-123.762zm-391.77 2.04l1.22 56.337 25.56 24.89 9.592-32.842-36.37-48.386zm150.585 2.91l-24.483 51.36 28.955 43.885 24.922-44.08-29.395-51.166zm204.453 135.962c-8.712 0-15.575 6.862-15.575 15.572 0 8.71 6.863 15.574 15.575 15.574s15.572-6.863 15.572-15.573-6.86-15.572-15.572-15.572zM63.2 278.58c-8.71 0-15.573 6.864-15.573 15.574s6.862 15.573 15.574 15.573c8.713 0 15.573-6.862 15.573-15.573 0-8.71-6.86-15.574-15.572-15.574zm130.33 17.842c18.812 0 34.26 15.45 34.26 34.262 0 18.81-15.448 34.26-34.26 34.26-18.813 0-34.262-15.45-34.262-34.26s15.45-34.262 34.26-34.262zm131.234 0c18.812 0 34.26 15.45 34.26 34.262 0 18.81-15.448 34.26-34.26 34.26-18.813 0-34.262-15.45-34.262-34.26s15.45-34.262 34.262-34.262zm-131.235 18.69c-8.713 0-15.573 6.86-15.573 15.572 0 8.71 6.86 15.574 15.572 15.574 8.71 0 15.572-6.864 15.572-15.574s-6.86-15.573-15.573-15.573zm131.234 0c-8.712 0-15.573 6.86-15.573 15.572 0 8.71 6.862 15.574 15.574 15.574s15.574-6.864 15.574-15.574-6.862-15.573-15.574-15.573z",
"padlock": "M254.28 17.313c-81.048 0-146.624 65.484-146.624 146.406V236h49.594v-69.094c0-53.658 43.47-97.187 97.03-97.187 53.563 0 97.032 44.744 97.032 97.186V236h49.594v-72.28c0-78.856-65.717-146.407-146.625-146.407zM85.157 254.688c-14.61 22.827-22.844 49.148-22.844 76.78 0 88.358 84.97 161.5 191.97 161.5 106.998 0 191.968-73.142 191.968-161.5 0-27.635-8.26-53.95-22.875-76.78H85.155zM254 278.625c22.34 0 40.875 17.94 40.875 40.28 0 16.756-10.6 31.23-25.125 37.376l32.72 98.126h-96.376l32.125-98.125c-14.526-6.145-24.532-20.62-24.532-37.374 0-22.338 17.972-40.28 40.312-40.28z",
"checklist": "M122.31 84.615l-2.85 8.54-11.394 34.185-5.703-5.703L96 115.27 83.27 128l6.367 6.363 26.297 26.297 20.605-61.814 2.845-8.537-17.076-5.695zM151 119v18h242v-18H151zm0 64v18h242v-18H151zm0 64v18h242v-18H151zm-28.69 29.615l-2.85 8.54-11.394 34.185-5.703-5.703L96 307.27 83.27 320l6.367 6.363 26.297 26.297 20.605-61.814 2.845-8.537-17.076-5.695zM151 311v18h242v-18H151zm0 64v18h242v-18H151z",
"cart": "M25.45 63.043l-4.364 17.463 8.73 2.18L90.44 97.846l29.402 44.1 62.44 187.32-36.845 73.693h17.827c-2.086 4.238-3.264 8.99-3.264 14 0 17.567 14.433 32 32 32s32-14.433 32-32c0-5.01-1.178-9.762-3.264-14h102.528c-2.086 4.238-3.264 8.99-3.264 14 0 17.567 14.433 32 32 32s32-14.433 32-32c0-5.01-1.178-9.762-3.264-14H393v-18H174.562l23-46h192.924l70-210h-327.67L101.56 82.07 34.183 65.227l-8.733-2.184zm115.038 83.914H231v46h-75.178l-15.334-46zm108.512 0h78v46h-78v-46zm96 0h90.512l-15.334 46H345v-46zm-183.18 64H231v46h-53.846l-15.334-46zm87.18 0h78v46h-78v-46zm96 0h69.18l-15.334 46H345v-46zm-161.846 64H231v46h-32.514l-15.332-46zm65.846 0h78v46h-78v-46zm96 0h47.846l-15.332 46H345v-46zm-153 128c7.84 0 14 6.16 14 14s-6.16 14-14 14-14-6.16-14-14 6.16-14 14-14zm160 0c7.84 0 14 6.16 14 14s-6.16 14-14 14-14-6.16-14-14 6.16-14 14-14z",
"stopwatch": "M179.594 20.688v41.406h143.25V20.687h-143.25zM256.03 82C143.04 82 51.25 173.727 51.25 286.656c0 112.93 91.788 204.656 204.78 204.656 112.994 0 204.75-91.728 204.75-204.656C460.78 173.73 369.025 82 256.03 82zm0 35.625c93.42 0 169.126 75.665 169.126 169.03 0 93.368-75.706 169.564-169.125 169.564-93.417 0-169.155-76.197-169.155-169.564 0-93.366 75.736-169.03 169.156-169.03zm76.19 20.28l-72.47 107.5c10.67 1.036 20.516 6.045 27.625 13.814l44.844-121.314zm-85.533 1.064v45.31c3.077-.275 6.196-.405 9.344-.405 3.155 0 6.263.13 9.345.406v-45.31h-18.688zm-88.53 36.655l-13.22 13.22L177 220.874c3.992-4.784 8.432-9.198 13.22-13.188l-32.064-32.062zm195.75 0l-32.063 32.063c4.786 3.99 9.196 8.403 13.187 13.187l32.064-32.03-13.188-13.22zm-98.344 81.22c-2.08.01-4.195.243-6.313.686-16.948 3.544-27.7 20.005-24.156 36.94 3.544 16.932 20.02 27.698 36.97 24.155 16.946-3.543 27.7-20.004 24.155-36.938-3.102-14.816-16.104-24.925-30.658-24.843zM108.28 277.31V296h45.314c-.278-3.08-.406-6.192-.406-9.344 0-3.146.13-6.27.406-9.344H108.28zm250.157 0c.277 3.075.438 6.197.438 9.344 0 3.153-.16 6.264-.438 9.344h45.344v-18.688H358.44zm-60.062 6.72c.993 10.522-1.968 20.742-7.813 28.937l124 19.092-116.187-48.03zM176.97 352.405l-32.032 32.03 13.218 13.22 32.063-32.03c-4.798-4-9.253-8.424-13.25-13.22zm158.093 0c-4 4.796-8.423 9.22-13.22 13.22l32.063 32.03 13.188-13.22-32.03-32.03zM246.688 389v45.313h18.687V389c-3.082.278-6.19.438-9.344.438-3.147 0-6.266-.16-9.342-.438z",
"calendar": "M119 31v66h18V31h-18zm256 0v66h18V31h-18zM73 89v30h366V89h-28v26h-54V89H155v26h-54V89H73zm0 48v302h366V137H73zm110 14h18v32h46v-32h18v32h46v-32h18v32h46v-32h18v32h32v18h-32v46h32v18h-32v46h32v18h-32v46h32v18H265v32h-18v-32h-46v32h-18v-32h-46v32h-18v-32H87v-18h32v-46H87v-18h32v-46H87v-18h32v-46H87v-18h96v-32zm-46 50v46h46v-46h-46zm64 0v46h46v-46h-46zm64 0v46h46v-46h-46zm64 0v46h46v-46h-46zm-192 64v46h46v-46h-46zm64 0v46h46v-46h-46zm64 0v13.27c2.545-5.936 7.334-10.725 13.27-13.27H265zm32.73 0c5.936 2.545 10.725 7.334 13.27 13.27V265h-13.27zm31.27 0v46h46v-46h-46zm-41 16c-3.973 0-7 3.027-7 7s3.027 7 7 7 7-3.027 7-7-3.027-7-7-7zm-23 16.73V311h13.27c-5.936-2.545-10.725-7.334-13.27-13.27zm46 0c-2.545 5.936-7.334 10.725-13.27 13.27H311v-13.27zM137 329v46h46v-46h-46zm64 0v46h46v-46h-46zm64 0v46h46v-46h-46zm64 0v46h46v-46h-46z",
"sparkles": "M237.4 20.73c-6.1 42.1-26.8 64.2-63.9 64 31.6 4.5 63.8 8 63.9 64.07-.6-46.1 24.5-63.07 64.1-64.07-38-1.5-64.9-16.3-64.1-64zm127.8 11.58c-9.1 14.25-20.8 21.29-38.9 10.28 14.9 11.79 18.6 24.76 10.2 38.97 8.9-11.18 17.5-22.73 39-10.27-17.8-10.06-18.8-23.57-10.3-38.98zM59.68 41.69c-2.7 18.8-12 28.6-28.5 28.5 14.1 2 28.4 3.6 28.5 28.52-.3-20.5 10.9-28.12 28.5-28.52-16.9-.7-28.9-7.3-28.5-28.5zM431 66.28c-2.7 18.8-12 28.6-28.5 28.5 14.1 2 28.4 3.6 28.5 28.52-.3-20.5 10.9-28.12 28.5-28.52-16.9-.7-28.9-7.3-28.5-28.5zM120.3 116.4c-15.8 53.7-47.76 48-79.35 43.4C76.6 170 90.3 197.1 84.28 239.2c12.66-46 42.62-52.6 79.42-43.4-37.6-12.1-56.9-35.4-43.4-79.4zm187 5c-8.8 61.6-39.3 94-93.6 93.7 46.2 6.5 93.6 11.7 93.6 93.7-.8-67.3 35.9-92.2 93.8-93.7-55.5-2.2-94.9-23.9-93.8-93.7zm136.8 38.3c-13.1 21.6-29.5 28.8-49.7 20.1 16.3 9.7 33 19.1 20.1 49.6 10.3-25.2 27.9-28.7 49.7-20-20.3-9.7-31.6-23.9-20.1-49.7zM50.7 243.2c9.16 16.7 7.63 30.1-5.61 40 12.46-6.9 24.85-14.3 39.91 5.6-12.57-16.2-8.2-29 5.61-40-13.92 9.7-27.47 11.6-39.91-5.6zm137.2.3c11.4 26.8-.5 41.3-21.7 50.9 22.7-8.5 40.8-4.5 50.9 21.7-12.7-31.8 4.8-41.2 21.7-50.9-21 8.5-37.8.9-50.9-21.7zm228 12.6c-26.6 64.7-68.7 91.7-127.8 76.4 48.6 19.8 98.8 38.5 76.4 127.9 17.5-73.7 64.4-90.7 127.9-76.5-59.9-17.5-96.9-52-76.5-127.8zM99.94 295.5c15.66 57.8.86 98.1-47.32 118.5 43.46-11.8 87.38-25.2 118.68 47.4-26.4-59.3-3.4-95.4 47.3-118.8-50 19.2-93.1 15-118.66-47.1zm169.36 61c-21.8 20.6-43 23.6-63.2 7.3 15.5 16.3 31.6 32.4 7.2 63.3 19.8-25.6 41.2-24.1 63.3-7.3-20.2-17.4-28.6-37.5-7.3-63.3zM443.2 404c-2.7 18.8-12 28.6-28.5 28.5 14.1 2 28.4 3.6 28.5 28.5-.3-20.5 10.9-28.1 28.5-28.5-16.9-.7-28.9-7.3-28.5-28.5zm-169.7 36c-2.7 18.8-12 28.6-28.5 28.5 14.1 2 28.4 3.6 28.5 28.5-.3-20.5 10.9-28.1 28.5-28.5-16.9-.7-28.9-7.3-28.5-28.5z",
"popper": "M122.7 23.32l1.7 21.87-16.7 14.25 21.4 5.17 8.4 20.25L149 66.18l21.8-1.75-14.2-16.71 5.1-21.32-20.3 8.35-18.7-11.43zM464 32a16 16 0 0 0-16 16 16 16 0 0 0 16 16 16 16 0 0 0 16-16 16 16 0 0 0-16-16zM239.8 42.5a16 16 0 0 0-16 16 16 16 0 0 0 16 16 16 16 0 0 0 16-16 16 16 0 0 0-16-16zm183.9 6.84c-9.2 1.74-17.7 7.18-25.9 14.28-7.6 6.53-14.7 14.66-20.7 23.45-18.8 3.01-37.6 10.67-50.2 21.13-16.1 13.2-30.4 35.8-38.2 59.1-7.4 3.1-14.4 6.8-20.1 10.8-15.5 10.9-23.5 31.8-29.4 50-5.9 18.3-8.8 34.3-8.8 34.3l17.8 3.2s2.7-15 8.1-31.9c5.5-16.9 14.8-35.3 22.7-40.8 1.3-.9 3-1.9 4.5-2.8-.6 5.7-.6 11.4.3 16.8 1.8 11.4 8 22.3 19 28.2 7.8 4.2 16.6 3.2 24 .2 7.4-3.1 14-8.2 19.7-14.2 5.7-6 10.4-13.1 13.2-20.6 2.8-7.5 3.8-16 .2-23.9h-.1c-3.9-8.4-11.4-13.8-19.4-16.1-8-2.3-16.6-2.2-25.2-.9-1.5.2-2.9.7-4.4 1 7.4-15.8 18-30.7 27.5-38.6 6.2-5.1 16.6-10 27.7-13.6-1.4 3.8-2.5 7.6-3 11.5-1.6 10.5.7 21.9 9.1 29.7 6.1 5.6 14.3 6.5 21.5 5.3 7.1-1.2 14-4.4 20.2-8.5 6.2-4.2 11.7-9.4 15.6-15.5 3.9-6.1 6.5-13.9 4-21.7v-.1c-3.3-10.07-11.5-16.99-20.6-20.27-3.9-1.4-8-2.19-12.2-2.66 2.9-3.26 5.9-6.31 8.9-8.92 6.8-5.84 13.7-9.5 17.6-10.23l-3.4-17.68zM174.8 84.39l-15.2 9.56 34.5 55.25-56.4 2.9 26.5 57.8 16.4-7.6-15.5-33.6 60.6-3.1-50.9-81.21zm216.4 19.31c6.1-.1 11.5.6 15.5 2.1 5.4 1.9 8.1 4.3 9.5 8.8.4 1.1.2 3.3-1.9 6.6-2.2 3.4-6.1 7.2-10.5 10.2-4.5 3-9.5 5.1-13.2 5.7-3.8.7-5.5 0-6.3-.7-3.5-3.2-4.5-7.2-3.5-13.9.8-5.4 3.3-11.9 7-18.6 1.2 0 2.3-.2 3.4-.2zM94.99 123a16 16 0 0 0-16 16 16 16 0 0 0 16 16A16 16 0 0 0 111 139a16 16 0 0 0-16.01-16zm356.11 37.2l-14.4 16.6-21.8-1.8 11.4 18.8-8.5 20.2 21.4-5 16.6 14.3 1.9-21.9 18.7-11.4-20.2-8.5-5.1-21.3zm-123.5 16.5c2.9.1 5.6.5 7.7 1.1 4.3 1.2 6.6 3 8.2 6.4.9 1.9 1 5.4-.7 10-1.7 4.7-5.2 10.1-9.4 14.6s-9.3 8.1-13.5 9.8c-4.2 1.7-6.8 1.6-8.5.7h-.1c-5.8-3.2-8.6-7.8-9.7-15.2-1-6.3-.3-14.3 1.8-22.9 4.9-1.7 9.8-3.1 14.5-3.8 3.5-.5 6.7-.7 9.7-.7zm-202.4 51.9c-7.2-.2-11.7 1.5-14.5 4.3-2.8 2.8-4.5 7.3-4.3 14.5.2 7.3 2.6 16.9 7.2 27.6 9.2 21.5 27.3 47.4 51.6 71.8 24.3 24.3 50.3 42.3 71.8 51.5 10.6 4.6 20.2 7 27.5 7.2 7.3.3 11.7-1.5 14.5-4.3 2.8-2.8 4.6-7.2 4.3-14.5-.2-7.3-2.6-16.9-7.2-27.6-9.2-21.4-27.2-47.4-51.5-71.7-24.3-24.4-50.3-42.4-71.8-51.6-10.7-4.6-20.3-7-27.6-7.2zm232 31.3l-33 54-29.1-27.9-12.4 13 45.1 43.3 33.8-55.2 38.7 32.3 89.3-38.2-7-16.6-79.3 34-46.1-38.7zM93.43 272.6l-17.64 57.9c41.41 49.1 89.71 76.7 142.11 94.7l21.6-6.6c-3.1-1.1-6.4-2.4-9.7-3.8-24.4-10.4-51.7-29.6-77.3-55.3-25.7-25.7-44.9-53-55.34-77.4-1.41-3.2-2.65-6.4-3.73-9.5zm-23.82 78.2l-14.01 46c28.89 27 59 39.2 90.6 50.2l43.4-13.2c-43.2-17.6-84-43.3-119.99-83zM368 352a16 16 0 0 0-16 16 16 16 0 0 0 16 16 16 16 0 0 0 16-16 16 16 0 0 0-16-16zM49.81 415.9l-20.29 66.6 88.28-26.9c-22.77-9.1-45.78-20.7-67.99-39.7z",
"skull": "M92.406 13.02l-.164 156.353c3.064.507 6.208 1.38 9.39 2.627 36.496 14.306 74.214 22.435 111.864 25.473l43.402-60.416 42.317 58.906c36.808-4.127 72.566-12.502 105.967-24.09 3.754-1.302 7.368-2.18 10.818-2.6l1.523-156.252-75.82 95.552-34.084-95.55-53.724 103.74-53.722-103.74-35.442 95.55-72.32-95.55h-.006zm164.492 156.07l-28.636 39.86 28.634 39.86 28.637-39.86-28.635-39.86zM86.762 187.55c-2.173-.08-3.84.274-5.012.762-2.345.977-3.173 2.19-3.496 4.196-.645 4.01 2.825 14.35 23.03 21.36 41.7 14.468 84.262 23.748 126.778 26.833l-17.75-24.704c-38.773-3.285-77.69-11.775-115.5-26.596-3.197-1.253-5.877-1.77-8.05-1.85zm333.275.19c-2.156.052-5.048.512-8.728 1.79-33.582 11.65-69.487 20.215-106.523 24.646l-19.264 26.818c40.427-2.602 80.433-11.287 119.22-26.96 15.913-6.43 21.46-17.81 21.36-22.362-.052-2.276-.278-2.566-1.753-3.274-.738-.353-2.157-.71-4.313-.658zm-18.117 47.438c-42.5 15.87-86.26 23.856-130.262 25.117l-14.76 20.547-14.878-20.71c-44.985-1.745-89.98-10.23-133.905-24.306-12.78 28.51-18.94 61.14-19.603 93.44 37.52 17.497 62.135 39.817 75.556 64.63C177 417.8 179.282 443.62 174.184 467.98c7.72 5.007 16.126 9.144 24.98 12.432l5.557-47.89 18.563 2.154-5.935 51.156c9.57 2.21 19.443 3.53 29.377 3.982v-54.67h18.69v54.49c9.903-.638 19.705-2.128 29.155-4.484l-5.857-50.474 18.564-2.155 5.436 46.852c8.747-3.422 17.004-7.643 24.506-12.69-5.758-24.413-3.77-49.666 9.01-72.988 13.28-24.234 37.718-46 74.803-64.29-.62-33.526-6.687-66.122-19.113-94.23zm-266.733 47.006c34.602.23 68.407 12.236 101.358 36.867-46.604 33.147-129.794 34.372-108.29-36.755 2.315-.09 4.626-.127 6.933-.11zm242.825 0c2.307-.016 4.617.022 6.93.11 21.506 71.128-61.684 69.903-108.288 36.757 32.95-24.63 66.756-36.637 101.358-36.866zM255.164 332.14c11.77 21.725 19.193 43.452 25.367 65.178h-50.737c4.57-21.726 13.77-43.45 25.37-65.18z",
"quill": "M496.938 14.063c-95.14 3.496-172.297 24.08-231.282 55.812l-29.47 49.28-4.967-28.093c-10.535 7.402-20.314 15.222-29.314 23.407l-14.687 45.06-5.032-25.155c-40.65 45.507-60.41 99.864-58.938 155.906 47.273-93.667 132.404-172.727 211.97-221.155l9.717 15.97c-75.312 45.838-156.387 121.202-202.187 208.25h12.156c19.78-12.02 39.16-26.858 58.406-43.44l-30.28 1.595 54.218-23.094c46.875-43.637 93.465-94.974 143.313-138.28l-24.47-5.19 56.5-21.03c26.853-20.485 54.8-37.844 84.344-49.843zM59.53 312.03v30.408H194V312.03H59.53zm20.376 49.095L47.25 389.813 24.97 474.78l14.53 15.876h177.22l14.56-15.875L209 389.814l-30.906-28.688H79.906z",
"present": "M149.518 78.38c-6.55.117-12.45 1.736-17.35 4.91-7.465 4.84-11.765 12.904-13.063 21.34-2.595 16.874 4.747 36.355 19.862 52.31C154.08 172.893 177.643 185 208 185h2.438l-9.118-18.234c-22.194-1.554-38.46-10.777-49.287-22.205-11.885-12.545-16.543-28.064-15.138-37.19.702-4.564 2.402-7.25 5.062-8.974 2.66-1.724 7.113-2.875 14.756-1.326 13.078 2.65 34.233 13.948 62.205 39.284L220.27 135h23.408c-35.31-34.8-62.215-51.278-83.39-55.57-2.715-.55-5.363-.887-7.925-1.006-.96-.045-1.91-.06-2.845-.043zm212.964 0c-.935-.016-1.885 0-2.845.044-2.562.12-5.21.455-7.924 1.006-21.176 4.292-48.082 20.77-83.39 55.57h23.406l1.352 1.354c27.972-25.336 49.127-36.633 62.205-39.284 7.643-1.55 12.096-.398 14.756 1.326 2.66 1.725 4.36 4.41 5.062 8.973 1.405 9.126-3.253 24.645-15.138 37.19-10.827 11.43-27.093 20.652-49.287 22.206L301.562 185H304c30.357 0 53.92-12.106 69.033-28.06 15.115-15.955 22.457-35.436 19.862-52.31-1.298-8.436-5.598-16.5-13.063-21.34-4.9-3.174-10.8-4.793-17.35-4.91zM227.73 153l-8.78 8.777L229.564 183h52.875l10.61-21.223-8.777-8.777h-56.54zM73 201v46h142v-46H73zm160 0v270h46V201h-46zm64 0v46h142v-46H297zm-192 64v206h110V265H105zm192 0v206h110V265H297z",
"camera": "M53.15 117.516l-30.803 41.443 17.332 3.5 21.82-29.357zm344.355 16.125c-12.346.048-23.357.238-33.852.336v34.18c23.779.22 54.2 1.112 80.252-1.06 14.555-1.212 27.448-3.51 35.627-6.814 4.09-1.651 6.896-3.533 8.338-5.07 1.442-1.537 1.783-2.397 1.783-4.147 0-1.75-.341-2.61-1.783-4.146-1.442-1.537-4.248-3.419-8.338-5.07-8.179-3.304-21.072-5.602-35.627-6.815-14.554-1.213-30.773-1.455-46.4-1.394zm-111.668 8.425l-32 48h21.633l20-30h50.183v-18zM73.985 146.48L56.09 170.557l82.668 61.441c4.615 3.43 8.257 3.851 11.72 3.13 3.464-.72 6.88-3.011 9.266-6.222 2.386-3.21 3.594-7.141 3.285-10.666-.309-3.524-1.762-6.89-6.377-10.32zm104.87 61.586c1.14 2.815 1.852 5.715 2.105 8.602.22 2.512.128 4.988-.227 7.398H291.39c3.52-1.292 7.315-2 11.263-2 18.12 0 33 14.882 33 33 0 5.391-1.324 10.49-3.652 15h29.652v64h-254V231.31l-16-11.891v130.648h263c5 0 11.051-2.777 15.637-7.363s7.363-10.637 7.363-15.637V235.88l-41.662-27.813zm310.798 2.528l-46 11.5v113.945l46 11.5zm-187 29.472c-8.39 0-15 6.61-15 15 0 8.391 6.61 15 15 15 8.391 0 15-6.609 15-15 0-8.39-6.609-15-15-15zm93 0v78h30v-78zm-223.431 2c-4.633 5.23-10.836 9.18-18.08 10.686-8.326 1.731-17.897-.192-26.123-6.307l-2.366-1.757v71.378h60v-46h87.653a32.623 32.623 0 0 1-3.653-15c0-4.606.965-9.003 2.698-13zm31.431 46v28h140v-28h-41zm-52.183 80l-17.614 26.418c62.625-10.657 116.488-11.084 168.956-.957l-16.975-25.46z",
"coins": "M264.4 95.01c-35.6-.06-80.2 11.19-124.2 34.09C96.27 152 61.45 182 41.01 211.3c-20.45 29.2-25.98 56.4-15.92 75.8 10.07 19.3 35.53 30.4 71.22 30.4 35.69.1 80.29-11.2 124.19-34 44-22.9 78.8-53 99.2-82.2 20.5-29.2 25.9-56.4 15.9-75.8-10.1-19.3-35.5-30.49-71.2-30.49zm91.9 70.29c-3.5 15.3-11.1 31-21.8 46.3-22.6 32.3-59.5 63.8-105.7 87.8-46.2 24.1-93.1 36.2-132.5 36.2-18.6 0-35.84-2.8-50.37-8.7l10.59 20.4c10.08 19.4 35.47 30.5 71.18 30.5 35.7 0 80.3-11.2 124.2-34.1 44-22.8 78.8-52.9 99.2-82.2 20.4-29.2 26-56.4 15.9-75.7zm28.8 16.8c11.2 26.7 2.2 59.2-19.2 89.7-18.9 27.1-47.8 53.4-83.6 75.4 11.1 1.2 22.7 1.8 34.5 1.8 49.5 0 94.3-10.6 125.9-27.1 31.7-16.5 49.1-38.1 49.1-59.9 0-21.8-17.4-43.4-49.1-59.9-16.1-8.4-35.7-15.3-57.6-20zm106.7 124.8c-10.2 11.9-24.2 22.4-40.7 31-35 18.2-82.2 29.1-134.3 29.1-21.2 0-41.6-1.8-60.7-5.2-23.2 11.7-46.5 20.4-68.9 26.1 1.2.7 2.4 1.3 3.7 2 31.6 16.5 76.4 27.1 125.9 27.1s94.3-10.6 125.9-27.1c31.7-16.5 49.1-38.1 49.1-59.9z",
"laurel": "M134.594 73.375c-17.522 5.65-31.232 11.854-48.125 24.25-2.19 2.097-4.337 4.22-6.44 6.406.24.566.61 1.265 1.157 2.25 1.016 1.832 2.767 4.023 4.97 6.19-3.454 5.536-6.596 11.072-9.5 16.624-3.664-3.04-6.952-6.423-9.594-10.22-7.617 9.505-14.475 19.678-20.438 30.44.395 1.636 1.557 3.42 3.78 5.81 2.656 2.853 6.805 5.8 11.626 8.314-2.024 6.117-3.76 12.204-5.186 18.28-7.44-3.38-14.245-7.768-19.594-13.343-5.94 13.804-10.473 28.42-13.406 43.656 1.335 2.434 3.714 4.663 7.312 7.032 5.072 3.34 12.36 6.076 20.282 7.657-.045 6.437.25 12.822.812 19.124-11.407-1.673-22.405-5.248-31.375-11.156-.05-.034-.106-.06-.156-.094-1.31 15.59-.872 30.96 1.093 45.906 2.31 3.48 6.176 5.957 11.937 7.938 7.406 2.546 17.472 3.344 27.72 2.312 2 6.122 4.275 12.13 6.81 18-13.97 2.098-28.237 1.622-40.593-2.625-.337-.116-.665-.252-1-.375 3.978 15.49 9.66 30.37 16.844 44.406 3.553 2.804 8.35 4.216 14.72 4.656 9.3.644 21.144-1.73 32.438-6.343 3.712 5.257 7.63 10.34 11.75 15.25-14.57 6.715-30.36 10.675-45.063 9.75 9.952 14.602 21.638 27.964 34.844 39.75 4.26 1.446 9.3 1.465 15.374.28 9.6-1.873 20.855-7.404 31.03-15 .008.005.026-.005.032 0 5.154 3.978 10.476 7.75 15.906 11.25-11.976 9.91-25.625 17.696-39.53 21.22 11.654 7.88 24.148 14.67 37.343 20.186 4.937.423 10.29-.96 16.344-3.906 7.672-3.735 15.78-10.252 23.03-18.28 17.036 6.783 34.732 11.22 52.563 12.905l1.78-18.625c-14.268-1.35-28.584-4.77-42.562-9.938 6.883-11.108 11.61-23.173 12.94-33.437 1.178-9.114.083-16.157-3.782-21.438-8.08-1.58-15.89-3.94-23.375-7-.172 6.47-1.706 12.987-4.22 19.094-3.745 9.103-9.52 17.798-16.53 25.72-5.353-3.288-10.565-6.832-15.657-10.625 6.62-7.182 11.923-14.97 14.906-22.22 3.806-9.246 4.173-16.578.625-22.81-7.748-4.957-15.003-10.737-21.718-17.22-1.773 4.3-4.187 8.37-7.032 12.094-5.476 7.165-12.572 13.51-20.563 18.905-4.12-4.72-8.052-9.603-11.75-14.688 7.152-4.694 13.296-10.1 17.47-15.562 5.038-6.594 7.22-12.41 6.468-18.094-4.976-6.553-9.494-13.582-13.5-21-2.285 2.686-4.86 5.14-7.657 7.283-6.758 5.175-14.798 9.155-23.406 12.03-2.595-5.69-4.957-11.498-7-17.437 7.427-2.405 14.13-5.683 19.03-9.437 5.696-4.362 8.802-8.545 9.532-13.25-3.03-7.998-5.508-16.32-7.406-24.908-1.878 1.075-3.82 2.024-5.812 2.813-7.45 2.947-15.75 4.434-24.28 4.75-.662-6.16-1.027-12.403-1.033-18.72 6.957-.263 13.464-1.437 18.44-3.405 4.6-1.82 7.595-3.8 9.343-6.25-1.018-9.72-1.33-19.69-.813-29.813-.65.104-1.29.18-1.938.25-6.624.725-13.556.15-20.406-1.343 1.37-5.98 3.07-12.01 5.094-18.063 4.87.933 9.538 1.223 13.28.814 2.614-.286 4.532-.756 6-1.406 1.395-8.93 3.407-17.644 5.97-26.032-4.182-.736-8.284-2.092-12.25-3.875 2.834-5.457 5.926-10.928 9.344-16.405 2.414.963 4.716 1.665 6.687 1.97 1.107.17 2.023.265 2.782.28 1.946-4.64 4.022-9.17 6.282-13.563 5.898-11.802 12.415-24.25 17-37.937zm244.375 0c4.583 13.686 11.1 26.135 17 37.938 2.26 4.393 4.366 8.923 6.31 13.562.752-.016 1.66-.113 2.75-.28 1.98-.306 4.296-1 6.72-1.97 3.418 5.477 6.51 10.948 9.344 16.406-3.976 1.786-8.096 3.14-12.28 3.876 2.563 8.39 4.573 17.1 5.967 26.03 1.474.658 3.404 1.12 6.033 1.408 3.742.41 8.41.12 13.28-.813 2.026 6.063 3.692 12.104 5.063 18.095-6.837 1.487-13.762 2.036-20.375 1.313-.656-.072-1.308-.145-1.967-.25.517 10.124.236 20.092-.782 29.812 1.75 2.45 4.745 4.43 9.345 6.25 4.967 1.965 11.462 3.14 18.406 3.406-.006 6.316-.37 12.56-1.03 18.72-8.52-.32-16.808-1.808-24.25-4.75-1.994-.79-3.933-1.74-5.813-2.814-1.895 8.575-4.383 16.89-7.406 24.875.715 4.72 3.795 8.912 9.5 13.282 4.904 3.753 11.605 7.03 19.033 9.436-2.044 5.94-4.405 11.747-7 17.438-8.598-2.875-16.624-6.862-23.375-12.03-2.804-2.148-5.4-4.592-7.688-7.283-4.01 7.422-8.52 14.444-13.5 21-.76 5.682 1.43 11.502 6.47 18.095 4.168 5.457 10.313 10.87 17.467 15.563-3.697 5.085-7.63 9.966-11.75 14.687-7.99-5.396-15.086-11.74-20.562-18.906-2.838-3.715-5.234-7.778-7-12.064-6.71 6.478-13.976 12.236-21.72 17.188-3.547 6.233-3.18 13.565.626 22.812 2.985 7.25 8.288 15.037 14.908 22.22-5.095 3.795-10.333 7.334-15.688 10.624-7.003-7.922-12.754-16.617-16.5-25.72-2.513-6.106-4.047-12.623-4.22-19.092-7.497 3.064-15.313 5.418-23.405 7-3.873 5.28-4.96 12.324-3.78 21.437 1.327 10.264 6.08 22.33 12.967 33.438-13.974 5.168-28.293 8.587-42.562 9.937l1.75 18.625c17.84-1.687 35.546-6.116 52.594-12.906 7.25 8.028 15.358 14.545 23.03 18.28 6.056 2.947 11.408 4.33 16.345 3.906 13.2-5.517 25.684-12.302 37.342-20.187-13.896-3.52-27.562-11.293-39.53-21.19 5.442-3.504 10.74-7.293 15.906-11.28 10.18 7.604 21.456 13.126 31.062 15 6.056 1.182 11.09 1.185 15.344-.25 13.212-11.788 24.92-25.172 34.875-39.78-14.705.925-30.526-3.035-45.095-9.75 4.12-4.913 8.066-9.99 11.78-15.25 11.295 4.61 23.138 6.986 32.44 6.342 6.368-.44 11.166-1.852 14.717-4.656 7.183-14.036 12.867-28.917 16.844-44.406-.335.123-.663.26-1 .375-12.355 4.247-26.623 4.723-40.594 2.625 2.536-5.87 4.813-11.878 6.813-18 10.236 1.027 20.29.23 27.688-2.313 5.765-1.98 9.65-4.455 11.968-7.937 1.965-14.946 2.372-30.318 1.064-45.906-.043.028-.082.065-.125.094-8.97 5.908-19.97 9.483-31.376 11.156.563-6.302.856-12.687.812-19.125 7.92-1.582 15.21-4.317 20.28-7.657 3.593-2.366 5.946-4.604 7.283-7.032-2.934-15.234-7.47-29.852-13.408-43.655-5.347 5.57-12.133 9.96-19.562 13.344-1.427-6.078-3.162-12.165-5.188-18.282 4.805-2.513 8.942-5.464 11.594-8.313 2.212-2.376 3.402-4.15 3.813-5.78-5.97-10.774-12.814-20.955-20.44-30.47-2.642 3.796-5.93 7.18-9.592 10.22-2.905-5.553-6.047-11.09-9.5-16.626 2.208-2.166 3.953-4.36 4.968-6.19.538-.97.92-1.656 1.156-2.218-2.106-2.193-4.275-4.334-6.468-6.437-16.893-12.396-30.603-18.6-48.125-24.25zM152.81 134.313l24.094 129.718H341l22.906-124.5-57.937 63.5L261 135.845l-45 67.187-63.188-68.718zm27.563 148.406l3.563 19.217H334.03l3.533-19.218H180.375z"
};
  var BY = {"bomb":"lorc","rotate":"delapouite","undo":"delapouite","cycle":"lorc","roller":"delapouite","crane":"delapouite","bulb":"lorc","magnifier":"lorc","cone":"delapouite","piggy":"delapouite","trophy":"delapouite","crown":"lorc","padlock":"lorc","checklist":"delapouite","cart":"delapouite","stopwatch":"lorc","calendar":"delapouite","sparkles":"delapouite","popper":"delapouite","skull":"lorc","quill":"lorc","present":"delapouite","camera":"delapouite","coins":"delapouite","laurel":"lorc"};
  var Icons = { paths: PATHS, by: BY };
  if (typeof module !== 'undefined' && module.exports) module.exports = Icons;
  else root.GamekitIcons = Icons;
})(this);

/* ---- gamekit/shell/art.js ---- */
/* gamekit art: every reward / meta graphic is drawn here as SVG, so the three games share one look that their theme
 * tokens recolour. No image files, no runtime requests. Platform layer, no game code.
 *
 *   GamekitArt.install(doc)            sprite: game-icons silhouettes (#gk-ic-<key>), a glossy coin (#i-coin) and a
 *                                      two-tone flame / chest / ad icon, plus the gradients they use
 *   GamekitArt.chest(type, opts)       glossy chest by rarity (wood common, silver rare, gold epic, crystal legendary)
 *   GamekitArt.shield(tier, colour)    league emblem with a metallic finish
 *   GamekitArt.coinPile(n) .gift(col) .flame() .trophy() .crown() .star() .piggy(fill) .noAds() .gem(col) .icon(key)
 *   GamekitArt.credits                 [{ what, who, licence, url }] for the in-app "Créditos" sheet
 * Silhouettes: game-icons.net (CC BY 3.0, Lorc and Delapouite), see shell/icons.js and gamekit/CREDITS.md.
 */
(function (root) {
  'use strict';
  var uid = 0;
  var id = function (k) { return 'gka' + (++uid) + k; };
  var RAR = {
    common: { a: '#a9bccc', b: '#5f768c', d: '#33475b', trim: '#e6edf3', trim2: '#9fb0bf', gem: '#9fe3ff' },
    rare: { a: '#6fb6ff', b: '#2563d6', d: '#16357a', trim: '#e9f1fb', trim2: '#9db7d8', gem: '#7ef0ff' },
    epic: { a: '#c792ff', b: '#7434d6', d: '#3d1677', trim: '#ffe07a', trim2: '#d49a1c', gem: '#ff7ad9' },
    legendary: { a: '#ffe27a', b: '#f09a12', d: '#8a4a00', trim: '#fff6cf', trim2: '#e0a52b', gem: '#ff4f6d' }
  };
  var TYPE_RAR = { wood: 'common', silver: 'rare', gold: 'epic', crystal: 'legendary' };
  function lg(gid, stops, x2, y2) {
    return '<linearGradient id="' + gid + '" x1="0" y1="0" x2="' + (x2 == null ? 0 : x2) + '" y2="' + (y2 == null ? 1 : y2) + '">' +
      stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>'; }).join('') + '</linearGradient>';
  }
  function shade(hex, amt) {   // amt > 0 towards white, < 0 towards black
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var f = function (c) { return Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)); };
    return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
  }
  function svg(vb, body, cls, extra) { return '<svg viewBox="' + vb + '"' + (cls ? ' class="' + cls + '"' : '') + (extra || '') + ' aria-hidden="true">' + body + '</svg>'; }
  function iconPath(key) { var I = root.GamekitIcons; return I && I.paths[key] ? I.paths[key] : ''; }

  // ---------------------------------------------------------------- chest
  // viewBox 0 0 140 120; the lid is <g class="gk-lid"> (hinge at 70,54) and the cracks are .gk-crack.c1/.c2/.c3
  function chest(type, o) {
    o = o || {};
    var rar = RAR[TYPE_RAR[type] || type] || RAR.common, b = id('cb'), l = id('cl'), t = id('ct'), gl = id('cg'), sh = id('cs');
    var defs = '<defs>' + lg(b, [[0, rar.a], [1, rar.b]]) + lg(l, [[0, shade(rar.a, 0.35)], [1, rar.a]]) +
      lg(t, [[0, rar.trim], [1, rar.trim2]]) + '<radialGradient id="' + gl + '" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="' + rar.gem + '"/><stop offset="1" stop-color="' + shade(rar.gem, -0.45) + '"/></radialGradient>' +
      lg(sh, [[0, '#fff', 0.55], [1, '#fff', 0]]) + '</defs>';
    var edge = 'stroke="' + rar.d + '" stroke-width="3.2" stroke-linejoin="round"';
    var plank = '<path d="M20 70h100M20 88h100" stroke="' + rar.d + '" stroke-opacity=".22" stroke-width="2"/>';
    var band = function (x, y0, y1) { return '<rect x="' + x + '" y="' + y0 + '" width="11" height="' + (y1 - y0) + '" fill="url(#' + t + ')" ' + edge.replace('3.2', '2.2') + '/>' +
      '<circle cx="' + (x + 5.5) + '" cy="' + (y0 + 7) + '" r="1.8" fill="' + rar.d + '" opacity=".5"/><circle cx="' + (x + 5.5) + '" cy="' + (y1 - 7) + '" r="1.8" fill="' + rar.d + '" opacity=".5"/>'; };
    var body = defs + '<ellipse cx="70" cy="111" rx="52" ry="6.5" fill="#000" opacity=".22"/>' +
      '<rect x="18" y="52" width="104" height="56" rx="9" fill="url(#' + b + ')" ' + edge + '/>' + plank +
      '<rect x="22" y="56" width="96" height="7" rx="3.5" fill="#fff" opacity=".18"/>' +
      band(30, 52, 108) + band(99, 52, 108) +
      '<rect x="16" y="100" width="108" height="9" rx="4.5" fill="url(#' + t + ')" ' + edge.replace('3.2', '2.2') + '/>' +
      '<g class="gk-lid"><path d="M17 56 Q17 17 70 17 Q123 17 123 56 Z" fill="url(#' + l + ')" ' + edge + '/>' +
      '<path d="M30 54 V27 Q34 22 41 21 V54Z" fill="url(#' + t + ')" ' + edge.replace('3.2', '2') + '/><path d="M99 21 Q106 22 110 27 V54 H99Z" fill="url(#' + t + ')" ' + edge.replace('3.2', '2') + '/>' +
      '<path d="M26 36 Q70 16 114 36" fill="none" stroke="url(#' + sh + ')" stroke-width="5" stroke-linecap="round"/>' +
      '<rect x="15" y="50" width="110" height="9" rx="4.5" fill="url(#' + t + ')" ' + edge.replace('3.2', '2.2') + '/></g>' +
      '<rect x="57" y="44" width="26" height="30" rx="7" fill="url(#' + t + ')" ' + edge.replace('3.2', '2.4') + '/>' +
      '<circle cx="70" cy="57" r="7.5" fill="url(#' + gl + ')" stroke="' + rar.d + '" stroke-width="1.6"/><circle cx="67.5" cy="54.5" r="2.2" fill="#fff" opacity=".9"/>' +
      (TYPE_RAR[type] === 'legendary' || type === 'legendary' ? '<path d="M120 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z M22 24l1.4 3.6 3.6 1.4-3.6 1.4L22 34l-1.4-3.6-3.6-1.4 3.6-1.4z" fill="#fff"/>' : '') +
      '<g fill="none" opacity="0" class="gk-cracks"><path class="gk-crack c1" d="M70 72 L64 82 L72 88 L66 100"/><path class="gk-crack c2" d="M46 62 L54 74 L48 84 M96 64 L88 76 L94 88"/>' +
      '<path class="gk-crack c3" d="M30 92 L42 98 M110 94 L98 100 M70 22 L66 34 L74 42"/></g>';
    return svg('0 0 140 120', body, o.cls || 'gk-chestart', o.style ? ' style="' + o.style + '"' : '');
  }

  // ---------------------------------------------------------------- league shield
  function shield(tier, col, o) {
    o = o || {};
    var g = id('sg'), h = id('sh'), rim = id('sr'), gem = tier >= 3;
    var light = shade(col, 0.55), dark = shade(col, -0.45);
    var defs = '<defs>' + lg(g, [[0, light], [0.45, col], [0.55, shade(col, -0.12)], [1, dark]], 0.6, 1) +
      lg(rim, gem ? [[0, '#fff1b8'], [0.5, '#f2b632'], [1, '#a8650c']] : [[0, shade(col, 0.75)], [0.5, shade(col, 0.2)], [1, shade(col, -0.55)]], 0, 1) +
      lg(h, [[0, '#fff', 0.7], [1, '#fff', 0]]) + '</defs>';
    var wings = tier >= 5 ? '<path d="M14 40 Q2 30 4 14 Q12 26 22 28Z M86 40 Q98 30 96 14 Q88 26 78 28Z" fill="url(#' + rim + ')" stroke="' + dark + '" stroke-width="2"/>' : '';
    var body = defs + wings +
      '<path d="M50 6 L86 18 V48 C86 72 70 88 50 96 C30 88 14 72 14 48 V18Z" fill="url(#' + rim + ')" stroke="' + dark + '" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M50 14 L78 24 V48 C78 67 66 80 50 87 C34 80 22 67 22 48 V24Z" fill="url(#' + g + ')"/>' +
      '<path d="M50 14 L78 24 V40 C64 34 38 34 22 44 V24Z" fill="url(#' + h + ')" opacity=".55"/>' +
      (tier >= 2 ? '<path d="M38 8 L44 2 L50 7 L56 2 L62 8 L60 14 H40Z" fill="url(#' + rim + ')" stroke="' + dark + '" stroke-width="1.6"/>' : '') +
      '<text x="50" y="62" text-anchor="middle" font-size="30" font-weight="900" fill="#fff" stroke="' + dark + '" stroke-width="4" paint-order="stroke" style="font-family:var(--font-d)">' + (tier + 1) + '</text>';
    return svg('0 0 100 100', body, o.cls || 'gk-shieldart');
  }

  // ---------------------------------------------------------------- small pieces
  function coinPile(n) {   // n: 1..3, a growing pile for the shop's coin packs
    var g = id('cp'), out = '<defs>' + lg(g, [[0, '#fff0a0'], [0.5, '#ffc43a'], [1, '#d98a12']]) + '</defs>';
    var coin = function (x, y, r) {
      return '<ellipse cx="' + x + '" cy="' + (y + 3) + '" rx="' + r + '" ry="' + r * 0.42 + '" fill="#b06a08"/><ellipse cx="' + x + '" cy="' + y + '" rx="' + r + '" ry="' + r * 0.42 + '" fill="url(#' + g + ')" stroke="#9c5a00" stroke-width="1.2"/>' +
        '<ellipse cx="' + x + '" cy="' + y + '" rx="' + r * 0.6 + '" ry="' + r * 0.24 + '" fill="none" stroke="#fff6c4" stroke-opacity=".8" stroke-width="1.2"/>';
    };
    var stacks = n === 1 ? [[50, 4]] : n === 2 ? [[34, 4], [62, 6], [48, 2]] : [[26, 5], [50, 8], [74, 6], [38, 3], [62, 3]];
    stacks.forEach(function (s) { for (var k = 0; k < s[1]; k++) out += coin(s[0], 70 - k * 6 - (s[1] === 2 || s[1] === 3 ? 0 : 0), 15); });
    if (n >= 2) out += '<path d="M80 14l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff"/>';
    if (n >= 3) out += '<path d="M18 26l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z" fill="#fff"/>';
    return svg('0 0 100 90', out, 'gk-pile');
  }
  function gift(col, o) {
    o = o || {};
    col = col || '#ff5a7a';
    var g = id('gg'), r = id('gr');
    var body = '<defs>' + lg(g, [[0, shade(col, 0.3)], [1, shade(col, -0.25)]]) + lg(r, [[0, '#fff3b0'], [1, '#f0b429']]) + '</defs>' +
      '<ellipse cx="50" cy="94" rx="36" ry="5" fill="#000" opacity=".2"/>' +
      '<rect x="16" y="44" width="68" height="48" rx="6" fill="url(#' + g + ')" stroke="' + shade(col, -0.55) + '" stroke-width="3"/>' +
      '<g class="gk-giftlid"><rect x="10" y="32" width="80" height="16" rx="5" fill="url(#' + g + ')" stroke="' + shade(col, -0.55) + '" stroke-width="3"/>' +
      '<rect x="43" y="32" width="14" height="16" fill="url(#' + r + ')"/>' +
      '<path d="M50 32 C38 14 22 18 28 28 C32 34 44 33 50 32 C56 33 68 34 72 28 C78 18 62 14 50 32Z" fill="url(#' + r + ')" stroke="#b07a10" stroke-width="2.5" stroke-linejoin="round"/></g>' +
      '<rect x="43" y="48" width="14" height="44" fill="url(#' + r + ')"/><rect x="20" y="48" width="60" height="5" rx="2.5" fill="#fff" opacity=".25"/>';
    return svg('0 0 100 100', body, o.cls || 'gk-giftart');
  }
  function flame(o) {
    o = o || {};
    var a = id('fa'), b = id('fb');
    var body = '<defs>' + lg(a, [[0, '#ffd23f'], [0.55, '#ff7a1a'], [1, '#e8341c']]) + lg(b, [[0, '#fffbe0'], [1, '#ffc53a']]) + '</defs>' +
      '<path d="M50 4 C56 22 80 32 80 60 A30 30 0 0 1 20 60 C20 46 27 37 34 30 C35 40 40 46 46 47 C41 32 43 17 50 4Z" fill="url(#' + a + ')" stroke="#b5260f" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M51 40 C55 52 66 56 66 70 A16 16 0 0 1 34 70 C34 62 39 57 43 53 C44 59 47 62 50 62 C47 54 48 47 51 40Z" fill="url(#' + b + ')"/>';
    return svg('0 0 100 100', body, o.cls || 'gk-flameart');
  }
  function goldIcon(key, o) {   // a game-icons silhouette filled with a gold gradient and a dark outline
    o = o || {};
    var g = id('gi'), c = o.colors || ['#fff1a8', '#ffc83d', '#d98a12'];
    return svg('0 0 512 512', '<defs>' + lg(g, [[0, c[0]], [0.5, c[1]], [1, c[2]]]) + '</defs><path d="' + iconPath(key) + '" fill="url(#' + g + ')" stroke="' + (o.edge || '#8a5200') + '" stroke-width="14" stroke-linejoin="round" paint-order="stroke"/>', o.cls || 'gk-goldart');
  }
  function trophy(o) { return goldIcon('trophy', o); }
  function crown(o) { return goldIcon('crown', Object.assign({ cls: 'gk-crownart' }, o || {})); }
  function star(o) {
    o = o || {};
    var g = id('st');
    return svg('0 0 100 100', '<defs>' + lg(g, [[0, '#fff3a6'], [0.5, '#ffc21f'], [1, '#f08c00']]) + '</defs><path d="M50 6 L62 36 L94 38 L69 59 L77 91 L50 73 L23 91 L31 59 L6 38 L38 36Z" fill="url(#' + g + ')" stroke="#a65a00" stroke-width="5" stroke-linejoin="round"/>' +
      '<path d="M50 18 L58 38 L40 38Z" fill="#fff" opacity=".55"/>', o.cls || 'gk-starart');
  }
  function piggy(fill, o) {   // fill 0..1: gold rises inside the pig
    o = o || {};
    var g = id('pg'), c = id('pc'), k = id('pk'), f = Math.max(0, Math.min(1, fill || 0));
    var d = iconPath('piggy'), top = 470 - 400 * f;
    return svg('0 0 512 512', '<defs>' + lg(g, [[0, '#ffc2d4'], [1, '#f07aa0']]) + lg(k, [[0, '#fff1a0'], [1, '#f0a818']]) +
      '<clipPath id="' + c + '"><path d="' + d + '"/></clipPath></defs>' +
      '<path d="' + d + '" fill="url(#' + g + ')" stroke="#a83a62" stroke-width="16" stroke-linejoin="round" paint-order="stroke"/>' +
      '<g clip-path="url(#' + c + ')"><rect class="gk-piggyfill" x="0" y="' + top.toFixed(0) + '" width="512" height="512" fill="url(#' + k + ')" opacity=".92"/>' +
      '<path d="M0 ' + top.toFixed(0) + ' q64 -18 128 0 t128 0 t128 0 t128 0" fill="none" stroke="#fff7c8" stroke-width="10" opacity=".8"/></g>', o.cls || 'gk-piggyart');
  }
  function noAds(o) {
    o = o || {};
    var g = id('na');
    return svg('0 0 100 100', '<defs>' + lg(g, [[0, '#ffffff'], [1, '#dfe6ee']]) + '</defs>' +
      '<rect x="14" y="24" width="72" height="52" rx="10" fill="url(#' + g + ')" stroke="#33475b" stroke-width="4"/>' +
      '<text x="50" y="61" text-anchor="middle" font-size="26" font-weight="900" fill="#33475b" style="font-family:var(--font-d)">AD</text>' +
      '<circle cx="50" cy="50" r="40" fill="none" stroke="#ff3b4f" stroke-width="9"/><path d="M22 22 L78 78" stroke="#ff3b4f" stroke-width="9" stroke-linecap="round"/>', o.cls || 'gk-noadsart');
  }
  function gem(col, o) {
    o = o || {};
    col = col || '#4fd1ff';
    var g = id('gm');
    return svg('0 0 100 100', '<defs>' + lg(g, [[0, shade(col, 0.5)], [1, shade(col, -0.3)]]) + '</defs>' +
      '<path d="M28 14 H72 L92 38 L50 90 L8 38Z" fill="url(#' + g + ')" stroke="' + shade(col, -0.6) + '" stroke-width="4" stroke-linejoin="round"/>' +
      '<path d="M28 14 L38 38 L50 14 L62 38 L72 14 M8 38 H92 M38 38 L50 90 L62 38" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.5"/>', o.cls || 'gk-gemart');
  }
  function icon(key, cls) { return svg('0 0 512 512', '<path d="' + iconPath(key) + '"/>', cls || 'gk-ic'); }

  // ---------------------------------------------------------------- sprite
  var SPRITE_DEFS =
    lg('gk-g-coin', [[0, '#fff3a8'], [0.45, '#ffcb3a'], [1, '#e08a10']], 0.4, 1) +
    lg('gk-g-coin2', [[0, '#d98a10'], [1, '#ffd65a']], 0.3, 1) +
    lg('gk-g-shine', [[0, '#fff', 0.85], [1, '#fff', 0]]);
  var SYMBOLS = {
    'i-coin': '<symbol id="i-coin" viewBox="0 0 24 24"><circle cx="12" cy="12.6" r="10" fill="#a85c00"/><circle cx="12" cy="11.6" r="10" fill="url(#gk-g-coin)" stroke="#a85c00" stroke-width="1.2"/>' +
      '<circle cx="12" cy="11.6" r="6.6" fill="url(#gk-g-coin2)" stroke="#fff3b8" stroke-opacity=".7" stroke-width="1"/><path d="M12 7.4l1.3 2.7 3 .4-2.2 2 .6 2.9L12 14l-2.7 1.4.6-2.9-2.2-2 3-.4z" fill="#fff6c8" opacity=".95"/>' +
      '<path d="M5.2 8.6A8 8 0 0 1 10.4 3.8" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".8"/></symbol>',
    'i-flame': '<symbol id="i-flame" viewBox="0 0 24 24"><path d="M12 2.5c1.1 4 5.6 6 5.6 11a5.6 5.6 0 0 1-11.2 0c0-2.5 1.1-4 2.5-5.4.2 1.8 1.1 3 2.2 3.2C10.4 8.4 10.9 5 12 2.5z"/>' +
      '<path d="M12.2 11c.8 2.2 2.6 3 2.6 5a2.8 2.8 0 0 1-5.6 0c0-1.2.7-2 1.3-2.6.1.8.6 1.3 1 1.4-.4-1.4-.2-2.6.7-3.8z" fill="#fff" opacity=".55"/></symbol>',
    'i-chest': '<symbol id="i-chest" viewBox="0 0 24 24"><path d="M3 10.2a5.2 5.2 0 0 1 5.2-5.2h7.6a5.2 5.2 0 0 1 5.2 5.2v.8H3z"/><rect x="3" y="11.6" width="18" height="8.6" rx="1.8"/>' +
      '<path d="M3.6 11.3h16.8" stroke="#000" stroke-opacity=".25" stroke-width="1.4"/><rect x="9.8" y="9.4" width="4.4" height="5.6" rx="1.2" fill="#ffd65a" stroke="#000" stroke-opacity=".25" stroke-width=".8"/>' +
      '<path d="M5.5 7.6a4 4 0 0 1 3-1.6" stroke="#fff" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round" fill="none"/></symbol>',
    'i-quest': function () { return '<symbol id="i-quest" viewBox="0 0 512 512"><path d="' + iconPath('checklist') + '"/></symbol>'; },
    'i-shop': function () { return '<symbol id="i-shop" viewBox="0 0 512 512"><path d="' + iconPath('cart') + '"/></symbol>'; },
    'i-ad': '<symbol id="i-ad" viewBox="0 0 24 24"><rect x="2.5" y="4.5" width="19" height="15" rx="4"/><path d="m10 8.6 5.4 3.4-5.4 3.4z" fill="#fff"/></symbol>'
  };
  function install(doc) {
    doc = doc || root.document;
    if (!doc || doc.getElementById('gk-art-sprite')) return;
    var I = root.GamekitIcons, sym = '';
    if (I) Object.keys(I.paths).forEach(function (k) { sym += '<symbol id="gk-ic-' + k + '" viewBox="0 0 512 512"><path d="' + I.paths[k] + '"/></symbol>'; });
    // the platform's rich versions replace any simpler symbol the page defined with the same id
    Object.keys(SYMBOLS).forEach(function (k) {
      var old = doc.getElementById(k), v = SYMBOLS[k];
      if (typeof v === 'function') { if (!iconPath(k === 'i-quest' ? 'checklist' : 'cart')) return; v = v(); }
      if (old && old.tagName.toLowerCase() === 'symbol') old.parentNode.removeChild(old);
      sym += v;
    });
    var holder = doc.createElement('div');
    holder.innerHTML = '<svg id="gk-art-sprite" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>' + SPRITE_DEFS + '</defs>' + sym + '</svg>';
    doc.body.insertBefore(holder.firstChild, doc.body.firstChild);
  }

  var CREDITS = [
    { what: 'Iconos (bomba, grúa, rodillo, lupa, bombilla, trofeo, corona, hucha, cono, cronómetro…)', who: 'Lorc y Delapouite · game-icons.net', licence: 'CC BY 3.0', url: 'game-icons.net' },
    { font: 'GK Fredoka', what: 'Tipografía Fredoka', who: 'The Fredoka Project Authors', licence: 'SIL OFL 1.1', url: 'fonts.google.com/specimen/Fredoka' },
    { font: 'GK Lilita', what: 'Tipografía Lilita One', who: 'Juan Montoreano', licence: 'SIL OFL 1.1', url: 'fonts.google.com/specimen/Lilita+One' },
    { font: 'GK Baloo', what: 'Tipografía Baloo 2', who: 'Ek Type', licence: 'SIL OFL 1.1', url: 'fonts.google.com/specimen/Baloo+2' },
    { what: 'Cofres, monedas, escudos, ruleta, regalos, llamas, fondos y efectos', who: 'César Pereiro (dibujados en código)', licence: 'propios', url: '' }
  ];

  var Art = { install: install, chest: chest, shield: shield, coinPile: coinPile, gift: gift, flame: flame, trophy: trophy, crown: crown,
    star: star, piggy: piggy, noAds: noAds, gem: gem, icon: icon, goldIcon: goldIcon, shade: shade, RAR: RAR, TYPE_RAR: TYPE_RAR, credits: CREDITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Art;
  else root.GamekitArt = Art;
})(this);

/* ---- gamekit/shell/fun-ui.js ---- */
/* gamekit engagement UI: prize wheel, chest opening, level-up, streak sheet + gifts, lucky banner, weekly league,
 * ranking (podium), profile, credits, hard-level intro, booster spend / activation FX. Platform layer: no game code;
 * the game passes hooks in `opts`.
 *
 *   var ui = GamekitFunUI.attach(P, shell, {
 *     dock: 'm-dock',              // menu container for the wheel / league / ranking buttons
 *     xpbar: 'm-xp',               // menu container for the level bar
 *     skinPreview: (skin, theme) => html,
 *     rankMode: 'daily',           // the mode shown in the ranking (daily challenge)
 *     localScore: (period) => n,   // the player's own score when offline (daily / weekly / alltime)
 *     playDaily: () => {},         // "play the daily" from the ranking
 *     links: { privacy: url, terms: url },
 *     boosterEl: (id) => element   // optional: where a booster button is (spend / activation FX); default [data-b=id], #btn-<id>
 *   })
 * Honesty: wheel slices are drawn at their real probability and the (i) sheet lists the exact odds; chest cards show
 * contents and the lucky-upgrade chance before opening; the chest's light only hints at the rarity it really has (the
 * outcome is fixed before the first tap); CPU rivals carry a small icon and the info sheets say "Includes CPU
 * rivals". Nothing here sells anything.
 */
(function (root) {
  'use strict';
  var TX = {
    es: { wheel: 'Ruleta', spin: 'Girar', free: 'Gratis', odds: 'Probabilidades', oddsNote: 'Las tiradas no se venden: 1 gratis al día, +1 con anuncio y más jugando (misiones, racha, niveles). El tamaño de cada porción es su probabilidad.',
      tomorrow: 'Mañana', booster: 'Ayuda', skin: 'Aspecto', coins: 'monedas', chest: 'Cofre', tap: 'Toca', lucky: '¡Suerte!', collect: 'Recoger', contents: 'Contiene',
      luckyUp: 'Mejora', level: 'Nivel', newSkin: 'Nuevo aspecto', equip: 'Usar', ok: 'OK', streak: 'Racha', days: 'días', gift: 'Regalo', league: 'Liga', ends: 'Termina en',
      up: 'Ascenso', down: 'Descenso', cpu: 'Incluye rivales CPU', leagueRules: 'Puntos = XP de la semana. Los 5 primeros suben, los 5 últimos bajan. Premios: 1º cofre épico, 2º–3º raro, 4º–10º común.',
      ranking: 'Ranking', today: 'Hoy', week: 'Semana', all: 'Siempre', you: 'Tú', playDaily: 'Jugar el diario', offline: 'Sin conexión',
      rankRules: 'Premios del diario, al día siguiente: top 3 · top 10 % · por participar.', profile: 'Perfil', nick: 'Apodo', flag: 'Bandera', hide: 'No salir en el ranking',
      privacy: 'Para el ranking guardamos tu apodo, tu bandera y tus puntuaciones con un identificador anónimo. Sin cuenta ni email.', privacyLink: 'Privacidad', termsLink: 'Condiciones',
      badNick: 'Ese apodo no vale', saved: 'Guardado', promoted: '¡Ascenso!', relegated: 'Descenso', stayed: 'Te mantienes', rankReward: 'Premio del ranking', x2: '×2 monedas',
      rarity: { common: 'Común', rare: 'Raro', epic: 'Épico', legendary: 'Legendario' }, cpuShort: 'CPU', pos: 'Puesto', of: 'de', week0: 'Semana', none: 'Juega para entrar',
      tiers: { bronze: 'Bronce', silver: 'Plata', gold: 'Oro', sapphire: 'Zafiro', ruby: 'Rubí', emerald: 'Esmeralda', amethyst: 'Amatista', diamond: 'Diamante' },
      giftDays: 'Regalos de racha', mult: 'Monedas', freeze: 'Protectores', credits: 'Créditos', creditsNote: 'Arte, iconos y tipografías de terceros usados en este juego.',
      play: 'Jugar', upTo: 'Hasta', didIt: '¡Lo has conseguido!', assisted: '¡Lo lograste!', assisted2: 'gracias a la ayuda', zoneUp: 'Zona de ascenso', zoneDown: 'Zona de descenso' },
    en: { wheel: 'Wheel', spin: 'Spin', free: 'Free', odds: 'Odds', oddsNote: 'Spins are never sold: 1 free a day, +1 with an ad, more by playing (quests, streak, levels). Each slice is drawn at its real probability.',
      tomorrow: 'Tomorrow', booster: 'Booster', skin: 'Skin', coins: 'coins', chest: 'Chest', tap: 'Tap', lucky: 'Lucky!', collect: 'Collect', contents: 'Contains',
      luckyUp: 'Upgrade', level: 'Level', newSkin: 'New skin', equip: 'Use', ok: 'OK', streak: 'Streak', days: 'days', gift: 'Gift', league: 'League', ends: 'Ends in',
      up: 'Promotion', down: 'Relegation', cpu: 'Includes CPU rivals', leagueRules: 'Points = XP this week. Top 5 move up, bottom 5 move down. Rewards: 1st epic chest, 2nd–3rd rare, 4th–10th common.',
      ranking: 'Ranking', today: 'Today', week: 'Week', all: 'All time', you: 'You', playDaily: 'Play the daily', offline: 'Offline',
      rankRules: 'Daily rewards, the next day: top 3 · top 10% · for taking part.', profile: 'Profile', nick: 'Nickname', flag: 'Flag', hide: 'Hide me from the ranking',
      privacy: 'For the ranking we store your nickname, flag and scores under an anonymous id. No account, no email.', privacyLink: 'Privacy', termsLink: 'Terms',
      badNick: 'That nickname is not allowed', saved: 'Saved', promoted: 'Promoted!', relegated: 'Relegated', stayed: 'You stay', rankReward: 'Ranking reward', x2: '×2 coins',
      rarity: { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' }, cpuShort: 'CPU', pos: 'Rank', of: 'of', week0: 'Week', none: 'Play to join',
      tiers: { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', sapphire: 'Sapphire', ruby: 'Ruby', emerald: 'Emerald', amethyst: 'Amethyst', diamond: 'Diamond' },
      giftDays: 'Streak gifts', mult: 'Coins', freeze: 'Freezes', credits: 'Credits', creditsNote: 'Third-party art, icons and fonts used in this game.',
      play: 'Play', upTo: 'Up to', didIt: 'You did it!', assisted: 'You made it!', assisted2: 'thanks to the booster', zoneUp: 'Promotion zone', zoneDown: 'Relegation zone' }
  };
  var TIER_COL = { bronze: '#c9814a', silver: '#9fb0c2', gold: '#f0b62a', sapphire: '#3f7fe8', ruby: '#e0405e', emerald: '#2fb879', amethyst: '#9a5ee0', diamond: '#43c6e8' };
  var RAR_COL = { common: '#8fa6bc', rare: '#3f8cff', epic: '#a35cff', legendary: '#ffb21e' };
  var SYMBOLS =
    '<symbol id="gk-i-wheel" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="2.6"/></symbol>' +
    '<symbol id="gk-i-shield" viewBox="0 0 24 24"><path d="M12 2.5 20 5.5v6c0 5-3.5 8.6-8 10-4.5-1.4-8-5-8-10v-6z"/></symbol>' +
    '<symbol id="gk-i-trophy" viewBox="0 0 24 24"><path d="M7 3.5h10v5a5 5 0 0 1-10 0z"/><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5a3.5 3.5 0 0 1-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="10.8" y="12.5" width="2.4" height="4.5"/><rect x="7.5" y="17.5" width="9" height="3" rx="1"/></symbol>' +
    '<symbol id="gk-i-cpu" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>' +
    '<symbol id="gk-i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><rect x="10.7" y="10.3" width="2.6" height="7.4" rx="1.3" fill="#fff"/><circle cx="12" cy="7.2" r="1.6" fill="#fff"/></symbol>' +
    '<symbol id="gk-i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></symbol>' +
    '<symbol id="gk-i-dice" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="15" r="1.5"/><circle cx="15" cy="9" r="1.5"/><circle cx="9" cy="15" r="1.5"/></symbol>' +
    '<symbol id="gk-i-gift" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="1.5"/><rect x="3" y="7" width="18" height="4" rx="1"/><path d="M12 7v13" stroke="#fff" stroke-width="2" opacity=".7"/><path d="M12 7c-1-3-5-4-5-1.5S11 7 12 7c1 0 5 .5 5-1.5S13 4 12 7z" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>' +
    '<symbol id="gk-i-up" viewBox="0 0 24 24"><path d="m6 14 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>' +
    '<symbol id="gk-i-down" viewBox="0 0 24 24"><path d="m6 10 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>' +
    '<symbol id="gk-i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></symbol>' +
    '<symbol id="gk-i-cloud" viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="2"/></symbol>';

  function attach(P, shell, opts) {
    opts = opts || {};
    // shell.el remaps the shell's default ids (coins, streak, o-coins...) for embedded games
    var doc = root.document, $ = function (id) { return shell.el ? shell.el(id) : doc.getElementById(id); };
    var T = TX[shell.lang] || TX.en, cfg = P.cfg, eco = P.eco, meta = P.meta, fun = P.fun, lg = P.league, on = P.online;
    var Art = root.GamekitArt;
    var fx = root.GamekitFx.create({ muted: function () { return !!P.settings.muted; } });
    var ico = shell.ico, sico = function (id, cls) { return '<svg' + (cls ? ' class="' + cls + '"' : '') + '><use href="#gk-i-' + id + '"/></svg>'; };
    var gic = shell.gic || function (k) { return '<svg viewBox="0 0 512 512"><use href="#gk-ic-' + k + '"/></svg>'; };
    var app = (opts.host && $(opts.host)) || $('app') || doc.body;
    var ME_COL = opts.meColor || '#5f9d8c';
    var fmtScore = function (s) { return opts.formatScore ? opts.formatScore(s, period) : s; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
    var rarityOf = function (type) { return (cfg.chests.types[type] || {}).rarity || 'common'; };
    var chestArt = function (type, cls) { return Art ? Art.chest(type, { cls: cls }) : ico('chest'); };
    var boostCol = shell.boostCol || function () { return '#ff8a3d'; };
    var GameKit = root.GamekitOnline;

    // ---------- DOM ----------
    var sprite = doc.createElement('div');
    sprite.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' + SYMBOLS + '</svg>';
    doc.body.appendChild(sprite.firstChild);
    function section(id, head, body) {
      var s = doc.createElement('section');
      s.id = id; s.className = 'panel sheet gk-sheet';
      s.innerHTML = '<div class="sheet-head">' + head + '</div>' + body;
      app.appendChild(s);
      return s;
    }
    section('gk-wheel', '<span class="k">' + T.wheel + '</span><button class="ic" id="gk-odds" aria-label="' + T.odds + '">' + sico('info') + '</button>',
      '<div class="gk-wheelstage"><div class="gk-wheelbox"><canvas id="gk-wheel-cv"></canvas><div class="gk-pointer" id="gk-pointer"></div><button class="gk-hub" id="gk-hub">' + T.spin + '</button></div></div>' +
      '<div class="gk-spins" id="gk-spins"></div><div class="gk-prize" id="gk-prize"></div>');
    section('gk-league', '<span class="k" id="gk-lg-title">' + T.league + '</span><button class="ic" id="gk-lg-info" aria-label="i">' + sico('info') + '</button>',
      '<div class="gk-lg-head" id="gk-lg-head"></div><div class="gk-ladder" id="gk-ladder"></div><div class="gk-rows" id="gk-lg-rows"></div>');
    section('gk-rank', '<span class="k">' + T.ranking + '</span><span class="gk-hbtns"><button class="ic" id="gk-rk-info" aria-label="i">' + sico('info') + '</button><button class="ic" id="gk-rk-prof" aria-label="' + T.profile + '">' + sico('edit') + '</button></span>',
      '<div class="gk-tabs" id="gk-rk-tabs"><button data-p="daily" class="on">' + T.today + '</button><button data-p="weekly">' + T.week + '</button><button data-p="alltime">' + T.all + '</button></div>' +
      '<div class="gk-rk-status" id="gk-rk-status"></div><div class="gk-podium" id="gk-rk-pod"></div><div class="gk-rows" id="gk-rk-rows"></div><button class="btn pri gk-play" id="gk-rk-play" hidden>' + T.playDaily + '</button>');
    section('gk-profile', '<span class="k">' + T.profile + '</span>',
      '<div class="gk-form"><div class="gk-prof-av" id="gk-prof-av"></div><label>' + T.nick + '</label><div class="gk-nickrow"><input id="gk-nick" maxlength="16" autocomplete="off" spellcheck="false"><button class="ic" id="gk-dice" aria-label="random">' + sico('dice') + '</button></div>' +
      '<label class="gk-tog"><input type="checkbox" id="gk-flag"><span id="gk-flag-l">' + T.flag + '</span></label>' +
      '<label class="gk-tog"><input type="checkbox" id="gk-hide"><span>' + T.hide + '</span></label>' +
      '<button class="btn pri" id="gk-save">' + T.ok + '</button><p class="gk-note">' + T.privacy + '</p><p class="gk-links" id="gk-links"></p>' +
      '<button class="mini ghost" id="gk-credits-btn">' + T.credits + '</button></div>');
    section('gk-streak', '<span class="k">' + T.streak + '</span>', '<div class="gk-streak" id="gk-streak-body"></div>');
    section('gk-credits', '<span class="k">' + T.credits + '</span>', '<div class="gk-credits" id="gk-credits-body"></div>');
    var ov = doc.createElement('div'); ov.id = 'gk-ov'; ov.className = 'gk-ov'; app.appendChild(ov);
    var banner = doc.createElement('div'); banner.id = 'gk-lucky'; banner.className = 'gk-lucky'; app.appendChild(banner);
    var bigBanner = doc.createElement('div'); bigBanner.className = 'gk-bigbanner'; app.appendChild(bigBanner);

    shell.register('wheel', { el: 'gk-wheel', hud: { coins: true }, sheet: true, onShow: function () { sizeWheel(); renderSpins(); } });
    shell.register('league', { el: 'gk-league', hud: { coins: true }, sheet: true, onShow: function () { renderLeague(true); P.syncLeague(); } });
    shell.register('ranking', { el: 'gk-rank', hud: { coins: true }, sheet: true, onShow: function () { renderRank(); } });
    shell.register('profile', { el: 'gk-profile', hud: {}, sheet: true, onShow: function () { renderProfile(); } });
    shell.register('streakinfo', { el: 'gk-streak', hud: { coins: true, streak: true }, sheet: true, onShow: function () { renderStreak(); } });
    shell.register('credits', { el: 'gk-credits', hud: {}, sheet: true, onShow: function () { renderCredits(); } });

    function tap(el, fn) { if (typeof el === 'string') el = $(el); if (el) el.addEventListener('click', function (e) { fx.sfx.pop(); fn(e); }); }
    function center(el) { var r = el.getBoundingClientRect ? el.getBoundingClientRect() : el; return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r }; }
    function visible(el) { return !!(el && el.offsetParent !== null && el.getBoundingClientRect().width); }

    // ---------- menu dock + level bar ----------
    var dock = opts.dock && $(opts.dock);
    function wheelIcon() {
      var cols = ['#ff5a5f', '#ffb020', '#2fbf71', '#3f8cff', '#a066ff', '#ff6fb1'], s = '';
      for (var k = 0; k < 6; k++) {
        var a0 = k / 6 * Math.PI * 2 - Math.PI / 2, a1 = (k + 1) / 6 * Math.PI * 2 - Math.PI / 2;
        s += '<path d="M24 24 L' + (24 + 19 * Math.cos(a0)).toFixed(1) + ' ' + (24 + 19 * Math.sin(a0)).toFixed(1) + ' A19 19 0 0 1 ' + (24 + 19 * Math.cos(a1)).toFixed(1) + ' ' + (24 + 19 * Math.sin(a1)).toFixed(1) + 'Z" fill="' + cols[k] + '"/>';
      }
      return '<svg viewBox="0 0 48 48" class="gk-wheelico"><circle cx="24" cy="24" r="22" fill="#ffd34d" stroke="#a86a00" stroke-width="2.4"/>' + s +
        '<circle cx="24" cy="24" r="19" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1"/><circle cx="24" cy="24" r="5" fill="#ffd34d" stroke="#a86a00" stroke-width="2"/><path d="M24 1 L29 9 H19Z" fill="#ff3b4f" stroke="#8a1020" stroke-width="1.6"/></svg>';
    }
    if (dock) {
      [['wheel', T.wheel], ['league', T.league], ['ranking', T.ranking]].forEach(function (d) {
        var b = doc.createElement('button');
        b.className = 'ic big gk-dockbtn gk-dock-' + d[0]; b.id = 'gk-m-' + d[0]; b.setAttribute('aria-label', d[1]);
        b.innerHTML = '<span class="gk-dockart"></span><b class="badge" id="gk-m-' + d[0] + '-badge"></b>';
        dock.insertBefore(b, dock.firstChild);
        tap(b, function () { shell.show(d[0]); });
      });
      var setArt = function (k, html) { var e = $('gk-m-' + k); if (e) e.querySelector('.gk-dockart').innerHTML = html; };
      setArt('wheel', wheelIcon());
      setArt('ranking', Art ? Art.trophy() : sico('trophy'));
    }
    var xpbar = opts.xpbar && $(opts.xpbar);
    function renderXp(animateFrom) {
      if (!xpbar) return;
      var L = fun.levelInfo();
      xpbar.innerHTML = '<span class="gk-lv">' + (Art ? Art.star() : '') + '<b>' + L.level + '</b></span><div class="gk-xpbar"><i style="width:' + ((animateFrom != null ? animateFrom : L.pct) * 100).toFixed(1) + '%"></i><span class="gk-xpn">' + L.into + '/' + L.need + '</span></div>';
      if (animateFrom != null) setTimeout(function () { var i = xpbar.querySelector('i'); if (i) i.style.width = (L.pct * 100).toFixed(1) + '%'; }, 60);
    }
    var streakChip = $('streak'), multEl = null;
    if (streakChip) { multEl = doc.createElement('small'); multEl.className = 'gk-mult'; streakChip.appendChild(multEl); }
    var lastTier = -1;
    function refreshMenu() {
      renderXp();
      var n = fun.spinsReady(), wb = $('gk-m-wheel-badge');
      if (wb && wb.textContent !== (n ? String(n) : '')) { wb.textContent = n ? String(n) : ''; badgePop(wb); }
      var w = $('gk-m-wheel');
      if (w) w.classList.toggle('glow', n > 0);
      var lb = $('gk-m-league'), tier = lg.state.tier;
      if (lb && tier !== lastTier) {
        lastTier = tier;
        lb.style.setProperty('--tc', TIER_COL[lg.tiers()[tier]]);
        lb.querySelector('.gk-dockart').innerHTML = Art ? Art.shield(tier, TIER_COL[lg.tiers()[tier]]) : sico('shield');
      }
      var m = fun.streakMult(meta.liveStreak());
      if (multEl) multEl.textContent = m > 1 ? '×' + m : '';
    }
    function badgePop(el) { if (el && el.textContent && el.animate && !fx.reduced) el.animate([{ transform: 'scale(.2)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.3,1.6,.5,1)' }); }
    P.on('wallet', refreshMenu);

    // coins: hold the HUD number while icons fly in, then tick it up
    function coinFly(fromEl, amount, done) {
      var chip = $('b-coins'), num = $('coins');
      var after = eco.coins, before = after - amount;
      if (!amount || !chip || chip.offsetParent === null || !fromEl) { shell.refresh(); if (done) done(); return; }
      shell.holdCoins(true);
      num.textContent = before;
      var n = Math.max(3, Math.min(10, Math.round(amount / 15))), landed = 0;
      fx.fly(fromEl, chip, ico('coin'), n, function () {
        landed++;
        num.textContent = Math.round(before + (after - before) * landed / n);
        if (landed === n) { shell.holdCoins(false); shell.refresh(); if (done) done(); }
      });
    }
    // spending: coins leave the counter (or a pop-up counter while the HUD is hidden) and fly into what was bought
    function spendFx(target, amount, big) {
      if (!amount || amount <= 0 || !target) return;
      var chip = $('b-coins'), num = $('coins'), pill = null, src = chip;
      var after = eco.coins, before = after + amount;
      if (!visible(chip)) {
        pill = doc.createElement('div');
        pill.className = 'gk-spendpill';
        pill.innerHTML = ico('coin') + '<b>' + before + '</b>';
        doc.body.appendChild(pill);
        src = pill; num = pill.querySelector('b');
      } else shell.holdCoins(true);
      var minus = doc.createElement('div');
      minus.className = 'gk-minus'; minus.textContent = '−' + amount;
      var c = center(src);
      minus.style.left = c.x + 'px'; minus.style.top = (c.y + 18) + 'px';
      doc.body.appendChild(minus);
      setTimeout(function () { minus.remove(); }, 1100);
      var n = Math.max(3, Math.min(9, Math.round(amount / 25))), landed = 0;
      fx.fly(src, target, ico('coin'), n, function () {
        landed++;
        if (num) num.textContent = Math.round(before - amount * landed / n);
        fx.sfx.spend();
        if (landed === n) {
          var t = center(target);
          fx.sparks(t.x, t.y, '#ffd34d', big ? 40 : 18);
          if (big) fx.shockwave(t.x, t.y, '#ffd34d', 90);
          shell.holdCoins(false); shell.refresh();
          if (pill) { pill.classList.add('out'); setTimeout(function () { pill.remove(); }, 400); }
        }
      });
      fx.haptic('light');
    }
    // count-up for result numbers
    function count(el, to, prefix) {
      if (!el) return;
      var t0 = null, d = fx.reduced ? 1 : Math.min(1100, 300 + to * 6);
      var step = function (t) {
        if (t0 == null) t0 = t;
        var k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
        el.textContent = (prefix || '') + Math.round(to * e);
        if (k < 1) root.requestAnimationFrame(step);
        else if (el.animate && !fx.reduced) el.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.3,1.6,.5,1)' });
      };
      root.requestAnimationFrame(step);
    }
    shell.coinFly = coinFly; shell.spendFx = spendFx; shell.count = count;

    // ---------- boosters: spend + activation moment (the game plays its own board effect from its callback) ----------
    function boosterEl(id) {
      var el = opts.boosterEl && opts.boosterEl(id);
      if (!el) el = doc.querySelector('.bst[data-b="' + id + '"]') || doc.querySelector('[data-booster="' + id + '"]') || doc.getElementById('btn-' + id);
      return visible(el) ? el : null;
    }
    function boosterFx(id, how, spent) {
      var el = boosterEl(id), col = boostCol(id);
      var dummy = null;
      if (!el) {   // no visible button: the moment happens at the bottom centre
        dummy = doc.createElement('div'); dummy.className = 'gk-dummy';
        dummy.style.left = (root.innerWidth / 2 - 20) + 'px'; dummy.style.top = (root.innerHeight - 110) + 'px';
        doc.body.appendChild(dummy); el = dummy;
        setTimeout(function () { dummy.remove(); }, 1600);
      }
      if (how === 'coins' && spent > 0) spendFx(el, spent);
      var c = center(el);
      el.classList.remove('gk-charge'); void el.offsetWidth; el.classList.add('gk-charge');
      setTimeout(function () { el.classList.remove('gk-charge'); }, 900);
      var burst = doc.createElement('div');
      burst.className = 'gk-burst'; burst.style.left = c.x + 'px'; burst.style.top = c.y + 'px'; burst.style.setProperty('--bc', col);
      burst.innerHTML = ico(id);
      doc.body.appendChild(burst);
      setTimeout(function () { burst.remove(); }, 900);
      fx.shockwave(c.x, c.y, col, 110); fx.sparks(c.x, c.y, col, 26); fx.sparks(c.x, c.y, '#ffffff', 12);
      fx.sfx.power(); fx.haptic('medium');
      P.emit('boosterfx', id);
    }
    if (typeof P.acquireBooster === 'function' && !P.acquireBooster._gk) {
      var acquire = P.acquireBooster;
      P.acquireBooster = function (id, cb) {
        var before = eco.coins;
        return acquire.call(P, id, function (ok, how) {
          if (ok) { try { boosterFx(id, how, before - eco.coins); } catch (e) { /* visuals never block the booster */ } }
          if (cb) cb(ok, how);
        });
      };
      P.acquireBooster._gk = true;
    }
    P.on('boosterAssistedWin', function (info) {
      var id = info && info.booster;
      setTimeout(function () {
        showBig('<i class="gk-bt big" style="--bc:' + boostCol(id) + '">' + (id ? ico(id) : '') + '</i><span><b>' + T.assisted + '</b><small>' + T.assisted2 + '</small></span>', 'assist');
        fx.sfx.lucky(); fx.haptic('success');
      }, 900);
    });
    function showBig(html, cls) {
      bigBanner.className = 'gk-bigbanner ' + (cls || '');
      bigBanner.innerHTML = html;
      void bigBanner.offsetWidth;
      bigBanner.classList.add('show');
      var r = bigBanner.getBoundingClientRect();
      fx.sparks(r.left + r.width / 2, r.top + r.height / 2, '#ffd76a', 40);
      clearTimeout(bigBanner.t);
      bigBanner.t = setTimeout(function () { bigBanner.classList.remove('show'); }, 2400);
    }

    // ---------- overlay queue (one big moment at a time) ----------
    var queue = [], busy = false;
    function enqueue(fn) { queue.push(fn); if (!busy) nextOv(); }
    function nextOv() {
      var fn = queue.shift();
      if (!fn) { busy = false; ov.className = 'gk-ov'; ov.innerHTML = ''; return; }
      busy = true;
      fn(function close() { ov.classList.remove('show'); setTimeout(nextOv, 220); });
    }
    function showOv(cls, html) { ov.className = 'gk-ov show ' + cls; ov.innerHTML = html; return ov; }
    function info(title, html) {
      enqueue(function (close) {
        showOv('gk-info', '<div class="gk-card"><h3>' + title + '</h3>' + html + '<button class="btn pri" id="gk-info-ok">' + T.ok + '</button></div>');
        tap('gk-info-ok', close);
      });
    }

    // ---------- reward text ----------
    function rewardChips(got) {
      var out = [];
      if (!got) return '';
      if (got.coins) out.push('<span class="gk-chip coin">' + ico('coin') + '<b>+' + got.coins + '</b></span>');
      if (got.boosters) Object.keys(got.boosters).forEach(function (k) { out.push('<span class="gk-chip"><i class="gk-bt" style="--bc:' + boostCol(k) + '">' + ico(k) + '</i><b>+' + got.boosters[k] + '</b></span>'); });
      if (got.chest) out.push('<span class="gk-chip ch r-' + rarityOf(got.chest) + '">' + chestArt(got.chest, 'gk-chestmini') + '<b>' + T.rarity[rarityOf(got.chest)] + '</b></span>');
      if (got.spins) out.push('<span class="gk-chip">' + wheelIcon() + '<b>+' + got.spins + '</b></span>');
      if (got.skin) out.push('<span class="gk-chip gold">' + gic('sparkles') + '<b>' + esc(shell.TX.skins[got.skin] || got.skin) + '</b></span>');
      return out.join('');
    }
    function segLabel(seg) {
      var r = seg.reward;
      if (r.coins) return r.coins + ' ' + T.coins;
      if (r.booster) return '+' + r.booster + ' ' + T.booster;
      if (r.chest) return T.chest + ' ' + T.rarity[rarityOf(r.chest)].toLowerCase();
      if (r.skin) return T.skin + ' (' + r.orCoins + ' ' + T.coins + ' ' + (shell.lang === 'es' ? 'si ya los tienes' : 'if you own them all') + ')';
      return seg.id;
    }

    // ================= WHEEL =================
    var wcv = $('gk-wheel-cv'), wg = wcv.getContext('2d'), WS = 300, wDPR = 1, angle = 0, spinning = false, flap = 0, winSeg = -1, winT = 0;
    var SEGCOL = opts.wheelColors || ['#25b39a', '#3f8cff', '#ffb020', '#a066ff', '#ff6b5a', '#5cc35a', '#ff5fa2', '#ffd23f'];
    var imgs = {};
    function svgImg(key, svg) {
      if (imgs[key]) return imgs[key].complete && imgs[key].naturalWidth ? imgs[key] : null;
      var im = new root.Image();
      im.onload = function () { if (shell.screen === 'wheel') drawWheel(performance.now()); };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="120" '));
      imgs[key] = im;
      return null;
    }
    function displayFont() {
      var f = (root.getComputedStyle(app).getPropertyValue('--font-d') || '').trim();
      return f || 'ui-rounded, "Segoe UI", system-ui, sans-serif';
    }
    function segs() {
      var o = fun.odds(), a = 0;
      return o.map(function (s, i) {
        var r = s.reward, col = r.chest ? RAR_COL[rarityOf(r.chest)] : r.skin ? '#ff4f9a' : r.booster ? '#7a5cff' : SEGCOL[i % 3];
        var seg = { id: s.id, reward: r, p: s.p, a0: a, a1: a + s.p * Math.PI * 2, col: col };
        a = seg.a1;
        return seg;
      });
    }
    function sizeWheel() {
      var box = wcv.parentNode, s = Math.min(360, Math.max(230, Math.min(root.innerWidth - 40, root.innerHeight - 320)));
      box.style.width = box.style.height = s + 'px';
      WS = s; wDPR = Math.min(2, root.devicePixelRatio || 1);
      wcv.width = wcv.height = Math.round(s * wDPR);
      wcv.style.width = wcv.style.height = s + 'px';
      drawWheel(performance.now());
    }
    function coinIcon(x, y, r) {
      wg.fillStyle = '#a85c00'; wg.beginPath(); wg.arc(x, y + r * 0.14, r, 0, 6.283); wg.fill();
      var g = wg.createLinearGradient(x - r, y - r, x + r * 0.6, y + r);
      g.addColorStop(0, '#fff3a8'); g.addColorStop(0.5, '#ffcb3a'); g.addColorStop(1, '#e08a10');
      wg.fillStyle = g; wg.beginPath(); wg.arc(x, y, r, 0, 6.283); wg.fill();
      wg.lineWidth = Math.max(1, r * 0.14); wg.strokeStyle = '#a85c00'; wg.stroke();
      wg.lineWidth = r * 0.12; wg.strokeStyle = 'rgba(255,246,200,.85)'; wg.beginPath(); wg.arc(x, y, r * 0.62, 0, 6.283); wg.stroke();
    }
    function boltIcon(x, y, r) {
      wg.beginPath();
      wg.moveTo(x + r * 0.2, y - r); wg.lineTo(x - r * 0.6, y + r * 0.15); wg.lineTo(x - r * 0.05, y + r * 0.15); wg.lineTo(x - r * 0.25, y + r); wg.lineTo(x + r * 0.6, y - r * 0.2); wg.lineTo(x + r * 0.05, y - r * 0.2); wg.closePath();
      wg.lineWidth = r * 0.22; wg.strokeStyle = 'rgba(40,20,80,.6)'; wg.lineJoin = 'round'; wg.stroke();
      wg.fillStyle = '#fff6a8'; wg.fill();
    }
    function drawWheel(t) {
      var S = WS, R = S / 2 - S * 0.075, cx = S / 2, cy = S / 2, list = segs(), rimW = S * 0.06;
      wg.setTransform(wDPR, 0, 0, wDPR, 0, 0);
      wg.clearRect(0, 0, S, S);
      // gold rim with a bevel
      var rim = wg.createLinearGradient(0, 0, S, S);
      rim.addColorStop(0, '#fff2b0'); rim.addColorStop(0.35, '#f5c242'); rim.addColorStop(0.65, '#c98516'); rim.addColorStop(1, '#ffe08a');
      wg.fillStyle = rim; wg.beginPath(); wg.arc(cx, cy, R + rimW, 0, 6.283); wg.fill();
      wg.lineWidth = 2.5; wg.strokeStyle = '#7a4a05'; wg.stroke();
      wg.fillStyle = '#7a4a05'; wg.beginPath(); wg.arc(cx, cy, R + 2.5, 0, 6.283); wg.fill();
      wg.save(); wg.translate(cx, cy); wg.rotate(angle);
      var font = displayFont();
      list.forEach(function (s, i) {
        var a0 = s.a0 - Math.PI / 2, a1 = s.a1 - Math.PI / 2, mid = (a0 + a1) / 2;
        wg.beginPath(); wg.moveTo(0, 0); wg.arc(0, 0, R, a0, a1); wg.closePath();
        var gr = wg.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
        gr.addColorStop(0, shadeHex(s.col, 0.35)); gr.addColorStop(0.75, s.col); gr.addColorStop(1, shadeHex2(s.col, -0.22));
        wg.fillStyle = gr; wg.fill();
        if (i === winSeg && t - winT < 2600) { wg.fillStyle = 'rgba(255,255,255,' + (0.22 + 0.22 * Math.sin((t - winT) / 90)).toFixed(3) + ')'; wg.fill(); }
        // label: rotated along the slice
        var span = a1 - a0, ir = R * (span < 0.3 ? 0.8 : 0.64), sz = Math.max(7, Math.min(R * 0.12, span * R * 0.32));
        wg.save(); wg.rotate(mid); wg.translate(ir, 0); wg.rotate(Math.PI / 2);
        var rw = s.reward;
        if (rw.coins) {
          coinIcon(0, -sz * 0.95, sz * 0.78);
          wg.font = Math.round(sz * 1.4) + 'px ' + font;
          wg.textAlign = 'center'; wg.textBaseline = 'middle'; wg.lineJoin = 'round';
          wg.lineWidth = sz * 0.35; wg.strokeStyle = 'rgba(30,20,40,.55)'; wg.strokeText(String(rw.coins), 0, sz * 0.78);
          wg.fillStyle = '#fff'; wg.fillText(String(rw.coins), 0, sz * 0.78);
        } else if (rw.chest) {
          var im = svgImg('c-' + rw.chest, Art ? Art.chest(rw.chest) : '');
          if (im) wg.drawImage(im, -sz * 1.3, -sz * 1.1, sz * 2.6, sz * 2.23);
        } else if (rw.booster) boltIcon(0, 0, sz * 1.05);
        else if (rw.skin) {
          var gi = svgImg('gift', Art ? Art.gift('#ffd23f').replace('viewBox="0 0 100 100"', 'viewBox="0 0 100 100"') : '');
          if (gi) wg.drawImage(gi, -sz * 1.1, -sz * 1.1, sz * 2.2, sz * 1.9);
        }
        wg.restore();
      });
      // inner shade + separators + gold pegs
      var shade = wg.createRadialGradient(0, 0, R * 0.8, 0, 0, R);
      shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.22)');
      wg.fillStyle = shade; wg.beginPath(); wg.arc(0, 0, R, 0, 6.283); wg.fill();
      list.forEach(function (s) {
        var a = s.a0 - Math.PI / 2;
        wg.strokeStyle = 'rgba(255,240,200,.9)'; wg.lineWidth = 2.4;
        wg.beginPath(); wg.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2); wg.lineTo(Math.cos(a) * R, Math.sin(a) * R); wg.stroke();
        var px = Math.cos(a) * (R - 5), py = Math.sin(a) * (R - 5);
        var pg = wg.createRadialGradient(px - 1, py - 1, 0.5, px, py, 4.5);
        pg.addColorStop(0, '#fffbe0'); pg.addColorStop(1, '#c98516');
        wg.fillStyle = pg; wg.beginPath(); wg.arc(px, py, 4.2, 0, 6.283); wg.fill();
      });
      wg.restore();
      // bulbs on the rim: chase while spinning, party on a win, slow blink when idle
      var nb = 24;
      for (var b = 0; b < nb; b++) {
        var ba = b / nb * 6.283 + 0.13, lit = spinning ? ((b + Math.floor(t / 60)) % 3 === 0) : winSeg >= 0 && t - winT < 2600 ? ((b + Math.floor(t / 120)) % 2 === 0) : ((b + Math.floor(t / 650)) % 2 === 0);
        var bx = cx + Math.cos(ba) * (R + rimW * 0.5), by = cy + Math.sin(ba) * (R + rimW * 0.5), br = Math.max(2.4, rimW * 0.26);
        if (lit) { wg.shadowColor = '#fff2a0'; wg.shadowBlur = 10; }
        wg.fillStyle = lit ? '#fffbe6' : '#a8741a';
        wg.beginPath(); wg.arc(bx, by, br, 0, 6.283); wg.fill();
        wg.shadowBlur = 0;
        if (lit) { wg.fillStyle = '#fff'; wg.beginPath(); wg.arc(bx - br * 0.3, by - br * 0.3, br * 0.35, 0, 6.283); wg.fill(); }
      }
      var pt = $('gk-pointer');
      if (pt) pt.style.transform = 'translateX(-50%) rotate(' + (-flap).toFixed(1) + 'deg)';
    }
    function shadeHex(hex, amt) {
      var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
      return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    }
    function shadeHex2(hex, amt) {
      var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      r = Math.round(r * (1 + amt)); g = Math.round(g * (1 + amt)); b = Math.round(b * (1 + amt));
      return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    }
    function idle() {
      if (shell.screen === 'wheel' && !spinning) drawWheel(performance.now());
      root.requestAnimationFrame(idle);
    }
    root.requestAnimationFrame(idle);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { if (shell.screen === 'wheel') drawWheel(performance.now()); });

    function renderSpins() {
      var free = fun.freeLeft(), bank = fun.bank(), adOk = fun.adLeft() > 0 && P.ads.rewardedReady();
      var h = '';
      h += '<button class="gk-sp free' + (free ? ' on' : '') + '" data-k="free"' + (free && !spinning ? '' : ' disabled') + '>' + T.free + (free ? '' : ' · ' + T.tomorrow) + '</button>';
      h += '<button class="gk-sp bank' + (bank ? ' on' : '') + '" data-k="bank"' + (bank && !spinning ? '' : ' disabled') + '>' + wheelIcon() + '×' + bank + '</button>';
      if (fun.adLeft() > 0) h += '<button class="gk-sp ad' + (adOk ? ' on' : '') + '" data-k="ad"' + (adOk && !spinning ? '' : ' disabled') + '>' + ico('ad') + '+1</button>';
      $('gk-spins').innerHTML = h;
      $('gk-hub').disabled = spinning || !(free || bank);
      refreshMenu();
    }
    $('gk-spins').addEventListener('click', function (e) { var b = e.target.closest('button[data-k]'); if (b && !b.disabled) startSpin(b.dataset.k); });
    tap('gk-hub', function () { if (spinning) return; startSpin(fun.freeLeft() ? 'free' : 'bank'); });
    tap('gk-odds', function () {
      var list = segs().map(function (s) {
        return '<li><i style="background:' + s.col + '"></i><span>' + esc(segLabel(s)) + '</span><b>' + (Math.round(s.p * 1000) / 10).toLocaleString(shell.lang) + ' %</b></li>';
      }).join('');
      info(T.odds, '<ul class="gk-odds" id="gk-odds-list">' + list + '</ul><p class="gk-note">' + T.oddsNote + '</p>');
    });

    function startSpin(kind) {
      if (spinning) return;
      var before = eco.coins;
      P.spin(kind, function (res) {
        if (!res) { renderSpins(); return; }
        spinning = true; winSeg = -1;
        $('gk-prize').innerHTML = '';
        $('gk-wheel').classList.add('spinning');
        renderSpins();
        animateSpin(res, function () {
          spinning = false;
          $('gk-wheel').classList.remove('spinning');
          winSeg = res.index; winT = performance.now();
          celebrate(res, before);
          renderSpins();
        });
      });
    }
    function animateSpin(res, done) {
      var list = segs(), s = list[res.index], land = s.a0 + (s.a1 - s.a0) * (0.12 + Math.random() * 0.76);
      var start = angle, twoPi = Math.PI * 2, cur = ((start % twoPi) + twoPi) % twoPi;
      var target = start + (fx.reduced ? 2 : 6) * twoPi + ((twoPi - land - cur) % twoPi + twoPi) % twoPi;
      var D = fx.reduced ? 1400 : 5600, wind = fx.reduced ? 0 : 0.22, t0 = performance.now();
      var bounds = list.map(function (x) { return x.a0; }), lastB = null;
      fx.sfx.spin(); fx.haptic('medium');
      var box = wcv.parentNode;
      function frame(t) {
        var k = Math.min(1, (t - t0) / D), th;
        if (k < 0.07) th = start - wind * Math.sin(k / 0.07 * Math.PI / 2);         // wind-up
        else { var q = (k - 0.07) / 0.93; th = start - wind + (target - start + wind) * (1 - Math.pow(1 - q, 4.2)); } // long anticipation tail
        angle = th;
        var rel = ((-angle % twoPi) + twoPi) % twoPi, b = 0;
        for (var i = 0; i < bounds.length; i++) if (rel >= bounds[i]) b = i;
        if (lastB !== null && b !== lastB) { flap = 24; fx.sfx.tick(); if (k > 0.55) fx.haptic('light'); }
        lastB = b;
        flap *= 0.8;
        drawWheel(t);
        if (k < 1) root.requestAnimationFrame(frame);
        else { flap = 0; fx.shake(box, 4, 300); done(); }
      }
      root.requestAnimationFrame(frame);
    }
    function celebrate(res, before) {
      var rw = res.segment.reward, big = !!(rw.chest || rw.skin || (rw.coins || 0) >= 80);
      var r = wcv.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (big) { fx.sfx.big(); fx.confetti(cx, cy, { n: 150, power: 680 }); fx.haptic('success'); fx.shake(app, 5, 420); fx.flash('#fff6d0', 420); }
      else { fx.sfx.win(); fx.confetti(cx, cy, { n: 70 }); fx.haptic('light'); }
      fx.shockwave(cx, cy, '#ffd34d', r.width * 0.6);
      fx.sparks(cx, r.top + 8, '#ffd76a', 30);
      var prize = $('gk-prize');
      prize.innerHTML = '<div class="gk-prize-card' + (big ? ' big' : '') + '">' + rewardChips(res.got) + '</div>';
      var coins = eco.coins - before;
      setTimeout(function () { coinFly(prize, coins); }, 450);
    }

    // ================= CHESTS =================
    function rarityVars(type) {
      var c = RAR_COL[rarityOf(type)];
      return '--rc:' + c + ';--rc2:' + shadeHex(c, 0.45) + ';--rd:' + shadeHex2(c, -0.4);
    }
    function contentsLine(type) {
      var c = meta.chestContents(type), out = [];
      out.push('<span class="gk-chip coin">' + ico('coin') + '<b>' + c.coins + '</b></span>');
      Object.keys(c.boosters || {}).forEach(function (k) { out.push('<span class="gk-chip"><i class="gk-bt" style="--bc:' + boostCol(k) + '">' + ico(k) + '</i><b>' + c.boosters[k] + '</b></span>'); });
      return out.join('');
    }
    // the shell calls this when a ready chest is tapped
    shell.chestOpener = function (i) {
      var st = meta.chestState(i);
      if (!st || st.status !== 'ready') return;
      var from = st.type, luckOdds = st.lucky, nxt = fun.nextChest(from);
      var got = meta.openChest(i);              // the outcome is fixed now; the animation only reveals it
      P.commit();
      var before = eco.coins - (got.coins || 0);
      enqueue(function (close) {
        var rar = rarityOf(from);
        showOv('gk-chestov r-' + rar, '<div class="gk-rays"></div><div class="gk-spot"></div><div class="gk-chestbox" style="' + rarityVars(from) + '">' +
          '<div class="gk-rar r-' + rar + '" id="gk-rar">' + T.rarity[rar] + '</div>' +
          '<div class="gk-chestwrap"><div class="gk-leak"></div>' + chestArt(from, 'gk-bigchest') + '</div>' +
          '<div class="gk-taps" id="gk-taps"><i></i><i></i><i></i></div>' +
          '<div class="gk-maybe" id="gk-maybe"><small>' + T.contents + '</small><div>' + contentsLine(from) + '</div>' +
          (luckOdds && nxt ? '<small class="gk-luckodds">✦ ' + Math.round(luckOdds * 100) + ' % → ' + T.rarity[rarityOf(nxt)] + '</small>' : '') + '</div>' +
          '<div class="gk-items" id="gk-items"></div><button class="btn pri" id="gk-collect" hidden>' + T.collect + '</button></div>');
        var box = ov.querySelector('.gk-chestbox'), svg = ov.querySelector('.gk-bigchest'), taps = 0, opened = false;
        var finalRar = rarityOf(got.chestType), epic = finalRar === 'epic' || finalRar === 'legendary';
        fx.sfx.whoosh();
        var onTap = function () {
          if (opened) return;
          taps++;
          ov.querySelectorAll('#gk-taps i').forEach(function (d, k) { d.classList.toggle('on', k < taps); });
          svg.classList.add('t' + taps);
          ov.classList.add('t' + taps);
          fx.sfx.crack(); fx.sfx.tease(taps); fx.haptic(taps === 1 ? 'light' : taps === 2 ? 'medium' : 'heavy');
          fx.shake(svg, 5 + taps * 5, 380 + taps * 60);
          var r = svg.getBoundingClientRect();
          // the light through the cracks is the chest's own rarity; on the last tap a lucky upgrade (already decided) shows gold
          var leakCol = taps === 3 && got.lucky ? RAR_COL[finalRar] : RAR_COL[rar];
          box.style.setProperty('--leak', leakCol);
          fx.sparks(r.left + r.width / 2, r.top + r.height * 0.6, leakCol, 12 + taps * 12);
          if (taps >= 3) { opened = true; svg.removeEventListener('click', onTap); setTimeout(reveal, epic ? 700 : 380); if (epic) svg.classList.add('charge'); }
        };
        svg.addEventListener('click', onTap);
        function reveal() {
          var go = function () {
            var r = svg.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.45, col = RAR_COL[finalRar];
            ov.classList.add('burst');
            if (epic) ov.classList.add('epic', finalRar === 'legendary' ? 'legend' : 'purple');
            svg.classList.remove('charge');
            svg.classList.add('open');
            fx.sfx.burst(); fx.haptic('success');
            if (epic) { fx.sfx.sting(); fx.flash(finalRar === 'legendary' ? '#fff3c4' : '#f2e2ff', 700); fx.shake(app, 8, 600); fx.fountain(cx, cy, finalRar === 'legendary' ? 60 : 36); }
            fx.shockwave(cx, cy, col, 220);
            fx.confetti(cx, cy, { n: epic ? 200 : 110, colors: [col, '#fff3c4', '#ffffff', shadeHex(col, 0.4)], power: epic ? 720 : 600 });
            fx.sparks(cx, cy, '#fff3c4', epic ? 70 : 40);
            $('gk-maybe').hidden = true;
            $('gk-taps').hidden = true;
            var items = [], c = meta.chestContents(got.chestType);
            items.push({ html: ico('coin') + '<b class="gk-count">+0</b>', coin: c.coins });
            Object.keys(c.boosters || {}).forEach(function (k) { items.push({ html: '<i class="gk-bt big" style="--bc:' + boostCol(k) + '">' + ico(k) + '</i><b>+' + c.boosters[k] + '</b>' }); });
            var gap = epic ? 480 : 320, start0 = epic ? 650 : 350;
            items.forEach(function (it, k) {
              setTimeout(function () {
                var d = doc.createElement('div');
                d.className = 'gk-item' + (epic ? ' spot' : '');
                d.innerHTML = it.html;
                $('gk-items').appendChild(d);
                fx.sfx.pop();
                var dr = d.getBoundingClientRect();
                fx.sparks(dr.left + dr.width / 2, dr.top + dr.height / 2, epic ? '#fff3c4' : col, epic ? 22 : 10);
                if (it.coin) { count(d.querySelector('.gk-count'), it.coin, '+'); setTimeout(function () { coinFly(d, eco.coins - before); }, 380); }
              }, start0 + k * gap);
            });
            setTimeout(function () { var b = $('gk-collect'); b.hidden = false; tap(b, close); }, start0 + 100 + items.length * gap);
          };
          if (got.lucky) {
            // lucky upgrade: the chest changes tier in front of the player
            setTimeout(function () {
              box.setAttribute('style', rarityVars(got.chestType));
              var rr = rarityOf(got.chestType), tag = $('gk-rar');
              tag.className = 'gk-rar r-' + rr + ' lucky'; tag.innerHTML = '✦ ' + T.lucky + ' ' + T.rarity[rr];
              ov.classList.add('lucky');
              ov.classList.remove('r-' + rar); ov.classList.add('r-' + rr);
              var wrap = ov.querySelector('.gk-chestwrap'), keep = wrap.querySelector('.gk-leak').outerHTML;
              wrap.innerHTML = keep + chestArt(got.chestType, 'gk-bigchest t3');
              svg = wrap.querySelector('.gk-bigchest');
              fx.sfx.lucky(); fx.haptic('lucky'); fx.shake(app, 6, 500); fx.flash('#ffe9a0', 400);
              var r = svg.getBoundingClientRect();
              fx.sparks(r.left + r.width / 2, r.top + r.height / 2, '#ffd76a', 70);
              setTimeout(go, 1000);
            }, 200);
          } else go();
        }
      });
    };

    // ================= HARD-LEVEL INTRO =================
    shell.introOpener = function (o, go) {
      enqueue(function (close) {
        var sup = o.difficulty === 'superdificil';
        showOv('gk-introov ' + (sup ? 'super' : 'hard'), '<div class="gk-rays"></div><div class="gk-intro">' +
          '<button class="ic gk-x" id="gk-intro-x" aria-label="×">' + sico('close') + '</button>' +
          '<div class="gk-intro-ban">' + esc(o.title) + '</div>' +
          '<div class="gk-intro-lv"><span>' + T.level + '</span><b>' + o.level + '</b><em class="gk-dbadge ' + (sup ? 'super' : 'hard') + '">' + (sup ? gic('skull') : ico('flame')) + '</em></div>' +
          (o.coins ? '<div class="gk-intro-rw"><small>' + T.upTo + '</small><span class="gk-chip coin">' + ico('coin') + '<b>+' + o.coins + '</b></span></div>' : '') +
          '<button class="btn pri gk-go" id="gk-intro-go">' + T.play + '</button></div>');
        fx.sfx.whoosh(); fx.haptic('medium');
        if (sup) { fx.sfx.boom(); fx.shake(ov.querySelector('.gk-intro'), 6, 500); }
        setTimeout(function () { var b = ov.querySelector('.gk-intro-lv'); if (b) { var c = center(b); fx.sparks(c.x, c.y, sup ? '#c27bff' : '#ff6a3d', 40); } }, 300);
        tap('gk-intro-go', function () { close(); setTimeout(go, 230); });
        tap('gk-intro-x', close);
      });
    };

    // ================= LEVEL UP =================
    P.on('levelup', function (ups) {
      ups.forEach(function (u) {
        enqueue(function (close) {
          var skin = u.got.skin && eco.skin(u.got.skin);
          showOv('gk-levelov', '<div class="gk-rays"></div><div class="gk-lvbadge"><span>' + u.level + '</span></div><h2>' + T.level + ' ' + u.level + '</h2><div class="gk-rw">' + rewardChips(u.got) + '</div>' +
            (skin ? '<div class="gk-reveal"><small>' + T.newSkin + '</small><div class="gk-revcard">' + (opts.skinPreview ? opts.skinPreview(skin, shell.theme()) : '') +
              '<b>' + esc(shell.TX.skins[skin.id] || skin.id) + '</b></div><button class="btn" id="gk-lv-equip">' + T.equip + '</button></div>' : '') +
            '<button class="btn pri" id="gk-lv-ok">' + T.ok + '</button>');
          fx.fireworks(2600); fx.sfx.level(); fx.haptic('success');
          setTimeout(function () { var b = ov.querySelector('.gk-lvbadge'); if (b) { var c = center(b); fx.sparks(c.x, c.y, '#ffd76a', 50); fx.shockwave(c.x, c.y, '#ffd76a', 160); } }, 350);
          if (skin) tap('gk-lv-equip', function () { if (eco.equip(skin.id)) { P.commit(); P.emit('skin'); } close(); });
          tap('gk-lv-ok', function () { close(); coinFly($('b-coins'), 0); renderXp(0); });
          refreshMenu();
        });
      });
    });

    // ================= LUCKY MOMENT =================
    P.on('lucky', function () {
      banner.innerHTML = '<span class="gk-lk-star">' + gic('sparkles') + '</span><b>' + T.lucky + '</b><span>' + T.x2 + '</span>';
      banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
      fx.sfx.lucky(); fx.haptic('lucky');
      var r = banner.getBoundingClientRect();
      fx.sparks(r.left + r.width / 2, r.top + r.height / 2 + 30, '#ffd76a', 50);
      clearTimeout(banner.t);
      banner.t = setTimeout(function () { banner.classList.remove('show'); }, 2600);
    });

    // ================= RESULT SCREEN additions =================
    shell.onResult = function (s) {
      if (!s) return;
      var el = $('o-coins');
      if (el && s.coins > 0) {
        if (s.mult > 1) el.insertAdjacentHTML('beforeend', '<span class="gk-tag flame">' + ico('flame') + '×' + s.mult + '</span>');
        if (s.lucky) el.insertAdjacentHTML('beforeend', '<span class="gk-tag lucky">✦×2</span>');
      }
      // a won hard level gets a bigger party
      if (s.attempts && (s.difficulty === 'dificil' || s.difficulty === 'superdificil')) {
        var sup = s.difficulty === 'superdificil';
        setTimeout(function () {
          fx.fireworks(sup ? 3200 : 2200);
          fx.confetti(root.innerWidth / 2, root.innerHeight * 0.35, { n: sup ? 220 : 140, power: 720 });
          if (sup) fx.flash('#f2e2ff', 500);
          fx.sfx.big(); fx.haptic('success');
          showBig((sup ? gic('skull') : ico('flame')) + '<b>' + T.didIt + '</b>', sup ? 'super' : 'hard');
        }, 350);
      }
      if (s.surprise) giftOv(s.surprise);
      refreshMenu();
    };
    function giftOv(sp) {
      enqueue(function (close) {
        showOv('gk-giftov', '<div class="gk-rays"></div><div class="gk-giftbox">' + (Art ? Art.gift() : sico('gift')) + '</div><h2>' + ico('flame') + ' ' + sp.day + ' ' + T.days + '</h2><div class="gk-rw" id="gk-gift-rw" hidden>' + rewardChips(sp.got) + '</div><button class="btn pri" id="gk-gift-ok">' + T.tap + '</button>');
        var opened = false, box = ov.querySelector('.gk-giftbox');
        fx.sfx.whoosh();
        tap('gk-gift-ok', function () {
          if (opened) { close(); return; }
          opened = true;
          box.classList.add('open'); ov.classList.add('burst');
          var c = center(box);
          fx.confetti(c.x, c.y, { n: 130 }); fx.shockwave(c.x, c.y, '#ffd34d', 180); fx.sfx.big(); fx.haptic('success');
          $('gk-gift-rw').hidden = false; $('gk-gift-ok').textContent = T.ok;
          refreshMenu();
        });
      });
    }

    // ================= STREAK SHEET =================
    tap('streak', function () { if (!(meta.canRepairStreak() && P.ads.rewardedReady())) shell.show('streakinfo'); });
    function renderStreak() {
      var n = meta.liveStreak(), m = fun.streakMult(n), gifts = cfg.streak.gifts || {}, given = fun.state.gifts, mults = cfg.streak.multipliers || {};
      var h = '<div class="gk-flame' + (meta.playedToday() ? '' : ' cold') + '">' + (Art ? Art.flame() : ico('flame')) + '<b>' + n + '</b></div>';
      h += '<div class="gk-mults road">' + Object.keys(mults).map(function (d) { return '<span class="' + (n >= +d ? 'on' : '') + '"><em>' + d + '</em><small>' + T.days + '</small><b>' + ico('coin') + '×' + mults[d] + '</b></span>'; }).join('') + '</div>';
      h += '<h4><span>' + T.giftDays + '</span></h4><div class="gk-gifts">' + Object.keys(gifts).map(function (d) {
        var g = gifts[d], got = given.indexOf(+d) >= 0;
        return '<div class="gk-giftday' + (got ? ' got' : n >= +d ? ' on' : '') + '"><span>' + d + '</span>' + (Art ? Art.gift(got ? '#9aa7b4' : '#ff5a7a') : sico('gift')) + '<small>' + rewardChips({ spins: g.spins, chest: g.chest, coins: g.coins }) + '</small></div>';
      }).join('') + '</div>';
      h += '<div class="gk-mults"><span>' + T.mult + '<b>×' + m + '</b></span><span>' + T.freeze + '<b>' + P.data.meta.streak.freezes + '</b></span></div>';
      $('gk-streak-body').innerHTML = h;
    }

    // ================= LEAGUE =================
    function emblem(tier, size) {
      var id = lg.tiers()[tier], c = TIER_COL[id];
      if (Art) return '<span class="gk-emblem" style="--tc:' + c + ';width:' + size + 'px;height:' + size + 'px">' + Art.shield(tier, c) + '</span>';
      return '<span class="gk-emblem" style="--tc:' + c + ';width:' + size + 'px;height:' + size + 'px">' + sico('shield') + '<i style="font-size:' + Math.round(size * 0.36) + 'px">' + (tier + 1) + '</i></span>';
    }
    // emoji flags where the system draws them (Android, iOS, macOS); a small country code elsewhere (Windows)
    var flagEmoji = (function () {
      try {
        var c = doc.createElement('canvas'); c.width = c.height = 20;
        var x = c.getContext('2d'); x.font = '16px sans-serif'; x.textBaseline = 'top'; x.fillText(GameKit.flag('ES'), 0, 0);
        var d = x.getImageData(0, 0, 20, 20).data;
        for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && Math.abs(d[i] - d[i + 1]) > 60) return true;
      } catch (e) { /* no canvas */ }
      return false;
    })();
    function flagHtml(cc) {
      if (!cc) return '';
      return flagEmoji ? '<em>' + GameKit.flag(cc) + '</em>' : '<em class="cc">' + esc(String(cc).toUpperCase()) + '</em>';
    }
    function avatar(r, cls) {
      return '<span class="gk-av' + (cls ? ' ' + cls : '') + '" style="--av:' + r.color + '">' + esc(r.initial) + flagHtml(r.country) + '</span>';
    }
    function cpuMark() { return '<svg class="gk-cpu" aria-label="' + T.cpuShort + '"><title>' + T.cpuShort + '</title><use href="#gk-i-cpu"/></svg>'; }
    function fmtLeft(ms) { var h = Math.floor(ms / 3600000), d = Math.floor(h / 24); return d ? d + 'd ' + (h % 24) + 'h' : h + 'h ' + Math.floor(ms % 3600000 / 60000) + 'm'; }
    function renderLeague(scroll) {
      var t = lg.table(), tier = lg.state.tier, id = lg.tiers()[tier], C = cfg.league;
      $('gk-lg-title').textContent = T.league + ' ' + T.tiers[id];
      var me = t.filter(function (r) { return r.me; })[0];
      $('gk-lg-head').innerHTML = emblem(tier, 76) + '<div><b>' + T.tiers[id] + '</b><span class="gk-timer">' + gic('stopwatch') + T.ends + ' ' + fmtLeft(lg.msLeft()) + '</span></div><div class="gk-myxp"><b>' + me.xp + '</b><small>XP</small></div>';
      $('gk-ladder').innerHTML = lg.tiers().map(function (tid, k) { return '<span class="' + (k === tier ? 'on' : k < tier ? 'past' : '') + '" title="' + T.tiers[tid] + '">' + (Art ? Art.shield(k, TIER_COL[tid]) : '') + '</span>'; }).join('');
      var rewardAt = {}; C.rewards.forEach(function (rw, k) { var from = k ? C.rewards[k - 1].to + 1 : 1; rewardAt[from] = rw.to === 1 && tier >= C.legendaryFrom ? 'crystal' : rw.chest; });
      var h = '';
      t.forEach(function (r) {
        if (r.rank === C.promote + 1 && tier < lg.tiers().length - 1) h += '<div class="gk-div up">' + sico('up') + T.up + sico('up') + '</div>';
        if (r.rank === C.size - C.demote + 1 && tier > 0) h += '<div class="gk-div down">' + sico('down') + T.down + sico('down') + '</div>';
        var rw = rewardAt[r.rank];
        h += '<div class="gk-row' + (r.me ? ' me' : '') + (r.zone ? ' z-' + r.zone : '') + (r.rank <= 3 ? ' m' + r.rank : '') + '"' + (r.cpu ? ' data-cpu="1"' : '') + '><span class="gk-rk">' + r.rank + '</span>' + avatar(r) +
          '<span class="gk-nm">' + esc(r.me ? r.name + ' · ' + T.you : r.name) + (r.cpu ? cpuMark() : '') + '</span>' +
          (rw ? '<span class="gk-rwc r-' + rarityOf(rw) + '">' + chestArt(rw, 'gk-chestmini') + '</span>' : '<span></span>') + '<b class="gk-xp">' + r.xp + '</b></div>';
      });
      $('gk-lg-rows').innerHTML = h;
      if (scroll) setTimeout(function () { var m = $('gk-lg-rows').querySelector('.me'); if (m) m.scrollIntoView({ block: 'center' }); }, 40);
    }
    P.on('league', function () { if (shell.screen === 'league') renderLeague(false); });
    tap('gk-lg-info', function () { info(T.league, '<p>' + T.leagueRules + '</p><p class="gk-cpuline">' + sico('cpu', 'gk-cpu') + ' ' + T.cpu + '</p>'); });
    function leagueResult(res) {
      enqueue(function (close) {
        var up = res.to > res.from, down = res.to < res.from, id = lg.tiers()[res.to];
        showOv('gk-lgov' + (up ? ' up' : down ? ' down' : ''), '<div class="gk-rays"></div>' + emblem(res.to, 150) + '<h2>' + (up ? T.promoted : down ? T.relegated : T.stayed) + '</h2><p>' + T.tiers[id] + ' · ' + T.pos + ' ' + res.rank + '/' + cfg.league.size + '</p>' +
          '<div class="gk-rw">' + rewardChips(res.got) + '</div><button class="btn pri" id="gk-lg-ok">' + T.ok + '</button>');
        if (up) { fx.fireworks(2000); fx.sfx.up(); fx.haptic('success'); setTimeout(function () { var e = ov.querySelector('.gk-emblem'); if (e) { var c = center(e); fx.shockwave(c.x, c.y, TIER_COL[id], 200); fx.sparks(c.x, c.y, '#fff3c4', 50); } }, 500); }
        else if (down) fx.sfx.down(); else fx.sfx.win();
        tap('gk-lg-ok', function () { close(); if (res.got && res.got.coins) coinFly($('b-coins'), res.got.coins); });
      });
    }
    P.on('leagueend', leagueResult);
    var pendingRes = lg.takeResult();
    if (pendingRes) leagueResult(pendingRes);

    // ================= RANKING =================
    var period = 'daily';
    $('gk-rk-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-p]');
      if (!b) return;
      period = b.dataset.p;
      $('gk-rk-tabs').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      fx.sfx.pop();
      renderRank();
    });
    function rankRows(data) {
      var mode = opts.rankMode || 'daily', day = P.today(), C = cfg.ranking, prof = on.profile;
      var rows = (data && data.top ? data.top : []).map(function (e) {
        var p = root.GamekitLeague._person(cfgRng(e.name));
        return { name: e.name, country: e.country, score: e.score, me: e.me, color: e.me ? ME_COL : p.color, initial: e.me ? '★' : String(e.name || '?').charAt(0).toUpperCase() };
      });
      var mine = data && data.me, local = opts.localScore ? opts.localScore(period) : null;
      if (!rows.some(function (r) { return r.me; })) {
        var sc = mine ? mine.score : local;
        if (sc != null && !prof.hidden) rows.push({ name: prof.nickname, country: prof.showFlag ? prof.country : '', score: sc, me: true, color: ME_COL, initial: '★' });
      }
      var real = data ? data.total : rows.length, fill = Math.max(0, (C.fillTo || 0) - Math.max(real, rows.length));
      var hour = period === 'daily' ? new Date().getHours() + new Date().getMinutes() / 60 : null;
      var bots = root.GamekitLeague.rankingBots(cfg, (cfg.game && cfg.game.id) || 'game', mode, period, day, fill, hour);
      rows = rows.concat(bots).sort(function (a, b) { return b.score - a.score || (a.me ? -1 : b.me ? 1 : 0); });
      rows.forEach(function (r, i) { r.rank = i && r.score === rows[i - 1].score ? rows[i - 1].rank : i + 1; });
      return { rows: rows, bots: bots.length > 0 };
    }
    function cfgRng(name) { return root.GamekitUtil.rng(root.GamekitUtil.hashString('avatar:' + name)); }
    function podium(rows) {
      var top = rows.slice(0, 3);
      if (top.length < 3) return '';
      return [1, 0, 2].map(function (k) {
        var r = top[k], place = k + 1;
        return '<div class="gk-pod p' + place + (r.me ? ' me' : '') + '">' + (place === 1 && Art ? '<span class="gk-crown">' + Art.crown() + '</span>' : '') + avatar(r, 'big') +
          '<span class="gk-pnm">' + esc(r.name) + (r.cpu ? cpuMark() : '') + '</span><b class="gk-psc">' + fmtScore(r.score) + '</b><span class="gk-ped"><i>' + place + '</i></span></div>';
      }).join('');
    }
    function drawRank(data) {
      var R = rankRows(data), h = '';
      $('gk-rk-pod').innerHTML = podium(R.rows);
      var pod = R.rows.length >= 3;
      R.rows.slice(0, 50).forEach(function (r, i) {
        var medal = r.rank <= 3 ? ' m' + r.rank : '';
        h += '<div class="gk-row' + (r.me ? ' me' : '') + medal + (pod && i < 3 ? ' pod' : '') + '"' + (r.cpu ? ' data-cpu="1"' : '') + '><span class="gk-rk">' + r.rank + '</span>' + avatar(r) +
          '<span class="gk-nm">' + esc(r.name) + (r.me ? ' · ' + T.you : '') + (r.cpu ? cpuMark() : '') + '</span><span></span><b class="gk-xp">' + fmtScore(r.score) + '</b></div>';
      });
      var me = R.rows.filter(function (r) { return r.me; })[0];
      if (me && me.rank > 50) h += '<div class="gk-div">…</div><div class="gk-row me"><span class="gk-rk">' + me.rank + '</span>' + avatar(me) + '<span class="gk-nm">' + esc(me.name) + '</span><span></span><b class="gk-xp">' + fmtScore(me.score) + '</b></div>';
      $('gk-rk-rows').innerHTML = h || '<p class="gk-note">' + T.none + '</p>';
      $('gk-rk-status').innerHTML = '<span>' + (on.online === false || !on.enabled ? sico('cloud') + ' ' + T.offline : '') + '</span>' + (R.bots ? '<span class="gk-cpuline">' + sico('cpu', 'gk-cpu') + ' ' + T.cpu + '</span>' : '');
      var played = opts.localScore && opts.localScore('daily') != null;
      $('gk-rk-play').hidden = played || !opts.playDaily;
    }
    function renderRank() {
      var mode = opts.rankMode || 'daily', day = P.today();
      drawRank(on.cached(mode, period, day), true);
      on.leaderboard(mode, period, day).then(function (j) { if (shell.screen === 'ranking') drawRank(j, !j || on.online === false); });
    }
    tap('gk-rk-play', function () { if (opts.playDaily) opts.playDaily(); });
    tap('gk-rk-info', function () {
      var rw = cfg.ranking.rewards;
      info(T.ranking, '<p>' + T.rankRules + '</p><ul class="gk-odds"><li><i style="background:#f0b62a"></i><span>Top 3</span><b>' + ico('coin') + rw.top3 + '</b></li><li><i style="background:#9fb0c2"></i><span>Top 10 %</span><b>' + ico('coin') + rw.top10 + '</b></li><li><i style="background:#c9814a"></i><span>✓</span><b>' + ico('coin') + rw.play + '</b></li></ul>' +
        '<p class="gk-cpuline">' + sico('cpu', 'gk-cpu') + ' ' + T.cpu + '</p><p class="gk-note">' + T.privacy + '</p>');
    });
    tap('gk-rk-prof', function () { shell.show('profile'); });
    P.on('ranked', function () { if (shell.screen === 'ranking') renderRank(); });
    P.on('rankreward', function (j) {
      enqueue(function (close) {
        var best = j.granted.slice().sort(function (a, b) { return a.rank - b.rank; })[0];
        showOv('gk-lgov', '<div class="gk-rays"></div><div class="gk-trophy">' + (Art ? Art.trophy() : sico('trophy')) + '</div><h2>' + T.rankReward + '</h2><p>' + T.pos + ' ' + best.rank + ' ' + T.of + ' ' + best.total + '</p><div class="gk-rw">' + rewardChips({ coins: j.coins }) + '</div><button class="btn pri" id="gk-rr-ok">' + T.collect + '</button>');
        fx.sfx.win(); fx.confetti(root.innerWidth / 2, root.innerHeight * 0.4, { n: 90 });
        tap('gk-rr-ok', function () { close(); coinFly($('b-coins'), j.coins); });
      });
    });

    // ================= PROFILE + CREDITS =================
    function renderProfile() {
      var p = on.profile;
      $('gk-nick').value = p.nickname;
      $('gk-flag').checked = p.showFlag;
      $('gk-flag-l').textContent = T.flag + ' ' + (p.country ? (flagEmoji ? GameKit.flag(p.country) : p.country) : '');
      $('gk-flag').disabled = !p.country;
      $('gk-hide').checked = p.hidden;
      $('gk-prof-av').innerHTML = avatar({ color: ME_COL, initial: String(p.nickname || '?').charAt(0).toUpperCase(), country: p.showFlag ? p.country : '' }, 'huge');
      var L = opts.links || {};
      $('gk-links').innerHTML = (L.privacy ? '<a href="' + L.privacy + '" target="_blank" rel="noopener">' + T.privacyLink + '</a>' : '') + (L.terms ? ' · <a href="' + L.terms + '" target="_blank" rel="noopener">' + T.termsLink + '</a>' : '');
    }
    tap('gk-dice', function () { $('gk-nick').value = GameKit.funName(Math.random, shell.lang); });
    tap('gk-save', function () {
      var okNick = on.setProfile({ nickname: $('gk-nick').value, showFlag: $('gk-flag').checked, hidden: $('gk-hide').checked });
      if (!okNick) { fx.shake($('gk-nick'), 6, 300); shell.toast(T.badNick); return; }
      shell.toast(T.saved);
      shell.show('ranking');
    });
    tap('gk-credits-btn', function () { shell.show('credits'); });
    function renderCredits() {
      var font = displayFont();
      var list = (Art ? Art.credits : []).filter(function (c) { return !c.font || font.indexOf(c.font) >= 0; });
      $('gk-credits-body').innerHTML = '<p class="gk-note">' + T.creditsNote + '</p>' + list.map(function (c) {
        return '<div class="gk-credit"><b>' + esc(c.what) + '</b><span>' + esc(c.who) + '</span><em>' + esc(c.licence) + '</em>' + (c.url ? '<small>' + esc(c.url.replace(/^https:\/\//, '')) + '</small>' : '') + '</div>';
      }).join('');
    }
    on.onNickChanged = function () { if (shell.screen === 'profile') renderProfile(); };

    refreshMenu();
    var ui = { fx: fx, refresh: refreshMenu, info: info, renderLeague: renderLeague, renderRank: renderRank, spendFx: spendFx, coinFly: coinFly };
    // limited-time offers (shell/offers-ui.js): popups share this overlay queue, so one big moment shows at a time
    if (root.GamekitOffersUI) {
      ui.offers = root.GamekitOffersUI.attach(P, shell, { fx: fx, enqueue: enqueue, showOv: showOv, ov: ov, tap: tap, sico: sico, center: center,
        coinFly: coinFly, tierName: function (t) { return T.tiers[lg.tiers()[t]] || ''; }, tierCol: function (t) { return TIER_COL[lg.tiers()[t]]; },
        isBusy: function () { return busy; } });
    }
    return ui;
  }

  var FunUI = { attach: attach, TEXTS: TX };
  if (typeof module !== 'undefined' && module.exports) module.exports = FunUI;
  else root.GamekitFunUI = FunUI;
})(this);

/* ---- gamekit/shell/offers-ui.js ---- */
/* gamekit offers UI: the offer popup (between games / app start), the live offer cards at the top of the shop, the
 * "Monedas ×2" badge on the coin counter and the ×2 tag on the result screen. Platform layer: no game code; the look
 * comes from the art tokens (ART.md) of each game. Attached by GamekitFunUI.attach (shares its overlay queue).
 *
 *   GamekitOffersUI.attach(P, shell, ctx)   ctx from fun-ui: { fx, enqueue, showOv, ov, tap, sico, center, coinFly, tierName, tierCol }
 *
 * Honesty rules (MONETIZATION.md addendum D):
 *   - countdowns show the offer's real expiresAt (meta/offers.js never extends it); at 0 the popup closes and the card goes
 *   - a one-shot offer says "Solo ahora" and is gone when its popup closes; a regular product promoted between games
 *     (double_2h) has no urgency wording at all
 *   - value badges come from GamekitOffers.claims (contents vs the best regular coin pack, rounded down) and the
 *     reference is printed under the button; a struck "was" price only for the same bundle sold at a higher regular price
 *   - no purchase button without a store (web builds never get here: the engine needs IAP.available)
 */
(function (root) {
  'use strict';
  var TX = {
    es: { one: '¡OFERTA ÚNICA!', onlyNow: 'Solo ahora', ends: 'Termina en', value: 'de valor', coins: 'monedas', up: '¡Ascenso a {t}!',
      weekend: '¡FIN DE SEMANA!', limited: '¡OFERTA LIMITADA!', promo: '¡MONEDAS ×2!', tag: 'Oferta', vs: 'vs.',
      names: { offer_silver: 'Pack Plata', offer_gold: 'Pack Oro', offer_diamond: 'Pack Diamante', offer_weekend: 'Pack de fin de semana',
        offer_oneshot_s: 'Pack de ayudas', offer_oneshot_m: 'Montaña de monedas', double_2h: 'Monedas ×2', starter_pack: 'Pack inicial' } },
    en: { one: 'ONE-TIME OFFER!', onlyNow: 'Only now', ends: 'Ends in', value: 'value', coins: 'coins', up: 'Promoted to {t}!',
      weekend: 'WEEKEND DEAL!', limited: 'LIMITED OFFER!', promo: 'COINS ×2!', tag: 'Offer', vs: 'vs.',
      names: { offer_silver: 'Silver pack', offer_gold: 'Gold pack', offer_diamond: 'Diamond pack', offer_weekend: 'Weekend pack',
        offer_oneshot_s: 'Booster pack', offer_oneshot_m: 'Coin mountain', double_2h: 'Coins ×2', starter_pack: 'Starter pack' } }
  };

  function p2(v) { return (v < 10 ? '0' : '') + v; }
  // "02:14:07" (hours always shown: the timer reads like a clock); "1 d 02:14:07" past 24 h
  function clock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600);
    return (d ? d + ' d ' : '') + p2(h) + ':' + p2(Math.floor(s % 3600 / 60)) + ':' + p2(s % 60);
  }
  function short(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? h + ':' + p2(m) + ' h' : m + ':' + p2(s % 60); }

  function attach(P, shell, k) {
    var doc = root.document, T = TX[shell.lang] || TX.en, off = P.offers, eco = P.eco, cfg = P.cfg, IAP = P.iap, Art = root.GamekitArt;
    var $ = function (id) { return shell.el ? shell.el(id) : doc.getElementById(id); };
    var ico = shell.ico, gic = shell.gic, fx = k.fx;
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
    if (!off) return null;

    function name(id) { return T.names[id] || id; }
    function title(o) {
      if (o.kind === 'league') return T.up.replace('{t}', k.tierName(o.tier));
      if (o.kind === 'weekend') return T.weekend;
      if (o.kind === 'oneshot') return T.one;
      if (o.kind === 'promo') return T.promo;
      return T.limited;
    }
    function boosterFan(b) {
      var ids = Object.keys(b || {}).slice(0, 3);
      return '<span class="gk-of-fan">' + ids.map(function (id, i) { return '<i class="gk-bt big f' + i + '" style="--bc:' + shell.boostCol(id) + '">' + ico(id) + '</i>'; }).join('') + '</span>';
    }
    function art(o, g) {
      if (!Art) return '';
      if (o.kind === 'league') return Art.chest(o.tier >= 5 ? 'crystal' : o.tier >= 2 ? 'gold' : 'silver', { cls: 'gk-of-chest' });
      if (o.kind === 'weekend' || o.kind === 'starter') return '<span class="gk-of-gift">' + Art.gift('#ff5a7a') + '</span>';
      if (g.doubleHours && !g.coins) return '<i class="gk-x2i huge">' + ico('coin') + '<em>×2</em></i>';
      if (g.coins && !g.boosters) return '<span class="gk-of-coins">' + Art.coinPile(3) + '</span>';
      return boosterFan(g.boosters);
    }
    function badge(c) {
      if (!c) return '';
      if (c.discountPct >= 10) return '<span class="gk-ofbadge hot"><b>-' + c.discountPct + '%</b></span>';
      if (c.valuePct >= cfg.offers.minValuePct) return '<span class="gk-ofbadge"><b>+' + c.valuePct + '%</b><small>' + T.value + '</small></span>';
      return '';
    }
    // the reference behind the claim, printed under the button (auditable): "+180% vs. 12.000 monedas · 9,99 €"
    function refLine(c) {
      if (!c || c.was || !c.ref || !(c.valuePct >= cfg.offers.minValuePct || c.coinMult >= 2)) return '';
      var r = P.product(c.ref);
      return '<small class="gk-of-ref">' + T.vs + ' ' + r.grant.coins.toLocaleString(shell.lang) + ' ' + T.coins + ' · ' + esc(IAP.price(r.id)) + '</small>';
    }
    function priceBlock(o, c, attrs, cls) {
      return '<div class="gk-of-buy">' + (c && c.was ? '<s class="gk-of-was">' + esc(IAP.price(c.was)) + '</s>' : '') +
        '<button class="' + cls + '" ' + attrs + '>' + esc(IAP.price(o.product)) + '</button></div>';
    }
    function timer(o) {
      if (o.kind === 'oneshot') return '<div class="gk-of-timer now"><b>' + T.onlyNow + '</b></div>';
      if (o.kind === 'promo') return '';
      return '<div class="gk-of-timer">' + gic('stopwatch') + '<span>' + T.ends + '</span><b data-ends="' + o.expiresAt + '">' + clock(o.expiresAt - Date.now()) + '</b></div>';
    }

    // ---------- the popup ----------
    var openKey = null;
    function popup(o, where, done) {
      k.enqueue(function (close) {
        var p = P.product(o.product);
        if (!p || (o.kind !== 'oneshot' && o.kind !== 'promo' && !off.canBuy(o.key))) { finishNow(); return; }
        var c = off.claims(o.product), g = p.grant || {};
        var style = o.kind === 'league' && k.tierCol ? ' style="--tc:' + k.tierCol(o.tier) + '"' : '';
        k.showOv('gk-offerov k-' + o.kind, '<div class="gk-rays"></div><div class="gk-offer k-' + o.kind + '"' + style + '>' +
          '<button class="ic gk-x" id="gk-of-x" aria-label="×">' + k.sico('close') + '</button>' +
          '<div class="gk-of-ban">' + esc(title(o)) + '</div>' +
          '<div class="gk-of-name">' + esc(name(o.product)) + '</div>' +
          '<div class="gk-of-art"><span class="gk-of-glow"></span>' + art(o, g) + badge(c) + '</div>' +
          shell.rewardTiles(g, 'big') +
          (c && c.coinMult >= 2 ? '<div class="gk-of-mult">×' + c.coinMult + ' ' + T.coins + '</div>' : '') +
          timer(o) + priceBlock(o, c, 'id="gk-of-buy"', 'btn cta gk-of-btn') + refLine(c) + '</div>');
        openKey = o.key;
        fx.sfx.whoosh(); fx.haptic('medium');
        setTimeout(function () { var a = k.ov.querySelector('.gk-of-art'); if (a) { var ce = k.center(a); fx.sparks(ce.x, ce.y, '#ffd76a', 34); fx.shockwave(ce.x, ce.y, '#ffd76a', 140); } }, 280);
        var finished = false;
        function finish() {
          if (finished) return;
          finished = true;
          openKey = null;
          off.close(o.key);         // a one-shot offer is gone for good; a timed one keeps its shop card until it ends
          P.commit();
          close();
          if (done) setTimeout(done, 230);
        }
        function finishNow() { off.close(o.key); P.commit(); close(); if (done) setTimeout(done, 230); }
        k.tap('gk-of-x', finish);
        k.tap('gk-of-buy', function () {
          var b = doc.getElementById('gk-of-buy');
          if (!b || b.disabled) return;
          b.disabled = true;
          P.buyOffer(o.key).then(function (got) {
            if (!got) { b.disabled = false; return; }
            var ce = k.center(b);
            fx.confetti(ce.x, ce.y, { n: 140, power: 680 }); fx.sfx.big(); fx.haptic('success');
            if (got.coins) k.coinFly(b, got.coins);
            setTimeout(finish, 650);
          }, function () { b.disabled = false; });
        });
        popup.expire = function () { if (openKey === o.key && o.kind !== 'oneshot' && o.kind !== 'promo' && off.msLeft(o.key) <= 0) finish(); };
      });
    }
    // app start: wait until a menu is on screen (never over a level in progress)
    P.offerPresenter = function (o, where, done) {
      if (where !== 'start' || !shell.isMenu || shell.isMenu()) { popup(o, where, done); return; }
      var tries = 0, t = setInterval(function () {
        if (shell.isMenu() || ++tries > 120) { clearInterval(t); if (shell.isMenu()) popup(o, where, done); else { off.close(o.key); if (done) done(); } }
      }, 1000);
    };

    // ---------- shop cards (live timed offers; the starter pack keeps the shell's own hero card) ----------
    shell.shopOffers = function () {
      return off.live().filter(function (o) { return o.kind !== 'starter'; }).map(function (o) {
        var p = P.product(o.product), c = off.claims(o.product);
        if (!p) return '';
        return '<div class="gk-hero gk-ofcard k-' + o.kind + '"><span class="gk-ribbon hot">' + T.tag + '</span>' +
          '<div class="gk-hero-head"><b>' + esc(name(o.product)) + '</b><small>' + gic('stopwatch') + T.ends + ' <b data-ends="' + o.expiresAt + '">' + clock(o.expiresAt - Date.now()) + '</b></small></div>' +
          '<div class="gk-of-art sm">' + art(o, p.grant || {}) + badge(c) + '</div>' + shell.rewardTiles(p.grant, 'big') +
          priceBlock(o, c, 'data-offer="' + esc(o.key) + '"', 'mini cta big') + refLine(c) + '</div>';
      }).join('');
    };
    shell.onOfferTap = function (key, btn) {
      btn.disabled = true;
      P.buyOffer(key).then(function () { if (shell.screen === 'shop') shell.renderShop(); }, function () { btn.disabled = false; });
    };

    // ---------- coin counter badge + result tag ----------
    var chip = $('b-coins'), x2 = null;
    if (chip) { x2 = doc.createElement('small'); x2.className = 'gk-x2'; chip.appendChild(x2); }
    var prevResult = shell.onResult;
    shell.onResult = function (s) {
      if (prevResult) prevResult(s);
      var el = $('o-coins');
      if (s && s.double && el) el.insertAdjacentHTML('beforeend', '<span class="gk-tag x2">' + ico('coin') + '×2</span>');
    };

    // ---------- one clock for every countdown on screen ----------
    var shopSig = '';
    setInterval(function () {
      var now = Date.now(), gone = false;
      doc.querySelectorAll('[data-ends]').forEach(function (e) {
        var left = +e.getAttribute('data-ends') - now;
        e.textContent = e.closest('.gk-wide') ? shell.fmtLeft(Math.max(0, left)) : clock(left);
        if (left <= 0) gone = true;
      });
      if (popup.expire) popup.expire();
      if (shell.screen === 'shop') {
        var sig = off.live().map(function (o) { return o.key; }).join(',') + (eco.doubleActive() ? 'x' : '');
        if (gone || sig !== shopSig) { shopSig = sig; shell.renderShop(); }
      }
      if (x2) { var l = eco.doubleLeft(); x2.textContent = l > 0 ? '×2 ' + short(l) : ''; }
    }, 1000);

    return { popup: popup, clock: clock, texts: T };
  }

  var OffersUI = { attach: attach, TEXTS: TX, clock: clock };
  if (typeof module !== 'undefined' && module.exports) module.exports = OffersUI;
  else root.GamekitOffersUI = OffersUI;
})(this);

/* ---- game/core.js ---- */
/* Teselo core: pure game logic (no DOM). Loaded by the page and by test/core.test.js in node. */
(function (root) {
  'use strict';

  var N = 8;              // board is N x N
  var TRAY = 3;           // pieces offered at once
  var DAILY_TRAYS = 12;   // a daily challenge is 12 trays (36 pieces)
  var EPOCH = '2026-10-26'; // daily #1

  // ---- seeded RNG -------------------------------------------------------
  // cyrb53-style string hash -> 32-bit seed, then mulberry32.
  function hashString(str) {
    var h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }

  function rng(seed) {
    var a = seed >>> 0;
    var f = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.state = function () { return a; };
    return f;
  }

  // ---- dates ------------------------------------------------------------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayNumber(key) {
    // whole days between EPOCH and key, both read as UTC midnights; #1 on EPOCH
    var p = key.split('-'), e = EPOCH.split('-');
    var a = Date.UTC(+p[0], +p[1] - 1, +p[2]), b = Date.UTC(+e[0], +e[1] - 1, +e[2]);
    return Math.round((a - b) / 86400000) + 1;
  }
  function prevKey(key) {
    var p = key.split('-');
    var t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) - 86400000);
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }

  // ---- pieces -----------------------------------------------------------
  // Each shape is a list of [row, col] cells. Weight = relative chance.
  var SHAPES = [];
  function norm(cells) {
    var r0 = Infinity, c0 = Infinity;
    cells.forEach(function (p) { r0 = Math.min(r0, p[0]); c0 = Math.min(c0, p[1]); });
    var out = cells.map(function (p) { return [p[0] - r0, p[1] - c0]; });
    out.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return out;
  }
  function rot(cells) { return norm(cells.map(function (p) { return [p[1], -p[0]]; })); }
  function key(cells) { return cells.map(function (p) { return p.join(','); }).join(';'); }
  function addAll(name, base, weight, mirror) {
    var seen = {}, variants = [], c = norm(base);
    var sets = [c];
    if (mirror) sets.push(norm(c.map(function (p) { return [p[0], -p[1]]; })));
    sets.forEach(function (s) {
      for (var i = 0; i < 4; i++) {
        var k = key(s);
        if (!seen[k]) { seen[k] = 1; variants.push(s); }
        s = rot(s);
      }
    });
    variants.forEach(function (v) { SHAPES.push({ name: name, cells: v, w: weight / variants.length }); });
  }
  addAll('dot', [[0, 0]], 3);
  addAll('i2', [[0, 0], [0, 1]], 6);
  addAll('i3', [[0, 0], [0, 1], [0, 2]], 7);
  addAll('v3', [[0, 0], [1, 0], [1, 1]], 7);
  addAll('i4', [[0, 0], [0, 1], [0, 2], [0, 3]], 7);
  addAll('o4', [[0, 0], [0, 1], [1, 0], [1, 1]], 7);
  addAll('t4', [[0, 0], [0, 1], [0, 2], [1, 1]], 6);
  addAll('s4', [[0, 1], [0, 2], [1, 0], [1, 1]], 5, true);
  addAll('l4', [[0, 0], [1, 0], [2, 0], [2, 1]], 7, true);
  addAll('i5', [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], 4);
  addAll('r6', [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]], 4);
  addAll('l5', [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], 4);
  addAll('o9', [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], 3);
  var TOTAL_W = SHAPES.reduce(function (s, p) { return s + p.w; }, 0);
  var COLORS = 7;

  function pickShape(rand) {
    var x = rand() * TOTAL_W;
    for (var i = 0; i < SHAPES.length; i++) { x -= SHAPES[i].w; if (x < 0) return i; }
    return SHAPES.length - 1;
  }
  // Level piece pools: bias > 0 favours big pieces (hard levels), bias < 0 small friendly ones (easy levels and
  // the silent help after repeated fails). Each shape's weight is multiplied by exp(bias * (cells - 4)).
  // bias 0 (endless, daily) keeps the plain pool and the exact RNG stream the ranking server replays.
  var BIAS_W = {};
  function biasWeights(bias) {
    var k = bias.toFixed(3);
    if (BIAS_W[k]) return BIAS_W[k];
    var w = SHAPES.map(function (s) { return s.w * Math.exp(bias * (s.cells.length - 4)); });
    var tot = w.reduce(function (a, v) { return a + v; }, 0);
    return (BIAS_W[k] = { w: w, tot: tot });
  }
  function pickShapeBiased(rand, bias) {
    var b = biasWeights(bias), x = rand() * b.tot;
    for (var i = 0; i < SHAPES.length; i++) { x -= b.w[i]; if (x < 0) return i; }
    return SHAPES.length - 1;
  }
  function makePiece(rand, bias) {
    var s = bias ? pickShapeBiased(rand, bias) : pickShape(rand);
    return { shape: s, cells: SHAPES[s].cells, color: Math.floor(rand() * COLORS), used: false };
  }
  function makeTray(rand, bias) {
    var t = [];
    for (var i = 0; i < TRAY; i++) t.push(makePiece(rand, bias));
    return t;
  }

  // ---- board ------------------------------------------------------------
  // board: flat array N*N, -1 empty, else color index
  function emptyBoard() { var b = []; for (var i = 0; i < N * N; i++) b.push(-1); return b; }

  function canPlace(board, cells, r, c) {
    for (var i = 0; i < cells.length; i++) {
      var rr = r + cells[i][0], cc = c + cells[i][1];
      if (rr < 0 || cc < 0 || rr >= N || cc >= N) return false;
      if (board[rr * N + cc] !== -1) return false;
    }
    return true;
  }

  function fitsAnywhere(board, cells) {
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (canPlace(board, cells, r, c)) return true;
    return false;
  }

  // rows/cols that would be complete after placing cells at r,c (board unchanged)
  function linesAfter(board, cells, r, c) {
    var b = board.slice();
    cells.forEach(function (p) { b[(r + p[0]) * N + c + p[1]] = 0; });
    return fullLines(b);
  }

  function fullLines(b) {
    var rows = [], cols = [];
    for (var i = 0; i < N; i++) {
      var rf = true, cf = true;
      for (var j = 0; j < N; j++) {
        if (b[i * N + j] === -1) rf = false;
        if (b[j * N + i] === -1) cf = false;
      }
      if (rf) rows.push(i);
      if (cf) cols.push(i);
    }
    return { rows: rows, cols: cols };
  }

  function clearScore(lines, combo) {
    // lines cleared at once: 1 -> 10, 2 -> 30, 3 -> 60, 4 -> 100 ...; x combo step
    if (!lines) return 0;
    return 10 * lines * (lines + 1) / 2 * (1 + combo);
  }

  // ---- game -------------------------------------------------------------
  // opts: { seed: number, daily: bool, level: levelDef }
  //   levelDef (see levels.js): { id, seed, goal: {type: 'lines'|'gems'|'score', target}, moves,
  //                              board: flat N*N (-1 empty, 0..6 colour, STONE), gems: flat N*N (1 = gem on that cell) }
  var STONE = 7;
  var BOOSTERS = ['rotate', 'bomb', 'undo', 'shuffle'];

  function Game(opts) {
    this.daily = !!opts.daily;
    this.seed = opts.seed >>> 0;
    this.rand = rng(this.seed);
    this.board = emptyBoard();
    this.gems = null;      // level only: flat N*N, 1 where a gem sits
    this.level = null;
    this.score = 0;
    this.combo = 0;        // consecutive clear-streak level (0 = none)
    this.sinceClear = 0;   // placements since the last clear
    this.trayNo = 0;       // trays dealt so far
    this.moves = 0;
    this.lines = 0;
    this.gemsGot = 0;
    this.trayLog = [];     // per tray: lines cleared during it (daily share string)
    this.over = false;
    this.done = false;     // daily finished all trays
    this.won = false;      // level goal reached
    this.stuck = false;    // over because nothing fits
    this.outOfMoves = false;
    this.continued = false;
    this.boostersUsed = 0;
    this._undo = null;
    if (opts.level) {
      var L = opts.level;
      this.level = { id: L.id, goal: { type: L.goal.type, target: L.goal.target }, moves: L.moves };
      if (L.bias) this.level.bias = L.bias;   // piece pool (levels.js tier lever)
      if (L.help) this.level.help = 1;        // silent help after 3+ fails in a row (levels.forAttempt)
      if (L.difficulty) this.level.difficulty = L.difficulty;
      this.seed = (L.seed >>> 0) || this.seed;
      this.rand = rng(this.seed);
      this.board = L.board.slice();
      this.gems = L.gems ? L.gems.slice() : emptyBoard().map(function () { return 0; });
      this.movesLeft = L.moves;
    }
    this.deal();
  }

  Game.prototype._bias = function () { return (this.level && this.level.bias) || 0; };
  Game.prototype.deal = function () {
    var bias = this._bias();
    this.tray = makeTray(this.rand, bias);
    // endless and levels are a little kinder: re-roll (up to 3 times) a tray where nothing fits.
    // The daily stays a pure function of the date so everyone gets the same pieces.
    // Levels go further (their fails should come from the move limit, not from a bad refill): re-roll until every
    // piece of the new tray fits somewhere (3 tries).
    if (this.level && this.level.help) {
      // silent help (levels.forAttempt, after repeated fails): the same 3 re-rolls also look for a tray where
      // one piece completes a line
      var best = this.tray, bestV = -1;
      for (var h = 0; h <= 3; h++) {
        if (h) this.tray = makeTray(this.rand, bias);
        var v = this.fitCount() * 2 + (this.canClear() ? 1 : 0);
        if (v > bestV) { bestV = v; best = this.tray; }
        if (v === TRAY * 2 + 1) break;
      }
      this.tray = best;
    } else if (this.level) {
      for (var t = 0; t < 3 && this.fitCount() < TRAY; t++) this.tray = makeTray(this.rand, bias);
    } else {
      for (var k = 0; !this.daily && k < 3 && !this.anyFits(); k++) this.tray = makeTray(this.rand, bias);
    }
    this.trayNo++;
    this.trayLog.push(0);
  };
  // can some unused tray piece complete a row or column right now?
  Game.prototype.canClear = function () {
    for (var i = 0; i < this.tray.length; i++) {
      var p = this.tray[i];
      if (p.used) continue;
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
        if (!canPlace(this.board, p.cells, r, c)) continue;
        var l = linesAfter(this.board, p.cells, r, c);
        if (l.rows.length || l.cols.length) return true;
      }
    }
    return false;
  };
  Game.prototype.fitCount = function () {
    var self = this;
    return this.tray.filter(function (p) { return !p.used && fitsAnywhere(self.board, p.cells); }).length;
  };

  Game.prototype.canPlace = function (i, r, c) {
    var p = this.tray[i];
    return !!p && !p.used && !this.over && canPlace(this.board, p.cells, r, c);
  };

  Game.prototype.goalProgress = function () {
    if (!this.level) return null;
    var g = this.level.goal;
    var have = g.type === 'lines' ? this.lines : g.type === 'gems' ? this.gemsGot : this.score;
    return { type: g.type, have: Math.min(have, g.target), target: g.target, movesLeft: this.movesLeft };
  };

  // 1..3 stars on a win, by the share of moves left (same rule for every goal type)
  function starsFor(movesLeft, moves) {
    var f = moves ? movesLeft / moves : 0;
    return f >= 0.3 ? 3 : f >= 0.12 ? 2 : 1;
  }

  // remove cells (a list of indices) from the board; returns [{i, color, gem}]
  Game.prototype._wipe = function (idx) {
    var self = this, out = [];
    idx.forEach(function (k) {
      if (self.board[k] === -1) return;
      var gem = self.gems && self.gems[k] ? 1 : 0;
      out.push({ i: k, color: self.board[k], gem: gem });
      self.board[k] = -1;
      if (gem) { self.gems[k] = 0; self.gemsGot++; }
    });
    return out;
  };

  // after any board change: level win / fail, stuck
  Game.prototype._settle = function () {
    if (this.level && !this.won) {
      var p = this.goalProgress();
      if (p.have >= p.target) { this.won = true; this.over = true; this.stars = starsFor(this.movesLeft, this.level.moves); }
      else if (this.movesLeft <= 0) { this.over = true; this.outOfMoves = true; }
    }
    if (!this.over && !this.anyFits()) { this.over = true; this.stuck = true; }
  };

  // place tray piece i with its top-left at (r, c). Returns a result object or null if illegal.
  Game.prototype.place = function (i, r, c) {
    if (!this.canPlace(i, r, c)) return null;
    if (!this.daily) this._undo = this.toJSON();
    var p = this.tray[i], self = this;
    p.cells.forEach(function (q) { self.board[(r + q[0]) * N + c + q[1]] = p.color; });
    p.used = true;
    // daily: compact move log (tray index, row, col) so the ranking server can replay the game
    if (this.daily) (this.mlog = this.mlog || []).push(i * 64 + r * 8 + c);
    this.moves++;
    if (this.level) this.movesLeft--;
    var placed = p.cells.length;
    var fl = fullLines(this.board);
    var n = fl.rows.length + fl.cols.length;
    var cleared = [];
    if (n) {
      var mark = {};
      fl.rows.forEach(function (rr) { for (var j = 0; j < N; j++) mark[rr * N + j] = 1; });
      fl.cols.forEach(function (cc) { for (var j = 0; j < N; j++) mark[j * N + cc] = 1; });
      cleared = this._wipe(Object.keys(mark).map(Number));
      this.combo = this.sinceClear < 3 && this.lastClearMove ? this.combo + 1 : 0;
      this.lastClearMove = this.moves;
      this.sinceClear = 0;
      this.lines += n;
      this.trayLog[this.trayLog.length - 1] += n;
      if (this.combo >= 2) this.combo3 = (this.combo3 || 0) + 1; // 'combo x3 or better' quest metric
    } else {
      this.sinceClear++;
      if (this.sinceClear >= 3) { this.combo = 0; this.lastClearMove = 0; }
    }
    var pts = placed + clearScore(n, this.combo);
    var allClear = n > 0 && this.board.every(function (v) { return v === -1; });
    if (allClear) pts += 300;
    this.score += pts;

    var dealt = false;
    if (this.tray.every(function (t) { return t.used; })) {
      if (this.daily && this.trayNo >= DAILY_TRAYS) { this.done = true; this.over = true; }
      else { this.deal(); dealt = true; }
    }
    this._settle();
    return { r: r, c: c, cells: p.cells, color: p.color, placed: placed, rows: fl.rows, cols: fl.cols,
      lines: n, cleared: cleared, gems: cleared.filter(function (x) { return x.gem; }).length,
      combo: n ? this.combo : 0, points: pts, allClear: allClear, dealt: dealt,
      over: this.over, done: this.done, won: this.won, stars: this.stars || 0 };
  };

  // ---- boosters (never in the daily: everyone plays the same puzzle) -----
  // Usable while playing, and also when the game is over only because nothing fits.
  Game.prototype.canBoost = function () {
    return !this.daily && !this.won && !this.outOfMoves && (!this.over || this.stuck);
  };
  Game.prototype._afterBoost = function () {
    this.boostersUsed++;
    if (this.stuck) { this.over = false; this.stuck = false; }
    this._settle();
  };
  // rotate tray piece i a quarter turn clockwise
  Game.prototype.rotate = function (i) {
    var p = this.tray[i];
    if (!this.canBoost() || !p || p.used) return false;
    var cells = rot(p.cells), k = key(cells);
    if (k === key(p.cells)) return false; // dot, square: nothing to rotate
    for (var s = 0; s < SHAPES.length; s++) if (key(SHAPES[s].cells) === k) { p.shape = s; break; }
    p.cells = cells;
    this._afterBoost();
    return { i: i, cells: cells };
  };
  // clear the 3x3 block centred on (r, c); gems inside count, no line points
  Game.prototype.bomb = function (r, c) {
    if (!this.canBoost() || r < 0 || c < 0 || r >= N || c >= N) return false;
    var idx = [];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < N && cc < N) idx.push(rr * N + cc);
    }
    this._undo = null;
    var cleared = this._wipe(idx);
    this.score += cleared.length;
    this._afterBoost();
    return { r: r, c: c, cleared: cleared, gems: cleared.filter(function (x) { return x.gem; }).length, won: this.won };
  };
  // new pieces for the unused tray slots
  Game.prototype.shuffle = function () {
    if (!this.canBoost()) return false;
    var self = this;
    for (var k = 0; k < 4; k++) {
      this.tray.forEach(function (p, i) { if (!p.used) self.tray[i] = makePiece(self.rand, self._bias()); });
      if (this.anyFits()) break;
    }
    this._undo = null;
    this._afterBoost();
    return true;
  };
  // take back the last placement (one step)
  Game.prototype.canUndo = function () { return !!this._undo && !this.daily && !this.won; };
  Game.prototype.undo = function () {
    if (!this.canUndo()) return false;
    var g = Game.restore(this._undo), keep = this.boostersUsed + 1, cont = this.continued;
    for (var k in g) if (Object.prototype.hasOwnProperty.call(g, k)) this[k] = g[k];
    this.boostersUsed = keep;
    this.continued = cont;
    this._undo = null;
    return true;
  };

  // save / restore (the RNG continues exactly where it was: mulberry32 state is its seed)
  var FIELDS = ['daily', 'seed', 'board', 'score', 'combo', 'sinceClear', 'lastClearMove', 'trayNo', 'moves', 'lines',
    'trayLog', 'over', 'done', 'continued', 'level', 'gems', 'gemsGot', 'movesLeft', 'won', 'stuck', 'outOfMoves',
    'stars', 'boostersUsed', 'combo3', 'mlog'];
  // daily move log as 2 hex chars per placement: tray * 64 + row * 8 + col
  Game.prototype.moveLog = function () {
    return (this.mlog || []).map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  };
  Game.prototype.toJSON = function () {
    var o = { v: 2, rs: this.rand.state() }, self = this;
    FIELDS.forEach(function (k) {
      var v = self[k];
      o[k] = Array.isArray(v) ? v.slice() : v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    });
    o.tray = this.tray.map(function (p) { return { s: p.shape, c: p.color, u: p.used }; });
    return o;
  };
  Game.restore = function (o) {
    if (!o || (o.v !== 1 && o.v !== 2) || !o.board || o.board.length !== N * N) return null;
    var g = Object.create(Game.prototype);
    FIELDS.forEach(function (k) {
      var v = o[k];
      g[k] = Array.isArray(v) ? v.slice() : v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    });
    g.lastClearMove = g.lastClearMove || 0;
    g.gemsGot = g.gemsGot || 0;
    g.boostersUsed = g.boostersUsed || 0;
    g.level = g.level || null;
    g.gems = g.gems || null;
    g._undo = null;
    g.rand = rng(o.rs);
    g.tray = o.tray.map(function (t) { return { shape: t.s, cells: SHAPES[t.s].cells, color: t.c, used: t.u }; });
    return g;
  };

  Game.prototype.anyFits = function () {
    var self = this;
    return this.tray.some(function (p) { return !p.used && fitsAnywhere(self.board, p.cells); });
  };

  // rewarded continue, once per game, never in the daily.
  //   level out of moves -> +5 moves; otherwise wipe the two fullest rows and columns, re-deal if still stuck
  Game.prototype.revive = function () {
    if (this.daily || this.continued || this.won || !this.over) return false;
    this.continued = true;
    if (this.outOfMoves) {
      this.movesLeft += 5;
      this.outOfMoves = false;
      this.over = false;
      if (!this.anyFits()) this.stuck = true;
    }
    if (this.stuck || !this.level) {
      var b = this.board, rows = [], cols = [];
      for (var i = 0; i < N; i++) {
        var rc = 0, cc = 0;
        for (var j = 0; j < N; j++) { if (b[i * N + j] !== -1) rc++; if (b[j * N + i] !== -1) cc++; }
        rows.push([rc, i]); cols.push([cc, i]);
      }
      rows.sort(function (a, z) { return z[0] - a[0]; });
      cols.sort(function (a, z) { return z[0] - a[0]; });
      var idx = [];
      [rows[0][1], rows[1][1]].forEach(function (rr) { for (var j = 0; j < N; j++) idx.push(rr * N + j); });
      [cols[0][1], cols[1][1]].forEach(function (cc) { for (var j = 0; j < N; j++) idx.push(j * N + cc); });
      this._wipe(idx);
      this.over = false;
      this.stuck = false;
      var tries = 0;
      while (!this.anyFits() && tries++ < 20) { this.tray = makeTray(this.rand, this._bias()); }
    }
    this._undo = null;
    this._settle();
    return true;
  };

  // Wordle-style result: one square per tray, colour by lines cleared in it
  function shareGrid(trayLog, total) {
    var out = '';
    for (var i = 0; i < total; i++) {
      var n = trayLog[i];
      var sq = n === undefined ? '⬛' : n === 0 ? '⬜' : n === 1 ? '🟨' : n === 2 ? '🟧' : '🟥';
      out += sq;
      if (i % 6 === 5 && i < total - 1) out += '\n';
    }
    return out;
  }

  function shareText(g, dateKeyStr) {
    var head = 'Teselo #' + dayNumber(dateKeyStr) + ' · ' + g.score + (g.done ? ' ✔' : ' ✖');
    return head + '\n' + shareGrid(g.trayLog, DAILY_TRAYS);
  }

  // streak bookkeeping: rec = {last: 'YYYY-MM-DD', streak: n, best: n}
  function bumpStreak(rec, today) {
    rec = rec || { last: '', streak: 0, best: 0 };
    if (rec.last === today) return rec;
    var streak = rec.last === prevKey(today) ? rec.streak + 1 : 1;
    return { last: today, streak: streak, best: Math.max(rec.best || 0, streak) };
  }
  function liveStreak(rec, today) {
    if (!rec) return 0;
    return rec.last === today || rec.last === prevKey(today) ? rec.streak : 0;
  }

  var Core = {
    N: N, TRAY: TRAY, DAILY_TRAYS: DAILY_TRAYS, EPOCH: EPOCH, SHAPES: SHAPES, COLORS: COLORS, STONE: STONE,
    BOOSTERS: BOOSTERS, starsFor: starsFor, rot: rot,
    hashString: hashString, rng: rng, dateKey: dateKey, dayNumber: dayNumber, prevKey: prevKey,
    emptyBoard: emptyBoard, canPlace: canPlace, fitsAnywhere: fitsAnywhere, fullLines: fullLines,
    linesAfter: linesAfter, clearScore: clearScore, makeTray: makeTray, makePiece: makePiece, Game: Game,
    dailySeed: function (key) { return hashString('teselo:' + key); },
    shareGrid: shareGrid, shareText: shareText, bumpStreak: bumpStreak, liveStreak: liveStreak
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.TeseloCore = Core;
})(this);

/* ---- game/levels.js ---- */
/* Teselo adventure levels.
 *
 * A level is { id, seed, goal: {type, target}, moves, board, gems, par, bias, difficulty }:
 *   goal.type   'lines' clear N rows/columns | 'gems' collect every gem (gems sit on stone tiles) | 'score' reach N points
 *   moves       placements allowed; stars come from the share of moves left (core.starsFor)
 *   board       flat N*N: -1 empty, core.STONE pre-filled stone (clears like any tile)
 *   bias        piece pool lever (core.makePiece): < 0 small friendly pieces, > 0 big awkward ones
 *   difficulty  'facil' | 'normal' | 'dificil' | 'superdificil' (tierOf: Candy Crush style sawtooth, see below)
 *   seed        the first attempt's piece sequence. The reference greedy bot wins it within `moves` (par = its
 *               moves), so every level is proven winnable without boosters. Retries get a new sequence
 *               (forAttempt), so a level's fail rate is statistical, like a match-3 board refill.
 *
 * Difficulty curve (gamekit/PSYCH-PROGRESS.md, shared contract): 1-9 facil onboarding (one new thing at a time:
 * lines, stones, gems, score goals), 10 the first dificil, then 15-level cycles: boss superdificil at 25, 40, 55...
 * dificil at boss+5 and boss+10, facil relief after each dificil and twice after a boss, normal ramping between.
 * Levers per tier: stones on the board, goal size, piece pool bias, and the move limit. The move limit is
 * calibrated per level by tools/tune-levels.js: a human-ish bot (softmax over the greedy bot's move scores,
 * temperature HUMAN_T, calibrated once on the daily's typical human score) plays each candidate a few hundred
 * times and the limit is set where its first-try fail rate meets the tier target. The result is the TUNED table
 * below (generated: re-run the tool after any generator change, and bump GEN_VERSION; progress is keyed by id).
 *
 * Levels 1..HAND.length are handcrafted (ASCII boards below), the rest are generated from the level number.
 * Past the tuned table the generator falls back to the greedy bot's par times a tier slack.
 */
(function (root) {
  'use strict';
  var C = root.TeseloCore || (typeof require === 'function' ? require('./core.js') : null);
  var N = C.N, STONE = C.STONE;
  var COUNT = 150;
  var GEN_VERSION = 2;
  // human-ish bot temperature: at 0.5 its mean daily score is ~430, the typical human daily the CPU rivals use
  // (config ranking.botScore.daily mean 430). The greedy bot scores ~670. (node tools/tune-levels.js --calibrate)
  var HUMAN_T = 0.5;
  var HELP_AFTER = 3;   // consecutive fails before the silent help

  // ---- difficulty schedule ------------------------------------------------
  var TIERS = ['facil', 'normal', 'dificil', 'superdificil'];
  function tierOf(n) {
    if (n <= 9) return 'facil';
    var k = n - 10, cyc = Math.floor(k / 15), pos = k % 15;   // pos 0: 10, 25, 40 ...
    if (pos === 0) return cyc === 0 ? 'dificil' : 'superdificil';
    if (pos === 5 || pos === 10) return 'dificil';
    if (pos === 6 || pos === 11 || pos === 1) return 'facil';
    if (pos === 2 && cyc > 0) return 'facil';                 // second relief level after a boss
    return 'normal';
  }
  // first-try fail target for the human-ish bot; normal ramps inside the cycle toward the boss
  function failTarget(n) {
    var t = tierOf(n);
    if (t === 'facil') return 0.04;
    if (t === 'dificil') return 0.52;
    if (t === 'superdificil') return 0.72;
    var pos = (n - 10) % 15;
    return 0.16 + 0.13 * Math.max(0, pos - 2) / 12;
  }
  var BIAS = { facil: -0.2, normal: 0, dificil: 0.12, superdificil: 0.2 };

  // '.' empty  '#' stone  '*' stone with a gem.  Onboarding: lines, then stones, then gems, then score goals.
  var HAND = [
    { goal: { type: 'lines', target: 2 }, board: [
      '........', '........', '........', '........', '........', '........', '........', '........'] },
    { goal: { type: 'lines', target: 3 }, board: [
      '........', '........', '........', '........', '........', '........', '........', '........'] },
    { goal: { type: 'lines', target: 3 }, board: [
      '........', '........', '........', '##.##.##', '........', '........', '........', '........'] },
    { goal: { type: 'lines', target: 4 }, board: [
      '........', '........', '#......#', '#......#', '#......#', '#......#', '........', '........'] },
    { goal: { type: 'gems', target: 0 }, board: [
      '........', '........', '..*..*..', '........', '........', '..*..*..', '........', '........'] },
    { goal: { type: 'gems', target: 0 }, board: [
      '........', '........', '##*..*##', '........', '........', '##*..*##', '........', '........'] },
    { goal: { type: 'score', target: 160 }, board: [
      '........', '........', '........', '........', '........', '........', '........', '........'] },
    { goal: { type: 'score', target: 180 }, board: [
      '........', '........', '........', '...##...', '...##...', '........', '........', '........'] },
    { goal: { type: 'lines', target: 5 }, board: [
      '........', '.######.', '........', '........', '........', '........', '.######.', '........'] }
  ];

  function parse(rows) {
    var board = [], gems = [];
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var ch = rows[r].charAt(c);
      board.push(ch === '#' || ch === '*' ? STONE : -1);
      gems.push(ch === '*' ? 1 : 0);
    }
    return { board: board, gems: gems };
  }

  function countGems(g) { return g.reduce(function (s, v) { return s + v; }, 0); }

  // ---- bots -----------------------------------------------------------------
  // Move score (goal aware): lines * 10 + piece size * 0.4 + gems in cleared lines * 6 + 0.3 per side touching a
  // wall or a tile (fewer isolated holes). Fast: line checks use row/column fill counts.
  var PIECE_INFO = {};
  function pieceInfo(cells) {
    var k = cells.map(function (p) { return p[0] + ',' + p[1]; }).join(';');
    if (PIECE_INFO[k]) return PIECE_INFO[k];
    var h = 0, w = 0, rows = {}, cols = {};
    cells.forEach(function (p) {
      h = Math.max(h, p[0] + 1); w = Math.max(w, p[1] + 1);
      rows[p[0]] = (rows[p[0]] || 0) + 1; cols[p[1]] = (cols[p[1]] || 0) + 1;
    });
    var ro = Object.keys(rows).map(Number), co = Object.keys(cols).map(Number);
    return (PIECE_INFO[k] = { h: h, w: w, ro: ro, rc: ro.map(function (r) { return rows[r]; }),
      co: co, cc: co.map(function (c) { return cols[c]; }) });
  }
  // calls fn(score, trayIndex, r, c) for every legal placement
  function eachMove(g, fn) {
    var b = g.board, gemsGoal = !!(g.level && g.level.goal.type === 'gems' && g.gems);
    var rowF = [], colF = [], gemR = [], gemC = [], i, j;
    for (i = 0; i < N; i++) { rowF[i] = 0; colF[i] = 0; gemR[i] = 0; gemC[i] = 0; }
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
      if (b[i * N + j] !== -1) { rowF[i]++; colF[j]++; }
      if (gemsGoal && g.gems[i * N + j]) { gemR[i]++; gemC[j]++; }
    }
    var others = g.tray.filter(function (p) { return !p.used; }).length > 1;
    g.tray.forEach(function (p, ti) {
      if (p.used) return;
      var cells = p.cells, inf = pieceInfo(cells), base = cells.length * 0.4;
      for (var r = 0; r + inf.h <= N; r++) for (var c = 0; c + inf.w <= N; c++) {
        var ok = true, q, k;
        for (k = 0; k < cells.length; k++) { q = cells[k]; if (b[(r + q[0]) * N + c + q[1]] !== -1) { ok = false; break; } }
        if (!ok) continue;
        var s = base, lines = 0;
        for (k = 0; k < inf.ro.length; k++) if (rowF[r + inf.ro[k]] + inf.rc[k] === N) { lines++; s += gemR[r + inf.ro[k]] * 6; }
        for (k = 0; k < inf.co.length; k++) if (colF[c + inf.co[k]] + inf.cc[k] === N) { lines++; s += gemC[c + inf.co[k]] * 6; }
        s += lines * 10;
        for (k = 0; k < cells.length; k++) {
          var rr = r + cells[k][0], cc = c + cells[k][1];
          if (rr === 0 || b[(rr - 1) * N + cc] !== -1) s += 0.3;
          if (rr === N - 1 || b[(rr + 1) * N + cc] !== -1) s += 0.3;
          if (cc === 0 || b[rr * N + cc - 1] !== -1) s += 0.3;
          if (cc === N - 1 || b[rr * N + cc + 1] !== -1) s += 0.3;
          if (gemsGoal) { if (gemR[rr]) s += 0.6; if (gemC[cc]) s += 0.6; }   // aim at the gems' rows and columns
        }
        // keep the rest of the tray placeable (what a player checks before dropping a piece)
        if (others) s -= 8 * blocked(b, cells, r, c, inf, rowF, colF, g.tray, ti);
        fn(s, ti, r, c);
      }
    });
  }
  // how many other unused tray pieces would not fit after placing cells at (r, c) and clearing the lines
  var TMP = [];
  function blocked(b, cells, r, c, inf, rowF, colF, tray, ti) {
    var k, i, j;
    for (k = 0; k < N * N; k++) TMP[k] = b[k];
    for (k = 0; k < cells.length; k++) TMP[(r + cells[k][0]) * N + c + cells[k][1]] = 0;
    for (k = 0; k < inf.ro.length; k++) if (rowF[r + inf.ro[k]] + inf.rc[k] === N) { i = r + inf.ro[k]; for (j = 0; j < N; j++) TMP[i * N + j] = -2; }
    for (k = 0; k < inf.co.length; k++) if (colF[c + inf.co[k]] + inf.cc[k] === N) { j = c + inf.co[k]; for (i = 0; i < N; i++) TMP[i * N + j] = -2; }
    var n = 0;
    for (k = 0; k < tray.length; k++) {
      if (k === ti || tray[k].used) continue;
      if (!fitsFree(TMP, tray[k].cells)) n++;
    }
    return n;
  }
  function fitsFree(t, cells) {
    var inf = pieceInfo(cells);
    for (var r = 0; r + inf.h <= N; r++) for (var c = 0; c + inf.w <= N; c++) {
      var ok = true;
      for (var k = 0; k < cells.length; k++) if (t[(r + cells[k][0]) * N + c + cells[k][1]] >= 0) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }
  // reference bot: greedy, one ply
  function botMove(g) {
    var best = null, bs = -1e9;
    eachMove(g, function (s, i, r, c) { if (s > bs + 1e-9) { bs = s; best = [i, r, c]; } });
    return best;
  }
  // human-ish bot: softmax over the same scores (temperature t). Usually takes a line when one is there, but places
  // carelessly, and does not plan which tray piece goes first, like a casual player.
  var MV = [];
  function humanMove(g, rand, t) {
    t = t || HUMAN_T;
    var n = 0, mx = -1e9;
    eachMove(g, function (s, i, r, c) {
      var m = MV[n] || (MV[n] = [0, 0, 0, 0]);
      m[0] = s; m[1] = i; m[2] = r; m[3] = c; n++;
      if (s > mx) mx = s;
    });
    if (!n) return null;
    var tot = 0, k;
    for (k = 0; k < n; k++) { MV[k][0] = Math.exp((MV[k][0] - mx) / t); tot += MV[k][0]; }
    var x = rand() * tot;
    for (k = 0; k < n; k++) { x -= MV[k][0]; if (x <= 0) break; }
    k = Math.min(k, n - 1);
    return [MV[k][1], MV[k][2], MV[k][3]];
  }

  // play one game of a level def. opts: { seed, human: rand fn or null (greedy), t, cap }
  // -> { won, moves, stuck }. The move limit applies as in the real game unless def.moves is huge.
  function play(def, opts) {
    opts = opts || {};
    var g = new C.Game({ seed: 0, level: Object.assign({}, def, { seed: opts.seed != null ? opts.seed : def.seed }) });
    var guard = 0, cap = opts.cap || 400;
    while (!g.over && guard++ < cap) {
      var m = opts.human ? humanMove(g, opts.human, opts.t) : botMove(g);
      if (!m) break;
      g.place(m[0], m[1], m[2]);
    }
    return { won: g.won, moves: g.moves, stuck: !!g.stuck, game: g };
  }
  // play a level def with the greedy bot; returns moves used to win, or 0 if it fails
  function botSolve(def, cap) {
    var r = play(def, { cap: cap });
    return r.won ? r.moves : 0;
  }

  // ---- generator ----------------------------------------------------------
  function typeFor(n) { return ['lines', 'gems', 'score'][(n + Math.floor(n / 15)) % 3]; }

  function genBoard(rand, stones, gems) {
    var board = C.emptyBoard(), gm = board.map(function () { return 0; });
    var mirror = rand() < 0.7, tries = 0, placed = 0;
    while (placed < stones && tries++ < 400) {
      var r = Math.floor(rand() * N), c = Math.floor(rand() * (mirror ? N / 2 : N));
      var cells = [[r, c]];
      if (mirror) cells.push([r, N - 1 - c]);
      var ok = cells.every(function (p) { return board[p[0] * N + p[1]] === -1; });
      if (!ok) continue;
      cells.forEach(function (p) { board[p[0] * N + p[1]] = STONE; });
      var fl = C.fullLines(board);
      // never a full line at the start, and keep every row/column at most 6/8 full
      var crowded = false;
      for (var i = 0; i < N && !crowded; i++) {
        var rc = 0, cc = 0;
        for (var j = 0; j < N; j++) { if (board[i * N + j] !== -1) rc++; if (board[j * N + i] !== -1) cc++; }
        if (rc > 6 || cc > 6) crowded = true;
      }
      if (fl.rows.length || fl.cols.length || crowded) { cells.forEach(function (p) { board[p[0] * N + p[1]] = -1; }); continue; }
      placed += cells.length;
    }
    var filled = [];
    board.forEach(function (v, i) { if (v !== -1) filled.push(i); });
    for (var k = 0; k < gems && filled.length; k++) {
      var at = Math.floor(rand() * filled.length);
      gm[filled[at]] = 1;
      filled.splice(at, 1);
    }
    return { board: board, gems: gm };
  }

  // tier levers: stones on the board, goal size (lines / gems / score), piece bias. g = 0..1 over the map.
  var LEVERS = {
    facil:        { stones: [1, 3], lines: [3, 1], gems: [2, 1], score: [120, 40] },
    normal:       { stones: [5, 4], lines: [4, 3], gems: [3, 2], score: [180, 80] },
    dificil:      { stones: [8, 9], lines: [5, 6], gems: [4, 3], score: [220, 220] },
    superdificil: { stones: [9, 10], lines: [6, 6], gems: [4, 4], score: [240, 240] }
  };
  function make(n, variant) {
    var rand = C.rng(C.hashString('teselo-level:' + GEN_VERSION + ':' + n + ':' + variant));
    var g = Math.min(1, (n - 1) / 140), tier = tierOf(n), lv = LEVERS[tier];
    var type = typeFor(n);
    var stones = Math.round(lv.stones[0] + lv.stones[1] * g + rand() * 4);
    var gemCount = type === 'gems' ? Math.min(stones, Math.round(lv.gems[0] + lv.gems[1] * g + rand())) : 0;
    var bg = genBoard(rand, stones, gemCount);
    var target = type === 'lines' ? Math.round(lv.lines[0] + lv.lines[1] * g + rand() * 3)
      : type === 'gems' ? countGems(bg.gems)
        : Math.round((lv.score[0] + lv.score[1] * g + rand() * 40) / 10) * 10;
    if (type === 'gems' && !target) { type = 'lines'; target = Math.round(lv.lines[0] + lv.lines[1] * g); }
    return { id: n, goal: { type: type, target: target }, board: bg.board, gems: bg.gems };
  }

  function handDef(n) {
    var h = HAND[n - 1], b = parse(h.board);
    var target = h.goal.type === 'gems' ? countGems(b.gems) : h.goal.target;
    return { id: n, goal: { type: h.goal.type, target: target }, board: b.board, gems: b.gems };
  }

  // the level's shape without seed and moves (variant = generator attempt, the tool picks the best one)
  function base(n, variant) {
    var def = n <= HAND.length ? handDef(n) : make(n, variant || 0);
    def.difficulty = tierOf(n);
    def.bias = BIAS[def.difficulty];
    return def;
  }
  // candidate piece sequences of a level variant: the tool picks the first attempt's seed among them
  function seedFor(n, variant, j) { return C.hashString('teselo-seed:' + GEN_VERSION + ':' + n + ':' + variant + ':' + j); }

  // ---- tuned table (generated by tools/tune-levels.js; one entry per level: variant.seedIndex.moves.par) -----
  var TUNED =
    '0.0.13.8 0.0.17.13 0.0.15.11 0.0.18.11 0.0.46.16 0.0.9.2 0.0.29.19 0.0.30.18 0.0.20.14 5.0.20.10 1.0.26.18 5.0.17.16 ' +
    '1.0.16.7 0.0.22.21 3.0.19.10 3.0.23.13 3.0.17.13 2.0.18.10 5.0.22.15 1.1.19.16 1.0.28.11 4.0.20.20 3.0.16.13 4.0.20.4 ' +
    '0.1.21.21 1.0.22.12 0.0.32.7 4.0.23.15 1.0.23.17 1.0.19.16 0.0.16.9 4.0.23.8 5.0.22.19 0.0.19.15 3.0.30.19 5.0.27.17 ' +
    '0.0.17.16 2.0.24.13 1.0.21.19 5.4.17.16 0.0.43.10 3.0.29.18 4.0.16.15 2.0.24.12 4.1.21.18 0.0.22.10 0.0.24.22 0.0.16.13 ' +
    '1.0.19.8 5.0.22.16 4.0.21.14 1.0.22.8 0.0.22.16 1.0.19.17 1.1.10.10 5.0.24.13 1.0.21.13 0.1.34.13 2.0.27.24 1.1.22.13 ' +
    '1.0.28.17 5.0.21.17 0.0.23.14 0.0.24.19 3.0.19.18 2.0.25.10 1.0.23.20 4.0.18.14 1.1.23.13 0.0.24.14 5.0.20.14 0.0.37.16 ' +
    '1.0.28.16 4.0.19.14 3.0.24.22 5.0.19.11 3.0.17.10 0.1.27.19 0.0.19.16 4.0.17.10 4.0.28.19 0.0.22.20 5.0.17.13 1.0.23.19 ' +
    '1.2.21.19 0.0.25.7 5.0.26.11 4.0.25.22 0.0.83.15 3.0.25.20 3.0.20.10 5.0.25.22 5.0.22.16 2.0.26.13 2.0.24.16 2.0.21.12 ' +
    '4.0.21.11 0.0.26.15 5.1.24.17 2.5.19.16 3.0.26.14 0.0.22.15 2.0.55.19 5.0.30.14 0.2.19.18 1.0.27.16 1.0.25.18 5.0.26.12 ' +
    '3.0.25.16 0.0.26.22 4.0.28.16 3.0.33.20 0.0.23.18 0.0.11.4 5.1.22.16 0.0.25.16 3.0.31.9 2.0.31.13 5.0.25.17 1.0.34.30 ' +
    '4.0.22.8 0.0.31.17 0.0.25.20 4.0.24.20 0.1.28.22 0.0.26.22 1.0.23.17 1.0.28.19 0.0.28.17 2.0.31.24 1.0.55.13 5.0.28.19 ' +
    '4.0.28.19 0.0.53.11 2.0.30.25 3.0.23.9 4.0.31.17 1.0.21.16 2.0.22.9 0.0.30.17 1.0.19.11 4.0.21.13 4.0.25.17 3.1.24.17 ' +
    '3.1.31.28 4.0.28.19 2.0.25.12 5.0.23.7 5.0.36.16 5.0.16.10';
  var TABLE = [];
  function useTable(str) {   // tools: try a freshly tuned table before pasting it into TUNED
    TABLE = str ? str.trim().split(/\s+/).map(function (e) { return e.split('.').map(Number); }) : [];
    cache = {};
  }

  // fallback (no table entry): greedy par times a tier slack
  var SLACK = { facil: 1.8, normal: 1.4, dificil: 1.15, superdificil: 1.05 };

  var cache = {};
  function get(n) {
    n = Math.max(1, Math.floor(n));
    if (cache[n]) return cache[n];
    var def, row = TABLE[n - 1];
    if (row) {
      def = base(n, row[0]);
      def.seed = seedFor(n, row[0], row[1]);
      def.moves = row[2];
      def.par = row[3];
    } else {
      var par = 0;
      for (var v = 0; v < 8 && !par; v++) {
        def = base(n, v);
        for (var j = 0; j < 4 && !par; j++) {
          def.seed = seedFor(n, v, j);
          def.moves = 400;
          par = botSolve(def);
        }
      }
      if (!par) par = 40; // should not happen; tests check every level up to COUNT
      def.moves = Math.max(8, Math.ceil(par * SLACK[def.difficulty]));
      def.par = par;
    }
    cache[n] = def;
    return def;
  }

  // The def for one attempt. tries = attempts already started on this level (0 = first try: the proven seed),
  // fails = consecutive fails (P.progress.fails). After HELP_AFTER fails in a row the attempt is silently a bit
  // kinder: each new tray is re-rolled (up to 6 times) toward one where every piece fits and one of them completes
  // a line (core Game.deal). Same board, goal, moves and piece pool (smaller pieces were tried: under a move limit
  // they make levels harder). Nothing on screen changes; it cuts the human-ish bot's fail rate by about a third
  // (tools/curve.js "help on"), so the level still bites and boosters keep their value.
  function forAttempt(n, tries, fails) {
    var def = get(n);
    tries = Math.max(0, tries | 0);
    var out = Object.assign({}, def);
    if (tries > 0) out.seed = C.hashString('teselo-try:' + n + ':' + def.seed + ':' + tries);
    if ((fails | 0) >= HELP_AFTER) out.help = 1;
    return out;
  }

  // the map shows chapters of 15 levels; each chapter gets a board tint in the UI
  function chapterOf(n) { return Math.floor((n - 1) / 15); }

  var Levels = { COUNT: COUNT, GEN_VERSION: GEN_VERSION, HAND: HAND, TIERS: TIERS, HUMAN_T: HUMAN_T, HELP_AFTER: HELP_AFTER,
    get: get, base: base, seedFor: seedFor, forAttempt: forAttempt, tierOf: tierOf, failTarget: failTarget,
    parse: parse, botSolve: botSolve, botMove: botMove, humanMove: humanMove, play: play, chapterOf: chapterOf,
    useTable: useTable, tuned: function () { return TABLE.length; } };
  useTable(TUNED);
  if (typeof module !== 'undefined' && module.exports) module.exports = Levels;
  else root.TeseloLevels = Levels;
})(this);

/* ---- game/config.js ---- */
/* Teselo's game config: the part of the economy that is specific to this game.
 * Merged over the platform defaults (src/economy/config.js) at boot. See src/PLATFORM.md.
 */
(function (root) {
  'use strict';
  var GAME = {
    game: { id: 'teselo', title: 'Teselo' },
    platform: { epoch: '2026-10-26' },

    // economy v2 (MONETIZATION.md addendum B): endless pays 1 coin per 200 points, the daily 10 + 1 per 200
    coins: { modes: { endless: { base: 0, per100: 0.5 }, daily: { base: 10, per100: 0.5 } } },

    boosters: {
      start: { rotate: 1, bomb: 2, undo: 2, shuffle: 1 },
      price: { rotate: 240, bomb: 320, undo: 200, shuffle: 280 }   // multiples of 20; coin packs are multiples of 200
    },

    skins: [
      { id: 'calm', kind: 'block', price: 0, tiles: null },  // null = theme default palette
      { id: 'sorbet', kind: 'block', price: 400, tiles: ['#f2a7a0', '#f6c89f', '#f7e3a3', '#bfe3b4', '#a9d6e5', '#c7b8ea', '#f0b6d5'] },
      { id: 'forest', kind: 'block', price: 700, tiles: ['#5b8c5a', '#8fb339', '#c9a227', '#a26a42', '#6d9dc5', '#3f7d6e', '#b5c99a'] },
      { id: 'ink', kind: 'block', price: 900, tiles: ['#3d5a80', '#98c1d9', '#ee6c4d', '#293241', '#7a9e9f', '#b8b8d1', '#e0a458'] },
      { id: 'neon', kind: 'block', iap: 'skin_neon', tiles: ['#00d1b2', '#ff3860', '#ffdd57', '#3273dc', '#b86bff', '#ff8a3d', '#23d160'] },
      { id: 'sunrise', kind: 'block', starterOnly: true, tiles: ['#f6a96b', '#f38d79', '#f7c873', '#e9757f', '#c98bb9', '#fbd38d', '#f4a3a3'] },
      { id: 'aurora', kind: 'block', passOnly: true, tiles: ['#5fd3bc', '#6fa8ff', '#b28dff', '#ff8fc7', '#7ee081', '#57c4e5', '#c4a1ff'] },
      { id: 'paper', kind: 'board', price: 0, board: null },
      { id: 'linen', kind: 'board', price: 300, board: { light: '#ece3d0', dark: '#2b2a26' } },
      { id: 'slate', kind: 'board', price: 500, board: { light: '#d9dee4', dark: '#1f252d' } },
      { id: 'moss', kind: 'board', passOnly: true, board: { light: '#dfe6d3', dark: '#20291f' } },
      // unlocked by player level (levelSkins below): shown in the level-up reveal, then in the shop as owned
      { id: 'meadow', kind: 'block', levelOnly: 6, tiles: ['#8cc084', '#f2c14e', '#7fb7be', '#f78154', '#b4a0e5', '#e98a9b', '#5d9c59'] },
      { id: 'dusk', kind: 'board', levelOnly: 12, board: { light: '#e4dce8', dark: '#241f2b' } }
    ],
    levelSkins: { 6: 'meadow', 12: 'dusk' },

    // CPU rivals that top up a thin daily ranking: typical score [mean, spread, max] of a daily (12 trays)
    ranking: { botScore: { daily: [430, 190, 1600] } },

    chests: { boosterOrder: ['undo', 'rotate', 'bomb'] },

    // quest metrics this game reports in its stats: lines pieces combo3 gems boosters (+ platform: games levels stars daily)
    quests: {
      daily: [
        { id: 'lines15', metric: 'lines', target: 15, reward: { coins: 12, xp: 25 } },
        { id: 'lines30', metric: 'lines', target: 30, reward: { coins: 20, xp: 35 } },
        { id: 'pieces60', metric: 'pieces', target: 60, reward: { coins: 12, xp: 25 } },
        { id: 'games3', metric: 'games', target: 3, reward: { coins: 12, xp: 25 } },
        { id: 'combo3', metric: 'combo3', target: 1, reward: { coins: 15, xp: 30 } },
        { id: 'levels2', metric: 'levels', target: 2, reward: { coins: 15, xp: 30 } },
        { id: 'stars5', metric: 'stars', target: 5, reward: { coins: 15, xp: 30 } },
        { id: 'daily1', metric: 'daily', target: 1, reward: { coins: 12, xp: 25 } },
        { id: 'gems8', metric: 'gems', target: 8, reward: { coins: 15, xp: 30 } },
        { id: 'booster1', metric: 'boosters', target: 1, reward: { coins: 8, xp: 20 } }
      ],
      weekly: [
        { id: 'w-lines200', metric: 'lines', target: 200, reward: { coins: 70, xp: 120 } },
        { id: 'w-levels12', metric: 'levels', target: 12, reward: { coins: 70, xp: 120 } },
        { id: 'w-daily5', metric: 'daily', target: 5, reward: { coins: 90, xp: 150 } },
        { id: 'w-stars30', metric: 'stars', target: 30, reward: { coins: 70, xp: 120 } },
        { id: 'w-games20', metric: 'games', target: 20, reward: { coins: 50, xp: 100 } },
        { id: 'w-combo15', metric: 'combo3', target: 15, reward: { coins: 70, xp: 120 } }
      ]
    },

    pass: {
      free: function (t) { return t % 10 === 0 ? { chest: 'silver' } : t % 5 === 0 ? { boosters: { undo: 1 } } : { coins: 15 }; },
      premium: function (t) {
        return t === 30 ? { skin: 'aurora' } : t === 15 ? { skin: 'moss' } : t % 5 === 0 ? { chest: 'gold' }
          : t % 3 === 0 ? { boosters: { bomb: 1, rotate: 1 } } : { coins: 80 };
      }
    },

    // appended to the platform products
    products: [
      { id: 'starter_pack', type: 'non_consumable', price: '1,99 €', offer: 'starter',
        grant: { coins: 1500, boosters: { rotate: 2, bomb: 2, undo: 2, shuffle: 2 }, skin: 'sunrise', noAdsDays: 7 } },
      // 9 boosters, worth 2,280 coins at shop prices: a bit more than coins_s (2,000) for the same 1,99 €
      { id: 'boosters_bundle', type: 'consumable', price: '1,99 €', grant: { boosters: { undo: 3, bomb: 3, rotate: 3 } } },
      { id: 'skin_neon', type: 'non_consumable', price: '1,99 €', grant: { skin: 'neon' } },
      // limited-time offers (gamekit meta/offers.js, MONETIZATION.md addendum D). Value claims are computed from these
      // contents vs the best regular coin pack (coins_l, 1,201 coins per euro); boosters count at their shop price.
      // league-up packs (first promotion to Plata / Oro+ / Esmeralda+), live 24 h
      { id: 'offer_silver', type: 'consumable', price: '1,99 €', offer: 'league', grant: { coins: 4000, boosters: { undo: 2, rotate: 2, shuffle: 2, bomb: 2 } } },
      { id: 'offer_gold', type: 'consumable', price: '4,99 €', offer: 'league', grant: { coins: 12000, boosters: { undo: 5, rotate: 5, shuffle: 5, bomb: 5 }, doubleHours: 2 } },
      { id: 'offer_diamond', type: 'consumable', price: '9,99 €', offer: 'league', grant: { coins: 28000, boosters: { undo: 10, rotate: 10, shuffle: 10, bomb: 10 }, doubleHours: 6 } },
      // weekend deal (Fri-Sun, every 2nd week)
      { id: 'offer_weekend', type: 'consumable', price: '2,99 €', offer: 'weekend', grant: { coins: 7000, boosters: { undo: 2, rotate: 2, shuffle: 2, bomb: 2 }, doubleHours: 2 } },
      // one-shot: the boosters_bundle contents for 0,99 € instead of 1,99 € (a true -50%), only in its popup
      { id: 'offer_oneshot_s', type: 'consumable', price: '0,99 €', offer: 'oneshot', sameAs: 'boosters_bundle', grant: { boosters: { undo: 3, bomb: 3, rotate: 3 } } }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = GAME;
  else root.TeseloGameConfig = GAME;
})(this);

/* ---- game/ui.js ---- */
/* Teselo game UI: board rendering, input, sound, game modes (adventure, daily, endless), result screen.
 * The game talks to the gamekit platform only through `P` (meta/platform.js) and `shell` (shell/shell.js);
 * see src/PLATFORM.md. Rules live in game/core.js, levels in game/levels.js, game economy in game/config.js.
 */
(function () {
  'use strict';
  const C = window.TeseloCore, N = C.N, Levels = window.TeseloLevels;
  const $ = (id) => document.getElementById(id);

  // ---------- game texts (platform texts live in the shell) ----------
  const GAME_TX = {
    en: { daily: 'Daily', endless: 'Endless', adventure: 'Adventure', over: 'No room left', done: 'Daily complete', again: 'Again',
      share: 'Share', copied: 'Copied', newBest: 'New best', combo: 'Combo', clean: 'Clean!', next: 'Next', nextLv: 'Next',
      level: 'Level', outMoves: 'Out of moves', quests: 'Quests', shop: 'Shop', cont: 'Continue',
      q: { lines: 'Clear {n} lines', pieces: 'Place {n} pieces', games: 'Play {n} games', combo3: 'Combo ×3 ({n})',
        levels: 'Win {n} levels', stars: 'Earn {n} stars', daily: 'Play the daily ({n})', gems: 'Collect {n} gems', boosters: 'Use {n} booster' },
      skins: { calm: 'Calm', sorbet: 'Sorbet', forest: 'Forest', ink: 'Ink', neon: 'Neon', sunrise: 'Sunrise', aurora: 'Aurora',
        paper: 'Paper', linen: 'Linen', slate: 'Slate', moss: 'Moss', meadow: 'Meadow', dusk: 'Dusk' },
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
    es: { daily: 'Diario', endless: 'Infinito', adventure: 'Aventura', over: 'Sin hueco', done: 'Diario completado', again: 'Otra',
      share: 'Compartir', copied: 'Copiado', newBest: 'Nuevo récord', combo: 'Combo', clean: '¡Limpio!', next: 'Siguiente', nextLv: 'Siguiente',
      level: 'Nivel', outMoves: 'Sin movimientos', quests: 'Misiones', shop: 'Tienda', cont: 'Seguir',
      q: { lines: 'Haz {n} líneas', pieces: 'Coloca {n} piezas', games: 'Juega {n} partidas', combo3: 'Combo ×3 ({n})',
        levels: 'Supera {n} niveles', stars: 'Gana {n} estrellas', daily: 'Juega el diario ({n})', gems: 'Recoge {n} gemas', boosters: 'Usa {n} ayuda' },
      skins: { calm: 'Calma', sorbet: 'Sorbete', forest: 'Bosque', ink: 'Tinta', neon: 'Neón', sunrise: 'Amanecer', aurora: 'Aurora',
        paper: 'Papel', linen: 'Lino', slate: 'Pizarra', moss: 'Musgo', meadow: 'Pradera', dusk: 'Ocaso' },
      months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] }
  };

  const params = new URLSearchParams(location.search);
  const todayKey = () => (/^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : C.dateKey(new Date()));

  // ---------- platform ----------
  const CFG = window.Gamekit.mergeConfig(window.GamekitConfig, window.TeseloGameConfig);
  const P = window.Gamekit.create({
    config: CFG, today: todayKey,
    saveDefaults: () => ({ endless: { best: 0, run: null }, daily: { results: {}, run: null } })
  });
  const G = () => P.gameData;     // this game's own save section
  const eco = P.eco, meta = P.meta;

  // ---------- theme + skins ----------
  const PALS = {
    light: { board: '#e7e1d5', cell: '#dcd5c7', glow: 'rgba(255,255,255,0.55)', dead: '#c7c0b2', meta: '#f3efe7', stone: '#b4ab9b',
      tiles: ['#7fb3a3', '#86a8d8', '#e5b567', '#e39a85', '#a99bd8', '#d98fb0', '#9cc27a'] },
    dark: { board: '#23262d', cell: '#2c3038', glow: 'rgba(255,255,255,0.16)', dead: '#3a3e47', meta: '#1a1c21', stone: '#575d68',
      tiles: ['#6faa98', '#7a9bd0', '#dcac58', '#d98a75', '#9d8ed3', '#cf83a6', '#8fba6c'] }
  };
  let theme = 'light', PAL = PALS.light, TILES = PAL.tiles, BOARD = PAL.board;
  function applyTheme() {
    theme = shell.theme();
    PAL = PALS[theme];
    const bs = eco.equipped('block'), bd = eco.equipped('board');
    TILES = (bs && bs.tiles) || PAL.tiles;
    BOARD = (bd && bd.board && bd.board[theme]) || PAL.board;
    document.documentElement.dataset.theme = theme;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', PAL.meta);
    sprites = {};
    dirty = true;
  }
  const colorOf = (v) => (v === C.STONE ? PAL.stone : TILES[v]);
  // skin preview for the shell's shop cards
  function skinPreview(s, th) {
    if (s.kind === 'board') return '<div class="bd" style="background:' + ((s.board && s.board[th]) || PALS[th].board) + '"></div>';
    const t = s.tiles || PALS[th].tiles;
    return '<div class="sw">' + [0, 2, 3, 1].map((k) => '<i style="background:' + t[k] + '"></i>').join('') + '</div>';
  }

  // ---------- sound (all generated with WebAudio) ----------
  let muted = !!P.settings.muted;
  let actx = null, master = null, hidden = document.hidden, adPaused = false;
  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { actx = new AC(); } catch (e) { return; }
      master = actx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(actx.destination);
    }
    if (actx.state === 'suspended' && !hidden && !adPaused) actx.resume().catch(() => {});
  }
  function tone(freq, at, dur, type, vol, slide) {
    if (!actx || muted) return;
    const t = actx.currentTime + at;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const hz = (semi) => 392 * Math.pow(2, semi / 12);
  const sfx = {
    pick() { tone(880, 0, 0.05, 'sine', 0.05, 990); },
    place(n) { tone(330 + n * 12, 0, 0.09, 'triangle', 0.13, 220); tone(660, 0, 0.04, 'sine', 0.04); },
    bad() { tone(200, 0, 0.12, 'sine', 0.08, 150); },
    deal() { [0, 1, 2].forEach((i) => tone(hz(12 + i * 4), i * 0.045, 0.06, 'sine', 0.035)); },
    clear(lines, combo) {
      const base = Math.min(combo, 4) * 2, steps = Math.min(3 + lines, 7);
      for (let i = 0; i < steps; i++) tone(hz(PENTA[Math.min(base + i, PENTA.length - 1)]), i * 0.055, 0.22, 'triangle', 0.1);
      tone(hz(PENTA[base] - 12), 0, 0.35, 'sine', 0.08);
    },
    gem() { tone(hz(19), 0, 0.12, 'sine', 0.08); tone(hz(24), 0.06, 0.18, 'sine', 0.07); },
    boom() { tone(140, 0, 0.3, 'triangle', 0.16, 50); tone(90, 0.02, 0.35, 'sine', 0.12, 40); },
    coin() { tone(hz(16), 0, 0.08, 'square', 0.03); tone(hz(23), 0.07, 0.14, 'square', 0.03); },
    tick() { tone(hz(9), 0, 0.1, 'sine', 0.06); },
    over() { [7, 4, 0, -5].forEach((s, i) => tone(hz(s), i * 0.13, 0.3, 'sine', 0.09)); },
    win() { [0, 4, 7, 12, 16].forEach((s, i) => tone(hz(s + 5), i * 0.08, 0.25, 'triangle', 0.08)); }
  };
  function buzz(p) { if (muted || !navigator.vibrate) return; try { navigator.vibrate(p); } catch (e) { /* ignore */ } }

  // ---------- shell ----------
  const shell = window.GamekitShell.create(P, {
    texts: GAME_TX,
    sfx: { coin: () => sfx.coin(), win: () => sfx.win(), bad: () => sfx.bad(), pick: () => sfx.pick(), tick: () => sfx.tick() },
    levels: { count: Levels.COUNT, chapter: 15, start: (n) => startLevel(n, false), difficulty: (n) => Levels.tierOf(n) },
    boosters: { ids: C.BOOSTERS, usable: (id) => boosterUsable(id), press: (id, consume) => pressBooster(id, consume) },
    quests: { button: 'm-quests', badge: 'm-quests-badge' },
    shopButton: 'm-shop',
    skinPreview,
    onTap: () => ensureAudio(),
    onMute: (m) => { muted = m; if (master) master.gain.value = m ? 0 : 0.6; },
    onTheme: () => applyTheme(),
    onSkin: () => applyTheme(),
    onScreen: (name, prev) => onScreen(name, prev)
  });
  const TX = shell.TX, ico = shell.ico, LANG = shell.lang;
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-t]').forEach((el) => { if (TX[el.dataset.t]) el.textContent = TX[el.dataset.t]; });
  const toast = (h) => shell.toast(h);

  // ---------- engagement layer (wheel, chests, levels, streak, league, ranking): gamekit shell/fun-ui.js ----------
  const weekOfKey = (k) => Math.floor((C.dayNumber(k) - 1) / 7);
  function localDailyScore(period) {
    const res = G().daily.results, today = todayKey(), keys = Object.keys(res);
    if (period === 'daily') return res[today] ? res[today].score : null;
    const pick = period === 'weekly' ? keys.filter((k) => weekOfKey(k) === weekOfKey(today)) : keys;
    if (!pick.length) return null;
    return period === 'weekly' ? pick.reduce((a, k) => a + res[k].score, 0) : Math.max.apply(null, pick.map((k) => res[k].score));
  }
  const funUI = window.GamekitFunUI.attach(P, shell, {
    dock: 'm-dock', xpbar: 'm-xp', skinPreview, rankMode: 'daily',
    localScore: localDailyScore,
    playDaily: () => startDaily(),
    links: { privacy: 'https://ces107.github.io/teselo/privacy.html', terms: 'https://ces107.github.io/teselo/terms.html' }
  });
  // daily result: show the rank once the server accepted the score
  P.on('ranked', (j, body) => {
    if (!j || !j.rank || screen !== 'over' || mode !== 'daily' || body.day !== dayKey) return;
    $('o-best').innerHTML = '#' + C.dayNumber(dayKey) + ' &nbsp;·&nbsp; ' + '<svg><use href="#gk-i-trophy"/></svg> ' + j.rank + '/' + j.total;
  });

  // ---------- canvas + layout ----------
  const cv = $('cv'), ctx = cv.getContext('2d'), fx = $('fx');
  let W = 0, H = 0, DPR = 1, L = null, sprites = {}, dirty = true;
  function boostersShown() { return (screen === 'play' || screen === 'over') && mode !== 'daily' && P.unlocked('boosters'); }
  function resize() {
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(W * DPR)); cv.height = Math.max(1, Math.round(H * DPR));
    layout();
    sprites = {};
    dirty = true;
  }
  function layout() {
    const pad = 16, foot = boostersShown() ? 66 : 0, AH = H - foot, land = W > AH * 1.15;
    let bs, bx, by;
    const slots = [];
    if (land) {
      bs = Math.min(AH - pad * 2, (W - pad * 3) * 0.64, 600);
      const tw = Math.min(bs * 0.42, W - bs - pad * 3);
      bx = (W - (bs + pad * 2 + tw)) / 2; by = (AH - bs) / 2;
      for (let i = 0; i < 3; i++) slots.push({ x: bx + bs + pad * 2, y: by + i * bs / 3, w: tw, h: bs / 3 });
    } else {
      const k = 0.36;
      bs = Math.min(W - pad * 2, (AH - pad * 2.5) / (1 + k), 600);
      const th = bs * k;
      bx = (W - bs) / 2; by = Math.max(pad * 0.5, (AH - bs - pad - th) / 2 - 6);
      for (let i = 0; i < 3; i++) slots.push({ x: bx + i * bs / 3, y: by + bs + pad, w: bs / 3, h: th });
    }
    const cell = bs / N;
    const tcell = Math.min(cell * 0.56, slots[0].w * 0.86 / 5, slots[0].h * 0.86 / 5);
    L = { bx, by, bs, cell, slots, tcell };
  }
  function relayout() { const old = L && L.bs; layout(); if (!L || L.bs !== old) { sprites = {}; } dirty = true; }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round(r + (t - r) * p); g = Math.round(g + (t - g) * p); b = Math.round(b + (t - b) * p);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // pre-rendered tile sprite per colour and size
  function sprite(color, size, stone) {
    const k = color + '|' + Math.round(size * 10) + (stone ? 's' : '');
    let s = sprites[k];
    if (s) return s;
    s = document.createElement('canvas');
    const px = Math.max(2, Math.round(size * DPR));
    s.width = s.height = px;
    const g = s.getContext('2d');
    const i = px * 0.045, w = px - i * 2, r = px * 0.22;
    g.fillStyle = shade(color, -0.16); rr(g, i, i, w, w, r); g.fill();
    g.fillStyle = color; rr(g, i, i, w, w - px * 0.075, r); g.fill();
    if (stone) {
      g.fillStyle = shade(color, -0.12);
      [[0.3, 0.35, 0.07], [0.62, 0.3, 0.05], [0.45, 0.62, 0.06], [0.7, 0.62, 0.04]].forEach((d) => { g.beginPath(); g.arc(px * d[0], px * d[1], px * d[2], 0, 7); g.fill(); });
    } else {
      g.fillStyle = 'rgba(255,255,255,0.24)'; rr(g, i + px * 0.14, i + px * 0.09, w - px * 0.28, px * 0.13, px * 0.065); g.fill();
    }
    sprites[k] = s;
    return s;
  }
  function tile(color, x, y, size, scale, alpha, stone) {
    const s = sprite(color, size, stone), sz = size * (scale == null ? 1 : scale);
    if (alpha != null && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    ctx.drawImage(s, x + (size - sz) / 2, y + (size - sz) / 2, sz, sz);
    if (alpha != null && alpha < 1) ctx.globalAlpha = 1;
  }
  function gemAt(x, y, size, scale, t) {
    const s = size * 0.56 * (scale == null ? 1 : scale), cx = x + size / 2, cy = y + size / 2 + Math.sin(t / 400 + x) * size * 0.02;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.5, cy - s * 0.18); ctx.lineTo(cx - s * 0.26, cy - s * 0.45); ctx.lineTo(cx + s * 0.26, cy - s * 0.45);
    ctx.lineTo(cx + s * 0.5, cy - s * 0.18); ctx.lineTo(cx, cy + s * 0.5); ctx.closePath();
    ctx.fillStyle = '#5fb3c8'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.5, cy - s * 0.18); ctx.lineTo(cx - s * 0.26, cy - s * 0.45); ctx.lineTo(cx + s * 0.26, cy - s * 0.45); ctx.lineTo(cx + s * 0.5, cy - s * 0.18);
    ctx.closePath(); ctx.fillStyle = '#9fe0ee'; ctx.fill();
  }

  // ---------- state ----------
  let screen = 'menu', mode = 'endless', game = null, dayKey = todayKey(), playedOne = false, levelNo = 0;
  let drag = null, ret = null, placeFx = null, overFx = null, shake = null, boostMode = null;
  let clearFx = [], parts = [], trayIn = [0, 0, 0];
  let shown = 0, overTimer = 0, lastCoins = 0, lastShare = '';
  const now = () => performance.now();
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const back = (t) => { t = Math.min(1, Math.max(0, t)); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  function dims(cells) {
    let w = 0, h = 0;
    cells.forEach((p) => { h = Math.max(h, p[0] + 1); w = Math.max(w, p[1] + 1); });
    return { w, h };
  }
  function slotPiecePos(i, cells, size) {
    const s = L.slots[i], d = dims(cells);
    return { x: s.x + (s.w - d.w * size) / 2, y: s.y + (s.h - d.h * size) / 2 };
  }

  // ---------- drawing ----------
  function draw(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!game || !L) return;
    const { cell, bs } = L;
    let by = L.by, bx = L.bx;
    if (shake) {
      const k = (t - shake.t0) / (shake.dur || 320);
      if (k >= 1) shake = null;
      else {
        by += Math.sin(k * Math.PI * 3) * (1 - k) * shake.amp;
        if (shake.x) bx += Math.sin(k * Math.PI * 5 + 1) * (1 - k) * shake.amp * 0.7;
      }
    }
    BX = bx; BY = by;
    ctx.fillStyle = BOARD;
    rr(ctx, bx - 8, by - 8, bs + 16, bs + 16, cell * 0.36); ctx.fill();
    const ci = cell * 0.08, cs = cell - ci * 2;
    ctx.fillStyle = PAL.cell;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (game.board[r * N + c] === -1) { rr(ctx, bx + c * cell + ci, by + r * cell + ci, cs, cs, cell * 0.18); ctx.fill(); }
    }
    let hl = null, ghostColor = -1;
    if (drag && drag.valid) {
      hl = {};
      drag.lines.rows.forEach((r) => { for (let c = 0; c < N; c++) hl[r * N + c] = 1; });
      drag.lines.cols.forEach((c) => { for (let r = 0; r < N; r++) hl[r * N + c] = 1; });
      ghostColor = game.tray[drag.i].color;
    }
    const pulse = placeFx && t - placeFx.t0 < 220 ? placeFx : null;
    if (placeFx && !pulse) placeFx = null;
    for (let i = 0; i < N * N; i++) {
      const v = game.board[i];
      if (v === -1) continue;
      const r = (i / N) | 0, c = i % N;
      let col = colorOf(v);
      if (overFx && !game.won && t - overFx.t0 > r * 55) col = PAL.dead;
      else if (hl && hl[i]) col = TILES[ghostColor];
      let sc = 1;
      if (pulse && pulse.set[i]) { const k = (t - pulse.t0) / 220; sc = 1 + Math.sin(k * Math.PI) * 0.1; }
      tile(col, bx + c * cell, by + r * cell, cell, sc, 1, v === C.STONE && !(hl && hl[i]));
      if (game.gems && game.gems[i]) gemAt(bx + c * cell, by + r * cell, cell, sc, t);
    }
    // bomb aim
    if (boostMode === 'bomb' && aim) {
      ctx.fillStyle = 'rgba(224,120,106,0.28)';
      const r0 = Math.max(0, aim.r - 1), c0 = Math.max(0, aim.c - 1), r1 = Math.min(N - 1, aim.r + 1), c1 = Math.min(N - 1, aim.c + 1);
      rr(ctx, bx + c0 * cell + 2, by + r0 * cell + 2, (c1 - c0 + 1) * cell - 4, (r1 - r0 + 1) * cell - 4, cell * 0.25); ctx.fill();
    }
    if (drag && drag.valid) {
      const p = game.tray[drag.i];
      p.cells.forEach((q) => {
        const i = (drag.r + q[0]) * N + drag.c + q[1];
        tile(TILES[p.color], bx + (drag.c + q[1]) * cell, by + (drag.r + q[0]) * cell, cell, 1, hl[i] ? 0.85 : 0.38);
      });
      if (drag.lines.rows.length || drag.lines.cols.length) {
        const a = 0.5 + 0.5 * Math.sin(t / 140);
        ctx.fillStyle = PAL.glow;
        ctx.globalAlpha = 0.35 + a * 0.35;
        drag.lines.rows.forEach((r) => { rr(ctx, bx + 2, by + r * cell + 2, bs - 4, cell - 4, cell * 0.2); ctx.fill(); });
        drag.lines.cols.forEach((c) => { rr(ctx, bx + c * cell + 2, by + 2, cell - 4, bs - 4, cell * 0.2); ctx.fill(); });
        ctx.globalAlpha = 1;
      }
    }
    clearFx = clearFx.filter((f) => t - f.t0 < f.delay + 420);
    clearFx.forEach((f) => {
      const k = (t - f.t0 - f.delay) / 420;
      const r = (f.i / N) | 0, c = f.i % N, x = bx + c * cell, y = by + r * cell;
      const col = colorOf(f.color);
      if (k < 0) { tile(col, x, y, cell); if (f.gem) gemAt(x, y, cell, 1, t); return; }
      const sc = k < 0.25 ? 1 + k * 0.6 : 1.15 * (1 - ease((k - 0.25) / 0.75));
      tile(col, x, y, cell, sc, 1 - Math.max(0, k - 0.4) / 0.6);
      if (f.gem) gemAt(x, y - k * cell * 1.6, cell, 1 + k * 0.6, t);
      if (k < 0.3) { ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - k / 0.3)).toFixed(3) + ')'; rr(ctx, x + ci, y + ci, cs, cs, cell * 0.2); ctx.fill(); }
      if (!f.burst && k >= 0.25) { f.burst = true; burst(x + cell / 2, y + cell / 2, col); }
    });
    drawBoardFx(t, bx, by);
    for (let i = 0; i < 3; i++) {
      const p = game.tray[i];
      if (!p || p.used || (drag && drag.i === i) || (ret && ret.i === i)) continue;
      const k = (t - trayIn[i]) / 260;
      let sc = k >= 1 ? 1 : back(k);
      if (sc <= 0.01) continue;
      if (boostMode === 'rotate') sc *= 1 + Math.sin(t / 120 + i) * 0.04;
      const fits = screen !== 'play' || C.fitsAnywhere(game.board, p.cells);
      const o = trayFxFor(i, t);
      if (o && o.hide) continue;
      trayPiece(i, p.cells, fits ? TILES[p.color] : PAL.dead, Object.assign({ sc, alpha: fits ? 1 : 0.7 }, o));
    }
    if (ret) {
      const k = (t - ret.t0) / 170, e = ease(k), p = game.tray[ret.i];
      if (k >= 1 || !p) ret = null;
      else {
        const to = slotPiecePos(ret.i, p.cells, L.tcell), sz = cell + (L.tcell - cell) * e;
        const x = ret.x + (to.x - ret.x) * e, y = ret.y + (to.y - ret.y) * e;
        p.cells.forEach((q) => tile(TILES[p.color], x + q[1] * sz, y + q[0] * sz, sz));
      }
    }
    if (drag) {
      const p = game.tray[drag.i], k = Math.min(1, (t - drag.t0) / 110);
      const sz = L.tcell + (cell - L.tcell) * ease(k);
      const d = dims(p.cells);
      const x = drag.x - d.w * sz / 2, y = drag.y - drag.lift * ease(k) - d.h * sz / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      p.cells.forEach((q) => { rr(ctx, x + q[1] * sz + sz * 0.12, y + q[0] * sz + sz * 0.22, sz * 0.86, sz * 0.86, sz * 0.2); ctx.fill(); });
      p.cells.forEach((q) => tile(TILES[p.color], x + q[1] * sz, y + q[0] * sz, sz));
    }
    if (parts.length) {
      const dt = 1 / 60;
      parts = parts.filter((q) => (q.life -= dt) > 0);
      parts.forEach((q) => {
        q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        ctx.globalAlpha = Math.min(1, q.life * 2.2);
        ctx.fillStyle = q.color;
        rr(ctx, q.x, q.y, q.s, q.s, q.s * 0.3); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    drawTopFx(t);
  }
  let aim = null;

  function burst(x, y, color) {
    if (parts.length > 180) return;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 220, s: L.cell * (0.12 + Math.random() * 0.12), life: 0.55 + Math.random() * 0.3, color });
    }
  }

  // ---------- booster effects ----------
  // Canvas only (no CSS), drawn over the state the booster already produced: they never delay or change the game,
  // and input stays live. Pooled particles with a hard cap (60 fps on low-end phones). prefers-reduced-motion
  // (or ?motion=reduce): short fades and flashes instead of flying, spinning and shaking.
  const ASSIST_MOVES = 3;   // a win within this many placements after a booster counts as booster-assisted
  const CHARGE = 170;       // bomb charge-up before the blast (ms)
  let BX = 0, BY = 0, fxList = [], fxLive = 0, fxLast = 0, lastBoost = null, lastPlace = null;
  const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => params.get('motion') === 'reduce' || !!(RM && RM.matches);
  const FX_MAX = 240, pool = [];
  for (let k = 0; k < FX_MAX; k++) pool.push({ kind: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, s: 0, rot: 0, vr: 0, color: '' });
  // kind 0: tile shard, 1: sparkle star
  function spawn(kind, x, y, vx, vy, s, life, color, g, vr) {
    if (fxLive >= FX_MAX) return;
    const q = pool[fxLive++];
    q.kind = kind; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.s = s; q.life = q.max = life; q.color = color;
    q.g = g || 0; q.vr = vr || 0; q.rot = Math.random() * 6.283;
  }
  function sparkle(x, y, n, speed, color) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.283, v = speed * (0.3 + Math.random() * 0.7);
      spawn(1, x, y, Math.cos(a) * v, Math.sin(a) * v - speed * 0.2, L.cell * (0.14 + Math.random() * 0.14), 0.35 + Math.random() * 0.35, color || '#fff3c4', 80, 0);
    }
  }
  function star(x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, d = k % 2 ? r * 0.3 : r; ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
    ctx.closePath(); ctx.fill();
  }
  function stepParticles(dt) {
    for (let k = 0; k < fxLive;) {
      const q = pool[k];
      q.life -= dt;
      if (q.life <= 0) { pool[k] = pool[--fxLive]; pool[fxLive] = q; continue; }
      q.vy += q.g * dt; q.vx *= 0.985; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
      k++;
    }
  }
  function drawParticles() {
    for (let k = 0; k < fxLive; k++) {
      const q = pool[k], f = q.life / q.max;
      ctx.globalAlpha = Math.min(1, f * 2.2);
      ctx.fillStyle = q.color;
      if (q.kind === 0) {
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        rr(ctx, -q.s / 2, -q.s / 2, q.s, q.s, q.s * 0.25); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-q.s * 0.35, -q.s * 0.38, q.s * 0.5, q.s * 0.15);
        ctx.restore();
      } else star(q.x, q.y, q.s * (0.4 + 0.6 * f));
    }
    ctx.globalAlpha = 1;
  }
  const inOut = (x) => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

  // bomb: charge-up glow at the target, shockwave ring, the 3x3 shatters into shards with a shake, gems fly to the goal
  function fxBomb(r, c, res) {
    const rm = reduced();
    fxList.push({ type: 'bomb', t0: now(), r, c, cells: res.cleared, rm, fired: false, gems: [], dur: rm ? 280 : CHARGE + 800 });
    if (rm) { sfx.boom(); buzz(30); if (res.gems) setTimeout(sfx.gem, 150); }
    else tone(180, 0, CHARGE / 1000, 'sawtooth', 0.035, 720);   // charge-up whine, the boom lands with the blast
    dirty = true;
  }
  function goalPoint() {
    const el = $('score'), cr = cv.getBoundingClientRect(), sr = el ? el.getBoundingClientRect() : null;
    if (!sr || !sr.width) return { x: W / 2, y: -L.cell };
    return { x: sr.left + sr.width / 2 - cr.left, y: Math.max(-L.cell, sr.top + sr.height / 2 - cr.top) };
  }
  function bombFire(f, t, bx, by) {
    f.fired = true;
    const cell = L.cell, cx = bx + (f.c + 0.5) * cell, cy = by + (f.r + 0.5) * cell, u = cell / 40;
    f.cells.forEach((o) => {
      const r = (o.i / N) | 0, c = o.i % N, x = bx + (c + 0.5) * cell, y = by + (r + 0.5) * cell;
      let dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      if (len < 2) { const a = Math.random() * 6.283; dx = Math.cos(a); dy = Math.sin(a); } else { dx /= len; dy /= len; }
      const col = colorOf(o.color);
      for (let k = 0; k < 4; k++) {
        const ox = (k % 2 - 0.5) * cell * 0.45, oy = ((k >> 1) - 0.5) * cell * 0.45, v = (300 + Math.random() * 320) * u;
        spawn(0, x + ox, y + oy, (dx + ox / cell * 1.4) * v, (dy + oy / cell * 1.4) * v - 260 * u, cell * (0.3 + Math.random() * 0.14),
          0.55 + Math.random() * 0.35, col, 1500 * u, (Math.random() - 0.5) * 18);
      }
      if (o.gem) { f.gems.push({ x: bx + c * cell, y: by + r * cell, t0: t, to: goalPoint(), landed: false }); }
    });
    sparkle(cx, cy, 14, 420 * u, '#fff3c4');
    shake = { t0: t, amp: 9, x: true, dur: 380 };
    sfx.boom(); buzz([30, 30, 40]);
  }
  // rotate: the piece spins into its new orientation with a motion trail and a whoosh of sparkles
  function fxRotate(i) {
    const rm = reduced(), p = game.tray[i];
    fxList.push({ type: 'rotate', t0: now(), i, rm, dur: rm ? 220 : 300 });
    tone(hz(14), 0, 0.08, 'sine', 0.06, hz(19)); tone(hz(9), 0.03, 0.16, 'triangle', 0.03, hz(21));
    if (!rm && p) {
      const sz = L.tcell, pos = slotPiecePos(i, p.cells, sz), d = dims(p.cells), cx = pos.x + d.w * sz / 2, cy = pos.y + d.h * sz / 2;
      const rad = Math.max(d.w, d.h) * sz * 0.6, u = L.cell / 40;
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * 6.283;
        spawn(1, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, -Math.sin(a) * 260 * u, Math.cos(a) * 260 * u, L.cell * 0.18, 0.4, '#fff3c4', 0, 0);
      }
    }
    dirty = true;
  }
  // undo: the piece flies back to its slot with a reverse ghost trail; a rewind sweep crosses the board and
  // the tiles the move had cleared shimmer back in
  function fxUndo(lp, before) {
    const rm = reduced(), restored = [];
    game.board.forEach((v, k) => { if (v !== -1 && before[k] === -1) restored.push(k); });
    const piece = lp && game.tray[lp.i] && !game.tray[lp.i].used ? lp : null;
    fxList.push({ type: 'undo', t0: now(), rm, piece, restored, dur: rm ? 240 : 420 });
    lastPlace = null;
    tone(hz(19), 0, 0.2, 'sine', 0.05, hz(7)); tone(hz(12), 0.05, 0.18, 'triangle', 0.03, hz(2));
    dirty = true;
  }
  // shuffle: the tray cards flip over, the new pieces drop in and a shimmer sweeps across them
  function fxShuffle(old) {
    const rm = reduced(), o = {};
    old.forEach((x) => { o[x.i] = x; });
    fxList.push({ type: 'shuffle', t0: now(), rm, old: o, sp: {}, dur: rm ? 300 : 540 });
    trayIn = [0, 0, 0];
    sfx.deal(); setTimeout(() => sfx.deal(), 140);
    dirty = true;
  }

  // per-slot overrides for the tray drawing while a rotate / shuffle / undo effect runs
  function trayFxFor(i, t) {
    let o = null;
    for (let n = 0; n < fxList.length; n++) {
      const f = fxList[n], k = t - f.t0;
      if (f.type === 'rotate' && f.i === i) {
        o = f.rm ? { glow: 1 - k / f.dur } : { angle: -Math.PI / 2 * (1 - inOut(k / 280)), trail: 1 - inOut(k / 280) };
      } else if (f.type === 'undo' && f.piece && f.piece.i === i) {
        o = f.rm ? { alpha: Math.min(1, k / f.dur) } : (k < 380 ? { hide: true } : null);
      } else if (f.type === 'shuffle' && f.old[i]) {
        const old = f.old[i];
        if (f.rm) o = k < 150 ? { old, alpha: 1 - k / 150 } : { alpha: (k - 150) / 150 };
        else {
          const s = k - i * 60;
          if (s < 0) o = { old };
          else if (s < 130) o = { old, sx: Math.cos(s / 130 * Math.PI / 2), dy: -s / 130 * L.tcell * 0.6 };
          else {
            const q = Math.min(1, (s - 130) / 300);
            if (!f.sp[i]) {
              f.sp[i] = 1;
              const sl = L.slots[i];
              sparkle(sl.x + sl.w / 2, sl.y + sl.h / 2, 7, 260 * L.cell / 40, '#fff3c4');
            }
            o = { sx: Math.max(0.02, Math.sin(Math.min(1, q * 1.6) * Math.PI / 2)), dy: -(1 - back(q)) * L.cell, shimmer: q };
          }
        }
      }
    }
    return o;
  }
  // a tray piece around its slot centre: scale, flip (sx), rotation with a trail, drop (dy), shimmer, glow
  function trayPiece(i, cells, color, o) {
    if (o.old) { cells = o.old.cells; color = TILES[o.old.color]; }
    const sz = L.tcell, pos = slotPiecePos(i, cells, sz), d = dims(cells);
    const cx = pos.x + d.w * sz / 2, cy = pos.y + d.h * sz / 2 + (o.dy || 0);
    const sc = o.sc == null ? 1 : o.sc, sx = o.sx == null ? 1 : o.sx, hw = d.w * sz / 2, hh = d.h * sz / 2;
    const one = (ang, alpha) => {
      ctx.save(); ctx.translate(cx, cy);
      if (ang) ctx.rotate(ang);
      ctx.scale(sc * sx, sc);
      cells.forEach((q) => tile(color, q[1] * sz - hw, q[0] * sz - hh, sz, 1, alpha));
      if (o.shimmer != null && o.shimmer < 1) {
        const band = o.shimmer * 2.2 - 0.6;
        cells.forEach((q) => {
          const a = 1 - Math.abs((q[0] + q[1]) / Math.max(1, d.w + d.h - 2) - band) * 3;
          if (a <= 0) return;
          ctx.fillStyle = 'rgba(255,255,255,' + (0.65 * a).toFixed(3) + ')';
          rr(ctx, q[1] * sz - hw + sz * 0.06, q[0] * sz - hh + sz * 0.06, sz * 0.88, sz * 0.88, sz * 0.2); ctx.fill();
        });
      }
      ctx.restore();
    };
    if (o.trail > 0.02) for (let j = 3; j >= 1; j--) one((o.angle || 0) - j * 0.38 * o.trail, (0.3 / j) * (o.alpha == null ? 1 : o.alpha));
    one(o.angle || 0, o.alpha == null ? 1 : o.alpha);
    if (o.glow > 0) {
      const sl = L.slots[i];
      ctx.strokeStyle = 'rgba(255,214,120,' + (0.9 * o.glow).toFixed(3) + ')'; ctx.lineWidth = 3;
      rr(ctx, sl.x + 4, sl.y + 4, sl.w - 8, sl.h - 8, 14); ctx.stroke();
    }
  }
  // under the tray: bomb charge, rings and flash; undo sweep and restored-tile shimmer
  function drawBoardFx(t, bx, by) {
    fxList = fxList.filter((f) => t - f.t0 < f.dur);
    const cell = L.cell;
    fxList.forEach((f) => {
      const k = t - f.t0;
      if (f.type === 'bomb') {
        const cx = bx + (f.c + 0.5) * cell, cy = by + (f.r + 0.5) * cell;
        const r0 = Math.max(0, f.r - 1), c0 = Math.max(0, f.c - 1), r1 = Math.min(N - 1, f.r + 1), c1 = Math.min(N - 1, f.c + 1);
        const area = () => rr(ctx, bx + c0 * cell + 2, by + r0 * cell + 2, (c1 - c0 + 1) * cell - 4, (r1 - r0 + 1) * cell - 4, cell * 0.25);
        if (f.rm) {
          ctx.fillStyle = 'rgba(255,236,200,' + (0.7 * (1 - k / f.dur)).toFixed(3) + ')'; area(); ctx.fill();
          f.cells.forEach((o) => { if (o.gem) gemAt(bx + (o.i % N) * cell, by + ((o.i / N) | 0) * cell, cell, 1, t); });
          return;
        }
        if (k < CHARGE) {
          const q = k / CHARGE;
          f.cells.forEach((o) => {   // the doomed tiles tremble (only where the board is still empty)
            if (game.board[o.i] !== -1) return;
            const r = (o.i / N) | 0, c = o.i % N, j = Math.sin(t * 0.11 + o.i * 1.7) * cell * 0.05 * q;
            tile(colorOf(o.color), bx + c * cell + j, by + r * cell - j, cell, 1 + 0.07 * q, 1, o.color === C.STONE);
            if (o.gem) gemAt(bx + c * cell + j, by + r * cell - j, cell, 1, t);
          });
          const rad = cell * (0.4 + 1.3 * q), gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          gr.addColorStop(0, 'rgba(255,252,235,' + (0.95 * q).toFixed(3) + ')');
          gr.addColorStop(0.45, 'rgba(255,180,90,' + (0.6 * q).toFixed(3) + ')');
          gr.addColorStop(1, 'rgba(255,120,60,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 6.3); ctx.fill();
          return;
        }
        if (!f.fired) bombFire(f, t, bx, by);
        const b = k - CHARGE;
        if (b < 130) { ctx.fillStyle = 'rgba(255,250,235,' + (0.85 * (1 - b / 130)).toFixed(3) + ')'; area(); ctx.fill(); }
        [0, 70].forEach((lag, n) => {
          const q = (b - lag) / 430;
          if (q <= 0 || q >= 1) return;
          ctx.strokeStyle = n ? 'rgba(255,170,90,' + (0.8 * (1 - q)).toFixed(3) + ')' : 'rgba(255,248,225,' + (1 - q).toFixed(3) + ')';
          ctx.lineWidth = cell * (n ? 0.12 : 0.32) * (1 - q) + 1;
          ctx.beginPath(); ctx.arc(cx, cy, cell * (0.4 + 2.6 * ease(q)), 0, 6.3); ctx.stroke();
        });
      } else if (f.type === 'undo') {
        const q = k / f.dur;
        f.restored.forEach((i) => {
          ctx.fillStyle = 'rgba(170,225,255,' + (0.75 * (1 - q)).toFixed(3) + ')';
          rr(ctx, bx + (i % N) * cell + cell * 0.08, by + ((i / N) | 0) * cell + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.2); ctx.fill();
        });
        if (!f.rm) {
          const x = bx + L.bs * (1 - inOut(q)), w = cell * 1.6;
          const gr = ctx.createLinearGradient(x - w, 0, x + w, 0);
          gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(200,235,255,0.38)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gr; ctx.fillRect(Math.max(bx, x - w), by, Math.min(bx + L.bs, x + w) - Math.max(bx, x - w), L.bs);
        }
      }
    });
  }
  // over everything: the undone piece flying home, gem flights, particles
  function drawTopFx(t) {
    const dt = Math.min(0.05, Math.max(0, (t - fxLast) / 1000));
    fxLast = t;
    const cell = L.cell;
    fxList.forEach((f) => {
      const k = t - f.t0;
      if (f.type === 'undo' && f.piece && !f.rm && k < 380) {
        const p = f.piece, from = { x: BX + p.c * cell, y: BY + p.r * cell }, to = slotPiecePos(p.i, p.cells, L.tcell);
        for (let j = 4; j >= 0; j--) {
          const e = inOut((k - j * 40) / 380);
          if (k - j * 40 < 0) continue;
          const sz = cell + (L.tcell - cell) * e, x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e - Math.sin(e * Math.PI) * cell * 0.8;
          p.cells.forEach((q) => tile(TILES[p.color], x + q[1] * sz, y + q[0] * sz, sz, 1, j ? 0.32 * (1 - j / 5) : 1));
        }
      } else if (f.type === 'bomb' && f.gems.length) {
        f.gems.forEach((g) => {
          const q = (t - g.t0) / 620;
          if (q >= 1) { if (!g.landed) { g.landed = true; sparkle(g.to.x, Math.max(cell * 0.3, g.to.y), 8, 240 * cell / 40, '#bff0fa'); sfx.gem(); } return; }
          const e = inOut(q), sx = g.x + cell / 2, sy = g.y + cell / 2;
          const mx = sx + (g.to.x - sx) * 0.2, my = Math.min(sy, g.to.y) - cell * 2;
          const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * g.to.x, y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * g.to.y;
          if (Math.random() < 0.7) spawn(1, x, y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, cell * 0.16, 0.4, '#bff0fa', 0, 0);
          gemAt(x - cell / 2, y - cell / 2, cell, 1.35 - 0.6 * e, t);
        });
      }
    });
    if (fxLive) { stepParticles(dt); drawParticles(); }
  }

  function busy(t) {
    return !!(drag || ret || placeFx || overFx || shake || boostMode || clearFx.length || parts.length || (game && game.gems) ||
      fxList.length || fxLive ||
      trayIn.some((v) => t - v < 300) || (mode !== 'level' && Math.round(shown) !== game.score));
  }

  function frame() {
    requestAnimationFrame(frame);
    if (hidden) return;
    const t = now();
    if (game && mode !== 'level' && Math.round(shown) !== game.score) {
      shown += (game.score - shown) * 0.18;
      if (Math.abs(game.score - shown) < 0.5) shown = game.score;
      $('score').textContent = Math.round(shown);
    }
    if (!dirty && !(game && screen !== 'menu' && busy(t))) return;
    dirty = false;
    draw(t);
  }

  function popup(x, y, html, big) {
    const d = document.createElement('div');
    d.className = 'pop' + (big ? ' big' : '');
    d.innerHTML = html;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    fx.appendChild(d);
    setTimeout(() => d.remove(), 1050);
  }

  // ---------- input ----------
  function pt(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function slotAt(p) {
    for (let i = 0; i < 3; i++) {
      const s = L.slots[i];
      if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y - 8 && p.y <= s.y + s.h + 16) return i;
    }
    return -1;
  }
  function cellAt(p) {
    const c = Math.floor((p.x - L.bx) / L.cell), r = Math.floor((p.y - L.by) / L.cell);
    return r >= 0 && c >= 0 && r < N && c < N ? { r, c } : null;
  }
  function liftFor(cells, touch) { return touch ? dims(cells).h * L.cell / 2 + L.cell * 0.9 : 0; }
  function updateDrag() {
    const p = game.tray[drag.i], d = dims(p.cells), cell = L.cell;
    const ox = drag.x - d.w * cell / 2, oy = drag.y - drag.lift - d.h * cell / 2;
    const c = Math.round((ox - L.bx) / cell), r = Math.round((oy - L.by) / cell);
    if (r !== drag.r || c !== drag.c || drag.valid == null) {
      drag.r = r; drag.c = c;
      drag.valid = game.canPlace(drag.i, r, c);
      drag.lines = drag.valid ? C.linesAfter(game.board, p.cells, r, c) : null;
    }
  }
  function cancelDrag(sound) {
    if (!drag) return;
    const p = game.tray[drag.i], d = dims(p.cells);
    ret = { i: drag.i, t0: now(), x: drag.x - d.w * L.cell / 2, y: drag.y - drag.lift - d.h * L.cell / 2 };
    drag = null;
    if (sound) sfx.bad();
    dirty = true;
  }
  cv.addEventListener('pointerdown', (e) => {
    ensureAudio();
    if (screen !== 'play' || !game || game.over || drag) return;
    const p = pt(e);
    if (boostMode) { e.preventDefault(); boostTap(p); return; }
    const i = slotAt(p);
    if (i < 0 || !game.tray[i] || game.tray[i].used) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const touch = e.pointerType !== 'mouse';
    ret = null;
    drag = { i, id: e.pointerId, x: p.x, y: p.y, t0: now(), lift: liftFor(game.tray[i].cells, touch), r: null, c: null, valid: null, lines: null };
    updateDrag();
    sfx.pick(); buzz(6);
    dirty = true;
  });
  cv.addEventListener('pointermove', (e) => {
    if (boostMode === 'bomb' && !drag) { aim = cellAt(pt(e)); dirty = true; return; }
    if (!drag || e.pointerId !== drag.id) return;
    const p = pt(e);
    drag.x = p.x; drag.y = p.y;
    updateDrag();
    dirty = true;
  });
  cv.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pt(e);
    drag.x = p.x; drag.y = p.y;
    updateDrag();
    if (drag.valid) { const d = drag; drag = null; doPlace(d.i, d.r, d.c); }
    else cancelDrag(true);
  });
  cv.addEventListener('pointercancel', () => cancelDrag(false));
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- boosters (effects; counts, buying and ads live in the platform) ----------
  let consumeBooster = null;
  function boosterUsable(id) {
    if (!game || screen !== 'play' || mode === 'daily') return false;
    return id === 'undo' ? game.canUndo() : game.canBoost();
  }
  // The state changes first (core), then the effect plays on top of the new state: effects never delay or alter
  // the game, and input stays live while they run.
  function pressBooster(id, consume) {
    if (boostMode === id) { boostMode = null; aim = null; shell.setBoosterActive(null); dirty = true; return; }
    if (id === 'undo') {
      const before = game.board.slice(), lp = lastPlace;
      if (game.undo()) { consume(); fxUndo(lp, before); afterBoost('undo'); }
      return;
    }
    if (id === 'shuffle') {
      const old = game.tray.map((p, i) => (p.used ? null : { i, cells: p.cells, color: p.color })).filter(Boolean);
      if (game.shuffle()) { consume(); fxShuffle(old); afterBoost('shuffle'); }
      return;
    }
    boostMode = id; aim = null; consumeBooster = consume;
    shell.setBoosterActive(id);
    dirty = true;
  }
  function boostTap(p) {
    if (boostMode === 'rotate') {
      const i = slotAt(p);
      if (i < 0 || !game.tray[i] || game.tray[i].used) { boostMode = null; shell.setBoosterActive(null); return; }
      if (game.rotate(i)) { consumeBooster(); fxRotate(i); afterBoost('rotate'); }
      else sfx.bad();
    } else if (boostMode === 'bomb') {
      const c = cellAt(p);
      if (!c) { boostMode = null; aim = null; shell.setBoosterActive(null); return; }
      const res = game.bomb(c.r, c.c);
      if (res) { consumeBooster(); fxBomb(c.r, c.c, res); afterBoost('bomb'); }
    }
  }
  function afterBoost(id) {
    boostMode = null; aim = null; consumeBooster = null;
    lastBoost = { id, moves: game.moves };
    shell.setBoosterActive(null);
    P.track('booster_applied', { booster: id, mode, level: levelNo || 0 });
    updateHud(); saveRun(); P.commit();
    dirty = true;
    if (game.over) overTimer = setTimeout(gameOver, id === 'bomb' ? 1000 : 650);   // let the bomb's gems land first
  }

  // ---------- game flow ----------
  function doPlace(i, r, c) {
    const color = game.tray[i] && game.tray[i].color;
    const res = game.place(i, r, c);
    if (!res) return null;
    lastPlace = { i, r, c, cells: res.cells, color };
    const t = now(), set = {};
    res.cells.forEach((q) => { set[(r + q[0]) * N + c + q[1]] = 1; });
    placeFx = { t0: t, set };
    sfx.place(res.placed); buzz(8);
    if (res.lines) {
      const cr = r + dims(res.cells).h / 2, cc = c + dims(res.cells).w / 2;
      res.cleared.forEach((q) => {
        const qr = (q.i / N) | 0, qc = q.i % N;
        clearFx.push({ i: q.i, color: q.color, gem: q.gem, t0: t, delay: Math.hypot(qr - cr, qc - cc) * 28 });
      });
      sfx.clear(res.lines, res.combo);
      if (res.gems) setTimeout(sfx.gem, 220);
      buzz(res.lines > 1 ? [18, 40, 28] : 16);
      if (res.lines >= 2 || res.combo) shake = { t0: t, amp: Math.min(6, 2 + res.lines + res.combo) };
      const px = L.bx + cc * L.cell, py = L.by + cr * L.cell;
      let label = '+' + res.points;
      if (res.combo) label += '<small>' + TX.combo + ' ×' + (res.combo + 1) + '</small>';
      popup(px, py, label, res.lines >= 2 || res.combo > 0);
      if (res.allClear) setTimeout(() => popup(L.bx + L.bs / 2, L.by + L.bs / 2, TX.clean, true), 260);
      if (res.combo >= 2 || res.lines >= 3) {
        P.ads.happy();
        // a big moment: the platform may turn it into a lucky x2 (odds and daily cap in the platform config)
        P.moment(Math.max(res.combo + 1, res.lines));
      }
    }
    if (res.dealt) {
      const at = t + (res.lines ? 260 : 90);
      trayIn = [at, at + 60, at + 120];
      setTimeout(() => sfx.deal(), res.lines ? 260 : 90);
    }
    updateHud(); shell.refresh();
    saveRun(); P.commit();
    if (res.over) overTimer = setTimeout(gameOver, res.lines ? 750 : 420);
    dirty = true;
    return res;
  }

  function saveRun() {
    if (!game) return;
    const g = G();
    if (mode === 'daily') g.daily.run = { key: dayKey, g: game.toJSON() };
    else if (mode === 'level') P.data.progress.run = game.over ? null : { id: levelNo, g: game.toJSON() };
    else g.endless.run = game.over ? null : game.toJSON();
  }

  function updateHud() {
    if (!game) return;
    const best = $('best'), bi = best.querySelector('.bi');
    best.classList.remove('low');
    if (mode === 'level') {
      const p = game.goalProgress();
      $('score').innerHTML = ico(p.type === 'lines' ? 'lines' : p.type === 'gems' ? 'gem' : 'star') + '<span>' + p.have + '/' + p.target + '</span>';
      bi.innerHTML = '<use href="#i-moves"/>'; bi.style.display = '';
      $('best-v').textContent = game.movesLeft;
      best.classList.toggle('low', game.movesLeft <= 3);
    } else if (mode === 'daily') {
      bi.style.display = 'none';
      $('best-v').textContent = '#' + C.dayNumber(dayKey) + ' · ' + Math.min(game.trayNo, C.DAILY_TRAYS) + '/' + C.DAILY_TRAYS;
    } else {
      bi.innerHTML = '<use href="#i-crown"/>'; bi.style.display = '';
      $('best-v').textContent = Math.max(G().endless.best, game.score);
    }
  }

  // screens owned by the game (the shell owns levels / quests / shop)
  shell.register('menu', { el: 'menu', hud: { menu: true, coins: true, streak: true }, onShow: () => refreshMenu() });
  shell.register('play', { el: null, hud: { score: true, boosters: () => mode !== 'daily' } });
  shell.register('over', { el: null, hud: { score: true } });
  function onScreen(name, prev) {
    screen = name;
    if (name !== 'over') $('over').classList.remove('show');
    if (name === 'play' && !hidden) P.ads.gameplayStart(); else P.ads.gameplayStop();
    const wasGame = prev === 'play' || prev === 'over', isGame = name === 'play' || name === 'over';
    if (wasGame !== isGame || name === 'play') relayout();
    boostMode = null; aim = null;
    dirty = true;
  }
  const setScreen = (s) => shell.show(s);

  function begin(g, m) {
    clearTimeout(overTimer);
    game = g; mode = m;
    drag = null; ret = null; overFx = null; clearFx = []; parts = []; placeFx = null;
    fxList = []; fxLive = 0; lastBoost = null; lastPlace = null; shake = null;
    shown = g.score;
    if (m !== 'level') $('score').textContent = g.score;
    const t = now(); trayIn = [t, t + 60, t + 120];
    setScreen('play');
    updateHud();
    sfx.deal();
    if (g.over) { overFx = { t0: t - 2000 }; gameOver(true); return; }
    P.started({ mode: m, level: m === 'level' ? levelNo : 0 });
  }

  function startEndless(fresh) {
    levelNo = 0;
    const s = !fresh && G().endless.run;
    const g = s && C.Game.restore(s);
    if (g && !g.over) { begin(g, 'endless'); return; }
    begin(new C.Game({ seed: (Math.random() * 4294967296) >>> 0 }), 'endless');
  }

  function startDaily() {
    levelNo = 0;
    dayKey = todayKey();
    const s = G().daily.run;
    const g = s && s.key === dayKey && C.Game.restore(s.g);
    if (g) { begin(g, 'daily'); return; }
    if (G().daily.results[dayKey]) {
      const done = new C.Game({ seed: C.dailySeed(dayKey), daily: true });
      done.over = true;
      begin(done, 'daily');
      return;
    }
    begin(new C.Game({ seed: C.dailySeed(dayKey), daily: true }), 'daily');
  }

  function startLevel(n, fresh) {
    n = Math.max(1, Math.min(n, P.progress.unlocked(), Levels.COUNT));
    const run = !fresh && P.data.progress.run;
    const g = run && run.id === n && C.Game.restore(run.g);
    levelNo = n;
    if (g && !g.over) { begin(g, 'level'); return; }
    // every retry deals a new piece sequence (the first try is the bot-proven one); after 3+ fails in a row the
    // attempt is silently a bit kinder (levels.forAttempt). Attempts are counted in the game's own save.
    const tries = G().tries || (G().tries = {});
    const fails = P.progress.fails ? P.progress.fails(n) : 0;
    const def = Levels.forAttempt(n, tries[n] || 0, fails);
    tries[n] = (tries[n] || 0) + 1;
    begin(new C.Game({ seed: 0, level: def }), 'level');
  }

  // quest metrics this game reports ('boosters' is counted by the platform when one is used)
  function gameStats() {
    const p = game.goalProgress();
    return { score: game.score, lines: game.lines, pieces: game.moves, combo3: game.combo3 || 0, gems: game.gemsGot || 0,
      movesLeft: game.movesLeft || 0, progress: p ? p.have / p.target : 0 };
  }

  function gameOver(silent) {
    if (!game || !game.over) return;
    playedOne = true;
    const t = now();
    if (!overFx) overFx = { t0: t };
    setScreen('over');
    const grid = $('o-grid');
    grid.innerHTML = '';
    $('o-stars').classList.remove('show');
    $('o-next').hidden = true;
    $('o-share').hidden = true;
    $('o-streak').innerHTML = '';
    let sound = 'over', summary = null, canContinue = false;
    const firstTime = !silent;
    if (mode === 'daily') {
      let rec = G().daily.results[dayKey];
      if (!rec) {
        rec = { score: game.score, done: game.done, log: game.trayLog.slice() };
        G().daily.results[dayKey] = rec;
        summary = P.finished({ mode: 'daily', score: rec.score, stats: gameStats() });
        // ranking: the server replays the move log with the same seed before accepting the score
        P.submitScore({ mode: 'daily', day: dayKey, score: rec.score, moves: game.moveLog() });
      }
      if (rec.done) sound = 'win';
      $('o-title').textContent = rec.done ? TX.done : TX.over;
      $('o-score').textContent = rec.score;
      $('o-best').textContent = '#' + C.dayNumber(dayKey);
      $('o-best').classList.remove('new');
      for (let i = 0; i < C.DAILY_TRAYS; i++) {
        const n = rec.log[i], el = document.createElement('i');
        el.className = n === undefined ? 'miss' : n === 0 ? '' : n === 1 ? 'l1' : n === 2 ? 'l2' : 'l3';
        grid.appendChild(el);
      }
      $('o-streak').innerHTML = ico('flame') + ' ' + meta.liveStreak() + ' &nbsp;·&nbsp; ' + TX.next + ' <span id="o-nextday"></span>';
      tickNext();
      $('o-share').hidden = false;
      $('o-again').querySelector('span').textContent = TX.endless;
      lastShare = C.shareText({ score: rec.score, done: rec.done, trayLog: rec.log }, dayKey);
    } else if (mode === 'level') {
      const p = game.goalProgress();
      $('o-again').querySelector('span').textContent = TX.again;
      if (firstTime) {
        // a win within a few placements of a booster (or by the booster itself): the shell celebrates it
        if (game.won && lastBoost && P.boosterAssistedWin && game.moves - lastBoost.moves <= ASSIST_MOVES) {
          P.boosterAssistedWin({ booster: lastBoost.id, level: levelNo, movesAfter: game.moves - lastBoost.moves });
        }
        summary = P.finished({ mode: 'level', level: levelNo, won: game.won, stars: game.stars, score: game.score,
          difficulty: (game.level && game.level.difficulty) || Levels.tierOf(levelNo),
          stats: gameStats(), reason: game.outOfMoves ? 'moves' : 'stuck' });
      }
      if (game.won) {
        sound = 'win';
        $('o-title').textContent = TX.level + ' ' + levelNo;
        $('o-score').textContent = game.score;
        $('o-best').innerHTML = '';
        const st = $('o-stars'); st.classList.add('show');
        st.querySelectorAll('svg').forEach((s, k) => { s.classList.remove('on'); if (k < game.stars) setTimeout(() => { s.classList.add('on'); tone(hz(12 + k * 4), 0, 0.15, 'triangle', 0.08); }, 700 + k * 260); });
        $('o-next').hidden = levelNo >= Levels.COUNT;
      } else {
        $('o-title').textContent = game.outOfMoves ? TX.outMoves : TX.over;
        $('o-score').innerHTML = p.have + '<span style="color:var(--mute);font-size:.5em">/' + p.target + '</span>';
        $('o-best').innerHTML = TX.level + ' ' + levelNo;
        canContinue = !game.continued;
      }
    } else {
      let best = G().endless.best, isNew = false;
      if (firstTime) {
        if (game.score > best) { isNew = best > 0; best = game.score; G().endless.best = best; }
        summary = P.finished({ mode: 'endless', score: game.score, stats: gameStats() });
      }
      if (isNew) sound = 'win';
      $('o-title').textContent = TX.over;
      $('o-score').textContent = game.score;
      $('o-best').innerHTML = isNew ? TX.newBest : ico('crown') + ' ' + best;
      $('o-best').classList.toggle('new', isNew);
      canContinue = !game.continued;
      $('o-again').querySelector('span').textContent = TX.again;
    }
    // coins, double-coins and continue (ad or coins) are the platform's
    shell.result(firstTime ? summary : null, { available: canContinue, onRevive: revive });
    saveRun(); P.commit();
    updateHud();
    if (!silent) { if (sound === 'win') sfx.win(); else sfx.over(); buzz(sound === 'win' ? [20, 50, 20, 50, 40] : 40); }
    setTimeout(() => { if (screen === 'over') $('over').classList.add('show'); }, silent ? 0 : 650);
  }

  function tickNext() {
    const el = document.getElementById('o-nextday');
    if (!el) return;
    const d = new Date(), m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const s = Math.max(0, Math.floor((m - d) / 1000));
    el.textContent = String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  }
  setInterval(() => { if (screen === 'over' && mode === 'daily') tickNext(); }, 1000);

  function revive() {
    const before = game.board.slice();
    if (!game.revive()) return;
    const t = now();
    before.forEach((v, i) => { if (v !== -1 && game.board[i] === -1) clearFx.push({ i, color: v, t0: t, delay: ((i / N) | 0) * 25 }); });
    overFx = null;
    trayIn = [t, t + 60, t + 120];
    sfx.clear(4, 1);
    setScreen('play');
    updateHud();
    saveRun(); P.commit();
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  function share() {
    const text = lastShare, touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.share) navigator.share({ text }).catch((e) => { if (!e || e.name !== 'AbortError') copy(text).then((ok) => ok && toast(TX.copied)); });
    else copy(text).then((ok) => toast(ok ? TX.copied : text.split('\n')[0]));
  }

  // ---------- menu ----------
  function refreshMenu() {
    dayKey = todayKey();
    const p = dayKey.split('-');
    const dateStr = LANG === 'es' ? (+p[2]) + ' ' + TX.months[+p[1] - 1] : TX.months[+p[1] - 1] + ' ' + (+p[2]);
    const rec = G().daily.results[dayKey];
    $('m-daily-sub').textContent = '#' + C.dayNumber(dayKey) + ' · ' + dateStr + (rec ? ' · ' + rec.score : '');
    $('m-daily-tag').innerHTML = rec ? '✓' : '';
    $('m-adv-sub').textContent = TX.level + ' ' + Math.min(P.progress.unlocked(), Levels.COUNT);
    $('m-adv-tag').innerHTML = ico('star') + P.progress.total();
    const run = G().endless.run;
    $('m-endless-sub').innerHTML = ico('crown') + ' ' + G().endless.best + (run && !run.over ? ' &nbsp;▸ ' + run.score : '');
  }
  function toMenu() {
    if (drag) cancelDrag(false);
    saveRun(); P.commit();
    setScreen('menu');
  }

  // ---------- buttons ----------
  function tap(id, fn) { $(id).addEventListener('click', (e) => { ensureAudio(); fn(e); }); }
  tap('m-daily', startDaily);
  tap('m-endless', () => startEndless(false));
  tap('m-adv', () => setScreen('levels'));
  // interstitials only after a tap on the result screen (Next / Again / Home): a natural break.
  const fromResult = (ctx, fn) => { if (screen === 'over' && playedOne) P.afterResult(ctx, fn); else fn(); };
  tap('b-home', () => {
    const go = () => { if (mode === 'level' && (screen === 'play' || screen === 'over')) { saveRun(); P.commit(); setScreen('levels'); } else toMenu(); };
    if (screen === 'over') fromResult(mode === 'level' ? 'level' : 'game', go); else go();
  });
  tap('o-share', share);
  tap('o-again', () => fromResult(mode === 'level' ? 'level' : 'game', () => { if (mode === 'level') startLevel(levelNo, true); else startEndless(true); }));
  tap('o-next', () => fromResult('level', () => startLevel(levelNo + 1, true)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && screen !== 'menu') { if (boostMode) { boostMode = null; shell.setBoosterActive(null); } else toMenu(); }
    if (e.key === 'm' || e.key === 'M') $('b-sound').click();
  });

  // ---------- lifecycle: pause on hidden, ad pause hooks ----------
  function onHidden(h) {
    hidden = h;
    if (h) {
      if (drag) cancelDrag(false);
      saveRun(); P.commit();
      P.ads.gameplayStop();
      if (actx && actx.state === 'running') actx.suspend().catch(() => {});
    } else {
      if (screen === 'play' && !adPaused) P.ads.gameplayStart();
      if (actx && !adPaused) actx.resume().catch(() => {});
      if (screen === 'menu') { refreshMenu(); shell.refresh(); }
      dirty = true;
    }
  }
  document.addEventListener('visibilitychange', () => onHidden(document.hidden));
  window.addEventListener('pagehide', () => { saveRun(); P.commit(); });
  window.addEventListener('blur', () => { if (drag) cancelDrag(false); });
  P.ads.hooks.pause = () => { adPaused = true; if (drag) cancelDrag(false); if (actx) actx.suspend().catch(() => {}); };
  P.ads.hooks.resume = () => { adPaused = false; if (actx && !hidden) actx.resume().catch(() => {}); };

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);

  // ---------- test / integration hooks ----------
  window.Teselo = {
    get game() { return game; },
    get screen() { return screen; },
    get mode() { return mode; },
    get layout() { return L; },
    P, shell, funUI, core: C, levels: Levels,
    get eco() { return eco; },
    get meta() { return meta; },
    dayKey: () => dayKey,
    startLevel: (n) => startLevel(n, true),
    // test-only: one placement through the normal game flow (score, clears, result screen, ranking submit)
    place: (i, r, c) => !!doPlace(i, r, c),
    startDaily: () => startDaily(),
    // test-only: booster effects running (effects + live particles), reduced-motion mode
    fx: { active: () => fxList.length + fxLive, particles: () => fxLive, reduced: () => reduced(), types: () => fxList.map((f) => f.type) },
    slotPoint(i) {
      const r = cv.getBoundingClientRect(), p = game.tray[i], pos = slotPiecePos(i, p.cells, L.tcell), d = dims(p.cells);
      return { x: r.left + pos.x + d.w * L.tcell / 2, y: r.top + pos.y + d.h * L.tcell / 2 };
    },
    cellPoint(row, col) { const r = cv.getBoundingClientRect(); return { x: r.left + L.bx + (col + 0.5) * L.cell, y: r.top + L.by + (row + 0.5) * L.cell }; },
    dropPoint(i, row, col, touch) {
      const r = cv.getBoundingClientRect(), p = game.tray[i], d = dims(p.cells);
      return { x: r.left + L.bx + (col + d.w / 2) * L.cell, y: r.top + L.by + (row + d.h / 2) * L.cell + liftFor(p.cells, touch) };
    },
    // test-only: load a board / tray (the Playwright suite stages a line clear and a game over with it)
    stage(board, shapes) {
      if (board) game.board = board.slice();
      if (shapes) game.tray = shapes.map((s, k) => ({ shape: s, cells: C.SHAPES[s].cells, color: k % C.COLORS, used: false }));
      game.over = false; game.stuck = false;
      shell.refresh();
      dirty = true;
    }
  };

  // ---------- boot ----------
  applyTheme();
  resize();
  setScreen('menu');
  game = new C.Game({ seed: C.dailySeed('preview') });
  requestAnimationFrame(frame);
  P.init().then(() => { shell.refresh(); });
})();
