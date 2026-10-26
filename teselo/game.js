/* Teselo 1.0.0 | (c) Cesar Pereiro | all code and sounds original, no third-party assets */

/* ---- meta/util.js ---- */
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

/* ---- economy/config.js ---- */
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
      types: {
        wood: { unlockMin: 15, coins: 30, boosters: 1 },
        silver: { unlockMin: 60, coins: 90, boosters: 2 },
        gold: { unlockMin: 180, coins: 220, boosters: 3 }
      },
      boosterOrder: [],      // game: which boosters a chest gives, in order
      levelMilestone: 5,     // a silver chest every 5 levels won for the first time
      adSkipsPerDay: 3       // R3: a rewarded ad opens the chest that is unlocking
    },

    // ---- streak (Duolingo-style flame) ----
    streak: {
      freezePrice: 200, maxFreezes: 2, startFreezes: 1,
      milestones: { 3: 50, 7: 100, 14: 200, 30: 400, 100: 1000 },  // coins, once each
      repairEveryDays: 7     // R5: one rewarded streak repair per 7 days, for a streak broken yesterday
    },

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

/* ---- economy/economy.js ---- */
/* gamekit economy: one soft currency (coins), boosters, cosmetics, piggy bank, reward granting.
 * Pure logic over a plain state object that lives inside the save (save.data.economy).
 *
 *   var eco = GamekitEconomy.create(state, config, { onChange, track, onGrant, now })
 *   eco.coins, eco.earn(n, source), eco.spend(n, sink) -> bool
 *   eco.boosters(id), eco.useBooster(id) -> bool, eco.buyBooster(id) -> bool, eco.addBooster(id, n, source)
 *   eco.owns(skin), eco.buySkin(skin) -> bool (coin skins only), eco.equip(skin), eco.equipped('block'|'board')
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
    return { coins: 0, boosters: b, skins: ['calm', 'paper'], equipped: { block: 'calm', board: 'paper' },
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

/* ---- meta/remote.js ---- */
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

/* ---- meta/analytics.js ---- */
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

/* ---- meta/save.js ---- */
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

/* ---- meta/meta.js ---- */
/* gamekit meta loops: login streak with freezes, daily/weekly quests, season pass, earned chests.
 * Pure logic over save.data.meta; time comes in through deps.now() and deps.today() so tests can drive it.
 *
 *   var meta = GamekitMeta.create(state, config, { economy, track, now, today })
 *   meta.touchStreak()            call once a game/level is finished: extends the flame, uses freezes for missed days
 *   meta.liveStreak()             what the flame shows now
 *   meta.buyFreeze()              coins -> one streak freeze (max config.streak.maxFreezes)
 *   meta.refresh()                re-roll quests on a new day/week, roll the pass on a new season
 *   meta.progress(metric, n)      -> quests just completed  (metrics: lines pieces games levels stars combo3 daily gems boosters)
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
        return { count: s.count, frozen: used, gift: gift };
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
      earnChest: function (type) {
        if (!cfg.chests.types[type] || state.chests.length >= cfg.chests.slots) return false;
        state.chests.push({ type: type, earnedAt: now(), opensAt: 0 });
        track('chest_earned', { type: type });
        return true;
      },
      chestState: function (i) {
        var c = state.chests[i];
        if (!c) return null;
        if (!c.opensAt) return { type: c.type, status: 'locked' };
        var left = c.opensAt - now();
        return left <= 0 ? { type: c.type, status: 'ready' } : { type: c.type, status: 'unlocking', msLeft: left };
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
      openChest: function (i) {
        var st = meta.chestState(i);
        if (!st || st.status !== 'ready') return null;
        var c = state.chests[i], reward = meta.chestContents(c.type);
        state.chests.splice(i, 1);
        track('chest_open', { type: c.type, coins: reward.coins });
        return eco.grant(reward, 'chest_' + c.type);
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
        // stats: { score, lines, pieces, maxCombo, gems, boosters }
        meta.lastStreak = meta.touchStreak(); // { count, frozen, gift } for the result screen
        var done = [];
        done = done.concat(meta.progress('games', 1));
        done = done.concat(meta.progress('lines', stats.lines || 0));
        done = done.concat(meta.progress('pieces', stats.pieces || 0));
        if (stats.combo3) done = done.concat(meta.progress('combo3', stats.combo3));
        if (stats.gems) done = done.concat(meta.progress('gems', stats.gems));
        if (stats.boosters) done = done.concat(meta.progress('boosters', stats.boosters));
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
    meta.onGrant = function (reward, got) {
      if (reward.chest) got.chest = meta.earnChest(reward.chest) ? reward.chest : null;
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

/* ---- ads/ads.js ---- */
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

/* ---- iap/iap.js ---- */
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

/* ---- meta/platform.js ---- */
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
        economy: Economy.defaults(cfg), meta: Meta.defaults(cfg), stats: { games: 0, levels: 0, byMode: {} },
        game: opts.saveDefaults ? opts.saveDefaults() : {} };
    } });
    var D = function () { return save.data; };
    var hooks = { track: function (n, p) { An.track(n, p); }, onChange: function () { emit('wallet'); } };
    var eco = Economy.create(D().economy, cfg, hooks);
    var meta = Meta.create(D().meta, cfg, { economy: eco, track: hooks.track, today: today });
    hooks.onGrant = meta.onGrant;

    Ads.setPolicy(cfg.ads);
    Ads.setNoAds(eco.noAds);
    // day-0 grace: no interstitial before level N or the Nth finished non-level game on the first day
    Ads.setGate(function () {
      var d = D();
      return d.meta.firstDay !== today() || d.progress.unlocked >= cfg.ads.graceLevel || nonLevelGames() >= cfg.ads.graceGames;
    });
    function nonLevelGames() { var b = D().stats.byMode || {}, n = 0; Object.keys(b).forEach(function (k) { if (k !== 'level') n += b[k]; }); return n; }

    var P = {
      cfg: cfg, save: save, eco: eco, meta: meta, ads: Ads, iap: IAP, track: hooks.track, today: today,
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
        meta.lastStreak = null;
        save.commit();
        emit('wallet');
        return out;
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
        return Promise.all([adsReady, iapReady]);
      }
    };
    return P;
  }

  var Gamekit = { create: create, mergeConfig: mergeConfig };
  if (typeof module !== 'undefined' && module.exports) module.exports = Gamekit;
  else root.Gamekit = Gamekit;
})(this);

/* ---- shell/shell.js ---- */
/* gamekit UI shell: screens + HUD chips, toast, level map, quests / chests / pass sheet, shop, booster bar,
 * result-screen economy (coins, double coins, continue) and settings (sound, theme, privacy, restore).
 * Platform layer: it never touches game code; the game passes what it needs in `opts` (see src/PLATFORM.md).
 *
 *   var shell = GamekitShell.create(P, opts)
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
    var doc = root.document, $ = function (id) { return doc.getElementById(id); };
    var cfg = P.cfg, eco = P.eco, meta = P.meta, Ads = P.ads, IAP = P.iap;
    var lang = String(root.navigator.language || 'en').toLowerCase().indexOf('es') === 0 ? 'es' : 'en';
    var TX = Object.assign({}, TEXTS[lang], (opts.texts || {})[lang] || {});
    var sfx = Object.assign({ coin: noop, win: noop, bad: noop, pick: noop, tick: noop }, opts.sfx || {});
    var ico = function (id, cls) { return '<svg' + (cls ? ' class="' + cls + '"' : '') + '><use href="#i-' + id + '"/></svg>'; };
    var screens = {}, screen = null, legalOpen = false, lvBuilt = false;
    var BOOST = (opts.boosters && opts.boosters.ids) || [];
    function noop() {}

    // ---------- screens ----------
    // def: { el: element id or null, hud: { menu, score, coins, streak, boosters: bool | fn } , onShow }
    var SHEETS = {
      levels: { el: 'levels', hud: { coins: true }, onShow: function () { renderLevels(); } },
      quests: { el: 'quests', hud: { coins: true }, onShow: function () { renderQuests(); } },
      shop: { el: 'shop', hud: { coins: true }, onShow: function () { renderShop(); } }
    };
    function register(name, def) { screens[name] = def; }
    Object.keys(SHEETS).forEach(function (k) { register(k, SHEETS[k]); });
    function show(name) {
      var prev = screen, def = screens[name], hud = def.hud || {}, b = doc.body.classList;
      screen = name;
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
    function refresh() {
      $('coins').textContent = eco.coins;
      $('streak-v').textContent = meta.liveStreak();
      $('streak').classList.toggle('cold', !meta.playedToday());
      $('streak').classList.toggle('repair', meta.canRepairStreak() && Ads.rewardedReady());
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
      $('lv-stars').textContent = P.progress.total();
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
      var showChests = P.unlocked('chests'), html = '';
      if (showChests) {
        for (var i = 0; i < cfg.chests.slots; i++) {
          var st = meta.chestState(i);
          if (!st) { html += '<div class="chest empty"></div>'; continue; }
          var o = meta.chestOdds(st.type), what = meta.chestContents(st.type);
          var canSkip = st.status === 'unlocking' && Ads.rewardedReady() && meta.canAdSkip();
          var label = st.status === 'ready' ? TX.open : st.status === 'unlocking' ? fmtLeft(st.msLeft) + (canSkip ? ' ' + ico('ad') : '')
            : (o.unlockMin >= 60 ? o.unlockMin / 60 + ' ' + TX.h : o.unlockMin + ' ' + TX.min);
          html += '<button class="chest ' + st.type + (st.status === 'ready' ? ' ready' : '') + '" data-i="' + i + '">' + ico('chest') +
            '<span>' + label + '</span><small>' + contentsHtml(what).replace(' · ', '<br>') + '</small></button>';
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
        } else if (st.status === 'ready') { var got2 = meta.openChest(i); if (got2) { sfx.win(); toast(rewardText(got2)); } }
      }
      P.commit(); renderQuests(); refresh();
    });
    setInterval(function () { if (screen === 'quests') renderQuests(); }, 1000);

    // ---------- shop ----------
    function renderShop() {
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
      $('o-coins').innerHTML = res.coins > 0 ? '+' + res.coins + ' ' + ico('coin') : '';
      $('o-double').hidden = !P.canDouble(res.coins);
      var b = $('o-cont');
      b.hidden = !(cont && cont.available);
      if (!b.hidden) {
        var offer = P.continueOffer();
        res.byAd = offer.byAd;
        b.innerHTML = offer.byAd ? ico('ad', 'adi') + '<span>' + TX.cont + '</span>' : '<span>' + TX.cont + '</span> ' + offer.coins + ' ' + ico('coin');
        b.disabled = !offer.affordable;
      }
      if (summary.chest) setTimeout(function () { toast(ico('chest') + ' +1'); }, 900);
      if (summary.streakGift && summary.streakGift.coins) setTimeout(function () { toast(ico('flame') + ' ' + meta.liveStreak() + ' &nbsp;+' + summary.streakGift.coins + ' ' + ico('coin')); }, 1300);
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
        $('o-coins').innerHTML = '+' + res.coins * 2 + ' ' + ico('coin');
        b.hidden = true;
        sfx.coin();
      });
    });

    // boot
    doc.body.classList.toggle('muted', !!P.settings.muted);
    doc.body.classList.toggle('no-ads', true);
    return {
      lang: lang, TX: TX, ico: ico, show: show, register: register, toast: toast, refresh: refresh, result: result,
      rewardText: rewardText, theme: currentTheme, setBoosterActive: function (id) { activeBooster = id; renderBoosters(); },
      get screen() { return screen; }
    };
  }

  var Shell = { create: create, TEXTS: TEXTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Shell;
  else root.GamekitShell = Shell;
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
    'stars', 'boostersUsed', 'combo3'];
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
      { id: 'moss', kind: 'board', passOnly: true, board: { light: '#dfe6d3', dark: '#20291f' } }
    ],

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
      if (res.combo >= 2 || res.lines >= 3) P.ads.happy();
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
    P, shell, core: C, levels: Levels,
    get eco() { return eco; },
    get meta() { return meta; },
    dayKey: () => dayKey,
    startLevel: (n) => startLevel(n, true),
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
