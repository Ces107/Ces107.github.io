/* Teselo 1.1.0 | (c) Cesar Pereiro | all code and sounds original, no third-party assets */

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
    coins: {
      modes: {},             // { endless: { base: 0, per100: 1 }, ... }   coins = base + floor(score/100) * per100
      levelWin: 10,          // any level win
      perNewStar: 6,         // each star above the previous best on that level
      firstThreeStars: 15,   // bonus the first time a level gets 3 stars
      doubleWithAd: true     // R2: rewarded ad doubles the coins of one result screen
    },

    // ---- boosters: ids, start counts and prices come from the game ----
    boosters: { start: {}, price: {}, max: 99 },
    continueCoins: 150,      // continue without an ad (fail screen); retry is always free, no lives

    // ---- cosmetics: provided by the game (price: coins | iap: product id | passOnly | starterOnly) ----
    skins: [],

    // ---- chests: EARNED by play only. Timer based. FIXED contents, shown on the chest. Never sold. ----
    chests: {
      slots: 4,
      // rarity tiers: common / rare / epic / legendary (colours in shell/fun.css)
      types: {
        wood: { unlockMin: 15, coins: 30, boosters: 1, rarity: 'common' },
        silver: { unlockMin: 60, coins: 90, boosters: 2, rarity: 'rare' },
        gold: { unlockMin: 180, coins: 220, boosters: 3, rarity: 'epic' },
        crystal: { unlockMin: 360, coins: 500, boosters: 5, rarity: 'legendary' }
      },
      order: ['wood', 'silver', 'gold', 'crystal'],
      // lucky upgrade when opening a chest EARNED by play: chance to become the next tier (shown on the chest).
      // Chests from paid sources (premium pass) are fixed and never roll.
      lucky: { wood: 0.10, silver: 0.06, gold: 0.03 },
      boosterOrder: [],      // game: which boosters a chest gives, in order
      levelMilestone: 5,     // a silver chest every 5 levels won for the first time
      adSkipsPerDay: 3       // R3: a rewarded ad opens the chest that is unlocking
    },

    // ---- streak (Duolingo-style flame) ----
    streak: {
      freezePrice: 200, maxFreezes: 2, startFreezes: 1,
      milestones: { 3: 50, 7: 100, 14: 200, 30: 400, 100: 1000 },  // coins, once each
      repairEveryDays: 7,    // R5: one rewarded streak repair per 7 days, for a streak broken yesterday
      multipliers: { 3: 1.1, 7: 1.2, 14: 1.3, 30: 1.5 },          // game coins x by live streak (not level/quest coins)
      gifts: { 3: { spins: 1 }, 7: { chest: 'silver' }, 14: { chest: 'gold', spins: 1 }, 30: { chest: 'crystal', spins: 2 } }  // fixed, once each
    },

    // ---- daily prize wheel: free spin + 1 rewarded-ad spin per day + spins EARNED by play. Never sold. ----
    //      weights are the exact odds shown in the (i) sheet (weight / sum). Expected value ~45 coins / spin.
    wheel: {
      freePerDay: 1, adPerDay: 1, maxBank: 5,
      questSpins: 1,         // claiming all daily quests banks a spin
      segments: [
        { id: 'c10', weight: 26, reward: { coins: 10 } },
        { id: 'c20', weight: 22, reward: { coins: 20 } },
        { id: 'c40', weight: 16, reward: { coins: 40 } },
        { id: 'boost', weight: 14, reward: { booster: 1 } },
        { id: 'c80', weight: 9, reward: { coins: 80 } },
        { id: 'chest1', weight: 7, reward: { chest: 'wood' } },
        { id: 'chest2', weight: 4, reward: { chest: 'silver' } },
        { id: 'skin', weight: 2, reward: { skin: true, orCoins: 150 } }
      ]
    },

    // ---- player level (lifetime XP, same XP as the pass): need(n) = base + step * (n - 1) ----
    levels: { base: 120, step: 30, coins: 30, coinsStep: 5, spinEvery: 3, chestEvery: 5, chest: 'silver' },

    // ---- lucky moment: the game reports a big moment (combo); chance of x2 game coins, bounded ----
    lucky: { chance: 0.12, minStrength: 3, maxPerDay: 2, mult: 2, cap: 150 },

    // ---- weekly league: 30 players, top 5 up, bottom 5 down, chest by rank. League points = XP this week ----
    league: {
      tiers: ['bronze', 'silver', 'gold', 'sapphire', 'ruby', 'emerald', 'amethyst', 'diamond'],
      size: 30, promote: 5, demote: 5,
      base: 420, growth: 1.18,           // rivals' typical week at tier t: base * growth^t (nudged by the player's own pace)
      rewards: [{ to: 1, chest: 'gold' }, { to: 3, chest: 'silver' }, { to: 10, chest: 'wood' }],
      legendaryFrom: 4                   // 1st place from tier 4 (ruby) up gets the legendary chest
    },

    // ---- ranking (daily challenge): rewards granted by the server next login; CPU rivals top up thin tables ----
    ranking: { rewards: { top3: 300, top10: 120, play: 30 }, fillTo: 20, botScore: {} },

    // ---- gamekit-api (build sets window.GAMEKIT_API; empty = offline only) ----
    online: { timeoutMs: 9000 },

    // ---- other rewarded placements (opt-in) ----
    rewarded: {
      dailyGiftBoosters: 1,  // R4: once a day, one booster of the player's choice
      shopCoins: 30,         // R6: free coins in the shop
      shopCoinsPerDay: 3
    },

    // ---- quests: the pool (metrics the game reports) comes from the game ----
    quests: { dailyCount: 3, weeklyCount: 3, daily: [], weekly: [], allDailyChest: 'wood', allWeeklyChest: 'gold' },

    // ---- season pass: free row for everyone, premium row = one non-consumable product per season ----
    pass: {
      seasonDays: 28,
      tiers: 30,
      xpPerTier: 100,
      xp: { game: 10, daily: 25, levelWin: 20, star: 5 },
      // games override these two with their own skins / boosters
      free: function (t) { return t % 5 === 0 ? { chest: 'silver' } : { coins: 40 }; },
      premium: function (t) { return t % 5 === 0 ? { chest: 'gold' } : { coins: 80 }; }
    },

    // ---- offers ----
    starterPack: { afterLevel: 10, windowHours: 72 },
    piggy: { share: 0.10, breakAt: 1500, cap: 3000 },

    // ---- feature unlock order (avoid day-1 overload): reached level OR finished games ----
    unlocks: {
      boosters: { level: 3, games: 2 },
      quests: { level: 5, games: 4 },
      chests: { level: 8, games: 6 },
      pass: { level: 15, games: 12 },
      freeze: { days: 2 },
      starter: { level: 10 },
      piggy: { level: 20 }
    },

    // ---- ads policy (the adapter enforces it) ----
    ads: {
      interstitialMinGapMs: 180000,  // >= 3 minutes apart, none in the first 3 minutes, none 3 min after a rewarded
      levelsBetweenInterstitials: 2, // only after every 2nd finished level / game
      graceLevel: 8,                 // day 0: none before level 8 ...
      graceGames: 3,                 // ... or the 3rd finished non-level game
      continueExtraMoves: 5,
      maxAdContentRating: 'T'
    },

    // ---- store (Google Play Billing; ids must match the Play Console). Prices are fallbacks: cards show the
    //      store's localised price (IAP.price) and exactly what each item grants. Games append their own. ----
    products: [
      { id: 'remove_ads', type: 'non_consumable', price: '4,99 €', grant: { noAds: true } },
      { id: 'coins_s', type: 'consumable', price: '1,99 €', grant: { coins: 1200 } },
      { id: 'coins_m', type: 'consumable', price: '4,99 €', grant: { coins: 3500 } },
      { id: 'coins_l', type: 'consumable', price: '9,99 €', grant: { coins: 8000 } },
      { id: 'piggy_bank', type: 'consumable', price: '2,99 €', offer: 'piggy', grant: { piggy: true } },
      // one product per season: pass_s01, pass_s02, ... (meta.passProductId())
      { id: 'pass_s{NN}', type: 'non_consumable', price: '4,99 €', season: true, grant: { passPremium: true } }
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
 *        reward: {coins, boosters:{id:n}, skin, noAds, noAdsDays, passPremium:'s3', piggy, chest, xp, freeze}
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
      noAds: false, noAdsUntil: 0, passPremium: {}, piggy: 0, owned: [], earned: 0, spent: 0 };
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

    var eco = {
      state: state,
      get coins() { return state.coins; },
      get noAds() { return !!state.noAds || now() < state.noAdsUntil; },
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
      levelCoins: function (stars, prevStars) {
        var c = cfg.coins, prev = prevStars || 0;
        var n = c.levelWin + Math.max(0, stars - prev) * c.perNewStar;
        if (stars === 3 && prev < 3) n += c.firstThreeStars;
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

/* ---- gamekit/ads/ads.js ---- */
/* gamekit ads adapter.
 *
 * The game only ever calls this small interface:
 *   Ads.init()                 -> Promise, resolves when the provider is ready (or at once)
 *   Ads.loadingDone()          -> the game finished loading
 *   Ads.gameplayStart()        -> a round is being played
 *   Ads.gameplayStop()         -> menu, game over, pause, tab hidden
 *   Ads.showInterstitial(ctx)  -> Promise; between games only, at most once every 3 minutes, never in the
 *                                 first 3 minutes or 3 minutes after a rewarded, never when "remove ads" was bought,
 *                                 only every 2nd finished level/game (Ads.levelEnded()), only if already preloaded,
 *                                 and only if the game's gate (Ads.setGate: day-0 grace) agrees
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

  var MIN_GAP = 180000; // 3 minutes between interstitials (CrazyGames and Poki also throttle on their side)
  var lastAd = Date.now(); // no interstitial in the first 3 minutes either (never on launch)
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
  // window.GAMEKIT_ADMOB = { interstitial: 'ca-app-pub-.../...', rewarded: 'ca-app-pub-.../...', testing: true }
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
            return A.initialize({ initializeForTesting: !!ids.testing, maxAdContentRating: policy.maxAdContentRating || 'T',
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
    // policy: config.ads ({interstitialMinGapMs, levelsBetweenInterstitials}); "remove ads" purchase
    setPolicy: function (p) {
      policy = p || {};
      if (p && p.interstitialMinGapMs) MIN_GAP = p.interstitialMinGapMs;
      if (p && p.levelsBetweenInterstitials) LEVEL_GAP = p.levelsBetweenInterstitials;
    },
    setNoAds: function (on) { noAds = !!on; },
    // plug a custom provider object (same shape as `none` above): tests, or a portal not listed here
    useProvider: function (p, resetClock) { impl = p || none; if (resetClock) { lastAd = 0; levelsSince = 0; } },
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
      if (busy || noAds || impl === none || Date.now() - lastAd < MIN_GAP || levelsSince < LEVEL_GAP) return false;
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
          if (shown) { lastAd = Date.now(); levelsSince = 0; api.track('ad_shown', { type: 'interstitial', provider: impl.name }); }
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
          if (impl !== none) { lastAd = Date.now(); api.track('ad_shown', { type: 'rewarded', provider: impl.name, placement: placement || '' }); }
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
      price: function (id) { var p = store.get(id, P); return p && p.pricing ? p.pricing.price : null; }
    };
  }

  var impl = none, wanted = root.GAMEKIT_IAP || 'none';
  try { if (/[?&]iap=test/.test(root.location.search)) wanted = 'test'; } catch (e) { /* ignore */ }

  var api = {
    get provider() { return impl.name; },
    get available() { return impl.available; },
    init: function (products) {
      catalog = products || [];
      byId = {};
      catalog.forEach(function (p) { byId[p.id] = p; });
      impl = wanted === 'play' ? (play() || none) : wanted === 'test' ? test : none;
      return Promise.resolve().then(function () { return impl.init(); }).catch(function () { impl = none; });
    },
    price: function (id) { return impl.price(id) || (byId[id] && byId[id].price) || ''; },
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
 * Everything else (wallet, quests, streak, pass, chests, ads policy, store, save) stays inside the platform.
 */
(function (root) {
  'use strict';
  var req = function (p) { return typeof require === 'function' ? require(p) : null; };
  var U = root.GamekitUtil || req('./util.js'), Economy = root.GamekitEconomy || req('../economy/economy.js');
  var Meta = root.GamekitMeta || req('./meta.js'), Save = root.GamekitSave || req('./save.js'), Remote = root.GamekitRemote || req('./remote.js');
  var Ads = root.Ads || req('../ads/ads.js'), IAP = root.IAP || req('../iap/iap.js'), An = root.Analytics || req('./analytics.js');
  var Fun = root.GamekitFun || req('./fun.js'), League = root.GamekitLeague || req('./league.js'), Online = root.GamekitOnline || req('./online.js');

  function mergeConfig(platform, game) { return U.merge(platform, game, ['products', 'skins']); }

  function create(opts) {
    var cfg = opts.config;
    Remote.boot(cfg);                                  // before anything reads a number
    var today = opts.today || function () { return U.dateKey(new Date()); };
    var gameId = (cfg.game && cfg.game.id) || 'game';
    var listeners = {};
    function emit(ev, a, b) { (listeners[ev] || []).forEach(function (fn) { try { fn(a, b); } catch (e) { if (root.console) root.console.error(e); } }); }

    var save = Save.create({ key: gameId + '.save', defaults: function () {
      return { settings: { muted: false, theme: null }, progress: { stars: {}, unlocked: 1, run: null },
        economy: Economy.defaults(cfg), meta: Meta.defaults(cfg), fun: Fun.defaults(), league: League.defaults(),
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
    // day-0 grace: no interstitial before level N or the Nth finished non-level game on the first day
    Ads.setGate(function () {
      var d = D();
      return d.meta.firstDay !== today() || d.progress.unlocked >= cfg.ads.graceLevel || nonLevelGames() >= cfg.ads.graceGames;
    });
    function nonLevelGames() { var b = D().stats.byMode || {}, n = 0; Object.keys(b).forEach(function (k) { if (k !== 'level') n += b[k]; }); return n; }

    var P = {
      cfg: cfg, save: save, eco: eco, meta: meta, fun: fun, league: league, online: online, ads: Ads, iap: IAP, track: hooks.track, today: today,
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
          if (r.won) {
            var prev = d.progress.stars[r.level] || 0;
            out.prevStars = prev;
            d.progress.stars[r.level] = Math.max(prev, r.stars || 1);
            d.progress.unlocked = Math.max(d.progress.unlocked, r.level + 1);
            out.coins = eco.earn(eco.levelCoins(r.stars || 1, prev), 'level');
            out.quests = meta.onGameEnd('level', stats);
            var w = meta.onLevelWin(r.level, r.stars || 1, prev, prev === 0);
            out.chest = w.chest;
            out.quests = out.quests.concat(w.quests);
            d.stats.levels++;
            hooks.track('level_complete', { level: r.level, stars: r.stars, score: r.score, moves_left: stats.movesLeft || 0, boosters: stats.boosters || 0 });
          } else {
            out.quests = meta.onGameEnd('level', stats);
            hooks.track('level_fail', { level: r.level, reason: r.reason || '', progress: stats.progress || 0 });
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
        out.streakGift = meta.lastStreak && meta.lastStreak.gift;
        out.surprise = meta.lastStreak && meta.lastStreak.surprise;   // streak gift day 3/7/14/30
        meta.lastStreak = null;
        // streak flame multiplier on this result's coins, then the lucky moment (both bounded, see MONETIZATION.md A)
        var base = out.coins;
        out.mult = fun.streakMult(meta.liveStreak());
        if (out.mult > 1 && base > 0) out.coins += eco.earn(Math.round(base * (out.mult - 1)), 'streak_mult');
        out.lucky = fun.applyLucky(base);
        out.coins += out.lucky;
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
      canDouble: function (n) { return n > 0 && cfg.coins.doubleWithAd && Ads.rewardedReady(); },
      doubleCoins: function (n, cb) {
        Ads.showRewarded(function (ok) { if (ok) { eco.earn(n, 'double_coins'); save.commit(); } cb(ok); }, 'double_coins');
      },
      // interstitial at a natural break: call from a result-screen tap (Next / Again / Home), then fn()
      afterResult: function (ctx, fn) { Ads.showInterstitial(ctx).then(fn, fn); },

      // ---- boosters: the platform owns counts; the game owns the effect ----
      // cb(true) when one is available (owned, bought with coins, or earned with a rewarded ad)
      acquireBooster: function (id, cb) {
        if (eco.boosters(id) > 0) { cb(true, 'owned'); return; }
        if (eco.buyBooster(id)) { save.commit(); cb(true, 'coins'); return; }
        if (Ads.rewardedReady()) { Ads.showRewarded(function (ok) { if (ok) eco.addBooster(id, 1, 'ad'); cb(ok, 'ad'); }, 'booster'); return; }
        cb(false, 'price');
      },
      useBooster: function (id) { var ok = eco.useBooster(id); if (ok) { meta.progress('boosters', 1); save.commit(); } return ok; },

      // ---- purchases (everything real-money goes through the IAP adapter) ----
      grantProduct: function (p, quiet) {
        if (!p) return null;
        if (p.type !== 'consumable' && eco.ownsProduct(p.id)) return null; // restore never grants twice
        var got = eco.grant(p.season ? { passPremium: meta.seasonKey() } : p.grant, 'iap_' + p.id);
        if (p.type !== 'consumable') eco.markProduct(p.id);
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
        var iapReady = IAP.init(P.products()).then(function () { if (IAP.available) return P.restore(false); });
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
 *
 *   var shell = GamekitShell.create(P, opts)
 *   opts.ids: { '<default id>': '<id in this page>' } remaps the element ids below (embedded games use the gk-* ids
 *   that GamekitEmbed.mount() creates). Every element is optional: a missing one is skipped.
 */
(function (root) {
  'use strict';

  var TEXTS = {
    en: { claim: 'Claim', open: 'Open', dailyQ: 'TODAY', weeklyQ: 'THIS WEEK', boosters: 'BOOSTERS', blocks: 'SKINS', boards: 'BOARDS',
      streak: 'STREAK', store: 'STORE', equip: 'Use', removeAds: 'No ads', pass: 'Pass', wait: 'One chest at a time', min: 'min', h: 'h', d: 'd',
      free: 'FREE', starter: 'Starter pack', piggy: 'Piggy bank', passWhat: 'Premium row: coins, gold chests, 2 skins', restore: 'Restore purchases',
      legal: 'Purchases & refunds', privacy: 'Privacy options', cont: 'Continue',
      legalText: 'Prices include VAT and are charged by Google Play. Every item gives exactly what its card shows; nothing is random. EU right of withdrawal: 14 days, which ends once a digital item is delivered with your consent. Refund requests: Google Play, Order history.',
      q: {}, skins: {} },
    es: { claim: 'Recoger', open: 'Abrir', dailyQ: 'HOY', weeklyQ: 'ESTA SEMANA', boosters: 'AYUDAS', blocks: 'ASPECTOS', boards: 'TABLEROS',
      streak: 'RACHA', store: 'TIENDA', equip: 'Usar', removeAds: 'Sin anuncios', pass: 'Pase', wait: 'Un cofre cada vez', min: 'min', h: 'h', d: 'd',
      free: 'GRATIS', starter: 'Pack inicial', piggy: 'Hucha', passWhat: 'Fila premium: monedas, cofres de oro, 2 aspectos', restore: 'Restaurar compras',
      legal: 'Compras y reembolsos', privacy: 'Privacidad', cont: 'Seguir',
      legalText: 'Precios con IVA, cobrados por Google Play. Cada artículo da exactamente lo que indica su tarjeta; nada es aleatorio. Derecho de desistimiento UE: 14 días, que se pierde al entregar el contenido digital con tu consentimiento. Reembolsos: Google Play, Historial de pedidos.',
      q: {}, skins: {} }
  };

  function create(P, opts) {
    var IDS = opts.ids || {};
    var doc = root.document, $ = function (id) { return id ? doc.getElementById(IDS[id] || id) : null; };
    var cfg = P.cfg, eco = P.eco, meta = P.meta, Ads = P.ads, IAP = P.iap;
    // opts.lang: a game that only exists in one language (Atascazo, Hilvana) pins the platform texts to it
    var lang = opts.lang || (String(root.navigator.language || 'en').toLowerCase().indexOf('es') === 0 ? 'es' : 'en');
    var TX = Object.assign({}, TEXTS[lang], (opts.texts || {})[lang] || {});
    var sfx = Object.assign({ coin: noop, win: noop, bad: noop, pick: noop, tick: noop }, opts.sfx || {});
    var ico = function (id, cls) { return '<svg' + (cls ? ' class="' + cls + '"' : '') + '><use href="#i-' + id + '"/></svg>'; };
    var screens = {}, screen = null, legalOpen = false, lvBuilt = false;
    var BOOST = (opts.boosters && opts.boosters.ids) || [];
    function noop() {}

    // ---------- screens ----------
    // def: { el: element id or null, hud: { menu, score, coins, streak, boosters: bool | fn }, onShow, sheet }
    // sheet: a platform sheet (body class gk-open while it is up; embedded games show the gamekit bar then)
    var SHEETS = {
      levels: { el: 'levels', hud: { coins: true }, sheet: true, onShow: function () { renderLevels(); } },
      quests: { el: 'quests', hud: { coins: true }, sheet: true, onShow: function () { renderQuests(); } },
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
        var n = on ? claimable() : 0;
        $(opts.quests.badge).textContent = n ? String(n) : '';
      }
      renderBoosters();
    }
    P.on('wallet', refresh);
    P.on('ads', function () { doc.body.classList.toggle('no-ads', Ads.provider === 'none'); refresh(); });
    P.on('granted', function (got, quiet) { if (!quiet) toast(rewardText(got) || '✓'); if (screen === 'shop') renderShop(); });
    P.on('skin', function () { if (opts.onSkin) opts.onSkin(); });

    function toast(html) {
      var el = $('toast');
      if (!el) return;
      el.innerHTML = html;
      el.classList.add('show');
      clearTimeout(toast.t);
      toast.t = setTimeout(function () { el.classList.remove('show'); }, 1700);
    }
    function rewardText(got) {
      var parts = [];
      if (!got) return '';
      if (got.coins) parts.push('+' + got.coins + ' ' + ico('coin'));
      if (got.boosters) Object.keys(got.boosters).forEach(function (k) { parts.push('+' + got.boosters[k] + ' ' + ico(k)); });
      if (got.chest || got.chest2) parts.push('+1 ' + ico('chest'));
      if (got.skin) parts.push(TX.skins[got.skin] || got.skin);
      if (got.noAds) parts.push(TX.removeAds);
      return parts.join(' &nbsp;');
    }
    function contentsHtml(c) {
      var out = [];
      if (c.coins) out.push(c.coins + ' ' + ico('coin'));
      if (c.boosters) Object.keys(c.boosters).forEach(function (k) { out.push(c.boosters[k] + ' ' + ico(k)); });
      if (c.skin) out.push(TX.skins[c.skin] || c.skin);
      if (c.noAds) out.push(TX.removeAds);
      if (c.noAdsDays) out.push(TX.removeAds + ' ' + c.noAdsDays + TX.d);
      return out.join(' · ');
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

    // ---------- level map ----------
    function renderLevels() {
      var L = opts.levels, grid = $('lv-grid');
      if (!L || !grid) return;
      var chapter = L.chapter || 15, unlockedTo = Math.min(P.progress.unlocked(), L.count);
      if (!lvBuilt) {
        var html = '';
        for (var n = 1; n <= L.count; n++) {
          if ((n - 1) % chapter === 0) html += '<h4>' + n + '–' + Math.min(n + chapter - 1, L.count) + '</h4>';
          html += '<button class="lv" data-n="' + n + '"><span>' + n + '</span><i></i></button>';
        }
        grid.innerHTML = html;
        grid.addEventListener('click', function (e) {
          var b = e.target.closest('.lv');
          if (!b || b.classList.contains('lock')) return;
          if (opts.onTap) opts.onTap();
          L.start(+b.dataset.n);
        });
        lvBuilt = true;
      }
      grid.querySelectorAll('.lv').forEach(function (b) {
        var n = +b.dataset.n, st = P.progress.stars(n), lock = n > P.progress.unlocked();
        b.classList.toggle('lock', lock);
        b.classList.toggle('cur', n === unlockedTo);
        b.querySelector('i').innerHTML = lock ? ico('lock', 'lk') : [0, 1, 2].map(function (k) { return ico('star', k < st ? 'on' : ''); }).join('');
      });
      if ($('lv-stars')) $('lv-stars').textContent = P.progress.total();
      var cur = grid.querySelector('.lv.cur');
      if (cur) setTimeout(function () { cur.scrollIntoView({ block: 'center' }); }, 30);
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
    function renderQuests() {
      if (!$('qlist') || !$('chests') || !$('pass')) return;
      var showChests = P.unlocked('chests'), html = '';
      if (showChests) {
        for (var i = 0; i < cfg.chests.slots; i++) {
          var st = meta.chestState(i);
          if (!st) { html += '<div class="chest empty"></div>'; continue; }
          var o = meta.chestOdds(st.type), what = meta.chestContents(st.type);
          var canSkip = st.status === 'unlocking' && Ads.rewardedReady() && meta.canAdSkip();
          var label = st.status === 'ready' ? TX.open : st.status === 'unlocking' ? fmtLeft(st.msLeft) + (canSkip ? ' ' + ico('ad') : '')
            : (o.unlockMin >= 60 ? o.unlockMin / 60 + ' ' + TX.h : o.unlockMin + ' ' + TX.min);
          // rarity colour + the lucky-upgrade chance, shown before opening
          html += '<button class="chest ' + st.type + ' r-' + (o.rarity || 'common') + (st.status === 'ready' ? ' ready' : '') + '" data-i="' + i + '">' + ico('chest') +
            '<span>' + label + '</span><small>' + contentsHtml(what).replace(' · ', '<br>') + '</small>' +
            (st.lucky ? '<small class="luck">✦ ' + Math.round(st.lucky * 100) + '%</small>' : '') + '</button>';
        }
      }
      $('chests').innerHTML = html;
      $('chests').style.display = showChests ? '' : 'none';
      if (P.unlocked('pass')) {
        var ps = P.data.meta.pass, tier = meta.passTier(), into = ps.xp - tier * cfg.pass.xpPerTier, pend = unclaimedPass(), max = tier >= cfg.pass.tiers;
        $('pass').innerHTML = '<span class="tier">' + tier + '</span><div><div style="font-size:12px;color:var(--mute);margin-bottom:5px">' + TX.pass + ' · ' +
          (max ? 'MAX' : into + '/' + cfg.pass.xpPerTier) + '</div><div class="bar"><i style="width:' + (max ? 100 : into / cfg.pass.xpPerTier * 100) + '%"></i></div></div>' +
          (pend.length ? '<button class="mini pri" id="pass-claim">' + TX.claim + ' ' + pend.length + '</button>' : '<span></span>');
        $('pass').style.display = '';
      } else $('pass').style.display = 'none';
      var qs = meta.quests();
      var row = function (q) {
        return '<div class="q' + (q.claimed ? ' claimed' : '') + '"><span class="t">' + questText(q) + '</span>' +
          '<span class="r">' + (q.done && !q.claimed ? '<button class="mini pri" data-q="' + q.id + '">' + TX.claim + '</button>' : '<span class="mini">+' + q.reward.coins + ' ' + ico('coin') + '</span>') + '</span>' +
          '<div><div class="bar"><i style="width:' + (q.progress / q.target * 100) + '%"></i></div><span class="n">' + q.progress + '/' + q.target + '</span></div></div>';
      };
      $('qlist').innerHTML = '<h4>' + TX.dailyQ + '</h4>' + qs.filter(function (q) { return q.kind === 'daily'; }).map(row).join('') +
        '<h4>' + TX.weeklyQ + '</h4>' + qs.filter(function (q) { return q.kind === 'weekly'; }).map(row).join('');
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
      if (q) { var got = meta.claimQuest(q.dataset.q); if (got) { sfx.coin(); toast(rewardText(got)); } }
      if (pc) { var all = {}; unclaimedPass().forEach(function (x) { var g = meta.claimPass(x[0], x[1]); if (g) mergeGot(all, g); }); sfx.coin(); toast(rewardText(all)); }
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
      P.commit(); renderQuests(); refresh();
    });
    setInterval(function () { if (screen === 'quests') renderQuests(); }, 1000);

    // ---------- shop ----------
    function renderShop() {
      if (!$('shoplist')) return;
      var h = '', theme = currentTheme();
      if (Ads.rewardedReady() && (meta.canDailyGift() || meta.canShopCoins())) {
        h += '<h4>' + TX.free + '</h4><div class="srow">';
        if (meta.canDailyGift()) BOOST.forEach(function (id) { h += '<div class="item">' + ico(id) + '<span>+' + cfg.rewarded.dailyGiftBoosters + '</span><button class="mini pri" data-gift="' + id + '">' + ico('ad') + '</button></div>'; });
        if (meta.canShopCoins()) h += '<div class="item">' + ico('coin') + '<span>+' + cfg.rewarded.shopCoins + '</span><button class="mini pri" data-adcoins="1">' + ico('ad') + '</button></div>';
        h += '</div>';
      }
      if (BOOST.length) {
        h += '<h4>' + TX.boosters + '</h4><div class="srow">';
        BOOST.forEach(function (id) {
          h += '<div class="item">' + ico(id) + '<span>×' + eco.boosters(id) + '</span><button class="mini pri" data-buy="' + id + '"' +
            (eco.coins < cfg.boosters.price[id] ? ' disabled' : '') + '>' + cfg.boosters.price[id] + ' ' + ico('coin') + '</button></div>';
        });
        h += '</div>';
      }
      var skinBtn = function (s) {
        if (eco.state.equipped[s.kind] === s.id) return '<span class="mini">✓</span>';
        if (eco.owns(s.id)) return '<button class="mini" data-eq="' + s.id + '">' + TX.equip + '</button>';
        if (s.iap) return IAP.available ? '<button class="mini pri" data-iap="' + s.iap + '">' + IAP.price(s.iap) + '</button>' : '';
        return '<button class="mini pri" data-skin="' + s.id + '"' + (eco.coins < s.price ? ' disabled' : '') + '>' + s.price + ' ' + ico('coin') + '</button>';
      };
      var visible = function (s) { return eco.owns(s.id) || typeof s.price === 'number' || (s.iap && IAP.available); };
      var kinds = [];
      cfg.skins.forEach(function (s) { if (kinds.indexOf(s.kind) < 0) kinds.push(s.kind); });
      kinds.forEach(function (kind, ki) {
        h += '<h4>' + (ki === 0 ? TX.blocks : TX.boards) + '</h4><div class="srow">';
        cfg.skins.filter(function (s) { return s.kind === kind && visible(s); }).forEach(function (s) {
          h += '<div class="item' + (eco.state.equipped[kind] === s.id ? ' eq' : '') + '">' + (opts.skinPreview ? opts.skinPreview(s, theme) : '') +
            '<span>' + (TX.skins[s.id] || s.id) + '</span>' + skinBtn(s) + '</div>';
        });
        h += '</div>';
      });
      if (P.unlocked('freeze')) {
        var fz = P.data.meta.streak.freezes;
        h += '<h4>' + TX.streak + '</h4><div class="srow"><div class="item"><svg style="color:#7fb0d6"><use href="#i-flame"/></svg><span>×' + fz + '</span>' +
          '<button class="mini pri" data-freeze="1"' + (fz >= cfg.streak.maxFreezes || eco.coins < cfg.streak.freezePrice ? ' disabled' : '') + '>' + cfg.streak.freezePrice + ' ' + ico('coin') + '</button></div></div>';
      }
      if (IAP.available) {
        h += '<h4>' + TX.store + '</h4><div class="srow">';
        P.products().forEach(function (p) {
          if (cfg.skins.some(function (s) { return s.iap === p.id; })) return;          // shown with the skins
          if (p.type !== 'consumable' && eco.ownsProduct(p.id)) return;
          if (p.id === 'remove_ads' && eco.state.noAds) return;
          if (p.offer === 'starter' && !(P.unlocked('starter') && meta.starterOpen(P.progress.unlocked()))) return;
          if (p.offer === 'piggy' && !(P.unlocked('piggy') && eco.piggyBreakable())) return;
          if (p.season && (!P.unlocked('pass') || meta.hasPremiumPass())) return;
          var title = p.id === 'remove_ads' ? TX.removeAds : p.season ? TX.pass + ' +' : p.offer === 'starter' ? TX.starter : p.offer === 'piggy' ? TX.piggy : '';
          var what = p.offer === 'piggy' ? eco.piggy + ' ' + ico('coin') : p.season ? TX.passWhat : contentsHtml(p.grant);
          h += '<div class="item"><span>' + title + '</span><small style="text-align:center;font-size:11px;color:var(--mute)">' + what + '</small>' +
            '<button class="mini pri" data-iap="' + p.id + '">' + IAP.price(p.id) + '</button></div>';
        });
        h += '</div><div class="row" style="margin:0"><button class="mini" data-restore="1">' + TX.restore + '</button><button class="mini" data-legal="1">' + TX.legal + '</button></div>';
        if (legalOpen) h += '<p style="font-size:12px;line-height:1.45;color:var(--mute);margin:0">' + TX.legalText + '</p>';
        if (P.unlocked('piggy')) h += '<div class="pass"><span class="tier">' + ico('coin') + '</span><div><div style="font-size:12px;color:var(--mute);margin-bottom:5px">' + TX.piggy + ' · ' + eco.piggy + '/' + cfg.piggy.cap +
          '</div><div class="bar"><i style="width:' + (eco.piggy / cfg.piggy.cap * 100) + '%"></i></div></div><span></span></div>';
      }
      if (Ads.privacyOptionsRequired()) h += '<div class="row" style="margin:0"><button class="mini" data-privacy="1">' + TX.privacy + '</button></div>';
      $('shoplist').innerHTML = h;
    }
    if ($('shop')) $('shop').addEventListener('click', function (e) {
      if (opts.onTap) opts.onTap();
      var t = e.target.closest('button');
      if (!t || t.disabled) return;
      var d = t.dataset;
      if (d.buy && eco.buyBooster(d.buy)) sfx.coin();
      if (d.skin && eco.buySkin(d.skin)) { eco.equip(d.skin); if (opts.onSkin) opts.onSkin(); sfx.win(); }
      if (d.eq && eco.equip(d.eq)) { if (opts.onSkin) opts.onSkin(); sfx.pick(); }
      if (d.freeze && meta.buyFreeze()) sfx.coin();
      if (d.iap) P.buy(d.iap).then(function () { if (screen === 'shop') renderShop(); });
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
        bar.innerHTML = BOOST.map(function (id) { return '<button class="bst" data-b="' + id + '" aria-label="' + id + '">' + ico(id) + '<b></b></button>'; }).join('');
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
      if ($('o-coins')) $('o-coins').innerHTML = res.coins > 0 ? '+' + res.coins + ' ' + ico('coin') : '';
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
        if ($('o-coins')) $('o-coins').innerHTML = '+' + res.coins * 2 + ' ' + ico('coin');
        if (opts.onDoubled) opts.onDoubled(res.coins * 2);
        b.hidden = true;
        sfx.coin();
      });
    });

    // boot
    doc.body.classList.toggle('muted', !!P.settings.muted);
    doc.body.classList.toggle('no-ads', true);
    var api = {
      lang: lang, TX: TX, ico: ico, show: show, register: register, toast: toast, refresh: refresh, result: result,
      rewardText: rewardText, theme: currentTheme, setBoosterActive: function (id) { activeBooster = id; renderBoosters(); },
      holdCoins: function (on) { coinHold = !!on; },
      chestOpener: null,   // set by the engagement UI (shell/fun-ui.js)
      onResult: null,
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
      firework: function () { noise(0, 0.5, 0.12, 200); }
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

/* ---- gamekit/shell/fun-ui.js ---- */
/* gamekit engagement UI: prize wheel, chest opening, level-up, streak sheet + gifts, lucky banner, weekly league,
 * ranking, profile. Platform layer: no game code; the game passes hooks in `opts`.
 *
 *   var ui = GamekitFunUI.attach(P, shell, {
 *     dock: 'm-dock',              // menu container for the wheel / league / ranking buttons
 *     xpbar: 'm-xp',               // menu container for the level bar
 *     skinPreview: (skin, theme) => html,
 *     rankMode: 'daily',           // the mode shown in the ranking (daily challenge)
 *     localScore: (period) => n,   // the player's own score when offline (daily / weekly / alltime)
 *     playDaily: () => {},         // "play the daily" from the ranking
 *     links: { privacy: url, terms: url }
 *   })
 * Honesty: wheel slices are drawn at their real probability and the (i) sheet lists the exact odds; chest cards show
 * contents and the lucky-upgrade chance before opening; CPU rivals carry a small icon and the info sheets say
 * "Includes CPU rivals". Nothing here sells anything.
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
      giftDays: 'Regalos de racha', mult: 'Monedas', freeze: 'Protectores' },
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
      giftDays: 'Streak gifts', mult: 'Coins', freeze: 'Freezes' }
  };
  var TIER_COL = { bronze: '#c58b5a', silver: '#9fabb8', gold: '#e0b24f', sapphire: '#4f7fd9', ruby: '#d9506a', emerald: '#3fae7d', amethyst: '#9b6bd6', diamond: '#5cc8e0' };
  var RAR_COL = { common: '#8fa3ad', rare: '#4f8fe0', epic: '#9b6bd6', legendary: '#f0a830' };
  var SYMBOLS =
    '<symbol id="gk-i-wheel" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="2.6"/></symbol>' +
    '<symbol id="gk-i-shield" viewBox="0 0 24 24"><path d="M12 2.5 20 5.5v6c0 5-3.5 8.6-8 10-4.5-1.4-8-5-8-10v-6z"/></symbol>' +
    '<symbol id="gk-i-trophy" viewBox="0 0 24 24"><path d="M7 3.5h10v5a5 5 0 0 1-10 0z"/><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5a3.5 3.5 0 0 1-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="10.8" y="12.5" width="2.4" height="4.5"/><rect x="7.5" y="17.5" width="9" height="3" rx="1"/></symbol>' +
    '<symbol id="gk-i-cpu" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>' +
    '<symbol id="gk-i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><rect x="11" y="10.5" width="2" height="7" rx="1"/><circle cx="12" cy="7.5" r="1.3"/></symbol>' +
    '<symbol id="gk-i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></symbol>' +
    '<symbol id="gk-i-dice" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="15" r="1.5"/><circle cx="15" cy="9" r="1.5"/><circle cx="9" cy="15" r="1.5"/></symbol>' +
    '<symbol id="gk-i-gift" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="1.5"/><rect x="3" y="7" width="18" height="4" rx="1"/><path d="M12 7v13" stroke="#fff" stroke-width="2" opacity=".7"/><path d="M12 7c-1-3-5-4-5-1.5S11 7 12 7c1 0 5 .5 5-1.5S13 4 12 7z" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>' +
    '<symbol id="gk-i-up" viewBox="0 0 24 24"><path d="m6 14 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>' +
    '<symbol id="gk-i-down" viewBox="0 0 24 24"><path d="m6 10 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>' +
    '<symbol id="gk-i-cloud" viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="2"/></symbol>';

  function attach(P, shell, opts) {
    opts = opts || {};
    // shell.el remaps the shell's default ids (coins, streak, o-coins...) for embedded games
    var doc = root.document, $ = function (id) { return shell.el ? shell.el(id) : doc.getElementById(id); };
    var T = TX[shell.lang] || TX.en, cfg = P.cfg, eco = P.eco, meta = P.meta, fun = P.fun, lg = P.league, on = P.online;
    var fx = root.GamekitFx.create({ muted: function () { return !!P.settings.muted; } });
    var ico = shell.ico, sico = function (id, cls) { return '<svg' + (cls ? ' class="' + cls + '"' : '') + '><use href="#gk-i-' + id + '"/></svg>'; };
    var app = (opts.host && $(opts.host)) || $('app') || doc.body;
    var ME_COL = opts.meColor || '#5f9d8c';
    var fmtScore = function (s) { return opts.formatScore ? opts.formatScore(s, period) : s; };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
    var rarityOf = function (type) { return (cfg.chests.types[type] || {}).rarity || 'common'; };
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
      '<div class="gk-wheelbox"><canvas id="gk-wheel-cv"></canvas><div class="gk-pointer" id="gk-pointer"></div><button class="gk-hub" id="gk-hub">' + T.spin + '</button></div>' +
      '<div class="gk-spins" id="gk-spins"></div><div class="gk-prize" id="gk-prize"></div>');
    section('gk-league', '<span class="k" id="gk-lg-title">' + T.league + '</span><button class="ic" id="gk-lg-info" aria-label="i">' + sico('info') + '</button>',
      '<div class="gk-lg-head" id="gk-lg-head"></div><div class="gk-rows" id="gk-lg-rows"></div>');
    section('gk-rank', '<span class="k">' + T.ranking + '</span><span class="gk-hbtns"><button class="ic" id="gk-rk-info" aria-label="i">' + sico('info') + '</button><button class="ic" id="gk-rk-prof" aria-label="' + T.profile + '">' + sico('edit') + '</button></span>',
      '<div class="gk-tabs" id="gk-rk-tabs"><button data-p="daily" class="on">' + T.today + '</button><button data-p="weekly">' + T.week + '</button><button data-p="alltime">' + T.all + '</button></div>' +
      '<div class="gk-rk-status" id="gk-rk-status"></div><div class="gk-rows" id="gk-rk-rows"></div><button class="btn pri gk-play" id="gk-rk-play" hidden>' + T.playDaily + '</button>');
    section('gk-profile', '<span class="k">' + T.profile + '</span>',
      '<div class="gk-form"><label>' + T.nick + '</label><div class="gk-nickrow"><input id="gk-nick" maxlength="16" autocomplete="off" spellcheck="false"><button class="ic" id="gk-dice" aria-label="random">' + sico('dice') + '</button></div>' +
      '<label class="gk-tog"><input type="checkbox" id="gk-flag"><span id="gk-flag-l">' + T.flag + '</span></label>' +
      '<label class="gk-tog"><input type="checkbox" id="gk-hide"><span>' + T.hide + '</span></label>' +
      '<button class="btn pri" id="gk-save">' + T.ok + '</button><p class="gk-note">' + T.privacy + '</p><p class="gk-links" id="gk-links"></p></div>');
    section('gk-streak', '<span class="k">' + T.streak + '</span>', '<div class="gk-streak" id="gk-streak-body"></div>');
    var ov = doc.createElement('div'); ov.id = 'gk-ov'; ov.className = 'gk-ov'; app.appendChild(ov);
    var banner = doc.createElement('div'); banner.id = 'gk-lucky'; banner.className = 'gk-lucky'; app.appendChild(banner);

    shell.register('wheel', { el: 'gk-wheel', hud: { coins: true }, sheet: true, onShow: function () { sizeWheel(); renderSpins(); } });
    shell.register('league', { el: 'gk-league', hud: { coins: true }, sheet: true, onShow: function () { renderLeague(true); P.syncLeague(); } });
    shell.register('ranking', { el: 'gk-rank', hud: { coins: true }, sheet: true, onShow: function () { renderRank(); } });
    shell.register('profile', { el: 'gk-profile', hud: {}, sheet: true, onShow: function () { renderProfile(); } });
    shell.register('streakinfo', { el: 'gk-streak', hud: { coins: true, streak: true }, sheet: true, onShow: function () { renderStreak(); } });

    function tap(el, fn) { if (typeof el === 'string') el = $(el); if (el) el.addEventListener('click', function (e) { fx.sfx.pop(); fn(e); }); }

    // ---------- menu dock + level bar ----------
    var dock = opts.dock && $(opts.dock);
    if (dock) {
      [['wheel', 'wheel', T.wheel], ['league', 'shield', T.league], ['ranking', 'trophy', T.ranking]].forEach(function (d) {
        var b = doc.createElement('button');
        b.className = 'ic big gk-dock-' + d[0]; b.id = 'gk-m-' + d[0]; b.setAttribute('aria-label', d[2]);
        b.innerHTML = sico(d[1]) + '<b class="badge" id="gk-m-' + d[0] + '-badge"></b>';
        dock.insertBefore(b, dock.firstChild);
        tap(b, function () { shell.show(d[0]); });
      });
    }
    var xpbar = opts.xpbar && $(opts.xpbar);
    function renderXp(animateFrom) {
      if (!xpbar) return;
      var L = fun.levelInfo();
      xpbar.innerHTML = '<span class="gk-lv">' + L.level + '</span><div class="gk-xpbar"><i style="width:' + ((animateFrom != null ? animateFrom : L.pct) * 100).toFixed(1) + '%"></i></div><span class="gk-xpn">' + L.into + '/' + L.need + '</span>';
      if (animateFrom != null) setTimeout(function () { var i = xpbar.querySelector('i'); if (i) i.style.width = (L.pct * 100).toFixed(1) + '%'; }, 60);
    }
    var streakChip = $('streak'), multEl = null;
    if (streakChip) { multEl = doc.createElement('small'); multEl.className = 'gk-mult'; streakChip.appendChild(multEl); }
    function refreshMenu() {
      renderXp();
      var n = fun.spinsReady(), wb = $('gk-m-wheel-badge');
      if (wb) wb.textContent = n ? String(n) : '';
      var w = $('gk-m-wheel');
      if (w) w.classList.toggle('glow', n > 0);
      var lb = $('gk-m-league');
      if (lb) lb.style.color = TIER_COL[lg.tiers()[lg.state.tier]];
      var m = fun.streakMult(meta.liveStreak());
      if (multEl) multEl.textContent = m > 1 ? '×' + m : '';
    }
    P.on('wallet', refreshMenu);

    // coins: hold the HUD number while icons fly in, then tick it up
    function coinFly(fromEl, amount, done) {
      var chip = $('b-coins'), num = $('coins');
      var after = eco.coins, before = after - amount;
      if (!amount || !chip || chip.offsetParent === null) { shell.refresh(); if (done) done(); return; }
      shell.holdCoins(true);
      num.textContent = before;
      var n = Math.max(3, Math.min(10, Math.round(amount / 15))), landed = 0;
      fx.fly(fromEl, chip, ico('coin'), n, function () {
        landed++;
        num.textContent = Math.round(before + (after - before) * landed / n);
        if (landed === n) { shell.holdCoins(false); shell.refresh(); if (done) done(); }
      });
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
      if (got.coins) out.push('<span class="gk-chip">' + ico('coin') + '+' + got.coins + '</span>');
      if (got.boosters) Object.keys(got.boosters).forEach(function (k) { out.push('<span class="gk-chip">' + ico(k) + '+' + got.boosters[k] + '</span>'); });
      if (got.chest) out.push('<span class="gk-chip r-' + rarityOf(got.chest) + '">' + ico('chest') + T.rarity[rarityOf(got.chest)] + '</span>');
      if (got.spins) out.push('<span class="gk-chip">' + sico('wheel') + '+' + got.spins + '</span>');
      if (got.skin) out.push('<span class="gk-chip gold">' + (shell.TX.skins[got.skin] || got.skin) + '</span>');
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
    var wcv = $('gk-wheel-cv'), wg = wcv.getContext('2d'), WS = 300, wDPR = 1, angle = 0, spinning = false, flap = 0, winSeg = -1, winT = 0, bulbT = 0;
    var SEGCOL = opts.wheelColors || ['#7fb3a3', '#86a8d8', '#e5b567', '#a99bd8', '#e39a85', '#9cc27a', '#d98fb0', '#f4d06f'];
    function segs() {
      var o = fun.odds(), a = 0;
      return o.map(function (s, i) {
        var r = s.reward, col = r.chest ? RAR_COL[rarityOf(r.chest)] : r.skin ? RAR_COL.legendary : r.booster ? '#a99bd8' : SEGCOL[i % 3];
        var seg = { id: s.id, reward: r, p: s.p, a0: a, a1: a + s.p * Math.PI * 2, col: col };
        a = seg.a1;
        return seg;
      });
    }
    function sizeWheel() {
      var box = wcv.parentNode, s = Math.min(340, Math.max(220, Math.min(root.innerWidth - 48, root.innerHeight - 330)));
      box.style.width = box.style.height = s + 'px';
      WS = s; wDPR = Math.min(2, root.devicePixelRatio || 1);
      wcv.width = wcv.height = Math.round(s * wDPR);
      wcv.style.width = wcv.style.height = s + 'px';
      drawWheel(performance.now());
    }
    function coinIcon(x, y, r) {
      wg.beginPath(); wg.arc(x, y, r, 0, 6.283); wg.fillStyle = '#f4cf7a'; wg.fill();
      wg.lineWidth = r * 0.28; wg.strokeStyle = '#c9963f'; wg.beginPath(); wg.arc(x, y, r * 0.62, 0, 6.283); wg.stroke();
    }
    function chestIcon(x, y, r, col) {
      wg.fillStyle = col; wg.beginPath(); wg.roundRect ? wg.roundRect(x - r, y - r * 0.2, r * 2, r * 1.1, r * 0.2) : wg.rect(x - r, y - r * 0.2, r * 2, r * 1.1); wg.fill();
      wg.beginPath(); wg.ellipse(x, y - r * 0.2, r, r * 0.75, 0, Math.PI, 0); wg.fill();
      wg.fillStyle = 'rgba(255,255,255,.75)'; wg.fillRect(x - r * 0.18, y - r * 0.35, r * 0.36, r * 0.55);
    }
    function boltIcon(x, y, r) {
      wg.fillStyle = '#fff'; wg.beginPath();
      wg.moveTo(x + r * 0.2, y - r); wg.lineTo(x - r * 0.6, y + r * 0.15); wg.lineTo(x - r * 0.05, y + r * 0.15); wg.lineTo(x - r * 0.25, y + r); wg.lineTo(x + r * 0.6, y - r * 0.2); wg.lineTo(x + r * 0.05, y - r * 0.2); wg.closePath(); wg.fill();
    }
    function skinIcon(x, y, r) {
      var c = ['#e39a85', '#86a8d8', '#9cc27a', '#e5b567'];
      for (var k = 0; k < 4; k++) { wg.fillStyle = c[k]; wg.fillRect(x - r + (k % 2) * r * 1.05, y - r + Math.floor(k / 2) * r * 1.05, r * 0.92, r * 0.92); }
    }
    function drawWheel(t) {
      var S = WS, R = S / 2 - 10, cx = S / 2, cy = S / 2, list = segs();
      wg.setTransform(wDPR, 0, 0, wDPR, 0, 0);
      wg.clearRect(0, 0, S, S);
      // rim
      var rim = wg.createRadialGradient(cx, cy, R * 0.9, cx, cy, R + 10);
      rim.addColorStop(0, '#3a3f47'); rim.addColorStop(1, '#22262c');
      wg.fillStyle = rim; wg.beginPath(); wg.arc(cx, cy, R + 9, 0, 6.283); wg.fill();
      wg.save(); wg.translate(cx, cy); wg.rotate(angle);
      list.forEach(function (s, i) {
        var a0 = s.a0 - Math.PI / 2, a1 = s.a1 - Math.PI / 2, mid = (a0 + a1) / 2;
        wg.beginPath(); wg.moveTo(0, 0); wg.arc(0, 0, R, a0, a1); wg.closePath();
        var gr = wg.createRadialGradient(0, 0, R * 0.15, 0, 0, R);
        gr.addColorStop(0, shadeHex(s.col, 0.25)); gr.addColorStop(1, s.col);
        wg.fillStyle = gr; wg.fill();
        if (i === winSeg && t - winT < 2600) { wg.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.25 * Math.sin((t - winT) / 90)).toFixed(3) + ')'; wg.fill(); }
        wg.strokeStyle = 'rgba(255,255,255,.65)'; wg.lineWidth = 2;
        wg.beginPath(); wg.moveTo(0, 0); wg.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); wg.stroke();
        // label: rotated along the slice
        var span = a1 - a0, ir = R * (span < 0.3 ? 0.8 : 0.66), sz = Math.max(7, Math.min(R * 0.11, span * R * 0.32));
        wg.save(); wg.rotate(mid); wg.translate(ir, 0); wg.rotate(Math.PI / 2);
        var rw = s.reward;
        if (rw.coins) {
          coinIcon(0, -sz * 0.9, sz * 0.75);
          wg.fillStyle = '#fff'; wg.font = '800 ' + Math.round(sz * 1.25) + 'px ui-rounded, "Segoe UI", system-ui, sans-serif';
          wg.textAlign = 'center'; wg.textBaseline = 'middle';
          wg.shadowColor = 'rgba(0,0,0,.25)'; wg.shadowBlur = 3; wg.fillText(String(rw.coins), 0, sz * 0.75); wg.shadowBlur = 0;
        } else if (rw.chest) chestIcon(0, 0, sz * 0.95, '#fff');
        else if (rw.booster) boltIcon(0, 0, sz * 1.05);
        else if (rw.skin) skinIcon(0, 0, sz * 0.7);
        wg.restore();
      });
      // pegs
      list.forEach(function (s) { var a = s.a0 - Math.PI / 2; wg.fillStyle = '#f7f3ea'; wg.beginPath(); wg.arc(Math.cos(a) * (R + 1), Math.sin(a) * (R + 1), 3.2, 0, 6.283); wg.fill(); });
      wg.restore();
      // bulbs: chase while spinning, slow blink when idle
      var nb = 20;
      for (var b = 0; b < nb; b++) {
        var ba = b / nb * 6.283, lit = spinning ? ((b + Math.floor(t / 70)) % 4 === 0) : winSeg >= 0 && t - winT < 2600 ? ((b + Math.floor(t / 140)) % 2 === 0) : ((b + Math.floor(t / 700)) % 2 === 0);
        wg.fillStyle = lit ? '#fff3c4' : '#6b6f75';
        if (lit) { wg.shadowColor = '#ffd76a'; wg.shadowBlur = 8; }
        wg.beginPath(); wg.arc(cx + Math.cos(ba) * (R + 4.5), cy + Math.sin(ba) * (R + 4.5), 2.6, 0, 6.283); wg.fill();
        wg.shadowBlur = 0;
      }
      // pointer flapper
      var pt = $('gk-pointer');
      if (pt) pt.style.transform = 'translateX(-50%) rotate(' + (-flap).toFixed(1) + 'deg)';
    }
    function shadeHex(hex, amt) {
      var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
      return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    }
    function idle() {
      if (shell.screen === 'wheel' && !spinning) drawWheel(performance.now());
      root.requestAnimationFrame(idle);
    }
    root.requestAnimationFrame(idle);

    function renderSpins() {
      var free = fun.freeLeft(), bank = fun.bank(), adOk = fun.adLeft() > 0 && P.ads.rewardedReady();
      var h = '';
      h += '<button class="gk-sp' + (free ? ' on' : '') + '" data-k="free"' + (free && !spinning ? '' : ' disabled') + '>' + T.free + (free ? '' : ' · ' + T.tomorrow) + '</button>';
      h += '<button class="gk-sp' + (bank ? ' on' : '') + '" data-k="bank"' + (bank && !spinning ? '' : ' disabled') + '>' + sico('wheel') + '×' + bank + '</button>';
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
        renderSpins();
        animateSpin(res, function () {
          spinning = false;
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
        // which boundary is under the pointer: ticks + flapper kick
        var rel = ((-angle % twoPi) + twoPi) % twoPi, b = 0;
        for (var i = 0; i < bounds.length; i++) if (rel >= bounds[i]) b = i;
        if (lastB !== null && b !== lastB) { flap = 22; fx.sfx.tick(); if (k > 0.55) fx.haptic('light'); }
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
      if (big) { fx.sfx.big(); fx.confetti(cx, cy, { n: 140, power: 640 }); fx.haptic('success'); fx.shake(app, 5, 420); }
      else { fx.sfx.win(); fx.confetti(cx, cy, { n: 60 }); fx.haptic('light'); }
      fx.sparks(cx, r.top + 8, '#ffd76a', 30);
      var prize = $('gk-prize');
      prize.innerHTML = '<div class="gk-prize-card' + (big ? ' big' : '') + '">' + rewardChips(res.got) + '</div>';
      var coins = eco.coins - before;
      setTimeout(function () { coinFly(prize, coins); }, 450);
    }

    // ================= CHESTS =================
    function bigChestSvg() {
      return '<svg viewBox="0 0 140 120" class="gk-bigchest"><defs><linearGradient id="gkcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--rc2)"/><stop offset="1" stop-color="var(--rc)"/></linearGradient></defs>' +
        '<ellipse cx="70" cy="112" rx="50" ry="6" fill="rgba(0,0,0,.18)"/>' +
        '<rect x="18" y="52" width="104" height="56" rx="9" fill="url(#gkcg)"/><rect x="18" y="52" width="104" height="56" rx="9" fill="none" stroke="var(--rd)" stroke-width="3"/>' +
        '<rect x="30" y="52" width="10" height="56" fill="var(--rd)" opacity=".55"/><rect x="100" y="52" width="10" height="56" fill="var(--rd)" opacity=".55"/>' +
        '<g class="gk-lid"><path d="M18 54 Q18 20 70 20 Q122 20 122 54 Z" fill="url(#gkcg)" stroke="var(--rd)" stroke-width="3"/><rect x="30" y="24" width="10" height="30" fill="var(--rd)" opacity=".55"/><rect x="100" y="24" width="10" height="30" fill="var(--rd)" opacity=".55"/>' +
        '<path d="M28 34 Q70 18 112 34" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="3" stroke-linecap="round"/></g>' +
        '<rect x="60" y="46" width="20" height="24" rx="4" fill="#fff4cf" stroke="var(--rd)" stroke-width="2.5"/><circle cx="70" cy="56" r="3" fill="var(--rd)"/>' +
        '<path class="gk-crack c1" d="M70 70 L64 80 L72 86 L66 98" /><path class="gk-crack c2" d="M46 60 L54 72 L48 82 M96 62 L88 74 L94 86" /><path class="gk-crack c3" d="M30 90 L42 96 M110 92 L98 98 M70 24 L66 36 L74 44" />' +
        '</svg>';
    }
    function rarityVars(type) {
      var c = RAR_COL[rarityOf(type)];
      return '--rc:' + c + ';--rc2:' + shadeHex(c, 0.35) + ';--rd:' + shadeHex2(c, -0.35);
    }
    function shadeHex2(hex, amt) {
      var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      r = Math.round(r * (1 + amt)); g = Math.round(g * (1 + amt)); b = Math.round(b * (1 + amt));
      return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    }
    function contentsLine(type) {
      var c = meta.chestContents(type), out = [];
      out.push('<span class="gk-chip">' + ico('coin') + c.coins + '</span>');
      Object.keys(c.boosters || {}).forEach(function (k) { out.push('<span class="gk-chip">' + ico(k) + c.boosters[k] + '</span>'); });
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
        showOv('gk-chestov', '<div class="gk-rays"></div><div class="gk-chestbox" style="' + rarityVars(from) + '">' +
          '<div class="gk-rar r-' + rar + '" id="gk-rar">' + T.rarity[rar] + '</div>' + bigChestSvg() +
          '<div class="gk-taps" id="gk-taps"><i></i><i></i><i></i></div>' +
          '<div class="gk-maybe" id="gk-maybe"><small>' + T.contents + '</small><div>' + contentsLine(from) + '</div>' +
          (luckOdds && nxt ? '<small class="gk-luckodds">✦ ' + Math.round(luckOdds * 100) + ' % → ' + T.rarity[rarityOf(nxt)] + '</small>' : '') + '</div>' +
          '<div class="gk-items" id="gk-items"></div><button class="btn pri" id="gk-collect" hidden>' + T.collect + '</button></div>');
        var box = ov.querySelector('.gk-chestbox'), svg = ov.querySelector('.gk-bigchest'), taps = 0, opened = false;
        fx.sfx.whoosh();
        var onTap = function () {
          if (opened) return;
          taps++;
          ov.querySelectorAll('#gk-taps i').forEach(function (d, k) { d.classList.toggle('on', k < taps); });
          svg.classList.add('t' + taps);
          fx.sfx.crack(); fx.haptic(taps === 1 ? 'light' : taps === 2 ? 'medium' : 'heavy');
          fx.shake(svg, 4 + taps * 3, 360);
          var r = svg.getBoundingClientRect();
          fx.sparks(r.left + r.width / 2, r.top + r.height * 0.6, RAR_COL[rarityOf(from)], 10 + taps * 8);
          if (taps >= 3) { opened = true; svg.removeEventListener('click', onTap); setTimeout(reveal, 380); }
        };
        svg.addEventListener('click', onTap);
        function reveal() {
          var go = function () {
            var r = svg.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.45;
            ov.classList.add('burst');
            svg.classList.add('open');
            fx.sfx.burst(); fx.haptic('success');
            fx.confetti(cx, cy, { n: got.chestType === 'crystal' ? 180 : 110, colors: [RAR_COL[rarityOf(got.chestType)], '#fff3c4', '#ffffff', shadeHex(RAR_COL[rarityOf(got.chestType)], 0.4)], power: 600 });
            fx.sparks(cx, cy, '#fff3c4', 40);
            $('gk-maybe').hidden = true;
            var items = [], c = meta.chestContents(got.chestType);
            items.push({ html: ico('coin') + '<b>+' + c.coins + '</b>', coin: true });
            Object.keys(c.boosters || {}).forEach(function (k) { items.push({ html: ico(k) + '<b>+' + c.boosters[k] + '</b>' }); });
            items.forEach(function (it, k) {
              setTimeout(function () {
                var d = doc.createElement('div');
                d.className = 'gk-item'; d.innerHTML = it.html;
                $('gk-items').appendChild(d);
                fx.sfx.pop();
                if (it.coin) setTimeout(function () { coinFly(d, eco.coins - before); }, 380);
              }, 350 + k * 320);
            });
            setTimeout(function () { var b = $('gk-collect'); b.hidden = false; tap(b, close); }, 450 + items.length * 320);
          };
          if (got.lucky) {
            // lucky upgrade: the chest changes tier in front of the player
            setTimeout(function () {
              box.setAttribute('style', rarityVars(got.chestType));
              var rr = rarityOf(got.chestType), tag = $('gk-rar');
              tag.className = 'gk-rar r-' + rr + ' lucky'; tag.innerHTML = '✦ ' + T.lucky + ' ' + T.rarity[rr];
              ov.classList.add('lucky');
              fx.sfx.lucky(); fx.haptic('lucky'); fx.shake(app, 6, 500);
              var r = svg.getBoundingClientRect();
              fx.sparks(r.left + r.width / 2, r.top + r.height / 2, '#ffd76a', 70);
              setTimeout(go, 1000);
            }, 200);
          } else go();
        }
      });
    };

    // ================= LEVEL UP =================
    P.on('levelup', function (ups) {
      ups.forEach(function (u) {
        enqueue(function (close) {
          var skin = u.got.skin && eco.skin(u.got.skin);
          showOv('gk-levelov', '<div class="gk-lvbadge"><span>' + u.level + '</span></div><h2>' + T.level + ' ' + u.level + '</h2><div class="gk-rw">' + rewardChips(u.got) + '</div>' +
            (skin ? '<div class="gk-reveal"><small>' + T.newSkin + '</small><div class="gk-revcard">' + (opts.skinPreview ? opts.skinPreview(skin, shell.theme()) : '') +
              '<b>' + esc(shell.TX.skins[skin.id] || skin.id) + '</b></div><button class="btn" id="gk-lv-equip">' + T.equip + '</button></div>' : '') +
            '<button class="btn pri" id="gk-lv-ok">' + T.ok + '</button>');
          fx.fireworks(2600); fx.sfx.level(); fx.haptic('success');
          setTimeout(function () { var b = ov.querySelector('.gk-lvbadge'); if (b) fx.sparks(b.getBoundingClientRect().left + 50, b.getBoundingClientRect().top + 50, '#ffd76a', 40); }, 350);
          if (skin) tap('gk-lv-equip', function () { if (eco.equip(skin.id)) { P.commit(); P.emit('skin'); } close(); });
          tap('gk-lv-ok', function () { close(); coinFly($('b-coins'), 0); renderXp(0); });
          refreshMenu();
        });
      });
    });

    // ================= LUCKY MOMENT =================
    P.on('lucky', function () {
      banner.innerHTML = '<span class="gk-lk-star">✦</span><b>' + T.lucky + '</b><span>' + T.x2 + '</span>';
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
      if (s.surprise) giftOv(s.surprise);
      refreshMenu();
    };
    function giftOv(sp) {
      enqueue(function (close) {
        showOv('gk-giftov', '<div class="gk-rays"></div><div class="gk-giftbox">' + sico('gift') + '</div><h2>' + ico('flame') + ' ' + sp.day + ' ' + T.days + '</h2><div class="gk-rw" id="gk-gift-rw" hidden>' + rewardChips(sp.got) + '</div><button class="btn pri" id="gk-gift-ok">' + T.tap + '</button>');
        var opened = false, box = ov.querySelector('.gk-giftbox');
        fx.sfx.whoosh();
        tap('gk-gift-ok', function () {
          if (opened) { close(); return; }
          opened = true;
          box.classList.add('open'); ov.classList.add('burst');
          var r = box.getBoundingClientRect();
          fx.confetti(r.left + r.width / 2, r.top + r.height / 2, { n: 120 }); fx.sfx.big(); fx.haptic('success');
          $('gk-gift-rw').hidden = false; $('gk-gift-ok').textContent = T.ok;
          refreshMenu();
        });
      });
    }

    // ================= STREAK SHEET =================
    tap('streak', function () { if (!(meta.canRepairStreak() && P.ads.rewardedReady())) shell.show('streakinfo'); });
    function renderStreak() {
      var n = meta.liveStreak(), m = fun.streakMult(n), gifts = cfg.streak.gifts || {}, given = fun.state.gifts, mults = cfg.streak.multipliers || {};
      var h = '<div class="gk-flame' + (meta.playedToday() ? '' : ' cold') + '">' + ico('flame') + '<b>' + n + '</b></div>';
      h += '<div class="gk-mults">' + Object.keys(mults).map(function (d) { return '<span class="' + (n >= +d ? 'on' : '') + '">' + d + ' ' + T.days + '<b>' + ico('coin') + '×' + mults[d] + '</b></span>'; }).join('') + '</div>';
      h += '<h4>' + T.giftDays + '</h4><div class="gk-gifts">' + Object.keys(gifts).map(function (d) {
        var g = gifts[d], got = given.indexOf(+d) >= 0;
        return '<div class="gk-giftday' + (got ? ' got' : n >= +d ? ' on' : '') + '"><span>' + d + '</span>' + sico('gift') + '<small>' + rewardChips({ spins: g.spins, chest: g.chest, coins: g.coins }) + '</small></div>';
      }).join('') + '</div>';
      h += '<div class="gk-mults"><span>' + T.mult + '<b>×' + m + '</b></span><span>' + T.freeze + '<b>' + P.data.meta.streak.freezes + '</b></span></div>';
      $('gk-streak-body').innerHTML = h;
    }

    // ================= LEAGUE =================
    function emblem(tier, size) {
      var id = lg.tiers()[tier], c = TIER_COL[id];
      return '<span class="gk-emblem" style="--tc:' + c + ';--tc2:' + shadeHex(c, 0.45) + ';width:' + size + 'px;height:' + size + 'px">' + sico('shield') + '<i style="font-size:' + Math.round(size * 0.36) + 'px">' + (tier + 1) + '</i></span>';
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
    function avatar(r) {
      return '<span class="gk-av" style="background:' + r.color + '">' + esc(r.initial) + flagHtml(r.country) + '</span>';
    }
    function fmtLeft(ms) { var h = Math.floor(ms / 3600000), d = Math.floor(h / 24); return d ? d + 'd ' + (h % 24) + 'h' : h + 'h ' + Math.floor(ms % 3600000 / 60000) + 'm'; }
    function renderLeague(scroll) {
      var t = lg.table(), tier = lg.state.tier, id = lg.tiers()[tier], C = cfg.league;
      $('gk-lg-title').textContent = T.league + ' ' + T.tiers[id];
      var me = t.filter(function (r) { return r.me; })[0];
      $('gk-lg-head').innerHTML = emblem(tier, 64) + '<div><b>' + T.tiers[id] + '</b><span>' + T.ends + ' ' + fmtLeft(lg.msLeft()) + '</span></div><div class="gk-myxp"><b>' + me.xp + '</b><small>XP</small></div>';
      var rewardAt = {}; C.rewards.forEach(function (rw, k) { var from = k ? C.rewards[k - 1].to + 1 : 1; rewardAt[from] = rw.to === 1 && tier >= C.legendaryFrom ? 'crystal' : rw.chest; });
      var h = '';
      t.forEach(function (r) {
        if (r.rank === C.promote + 1 && tier < lg.tiers().length - 1) h += '<div class="gk-div up">' + sico('up') + T.up + '</div>';
        if (r.rank === C.size - C.demote + 1 && tier > 0) h += '<div class="gk-div down">' + sico('down') + T.down + '</div>';
        var rw = rewardAt[r.rank];
        h += '<div class="gk-row' + (r.me ? ' me' : '') + (r.zone ? ' z-' + r.zone : '') + '"' + (r.cpu ? ' data-cpu="1"' : '') + '><span class="gk-rk">' + r.rank + '</span>' + avatar(r) +
          '<span class="gk-nm">' + esc(r.me ? r.name + ' · ' + T.you : r.name) + (r.cpu ? '<svg class="gk-cpu" aria-label="' + T.cpuShort + '"><title>' + T.cpuShort + '</title><use href="#gk-i-cpu"/></svg>' : '') + '</span>' +
          (rw ? '<span class="gk-rwc r-' + rarityOf(rw) + '">' + ico('chest') + '</span>' : '<span></span>') + '<b class="gk-xp">' + r.xp + '</b></div>';
      });
      $('gk-lg-rows').innerHTML = h;
      if (scroll) setTimeout(function () { var m = $('gk-lg-rows').querySelector('.me'); if (m) m.scrollIntoView({ block: 'center' }); }, 40);
    }
    P.on('league', function () { if (shell.screen === 'league') renderLeague(false); });
    tap('gk-lg-info', function () { info(T.league, '<p>' + T.leagueRules + '</p><p class="gk-cpuline">' + sico('cpu', 'gk-cpu') + ' ' + T.cpu + '</p>'); });
    function leagueResult(res) {
      enqueue(function (close) {
        var up = res.to > res.from, down = res.to < res.from, id = lg.tiers()[res.to];
        showOv('gk-lgov' + (up ? ' up' : ''), '<div class="gk-rays"></div>' + emblem(res.to, 120) + '<h2>' + (up ? T.promoted : down ? T.relegated : T.stayed) + '</h2><p>' + T.tiers[id] + ' · ' + T.pos + ' ' + res.rank + '/' + cfg.league.size + '</p>' +
          '<div class="gk-rw">' + rewardChips(res.got) + '</div><button class="btn pri" id="gk-lg-ok">' + T.ok + '</button>');
        if (up) { fx.fireworks(2000); fx.sfx.up(); fx.haptic('success'); } else if (down) fx.sfx.down(); else fx.sfx.win();
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
    function drawRank(data, fromCache) {
      var R = rankRows(data), h = '';
      R.rows.slice(0, 50).forEach(function (r) {
        var medal = r.rank <= 3 ? ' m' + r.rank : '';
        h += '<div class="gk-row' + (r.me ? ' me' : '') + medal + '"' + (r.cpu ? ' data-cpu="1"' : '') + '><span class="gk-rk">' + r.rank + '</span>' + avatar(r) +
          '<span class="gk-nm">' + esc(r.name) + (r.me ? ' · ' + T.you : '') + (r.cpu ? '<svg class="gk-cpu" aria-label="' + T.cpuShort + '"><title>' + T.cpuShort + '</title><use href="#gk-i-cpu"/></svg>' : '') + '</span><span></span><b class="gk-xp">' + fmtScore(r.score) + '</b></div>';
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
      info(T.ranking, '<p>' + T.rankRules + '</p><ul class="gk-odds"><li><i style="background:#e0b24f"></i><span>Top 3</span><b>' + ico('coin') + rw.top3 + '</b></li><li><i style="background:#9fabb8"></i><span>Top 10 %</span><b>' + ico('coin') + rw.top10 + '</b></li><li><i style="background:#c58b5a"></i><span>✓</span><b>' + ico('coin') + rw.play + '</b></li></ul>' +
        '<p class="gk-cpuline">' + sico('cpu', 'gk-cpu') + ' ' + T.cpu + '</p><p class="gk-note">' + T.privacy + '</p>');
    });
    tap('gk-rk-prof', function () { shell.show('profile'); });
    P.on('ranked', function () { if (shell.screen === 'ranking') renderRank(); });
    P.on('rankreward', function (j) {
      enqueue(function (close) {
        var best = j.granted.slice().sort(function (a, b) { return a.rank - b.rank; })[0];
        showOv('gk-lgov', '<div class="gk-rays"></div><div class="gk-trophy">' + sico('trophy') + '</div><h2>' + T.rankReward + '</h2><p>' + T.pos + ' ' + best.rank + ' ' + T.of + ' ' + best.total + '</p><div class="gk-rw">' + rewardChips({ coins: j.coins }) + '</div><button class="btn pri" id="gk-rr-ok">' + T.collect + '</button>');
        fx.sfx.win(); fx.confetti(root.innerWidth / 2, root.innerHeight * 0.4, { n: 90 });
        tap('gk-rr-ok', function () { close(); coinFly($('b-coins'), j.coins); });
      });
    });

    // ================= PROFILE =================
    function renderProfile() {
      var p = on.profile;
      $('gk-nick').value = p.nickname;
      $('gk-flag').checked = p.showFlag;
      $('gk-flag-l').textContent = T.flag + ' ' + (p.country ? (flagEmoji ? GameKit.flag(p.country) : p.country) : '');
      $('gk-flag').disabled = !p.country;
      $('gk-hide').checked = p.hidden;
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
    on.onNickChanged = function () { if (shell.screen === 'profile') renderProfile(); };

    refreshMenu();
    return { fx: fx, refresh: refreshMenu, info: info, renderLeague: renderLeague, renderRank: renderRank };
  }

  var FunUI = { attach: attach, TEXTS: TX };
  if (typeof module !== 'undefined' && module.exports) module.exports = FunUI;
  else root.GamekitFunUI = FunUI;
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
  function makePiece(rand) {
    var s = pickShape(rand);
    return { shape: s, cells: SHAPES[s].cells, color: Math.floor(rand() * COLORS), used: false };
  }
  function makeTray(rand) {
    var t = [];
    for (var i = 0; i < TRAY; i++) t.push(makePiece(rand));
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
      this.seed = (L.seed >>> 0) || this.seed;
      this.rand = rng(this.seed);
      this.board = L.board.slice();
      this.gems = L.gems ? L.gems.slice() : emptyBoard().map(function () { return 0; });
      this.movesLeft = L.moves;
    }
    this.deal();
  }

  Game.prototype.deal = function () {
    this.tray = makeTray(this.rand);
    // endless and levels are a little kinder: re-roll (up to 3 times) a tray where nothing fits.
    // The daily stays a pure function of the date so everyone gets the same pieces.
    for (var k = 0; !this.daily && k < 3 && !this.anyFits(); k++) this.tray = makeTray(this.rand);
    this.trayNo++;
    this.trayLog.push(0);
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
      this.tray.forEach(function (p, i) { if (!p.used) self.tray[i] = makePiece(self.rand); });
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
      while (!this.anyFits() && tries++ < 20) { this.tray = makeTray(this.rand); }
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
    linesAfter: linesAfter, clearScore: clearScore, makeTray: makeTray, Game: Game,
    dailySeed: function (key) { return hashString('teselo:' + key); },
    shareGrid: shareGrid, shareText: shareText, bumpStreak: bumpStreak, liveStreak: liveStreak
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.TeseloCore = Core;
})(this);

/* ---- game/levels.js ---- */
/* Teselo adventure levels.
 *
 * A level is { id, seed, goal: {type, target}, moves, board, gems, par }:
 *   goal.type  'lines' clear N rows/columns | 'gems' collect every gem (gems sit on stone tiles) | 'score' reach N points
 *   moves      placements allowed; stars come from the share of moves left (core.starsFor)
 *   board      flat N*N: -1 empty, core.STONE pre-filled stone (clears like any tile)
 *   par        moves the reference bot needed (moves = par * slack, so every level is proven winnable
 *              with its own piece sequence)
 *
 * Levels 1..HAND.length are handcrafted (ASCII boards below), the rest are generated on demand from the
 * level number, so the list is endless without shipping data: COUNT is just how many the map shows.
 * Changing the generator changes the levels: bump GEN_VERSION and keep old progress keyed by id.
 */
(function (root) {
  'use strict';
  var C = root.TeseloCore || (typeof require === 'function' ? require('./core.js') : null);
  var N = C.N, STONE = C.STONE;
  var COUNT = 150;
  var GEN_VERSION = 1;

  // '.' empty  '#' stone  '*' stone with a gem
  var HAND = [
    { goal: { type: 'lines', target: 2 }, board: [
      '........', '........', '........', '##.##.##', '........', '........', '........', '........'] },
    { goal: { type: 'lines', target: 4 }, board: [
      '........', '........', '#......#', '#......#', '#......#', '#......#', '........', '........'] },
    { goal: { type: 'gems', target: 0 }, board: [
      '........', '........', '..*..*..', '........', '........', '..*..*..', '........', '........'] },
    { goal: { type: 'score', target: 160 }, board: [
      '........', '.#....#.', '........', '...##...', '...##...', '........', '.#....#.', '........'] },
    { goal: { type: 'gems', target: 0 }, board: [
      '#......#', '.#....#.', '..*..*..', '........', '........', '..*..*..', '.#....#.', '#......#'] },
    { goal: { type: 'lines', target: 6 }, board: [
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

  // ---- reference bot: greedy, one ply, aware of the goal -----------------
  function botMove(g) {
    var best = null, bs = -1e9, b = g.board, gemsGoal = g.level && g.level.goal.type === 'gems';
    g.tray.forEach(function (p, i) {
      if (p.used) return;
      for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
        if (!C.canPlace(b, p.cells, r, c)) continue;
        var l = C.linesAfter(b, p.cells, r, c), s = (l.rows.length + l.cols.length) * 10 + p.cells.length * 0.4;
        if (gemsGoal && g.gems) {
          l.rows.forEach(function (rr) { for (var j = 0; j < N; j++) s += g.gems[rr * N + j] * 6; });
          l.cols.forEach(function (cc) { for (var j = 0; j < N; j++) s += g.gems[j * N + cc] * 6; });
        }
        // hug walls and tiles: fewer isolated holes
        p.cells.forEach(function (q) {
          var rr = r + q[0], cc = c + q[1];
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
            var y = rr + d[0], x = cc + d[1];
            if (y < 0 || x < 0 || y >= N || x >= N || b[y * N + x] !== -1) s += 0.3;
          });
        });
        if (s > bs) { bs = s; best = [i, r, c]; }
      }
    });
    return best;
  }

  // play a level def with the bot; returns moves used to win, or 0 if the bot fails
  function botSolve(def, cap) {
    var g = new C.Game({ seed: def.seed, level: def });
    var guard = 0;
    while (!g.over && guard++ < (cap || 400)) {
      var m = botMove(g);
      if (!m) break;
      g.place(m[0], m[1], m[2]);
    }
    return g.won ? g.moves : 0;
  }

  // ---- generator ----------------------------------------------------------
  function typeFor(n) { return n % 5 === 0 ? 'score' : n % 3 === 0 ? 'gems' : 'lines'; }

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

  function make(n, attempt) {
    var rand = C.rng(C.hashString('teselo-level:' + GEN_VERSION + ':' + n + ':' + attempt));
    var d = Math.min(1, (n - 1) / 120);            // 0 .. 1 difficulty
    var type = typeFor(n);
    var stones = Math.max(0, Math.round(4 + d * 16 + rand() * 4) - attempt * 3);
    var gemCount = type === 'gems' ? Math.min(stones, 3 + Math.floor(d * 8)) : 0;
    var bg = genBoard(rand, stones, gemCount);
    var target = type === 'lines' ? 4 + Math.floor(d * 14) + Math.floor(rand() * 3)
      : type === 'gems' ? countGems(bg.gems)
        : 150 + Math.round(d * 80) * 10;
    return { id: n, seed: Math.floor(rand() * 4294967296) >>> 0, goal: { type: type, target: target },
      board: bg.board, gems: bg.gems, d: d };
  }

  function handDef(n) {
    var h = HAND[n - 1], b = parse(h.board);
    var target = h.goal.type === 'gems' ? countGems(b.gems) : h.goal.target;
    return { id: n, seed: C.hashString('teselo-hand:' + n), goal: { type: h.goal.type, target: target },
      board: b.board, gems: b.gems, d: 0 };
  }

  var cache = {};
  function get(n) {
    n = Math.max(1, Math.floor(n));
    if (cache[n]) return cache[n];
    var def = null, par = 0;
    for (var attempt = 0; attempt < 8 && !par; attempt++) {
      def = n <= HAND.length ? handDef(n) : make(n, attempt);
      def.moves = 400;
      par = botSolve(def);
      if (n <= HAND.length && !par) { def.seed = (def.seed + 7919) >>> 0; }
    }
    if (!par) par = 40; // should not happen; tests check every level up to COUNT
    // generous early, tighter later; small levels always leave room to breathe
    var slack = 1.7 - def.d * 0.5;
    def.moves = Math.max(8, Math.ceil(par * slack));
    def.par = par;
    delete def.d;
    cache[n] = def;
    return def;
  }

  // the map shows chapters of 15 levels; each chapter gets a board tint in the UI
  function chapterOf(n) { return Math.floor((n - 1) / 15); }

  var Levels = { COUNT: COUNT, GEN_VERSION: GEN_VERSION, HAND: HAND, get: get, parse: parse, botSolve: botSolve,
    botMove: botMove, chapterOf: chapterOf };
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

    coins: { modes: { endless: { base: 0, per100: 1 }, daily: { base: 20, per100: 1 } } },

    boosters: {
      start: { rotate: 2, bomb: 2, undo: 3, shuffle: 2 },
      price: { rotate: 60, bomb: 120, undo: 40, shuffle: 80 }   // multiples of 20; coin packs are multiples of 40
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
        { id: 'lines15', metric: 'lines', target: 15, reward: { coins: 30, xp: 25 } },
        { id: 'lines30', metric: 'lines', target: 30, reward: { coins: 50, xp: 35 } },
        { id: 'pieces60', metric: 'pieces', target: 60, reward: { coins: 30, xp: 25 } },
        { id: 'games3', metric: 'games', target: 3, reward: { coins: 30, xp: 25 } },
        { id: 'combo3', metric: 'combo3', target: 1, reward: { coins: 40, xp: 30 } },
        { id: 'levels2', metric: 'levels', target: 2, reward: { coins: 40, xp: 30 } },
        { id: 'stars5', metric: 'stars', target: 5, reward: { coins: 40, xp: 30 } },
        { id: 'daily1', metric: 'daily', target: 1, reward: { coins: 30, xp: 25 } },
        { id: 'gems8', metric: 'gems', target: 8, reward: { coins: 40, xp: 30 } },
        { id: 'booster1', metric: 'boosters', target: 1, reward: { coins: 20, xp: 20 } }
      ],
      weekly: [
        { id: 'w-lines200', metric: 'lines', target: 200, reward: { coins: 200, xp: 120 } },
        { id: 'w-levels12', metric: 'levels', target: 12, reward: { coins: 200, xp: 120 } },
        { id: 'w-daily5', metric: 'daily', target: 5, reward: { coins: 250, xp: 150 } },
        { id: 'w-stars30', metric: 'stars', target: 30, reward: { coins: 200, xp: 120 } },
        { id: 'w-games20', metric: 'games', target: 20, reward: { coins: 150, xp: 100 } },
        { id: 'w-combo15', metric: 'combo3', target: 15, reward: { coins: 200, xp: 120 } }
      ]
    },

    pass: {
      free: function (t) { return t % 5 === 0 ? { chest: 'silver' } : t % 2 ? { coins: 40 } : { boosters: { undo: 1 } }; },
      premium: function (t) {
        return t === 30 ? { skin: 'aurora' } : t === 15 ? { skin: 'moss' } : t % 5 === 0 ? { chest: 'gold' }
          : t % 3 === 0 ? { boosters: { bomb: 1, rotate: 1 } } : { coins: 80 };
      }
    },

    // appended to the platform products
    products: [
      { id: 'starter_pack', type: 'non_consumable', price: '1,99 €', offer: 'starter',
        grant: { coins: 1500, boosters: { rotate: 3, bomb: 3, undo: 3, shuffle: 3 }, skin: 'sunrise', noAdsDays: 7 } },
      { id: 'boosters_bundle', type: 'consumable', price: '1,99 €', grant: { boosters: { undo: 5, bomb: 3, rotate: 3 } } },
      { id: 'skin_neon', type: 'non_consumable', price: '1,99 €', grant: { skin: 'neon' } }
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
        paper: 'Paper', linen: 'Linen', slate: 'Slate', moss: 'Moss' },
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
    es: { daily: 'Diario', endless: 'Infinito', adventure: 'Aventura', over: 'Sin hueco', done: 'Diario completado', again: 'Otra',
      share: 'Compartir', copied: 'Copiado', newBest: 'Nuevo récord', combo: 'Combo', clean: '¡Limpio!', next: 'Siguiente', nextLv: 'Siguiente',
      level: 'Nivel', outMoves: 'Sin movimientos', quests: 'Misiones', shop: 'Tienda', cont: 'Seguir',
      q: { lines: 'Haz {n} líneas', pieces: 'Coloca {n} piezas', games: 'Juega {n} partidas', combo3: 'Combo ×3 ({n})',
        levels: 'Supera {n} niveles', stars: 'Gana {n} estrellas', daily: 'Juega el diario ({n})', gems: 'Recoge {n} gemas', boosters: 'Usa {n} ayuda' },
      skins: { calm: 'Calma', sorbet: 'Sorbete', forest: 'Bosque', ink: 'Tinta', neon: 'Neón', sunrise: 'Amanecer', aurora: 'Aurora',
        paper: 'Papel', linen: 'Lino', slate: 'Pizarra', moss: 'Musgo' },
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
    levels: { count: Levels.COUNT, chapter: 15, start: (n) => startLevel(n, false) },
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
    const { bx, cell, bs } = L;
    let by = L.by;
    if (shake) {
      const k = (t - shake.t0) / 320;
      if (k >= 1) shake = null; else by += Math.sin(k * Math.PI * 3) * (1 - k) * shake.amp;
    }
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
    for (let i = 0; i < 3; i++) {
      const p = game.tray[i];
      if (!p || p.used || (drag && drag.i === i) || (ret && ret.i === i)) continue;
      const k = (t - trayIn[i]) / 260;
      let sc = k >= 1 ? 1 : back(k);
      if (sc <= 0.01) continue;
      if (boostMode === 'rotate') sc *= 1 + Math.sin(t / 120 + i) * 0.04;
      const fits = screen !== 'play' || C.fitsAnywhere(game.board, p.cells);
      const sz = L.tcell, pos = slotPiecePos(i, p.cells, sz), d = dims(p.cells);
      const cx = pos.x + d.w * sz / 2, cy = pos.y + d.h * sz / 2;
      p.cells.forEach((q) => {
        const x = cx + (pos.x + q[1] * sz - cx) * sc, y = cy + (pos.y + q[0] * sz - cy) * sc;
        tile(fits ? TILES[p.color] : PAL.dead, x, y, sz * sc, 1, fits ? 1 : 0.7);
      });
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
  }
  let aim = null;

  function burst(x, y, color) {
    if (parts.length > 180) return;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 220, s: L.cell * (0.12 + Math.random() * 0.12), life: 0.55 + Math.random() * 0.3, color });
    }
  }

  function busy(t) {
    return !!(drag || ret || placeFx || overFx || shake || boostMode || clearFx.length || parts.length || (game && game.gems) ||
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
  function pressBooster(id, consume) {
    if (boostMode === id) { boostMode = null; aim = null; shell.setBoosterActive(null); dirty = true; return; }
    if (id === 'undo') { if (game.undo()) { consume(); afterBoost('undo'); } return; }
    if (id === 'shuffle') { if (game.shuffle()) { consume(); const t = now(); trayIn = [t, t + 60, t + 120]; sfx.deal(); afterBoost('shuffle'); } return; }
    boostMode = id; aim = null; consumeBooster = consume;
    shell.setBoosterActive(id);
    dirty = true;
  }
  function boostTap(p) {
    if (boostMode === 'rotate') {
      const i = slotAt(p);
      if (i < 0 || !game.tray[i] || game.tray[i].used) { boostMode = null; shell.setBoosterActive(null); return; }
      if (game.rotate(i)) { consumeBooster(); tone(hz(14), 0, 0.08, 'sine', 0.06, hz(19)); afterBoost('rotate'); }
      else sfx.bad();
    } else if (boostMode === 'bomb') {
      const c = cellAt(p);
      if (!c) { boostMode = null; aim = null; shell.setBoosterActive(null); return; }
      const res = game.bomb(c.r, c.c);
      if (res) {
        consumeBooster();
        const t = now();
        res.cleared.forEach((q) => { const qr = (q.i / N) | 0, qc = q.i % N; clearFx.push({ i: q.i, color: q.color, gem: q.gem, t0: t, delay: Math.hypot(qr - c.r, qc - c.c) * 40 }); });
        shake = { t0: t, amp: 7 };
        sfx.boom(); buzz([30, 30, 40]);
        if (res.gems) setTimeout(sfx.gem, 200);
        afterBoost('bomb');
      }
    }
  }
  function afterBoost(id) {
    boostMode = null; aim = null; consumeBooster = null;
    shell.setBoosterActive(null);
    P.track('booster_applied', { booster: id, mode, level: levelNo || 0 });
    updateHud(); saveRun(); P.commit();
    dirty = true;
    if (game.over) overTimer = setTimeout(gameOver, 650);
  }

  // ---------- game flow ----------
  function doPlace(i, r, c) {
    const res = game.place(i, r, c);
    if (!res) return null;
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
    begin(new C.Game({ seed: 0, level: Levels.get(n) }), 'level');
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
      if (firstTime) summary = P.finished({ mode: 'level', level: levelNo, won: game.won, stars: game.stars, score: game.score,
        stats: gameStats(), reason: game.outOfMoves ? 'moves' : 'stuck' });
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
