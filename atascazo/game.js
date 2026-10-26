/* Atascazo 1.1.0 | (c) Cesar Pereiro | all code, art and sounds original, no third-party assets */

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

/* ---- gamekit/embed/embed.js ---- */
/* gamekit embed: puts the platform UI on top of a game that keeps its own page and look (Atascazo, Hilvana).
 * Platform layer, no game code.
 *
 *   var host = GamekitEmbed.mount({ lang: 'es', levels: true, symbols: '<symbol id="i-undo">...</symbol>' });
 *   var shell = GamekitShell.create(P, { ids: GamekitEmbed.ids({ 'o-cont': 'l-cont' }), lang: 'es', ... });
 *   GamekitEmbed.bind(shell);                       // the bar's back button
 *   GamekitFunUI.attach(P, shell, { host: 'gk', ... });
 *
 * mount() adds <div id="gk" class="gk-host"> at the end of <body>: a top bar (back, streak, coins) that shows while a
 * platform sheet is up, the quests / shop (and optional level map) sheets, a toast, and the SVG symbols the platform
 * draws with (skipped when the page already defines one with the same id). The scoped stylesheet
 * (gamekit.embed_css() at build time) styles only what is inside the host, so the game's own CSS is untouched.
 * Game containers that hold gk widgets (level bar, dock buttons) add the class gk-tok to get the platform tokens.
 */
(function (root) {
  'use strict';
  var DEFAULT_IDS = {
    coins: 'gk-coins', streak: 'gk-flame', 'streak-v': 'gk-streak-v', 'b-coins': 'gk-b-coins', 'b-sound': 'gk-none', 'b-theme': 'gk-none',
    toast: 'gk-toast', 'o-coins': 'gk-none', 'o-double': 'gk-none', 'o-cont': 'gk-none', boosters: 'gk-none',
    levels: 'gk-levels', 'lv-grid': 'gk-lv-grid', 'lv-stars': 'gk-lv-stars',
    quests: 'gk-quests', chests: 'gk-chests', pass: 'gk-pass', qlist: 'gk-qlist', shop: 'gk-shop', shoplist: 'gk-shoplist'
  };
  var TX = { es: { quests: 'Misiones', shop: 'Tienda', levels: 'Niveles', back: 'Volver' },
    en: { quests: 'Quests', shop: 'Shop', levels: 'Levels', back: 'Back' } };
  var SYM = {
    'i-coin': '<symbol id="i-coin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="#e5b567"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#c9963f" stroke-width="2"/></symbol>',
    'i-flame': '<symbol id="i-flame" viewBox="0 0 24 24"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.8.2 1.6 1 2.6 2 2.8C10.6 8.6 11 5.6 12 3z"/></symbol>',
    'i-star': '<symbol id="i-star" viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></symbol>',
    'i-chest': '<symbol id="i-chest" viewBox="0 0 24 24"><path d="M3 10a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v1H3z"/><rect x="3" y="12" width="18" height="8" rx="1.5"/><rect x="10.5" y="10" width="3" height="5" rx="1" fill="#fff" opacity=".7"/></symbol>',
    'i-ad': '<symbol id="i-ad" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="m10 9 5 3-5 3z"/></symbol>',
    'i-lock': '<symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></symbol>',
    'i-play': '<symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></symbol>',
    'i-quest': '<symbol id="i-quest" viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m8.5 9 1.5 1.5L13 7.5M8.5 15h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>',
    'i-shop': '<symbol id="i-shop" viewBox="0 0 24 24"><path d="M4 9h16l-1.2 10.2a1 1 0 0 1-1 .8H6.2a1 1 0 0 1-1-.8zM8.5 9V7.5a3.5 3.5 0 0 1 7 0V9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></symbol>'
  };

  function ids(extra) { return Object.assign({}, DEFAULT_IDS, extra || {}); }

  function mount(opts) {
    opts = opts || {};
    var doc = root.document, T = TX[opts.lang] || TX.es;
    var have = function (id) { return !!doc.getElementById(id); };
    var syms = Object.keys(SYM).filter(function (k) { return !have(k); }).map(function (k) { return SYM[k]; }).join('') + (opts.symbols || '');
    var host = doc.createElement('div');
    host.id = 'gk';
    host.className = 'gk-host';
    host.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' + syms + '</svg>' +
      '<header class="gk-bar"><button class="ic" id="gk-back" aria-label="' + T.back + '"><svg viewBox="0 0 24 24"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<span class="gk-bar-sp"></span><button class="chip flame" id="gk-flame" aria-label="streak"><svg><use href="#i-flame"/></svg><span id="gk-streak-v">0</span></button>' +
      '<button class="chip" id="gk-b-coins" aria-label="coins"><svg><use href="#i-coin"/></svg><span id="gk-coins">0</span></button></header>' +
      (opts.levels ? '<section id="gk-levels" class="panel sheet"><div class="sheet-head"><span class="k">' + T.levels + '</span><span class="chip"><svg><use href="#i-star"/></svg><span id="gk-lv-stars">0</span></span></div><div class="lv-grid" id="gk-lv-grid"></div></section>' : '') +
      '<section id="gk-quests" class="panel sheet"><div class="sheet-head"><span class="k">' + T.quests + '</span></div><div class="chests" id="gk-chests"></div><div class="pass" id="gk-pass"></div><div class="qlist" id="gk-qlist"></div></section>' +
      '<section id="gk-shop" class="panel sheet"><div class="sheet-head"><span class="k">' + T.shop + '</span></div><div class="shop" id="gk-shoplist"></div></section>' +
      '<div class="toast" id="gk-toast"></div>';
    doc.body.appendChild(host);
    return host;
  }

  // the bar's back button returns to the game screen the sheet was opened from (or to opts.back())
  function bind(shell, opts) {
    opts = opts || {};
    var b = root.document.getElementById('gk-back');
    if (b) b.addEventListener('click', function () { if (opts.onTap) opts.onTap(); if (opts.back) opts.back(); else shell.back(); });
  }

  var Embed = { mount: mount, bind: bind, ids: ids, DEFAULT_IDS: DEFAULT_IDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Embed;
  else root.GamekitEmbed = Embed;
})(this);

/* ---- game/rules.js ---- */
/* Atascazo rules: the pure game logic (no DOM). Works in the browser (window.AtascoRules) and in node.
 *
 * Level spec (JSON):
 *   { v: 1, id, seed, pack, cols, rows,
 *     slots: 5,                  hard-shoulder ("arcen") waiting places
 *     cap: 3,                    cars per transporter truck
 *     trucks: ['red', ...],      truck colours, in arrival order (each takes `cap` cars of its colour)
 *     obstacles: [[x, y], ...],  cones: block paths, never move
 *     cars: [{ x, y, len, dir: 'U'|'D'|'L'|'R', c: 'red', kind?, key?: true, lock?: carIndex }] }
 *   (x, y) is the top-left cell of the car. Horizontal cars face L/R, vertical cars U/D.
 *   A car with `lock: k` cannot leave until car k (which shows a key) has left.
 *
 * Rules:
 *   - Tap a car: if every cell between its nose and the lot edge is empty (and it is not locked) it drives out
 *     onto the ring road and up to the dock. Otherwise it bumps (the tap still counts as a move).
 *   - At the dock: if the truck being loaded has its colour, the car boards. Otherwise it parks on the arcen.
 *   - A full truck leaves; the next one docks and pulls its colour from the arcen at once.
 *   - A car with nowhere to go (arcen full, wrong colour) does not leave: "no room" bump, counts as a move.
 *   - You lose when no car can leave (arcen full and no free car of the truck's colour). Win: every truck full.
 * Boarding never involves a choice (all cars of a colour are equal), so the whole state is the set of cars
 * that have left: the solver keys on that set only.
 */
(function (root) {
  'use strict';

  var COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'pink', 'teal'];
  var DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  var MAX_CARS = 53;   // two 30-bit words packed into one double for the solver key

  function cellsOf(car) {
    var out = [], horiz = car.dir === 'L' || car.dir === 'R';
    for (var i = 0; i < car.len; i++) out.push(horiz ? [car.x + i, car.y] : [car.x, car.y + i]);
    return out;
  }

  // cells from the nose to the lot edge, nearest first
  function pathOf(car, cols, rows) {
    var d = DIRS[car.dir], out = [];
    var hx = car.dir === 'R' ? car.x + car.len - 1 : car.x;
    var hy = car.dir === 'D' ? car.y + car.len - 1 : car.y;
    var x = hx + d[0], y = hy + d[1];
    while (x >= 0 && y >= 0 && x < cols && y < rows) { out.push([x, y]); x += d[0]; y += d[1]; }
    return out;
  }

  function validate(L) {
    var err = [];
    if (!L || typeof L !== 'object') return ['not an object'];
    if (!(L.cols >= 1 && L.cols <= 12 && L.rows >= 1 && L.rows <= 14)) err.push('bad grid size');
    if (!(L.cap >= 1 && L.cap <= 6)) err.push('bad cap');
    if (!(L.slots >= 1 && L.slots <= 9)) err.push('bad slots');
    if (!Array.isArray(L.cars) || !L.cars.length) return err.concat('no cars');
    if (L.cars.length > MAX_CARS) err.push('too many cars (max ' + MAX_CARS + ')');
    var grid = {}, need = {}, have = {};
    (L.obstacles || []).forEach(function (o) { grid[o[0] + ',' + o[1]] = 'o'; });
    L.cars.forEach(function (c, i) {
      if (!DIRS[c.dir]) err.push('car ' + i + ': bad dir');
      if (!(c.len >= 1 && c.len <= 3)) err.push('car ' + i + ': bad len');
      if (COLORS.indexOf(c.c) < 0) err.push('car ' + i + ': bad colour ' + c.c);
      cellsOf(c).forEach(function (p) {
        if (p[0] < 0 || p[1] < 0 || p[0] >= L.cols || p[1] >= L.rows) err.push('car ' + i + ': out of bounds');
        var k = p[0] + ',' + p[1];
        if (grid[k] !== undefined) err.push('car ' + i + ': overlaps ' + grid[k]);
        grid[k] = i;
      });
      if (c.lock !== undefined && (!(c.lock >= 0 && c.lock < L.cars.length) || c.lock === i || !L.cars[c.lock].key)) err.push('car ' + i + ': bad lock');
      have[c.c] = (have[c.c] || 0) + 1;
    });
    (L.trucks || []).forEach(function (t) { need[t] = (need[t] || 0) + L.cap; });
    Object.keys(need).concat(Object.keys(have)).forEach(function (k) {
      if ((need[k] || 0) !== (have[k] || 0)) err.push('colour ' + k + ': ' + (have[k] || 0) + ' cars for ' + (need[k] || 0) + ' truck places');
    });
    L.cars.forEach(function (c, i) {
      pathOf(c, L.cols, L.rows).forEach(function (p) { if (grid[p[0] + ',' + p[1]] === 'o') err.push('car ' + i + ': a cone blocks its path for ever'); });
    });
    return err;
  }

  /* Static analysis of a level: blockers never change (cars only ever leave), so each car gets the list of
   * cars sitting on its path. Colours live in the state (the recolour booster changes them). */
  function compile(L) {
    var n = L.cars.length, owner = {}, palette = [];
    L.cars.forEach(function (c, i) { cellsOf(c).forEach(function (p) { owner[p[0] + ',' + p[1]] = i; }); });
    L.trucks.forEach(function (t) { if (palette.indexOf(t) < 0) palette.push(t); });
    L.cars.forEach(function (c) { if (palette.indexOf(c.c) < 0) palette.push(c.c); });
    var blockers = L.cars.map(function (c) {
      var seen = [];
      pathOf(c, L.cols, L.rows).forEach(function (p) {
        var o = owner[p[0] + ',' + p[1]];
        if (o !== undefined && seen.indexOf(o) < 0) seen.push(o);
      });
      return seen;
    });
    return {
      level: L, n: n, cap: L.cap, baseSlots: L.slots, palette: palette,
      trucks: L.trucks.map(function (t) { return palette.indexOf(t); }),
      color0: L.cars.map(function (c) { return palette.indexOf(c.c); }),
      blockers: blockers,
      lock: L.cars.map(function (c) { return c.lock === undefined ? -1 : c.lock; }),
      owner: owner
    };
  }

  // ---------------------------------------------------------------- state
  function newState(K) {
    var nc = K.palette.length;
    var st = {
      gone: new Uint8Array(K.n), col: Int8Array.from(K.color0),
      truck: 0, fill: 0, seats: [],                 // seats: car indices in the docked truck
      slots: K.baseSlots, wait: [],                 // wait[k] = car index or -1
      waitCount: new Int16Array(nc), waitTotal: 0,
      moves: 0, bumps: 0, exits: 0, continues: 0, boosters: 0, over: false, won: false, failReason: null
    };
    for (var k = 0; k < st.slots; k++) st.wait.push(-1);
    settle(K, st, []);   // a truck with no cars? (never in valid levels) keeps the invariant anyway
    return st;
  }

  function clone(st) {
    return {
      gone: st.gone.slice(), col: st.col.slice(), truck: st.truck, fill: st.fill, seats: st.seats.slice(),
      slots: st.slots, wait: st.wait.slice(), waitCount: st.waitCount.slice(), waitTotal: st.waitTotal,
      moves: st.moves, bumps: st.bumps, exits: st.exits, continues: st.continues, boosters: st.boosters,
      over: st.over, won: st.won, failReason: st.failReason
    };
  }

  function blockedBy(K, st, i) {
    var b = K.blockers[i];
    for (var j = 0; j < b.length; j++) if (!st.gone[b[j]]) return b[j];
    return -1;
  }
  function isLocked(K, st, i) { return K.lock[i] >= 0 && !st.gone[K.lock[i]]; }
  function isFree(K, st, i) { return !st.gone[i] && !isLocked(K, st, i) && blockedBy(K, st, i) < 0; }
  function truckColor(K, st) { return st.truck < K.trucks.length ? K.trucks[st.truck] : -1; }
  function hasRoom(K, st, i) { return st.col[i] === truckColor(K, st) || st.waitTotal < st.slots; }
  function canLeave(K, st, i) { return isFree(K, st, i) && hasRoom(K, st, i); }

  function legalMoves(K, st) {
    var out = [];
    for (var i = 0; i < K.n; i++) if (canLeave(K, st, i)) out.push(i);
    return out;
  }

  /* After a departure: dock the next trucks and pull their colour from the arcen (cascading). */
  function settle(K, st, ev) {
    while (st.truck < K.trucks.length && st.fill === K.cap) {
      ev.push({ t: 'depart', truck: st.truck, seats: st.seats.slice() });
      st.truck++; st.fill = 0; st.seats = [];
      if (st.truck >= K.trucks.length) break;
      ev.push({ t: 'arrive', truck: st.truck });
      var c = K.trucks[st.truck];
      for (var k = 0; k < st.wait.length && st.fill < K.cap; k++) {
        var car = st.wait[k];
        if (car >= 0 && st.col[car] === c) {
          st.wait[k] = -1; st.waitCount[c]--; st.waitTotal--;
          ev.push({ t: 'transfer', car: car, slot: k, truck: st.truck, seat: st.fill });
          st.seats.push(car); st.fill++;
        }
      }
    }
  }

  function park(K, st, i, ev) {
    var c = st.col[i];
    st.gone[i] = 1; st.exits++;
    if (c === truckColor(K, st)) {
      ev.push({ t: 'board', car: i, truck: st.truck, seat: st.fill });
      st.seats.push(i); st.fill++;
      settle(K, st, ev);
    } else {
      var k = st.wait.indexOf(-1);
      st.wait[k] = i; st.waitCount[c]++; st.waitTotal++;
      ev.push({ t: 'wait', car: i, slot: k });
    }
  }

  function checkEnd(K, st, ev) {
    if (st.truck >= K.trucks.length) { st.over = true; st.won = true; ev.push({ t: 'win' }); return; }
    if (!legalMoves(K, st).length) {
      st.over = true;
      st.failReason = st.waitTotal >= st.slots ? 'arcen_full' : 'stuck';
      ev.push({ t: 'fail', reason: st.failReason });
    }
  }

  /* The player taps car i. Returns { ok, events } where events drive the animations:
   *   bump {car, by: blockerCar | -1 (lock) }, noroom {car}, exit {car}, board, wait, depart, arrive, transfer,
   *   win, fail {reason}. Mutates st. */
  function tap(K, st, i) {
    var ev = [];
    if (st.over || st.gone[i]) return { ok: false, events: ev };
    st.moves++;
    if (isLocked(K, st, i)) { st.bumps++; ev.push({ t: 'bump', car: i, by: -1, lock: K.lock[i] }); return { ok: false, events: ev }; }
    var b = blockedBy(K, st, i);
    if (b >= 0) { st.bumps++; ev.push({ t: 'bump', car: i, by: b }); return { ok: false, events: ev }; }
    if (!hasRoom(K, st, i)) { st.bumps++; ev.push({ t: 'noroom', car: i }); return { ok: false, events: ev }; }
    ev.push({ t: 'exit', car: i });
    park(K, st, i, ev);
    checkEnd(K, st, ev);
    return { ok: true, events: ev };
  }

  // ---------------------------------------------------------------- boosters (pure; charging is the platform's job)
  /* crane: lift any parked car (blocked or locked) straight to the dock. Needs room like any car. */
  function crane(K, st, i) {
    var ev = [];
    if (st.over || st.gone[i] || !hasRoom(K, st, i)) return { ok: false, events: ev };
    st.boosters++;
    ev.push({ t: 'lift', car: i });
    park(K, st, i, ev);
    checkEnd(K, st, ev);
    return { ok: true, events: ev };
  }

  /* extra arcen place(s). Also the continue: +n places and the game goes on. */
  function addSlots(K, st, n) {
    st.slots += n;
    for (var k = 0; k < n; k++) st.wait.push(-1);
    if (st.over && !st.won) { st.over = false; st.failReason = null; }
    var ev = [{ t: 'slots', n: n }];
    if (!st.over) checkEnd(K, st, ev);
    return { ok: true, events: ev };
  }

  /* recolour: deal the colours of the parked cars again (same counts), keeping only a deal the solver can
   * finish. `solvable(K, st)` is injected (solver.js) so this file stays dependency-free. */
  function recolour(K, st, rng, solvable, tries) {
    var parked = [];
    for (var i = 0; i < K.n; i++) if (!st.gone[i]) parked.push(i);
    if (parked.length < 2) return { ok: false, events: [] };
    var cols = parked.map(function (i) { return st.col[i]; });
    var best = null, bestFree = -1;
    for (var t = 0; t < (tries || 24); t++) {
      for (var a = cols.length - 1; a > 0; a--) { var b = Math.floor(rng() * (a + 1)), x = cols[a]; cols[a] = cols[b]; cols[b] = x; }
      var trial = clone(st);
      parked.forEach(function (car, k) { trial.col[car] = cols[k]; });
      trial.over = false; trial.failReason = null;
      if (!legalMoves(K, trial).length) continue;
      if (solvable && !solvable(K, trial)) continue;
      // prefer deals where the docked truck's colour is free right now
      var tc = truckColor(K, trial), free = 0;
      parked.forEach(function (car) { if (trial.col[car] === tc && isFree(K, trial, car)) free++; });
      if (free > bestFree) { bestFree = free; best = cols.slice(); }
      if (free >= 2) break;
    }
    if (!best) return { ok: false, events: [] };
    var ev = [{ t: 'recolour', cars: parked.slice() }];
    parked.forEach(function (car, k) { st.col[car] = best[k]; });
    st.boosters++;
    if (st.over && !st.won) { st.over = false; st.failReason = null; }
    checkEnd(K, st, ev);
    return { ok: true, events: ev };
  }

  function starsFor(K, st) {
    var extra = st.moves - st.exits;
    var s = extra <= Math.floor(K.n / 12) ? 3 : extra <= Math.floor(K.n / 5) + 1 ? 2 : 1;
    if (st.continues > 0) s = Math.min(s, 2);
    return s;
  }

  var api = {
    COLORS: COLORS, DIRS: DIRS, MAX_CARS: MAX_CARS,
    cellsOf: cellsOf, pathOf: pathOf, validate: validate, compile: compile,
    newState: newState, clone: clone, blockedBy: blockedBy, isLocked: isLocked, isFree: isFree,
    truckColor: truckColor, hasRoom: hasRoom, canLeave: canLeave, legalMoves: legalMoves,
    tap: tap, crane: crane, addSlots: addSlots, recolour: recolour, starsFor: starsFor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtascoRules = api;
})(this);

/* ---- game/solver.js ---- */
/* Atascazo solver and difficulty meter (no DOM; browser: window.AtascoSolver, node: require).
 *
 *   solve(K, st?, { maxNodes, plain })  -> { solved, path: [car], nodes, exhausted }
 *       Depth-first search over "which cars have left" (the whole state, see rules.js) with a memo of
 *       dead states. Move order: cars that board right now, then cars whose colour docks soonest, then cars
 *       that unblock the most. `plain: true` drops the ordering (index order): its node count is a measure of
 *       how much a player without a plan has to try.
 *   solvable(K, st, maxNodes?) -> true | false (unknown after maxNodes counts as true: the generator only
 *       builds levels with a known solution, the cap only matters for booster checks)
 *   playouts(K, rng, n, policy)  -> { winRate, failRate, avgBranch }   policy 'random' | 'greedy'
 *       random: any car that can leave. greedy: a car of the docked truck's colour if one can leave, else any.
 *       The greedy fail rate is the best single predictor of how often a casual player loses.
 *   analyze(K, opts) -> full stats for a level (used by tests and tools/levels.js)
 */
(function (root) {
  'use strict';
  var R = root.AtascoRules || (typeof require === 'function' ? require('./rules.js') : null);
  var WORD = 1073741824; // 2^30

  function Sim(K, st) {
    this.K = K; this.n = K.n;
    this.gone = st ? st.gone.slice() : new Uint8Array(K.n);
    this.col = st ? st.col : Int8Array.from(K.color0);
    this.truck = st ? st.truck : 0;
    this.fill = st ? st.fill : 0;
    this.W = st ? st.waitCount.slice() : new Int16Array(K.palette.length);
    this.wt = st ? st.waitTotal : 0;
    this.slots = st ? st.slots : K.baseSlots;
    this.lo = 0; this.hi = 0;
    for (var i = 0; i < K.n; i++) if (this.gone[i]) { if (i < 30) this.lo += 1 << i; else this.hi += Math.pow(2, i - 30); }
  }
  Sim.prototype.key = function () { return this.lo + this.hi * WORD; };
  Sim.prototype.won = function () { return this.truck >= this.K.trucks.length; };
  Sim.prototype.tc = function () { return this.truck < this.K.trucks.length ? this.K.trucks[this.truck] : -1; };
  Sim.prototype.free = function (i) {
    if (this.gone[i]) return false;
    var l = this.K.lock[i];
    if (l >= 0 && !this.gone[l]) return false;
    var b = this.K.blockers[i];
    for (var j = 0; j < b.length; j++) if (!this.gone[b[j]]) return false;
    return true;
  };
  Sim.prototype.legal = function () {
    var out = [], tc = this.tc(), room = this.wt < this.slots;
    for (var i = 0; i < this.n; i++) if (this.free(i) && (room || this.col[i] === tc)) out.push(i);
    return out;
  };
  Sim.prototype.play = function (i) {
    var rec = { i: i, truck: this.truck, fill: this.fill, wt: this.wt, W: this.W.slice() };
    var K = this.K, c = this.col[i];
    this.gone[i] = 1;
    if (i < 30) this.lo += 1 << i; else this.hi += Math.pow(2, i - 30);
    if (c === this.tc()) {
      this.fill++;
      while (this.fill === K.cap && this.truck < K.trucks.length) {
        this.truck++; this.fill = 0;
        if (this.truck >= K.trucks.length) break;
        var nc = K.trucks[this.truck], take = Math.min(this.W[nc], K.cap);
        this.W[nc] -= take; this.wt -= take; this.fill = take;
      }
    } else { this.W[c]++; this.wt++; }
    return rec;
  };
  Sim.prototype.undo = function (rec) {
    var i = rec.i;
    this.gone[i] = 0;
    if (i < 30) this.lo -= 1 << i; else this.hi -= Math.pow(2, i - 30);
    this.truck = rec.truck; this.fill = rec.fill; this.wt = rec.wt; this.W = rec.W;
  };

  // how many cars each car blocks (static), for move ordering
  function dependents(K) {
    if (K._dep) return K._dep;
    var d = new Int16Array(K.n);
    K.blockers.forEach(function (b) { b.forEach(function (j) { d[j]++; }); });
    K.lock.forEach(function (l) { if (l >= 0) d[l] += 2; });
    return (K._dep = d);
  }

  function order(sim, moves) {
    var K = sim.K, dep = dependents(K), tc = sim.tc(), T = K.trucks;
    var score = function (i) {
      var c = sim.col[i];
      if (c === tc) return 1000 + dep[i];
      var dist = 99;
      for (var t = sim.truck + 1; t < T.length && t < sim.truck + 8; t++) if (T[t] === c) { dist = t - sim.truck; break; }
      return 500 - dist * 20 + dep[i] * 3;
    };
    return moves.sort(function (a, b) { return score(b) - score(a); });
  }

  function solve(K, st, opts) {
    opts = opts || {};
    var max = opts.maxNodes || 200000, plain = !!opts.plain;
    var sim = new Sim(K, st), dead = opts.memo || new Set(), nodes = 0, capped = false, path = [];
    function dfs() {
      if (sim.won()) return true;
      if (nodes >= max) { capped = true; return false; }
      var k = sim.key();
      if (dead.has(k)) return false;
      nodes++;
      var moves = sim.legal();
      if (!plain) order(sim, moves);
      for (var m = 0; m < moves.length; m++) {
        var rec = sim.play(moves[m]);
        path.push(moves[m]);
        if (dfs()) return true;
        path.pop();
        sim.undo(rec);
        if (capped) return false;
      }
      dead.add(k);
      return false;
    }
    var ok = dfs();
    return { solved: ok, path: ok ? path.slice() : null, nodes: nodes, exhausted: !ok && !capped };
  }

  function solvable(K, st, maxNodes) {
    var r = solve(K, st, { maxNodes: maxNodes || 20000 });
    return r.solved || !r.exhausted;
  }

  function playouts(K, rng, count, policy) {
    var wins = 0, branch = 0, steps = 0;
    for (var p = 0; p < count; p++) {
      var sim = new Sim(K, null);
      for (;;) {
        if (sim.won()) { wins++; break; }
        var moves = sim.legal();
        if (!moves.length) break;
        branch += moves.length; steps++;
        if (policy === 'greedy') {
          var tc = sim.tc(), good = moves.filter(function (i) { return sim.col[i] === tc; });
          if (good.length) moves = good;
        }
        sim.play(moves[Math.floor(rng() * moves.length)]);
      }
    }
    return { winRate: wins / count, failRate: 1 - wins / count, avgBranch: steps ? branch / steps : 0 };
  }

  /* Dead-end ratio: along greedy playouts, at every decision taken from a winnable state, the share of
   * legal moves that make the level unwinnable. Exact (memoised search per child, capped). */
  function deadEnds(K, rng, count, maxNodes) {
    var dead = new Set(), alive = new Set(), fatal = 0, total = 0;
    function win(sim) {
      var k = sim.key();
      if (alive.has(k)) return true;
      if (dead.has(k)) return false;
      var st = { gone: sim.gone, col: sim.col, truck: sim.truck, fill: sim.fill, waitCount: sim.W, waitTotal: sim.wt, slots: sim.slots };
      var r = solve(K, st, { maxNodes: maxNodes, memo: dead });
      if (r.solved || !r.exhausted) { alive.add(k); return true; }
      dead.add(k);
      return false;
    }
    for (var p = 0; p < count; p++) {
      var sim = new Sim(K, null);
      while (!sim.won()) {
        var moves = sim.legal();
        if (!moves.length || !win(sim)) break;
        var ok = [];
        for (var m = 0; m < moves.length; m++) {
          var rec = sim.play(moves[m]);
          if (win(sim)) ok.push(moves[m]); else fatal++;
          total++;
          sim.undo(rec);
        }
        var tc = sim.tc(), pool = moves.filter(function (i) { return sim.col[i] === tc; });
        if (!pool.length) pool = moves;
        sim.play(pool[Math.floor(rng() * pool.length)]);
      }
    }
    return total ? fatal / total : 0;
  }

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // quick score in [0, 1]: what the generator uses to place a level on the curve (cheap: ~2 ms)
  function quickScore(K, seed, n) {
    var rng = mulberry(seed ^ 0x9e3779b9);
    var g = playouts(K, rng, n || 24, 'greedy'), r = playouts(K, rng, n || 24, 'random');
    return { score: 0.65 * g.failRate + 0.35 * r.failRate, greedyFail: g.failRate, randomFail: r.failRate, branch: g.avgBranch };
  }

  function analyze(K, opts) {
    opts = opts || {};
    var seed = opts.seed || 1, rng = mulberry(seed);
    var s = solve(K, null, { maxNodes: opts.maxNodes || 400000 });
    var plain = solve(K, null, { maxNodes: opts.plainNodes || 50000, plain: true });
    var g = playouts(K, rng, opts.playouts || 200, 'greedy');
    var r = playouts(K, rng, opts.playouts || 200, 'random');
    var out = {
      solved: s.solved, exhausted: s.exhausted, nodes: s.nodes, minMoves: s.solved ? s.path.length : null,
      plainNodes: plain.nodes, plainSolved: plain.solved,
      greedyFail: g.failRate, randomFail: r.failRate, branching: g.avgBranch,
      solution: s.path
    };
    if (opts.deadEnds !== false) out.deadEndRatio = deadEnds(K, rng, opts.deadEndRuns || 6, opts.deadEndNodes || 20000);
    out.difficulty = 0.5 * out.greedyFail + 0.3 * out.randomFail + 0.2 * (out.deadEndRatio || 0);
    return out;
  }

  var api = { Sim: Sim, solve: solve, solvable: solvable, playouts: playouts, deadEnds: deadEnds,
    quickScore: quickScore, analyze: analyze, mulberry: mulberry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtascoSolver = api;
})(this);

/* ---- game/generator.js ---- */
/* Atascazo level generator (no DOM; browser: window.AtascoGen, node: require).
 *
 *   level(n)           -> level spec for map level n (1-based). Deterministic: same n, same level, forever
 *                         (as long as GEN_VERSION is unchanged). Levels beyond COUNT keep coming (endless).
 *   daily('2026-10-26') -> the "Operación Salida" daily level for that date (same for every player)
 *   dailyNumber(date)  -> #1 on the epoch day
 *   params(n)          -> the difficulty-curve knobs for level n
 *   pack(n)            -> the level pack (name, theme, destinations) a level belongs to
 *
 * How a level is built (solvable by construction, then verified):
 *   1. Reverse play. Cars are placed one at a time; each new car must have a clear path to the edge through
 *      the cars placed BEFORE it. Read backwards, the placement order is an exit order in which every car is
 *      free when its turn comes. Placements that block many earlier cars are weighted up as difficulty
 *      rises (deeper dependency chains).
 *   2. Colours. A colour sequence is written along that exit order while simulating the dock: mostly the
 *      docked truck's colour, sometimes a later truck's colour (that car waits on the arcen), never more
 *      waiting cars than the arcen holds. So the exit order is a winning line.
 *   3. Locks/keys: a locked car's key car always comes earlier in the exit order.
 *   4. Several candidates per level; the solver's playout score picks the one closest to the curve target,
 *      and a full solver run must confirm it (belt and braces; it always does).
 */
(function (root) {
  'use strict';
  var R = root.AtascoRules || (typeof require === 'function' ? require('./rules.js') : null);
  var S = root.AtascoSolver || (typeof require === 'function' ? require('./solver.js') : null);

  var GEN_VERSION = 1;
  var PER_PACK = 20;
  var EPOCH = '2026-10-26';
  var CANDIDATES = 8;

  // Packs: Spanish traffic folklore. Destinations are what the motorway panels over the trucks show.
  var PACKS = [
    { id: 'autoescuela', name: 'Primer día de autoescuela', ground: '#cfd5dc', deco: 'cones',
      dest: ['Examen', 'Glorieta', 'Polígono', 'Centro', 'Ronda', 'Plaza Mayor', 'Gasolinera'] },
    { id: 'boda', name: 'Boda en el pueblo', ground: '#d6cfc2', deco: 'flowers',
      dest: ['Iglesia', 'Banquete', 'Ermita', 'Recena', 'Casa novia', 'Pueblo', 'Barra libre'] },
    { id: 'nochebuena', name: 'Parking del centro comercial en Nochebuena', ground: '#c9ccd3', deco: 'lights',
      dest: ['Juguetes', 'Hiper', 'Turrones', 'Planta -3', 'Suegra', 'Cine', 'Salida'] },
    { id: 'm30', name: 'M-30 hora punta', ground: '#c5c9cf', deco: 'city',
      dest: ['Atocha', 'Moncloa', 'Legazpi', 'Pza. Castilla', 'Ventas', 'Puente Vallecas', 'Oficina'] },
    { id: 'centro', name: 'Aparcar en el centro de Madrid', ground: '#cdc8c0', deco: 'city',
      dest: ['Sol', 'Gran Vía', 'Lavapiés', 'Chamberí', 'Malasaña', 'Retiro', 'Zona azul'] },
    { id: 'benidorm', name: 'Salida de Benidorm', ground: '#d8d0bf', deco: 'palms',
      dest: ['Benidorm', 'Altea', 'Calp', 'Alicante', 'Dénia', 'La Vila', 'Guiri Beach'] },
    { id: 'rotonda', name: 'Rotonda infinita', ground: '#c8cfc6', deco: 'roundabout',
      dest: ['1ª salida', '2ª salida', '3ª salida', '4ª salida', 'Otra vuelta', 'Cambio sentido', '5ª salida'] },
    { id: 'puente', name: 'Puente de diciembre', ground: '#d3d8de', deco: 'snow',
      dest: ['Sierra', 'Pirineo', 'Casa rural', 'Asturias', 'Picos', 'Nieve', 'Cañas'] },
    { id: 'paella', name: 'Domingo de paella', ground: '#d9d1bd', deco: 'orange',
      dest: ['Cullera', 'Gandia', 'Albufera', 'El Saler', 'Oliva', 'Valencia', 'Sobremesa'] },
    { id: 'a7', name: 'A-7 en agosto', ground: '#ddd3be', deco: 'palms',
      dest: ['Marbella', 'Málaga', 'Nerja', 'Motril', 'Almería', 'Estepona', 'Chiringuito'] },
    { id: 'vuelta', name: 'Vuelta del puente', ground: '#c6c9cf', deco: 'city',
      dest: ['Madrid', 'Trabajo', 'Lunes', 'Oficina', 'Casa', 'Rutina', 'Atasco'] },
    { id: 'salida', name: 'Operación Salida', ground: '#dcd5c3', deco: 'sun',
      dest: ['Playa', 'Pueblo', 'Costa', 'Montaña', 'Vacaciones', '¡Libertad!', 'Sombrilla'] }
  ];
  var COUNT = PACKS.length * PER_PACK;   // 240 on the map

  var KINDS = { 1: [['mini', 1]], 2: [['sedan', 5], ['furgo', 3], ['autoescuela', 2]], 3: [['caravana', 1], ['bus', 1]] };

  function hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  var rngOf = S.mulberry;
  function pickW(rng, items) {   // items: [[value, weight]]
    var tot = 0, i;
    for (i = 0; i < items.length; i++) tot += items[i][1];
    var x = rng() * tot;
    for (i = 0; i < items.length; i++) { x -= items[i][1]; if (x < 0) return items[i][0]; }
    return items[items.length - 1][0];
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function pack(n) {
    var i = Math.floor((n - 1) / PER_PACK) % PACKS.length;
    return { index: i, pack: PACKS[i], first: Math.floor((n - 1) / PER_PACK) * PER_PACK + 1 };
  }

  /* The curve. t = progress 0..1 over the map; a sawtooth on top: 4-level ramp, relief at the 5th,
   * ramp again, "hard" every 10th. New mechanics never arrive on a hard level. */
  var SAW = [0, 0.04, 0.08, 0.12, -0.08, 0.05, 0.09, 0.13, 0.17, 0.3];
  function params(n, seedOverride) {
    var t = clamp((n - 1) / (COUNT - 20), 0, 1);
    var p = (n - 1) % 10, hard = p === 9 && n > 5, relief = p === 4;
    var d = clamp(0.04 + 0.7 * Math.pow(t, 0.8) + SAW[p] * (0.35 + 0.65 * t) * (n > 5 ? 1 : 0), 0, 1);
    var trucks;
    if (n <= 3) trucks = n + 1;                         // 2, 3, 4 trucks: 6, 9, 12 cars
    else trucks = Math.round(4 + 7.5 * Math.pow(t, 0.75) + (hard ? 1 : 0) - (relief ? 1 : 0));
    trucks = clamp(trucks, 2, 12);
    var colours = n <= 4 ? 2 : n <= 12 ? 3 : n <= 35 ? 4 : n <= 70 ? 5 : n <= 120 ? 6 : 7;
    colours = Math.min(colours, trucks);
    var cars = trucks * 3;
    var density = 0.5 + 0.25 * t + (hard ? 0.04 : 0);
    var cells = Math.ceil(cars * 1.9 / density);
    var cols = clamp(Math.round(Math.sqrt(cells * 0.72)), 4, 8);
    var rows = clamp(Math.ceil(cells / cols), 5, 11);
    if (rows * cols < cells) cols = clamp(Math.ceil(cells / rows), 4, 8);
    var slots = n <= 8 ? 6 : n <= 40 ? 5 : (hard && n > 60 ? 4 : 5);
    return {
      n: n, t: t, d: d, hard: hard, relief: relief, trucks: trucks, colours: colours, cols: cols, rows: rows,
      slots: slots, cap: 3,
      early: 0.12 + 0.5 * d,                       // share of intended exits that wait on the arcen
      slack: d < 0.25 ? 2 : d < 0.6 ? 1 : 0,       // arcen places the intended line leaves free
      bias: 0.3 + 4 * d,                           // weight of placements that block earlier cars
      cones: n < 12 ? 0 : (n === 12 ? 2 : -1),     // -1: random amount (decided per candidate)
      locks: n < 25 ? 0 : (n === 25 ? 1 : -1),
      target: 0.03 + 0.62 * d,                     // quickScore the picker aims for
      seed: seedOverride !== undefined ? seedOverride : hashString('atascazo:v' + GEN_VERSION + ':' + n)
    };
  }

  // ---------------------------------------------------------------- one candidate
  function place(P, rng) {
    var W = P.cols, H = P.rows, n = P.trucks * P.cap;
    var occ = new Int16Array(W * H).fill(-1);   // -1 empty, -2 cone, >=0 car (placement index)
    var cones = [];
    var nCones = P.cones >= 0 ? P.cones : (P.n < 12 ? 0 : Math.floor(rng() * (1 + 3 * P.t)));
    for (var c = 0; c < nCones; c++) {
      var x = Math.floor(rng() * W), y = Math.floor(rng() * H);
      if (occ[y * W + x] === -1) { occ[y * W + x] = -2; cones.push([x, y]); }
    }
    var pathsThrough = [];   // cell -> placed cars whose exit path crosses it
    for (var i = 0; i < W * H; i++) pathsThrough.push([]);
    var placed = [];
    var lenW = P.d < 0.2 ? [[1, 3], [2, 5], [3, 1]] : [[1, 3], [2, 5], [3, 2]];
    for (var k = 0; k < n; k++) {
      var opts = [];
      for (var len = 1; len <= 3; len++) {
        var lw = lenW[len - 1][1];
        ['U', 'D', 'L', 'R'].forEach(function (dir) {
          var horiz = dir === 'L' || dir === 'R';
          for (var y0 = 0; y0 < H; y0++) for (var x0 = 0; x0 < W; x0++) {
            if (horiz ? x0 + len > W : y0 + len > H) continue;
            var car = { x: x0, y: y0, len: len, dir: dir }, ok = true, blocks = 0, seen = {};
            var cl = R.cellsOf(car);
            for (var q = 0; q < cl.length && ok; q++) if (occ[cl[q][1] * W + cl[q][0]] !== -1) ok = false;
            if (!ok) continue;
            var pth = R.pathOf(car, W, H);
            for (q = 0; q < pth.length && ok; q++) if (occ[pth[q][1] * W + pth[q][0]] !== -1) ok = false;
            if (!ok) continue;
            for (q = 0; q < cl.length; q++) {
              var lst = pathsThrough[cl[q][1] * W + cl[q][0]];
              for (var z = 0; z < lst.length; z++) if (!seen[lst[z]]) { seen[lst[z]] = 1; blocks++; }
            }
            var w = lw * (1 + P.bias * blocks) * (pth.length === 0 ? 0.35 : 1);
            opts.push([car, w]);
          }
        });
      }
      if (!opts.length) return null;
      var pick = pickW(rng, opts);
      R.cellsOf(pick).forEach(function (p) { occ[p[1] * W + p[0]] = k; });
      R.pathOf(pick, W, H).forEach(function (p) { pathsThrough[p[1] * W + p[0]].push(k); });
      placed.push(pick);
    }
    return { cars: placed, cones: cones };
  }

  function truckSequence(P, rng) {
    var palette = R.COLORS.slice(0, 8), cols = [];
    // which colours: a seeded pick of P.colours from the palette
    var pool = palette.slice();
    for (var i = 0; i < P.colours; i++) cols.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    var seq = cols.slice();
    while (seq.length < P.trucks) seq.push(cols[Math.floor(rng() * cols.length)]);
    // shuffle, then repair neighbours with the same colour where possible
    for (i = seq.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), x = seq[i]; seq[i] = seq[j]; seq[j] = x; }
    for (var pass = 0; pass < 3; pass++) for (i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) {
      for (j = 0; j < seq.length; j++) if (seq[j] !== seq[i] && (j === 0 || seq[j - 1] !== seq[i]) && (j + 1 >= seq.length || seq[j + 1] !== seq[i])
        && seq[i - 1] !== seq[j] && (i + 1 >= seq.length || seq[i + 1] !== seq[j])) { x = seq[i]; seq[i] = seq[j]; seq[j] = x; break; }
    }
    return seq;
  }

  // colours along the exit order, simulating the dock (see header, step 2)
  function colourLine(P, trucks, rng) {
    var cap = P.cap, n = trucks.length * cap, rem = {}, W = {}, wt = 0, truck = 0, fill = 0, line = [];
    trucks.forEach(function (c) { rem[c] = (rem[c] || 0) + cap; W[c] = 0; });
    var waitCap = Math.max(1, P.slots - P.slack);
    while (line.length < n) {
      var cur = trucks[truck], c = cur;
      if (wt < waitCap && rng() < P.early) {
        var opts = [];
        for (var t = truck + 1; t < trucks.length; t++) {
          var cc = trucks[t];
          if (cc !== cur && rem[cc] > 0 && !opts.some(function (o) { return o[0] === cc; })) opts.push([cc, 1 / (t - truck)]);
        }
        if (opts.length) c = pickW(rng, opts);
      }
      line.push(c); rem[c]--;
      if (c === cur) {
        fill++;
        while (fill === cap && truck < trucks.length) {
          truck++; fill = 0;
          if (truck >= trucks.length) break;
          var nc = trucks[truck], take = Math.min(W[nc], cap);
          W[nc] -= take; wt -= take; fill = take;
        }
      } else { W[c]++; wt++; }
    }
    return line;
  }

  function candidate(P, seed) {
    var rng = rngOf(seed);
    var pl = place(P, rng);
    if (!pl) return null;
    var n = pl.cars.length, trucks = truckSequence(P, rng), line = colourLine(P, trucks, rng);
    // exit order = reverse placement order
    var cars = pl.cars.map(function (c, k) {
      var kind = pickW(rng, KINDS[c.len]);
      return { x: c.x, y: c.y, len: c.len, dir: c.dir, c: line[n - 1 - k], kind: kind, _exit: n - 1 - k };
    });
    var nLocks = P.locks >= 0 ? P.locks : (P.n >= 25 && !P.hard && rng() < 0.45 ? 1 + Math.floor(rng() * (1 + 2 * P.t)) : 0);
    var byExit = cars.slice().sort(function (a, b) { return a._exit - b._exit; });
    for (var l = 0; l < nLocks; l++) {
      var j = Math.floor(n / 3) + Math.floor(rng() * (n - Math.floor(n / 3)));
      var lockCar = byExit[j];
      if (lockCar._key || lockCar._lock) continue;
      var keys = byExit.slice(0, j).filter(function (c) { return !c._lock; });
      if (!keys.length) continue;
      var key = keys[Math.floor(rng() * keys.length)];
      key._key = true; lockCar._lock = key;
    }
    // hide the construction order: cars sorted by position
    cars.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var out = cars.map(function (c) {
      var o = { x: c.x, y: c.y, len: c.len, dir: c.dir, c: c.c, kind: c.kind };
      if (c._key) o.key = true;
      return o;
    });
    cars.forEach(function (c, i) { if (c._lock) out[i].lock = cars.indexOf(c._lock); });
    return {
      v: 1, gen: GEN_VERSION, cols: P.cols, rows: P.rows, slots: P.slots, cap: P.cap,
      trucks: trucks, obstacles: pl.cones, cars: out
    };
  }

  function build(P, id, packIndex) {
    var best = null, bestErr = 1e9, tries = 0, Pc = P;
    while (!best && tries < 6) {
      for (var c = 0; c < CANDIDATES; c++) {
        var seed = (Pc.seed + Math.imul(c + 1 + tries * CANDIDATES, 0x9E3779B1)) >>> 0;
        var L = candidate(Pc, seed);
        if (!L) continue;
        var K = R.compile(L);
        var q = S.quickScore(K, seed);
        var err = Math.abs(q.score - Pc.target);
        if (err < bestErr) {
          var s = S.solve(K, null, { maxNodes: 60000 });
          if (!s.solved) continue;
          bestErr = err; best = L; best.meta = { par: K.n, score: +q.score.toFixed(3), target: +Pc.target.toFixed(3), d: +Pc.d.toFixed(3) };
        }
      }
      if (!best) {   // grid too tight for this seed: one more row, retry
        tries++;
        Pc = Object.assign({}, Pc, { rows: Math.min(Pc.rows + 1, 12), cols: tries > 2 ? Math.min(Pc.cols + 1, 8) : Pc.cols });
      }
    }
    if (!best) throw new Error('level ' + id + ': no buildable candidate');
    best.id = id; best.seed = P.seed; best.pack = packIndex;
    best.hard = !!P.hard;
    return best;
  }

  var cache = {};
  function level(n) {
    if (cache[n]) return cache[n];
    var pk = pack(n);
    return (cache[n] = build(params(n), 'L' + n, pk.index));
  }

  function dayIndex(date) {
    var a = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
    var e = Date.UTC(+EPOCH.slice(0, 4), +EPOCH.slice(5, 7) - 1, +EPOCH.slice(8, 10));
    return Math.round((a - e) / 86400000);
  }
  function dailyNumber(date) { return dayIndex(date) + 1; }
  function todayStr(now) {
    var d = now ? new Date(now) : new Date();
    var m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }
  /* Daily: Monday is gentle, Sunday is a proper Operación Salida. The epoch is a Monday. */
  function daily(date) {
    var key = 'D' + date;
    if (cache[key]) return cache[key];
    var dow = ((dayIndex(date) % 7) + 7) % 7;
    var P = params(50 + dow * 20, hashString('atascazo:daily:' + date));
    P.hard = dow === 6; P.locks = dow >= 3 ? -1 : 0;
    var L = build(P, 'D' + dailyNumber(date), PACKS.length - 1);
    L.daily = { date: date, number: dailyNumber(date) };
    return (cache[key] = L);
  }

  var api = {
    GEN_VERSION: GEN_VERSION, COUNT: COUNT, PER_PACK: PER_PACK, PACKS: PACKS, EPOCH: EPOCH,
    level: level, daily: daily, dailyNumber: dailyNumber, todayStr: todayStr, params: params, pack: pack,
    hashString: hashString, candidate: candidate, colourLine: colourLine
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtascoGen = api;
})(this);

/* ---- game/art.js ---- */
/* Atascazo art: every vehicle, truck, sign and the car park are drawn here in code (no image files).
 * Vehicles are pre-rendered once per (kind, length, colour, cell size) into small canvases ("sprites") with
 * their soft shadow baked in, so a frame is just drawImage calls: 60 fps on mid-range phones.
 * All vehicles are drawn facing +x (right). Original designs, no real brands.
 */
(function (root) {
  'use strict';

  // colour + icon per car colour: never colour alone (colour-blind friendly)
  var PALETTE = {
    red: { body: '#e8484b', icon: 'circle', ink: '#ffffff' },
    blue: { body: '#3b7ddd', icon: 'square', ink: '#ffffff' },
    yellow: { body: '#f2bf16', icon: 'triangle', ink: '#5b4300' },
    green: { body: '#2ea862', icon: 'diamond', ink: '#ffffff' },
    purple: { body: '#8d5fd3', icon: 'star', ink: '#ffffff' },
    orange: { body: '#f0852a', icon: 'plus', ink: '#ffffff' },
    pink: { body: '#ec6fae', icon: 'heart', ink: '#ffffff' },
    teal: { body: '#13a1a6', icon: 'hex', ink: '#ffffff' }
  };
  var SIGN_BLUE = '#1d5aa6';

  function setPalette(map) {   // skins: { red: '#hex', ... } body colours only, icons stay
    Object.keys(map || {}).forEach(function (k) { if (PALETTE[k]) PALETTE[k].body = map[k]; });
    spriteCache = {}; iconCache = {};
  }

  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, a) {   // a in -1..1: darken / lighten
    var c = hexToRgb(h).map(function (v) { return Math.round(a < 0 ? v * (1 + a) : v + (255 - v) * a); });
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function mk(w, h) {
    var c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // ---------------------------------------------------------------- icons
  function iconPath(ctx, id, r) {
    ctx.beginPath();
    var i, a;
    switch (id) {
      case 'circle': ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); break;
      case 'square': rr(ctx, -r * 0.72, -r * 0.72, r * 1.44, r * 1.44, r * 0.22); break;
      case 'triangle': ctx.moveTo(0, -r * 0.92); ctx.lineTo(r * 0.92, r * 0.72); ctx.lineTo(-r * 0.92, r * 0.72); ctx.closePath(); break;
      case 'diamond': ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0); ctx.closePath(); break;
      case 'star':
        for (i = 0; i < 10; i++) { a = -Math.PI / 2 + i * Math.PI / 5; var rad = i % 2 ? r * 0.42 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
        ctx.closePath(); break;
      case 'plus': var t = r * 0.32;
        ctx.moveTo(-t, -r * 0.9); ctx.lineTo(t, -r * 0.9); ctx.lineTo(t, -t); ctx.lineTo(r * 0.9, -t); ctx.lineTo(r * 0.9, t); ctx.lineTo(t, t);
        ctx.lineTo(t, r * 0.9); ctx.lineTo(-t, r * 0.9); ctx.lineTo(-t, t); ctx.lineTo(-r * 0.9, t); ctx.lineTo(-r * 0.9, -t); ctx.lineTo(-t, -t); ctx.closePath(); break;
      case 'heart':
        ctx.moveTo(0, r * 0.85);
        ctx.bezierCurveTo(-r * 1.2, 0, -r * 0.7, -r * 1.0, 0, -r * 0.35);
        ctx.bezierCurveTo(r * 0.7, -r * 1.0, r * 1.2, 0, 0, r * 0.85); ctx.closePath(); break;
      case 'hex':
        for (i = 0; i < 6; i++) { a = Math.PI / 6 + i * Math.PI / 3; ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); }
        ctx.closePath(); break;
    }
  }
  var iconCache = {};
  // upright icon sprite (drawn over cars after rotation, so a triangle always points up)
  function icon(color, px, dpr) {
    var key = color + '|' + Math.round(px) + '|' + dpr;
    if (iconCache[key]) return iconCache[key];
    var p = PALETTE[color], s = Math.ceil(px * 2.4 * dpr), c = mk(s, s), x = c.getContext('2d');
    x.translate(s / 2, s / 2); x.scale(dpr, dpr);
    var r = px * 0.5;
    x.fillStyle = 'rgba(0,0,0,.18)'; x.save(); x.translate(0, px * 0.06); iconPath(x, p.icon, r); x.fill(); x.restore();
    iconPath(x, p.icon, r); x.fillStyle = p.ink; x.fill();
    return (iconCache[key] = { canvas: c, size: s / dpr });
  }
  function drawIcon(ctx, color, cx, cy, px, dpr) {
    var ic = icon(color, px, dpr || 1);
    ctx.drawImage(ic.canvas, cx - ic.size / 2, cy - ic.size / 2, ic.size, ic.size);
  }

  // ---------------------------------------------------------------- vehicles (facing +x, centred on 0,0)
  function wheels(ctx, L, W, xs) {
    ctx.fillStyle = '#2b2f36';
    xs.forEach(function (x) {
      rr(ctx, x - L * 0.07, -W * 0.56, L * 0.14, W * 0.16, W * 0.05); ctx.fill();
      rr(ctx, x - L * 0.07, W * 0.40, L * 0.14, W * 0.16, W * 0.05); ctx.fill();
    });
  }
  function lights(ctx, xf, xr, W) {
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath(); ctx.ellipse(xf, -W * 0.3, W * 0.07, W * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(xf, W * 0.3, W * 0.07, W * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c4242c';
    rr(ctx, xr, -W * 0.38, W * 0.07, W * 0.16, 2); ctx.fill();
    rr(ctx, xr, W * 0.22, W * 0.07, W * 0.16, 2); ctx.fill();
  }

  // Each body function returns where the roof icon goes: [x, y, size] (or a list of them)
  var BODY = {
    // the small rounded "utilitario": a nod to the classic 1960s Spanish city car, no brand
    mini: function (ctx, L, W, col) {
      wheels(ctx, L, W, [-L * 0.27, L * 0.27]);
      rr(ctx, -L / 2, -W / 2, L, W, W * 0.46); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = shade(col.hex, -0.18); rr(ctx, -L / 2, -W / 2, L, W, W * 0.46); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1;
      rr(ctx, -L * 0.45, -W * 0.44, L * 0.9, W * 0.88, W * 0.4); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = '#34495f';
      rr(ctx, L * 0.1, -W * 0.36, L * 0.17, W * 0.72, W * 0.14); ctx.fill();
      rr(ctx, -L * 0.36, -W * 0.3, L * 0.1, W * 0.6, W * 0.12); ctx.fill();
      rr(ctx, -L * 0.25, -W * 0.36, L * 0.34, W * 0.72, W * 0.3); ctx.fillStyle = col.light; ctx.fill();
      lights(ctx, L * 0.42, -L * 0.5, W);
      return [[-L * 0.08, 0, W * 0.42]];
    },
    sedan: function (ctx, L, W, col) {
      wheels(ctx, L, W, [-L * 0.3, L * 0.3]);
      rr(ctx, -L / 2, -W / 2, L, W, W * 0.3); ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L * 0.3, -W * 0.32); ctx.lineTo(L * 0.44, -W * 0.25);
      ctx.moveTo(L * 0.3, W * 0.32); ctx.lineTo(L * 0.44, W * 0.25); ctx.stroke();
      ctx.fillStyle = '#34495f';
      ctx.beginPath(); ctx.moveTo(L * 0.1, -W * 0.4); ctx.lineTo(L * 0.25, -W * 0.33); ctx.lineTo(L * 0.25, W * 0.33); ctx.lineTo(L * 0.1, W * 0.4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-L * 0.22, -W * 0.38); ctx.lineTo(-L * 0.32, -W * 0.32); ctx.lineTo(-L * 0.32, W * 0.32); ctx.lineTo(-L * 0.22, W * 0.38); ctx.closePath(); ctx.fill();
      rr(ctx, -L * 0.22, -W * 0.4, L * 0.32, W * 0.8, W * 0.16); ctx.fillStyle = col.light; ctx.fill();
      ctx.fillStyle = col.dark; rr(ctx, L * 0.06, -W * 0.56, L * 0.04, W * 0.1, 2); ctx.fill(); rr(ctx, L * 0.06, W * 0.46, L * 0.04, W * 0.1, 2); ctx.fill();
      lights(ctx, L * 0.46, -L * 0.5, W);
      return [[-L * 0.06, 0, W * 0.42]];
    },
    autoescuela: function (ctx, L, W, col) {
      var r = BODY.sedan(ctx, L, W, col);
      // driving-school roof plate: white L on blue (generic, no school name)
      ctx.fillStyle = SIGN_BLUE; rr(ctx, L * 0.0, -W * 0.2, L * 0.08, W * 0.4, 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(L * 0.02, -W * 0.13, L * 0.012, W * 0.24); ctx.fillRect(L * 0.02, W * 0.08, L * 0.04, W * 0.04);
      return [[-L * 0.13, 0, W * 0.38]];
    },
    furgo: function (ctx, L, W, col) {
      W *= 1.04;
      wheels(ctx, L, W, [-L * 0.3, L * 0.32]);
      rr(ctx, -L / 2, -W / 2, L, W, W * 0.14); ctx.fillStyle = col; ctx.fill();
      rr(ctx, L * 0.36, -W * 0.44, L * 0.14, W * 0.88, W * 0.2); ctx.fillStyle = col.dark; ctx.fill();
      ctx.fillStyle = '#34495f';
      ctx.beginPath(); ctx.moveTo(L * 0.25, -W * 0.42); ctx.lineTo(L * 0.36, -W * 0.36); ctx.lineTo(L * 0.36, W * 0.36); ctx.lineTo(L * 0.25, W * 0.42); ctx.closePath(); ctx.fill();
      rr(ctx, -L * 0.47, -W * 0.44, L * 0.71, W * 0.88, W * 0.08); ctx.fillStyle = col.light; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.10)'; ctx.lineWidth = Math.max(1, W * 0.03);
      for (var i = 1; i < 5; i++) { var x = -L * 0.47 + i * L * 0.142; ctx.beginPath(); ctx.moveTo(x, -W * 0.4); ctx.lineTo(x, W * 0.4); ctx.stroke(); }
      lights(ctx, L * 0.47, -L * 0.5, W);
      return [[-L * 0.12, 0, W * 0.44]];
    },
    bus: function (ctx, L, W, col) {
      W *= 1.06;
      wheels(ctx, L, W, [-L * 0.32, -L * 0.2, L * 0.3]);
      rr(ctx, -L / 2, -W / 2, L, W, W * 0.2); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = '#34495f';
      rr(ctx, L * 0.42, -W * 0.4, L * 0.06, W * 0.8, W * 0.08); ctx.fill();
      // side windows
      for (var i = 0; i < 7; i++) {
        var x = -L * 0.44 + i * L * 0.12;
        rr(ctx, x, -W * 0.47, L * 0.09, W * 0.1, 2); ctx.fill();
        rr(ctx, x, W * 0.37, L * 0.09, W * 0.1, 2); ctx.fill();
      }
      rr(ctx, -L * 0.46, -W * 0.34, L * 0.86, W * 0.68, W * 0.12); ctx.fillStyle = col.light; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; rr(ctx, -L * 0.3, -W * 0.12, L * 0.1, W * 0.24, 2); ctx.fill(); rr(ctx, L * 0.15, -W * 0.12, L * 0.1, W * 0.24, 2); ctx.fill();
      lights(ctx, L * 0.48, -L * 0.5, W);
      return [[-L * 0.04, 0, W * 0.42]];
    },
    caravana: function (ctx, L, W, col) {
      // car (front 55 %) towing a caravan (rear 40 %), both painted, joined by a hitch
      var cl = L * 0.52, vl = L * 0.4;
      ctx.save(); ctx.translate(-L / 2 + vl / 2, 0);
      ctx.fillStyle = '#2b2f36'; rr(ctx, -vl * 0.08, -W * 0.56, vl * 0.22, W * 0.14, 2); ctx.fill(); rr(ctx, -vl * 0.08, W * 0.42, vl * 0.22, W * 0.14, 2); ctx.fill();
      rr(ctx, -vl / 2, -W * 0.5, vl, W, W * 0.22); ctx.fillStyle = '#f7f4ee'; ctx.fill();
      rr(ctx, -vl * 0.46, -W * 0.44, vl * 0.92, W * 0.88, W * 0.18); ctx.fillStyle = col.light; ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(-vl * 0.5, -W * 0.5, vl, W * 0.12); ctx.fillRect(-vl * 0.5, W * 0.38, vl, W * 0.12);
      ctx.fillStyle = 'rgba(255,255,255,.6)'; rr(ctx, -vl * 0.16, -W * 0.16, vl * 0.32, W * 0.32, 3); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#5c6470'; ctx.fillRect(-L / 2 + vl - 1, -W * 0.05, L - vl - cl + 2, W * 0.1);
      ctx.save(); ctx.translate(L / 2 - cl / 2, 0);
      var r = BODY.sedan(ctx, cl, W * 0.96, col);
      ctx.restore();
      return [[-L / 2 + vl / 2, 0, W * 0.4], [L / 2 - cl / 2 + r[0][0], 0, W * 0.3]];
    }
  };

  function colObj(hex) {
    // a String with extra props, usable as fillStyle
    var s = new String(hex); // eslint-disable-line no-new-wrappers
    s.hex = hex; s.light = shade(hex, 0.22); s.dark = shade(hex, -0.25);
    return s;
  }

  var spriteCache = {};
  /* Vehicle sprite: { canvas, w, h, icons: [[x, y, size] in sprite-centred px] }. Drawn at css px * dpr. */
  function vehicle(kind, len, color, cell, dpr) {
    var key = kind + len + color + '|' + Math.round(cell * 10) + '|' + dpr;
    if (spriteCache[key]) return spriteCache[key];
    var L = len * cell - cell * 0.16, W = cell * 0.7, m = cell * 0.22;
    var w = L + m * 2, h = W * 1.12 + m * 2;
    var c = mk(w * dpr, h * dpr), x = c.getContext('2d');
    x.scale(dpr, dpr); x.translate(w / 2, h / 2);
    var col = colObj(PALETTE[color].body), fn = BODY[kind] || BODY.sedan;
    // shadow: silhouette, offset down-right, blurred
    x.save();
    x.shadowColor = 'rgba(25,35,55,.28)'; x.shadowBlur = cell * 0.12 * dpr; x.shadowOffsetX = cell * 0.03 * dpr; x.shadowOffsetY = cell * 0.07 * dpr;
    rr(x, -L / 2, -W / 2, L, W, W * 0.3); x.fillStyle = 'rgba(0,0,0,.25)'; x.fill();
    x.restore();
    var icons = fn(x, L, W, col);
    // soft top highlight
    x.globalCompositeOperation = 'source-atop';
    var g = x.createLinearGradient(0, -W / 2, 0, W / 2); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.08)');
    x.fillStyle = g; x.fillRect(-w / 2, -h / 2, w, h);
    x.globalCompositeOperation = 'source-over';
    return (spriteCache[key] = { canvas: c, w: w, h: h, icons: icons, L: L, W: W });
  }

  /* Draw a vehicle centred at (cx, cy), heading `ang` (0 = right), scale s. Icons are kept upright. */
  function drawVehicle(ctx, car, color, cx, cy, ang, s, cell, dpr, alpha) {
    var sp = vehicle(car.kind || 'sedan', car.len, color, cell, dpr);
    ctx.save();
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(cx, cy); ctx.rotate(ang); ctx.scale(s, s);
    ctx.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    ctx.restore();
    var ca = Math.cos(ang), sa = Math.sin(ang);
    for (var i = 0; i < sp.icons.length; i++) {
      var ic = sp.icons[i];
      drawIcon(ctx, color, cx + (ic[0] * ca - ic[1] * sa) * s, cy + (ic[0] * sa + ic[1] * ca) * s, ic[2] * s, dpr);
    }
  }

  /* small chevron on the bonnet: which way the car will drive (parked cars only) */
  function drawChevron(ctx, car, cx, cy, ang, cell) {
    var L = car.len * cell - cell * 0.16, x = L / 2 - cell * (car.len === 1 ? 0.1 : 0.15), r = cell * 0.09;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(x - r, -r * 1.1); ctx.lineTo(x + r * 0.5, 0); ctx.lineTo(x - r, r * 1.1);
    ctx.lineWidth = Math.max(1.6, cell * 0.06); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
    ctx.restore();
  }

  function drawKey(ctx, x, y, r) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#8a6400'; ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath(); ctx.arc(-r * 0.35, 0, r * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillRect(-r * 0.05, -r * 0.12, r * 0.95, r * 0.24); ctx.strokeRect(-r * 0.05, -r * 0.12, r * 0.95, r * 0.24);
    ctx.fillRect(r * 0.55, 0, r * 0.16, r * 0.38);
    ctx.restore();
  }
  function drawLock(ctx, x, y, r, open) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = '#3c3f46'; ctx.lineWidth = r * 0.24; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.42, Math.PI, open ? Math.PI * 1.75 : 0); ctx.stroke();
    rr(ctx, -r * 0.62, -r * 0.2, r * 1.24, r * 0.95, r * 0.2); ctx.fillStyle = '#ffd34d'; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.12); ctx.stroke();
    ctx.fillStyle = '#3c3f46'; ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawCone(ctx, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(25,35,55,.22)'; ctx.beginPath(); ctx.ellipse(s * 0.05, s * 0.1, s * 0.34, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    rr(ctx, -s * 0.32, -s * 0.32, s * 0.64, s * 0.64, s * 0.1); ctx.fillStyle = '#3a3d44'; ctx.fill();
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* Car transporter ("góndola"), facing -x (it leaves to the left). x,y = top-left, len x h px.
   * Returns seat centres (cars face left). */
  function truckSeats(x, y, len, h, cap) {
    var cab = len * 0.2, bay = (len - cab - len * 0.04) / cap, out = [];
    for (var i = 0; i < cap; i++) out.push([x + cab + len * 0.02 + bay * (i + 0.5), y + h / 2, bay]);
    return out;
  }
  function drawTruck(ctx, x, y, len, h, color, cap, wheelPhase) {
    var p = PALETTE[color], cab = len * 0.2;
    ctx.save();
    ctx.fillStyle = 'rgba(25,35,55,.22)'; rr(ctx, x + 3, y + h * 0.12 + 4, len, h * 0.8, h * 0.18); ctx.fill();
    // wheels
    ctx.fillStyle = '#2b2f36';
    var wx = [x + cab * 0.45, x + cab + len * 0.12, x + len * 0.62, x + len * 0.86];
    wx.forEach(function (w, i) {
      rr(ctx, w - h * 0.12, y + h * 0.04, h * 0.24, h * 0.12, 2); ctx.fill();
      rr(ctx, w - h * 0.12, y + h * 0.84, h * 0.24, h * 0.12, 2); ctx.fill();
    });
    // trailer deck (ramps) in the truck colour
    rr(ctx, x + cab + len * 0.01, y + h * 0.1, len - cab - len * 0.01, h * 0.8, h * 0.12); ctx.fillStyle = shade(p.body, -0.15); ctx.fill();
    rr(ctx, x + cab + len * 0.025, y + h * 0.17, len - cab - len * 0.04, h * 0.66, h * 0.08); ctx.fillStyle = '#e9ecef'; ctx.fill();
    // bay separators
    var seats = truckSeats(x, y, len, h, cap);
    ctx.strokeStyle = 'rgba(60,70,85,.25)'; ctx.lineWidth = 1.5;
    seats.forEach(function (s, i) { if (i) { ctx.beginPath(); ctx.moveTo(s[0] - s[2] / 2, y + h * 0.2); ctx.lineTo(s[0] - s[2] / 2, y + h * 0.8); ctx.stroke(); } });
    // cab
    rr(ctx, x, y + h * 0.08, cab, h * 0.84, h * 0.22); ctx.fillStyle = '#f8f8f6'; ctx.fill();
    ctx.fillStyle = p.body; rr(ctx, x + cab * 0.55, y + h * 0.08, cab * 0.45, h * 0.84, h * 0.1); ctx.fill();
    ctx.fillStyle = '#34495f'; rr(ctx, x + cab * 0.12, y + h * 0.18, cab * 0.18, h * 0.64, h * 0.08); ctx.fill();
    ctx.fillStyle = '#fff6c8'; rr(ctx, x + 1, y + h * 0.14, cab * 0.06, h * 0.12, 2); ctx.fill(); rr(ctx, x + 1, y + h * 0.74, cab * 0.06, h * 0.12, 2); ctx.fill();
    ctx.restore();
    return seats;
  }

  /* Spanish-motorway-style panel: blue, white inner border, white text. No official symbols. */
  function drawSign(ctx, x, y, w, h, text, color, dpr) {
    ctx.save();
    ctx.fillStyle = '#8b96a3'; ctx.fillRect(x + w * 0.2, y + h, w * 0.04, h * 0.5); ctx.fillRect(x + w * 0.76, y + h, w * 0.04, h * 0.5);
    rr(ctx, x, y, w, h, h * 0.16); ctx.fillStyle = SIGN_BLUE; ctx.fill();
    rr(ctx, x + 3, y + 3, w - 6, h - 6, h * 0.12); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
    var chip = h * 0.62;
    if (color) {
      rr(ctx, x + h * 0.2, y + (h - chip) / 2, chip, chip, chip * 0.2); ctx.fillStyle = PALETTE[color].body; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      drawIcon(ctx, color, x + h * 0.2 + chip / 2, y + h / 2, chip * 0.62, dpr);
    }
    ctx.fillStyle = '#fff';
    var fs = h * 0.44;
    ctx.font = '700 ' + fs + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    var tx = x + (color ? h * 0.32 + chip : h * 0.3), maxW = x + w - tx - h * 0.62;
    while (ctx.measureText(text).width > maxW && fs > 7) { fs -= 1; ctx.font = '700 ' + fs + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; }
    ctx.fillText(text, tx, y + h / 2 + 1);
    // arrow to the left (the exit direction)
    var ax = x + w - h * 0.36, ay = y + h / 2, a = h * 0.2;
    ctx.beginPath(); ctx.moveTo(ax - a, ay); ctx.lineTo(ax, ay - a); ctx.lineTo(ax, ay - a * 0.4); ctx.lineTo(ax + a * 0.7, ay - a * 0.4);
    ctx.lineTo(ax + a * 0.7, ay + a * 0.4); ctx.lineTo(ax, ay + a * 0.4); ctx.lineTo(ax, ay + a); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // small decorations around the car park, per pack theme
  function drawDeco(ctx, kind, x, y, s, rnd) {
    ctx.save(); ctx.translate(x, y);
    switch (kind) {
      case 'palms':
        ctx.fillStyle = 'rgba(25,35,55,.15)'; ctx.beginPath(); ctx.ellipse(s * 0.1, s * 0.12, s * 0.5, s * 0.36, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#3f9d5a';
        for (var i = 0; i < 6; i++) { ctx.save(); ctx.rotate(i * Math.PI / 3 + rnd); ctx.beginPath(); ctx.ellipse(s * 0.26, 0, s * 0.3, s * 0.1, 0, 0, 7); ctx.fill(); ctx.restore(); }
        ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.1, 0, 7); ctx.fill(); break;
      case 'lights':
        var cs = ['#ff5a5f', '#ffd34d', '#4cc38a', '#4c9be8'];
        for (i = 0; i < 4; i++) { ctx.fillStyle = cs[(i + Math.floor(rnd * 4)) % 4]; ctx.beginPath(); ctx.arc((i - 1.5) * s * 0.28, Math.sin(i + rnd) * s * 0.08, s * 0.08, 0, 7); ctx.fill(); }
        break;
      case 'flowers':
        for (i = 0; i < 5; i++) { ctx.fillStyle = i ? '#f6a6c1' : '#ffd34d'; ctx.beginPath(); ctx.arc(i ? Math.cos(i * 1.256 + rnd) * s * 0.14 : 0, i ? Math.sin(i * 1.256 + rnd) * s * 0.14 : 0, s * 0.1, 0, 7); ctx.fill(); }
        break;
      case 'orange':
        ctx.fillStyle = '#4f9a4a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, 7); ctx.fill();
        ctx.fillStyle = '#f39a1e'; [[-.12, -.08], [.12, .04], [-.02, .15]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, s * 0.07, 0, 7); ctx.fill(); });
        break;
      case 'snow':
        ctx.fillStyle = '#2f7a55'; ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(s * 0.3, s * 0.3); ctx.lineTo(-s * 0.3, s * 0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -s * 0.4); ctx.lineTo(s * 0.12, -s * 0.12); ctx.lineTo(-s * 0.12, -s * 0.12); ctx.closePath(); ctx.fill(); break;
      case 'sun':
        ctx.fillStyle = '#f2694b'; ctx.beginPath(); ctx.arc(0, 0, s * 0.32, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; for (i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s * 0.32, i * Math.PI / 2, i * Math.PI / 2 + Math.PI / 4); ctx.closePath(); ctx.fill(); }
        break;
      case 'roundabout':
        ctx.fillStyle = '#5aa86a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.34, 0, 7); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, 7); ctx.stroke(); break;
      case 'city':
        ctx.fillStyle = '#9aa6b2'; rr(ctx, -s * 0.06, -s * 0.36, s * 0.12, s * 0.72, 3); ctx.fill();
        ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(0, -s * 0.36, s * 0.1, 0, 7); ctx.fill(); break;
      default:  // cones
        drawCone(ctx, 0, 0, s * 0.7);
    }
    ctx.restore();
  }

  var api = { PALETTE: PALETTE, SIGN_BLUE: SIGN_BLUE, setPalette: setPalette, shade: shade, rr: rr, mk: mk,
    iconPath: iconPath, drawIcon: drawIcon, vehicle: vehicle, drawVehicle: drawVehicle, drawChevron: drawChevron, drawKey: drawKey, drawLock: drawLock,
    drawCone: drawCone, drawTruck: drawTruck, truckSeats: truckSeats, drawSign: drawSign, drawDeco: drawDeco };
  root.AtascoArt = api;
})(this);

/* ---- game/game.js ---- */
/* Atascazo game: canvas renderer, animations, input and the platform-facing API.
 *
 *   var game = AtascoGame.create(canvas, hooks)
 *   game.start(levelSpec)            play a level (any valid spec: AtascoGen.level(n), .daily(date), or JSON)
 *   game.restart()
 *   game.canUseBooster(id)           'undo' | 'slot' | 'shuffle' | 'crane'  -> bool (for button states)
 *   game.requestBooster(id)          asks hooks.onBoosterRequest(id) to charge, then applies -> Promise<bool>
 *                                    (crane first waits for the player to pick a car; cancel = no charge)
 *   game.useBooster(id, carIndex?)   applies without charging (platform grants, tests) -> bool
 *   game.applyContinue()             +CONTINUE_SLOTS arcen places, the level goes on
 *   game.cancelCrane(), game.setSound(bool), game.resize(), game.state(), game.destroy()
 *
 * hooks (all optional):
 *   onLevelComplete({ levelId, stars, movesUsed, coinsEarned, bumps, boostersUsed, continues, cars, trucks, timeMs, daily })
 *   onContinueRequested({ reason, continues }) -> bool | Promise<bool>   called when the level is lost;
 *        true = the platform granted a continue (ad / coins), false = the player gave up. Missing = gave up.
 *   onFail({ levelId, reason, movesUsed, continues })   final: the player gave up. reason 'arcen_full' | 'stuck'
 *   onBoosterRequest(id) -> bool | Promise<bool>        charge the booster (inventory / coins / ad)
 *   onMove({ car, ok, kind })  onTruckDepart({ truck, color })  onChange(summary)  coinsFor(stars, level)
 */
(function (root) {
  'use strict';
  var R = root.AtascoRules, S = root.AtascoSolver, A = root.AtascoArt;
  var CONTINUE_SLOTS = 2, MAX_EXTRA_SLOTS = 3;
  var ANG = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t * t; }
  function angLerp(a, b, t) { var d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; return a + d * t; }

  // ---------------------------------------------------------------- sound (tiny synth, no files)
  function Sfx() {
    var ac = null, on = true;
    function ctx() {
      if (!ac) { try { ac = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { ac = null; } }
      if (ac && ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(f, d, type, vol, when, slide) {
      var a = on && ctx(); if (!a) return;
      var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
    }
    return {
      set on(v) { on = v; }, get on() { return on; }, unlock: ctx,
      go: function () { tone(330, 0.12, 'triangle', 0.08, 0, 520); },
      board: function (i) { tone(660 + (i || 0) * 110, 0.12, 'sine', 0.1); },
      wait: function () { tone(300, 0.1, 'triangle', 0.07); },
      bump: function () { tone(140, 0.14, 'square', 0.05, 0, 90); },
      honk: function () { tone(415, 0.16, 'square', 0.05); tone(523, 0.16, 'square', 0.04, 0.02); },
      depart: function () { tone(392, 0.22, 'sawtooth', 0.04); tone(494, 0.3, 'sawtooth', 0.035, 0.18); },
      win: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.09, i * 0.09); }); },
      fail: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.28, 'triangle', 0.08, i * 0.14); }); },
      pop: function () { tone(880, 0.08, 'sine', 0.08, 0, 1320); }
    };
  }

  function create(canvas, hooks) {
    hooks = hooks || {};
    var ctx = canvas.getContext('2d');
    var sfx = Sfx();
    if (hooks.sound === false) sfx.on = false;
    var G = {
      L: null, K: null, st: null, undo: [], cars: [], occ: null, lay: null, bg: null, dpr: 1,
      trucks: { idx: 0, slide: 0, slideT: 1, leaving: [] }, parts: [], flash: 0, crane: null,
      ended: false, offer: null, startTime: 0, settleT: 0, raf: 0, last: 0, rng: null, time: 0
    };

    // ---------------------------------------------------------------- layout
    function layout() {
      var rect = canvas.getBoundingClientRect();
      var W = Math.max(200, rect.width), H = Math.max(300, rect.height);
      G.dpr = Math.min(root.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * G.dpr); canvas.height = Math.round(H * G.dpr);
      if (!G.L) { G.lay = { W: W, H: H }; return; }
      var L = G.L, pad = 8;
      var dockH = clamp(H * 0.2, 104, 156), arcenH = clamp(H * 0.095, 50, 70);
      var top = dockH + arcenH + 4, availH = H - top - pad;
      var cell = Math.min((W - 2 * pad) / (L.cols + 1.3), availH / (L.rows + 1.3), 64);
      var r = cell * 0.65, lotW = L.cols * cell, lotH = L.rows * cell;
      var lotX = (W - lotW) / 2, lotY = top + r + Math.max(0, (availH - lotH - 2 * r) * 0.35);
      var signH = clamp(dockH * 0.24, 24, 34), laneY = signH * 1.55 + 6, laneH = dockH - laneY - 4;
      var truckH = clamp(laneH * 0.86, 34, 58), truckLen = clamp(W * 0.62, 190, 300);
      G.lay = {
        W: W, H: H, pad: pad, dockH: dockH, arcenY: dockH, arcenH: arcenH, cell: cell, r: r,
        lotX: lotX, lotY: lotY, lotW: lotW, lotH: lotH,
        ring: { l: lotX - r / 2, t: lotY - r / 2, r: lotX + lotW + r / 2, b: lotY + lotH + r / 2 },
        signH: signH, laneY: laneY, laneH: laneH, truckH: truckH, truckLen: truckLen,
        truckY: laneY + (laneH - truckH) / 2, dockX: W / 2 - truckLen * 0.62, gap: 18
      };
      layoutSlots();
      drawBg();
    }
    function layoutSlots() {
      var l = G.lay, n = G.st ? G.st.slots : G.L.slots;
      var sw = Math.min((l.W - 2 * l.pad) / n, 66), x0 = (l.W - sw * n) / 2;
      l.slotW = sw; l.slotX = x0;
    }
    function slotCenter(k) { var l = G.lay; return [l.slotX + l.slotW * (k + 0.5), l.arcenY + l.arcenH / 2]; }

    function truckX(t) {
      var tr = G.trucks, l = G.lay;
      for (var i = 0; i < tr.leaving.length; i++) if (tr.leaving[i].t0 === t) return tr.leaving[i].x;
      if (t < tr.idx) return -9999;
      return l.dockX + (t - tr.idx) * (l.truckLen + l.gap) + tr.slide;
    }
    function seatPos(t, s) {
      var l = G.lay, seats = A.truckSeats(truckX(t), l.truckY, l.truckLen, l.truckH, G.K.cap);
      return seats[s];
    }

    function carCenter(i) {
      var c = G.L.cars[i], l = G.lay, horiz = c.dir === 'L' || c.dir === 'R';
      return [l.lotX + (c.x + (horiz ? c.len / 2 : 0.5)) * l.cell, l.lotY + (c.y + (horiz ? 0.5 : c.len / 2)) * l.cell];
    }
    function fitScale(car, room, roomW) {
      var l = G.lay;
      return Math.min(room / (car.len * l.cell), roomW / (l.cell * 0.78), 1);
    }
    /* Where a car rests in its current mode: [x, y, angle, scale] */
    function home(v) {
      var car = G.L.cars[v.i], l = G.lay;
      if (v.mode === 'park' || !v.target) { var c = carCenter(v.i); return [c[0], c[1], ANG[car.dir], 1]; }
      if (v.target.type === 'slot') {
        var sc = slotCenter(v.target.slot);
        return [sc[0], sc[1], -Math.PI / 2, fitScale(car, l.arcenH * 0.86, l.slotW * 0.8)];
      }
      var sp = seatPos(v.target.truck, v.target.seat);
      return [sp[0], sp[1], Math.PI, fitScale(car, sp[2] * 0.94, l.truckH * 0.66)];
    }

    // ---------------------------------------------------------------- background (pre-rendered)
    function drawBg() {
      var l = G.lay, d = G.dpr, pk = (root.AtascoGen && AtascoGen.PACKS[G.L.pack || 0]) || { ground: '#cfd5dc', deco: 'cones' };
      var c = G.bg && G.bg.width === canvas.width && G.bg.height === canvas.height ? G.bg : A.mk(canvas.width, canvas.height);
      var x = c.getContext('2d');
      x.setTransform(d, 0, 0, d, 0, 0);
      x.clearRect(0, 0, l.W, l.H);
      x.fillStyle = '#e7eddc'; x.fillRect(0, 0, l.W, l.H);
      // motorway lane at the top
      x.fillStyle = '#d7dfca'; x.fillRect(0, 0, l.W, l.laneY);
      x.fillStyle = '#6f7684'; x.fillRect(0, l.laneY, l.W, l.laneH);
      x.fillStyle = '#fff'; x.fillRect(0, l.laneY + 2, l.W, 2); x.fillRect(0, l.laneY + l.laneH - 4, l.W, 2);
      x.globalAlpha = 0.6;
      for (var dx = 6; dx < l.W; dx += 28) x.fillRect(dx, l.laneY + l.laneH / 2 - 1, 14, 2);
      x.globalAlpha = 1;
      // arcen (hard shoulder) with parking bays
      x.fillStyle = '#9aa1ad'; x.fillRect(0, l.arcenY, l.W, l.arcenH);
      x.fillStyle = '#fff'; x.fillRect(0, l.arcenY + 1, l.W, 2);
      var n = G.st ? G.st.slots : G.L.slots;
      for (var k = 0; k < n; k++) {
        var sx = l.slotX + l.slotW * k;
        A.rr(x, sx + 3, l.arcenY + 5, l.slotW - 6, l.arcenH - 10, 7);
        x.fillStyle = k >= G.L.slots ? '#c7b98a' : '#b7bdc6'; x.fill();
        x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1.5; x.stroke();
      }
      // ring road + lot
      var rg = l.ring, r = l.r;
      A.rr(x, rg.l - r / 2, rg.t - r / 2, rg.r - rg.l + r, rg.b - rg.t + r, r * 0.9); x.fillStyle = '#737a88'; x.fill();
      x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1.5; x.setLineDash([8, 9]);
      A.rr(x, rg.l, rg.t, rg.r - rg.l, rg.b - rg.t, r * 0.5); x.stroke(); x.setLineDash([]);
      // entry from the top road to the arcen
      x.fillStyle = '#737a88'; x.fillRect(l.W / 2 - r * 0.8, l.arcenY + l.arcenH - 2, r * 1.6, rg.t - l.arcenY - l.arcenH + 4);
      A.rr(x, l.lotX - 2, l.lotY - 2, l.lotW + 4, l.lotH + 4, 6); x.fillStyle = A.shade(pk.ground, -0.12); x.fill();
      x.fillStyle = pk.ground; x.fillRect(l.lotX, l.lotY, l.lotW, l.lotH);
      x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 1;
      for (var gx = 1; gx < G.L.cols; gx++) { x.beginPath(); x.moveTo(l.lotX + gx * l.cell, l.lotY + 3); x.lineTo(l.lotX + gx * l.cell, l.lotY + l.lotH - 3); x.stroke(); }
      for (var gy = 1; gy < G.L.rows; gy++) {
        x.setLineDash([4, 6]); x.beginPath(); x.moveTo(l.lotX + 3, l.lotY + gy * l.cell); x.lineTo(l.lotX + l.lotW - 3, l.lotY + gy * l.cell); x.stroke();
      }
      x.setLineDash([]);
      (G.L.obstacles || []).forEach(function (o) { A.drawCone(x, l.lotX + (o[0] + 0.5) * l.cell, l.lotY + (o[1] + 0.5) * l.cell, l.cell); });
      // decorations in the margins (seeded, so stable)
      var rnd = S.mulberry(G.L.seed || 7), ds = Math.max(14, l.cell * 0.55);
      for (var q = 0; q < 10; q++) {
        var side = q % 2, yy = rg.t + (rg.b - rg.t) * (0.1 + 0.8 * rnd());
        var xx = side ? (rg.r + r / 2 + (l.W - rg.r - r / 2) / 2) : (rg.l - r / 2) / 2;
        if ((side ? l.W - rg.r - r / 2 : rg.l - r / 2) > ds * 0.9) A.drawDeco(x, pk.deco, xx, yy, ds, rnd() * 6);
      }
      for (q = 0; q < 6; q++) A.drawDeco(x, pk.deco, 14 + rnd() * (l.W - 28), 8 + rnd() * (l.laneY - 16) * 0.3, ds * 0.7, rnd() * 6);
      G.bg = c;
    }

    // ---------------------------------------------------------------- level start / rebuild
    function start(spec) {
      var err = R.validate(spec);
      if (err.length) throw new Error('invalid level: ' + err.join('; '));
      G.L = spec; G.K = R.compile(spec); G.st = R.newState(G.K); G.undo = [];
      G.rng = S.mulberry((spec.seed || 1) ^ 0x51ed);
      G.occ = {};
      spec.cars.forEach(function (c, i) { R.cellsOf(c).forEach(function (p) { G.occ[p[0] + ',' + p[1]] = i; }); });
      G.ended = false; G.offer = null; G.crane = null; G.parts = []; G.flash = 0; G.settleT = 0;
      G.startTime = Date.now();
      layout();
      rebuild();
      changed();
      wake();
      return api;
    }
    function rebuild() {
      var st = G.st;
      G.cars = G.L.cars.map(function (c, i) { return { i: i, mode: 'park', target: null, x: 0, y: 0, a: 0, s: 1, anim: null, fx: null }; });
      st.wait.forEach(function (car, k) { if (car >= 0) { G.cars[car].mode = 'slot'; G.cars[car].target = { type: 'slot', slot: k }; } });
      st.seats.forEach(function (car, s) { G.cars[car].mode = 'seat'; G.cars[car].target = { type: 'seat', truck: st.truck, seat: s }; });
      G.cars.forEach(function (v, i) { if (st.gone[i] && v.mode === 'park') v.mode = 'gone'; });
      G.trucks = { idx: st.truck, slide: 0, slideT: 1, leaving: [] };
      G.cars.forEach(function (v) { if (v.mode !== 'gone') { var h = home(v); v.x = h[0]; v.y = h[1]; v.a = h[2]; v.s = h[3]; } });
    }

    // ---------------------------------------------------------------- animations
    function ringPoint(p) {   // perimeter coordinate of a point on the ring centreline (clockwise from top-left)
      var g = G.lay.ring, w = g.r - g.l, h = g.b - g.t;
      if (Math.abs(p[1] - g.t) < 0.5) return p[0] - g.l;
      if (Math.abs(p[0] - g.r) < 0.5) return w + (p[1] - g.t);
      if (Math.abs(p[1] - g.b) < 0.5) return w + h + (g.r - p[0]);
      return 2 * w + h + (g.b - p[1]);
    }
    function ringPath(from, to) {
      var g = G.lay.ring, w = g.r - g.l, h = g.b - g.t, P = 2 * (w + h);
      var corners = [[w, [g.r, g.t]], [w + h, [g.r, g.b]], [2 * w + h, [g.l, g.b]], [P, [g.l, g.t]]];
      var a = ringPoint(from), b = ringPoint(to), cw = ((b - a) % P + P) % P, out = [from];
      var dir = cw <= P - cw ? 1 : -1, dist = dir > 0 ? cw : P - cw;
      var list = [];
      corners.forEach(function (c) {
        var cp = c[0] % P, rel = dir > 0 ? ((cp - a) % P + P) % P : ((a - cp) % P + P) % P;
        if (rel > 0.5 && rel < dist - 0.5) list.push([rel, c[1]]);
      });
      list.sort(function (x, y) { return x[0] - y[0]; }).forEach(function (c) { out.push(c[1]); });
      out.push(to);
      return out;
    }
    function smooth(pts, rad) {   // round the corners of a polyline with quadratic curves
      var out = [pts[0]];
      for (var i = 1; i < pts.length - 1; i++) {
        var p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
        var d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        var r1 = Math.min(rad, d1 / 2), r2 = Math.min(rad, d2 / 2);
        var a = [p1[0] + (p0[0] - p1[0]) * r1 / (d1 || 1), p1[1] + (p0[1] - p1[1]) * r1 / (d1 || 1)];
        var b = [p1[0] + (p2[0] - p1[0]) * r2 / (d2 || 1), p1[1] + (p2[1] - p1[1]) * r2 / (d2 || 1)];
        out.push(a);
        for (var k = 1; k < 6; k++) {
          var t = k / 6, u = 1 - t;
          out.push([u * u * a[0] + 2 * u * t * p1[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p1[1] + t * t * b[1]]);
        }
        out.push(b);
      }
      out.push(pts[pts.length - 1]);
      return out;
    }
    function measured(pts) {
      var acc = [0];
      for (var i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      return { pts: pts, acc: acc, len: acc[acc.length - 1] };
    }
    function at(path, s) {
      var acc = path.acc, pts = path.pts, i = 1;
      while (i < acc.length - 1 && acc[i] < s) i++;
      var seg = acc[i] - acc[i - 1] || 1, t = clamp((s - acc[i - 1]) / seg, 0, 1);
      var p = pts[i - 1], q = pts[i];
      return [lerp(p[0], q[0], t), lerp(p[1], q[1], t), Math.atan2(q[1] - p[1], q[0] - p[0])];
    }

    function driveAnim(v) {
      var car = G.L.cars[v.i], l = G.lay, g = l.ring, c = carCenter(v.i), e;
      if (car.dir === 'R') e = [g.r, c[1]]; else if (car.dir === 'L') e = [g.l, c[1]];
      else if (car.dir === 'U') e = [c[0], g.t]; else e = [c[0], g.b];
      var gate = [l.W / 2, g.t];
      var pts = ringPath(e, gate);
      pts.unshift(c);
      var path = measured(smooth(pts, l.r * 0.9));
      var tail = Math.hypot(home(v)[0] - gate[0], home(v)[1] - gate[1]);
      var speed = Math.max(950, l.W * 2.6);
      v.mode = 'drive';
      v.anim = { kind: 'drive', path: path, gate: gate, t: 0, dur: 0.3 + (path.len + tail) / speed };
    }
    function liftAnim(v) {
      v.mode = 'drive';
      v.anim = { kind: 'lift', from: [v.x, v.y, v.a], t: 0, dur: 0.95 };
    }
    function transferAnim(v, slot) {
      v.mode = 'transfer';
      v.anim = { kind: 'transfer', slot: slot, t: 0, dur: 0.42, wait: true };
    }

    function stepCar(v, dt) {
      var an = v.anim;
      if (v.fx) { v.fx.t += dt; if (v.fx.t > v.fx.dur) v.fx = null; }
      if (!an) {
        if (v.mode !== 'gone') { var h0 = home(v); v.x = h0[0]; v.y = h0[1]; v.a = h0[2]; v.s = h0[3]; }
        return;
      }
      if (an.wait) {   // transfer waits for its truck to dock
        if (G.trucks.idx === v.target.truck && G.trucks.slideT >= 1) an.wait = false;
        else { var sc = slotCenter(an.slot); v.x = sc[0]; v.y = sc[1]; return; }
      }
      an.t += dt;
      var p = clamp(an.t / an.dur, 0, 1), h = home(v);
      if (an.kind === 'drive') {
        var tailLen = Math.hypot(h[0] - an.gate[0], h[1] - an.gate[1]), total = an.path.len + tailLen;
        var s = easeInOut(p) * total;
        if (s <= an.path.len) { var q = at(an.path, s); v.x = q[0]; v.y = q[1]; v.a = angLerp(v.a, q[2], clamp(dt * 16, 0, 1)); v.s = 1; }
        else {
          var u = tailLen ? (s - an.path.len) / tailLen : 1, segA = Math.atan2(h[1] - an.gate[1], h[0] - an.gate[0]);
          v.x = lerp(an.gate[0], h[0], u); v.y = lerp(an.gate[1], h[1], u);
          v.a = angLerp(angLerp(v.a, segA, clamp(dt * 16, 0, 1)), h[2], easeInOut(u));
          v.s = lerp(1, h[3], easeInOut(u));
        }
      } else if (an.kind === 'lift') {
        var up = clamp(p / 0.3, 0, 1), fly = clamp((p - 0.3) / 0.7, 0, 1), e = easeInOut(fly);
        v.x = lerp(an.from[0], h[0], e); v.y = lerp(an.from[1], h[1], e) - Math.sin(e * Math.PI) * G.lay.cell * 0.8;
        v.a = angLerp(an.from[2], h[2], e);
        v.s = lerp(1 + 0.25 * easeOut(up), h[3], e);
      } else if (an.kind === 'transfer') {
        var sc2 = slotCenter(an.slot), e2 = easeInOut(p);
        v.x = lerp(sc2[0], h[0], e2); v.y = lerp(sc2[1], h[1], e2) - Math.sin(e2 * Math.PI) * 18;
        v.a = angLerp(-Math.PI / 2, h[2], e2); v.s = h[3] * (1 + 0.15 * Math.sin(e2 * Math.PI));
      }
      if (p >= 1) {
        v.anim = null;
        v.mode = v.target.type === 'slot' ? 'slot' : 'seat';
        v.x = h[0]; v.y = h[1]; v.a = h[2]; v.s = h[3];
        if (v.mode === 'seat') { sfx.board(v.target.seat); burst(h[0], h[1], A.PALETTE[G.K.palette[G.st.col[v.i]]].body, 8); }
        else sfx.wait();
      }
    }

    function stepTrucks(dt) {
      var tr = G.trucks, st = G.st, l = G.lay;
      if (tr.slideT < 1) { tr.slideT = Math.min(1, tr.slideT + dt / 0.45); tr.slide = (1 - easeOut(clamp(tr.slideT, 0, 1))) * (l.truckLen + l.gap); }
      tr.leaving = tr.leaving.filter(function (lv) {
        lv.t += dt;
        var p = clamp(lv.t / 0.75, 0, 1);
        lv.x = lv.x0 - p * p * (lv.x0 + l.truckLen + 60);
        if (Math.random() < 0.5) puff(lv.x + l.truckLen, l.truckY + l.truckH * (0.3 + Math.random() * 0.4));
        if (p >= 1) { G.cars.forEach(function (v) { if (v.target && v.target.type === 'seat' && v.target.truck === lv.t0) v.mode = 'gone'; }); return false; }
        return true;
      });
      // the docked truck leaves once the logic has moved past it and all its cars are aboard
      if (tr.idx < st.truck && tr.slideT >= 1) {
        var t = tr.idx, ready = G.cars.every(function (v) { return !(v.target && v.target.type === 'seat' && v.target.truck === t) || v.mode === 'seat'; });
        if (ready) {
          tr.leaving.push({ t0: t, t: 0, x0: truckX(t), x: truckX(t) });   // t0 = truck index, t = clock
          tr.idx++;
          if (tr.idx < G.K.trucks.length) { tr.slideT = -0.6; tr.slide = l.truckLen + l.gap; }   // short pause, then slide in
          sfx.depart();
          if (hooks.onTruckDepart) hooks.onTruckDepart({ truck: t, color: G.K.palette[G.K.trucks[t]] });
        }
      }
    }

    function busy() {
      if (G.trucks.leaving.length || G.trucks.slideT < 1 || G.trucks.idx < G.st.truck) return true;
      for (var i = 0; i < G.cars.length; i++) if (G.cars[i].anim || G.cars[i].fx) return true;
      return false;
    }

    // ---------------------------------------------------------------- particles
    function burst(x, y, color, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
        G.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, c: color, r: 2 + Math.random() * 2, k: 'spark' });
      }
    }
    function puff(x, y) {
      G.parts.push({ x: x, y: y, vx: 30 + Math.random() * 30, vy: (Math.random() - 0.5) * 16, life: 0.6, max: 0.6, c: 'rgba(120,128,140,', r: 4 + Math.random() * 4, k: 'puff' });
    }
    function confetti() {
      var cs = ['#e8484b', '#3b7ddd', '#f2bf16', '#2ea862', '#8d5fd3', '#f0852a', '#ec6fae', '#13a1a6'];
      for (var i = 0; i < 140; i++) {
        G.parts.push({ x: Math.random() * G.lay.W, y: -10 - Math.random() * G.lay.H * 0.3, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 160,
          life: 2.6, max: 2.6, c: cs[i % cs.length], r: 3 + Math.random() * 3, k: 'confetti', a: Math.random() * 6, va: (Math.random() - 0.5) * 12 });
      }
    }
    function stepParts(dt) {
      G.parts = G.parts.filter(function (p) {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.k === 'spark') { p.vx *= 0.9; p.vy *= 0.9; }
        if (p.k === 'confetti') { p.a += p.va * dt; p.vx += Math.sin(p.life * 4) * 20 * dt; }
        if (p.k === 'puff') p.r += 10 * dt;
        return p.life > 0;
      });
    }

    // ---------------------------------------------------------------- frame
    function frame(now) {
      G.raf = 0;
      var dt = G.last ? Math.min(0.05, (now - G.last) / 1000) : 0.016;
      G.last = now; G.time += dt;
      if (!G.L) return;
      G.cars.forEach(function (v) { stepCar(v, dt); });
      stepTrucks(dt);
      stepParts(dt);
      if (G.flash > 0) G.flash = Math.max(0, G.flash - dt);
      draw();
      checkSettled(dt);
      if (busy() || G.parts.length || G.flash > 0 || G.crane || G.settleT > 0) wake();
      else G.last = 0;
    }
    function wake() { if (!G.raf && typeof requestAnimationFrame !== 'undefined') G.raf = requestAnimationFrame(frame); }

    function draw() {
      var l = G.lay, d = G.dpr, st = G.st, K = G.K;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(G.bg, 0, 0);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      // parked cars
      var moving = [], docked = [];
      G.cars.forEach(function (v) {
        if (v.mode === 'park') drawCar(v); else if (v.mode === 'drive' || v.mode === 'transfer') moving.push(v); else if (v.mode !== 'gone') docked.push(v);
      });
      // trucks + signs
      var vis = [];
      G.trucks.leaving.forEach(function (lv) { vis.push(lv.t0); });
      for (var t = G.trucks.idx; t < K.trucks.length && t < G.trucks.idx + 3; t++) vis.push(t);
      vis.forEach(function (t) {
        var x = truckX(t);
        if (x > l.W + 10 || x < -l.truckLen - 80) return;
        var color = K.palette[K.trucks[t]];
        var seats = A.drawTruck(ctx, x, l.truckY, l.truckLen, l.truckH, color, K.cap);
        // ghost icons on empty bays
        seats.forEach(function (s, k) {
          var full = G.cars.some(function (v) { return v.target && v.target.type === 'seat' && v.target.truck === t && v.target.seat === k && v.mode === 'seat'; });
          if (!full) { ctx.globalAlpha = 0.35; A.drawIcon(ctx, color, s[0], s[1], l.truckH * 0.34, d); ctx.globalAlpha = 1; }
        });
      });
      docked.forEach(function (v) { if (v.target && v.target.type === 'seat') drawCar(v); });
      // sign for the docked truck + upcoming chips
      var dt = G.trucks.idx < K.trucks.length ? G.trucks.idx : -1;
      if (dt >= 0) {
        var pk = (root.AtascoGen && AtascoGen.PACKS[G.L.pack || 0]) || { dest: ['Salida'] };
        var sw = Math.min(l.truckLen * 0.95, l.W * 0.6), sx = truckX(dt) + (l.truckLen - sw) / 2;
        A.drawSign(ctx, sx, 6, sw, l.signH, pk.dest[(dt + (G.L.seed || 0)) % pk.dest.length], K.palette[K.trucks[dt]], d);
        var cx = l.W - 10, chip = l.signH * 0.62;
        for (var q = Math.min(K.trucks.length - 1, dt + 4); q > dt; q--) {
          var col = K.palette[K.trucks[q]];
          cx -= chip + 4;
          if (cx < sx + sw + 4) break;
          A.rr(ctx, cx, 6 + (l.signH - chip) / 2, chip, chip, chip * 0.25); ctx.fillStyle = A.PALETTE[col].body; ctx.fill();
          A.drawIcon(ctx, col, cx + chip / 2, 6 + l.signH / 2, chip * 0.6, d);
        }
        // trucks left counter
        ctx.fillStyle = '#41505f'; ctx.font = '700 ' + Math.round(l.signH * 0.42) + 'px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        var gy = 6 + l.signH / 2, gs = l.signH * 0.34;
        A.rr(ctx, 8, gy - gs * 0.55, gs * 0.7, gs * 1.1, 3); ctx.fill(); A.rr(ctx, 8 + gs * 0.8, gy - gs * 0.55, gs * 1.5, gs * 1.1, 3); ctx.fill();
        ctx.fillText((K.trucks.length - dt) + '', 12 + gs * 2.4, gy);
      }
      docked.forEach(function (v) { if (v.target && v.target.type === 'slot') drawCar(v); });
      if (G.flash > 0) {   // arcen full flash
        ctx.fillStyle = 'rgba(232,72,75,' + (G.flash * 0.5) + ')'; ctx.fillRect(0, l.arcenY, l.W, l.arcenH);
      }
      moving.forEach(drawCar);
      // crane mode: hook over the lot
      if (G.crane) {
        ctx.fillStyle = 'rgba(29,90,166,' + (0.08 + 0.05 * Math.sin(G.time * 6)) + ')';
        A.rr(ctx, l.lotX - 4, l.lotY - 4, l.lotW + 8, l.lotH + 8, 8); ctx.fill();
      }
      G.cars.forEach(function (v) { if (v.anim && v.anim.kind === 'lift') {
        ctx.strokeStyle = '#3c3f46'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(v.x, 0); ctx.lineTo(v.x, v.y); ctx.stroke();
      } });
      // particles
      G.parts.forEach(function (p) {
        var a = clamp(p.life / p.max, 0, 1);
        if (p.k === 'puff') { ctx.fillStyle = p.c + (0.35 * a) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
        else if (p.k === 'confetti') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, a * 2); ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); ctx.restore(); }
        else { ctx.globalAlpha = a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      });
    }

    function drawCar(v) {
      var car = G.L.cars[v.i], l = G.lay, ox = 0, oy = 0, da = 0, s = v.s;
      if (v.fx) {
        var f = v.fx, t = f.t;
        if (f.kind === 'bump') {
          var off = t < 0.09 ? f.dist * easeOut(t / 0.09) : f.dist * Math.exp(-(t - 0.09) * 14) * Math.cos((t - 0.09) * 30);
          ox = Math.cos(v.a) * off; oy = Math.sin(v.a) * off;
        } else if (f.kind === 'wiggle') { da = 0.07 * Math.exp(-t * 9) * Math.sin(t * 48); }
        else if (f.kind === 'pop') { s *= 1 + 0.22 * Math.sin(Math.PI * clamp(t / f.dur, 0, 1)); }
        else if (f.kind === 'hop') { oy = -Math.sin(Math.PI * clamp(t / f.dur, 0, 1)) * l.cell * 0.18; }
      }
      var color = G.K.palette[G.st.col[v.i]];
      A.drawVehicle(ctx, car, color, v.x + ox, v.y + oy, v.a + da, s, l.cell, G.dpr);
      if (v.mode === 'park') A.drawChevron(ctx, car, v.x + ox, v.y + oy, v.a + da, l.cell);
      if (car.key && v.mode === 'park') A.drawKey(ctx, v.x + ox + l.cell * 0.22, v.y + oy - l.cell * 0.22, l.cell * 0.22);
      if (v.mode === 'park' && G.K.lock[v.i] >= 0) {
        var open = G.st.gone[G.K.lock[v.i]];
        if (!open || (v.fx && v.fx.kind === 'unlock')) {
          var sh = v.fx && v.fx.kind === 'lockshake' ? Math.sin(v.fx.t * 60) * 3 * Math.exp(-v.fx.t * 6) : 0;
          ctx.globalAlpha = open ? clamp(1 - v.fx.t / v.fx.dur, 0, 1) : 1;
          A.drawLock(ctx, v.x + ox + sh, v.y + oy, l.cell * 0.26, open);
          ctx.globalAlpha = 1;
        }
      }
    }

    function checkSettled(dt) {
      var st = G.st;
      if (!st.over || G.ended || G.offer) { G.settleT = 0; return; }
      if (busy()) return;
      G.settleT += dt;
      if (G.settleT < (st.won ? 0.15 : 0.35)) return;
      G.settleT = 0;
      if (st.won) finishWin(); else offerContinue();
    }

    function finishWin() {
      G.ended = true;
      confetti(); sfx.win(); wake();
      var st = G.st, stars = R.starsFor(G.K, st);
      var res = {
        levelId: G.L.id, stars: stars, movesUsed: st.moves, bumps: st.bumps, boostersUsed: st.boosters, continues: st.continues,
        cars: G.K.n, trucks: G.K.trucks.length, timeMs: Date.now() - G.startTime, daily: G.L.daily || null
      };
      res.coinsEarned = hooks.coinsFor ? hooks.coinsFor(stars, G.L) : 10 + stars * 5;
      setTimeout(function () { if (hooks.onLevelComplete) hooks.onLevelComplete(res); }, 900);
    }

    function offerContinue() {
      var st = G.st, token = {};
      G.offer = token;
      sfx.fail();
      var info = { reason: st.failReason, continues: st.continues };
      var ask = hooks.onContinueRequested ? hooks.onContinueRequested(info) : false;
      Promise.resolve(ask).then(function (yes) {
        if (G.offer !== token) return;         // a new level started meanwhile
        G.offer = null;
        if (!G.st.over) { changed(); return; } // a booster (undo, shuffle) already saved it
        if (yes) applyContinue();
        else {
          G.ended = true;
          if (hooks.onFail) hooks.onFail({ levelId: G.L.id, reason: st.failReason, movesUsed: st.moves, continues: st.continues });
        }
      });
    }

    // ---------------------------------------------------------------- events from the rules -> visuals
    function apply(res) {
      var ev = res.events;
      ev.forEach(function (e, k) {
        var v = e.car !== undefined ? G.cars[e.car] : null;
        switch (e.t) {
          case 'exit': case 'lift':
            for (var j = k + 1; j < ev.length; j++) {
              if (ev[j].car === e.car && (ev[j].t === 'board' || ev[j].t === 'wait')) {
                v.target = ev[j].t === 'board' ? { type: 'seat', truck: ev[j].truck, seat: ev[j].seat } : { type: 'slot', slot: ev[j].slot };
                break;
              }
            }
            if (e.t === 'exit') { driveAnim(v); sfx.go(); } else { liftAnim(v); sfx.pop(); }
            // unlock fx on cars this one held the key for
            G.K.lock.forEach(function (l, i) { if (l === e.car && !G.st.gone[i]) G.cars[i].fx = { kind: 'unlock', t: 0, dur: 0.5 }; });
            break;
          case 'transfer':
            v.target = { type: 'seat', truck: e.truck, seat: e.seat };
            transferAnim(v, e.slot);
            break;
          case 'bump':
            var dist;
            if (e.by >= 0) {
              var path = R.pathOf(G.L.cars[e.car], G.L.cols, G.L.rows), free = 0;
              for (var q = 0; q < path.length; q++) { var o = G.occ[path[q][0] + ',' + path[q][1]]; if (o !== undefined && !G.st.gone[o]) break; free++; }
              dist = clamp(free * G.lay.cell + G.lay.cell * 0.06, G.lay.cell * 0.08, G.lay.cell * 0.32);
              G.cars[e.by].fx = { kind: 'wiggle', t: 0, dur: 0.45 };
              v.fx = { kind: 'bump', t: 0, dur: 0.45, dist: dist };
            } else {
              v.fx = { kind: 'lockshake', t: 0, dur: 0.5 };
              if (e.lock >= 0) G.cars[e.lock].fx = { kind: 'pop', t: 0, dur: 0.4 };
            }
            sfx.bump();
            break;
          case 'noroom':
            v.fx = { kind: 'hop', t: 0, dur: 0.3 }; G.flash = 0.6; sfx.honk();
            break;
          case 'slots':
            layoutSlots(); drawBg();
            var sc = slotCenter(G.st.slots - 1); burst(sc[0], sc[1], '#f2bf16', 14);
            break;
          case 'recolour':
            e.cars.forEach(function (i) { G.cars[i].fx = { kind: 'pop', t: 0, dur: 0.35 }; });
            sfx.pop();
            break;
        }
      });
      changed();
      wake();
    }

    function changed() {
      if (!hooks.onChange || !G.st) return;
      var st = G.st;
      hooks.onChange({
        levelId: G.L.id, moves: st.moves, exits: st.exits, cars: G.K.n, trucksLeft: G.K.trucks.length - st.truck,
        slots: st.slots, waiting: st.waitTotal, over: st.over, won: st.won, crane: !!G.crane,
        boosters: { undo: canUse('undo'), slot: canUse('slot'), shuffle: canUse('shuffle'), crane: canUse('crane') }
      });
    }

    // ---------------------------------------------------------------- input
    function carAt(px, py) {
      var l = G.lay, gx = (px - l.lotX) / l.cell, gy = (py - l.lotY) / l.cell;
      var tryCell = function (x, y) {
        var o = G.occ[Math.floor(x) + ',' + Math.floor(y)];
        return o !== undefined && G.cars[o].mode === 'park' ? o : -1;
      };
      var hit = tryCell(gx, gy);
      if (hit >= 0) return hit;
      var m = 0.3;   // forgiving taps near a car's edge
      var cands = [[gx - m, gy], [gx + m, gy], [gx, gy - m], [gx, gy + m]];
      for (var i = 0; i < cands.length; i++) { hit = tryCell(cands[i][0], cands[i][1]); if (hit >= 0) return hit; }
      return -1;
    }
    function onDown(e) {
      if (!G.L) return;
      sfx.unlock();
      var r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      var i = carAt(px, py);
      if (G.crane) {
        if (i < 0) { if (py < G.lay.arcenY + G.lay.arcenH) cancelCrane(); return; }
        if (!R.hasRoom(G.K, G.st, i)) { G.cars[i].fx = { kind: 'hop', t: 0, dur: 0.3 }; G.flash = 0.6; wake(); return; }
        var cr = G.crane; G.crane = null;
        Promise.resolve(hooks.onBoosterRequest ? hooks.onBoosterRequest('crane') : true).then(function (ok) {
          var done = ok && useBooster('crane', i);
          cr.resolve(!!done); changed();
        });
        return;
      }
      if (i < 0 || G.st.over || G.offer) return;
      e.preventDefault();
      tapCar(i);
    }
    function tapCar(i) {
      var snap = R.clone(G.st);
      var res = R.tap(G.K, G.st, i);
      if (res.ok) { G.undo.push(snap); if (G.undo.length > 50) G.undo.shift(); }
      if (hooks.onMove) hooks.onMove({ car: i, ok: res.ok, kind: res.events.length ? res.events[0].t : 'none' });
      apply(res);
      return res;
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.style.touchAction = 'none';
    var onResize = function () { if (G.L) { layout(); G.cars.forEach(function (v) { if (!v.anim && v.mode !== 'gone') { var h = home(v); v.x = h[0]; v.y = h[1]; v.a = h[2]; v.s = h[3]; } }); draw(); } else layout(); };
    if (typeof ResizeObserver !== 'undefined') { var ro = new ResizeObserver(onResize); ro.observe(canvas); }
    else root.addEventListener('resize', onResize);

    // ---------------------------------------------------------------- boosters / continue
    function canUse(id) {
      var st = G.st;
      if (!st || st.won || G.ended) return false;
      switch (id) {
        case 'undo': return G.undo.length > 0;
        case 'slot': return !st.over && st.slots < G.L.slots + MAX_EXTRA_SLOTS + st.continues * CONTINUE_SLOTS;
        case 'shuffle': var parked = 0; for (var i = 0; i < G.K.n; i++) if (!st.gone[i]) parked++; return parked >= 2;
        case 'crane': if (st.over) return false; for (i = 0; i < G.K.n; i++) if (!st.gone[i] && R.hasRoom(G.K, st, i)) return true; return false;
      }
      return false;
    }
    function useBooster(id, arg) {
      if (!canUse(id)) return false;
      var st = G.st, res;
      if (id === 'undo') {
        var prev = G.undo.pop();
        ['moves', 'bumps', 'continues'].forEach(function (k) { prev[k] = st[k]; });
        prev.boosters = st.boosters + 1;
        if (prev.slots < st.slots) { while (prev.wait.length < st.slots) prev.wait.push(-1); prev.slots = st.slots; }
        G.st = prev;
        G.parts = []; rebuild(); layoutSlots(); drawBg(); changed(); wake();
        return true;
      }
      if (id === 'slot') { res = R.addSlots(G.K, st, 1); st.boosters++; }
      else if (id === 'shuffle') {
        res = R.recolour(G.K, st, G.rng, function (K, s) { return S.solvable(K, s, 15000); }, 30);
        if (res.ok) G.undo = [];   // old snapshots carry old colours
      } else if (id === 'crane') {
        var snap = R.clone(st);
        res = R.crane(G.K, st, arg);
        if (res.ok) G.undo.push(snap);
      }
      if (!res || !res.ok) return false;
      apply(res);
      return true;
    }
    function requestBooster(id) {
      if (!canUse(id)) return Promise.resolve(false);
      if (id === 'crane') {
        if (G.crane) { cancelCrane(); return Promise.resolve(false); }
        return new Promise(function (resolve) { G.crane = { resolve: resolve }; changed(); wake(); });
      }
      return Promise.resolve(hooks.onBoosterRequest ? hooks.onBoosterRequest(id) : true).then(function (ok) { return ok ? useBooster(id) : false; });
    }
    function cancelCrane() { if (G.crane) { var c = G.crane; G.crane = null; c.resolve(false); changed(); wake(); } }
    function applyContinue() {
      var st = G.st;
      if (!st || st.won) return false;
      st.continues++;
      apply(R.addSlots(G.K, st, CONTINUE_SLOTS));
      G.ended = false;
      return true;
    }

    var api = {
      start: start,
      restart: function () { return start(G.L); },
      canUseBooster: canUse, useBooster: useBooster, requestBooster: requestBooster, cancelCrane: cancelCrane,
      applyContinue: applyContinue,
      setSound: function (on) { sfx.on = !!on; },
      resize: onResize,
      state: function () { return G.st; },
      get level() { return G.L; },
      destroy: function () { canvas.removeEventListener('pointerdown', onDown); if (G.raf) cancelAnimationFrame(G.raf); },
      // test / tooling helpers
      debug: {
        G: G,
        idle: function () { return !busy(); },
        solution: function () { var r = S.solve(G.K, G.st, { maxNodes: 200000 }); return r.solved ? r.path : null; },
        carCenter: function (i) { var c = carCenter(i), b = canvas.getBoundingClientRect(); return [b.left + c[0], b.top + c[1]]; },
        tap: tapCar
      }
    };
    layout();
    return api;
  }

  root.AtascoGame = { create: create, CONTINUE_SLOTS: CONTINUE_SLOTS };
})(this);

/* ---- game/config.js ---- */
/* Atascazo's game config for the gamekit platform: the part of the economy that is specific to this game.
 * Same shape as game-blocks/src/game/config.js (Teselo); gamekit merges it over its platform defaults
 * (GamekitUtil.merge(GamekitConfig, AtascazoGameConfig, ['products', 'skins'])). See gamekit/PLATFORM.md.
 */
(function (root) {
  'use strict';
  var GAME = {
    game: { id: 'atascazo', title: 'Atascazo' },
    platform: { epoch: '2026-10-26' },

    // levels use the platform's levelWin / perNewStar. The daily pays once a day (first win); replays pay nothing.
    coins: { modes: { daily: { base: 20, per100: 0 } } },

    // undo: last car back to its spot | slot: +1 arcen place | shuffle: repaint the parked cars (always to a
    // winnable deal) | crane: lift any one car out, blocked or locked
    boosters: {
      start: { undo: 3, slot: 2, shuffle: 1, crane: 1 },
      price: { undo: 40, slot: 80, shuffle: 100, crane: 120 }   // multiples of 20; coin packs are multiples of 40
    },
    continue: { extraSlots: 2, maxPerLevel: 2 },   // game-side meaning of a platform "continue" (R1): +2 arcen places

    // the booster bar is part of the board from level 1 (the jam needs undo); the rest unlocks as usual
    unlocks: { boosters: { level: 1, games: 0 } },

    // car paint skins: body colours per colour id (the icons never change: colour-blind safe)
    skins: [
      { id: 'clasico', kind: 'cars', price: 0, paint: null },
      { id: 'pastel', kind: 'cars', price: 500, paint: { red: '#f08a8c', blue: '#7fa8ec', yellow: '#f5d561', green: '#7cc99a', purple: '#b39ae4', orange: '#f5ad6f', pink: '#f3a3c9', teal: '#6cc6c9' } },
      { id: 'ochentas', kind: 'cars', price: 800, paint: { red: '#d7263d', blue: '#1b998b', yellow: '#f4d35e', green: '#3bb273', purple: '#6c4ab6', orange: '#ee964b', pink: '#f45b69', teal: '#2e86ab' } },
      { id: 'verano', kind: 'cars', starterOnly: true, paint: { red: '#ff6b6b', blue: '#4dabf7', yellow: '#ffd43b', green: '#51cf66', purple: '#9775fa', orange: '#ff922b', pink: '#f783ac', teal: '#3bc9db' } },
      { id: 'metal', kind: 'cars', passOnly: true, paint: { red: '#b0413e', blue: '#3d5a80', yellow: '#c9a227', green: '#4f7942', purple: '#5e4b8b', orange: '#c56a2d', pink: '#b5657d', teal: '#2f7f86' } },
      { id: 'noche', kind: 'cars', levelOnly: 6, paint: { red: '#ff5470', blue: '#4cc9f0', yellow: '#ffe066', green: '#70e000', purple: '#b388ff', orange: '#ff9e00', pink: '#ff70a6', teal: '#00f5d4' } }
    ],
    levelSkins: { 6: 'noche' },

    // CPU rivals that top up a thin daily ranking. Daily score = 20000 - 100 * moves - min(99, seconds / 5):
    // moves first, time breaks ties (see the game's score code). Typical player ~31 moves.
    ranking: { botScore: { daily: [16900, 500, 17900] } },

    chests: { boosterOrder: ['undo', 'slot', 'shuffle', 'crane'] },

    // quest metrics this game reports in result.stats: cars trucks perfect nocrane (+ platform: games levels stars daily boosters)
    quests: {
      daily: [
        { id: 'cars50', metric: 'cars', target: 50, reward: { coins: 30, xp: 25 } },
        { id: 'trucks12', metric: 'trucks', target: 12, reward: { coins: 30, xp: 25 } },
        { id: 'nocrane5', metric: 'nocrane', target: 5, reward: { coins: 40, xp: 30 } },
        { id: 'levels3', metric: 'levels', target: 3, reward: { coins: 40, xp: 30 } },
        { id: 'perfect1', metric: 'perfect', target: 1, reward: { coins: 40, xp: 30 } },
        { id: 'stars6', metric: 'stars', target: 6, reward: { coins: 40, xp: 30 } },
        { id: 'daily1', metric: 'daily', target: 1, reward: { coins: 30, xp: 25 } },
        { id: 'booster1', metric: 'boosters', target: 1, reward: { coins: 20, xp: 20 } }
      ],
      weekly: [
        { id: 'w-cars400', metric: 'cars', target: 400, reward: { coins: 200, xp: 120 } },
        { id: 'w-levels15', metric: 'levels', target: 15, reward: { coins: 200, xp: 120 } },
        { id: 'w-daily5', metric: 'daily', target: 5, reward: { coins: 250, xp: 150 } },
        { id: 'w-nocrane25', metric: 'nocrane', target: 25, reward: { coins: 200, xp: 120 } },
        { id: 'w-perfect10', metric: 'perfect', target: 10, reward: { coins: 200, xp: 120 } }
      ]
    },

    pass: {
      free: function (t) { return t % 5 === 0 ? { chest: 'silver' } : t % 2 ? { coins: 40 } : { boosters: { undo: 1 } }; },
      premium: function (t) {
        return t === 30 ? { skin: 'metal' } : t % 5 === 0 ? { chest: 'gold' } : t % 3 === 0 ? { boosters: { crane: 1, slot: 1 } } : { coins: 80 };
      }
    },

    // appended to the platform products (remove_ads, coins_s/m/l, piggy_bank, pass_sNN)
    products: [
      { id: 'starter_pack', type: 'non_consumable', price: '1,99 €', offer: 'starter',
        grant: { coins: 1500, boosters: { undo: 3, slot: 3, shuffle: 3, crane: 3 }, skin: 'verano', noAdsDays: 7 } },
      { id: 'boosters_bundle', type: 'consumable', price: '1,99 €', grant: { boosters: { undo: 5, slot: 3, crane: 3 } } }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = GAME;
  else root.AtascazoGameConfig = GAME;
})(this);

/* ---- shell/shell.js ---- */
/* Atascazo on gamekit: menu, level map, HUD, booster bar, win / lose screens, wired to the shared platform
 * (products/gamekit, bundled in front of this file by build.py). The game itself (src/game/*) is unchanged; it talks
 * to the platform through the hooks documented at the top of src/game/game.js.
 *
 * Platform features: coins, shop (remove ads, coin packs, starter pack, piggy bank), daily wheel, chests, streak and
 * gifts, quests ("Saca 50 coches", "Completa 5 niveles sin grúa"...), XP and level-ups, weekly league (includes CPU
 * rivals), daily ranking through gamekit-api, boosters (deshacer, plaza extra, repintar, grúa), rewarded ads
 * (continue, booster, double coins, extra spin) and interstitials only after a tap on a result screen.
 *
 * URL params (tests): ?level=12  ?daily=2026-10-26  ?date=2026-10-26 (today)  ?reset=1  ?mute=1  ?api=off
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var GEN = window.AtascoGen, ART = window.AtascoArt;
  var qs = {};
  location.search.replace(/[?&]([^=&]+)=?([^&]*)/g, function (_, k, v) { qs[k] = decodeURIComponent(v); });
  if (qs.reset) { try { ['atascazo.save', 'atascazo.online', 'atascazo.v1'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* private mode */ } }
  var todayStr = function () { return /^\d{4}-\d{2}-\d{2}$/.test(qs.date || '') ? qs.date : GEN.todayStr(); };

  var WIN = ['¡Has llegado antes que la DGT!', 'Aparcas mejor que tu cuñado.', 'Ni un rasguño. Ni un pitido.',
    '¡Sin multas este puente!', 'Benidorm te espera.', 'Tu profe de autoescuela llora de emoción.',
    'Ni la M-30 a las 4 de la mañana.', 'La sombrilla ya está puesta.', 'Has salido antes de las 7. Leyenda.',
    'Ni un intermitente mal puesto.'];
  var FAIL = ['Atasco monumental.', 'El arcén no es un parking.', 'Retenciones de 30 km.', 'Te ha pillado el puente.',
    'Pitar no ayuda.', 'Había que salir antes de las 7.', 'Ni con el GPS.', 'Tu cuñado lo habría hecho peor. Seguramente.'];
  var REASON = { arcen_full: 'Arcén lleno', stuck: 'Atasco total' };
  var TX = {
    blocks: 'PINTURA', cont: 'Seguir',
    q: { cars: 'Saca {n} coches', trucks: 'Llena {n} camiones', nocrane: 'Completa {n} niveles sin grúa', perfect: 'Nivel perfecto ({n})',
      levels: 'Supera {n} niveles', stars: 'Gana {n} estrellas', daily: 'Juega Operación Salida ({n})', boosters: 'Usa {n} ayuda', games: 'Juega {n} partidas' },
    skins: { clasico: 'Clásico', pastel: 'Pastel', ochentas: 'Ochentero', verano: 'Verano', metal: 'Metalizado', noche: 'Noche' }
  };

  // ---------------------------------------------------------------- platform
  var CFG = Gamekit.mergeConfig(GamekitConfig, window.AtascazoGameConfig);
  var P = Gamekit.create({ config: CFG, today: todayStr, saveDefaults: function () { return { daily: {}, migrated: false }; } });
  var G = function () { return P.gameData; };
  migrate();
  if (qs.mute) P.settings.muted = true;

  // daily ranking score: fewer moves first, then less time (5 s steps, never worth a move). Higher is better.
  function dailyScore(moves, secs) { return Math.max(1, 20000 - moves * 100 - Math.min(99, Math.floor(secs / 5))); }
  function fmtScore(s, period) {
    if (period !== 'daily') return String(s);
    return Math.floor((20000 - s) / 100) + ' <small>mov</small>';
  }

  // the standalone 1.0 save (atascazo.v1): progress, coins, boosters and dailies move into the gamekit save once
  function migrate() {
    var g = G();
    if (g.migrated) return;
    g.migrated = true;
    var old = null;
    try { old = JSON.parse(localStorage.getItem('atascazo.v1') || 'null'); } catch (e) { old = null; }
    if (old && typeof old === 'object') {
      var d = P.data, eco = P.eco.state;
      d.progress.unlocked = Math.max(d.progress.unlocked, old.reached || 1);
      Object.keys(old.stars || {}).forEach(function (k) { d.progress.stars[k] = Math.max(d.progress.stars[k] || 0, old.stars[k] | 0); });
      eco.coins += Math.max(0, old.coins | 0);
      Object.keys(old.boosters || {}).forEach(function (k) { if (k in eco.boosters) eco.boosters[k] = Math.max(eco.boosters[k], old.boosters[k] | 0); });
      if (old.sound === false) d.settings.muted = true;
      Object.keys(old.daily || {}).forEach(function (k) { var x = old.daily[k]; g.daily[k] = { moves: x.moves, secs: 0, score: dailyScore(x.moves, 0), stars: x.stars }; });
    }
    P.commit();
  }

  // ---------------------------------------------------------------- game
  var current = null, pending = null, levelCranes = 0, failReported = false, lastSummary = null;
  var game = AtascoGame.create($('cv'), {
    sound: !P.settings.muted,
    onChange: hud,
    // the shell acquired the booster first (owned / coins / rewarded ad); this spends it when it is really used
    onBoosterRequest: function (id) { var ok = P.useBooster(id); if (ok && id === 'crane') levelCranes++; return ok; },
    onContinueRequested: function (info) { return new Promise(function (resolve) { pending = resolve; showLose(info); }); },
    onFail: function () { /* the lose panel handles retry / home */ },
    onLevelComplete: showWin,
    coinsFor: function () { return 0; }   // the platform pays (P.finished)
  });
  P.ads.hooks.pause = function () { game.setSound(false); };
  P.ads.hooks.resume = function () { game.setSound(!P.settings.muted); };

  // ---------------------------------------------------------------- skins
  var DEFAULT_PAINT = {};
  Object.keys(ART.PALETTE).forEach(function (k) { DEFAULT_PAINT[k] = ART.PALETTE[k].body; });
  function applySkin() {
    var s = P.eco.equipped('cars');
    ART.setPalette(Object.assign({}, DEFAULT_PAINT, (s && s.paint) || {}));
    game.resize();
  }
  function skinPreview(s) {
    var p = Object.assign({}, DEFAULT_PAINT, s.paint || {});
    return '<div class="sw">' + ['red', 'blue', 'yellow', 'green'].map(function (k) { return '<i style="background:' + p[k] + '"></i>'; }).join('') + '</div>';
  }

  // ---------------------------------------------------------------- shell + engagement UI (gamekit)
  GamekitEmbed.mount({ lang: 'es' });
  var shell = GamekitShell.create(P, {
    ids: GamekitEmbed.ids({ 'o-coins': 'w-coins', 'o-double': 'w-double', 'o-cont': 'l-cont', levels: 'levels' }),
    lang: 'es',
    texts: { es: TX, en: TX },
    boosters: { ids: CFG.chests.boosterOrder.slice(), usable: function () { return true; }, press: function () {} },
    quests: { button: 'm-quests', badge: 'm-quests-badge' },
    shopButton: 'm-shop',
    skinPreview: skinPreview,
    contLabel: function () { return '<span>+' + CFG.continue.extraSlots + '</span><svg><use href="#i-slot"/></svg>'; },
    onMute: function (m) { game.setSound(!m); },
    onSkin: applySkin
  });
  GamekitEmbed.bind(shell);
  shell.register('menu', { el: 'menu', hud: { menu: true }, onShow: renderMenu });
  shell.register('play', { el: null, hud: {} });
  shell.register('win', { el: 'win', hud: {} });
  shell.register('lose', { el: 'lose', hud: {} });
  shell.register('levels', { el: 'levels', hud: {}, onShow: buildLevels });   // the game's own pack map
  var funUI = GamekitFunUI.attach(P, shell, {
    host: 'gk', dock: 'm-dock', xpbar: 'm-xp', skinPreview: skinPreview, rankMode: 'daily',
    localScore: localDailyScore, playDaily: function () { startDaily(); }, formatScore: fmtScore,
    wheelColors: ['#3b7ddd', '#2ea862', '#f0852a', '#8d5fd3', '#e8484b', '#13a1a6', '#ec6fae', '#f2bf16'], meColor: '#1d5aa6',
    links: { privacy: 'https://ces107.github.io/atascazo/privacy.html', terms: 'https://ces107.github.io/atascazo/terms.html' }
  });
  P.on('wallet', function () { renderChips(); if (lastSummary) hud(lastSummary); });
  P.on('ranked', function (j, body) {
    if (!j || !j.rank || !current || current.type !== 'daily' || body.day !== current.date) return;
    $('w-rank').innerHTML = '<svg><use href="#gk-i-trophy"/></svg> ' + j.rank + '/' + j.total;
  });
  applySkin();

  function weekOf(day) { return Math.floor((GamekitUtil.dayNumber(day, CFG.platform.epoch) - 1) / 7); }
  function localDailyScore(period) {
    var res = G().daily, today = todayStr(), keys = Object.keys(res).filter(function (k) { return res[k].score; });
    if (period === 'daily') return res[today] ? res[today].score : null;
    var pick = period === 'weekly' ? keys.filter(function (k) { return weekOf(k) === weekOf(today); }) : keys;
    if (!pick.length) return null;
    return period === 'weekly' ? pick.reduce(function (a, k) { return a + res[k].score; }, 0) : Math.max.apply(null, pick.map(function (k) { return res[k].score; }));
  }

  function packOf(n) { return GEN.pack(n).pack; }

  function play(spec, meta) {
    current = meta;
    levelCranes = 0; failReported = false;
    $('w-rank').innerHTML = '';
    shell.show('play');
    game.start(spec);
    $('hud-n').textContent = meta.type === 'daily' ? '#' + spec.daily.number : meta.n;
    $('hud-pack').textContent = meta.type === 'daily' ? 'Operación Salida' : packOf(meta.n).name;
    var first = meta.type === 'level' && (meta.n - 1) % GEN.PER_PACK === 0;
    banner(meta.type === 'daily' ? 'Operación Salida #' + spec.daily.number : first ? packOf(meta.n).name : (spec.hard ? '⚠ ' : '') + meta.n);
    P.started({ mode: meta.type === 'daily' ? 'daily' : 'level', level: meta.type === 'level' ? meta.n : 0 });
  }
  function startLevel(n) { n = Math.max(1, n | 0); play(GEN.level(n), { type: 'level', n: n }); }
  function startDaily(date) { date = date || todayStr(); play(GEN.daily(date), { type: 'daily', date: date }); }

  // ---------------------------------------------------------------- HUD + boosters
  function hud(sm) {
    lastSummary = sm;
    $('moves').textContent = sm.moves;
    document.querySelectorAll('#boosters .bst').forEach(function (b) {
      var id = b.dataset.b, n = P.eco.boosters(id), badge = b.querySelector('b');
      b.disabled = !sm.boosters[id] && !(id === 'crane' && sm.crane);
      badge.textContent = n > 0 ? n : '+';
      badge.className = n > 0 ? '' : 'ad';
      b.classList.toggle('armed', id === 'crane' && sm.crane);
    });
  }
  // owned -> use; none left -> coins; not enough coins -> rewarded ad (if one is loaded). The game spends it.
  function pressBooster(id, done) {
    if (id === 'crane' && lastSummary && lastSummary.crane) { game.cancelCrane(); return; }
    if (!game.canUseBooster(id)) { if (done) done(false); return; }
    P.acquireBooster(id, function (ok, how) {
      if (!ok) { shell.toast(CFG.boosters.price[id] + ' ' + shell.ico('coin')); if (done) done(false); return; }
      if (how === 'coins') shell.toast('−' + CFG.boosters.price[id] + ' ' + shell.ico('coin'));
      game.requestBooster(id).then(function (used) { if (lastSummary) hud(lastSummary); if (done) done(used); });
    });
  }
  document.querySelectorAll('#boosters .bst').forEach(function (b) {
    b.addEventListener('click', function () { pressBooster(b.dataset.b); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') game.cancelCrane(); });

  // ---------------------------------------------------------------- panels
  var bannerT = 0, toastT = 0;
  function banner(text) {
    var b = $('banner'); b.textContent = text; b.classList.add('show');
    clearTimeout(bannerT); bannerT = setTimeout(function () { b.classList.remove('show'); }, 1300);
  }
  function toast(text) {
    var t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 1400);
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function shareLine(res) {
    var sq = '';
    for (var i = 0; i < 3; i++) sq += i < res.stars ? '🟩' : '🟨';
    if (res.daily) return '🚗 Operación Salida #' + res.daily.number + ' · ' + res.movesUsed + ' movimientos · ' + sq;
    return '🚗 Atascazo · Nivel ' + current.n + ' · ' + res.movesUsed + ' movimientos · ' + sq;
  }

  // quest metrics: cars out, trucks sent, perfect (3 stars, no booster, no continue), levels won without the crane
  function stats(res) {
    var st = game.state();
    if (!res) return { cars: st.exits || 0, trucks: st.truck || 0 };
    return { cars: res.cars, trucks: res.trucks, perfect: res.stars === 3 && !res.boostersUsed && !res.continues ? 1 : 0,
      nocrane: current.type === 'level' && levelCranes === 0 ? 1 : 0 };
  }

  var lastWin = null;
  function showWin(res) {
    lastWin = res;
    var summary;
    if (current.type === 'level') {
      summary = P.finished({ mode: 'level', level: current.n, won: true, stars: res.stars, score: res.movesUsed, stats: stats(res) });
    } else {
      // the first win of the day is the ranked one (the server keeps one result per day); replays pay nothing
      var d = G().daily, first = !d[current.date] || !d[current.date].score, secs = Math.round(res.timeMs / 1000);
      var score = dailyScore(res.movesUsed, secs);
      if (first) d[current.date] = { moves: res.movesUsed, secs: secs, score: score, stars: res.stars };
      summary = P.finished({ mode: first ? 'daily' : 'daily_replay', score: score, stats: stats(res) });
      if (first) P.submitScore({ mode: 'daily', day: current.date, score: score, moves: 'm' + res.movesUsed + '.t' + secs + '.c' + res.cars });
      else $('w-rank').innerHTML = '#' + res.daily.number + ' · ' + d[current.date].moves + ' <small>mov</small>';
    }
    $('w-cap').textContent = pick(WIN);
    $('w-moves').textContent = res.movesUsed;
    $('w-share-line').textContent = res.daily ? shareLine(res) : '';
    $('w-next').hidden = current.type !== 'level';
    var st = $('w-stars'); st.classList.remove('show');
    st.querySelectorAll('svg').forEach(function (s, i) { s.classList.toggle('on', i < res.stars); });
    shell.show('win');
    shell.result(summary, { available: false });
    requestAnimationFrame(function () { requestAnimationFrame(function () { st.classList.add('show'); }); });
  }

  function showLose(info) {
    $('l-cap').textContent = pick(FAIL);
    $('l-reason').textContent = REASON[info.reason] || REASON.stuck;
    $('l-undo').hidden = !game.canUseBooster('undo');
    shell.show('lose');
    shell.result(null, { available: info.continues < CFG.continue.maxPerLevel, onRevive: function () { shell.show('play'); resolvePending(true); } });
  }
  function resolvePending(v) { var p = pending; pending = null; if (p) p(v); }
  // a lost level counts once (quests, stats, the interstitial cadence) when the player gives up
  function reportFail() {
    if (failReported || !current) return;
    failReported = true;
    var st = game.state();
    if (current.type === 'level') P.finished({ mode: 'level', level: current.n, won: false, score: 0, stats: stats(null), reason: st.failReason || 'stuck' });
    else P.finished({ mode: 'daily_fail', score: 0, stats: stats(null) });
  }
  // interstitials only here: after a tap on a result screen (a natural break), never at launch, exit or mid-level
  function afterResult(fn) { P.afterResult(current && current.type === 'level' ? 'level' : 'game', fn); }

  $('l-undo').addEventListener('click', function () {
    shell.show('play');
    pressBooster('undo', function (used) { if (used) resolvePending(false); else shell.show('lose'); });
  });
  $('l-again').addEventListener('click', function () {
    reportFail();
    afterResult(function () { resolvePending(false); current.type === 'daily' ? startDaily(current.date) : startLevel(current.n); });
  });
  $('l-home').addEventListener('click', function () { reportFail(); afterResult(function () { resolvePending(false); home(); }); });
  $('w-next').addEventListener('click', function () { afterResult(function () { startLevel(current.n + 1); }); });
  $('w-again').addEventListener('click', function () { afterResult(function () { current.type === 'daily' ? startDaily(current.date) : startLevel(current.n); }); });
  $('w-home').addEventListener('click', function () { afterResult(home); });
  $('w-share').addEventListener('click', function () {
    if (!lastWin) return;
    var text = shareLine(lastWin);
    var done = function () { toast('✓ ' + text.slice(0, 26) + '…'); };
    try {
      if (navigator.share) navigator.share({ text: text }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
      else done();
    } catch (e) { done(); }
  });

  // ---------------------------------------------------------------- menu
  function renderChips() {
    $('coins').textContent = P.eco.coins;
    $('m-streak-v').textContent = P.meta.liveStreak();
    $('m-streak').classList.toggle('cold', !P.meta.playedToday());
    $('stars-total').textContent = P.progress.total();
  }
  function renderMenu() {
    var n = P.progress.unlocked();
    $('m-play-n').textContent = n;
    $('m-play-pack').textContent = packOf(n).name;
    var today = todayStr(), d = G().daily[today];
    $('m-daily-n').textContent = '#' + GEN.dailyNumber(today);
    $('m-daily-s').textContent = d ? '✓ ' + d.moves : 'Operación Salida';
    renderChips();
  }
  function home() { game.cancelCrane(); shell.show('menu'); }
  $('m-play').addEventListener('click', function () { startLevel(P.progress.unlocked()); });
  $('m-daily').addEventListener('click', function () { startDaily(); });
  $('m-coins').addEventListener('click', function () { shell.show('shop'); });
  $('m-streak').addEventListener('click', function () { shell.show('streakinfo'); });
  $('b-home').addEventListener('click', home);
  $('lv-back').addEventListener('click', home);
  $('m-levels').addEventListener('click', function () { shell.show('levels'); });
  $('b-sound').addEventListener('click', function () {
    P.settings.muted = !P.settings.muted; P.commit(); game.setSound(!P.settings.muted); $('b-sound').classList.toggle('off', P.settings.muted);
  });
  $('b-sound').classList.toggle('off', !!P.settings.muted);

  function buildLevels() {
    var list = $('lv-list'), html = '', reached = P.progress.unlocked();
    for (var p = 0; p < GEN.PACKS.length; p++) {
      var first = p * GEN.PER_PACK + 1, got = 0, cells = '';
      for (var n = first; n < first + GEN.PER_PACK; n++) {
        var s = P.progress.stars(n), open = n <= reached;
        got += s;
        var cls = 'lv' + (open ? ' open' : ' locked') + (n === reached ? ' cur' : '') + (n % 10 === 0 ? ' hard' : '');
        var stars = '';
        for (var k = 0; k < 3; k++) stars += '<svg class="' + (k < s ? 'on' : '') + '"><use href="#i-star"/></svg>';
        cells += '<button class="' + cls + '" data-n="' + n + '"' + (open ? '' : ' disabled') + '>' + n +
          (open ? '<span class="st">' + stars + '</span>' : '<svg><use href="#i-lock"/></svg>') + '</button>';
      }
      html += '<div class="pack"><div class="sign small">' + GEN.PACKS[p].name + '<i>' + got + '/' + GEN.PER_PACK * 3 + ' ★</i></div><div class="lv-grid">' + cells + '</div></div>';
    }
    list.innerHTML = html;
    var cur = list.querySelector('.lv.cur');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }
  $('lv-list').addEventListener('click', function (e) {
    var b = e.target.closest('.lv');
    if (b && !b.disabled) startLevel(+b.dataset.n);
  });

  // Android back button (MainActivity calls window.gamekitBack): overlay -> stays; platform sheet -> back;
  // level / map / result -> home; menu -> 'exit' (the app goes to the background). Never an ad on back or exit.
  window.gamekitBack = function () {
    var ov = $('gk-ov');
    if (ov && ov.classList.contains('show')) return 'ok';
    if (document.body.classList.contains('gk-open')) { shell.back(); return 'ok'; }
    if (shell.screen === 'menu') return 'exit';
    if (shell.screen === 'lose') { $('l-home').click(); return 'ok'; }
    if (shell.screen === 'win') { $('w-home').click(); return 'ok'; }
    home();
    return 'ok';
  };

  // test / tooling handle
  window.Atascazo = {
    game: game, P: P, shell: shell, funUI: funUI, eco: P.eco, startLevel: startLevel, startDaily: startDaily, play: play, home: home, shareLine: shareLine,
    dailyScore: dailyScore,
    save: function () { return { reached: P.progress.unlocked(), stars: P.data.progress.stars, coins: P.eco.coins, boosters: P.eco.state.boosters, daily: G().daily, sound: !P.settings.muted }; }
  };

  if (qs.level) startLevel(+qs.level);
  else if (qs.daily) startDaily(qs.daily === '1' ? undefined : qs.daily);
  else home();
  P.init();
})();
