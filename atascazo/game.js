/* Atascazo 1.2.0 | (c) Cesar Pereiro | code, art and sounds original; third-party icons and fonts credited in gamekit/CREDITS.md */

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
      doublePerDay: 4        // ... at most 4 times a day
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
      freePerDay: 1, adPerDay: 1, maxBank: 5,
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
      shopCoinsPerDay: 3
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
      // v2: sized in boosters (~300 coins each): S = 6-7, M = 18, L = 40. Multiples of 200 (cheapest booster)
      { id: 'coins_s', type: 'consumable', price: '1,99 €', grant: { coins: 2000 } },
      { id: 'coins_m', type: 'consumable', price: '4,99 €', grant: { coins: 5600 } },
      { id: 'coins_l', type: 'consumable', price: '9,99 €', grant: { coins: 12000 } },
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
      q: {}, skins: {} },
    es: { claim: 'Recoger', open: 'Abrir', dailyQ: 'HOY', weeklyQ: 'ESTA SEMANA', boosters: 'AYUDAS', blocks: 'ASPECTOS', boards: 'TABLEROS',
      streak: 'RACHA', store: 'TIENDA', equip: 'Usar', removeAds: 'Sin anuncios', pass: 'Pase', wait: 'Un cofre cada vez', min: 'min', h: 'h', d: 'd',
      free: 'GRATIS', starter: 'Pack inicial', piggy: 'Hucha', passWhat: 'Fila premium: monedas, cofres de oro, 2 aspectos', restore: 'Restaurar compras',
      legal: 'Compras y reembolsos', privacy: 'Privacidad', cont: 'Seguir',
      legalText: 'Precios con IVA, cobrados por Google Play. Cada artículo da exactamente lo que indica su tarjeta; nada es aleatorio. Derecho de desistimiento UE: 14 días, que se pierde al entregar el contenido digital con tu consentimiento. Reembolsos: Google Play, Historial de pedidos.',
      popular: 'Popular', best: 'Mejor valor', offer: 'Oferta', coinsH: 'MONEDAS', season: 'Pase de temporada', premium: 'Premium', freeRow: 'Gratis',
      piggyFill: 'Se llena al jugar', piggyBreak: '¡Lista para romper!', left: 'Termina en', empty: 'Vacío', locked: 'Bloqueado', owned: 'Tuyo',
      tap: 'Toca para abrir', unlocking: 'Abriendo', noAdsWhat: 'Sin pausas entre partidas', freezeWhat: 'Salva tu racha un día',
      hard: 'NIVEL DIFÍCIL', superHard: '¡SÚPER DIFÍCIL!', questsL: 'Misiones', shopL: 'Tienda', easy: 'Fácil', play: 'Jugar', upTo: 'Hasta', level: 'Nivel',
      q: {}, skins: {} }
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
    // reward tiles: icon on top, amount below (shop contents, pass track, chest contents)
    function rewardTiles(c, cls) {
      var out = [], t = function (icon, txt, x) { out.push('<span class="gk-rt' + (x ? ' ' + x : '') + '">' + icon + '<b>' + txt + '</b></span>'); };
      if (!c) return '';
      if (c.coins) t(ico('coin'), '+' + c.coins, 'coin');
      if (c.boosters) Object.keys(c.boosters).forEach(function (k) { t('<i class="gk-bt" style="--bc:' + boostCol(k) + '">' + ico(k) + '</i>', '×' + c.boosters[k]); });
      if (c.chest) t(chestArt(c.chest, 'gk-chestmini'), '×1', 'ch');
      if (c.skin) t((opts.skinPreview && eco.skin && eco.skin(c.skin) ? '<i class="gk-skinmini">' + opts.skinPreview(eco.skin(c.skin), currentTheme()) + '</i>' : gic('sparkles')), TX.skins[c.skin] || c.skin, 'skin');
      if (c.noAds) t(Art ? Art.noAds() : '', TX.removeAds, 'noads');
      if (c.noAdsDays) t(Art ? Art.noAds() : '', c.noAdsDays + ' ' + TX.d, 'noads');
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
    return { fx: fx, refresh: refreshMenu, info: info, renderLeague: renderLeague, renderRank: renderRank, spendFx: spendFx, coinFly: coinFly };
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

  /* The human proxy ("attentive casual player on a first try"). It only uses what the screen shows and
   * looks one step ahead, never searches:
   *   1. a car of the docked truck's colour that can leave;
   *   2. else a car that is the last thing in front of a docked-colour car (tap it to free that car);
   *   3. else a car whose colour is on one of the next HUMAN_CHIPS trucks (the chips), the soonest first;
   *   4. else any car.
   * With probability HUMAN_SLIP it taps any legal car instead (a slip / no plan). Ties are random. */
  var HUMAN_CHIPS = 3, HUMAN_SLIP = 0.12;
  function humanPick(sim, moves, rng) {
    if (rng() < HUMAN_SLIP) return moves[Math.floor(rng() * moves.length)];
    var K = sim.K, tc = sim.tc(), i, j, best = [], bestS = -1;
    var frees = null;
    for (var m = 0; m < moves.length; m++) {
      i = moves[m];
      var s;
      if (sim.col[i] === tc) s = 100;
      else {
        if (!frees) {   // cars that are the single remaining obstacle of a docked-colour car
          frees = {};
          for (j = 0; j < sim.n; j++) {
            if (sim.gone[j] || sim.col[j] !== tc) continue;
            var l = K.lock[j];
            if (l >= 0 && !sim.gone[l]) { frees[l] = 1; continue; }
            var b = K.blockers[j], left = -1, cnt = 0;
            for (var q = 0; q < b.length; q++) if (!sim.gone[b[q]]) { cnt++; left = b[q]; }
            if (cnt === 1) frees[left] = 1;
          }
        }
        if (frees[i]) s = 50;
        else {
          s = 0;
          for (var t = sim.truck + 1; t < K.trucks.length && t <= sim.truck + HUMAN_CHIPS; t++) if (K.trucks[t] === sim.col[i]) { s = 20 - (t - sim.truck); break; }
        }
      }
      if (s > bestS) { bestS = s; best = [i]; } else if (s === bestS) best.push(i);
    }
    return best[Math.floor(rng() * best.length)];
  }

  function playouts(K, rng, count, policy, st) {
    var wins = 0, branch = 0, steps = 0;
    for (var p = 0; p < count; p++) {
      var sim = new Sim(K, st || null);
      for (;;) {
        if (sim.won()) { wins++; break; }
        var moves = sim.legal();
        if (!moves.length) break;
        branch += moves.length; steps++;
        if (policy === 'human') { sim.play(humanPick(sim, moves, rng)); continue; }
        if (policy === 'greedy') {
          var tc = sim.tc(), good = moves.filter(function (i) { return sim.col[i] === tc; });
          if (good.length) moves = good;
        }
        sim.play(moves[Math.floor(rng() * moves.length)]);
      }
    }
    return { winRate: wins / count, failRate: 1 - wins / count, avgBranch: steps ? branch / steps : 0 };
  }

  /* First-try fail rate of the human proxy (the number the difficulty tiers are tuned on). `extraSlots`
   * measures the soft help (+1 arcen place). */
  function humanFail(K, seed, count, extraSlots) {
    var st = null;
    if (extraSlots) st = { gone: new Uint8Array(K.n), col: Int8Array.from(K.color0), truck: 0, fill: 0,
      waitCount: new Int16Array(K.palette.length), waitTotal: 0, slots: K.baseSlots + extraSlots };
    return playouts(K, mulberry((seed >>> 0) ^ 0x2545f491), count || 200, 'human', st).failRate;
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
    out.humanFail = humanFail(K, seed, opts.humanPlayouts || opts.playouts || 200);
    return out;
  }

  var api = { Sim: Sim, solve: solve, solvable: solvable, playouts: playouts, deadEnds: deadEnds,
    quickScore: quickScore, humanFail: humanFail, analyze: analyze, mulberry: mulberry,
    HUMAN_CHIPS: HUMAN_CHIPS, HUMAN_SLIP: HUMAN_SLIP };
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
 *   params(n, v)       -> the knobs for level n with tuning variant v
 *   difficulty(n)      -> 'facil' | 'normal' | 'dificil' | 'superdificil' (the tier schedule, cheap: no build)
 *   target(n)          -> first-try fail rate of the human proxy the level is tuned to (inside its tier band)
 *   pack(n)            -> the level pack (name, theme, destinations) a level belongs to
 *
 * Difficulty curve (Candy Crush sawtooth): see difficulty(). Every level is tuned on the solver's human proxy
 * (S.humanFail: an attentive first-try player who only uses what the screen shows) to a target fail rate inside
 * its tier band (BAND). tools/tune.js searches variants x seeds per level and freezes the pick in TABLE (2 chars
 * per level), so level(n) builds exactly one candidate at runtime. Without a table entry (endless levels, a
 * changed generator) the same search runs online with fewer playouts and stops at the first close candidate.
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
 *   4. The frozen (or searched) candidate must pass a full solver run (belt and braces; it always does).
 */
(function (root) {
  'use strict';
  var R = root.AtascoRules || (typeof require === 'function' ? require('./rules.js') : null);
  var S = root.AtascoSolver || (typeof require === 'function' ? require('./solver.js') : null);

  var GEN_VERSION = 2;
  var PER_PACK = 20;
  var EPOCH = '2026-10-26';

  // ---- tuning knobs (economy numbers live in config.js; these are level design)
  // first-try fail-rate bands of the human proxy per tier (PSYCH-PROGRESS.md shared contract)
  var BAND = { facil: [0, 0.10], normal: [0.15, 0.30], dificil: [0.45, 0.60], superdificil: [0.65, 0.80] };
  // variants the tuner picks from: [arcen places delta, share of intended exits that wait, places the line leaves free]
  var VARIANTS = [[0, 0.3, 1], [0, 0.55, 1], [0, 0.8, 1], [0, 0.3, 0], [0, 0.55, 0], [0, 0.8, 0],
    [-1, 0.3, 1], [-1, 0.55, 1], [-1, 0.8, 1], [-1, 0.3, 0], [-1, 0.55, 0], [-1, 0.8, 0]];
  // onboarding, one new thing per level: [trucks, colours, arcen places, cones, locks, longest car]
  var ONBOARD = { 1: [2, 2, 6, 0, 0, 2], 2: [3, 2, 6, 0, 0, 2], 3: [4, 2, 6, 0, 0, 2], 4: [4, 3, 6, 0, 0, 2],
    5: [5, 3, 6, 0, 0, 3], 6: [5, 3, 6, 2, 0, 3], 7: [5, 3, 5, 0, 0, 3], 8: [5, 3, 5, 0, 1, 3], 9: [6, 3, 5, 1, 0, 3] };
  // frozen tuning by tools/tune.js: 2 base-36 chars per level (variant, seed index). '..' = search online
  var TABLE = '0000005l20004b424546008b0b6i344e8l9k7h1e20428l3hab1f5g159k6a1ab85b93962810bn5i855e1a5hae8e2cb05n8k374c89a5be0l' +
    '2b2mal8i6e1kaf6jb7bb514nag0c5g171iag439l450c5782b91i6b7ca1af2j0b6ma00e248h45a25d119m91575a292226bcb91j76bb8aa95g9k7f54ae' +
    '1j3f556fa64d6jai0b98207g9l7c92555m819315299777ah7a14a5225h1g0h491b01an2c933l83bb4d427ib3ba330k4f6e3n343l1b7l2824069ka24f' +
    '494g464ab3565ca997ag4e025b18am3l3j729nb7418gbh648f0l8c889f3l0c4c9kbhad5f302k8eb62k242a0a49310hb82d8c1a3178919a4l84a4bi9d0g0hb11f8g';

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

  /* The tier schedule (Candy Crush sawtooth):
   *   1-9 facil (onboarding, ONBOARD: one new thing per level; cones on 6, locks on 8, never on a hard level),
   *   10 first dificil, then dificil every 5th until the first boss; 11, 16, 21 facil relief.
   *   From 25 on, cycles of 15: boss superdificil at 25, 40, 55... (10 + 15k); dificil at boss+5 and boss+10;
   *   facil relief at boss+1, boss+2 and right after every dificil; the rest normal, ramping inside the cycle. */
  function cyclePos(n) { return n < 25 ? n - 10 : (n - 25) % 15; }
  function difficulty(n) {
    if (n <= 9) return 'facil';
    var k = cyclePos(n);
    if (n < 25) return k % 5 === 0 ? 'dificil' : k % 5 === 1 ? 'facil' : 'normal';
    if (k === 0) return 'superdificil';
    if (k === 5 || k === 10) return 'dificil';
    if (k === 1 || k === 2 || k === 6 || k === 11) return 'facil';
    return 'normal';
  }
  function isHard(tier) { return tier === 'dificil' || tier === 'superdificil'; }
  /* Target first-try fail rate of the human proxy: inside the tier band; normals ramp inside each cycle,
   * hard levels creep up over the map. */
  function target(n, tier) {
    tier = tier || difficulty(n);
    var t = clamp((n - 1) / (COUNT - 1), 0, 1);
    if (tier === 'facil') return n <= 3 ? 0 : 0.04;
    if (tier === 'normal') return 0.17 + 0.11 * clamp((cyclePos(n) - 3) / 11, 0, 1);
    if (tier === 'dificil') return 0.48 + 0.08 * t;
    return 0.68 + 0.08 * t;
  }
  function variantsFor(tier) { return tier === 'facil' ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; }
  function seedOf(base, s) { return (base + Math.imul(s + 1, 0x9E3779B1)) >>> 0; }

  /* Board knobs for level n (o: { tier, seed, locks } overrides for the daily). Size grows with t over the
   * map; the tier adds or removes a truck; the variant v sets arcen pressure (places, waiting share, slack). */
  var TRUCK_BUMP = { facil: -1, normal: 0, dificil: 1, superdificil: 1.5 };
  var D_BUMP = { facil: -0.08, normal: 0, dificil: 0.1, superdificil: 0.16 };
  function params(n, v, o) {
    o = o || {};
    var tier = o.tier || difficulty(n), t = clamp((n - 1) / (COUNT - 20), 0, 1);
    var V = VARIANTS[v || 0], ob = o.tier ? null : ONBOARD[n];
    var d = clamp(0.04 + 0.7 * Math.pow(t, 0.8) + D_BUMP[tier] * (0.4 + 0.6 * t), 0, 1);
    var trucks, colours, slots;
    if (ob) { trucks = ob[0]; colours = ob[1]; slots = ob[2]; }
    else {
      trucks = clamp(Math.round(4.5 + 7 * Math.pow(t, 0.75) + TRUCK_BUMP[tier]), 4, 12);
      colours = n <= 20 ? 3 : n <= 40 ? 4 : n <= 75 ? 5 : n <= 120 ? 6 : 7;
      slots = tier === 'facil' ? (n <= 40 ? 6 : 5) : isHard(tier) && n > 60 ? 4 : 5;
      slots = Math.max(3, slots + V[0]);
    }
    colours = Math.min(colours, trucks);
    var cars = trucks * 3, hard = isHard(tier);
    var density = 0.5 + 0.25 * t + (hard ? 0.04 : 0);
    var cells = Math.ceil(cars * 1.9 / density);
    var cols = clamp(Math.round(Math.sqrt(cells * 0.72)), 4, 8);
    var rows = clamp(Math.ceil(cells / cols), 5, 11);
    if (rows * cols < cells) cols = clamp(Math.ceil(cells / rows), 4, 8);
    return {
      n: n, t: t, d: d, tier: tier, hard: hard, v: v || 0, trucks: trucks, colours: colours, cols: cols, rows: rows,
      slots: slots, cap: 3,
      early: V[1],                                 // share of intended exits that wait on the arcen
      slack: V[2],                                 // arcen places the intended line leaves free
      bias: 0.3 + 4 * d,                           // weight of placements that block earlier cars
      maxLen: ob ? ob[5] : 3,
      cones: ob ? ob[3] : -1,                      // -1: random amount (decided per candidate)
      locks: ob ? ob[4] : o.locks !== undefined ? o.locks : -1,
      target: target(n, tier),
      seed: o.seed !== undefined ? o.seed : hashString('atascazo:v' + GEN_VERSION + ':' + n)
    };
  }

  // ---------------------------------------------------------------- one candidate
  function place(P, rng) {
    var W = P.cols, H = P.rows, n = P.trucks * P.cap;
    var occ = new Int16Array(W * H).fill(-1);   // -1 empty, -2 cone, >=0 car (placement index)
    var cones = [];
    var nCones = P.cones >= 0 ? P.cones : Math.floor(rng() * (1 + 3 * P.t));
    for (var c = 0; c < nCones; c++) {
      var x = Math.floor(rng() * W), y = Math.floor(rng() * H);
      if (occ[y * W + x] === -1) { occ[y * W + x] = -2; cones.push([x, y]); }
    }
    var pathsThrough = [];   // cell -> placed cars whose exit path crosses it
    for (var i = 0; i < W * H; i++) pathsThrough.push([]);
    var placed = [];
    var lenW = P.d < 0.2 ? [[1, 3], [2, 5], [3, 1]] : [[1, 3], [2, 5], [3, 2]];
    if ((P.maxLen || 3) < 3) lenW = [[1, 3], [2, 5], [3, 0]];
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
    var nLocks = P.locks >= 0 ? P.locks : (rng() < 0.45 ? 1 + Math.floor(rng() * (1 + 2 * P.t)) : 0);
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

  /* One candidate for (params, seed index s); a grid too tight for the seed grows by a row (then a column). */
  function make(P, s) {
    var Pc = P;
    for (var g = 0; g < 4; g++) {
      var L = candidate(Pc, seedOf(P.seed, s));
      if (L) return L;
      Pc = Object.assign({}, Pc, { rows: Math.min(Pc.rows + 1, 12), cols: g >= 1 ? Math.min(Pc.cols + 1, 8) : Pc.cols });
    }
    return null;
  }
  function solved(L) { return S.solve(R.compile(L), null, { maxNodes: 60000 }).solved; }

  /* Online search (endless levels, the daily, a missing table entry): seeds outer, variants inner, keep the
   * candidate whose human-proxy fail rate is closest to the target; stop at the first one within `stop`. */
  function search(mkP, tier, tgt, o) {
    var vs = variantsFor(tier), best = null, bestErr = 1e9;
    for (var s = 0; s < o.seeds; s++) for (var a = 0; a < vs.length; a++) {
      var P = mkP(vs[a]), L = make(P, s);
      if (!L) continue;
      var K = R.compile(L), f = S.humanFail(K, seedOf(P.seed, s), o.playouts), err = Math.abs(f - tgt);
      if (err >= bestErr || !solved(L)) continue;
      bestErr = err; best = { L: L, v: vs[a], s: s, P: P };
      if (err <= o.stop) return best;
    }
    return best;
  }

  function finish(pick, id, packIndex) {
    var L = pick.L, P = pick.P;
    L.id = id; L.seed = P.seed; L.pack = packIndex;
    L.difficulty = P.tier; L.hard = isHard(P.tier);
    L.meta = { par: L.cars.length, tier: P.tier, target: +P.target.toFixed(3), v: pick.v, s: pick.s,
      fail: +S.humanFail(R.compile(L), seedOf(P.seed, pick.s), 100).toFixed(2) };
    return L;
  }

  var cache = {};
  function level(n) {
    if (cache[n]) return cache[n];
    var tier = difficulty(n), pick = null, code = n <= COUNT ? TABLE.substr((n - 1) * 2, 2) : '';
    if (code.length === 2 && code !== '..') {
      var v = parseInt(code[0], 36), s = parseInt(code[1], 36), P = params(n, v), L = make(P, s);
      if (L && solved(L)) pick = { L: L, v: v, s: s, P: P };
    }
    if (!pick) pick = search(function (vv) { return params(n, vv); }, tier, target(n, tier), { seeds: 12, playouts: 60, stop: 0.04 });
    if (!pick) throw new Error('level ' + n + ': no buildable candidate');
    return (cache[n] = finish(pick, 'L' + n, pack(n).index));
  }

  /* Soft dynamic help (shell): after 3+ consecutive fails the next attempt gets one extra arcen place,
   * silently. Never more than +1, so the paid "plaza extra" (+1 each, up to 3) still matters. */
  function assisted(L, fails) {
    if (!(fails >= 3) || L.daily) return L;
    var out = JSON.parse(JSON.stringify(L));
    out.slots = L.slots + 1; out.assist = 1;
    return out;
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
  /* Daily: Monday is facil, Tuesday-Thursday normal, Friday-Saturday dificil, Sunday a superdificil
   * Operación Salida. The epoch is a Monday. Same level for every player (the search is seeded). */
  var DAILY_TIER = ['facil', 'normal', 'normal', 'normal', 'dificil', 'dificil', 'superdificil'];
  function daily(date) {
    var key = 'D' + date;
    if (cache[key]) return cache[key];
    var dow = ((dayIndex(date) % 7) + 7) % 7, tier = DAILY_TIER[dow], n = 50 + dow * 20;
    var o = { tier: tier, seed: hashString('atascazo:daily:' + date), locks: dow >= 3 ? -1 : 0 };
    var pick = search(function (v) { return params(n, v, o); }, tier, target(n, tier), { seeds: 8, playouts: 60, stop: 0.05 });
    if (!pick) throw new Error('daily ' + date + ': no buildable candidate');
    var L = finish(pick, 'D' + dailyNumber(date), PACKS.length - 1);
    L.daily = { date: date, number: dailyNumber(date) };
    return (cache[key] = L);
  }

  var api = {
    GEN_VERSION: GEN_VERSION, COUNT: COUNT, PER_PACK: PER_PACK, PACKS: PACKS, EPOCH: EPOCH,
    BAND: BAND, VARIANTS: VARIANTS, TIERS: ['facil', 'normal', 'dificil', 'superdificil'],
    level: level, daily: daily, dailyNumber: dailyNumber, todayStr: todayStr, params: params, pack: pack,
    difficulty: difficulty, target: target, variantsFor: variantsFor, seedOf: seedOf, make: make, assisted: assisted,
    tableCode: function (n) { return TABLE.substr((n - 1) * 2, 2); },
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

  // ---------------------------------------------------------------- booster effects (drawn by game.js on the canvas)
  /* Tower crane seen in 2.5D: yellow lattice boom from the pivot (px, py) to the tip (tx, ty), the cable straight
   * down to the hook at (tx, hy). grip 0 = claws open, 1 = closed on a car. u = size unit (one cell). */
  function drawCrane(ctx, px, py, tx, ty, hy, grip, u) {
    var dx = tx - px, dy = ty - py, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, w = u * 0.2;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // boom shadow on the ground, then the boom: two chords + zigzag lacing
    ctx.strokeStyle = 'rgba(25,35,55,.18)'; ctx.lineWidth = w * 1.6;
    ctx.beginPath(); ctx.moveTo(px + u * 0.5, py + u * 0.9); ctx.lineTo(tx + u * 0.5, ty + u * 0.9); ctx.stroke();
    var a1 = [px + nx * w, py + ny * w], a2 = [px - nx * w, py - ny * w], b1 = [tx + nx * w * 0.6, ty + ny * w * 0.6], b2 = [tx - nx * w * 0.6, ty - ny * w * 0.6];
    ctx.strokeStyle = '#b07d00'; ctx.lineWidth = Math.max(2, u * 0.07);
    ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]);
    var seg = Math.max(3, Math.round(len / (u * 0.45)));
    for (var i = 0; i < seg; i++) {
      var f0 = i / seg, f1 = (i + 1) / seg, s0 = i % 2 ? 1 : -1;
      var w0 = w * (1 - 0.4 * f0) * s0, w1 = w * (1 - 0.4 * f1) * -s0;
      ctx.moveTo(px + dx * f0 + nx * w0, py + dy * f0 + ny * w0); ctx.lineTo(px + dx * f1 + nx * w1, py + dy * f1 + ny * w1);
    }
    ctx.stroke();
    ctx.strokeStyle = '#f2bf16'; ctx.lineWidth = Math.max(1.2, u * 0.035); ctx.stroke();
    // trolley at the tip and the cab at the pivot
    rr(ctx, tx - u * 0.18, ty - u * 0.12, u * 0.36, u * 0.24, u * 0.06); ctx.fillStyle = '#3c3f46'; ctx.fill();
    rr(ctx, px - u * 0.42, py - u * 0.32, u * 0.84, u * 0.64, u * 0.12); ctx.fillStyle = '#f2bf16'; ctx.fill();
    ctx.strokeStyle = '#b07d00'; ctx.lineWidth = 1.5; ctx.stroke();
    rr(ctx, px - u * 0.28, py - u * 0.2, u * 0.32, u * 0.26, u * 0.05); ctx.fillStyle = '#9fd3f2'; ctx.fill();
    // cable + hook block + claws
    ctx.strokeStyle = '#3c3f46'; ctx.lineWidth = Math.max(1.5, u * 0.045);
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, hy - u * 0.12); ctx.stroke();
    rr(ctx, tx - u * 0.13, hy - u * 0.2, u * 0.26, u * 0.16, u * 0.04); ctx.fillStyle = '#e8484b'; ctx.fill();
    var open = (1 - grip) * u * 0.16;
    ctx.lineWidth = Math.max(2, u * 0.06);
    ctx.beginPath();
    ctx.moveTo(tx - u * 0.08, hy - u * 0.04); ctx.quadraticCurveTo(tx - u * 0.2 - open, hy + u * 0.08, tx - u * 0.06 - open * 0.4, hy + u * 0.2);
    ctx.moveTo(tx + u * 0.08, hy - u * 0.04); ctx.quadraticCurveTo(tx + u * 0.2 + open, hy + u * 0.08, tx + u * 0.06 + open * 0.4, hy + u * 0.2);
    ctx.stroke();
    ctx.restore();
  }

  /* paint splat: an irregular blob with a few satellite drops (seeded so it does not flicker) */
  function drawSplat(ctx, x, y, r, color, seed) {
    var k = 9, a, rad;
    ctx.save(); ctx.fillStyle = color; ctx.beginPath();
    for (var i = 0; i <= k * 2; i++) {
      a = i / (k * 2) * Math.PI * 2;
      rad = r * (i % 2 ? 0.62 + 0.18 * Math.sin(seed * 7 + i * 3.1) : 0.95 + 0.25 * Math.sin(seed * 3 + i * 1.7));
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); else ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fill();
    for (i = 0; i < 4; i++) {
      a = seed * 5 + i * 1.9; rad = r * (1.25 + 0.3 * Math.sin(seed + i));
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * rad, y + Math.sin(a) * rad, r * (0.1 + 0.06 * (i % 2)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* four-point sparkle */
  function drawSparkle(ctx, x, y, r, color) {
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = color || '#fff8d0';
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.quadraticCurveTo(0, 0, 0, r); ctx.quadraticCurveTo(0, 0, -r, 0); ctx.quadraticCurveTo(0, 0, 0, -r);
    ctx.fill(); ctx.restore();
  }

  /* VHS rewind overlay: scanlines, a rolling tracking band, colour fringes and the "◀◀" badge. a = strength 0..1 */
  function drawVhs(ctx, W, H, t, a) {
    ctx.save();
    ctx.globalAlpha = 0.16 * a; ctx.fillStyle = '#0b1020';
    for (var y = (t * 60) % 3; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    var by = ((t * 1.7) % 1) * (H + 60) - 30;
    ctx.globalAlpha = 0.22 * a; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, by, W, 6 + 10 * Math.abs(Math.sin(t * 9)));
    ctx.globalAlpha = 0.1 * a; ctx.fillStyle = '#ff2a6d'; ctx.fillRect(0, 0, 3, H); ctx.fillStyle = '#05d9e8'; ctx.fillRect(W - 3, 0, 3, H);
    ctx.globalAlpha = a * (0.65 + 0.35 * (Math.floor(t * 4) % 2));
    var s = 14, x = 14, yy = H - 30;
    rr(ctx, x - 6, yy - s * 0.75, s * 3.6, s * 1.5, 6); ctx.fillStyle = 'rgba(11,16,32,.55)'; ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (var k = 0; k < 2; k++) { var ox = x + k * s * 0.95; ctx.beginPath(); ctx.moveTo(ox, yy); ctx.lineTo(ox + s, yy - s * 0.55); ctx.lineTo(ox + s, yy + s * 0.55); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }

  var api = { PALETTE: PALETTE, SIGN_BLUE: SIGN_BLUE, setPalette: setPalette, shade: shade, rr: rr, mk: mk,
    iconPath: iconPath, drawIcon: drawIcon, vehicle: vehicle, drawVehicle: drawVehicle, drawChevron: drawChevron, drawKey: drawKey, drawLock: drawLock,
    drawCone: drawCone, drawTruck: drawTruck, truckSeats: truckSeats, drawSign: drawSign, drawDeco: drawDeco,
    drawCrane: drawCrane, drawSplat: drawSplat, drawSparkle: drawSparkle, drawVhs: drawVhs };
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
 *
 * onLevelComplete's result also carries boosterAssist: { booster, movesAfter } when the win came within
 * ASSIST_MOVES car moves of the last booster, or while the truck docked at that booster was the last one
 * (the shell then calls P.boosterAssistedWin before P.finished).
 *
 * Booster effects (canvas, never touch the state: the rules apply first, the visuals follow):
 *   crane    the crane boom swings in from the top, the hook drops onto the car, the car lifts in a cloud of dust
 *            with a short slow-motion, flies to the truck / arcen and lands with a bounce
 *   shuffle  a paint wave sweeps the car park; each car takes its new colour with a splat as the wave passes
 *   slot     the new arcen bay unfolds with a hazard stripe and sparkles
 *   undo     VHS rewind: scanlines, the car reverses along its route back to its bay leaving a ghost trail
 *   prefers-reduced-motion: short cross-fades instead (no motion, no slow-motion, no scanlines).
 */
(function (root) {
  'use strict';
  var R = root.AtascoRules, S = root.AtascoSolver, A = root.AtascoArt;
  var CONTINUE_SLOTS = 2, MAX_EXTRA_SLOTS = 3, ASSIST_MOVES = 3;
  var CRANE_DUR = 1.5, CRANE_ARM = 1.8, SLOW_AT = 0.5, SLOW_LEN = 0.14, SLOW_K = 0.3, FADE = 0.32;
  var RM = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !!(RM && RM.matches); }
  var ANG = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t * t; }
  function easeOutBack(t) { var c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
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
      pop: function () { tone(880, 0.08, 'sine', 0.08, 0, 1320); },
      crane: function () { tone(90, 0.5, 'sawtooth', 0.035, 0, 160); tone(1200, 0.05, 'square', 0.03, 0.42); },
      lift: function () { tone(180, 0.35, 'triangle', 0.06, 0, 420); },
      thud: function () { tone(110, 0.12, 'sine', 0.12, 0, 60); },
      splat: function (i) { tone(520 - (i % 6) * 40, 0.07, 'triangle', 0.05, 0, 200); },
      unfold: function () { [660, 880, 1175, 1568].forEach(function (f, i) { tone(f, 0.12, 'sine', 0.06, i * 0.06); }); },
      rewind: function () { tone(1400, 0.45, 'sawtooth', 0.025, 0, 260); tone(700, 0.45, 'square', 0.015, 0.02, 130); }
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
      ended: false, offer: null, startTime: 0, settleT: 0, raf: 0, last: 0, rng: null, time: 0,
      fx: [], boost: null, reduced: null   // booster effects; last booster { id, exits, truck }; null = follow the OS
    };
    function reduced() { return G.reduced === null ? reducedMotion() : G.reduced; }

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
      G.ended = false; G.offer = null; G.crane = null; G.parts = []; G.flash = 0; G.settleT = 0; G.fx = []; G.boost = null;
      G.startTime = Date.now();
      layout();
      rebuild();
      changed();
      wake();
      return api;
    }
    function rebuild() {
      var st = G.st;
      G.cars = G.L.cars.map(function (c, i) { return { i: i, mode: 'park', target: null, x: 0, y: 0, a: 0, s: 1, anim: null, fx: null, alpha: 1, lift: 0, trail: null }; });
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
      v.trail = null; v.alpha = 1;
      var tail = Math.hypot(home(v)[0] - gate[0], home(v)[1] - gate[1]);
      var speed = Math.max(950, l.W * 2.6);
      v.mode = 'drive';
      v.anim = { kind: 'drive', path: path, gate: gate, t: 0, dur: 0.3 + (path.len + tail) / speed };
    }
    /* crane: the car anim and the boom fx start on the same frame and share the (slow-motion) clock */
    function liftAnim(v) {
      v.mode = 'drive';
      if (reduced()) { v.anim = { kind: 'fadeMove', from: [v.x, v.y, v.a, v.s], t: 0, dur: FADE * 2 }; return; }
      v.anim = { kind: 'lift', from: [v.x, v.y, v.a], t: 0, dur: CRANE_DUR, dusted: false, landed: false };
      var l = G.lay;
      G.fx.push({ kind: 'crane', car: v.i, t: 0, dur: CRANE_ARM, pivot: [l.W + l.cell * 0.4, -l.cell * 0.6] });
      sfx.crane();
    }
    /* undo: the car reverses along its route (dock -> ring road -> its bay); from = where it was drawn */
    function rewindAnim(v, from) {
      var car = G.L.cars[v.i], l = G.lay, g = l.ring, c = carCenter(v.i), e;
      if (reduced()) { v.mode = 'park'; v.anim = null; v.fx = { kind: 'fadein', t: 0, dur: FADE }; return; }
      if (car.dir === 'R') e = [g.r, c[1]]; else if (car.dir === 'L') e = [g.l, c[1]];
      else if (car.dir === 'U') e = [c[0], g.t]; else e = [c[0], g.b];
      var gate = [l.W / 2, g.t], pts = ringPath(e, gate);
      pts.unshift(c);
      pts.push(from ? [from[0], from[1]] : [gate[0], l.arcenY + l.arcenH / 2]);
      pts.reverse();
      var path = measured(smooth(pts, l.r * 0.9));
      v.mode = 'drive';
      v.anim = { kind: 'rewind', path: path, t: 0, dur: clamp(0.35 + path.len / Math.max(1400, l.W * 3.6), 0.5, 0.95), s0: from ? from[3] : 0.8 };
      v.trail = [];
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
        // crane timeline (seconds on the shared clock): boom swings in 0-.3, hook drops .3-.45, grip .45-.5,
        // lift .5-.64 (slow-motion), fly .64-1.25, drop + bounce 1.25-1.5
        var T = an.t, cell = G.lay.cell, fl = easeInOut(seg(T, 0.64, 1.25)), d = seg(T, 1.25, 1.5);
        var gx = lerp(an.from[0], h[0], fl), gy = lerp(an.from[1], h[1], fl);
        var Hc = cell * 0.55 * easeOut(seg(T, 0.5, 0.64)) + cell * 0.35 * Math.sin(Math.PI * fl), H;
        if (d <= 0) H = Hc;
        else if (d < 0.6) H = (cell * 0.55) * (1 - Math.pow(d / 0.6, 2));
        else H = cell * 0.1 * Math.sin(Math.PI * (d - 0.6) / 0.4);
        var shake = T > 0.44 && T < 0.52 ? Math.sin(T * 220) * cell * 0.03 : 0;
        v.x = gx + shake; v.y = gy - H; v.lift = H;
        v.a = angLerp(an.from[2], h[2], fl);
        var squash = d > 0.55 && d < 0.75 ? 1 - 0.08 * Math.sin(Math.PI * (d - 0.55) / 0.2) : 1;
        v.s = lerp(1, h[3], fl) * (1 + H / (cell * 3)) * squash;
        if (!an.dusted && T >= 0.5) {
          an.dusted = true; sfx.lift();
          for (var k = 0; k < 14; k++) dust(an.from[0], an.from[1], k / 14 * Math.PI * 2, cell);
          G.parts.push({ x: an.from[0], y: an.from[1], vx: 0, vy: 0, life: 0.45, max: 0.45, c: '#ffffff', r: cell * 0.4, k: 'ring' });
        }
        if (!an.landed && d >= 0.6) { an.landed = true; sfx.thud(); for (k = 0; k < 6; k++) dust(gx, gy, k / 6 * Math.PI * 2, cell * 0.6); }
      } else if (an.kind === 'fadeMove') {   // reduced motion crane: fade out in the bay, fade in at the dock
        var out = p < 0.5;
        v.x = out ? an.from[0] : h[0]; v.y = out ? an.from[1] : h[1]; v.a = out ? an.from[2] : h[2]; v.s = out ? an.from[3] : h[3];
        v.alpha = out ? 1 - p * 2 : (p - 0.5) * 2;
      } else if (an.kind === 'rewind') {
        var q2 = at(an.path, easeInOut(p) * an.path.len);
        v.x = q2[0]; v.y = q2[1]; v.a = q2[2] + Math.PI; v.s = lerp(an.s0, 1, easeOut(p));
        v.trail.push([v.x, v.y, v.a, v.s]); if (v.trail.length > 7) v.trail.shift();
        if (p >= 1) { var c0 = carCenter(v.i); v.anim = null; v.trail = null; v.mode = 'park'; v.x = c0[0]; v.y = c0[1]; v.a = ANG[G.L.cars[v.i].dir]; v.s = 1; v.fx = { kind: 'pop', t: 0, dur: 0.3 }; }
        return;
      } else if (an.kind === 'transfer') {
        var sc2 = slotCenter(an.slot), e2 = easeInOut(p);
        v.x = lerp(sc2[0], h[0], e2); v.y = lerp(sc2[1], h[1], e2) - Math.sin(e2 * Math.PI) * 18;
        v.a = angLerp(-Math.PI / 2, h[2], e2); v.s = h[3] * (1 + 0.15 * Math.sin(e2 * Math.PI));
      }
      if (p >= 1) {
        v.anim = null; v.alpha = 1; v.lift = 0;
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
      return G.fx.length > 0;
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
    function dust(x, y, a, cell) {
      var sp = cell * (1.2 + Math.random() * 1.2);
      G.parts.push({ x: x + Math.cos(a) * cell * 0.3, y: y + Math.sin(a) * cell * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6,
        life: 0.7, max: 0.7, c: 'rgba(150,130,105,', r: cell * (0.12 + Math.random() * 0.1), k: 'puff' });
    }
    function droplets(x, y, color, n, cell) {
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = cell * (1.5 + Math.random() * 2.5);
        G.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.55, max: 0.55, c: color, r: cell * (0.04 + Math.random() * 0.05), k: 'drop' });
      }
    }
    function sparkles(x, y, w, h, n) {
      for (var i = 0; i < n; i++) {
        G.parts.push({ x: x + Math.random() * w, y: y + Math.random() * h, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 40,
          life: 0.5 + Math.random() * 0.4, max: 0.9, c: i % 3 ? '#fff6b0' : '#ffffff', r: 3 + Math.random() * 4, k: 'star' });
      }
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
        if (p.k === 'puff') { p.r += 10 * dt; p.vx *= 0.93; p.vy *= 0.93; }
        if (p.k === 'drop') p.vy += 900 * dt;
        if (p.k === 'ring') p.r += 160 * dt;
        return p.life > 0;
      });
    }

    // ---------------------------------------------------------------- booster effects (visual only)
    function timeScale() {   // the crane's slow-motion beat
      for (var i = 0; i < G.fx.length; i++) {
        var f = G.fx[i];
        if (f.kind === 'crane' && f.t >= SLOW_AT && f.t < SLOW_AT + SLOW_LEN) return SLOW_K;
      }
      return 1;
    }
    function stepFx(dt) {
      G.fx = G.fx.filter(function (f) {
        f.t += dt;
        if (f.kind === 'paint') {
          var front = paintFront(f);
          f.cars.forEach(function (i, k) {
            if (f.done[i] || paintKey(i) > front) return;
            f.done[i] = 1;
            var c = carCenter(i), col = A.PALETTE[G.K.palette[G.st.col[i]]].body;
            f.splats.push({ x: c[0], y: c[1], c: col, t: 0, seed: i * 1.7 + k });
            droplets(c[0], c[1], col, 7, G.lay.cell);
            if (G.cars[i].mode === 'park') G.cars[i].fx = { kind: 'pop', t: 0, dur: 0.3 };
            if (k % 2 === 0) sfx.splat(k);
          });
          f.splats.forEach(function (s) { s.t += dt; });
        }
        if (f.kind === 'slot' && !f.sparked && f.t >= f.delay + 0.28) {
          f.sparked = true;
          var r = slotRect(f.k); sparkles(r[0], r[1], r[2], r[3], 12);
        }
        return f.t < f.dur;
      });
    }
    function paintKey(i) { var c = carCenter(i); return c[0] + (c[1] - G.lay.lotY) * 0.35; }
    function paintFront(f) {
      var l = G.lay, x0 = l.lotX - l.cell, x1 = l.lotX + l.lotW + l.lotH * 0.35 + l.cell;
      return lerp(x0, x1, easeInOut(clamp(f.t / f.sweep, 0, 1)));
    }
    function slotRect(k) { var l = G.lay; return [l.slotX + l.slotW * k + 3, l.arcenY + 5, l.slotW - 6, l.arcenH - 10]; }
    function startPaint(old, cars) {
      if (reduced()) { G.fx.push({ kind: 'fade', t: 0, dur: FADE, old: old, cars: cars }); return; }
      G.fx.push({ kind: 'paint', t: 0, dur: 1.25, sweep: 0.95, old: old, cars: cars, done: {}, splats: [] });
    }
    function craneGeom(f) {   // boom tip + hook for the crane fx, following the lifted car
      var v = G.cars[f.car], an = v.anim, l = G.lay, cell = l.cell, piv = f.pivot, T = f.t;
      var up = -Math.PI / 2 - 0.2, hook, tip;
      var from = an && an.kind === 'lift' ? an.from : [v.x, v.y];
      if (T < 0.45) {
        var tgt = [from[0], from[1] - cell * 1.7], L = Math.hypot(tgt[0] - piv[0], tgt[1] - piv[1]);
        var th1 = Math.atan2(tgt[1] - piv[1], tgt[0] - piv[0]), th = lerp(up, th1, easeOutBack(seg(T, 0, 0.3)));
        tip = [piv[0] + Math.cos(th) * L, piv[1] + Math.sin(th) * L];
        hook = [tip[0], lerp(tip[1] + cell * 0.3, from[1], easeOut(seg(T, 0.3, 0.45)))];
        f.L = L;
      } else if (T < 1.3) {
        hook = [v.x, v.y]; tip = [v.x, v.y - cell * 1.7];
        f.L = Math.hypot(tip[0] - piv[0], tip[1] - piv[1]); f.last = Math.atan2(tip[1] - piv[1], tip[0] - piv[0]);
      } else {
        var th2 = lerp(f.last || up, up, easeIn(seg(T, 1.3, f.dur)));
        tip = [piv[0] + Math.cos(th2) * f.L, piv[1] + Math.sin(th2) * f.L]; hook = [tip[0], tip[1] + cell * 0.3];
      }
      return { tip: tip, hook: hook, grip: T >= 0.45 && T < 1.3 ? 1 : 0 };
    }
    function drawFxUnder() {   // under the moving cars: splats on the lot, the paint wave, unfolding bays
      var l = G.lay;
      G.fx.forEach(function (f) {
        if (f.kind === 'paint') {
          ctx.save();
          A.rr(ctx, l.lotX - 2, l.lotY - 2, l.lotW + 4, l.lotH + 4, 6); ctx.clip();
          f.splats.forEach(function (s) {
            var a = clamp(1 - s.t / 0.9, 0, 1);
            if (a <= 0) return;
            ctx.globalAlpha = 0.55 * a; A.drawSplat(ctx, s.x, s.y, l.cell * (0.35 + 0.35 * easeOut(clamp(s.t / 0.2, 0, 1))), s.c, s.seed);
          });
          ctx.restore();
        } else if (f.kind === 'slot') {
          var r = slotRect(f.k), u = seg(f.t, f.delay, f.delay + 0.45);
          ctx.save();
          ctx.fillStyle = '#9aa1ad'; ctx.fillRect(r[0] - 3, r[1] - 3, r[2] + 6, r[3] + 6);
          if (reduced()) ctx.globalAlpha = clamp((f.t - f.delay) / FADE, 0, 1);
          var hh = reduced() ? r[3] : r[3] * clamp(easeOutBack(u), 0, 1.15);
          if (hh > 0.5) {
            A.rr(ctx, r[0], r[1], r[2], hh, 7); ctx.fillStyle = '#c7b98a'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke();
            if (!reduced() && u < 1) {   // hazard stripe on the unfolding edge
              ctx.save(); A.rr(ctx, r[0], r[1], r[2], hh, 7); ctx.clip();
              for (var sx = -r[3]; sx < r[2] + r[3]; sx += 10) {
                ctx.fillStyle = (sx / 10) % 2 ? '#2b2f36' : '#f2bf16';
                ctx.beginPath(); ctx.moveTo(r[0] + sx, r[1] + hh - 7); ctx.lineTo(r[0] + sx + 10, r[1] + hh - 7); ctx.lineTo(r[0] + sx + 4, r[1] + hh); ctx.lineTo(r[0] + sx - 6, r[1] + hh); ctx.fill();
              }
              ctx.restore();
            }
            var gl = seg(f.t, f.delay + 0.4, f.delay + 0.75);   // glint sweep
            if (!reduced() && gl > 0 && gl < 1) {
              ctx.save(); A.rr(ctx, r[0], r[1], r[2], hh, 7); ctx.clip();
              ctx.globalAlpha = 0.6 * Math.sin(Math.PI * gl); ctx.fillStyle = '#ffffff';
              ctx.translate(r[0] - r[3] + gl * (r[2] + r[3] * 2), r[1]); ctx.transform(1, 0, -0.5, 1, 0, 0); ctx.fillRect(0, 0, 8, r[3]);
              ctx.restore();
            }
          }
          ctx.restore();
        }
      });
    }
    function drawPaintBand() {   // over the parked cars: the brush band, diagonal stripes of every colour in play
      var l = G.lay;
      G.fx.forEach(function (f) {
        if (f.kind !== 'paint' || f.t / f.sweep >= 1.05) return;
        var cols = G.K.palette, bw = l.cell * 0.9, n = cols.length, x = paintFront(f);
        ctx.save();
        A.rr(ctx, l.lotX - 2, l.lotY - 2, l.lotW + 4, l.lotH + 4, 6); ctx.clip();
        ctx.translate(x, l.lotY); ctx.transform(1, 0, -0.35, 1, 0, 0);
        ctx.globalAlpha = 0.82;
        for (var k = 0; k < n; k++) { ctx.fillStyle = A.PALETTE[cols[k]].body; ctx.fillRect(-bw + k * bw / n, -l.cell, bw / n + 0.5, l.lotH + l.cell * 2); }
        ctx.globalAlpha = 0.4; ctx.fillStyle = '#ffffff'; ctx.fillRect(-bw * 0.12, -l.cell, bw * 0.07, l.lotH + l.cell * 2);
        // drips trailing behind the band
        ctx.globalAlpha = 0.7;
        for (var dd = 0; dd < 9; dd++) {
          var yy = (dd + 0.5) / 9 * l.lotH, len = l.cell * (0.2 + 0.25 * Math.abs(Math.sin(dd * 2.3 + f.t * 3)));
          ctx.fillStyle = A.PALETTE[cols[dd % n]].body;
          A.rr(ctx, -bw - len, yy - 2, len, 4, 2); ctx.fill();
        }
        ctx.restore();
      });
    }
    function drawFxOver() {   // over everything: the crane, the VHS rewind overlay
      var l = G.lay;
      G.fx.forEach(function (f) {
        if (f.kind === 'crane') {
          var gm = craneGeom(f);
          A.drawCrane(ctx, f.pivot[0], f.pivot[1], gm.tip[0], gm.tip[1], gm.hook[1], gm.grip, l.cell);
        } else if (f.kind === 'vhs') {
          A.drawVhs(ctx, l.W, l.H, f.t, clamp(1 - f.t / f.dur, 0, 1) * clamp(f.t / 0.08, 0, 1));
        }
      });
    }

    // ---------------------------------------------------------------- frame
    function frame(now) {
      G.raf = 0;
      var dt = G.last ? Math.min(0.05, (now - G.last) / 1000) : 0.016;
      G.last = now; G.time += dt;
      if (!G.L) return;
      var gdt = dt * timeScale();   // game clock: slowed during the crane's lift beat (visual only)
      G.cars.forEach(function (v) { stepCar(v, gdt); });
      stepTrucks(gdt);
      stepParts(gdt);
      stepFx(gdt);
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
      drawFxUnder();
      // parked cars
      var moving = [], docked = [];
      G.cars.forEach(function (v) {
        if (v.mode === 'park') drawCar(v); else if (v.mode === 'drive' || v.mode === 'transfer') moving.push(v); else if (v.mode !== 'gone') docked.push(v);
      });
      drawPaintBand();
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
      // particles
      G.parts.forEach(function (p) {
        var a = clamp(p.life / p.max, 0, 1);
        if (p.k === 'puff') { ctx.fillStyle = p.c + (0.35 * a) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
        else if (p.k === 'star') { ctx.globalAlpha = a; A.drawSparkle(ctx, p.x, p.y, p.r * (0.6 + 0.4 * Math.sin(p.life * 20)), p.c); ctx.globalAlpha = 1; }
        else if (p.k === 'ring') { ctx.globalAlpha = 0.7 * a; ctx.strokeStyle = p.c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
        else if (p.k === 'confetti') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, a * 2); ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); ctx.restore(); }
        else { ctx.globalAlpha = a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      });
      drawFxOver();
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
      var color = G.K.palette[G.st.col[v.i]], alpha = v.alpha, under = null;
      if (v.fx && v.fx.kind === 'fadein') alpha *= clamp(v.fx.t / v.fx.dur, 0, 1);
      if (v.mode === 'park') G.fx.forEach(function (fx) {   // repaint: old colour until the wave passes (or fades)
        if (fx.kind === 'paint' && !fx.done[v.i] && fx.cars.indexOf(v.i) >= 0) color = G.K.palette[fx.old[v.i]];
        if (fx.kind === 'fade' && fx.cars.indexOf(v.i) >= 0) under = [G.K.palette[fx.old[v.i]], clamp(1 - fx.t / fx.dur, 0, 1)];
      });
      if (v.lift > 0) {   // crane: the shadow stays on the ground under the lifted car
        ctx.save(); ctx.globalAlpha = clamp(0.35 - v.lift / (l.cell * 4), 0.08, 0.35); ctx.fillStyle = '#1a2333';
        ctx.beginPath(); ctx.ellipse(v.x, v.y + v.lift, car.len * l.cell * 0.42 * v.s, l.cell * 0.3 * v.s, v.a, 0, 7); ctx.fill(); ctx.restore();
      }
      if (v.trail && v.anim && v.anim.kind === 'rewind') {   // undo: ghost trail, cyan / magenta like a worn tape
        for (var g = 0; g < v.trail.length - 1; g++) {
          var tr = v.trail[g];
          ctx.save(); ctx.globalAlpha = 0.08 + 0.05 * g;
          A.drawVehicle(ctx, car, color, tr[0] + (g % 2 ? 3 : -3), tr[1], tr[2], tr[3], l.cell, G.dpr);
          ctx.restore();
        }
      }
      if (alpha < 1) { ctx.save(); ctx.globalAlpha = clamp(alpha, 0, 1); }
      A.drawVehicle(ctx, car, color, v.x + ox, v.y + oy, v.a + da, s, l.cell, G.dpr);
      if (under) { ctx.save(); ctx.globalAlpha = under[1]; A.drawVehicle(ctx, car, under[0], v.x + ox, v.y + oy, v.a + da, s, l.cell, G.dpr); ctx.restore(); }
      if (alpha < 1) ctx.restore();
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
        cars: G.K.n, trucks: G.K.trucks.length, timeMs: Date.now() - G.startTime, daily: G.L.daily || null,
        difficulty: G.L.difficulty || null, boosterAssist: boosterAssist()
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
          case 'slots':   // extra place / continue: each new bay unfolds (staggered), sparkles at the end
            layoutSlots(); drawBg();
            for (var nk = 0; nk < e.n; nk++) G.fx.push({ kind: 'slot', k: G.st.slots - e.n + nk, t: 0, delay: nk * 0.18, dur: (reduced() ? FADE : 0.8) + nk * 0.18 });
            sfx.unfold();
            break;
          case 'recolour':   // the paint wave (startPaint) is queued by useBooster, which knows the old colours
            if (!G.preCol) { e.cars.forEach(function (i) { G.cars[i].fx = { kind: 'pop', t: 0, dur: 0.35 }; }); sfx.pop(); }
            else { startPaint(G.preCol, e.cars.slice()); G.preCol = null; }
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
        var v = o !== undefined ? G.cars[o] : null;   // a car reversing back in (undo) is already parked in the state
        return v && (v.mode === 'park' || (v.anim && v.anim.kind === 'rewind')) ? o : -1;
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
        // state first; then the visuals: cars that come back reverse from where they were drawn
        var shown = G.cars.map(function (v) { return v.mode === 'gone' ? null : [v.x, v.y, v.a, v.s]; });
        G.st = prev;
        G.parts = []; G.fx = []; rebuild(); layoutSlots(); drawBg();
        var back = 0;
        for (var i = 0; i < G.K.n; i++) if (st.gone[i] && !prev.gone[i]) { rewindAnim(G.cars[i], shown[i]); back++; }
        if (!reduced()) { G.fx.push({ kind: 'vhs', t: 0, dur: 0.9 }); sfx.rewind(); }
        noteBooster(id);
        changed(); wake();
        return true;
      }
      if (id === 'slot') { res = R.addSlots(G.K, st, 1); st.boosters++; }
      else if (id === 'shuffle') {
        var old = st.col.slice();
        res = R.recolour(G.K, st, G.rng, function (K, s) { return S.solvable(K, s, 15000); }, 30);
        if (res.ok) { G.undo = []; G.preCol = old; }   // old snapshots carry old colours
      } else if (id === 'crane') {
        var snap = R.clone(st);
        res = R.crane(G.K, st, arg);
        if (res.ok) G.undo.push(snap);
      }
      if (!res || !res.ok) return false;
      noteBooster(id);
      apply(res);
      return true;
    }
    // the last booster, for the booster-assisted win (counted from the state after it applied)
    function noteBooster(id) { G.boost = { id: id, exits: G.st.exits, truck: G.st.truck }; }
    function boosterAssist() {
      var b = G.boost, st = G.st;
      if (!b || !st.won) return null;
      var movesAfter = st.exits - b.exits;
      if (movesAfter <= ASSIST_MOVES || b.truck >= G.K.trucks.length - 1) return { booster: b.id, movesAfter: movesAfter };
      return null;
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
        tap: tapCar,
        reduced: function (v) { if (v !== undefined) G.reduced = v; return reduced(); },   // true / false / null = OS
        fx: function () { return G.fx.map(function (f) { return f.kind; }); },
        boosterAssist: boosterAssist,
        // every visible car rests where the state says (after effects settle)
        consistent: function () {
          return G.cars.every(function (v) {
            if (v.anim) return false;
            if (v.mode === 'gone') return true;
            if (G.st.gone[v.i] !== (v.mode === 'park' ? 0 : 1)) return false;
            var h = home(v);
            return Math.abs(h[0] - v.x) < 0.5 && Math.abs(h[1] - v.y) < 0.5 && v.alpha === 1 && !v.lift;
          });
        }
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
    // economy v2 (MONETIZATION.md addendum B)
    coins: { modes: { daily: { base: 10, per100: 0 } } },

    // undo: last car back to its spot | slot: +1 arcen place | shuffle: repaint the parked cars (always to a
    // winnable deal) | crane: lift any one car out, blocked or locked
    boosters: {
      start: { undo: 2, slot: 1, shuffle: 1, crane: 1 },
      price: { undo: 200, slot: 260, shuffle: 320, crane: 380 }   // multiples of 20; coin packs are multiples of 200
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
        { id: 'cars50', metric: 'cars', target: 50, reward: { coins: 12, xp: 25 } },
        { id: 'trucks12', metric: 'trucks', target: 12, reward: { coins: 12, xp: 25 } },
        { id: 'nocrane5', metric: 'nocrane', target: 5, reward: { coins: 15, xp: 30 } },
        { id: 'levels3', metric: 'levels', target: 3, reward: { coins: 15, xp: 30 } },
        { id: 'perfect1', metric: 'perfect', target: 1, reward: { coins: 15, xp: 30 } },
        { id: 'stars6', metric: 'stars', target: 6, reward: { coins: 15, xp: 30 } },
        { id: 'daily1', metric: 'daily', target: 1, reward: { coins: 12, xp: 25 } },
        { id: 'booster1', metric: 'boosters', target: 1, reward: { coins: 8, xp: 20 } }
      ],
      weekly: [
        { id: 'w-cars400', metric: 'cars', target: 400, reward: { coins: 70, xp: 120 } },
        { id: 'w-levels15', metric: 'levels', target: 15, reward: { coins: 70, xp: 120 } },
        { id: 'w-daily5', metric: 'daily', target: 5, reward: { coins: 90, xp: 150 } },
        { id: 'w-nocrane25', metric: 'nocrane', target: 25, reward: { coins: 70, xp: 120 } },
        { id: 'w-perfect10', metric: 'perfect', target: 10, reward: { coins: 70, xp: 120 } }
      ]
    },

    pass: {
      free: function (t) { return t % 10 === 0 ? { chest: 'silver' } : t % 5 === 0 ? { boosters: { undo: 1 } } : { coins: 15 }; },
      premium: function (t) {
        return t === 30 ? { skin: 'metal' } : t % 5 === 0 ? { chest: 'gold' } : t % 3 === 0 ? { boosters: { crane: 1, slot: 1 } } : { coins: 80 };
      }
    },

    // appended to the platform products (remove_ads, coins_s/m/l, piggy_bank, pass_sNN)
    products: [
      { id: 'starter_pack', type: 'non_consumable', price: '1,99 €', offer: 'starter',
        grant: { coins: 1500, boosters: { undo: 2, slot: 2, shuffle: 2, crane: 2 }, skin: 'verano', noAdsDays: 7 } },
      // 8 boosters, worth 2,260 coins at shop prices: a bit more than coins_s (2,000) for the same 1,99 €
      { id: 'boosters_bundle', type: 'consumable', price: '1,99 €', grant: { boosters: { undo: 3, slot: 2, crane: 3 } } }
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
    levels: { difficulty: function (n) { return GEN.difficulty(n); } },   // hard-level intro popup (gamekit)
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
    meta.spec = spec;
    levelCranes = 0; failReported = false;
    $('w-rank').innerHTML = '';
    shell.show('play');
    game.start(spec);
    $('hud-n').textContent = meta.type === 'daily' ? '#' + spec.daily.number : meta.n;
    $('hud-pack').textContent = meta.type === 'daily' ? 'Operación Salida' : packOf(meta.n).name;
    var first = meta.type === 'level' && (meta.n - 1) % GEN.PER_PACK === 0;
    banner(meta.type === 'daily' ? 'Operación Salida #' + spec.daily.number : first ? packOf(meta.n).name : spec.difficulty === 'superdificil' ? '¡Súper difícil! · ' + meta.n : spec.difficulty === 'dificil' ? 'Nivel difícil · ' + meta.n : String(meta.n), meta.type === 'level' ? spec.difficulty : '');
    P.started({ mode: meta.type === 'daily' ? 'daily' : 'level', level: meta.type === 'level' ? meta.n : 0, difficulty: spec.difficulty });
  }
  // consecutive fails on a level: the platform counts them from P.finished; older platforms -> our own count
  function failsOn(n) { return P.progress.fails ? P.progress.fails(n) : ((G().fails || {})[n] || 0); }
  // soft dynamic help: from the 4th attempt after 3+ fails in a row, one extra arcen place, silently (see generator)
  function startLevel(n) {
    n = Math.max(1, n | 0);
    var fails = failsOn(n), spec = GEN.assisted(GEN.level(n), fails);
    if (spec.assist && P.track) P.track('soft_help', { level: n, fails: fails, difficulty: spec.difficulty });
    play(spec, { type: 'level', n: n });
  }
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
  function banner(text, tier) {
    var b = $('banner'); b.textContent = text; b.classList.add('show');
    b.classList.toggle('hard', tier === 'dificil'); b.classList.toggle('super', tier === 'superdificil');
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
    // a win within a few car moves of a booster (game.js decides: <= 3 cars, or the same last truck): celebrate it
    if (res.boosterAssist && P.boosterAssistedWin) {
      P.boosterAssistedWin({ booster: res.boosterAssist.booster, level: current.type === 'level' ? current.n : 0, movesAfter: res.boosterAssist.movesAfter });
    }
    if (current.type === 'level') {
      if (!P.progress.fails && G().fails) delete G().fails[current.n];
      summary = P.finished({ mode: 'level', level: current.n, won: true, stars: res.stars, score: res.movesUsed, stats: stats(res),
        difficulty: current.spec.difficulty });
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
    if (current.type === 'level') {
      if (!P.progress.fails) { var f = G().fails = G().fails || {}; f[current.n] = (f[current.n] || 0) + 1; }
      P.finished({ mode: 'level', level: current.n, won: false, score: 0, stats: stats(null), reason: st.failReason || 'stuck',
        difficulty: current.spec.difficulty });
    }
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
        var tier = GEN.difficulty(n);   // the schedule, no level build
        var cls = 'lv' + (open ? ' open' : ' locked') + (n === reached ? ' cur' : '') + ' t-' + tier +
          (tier === 'dificil' || tier === 'superdificil' ? ' hard' : '');
        var stars = '';
        for (var k = 0; k < 3; k++) stars += '<svg class="' + (k < s ? 'on' : '') + '"><use href="#i-star"/></svg>';
        cells += '<button class="' + cls + '" data-n="' + n + '" data-difficulty="' + tier + '"' + (open ? '' : ' disabled') + '>' + n +
          (open ? '<span class="st">' + stars + '</span>' : '<svg><use href="#i-lock"/></svg>') +
          (tier === 'dificil' ? '<em class="gk-dbadge hard">' + shell.ico('flame') + '</em>' : tier === 'superdificil' ? '<em class="gk-dbadge super">' + shell.gic('skull') + '</em>' : '') + '</button>';
      }
      html += '<div class="pack"><div class="sign small">' + GEN.PACKS[p].name + '<i>' + got + '/' + GEN.PER_PACK * 3 + ' ★</i></div><div class="lv-grid">' + cells + '</div></div>';
    }
    list.innerHTML = html;
    var cur = list.querySelector('.lv.cur');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }
  $('lv-list').addEventListener('click', function (e) {
    var b = e.target.closest('.lv');
    if (b && !b.disabled) { var n = +b.dataset.n; shell.levelIntro(n, function () { startLevel(n); }); }
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
