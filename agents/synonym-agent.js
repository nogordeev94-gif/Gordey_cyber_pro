/**
 * Агент синонимов: нормализация, угадывание неясных терминов, расширение словаря.
 */
(function (global) {
  var RULES = [];
  var ENTRIES = [];
  var KNOWN = new Set();
  var CUSTOM_KEY = "satta:custom-synonyms";

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildBoundaryPattern(term) {
    var t = escapeRegExp(term);
    if (/^[a-z0-9 .-]+$/i.test(term)) {
      return new RegExp("(?<![\\w])" + t + "(?![\\w])", "gi");
    }
    return new RegExp("(?<![а-яёa-z0-9])" + t + "(?![а-яёa-z0-9])", "gi");
  }

  function levenshtein(a, b) {
    var m = a.length;
    var n = b.length;
    if (!m) return n;
    if (!n) return m;
    var dp = new Array(n + 1);
    for (var j = 0; j <= n; j++) dp[j] = j;
    for (var i = 1; i <= m; i++) {
      var prev = dp[0];
      dp[0] = i;
      for (var k = 1; k <= n; k++) {
        var tmp = dp[k];
        var cost = a[i - 1] === b[k - 1] ? 0 : 1;
        dp[k] = Math.min(dp[k] + 1, dp[k - 1] + 1, prev + cost);
        prev = tmp;
      }
    }
    return dp[n];
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    var dist = levenshtein(a, b);
    return 1 - dist / Math.max(a.length, b.length);
  }

  function loadCustomSynonyms() {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveCustomSynonym(entryId, term) {
    var t = String(term).trim().toLowerCase();
    if (!t || !canLearnSynonym(t)) return false;
    var custom = loadCustomSynonyms();
    var list = custom[entryId] || [];
    if (list.indexOf(t) === -1) list.push(t);
    custom[entryId] = list;
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
    rebuildFromEntries(mergeEntries(ENTRIES_BASE, custom));
    return true;
  }

  var ENTRIES_BASE = [];

  function mergeEntries(base, custom) {
    return (base || []).map(function (entry) {
      var extra = custom[entry.id] || [];
      var merged = entry.synonyms.slice();
      extra.forEach(function (syn) {
        if (merged.indexOf(syn) === -1) merged.push(syn);
      });
      return {
        id: entry.id,
        category: entry.category,
        preferred: entry.preferred,
        synonyms: merged,
      };
    });
  }

  function rebuildKnown(entries) {
    KNOWN = new Set();
    entries.forEach(function (entry) {
      KNOWN.add(entry.preferred.toLowerCase());
      entry.synonyms.forEach(function (s) {
        KNOWN.add(String(s).toLowerCase());
      });
      entry.preferred
        .toLowerCase()
        .split(/\s+/)
        .forEach(function (w) {
          if (w.length > 2) KNOWN.add(w);
        });
    });
  }

  function initFromDictionary(entries) {
    ENTRIES = entries || [];
    rebuildKnown(ENTRIES);
    RULES = [];
    ENTRIES.forEach(function (entry) {
      var preferred = entry.preferred;
      (entry.synonyms || []).forEach(function (syn) {
        var s = String(syn).trim();
        if (!s) return;
        if (s.toLowerCase() === preferred.toLowerCase()) return;
        RULES.push({
          from: s,
          to: preferred,
          pattern: buildBoundaryPattern(s),
        });
      });
    });
    RULES.sort(function (a, b) {
      return b.from.length - a.from.length;
    });
  }

  function rebuildFromEntries(entries) {
    initFromDictionary(entries);
  }

  function normalizeQuery(text) {
    var result = String(text || "");
    RULES.forEach(function (rule) {
      result = result.replace(rule.pattern, rule.to);
    });
    return result;
  }

  function tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .match(/[a-zа-яё0-9][a-zа-яё0-9.-]*/gi) || [];
  }

  var STOP = new Set([
    "и",
    "в",
    "на",
    "по",
    "за",
    "как",
    "что",
    "где",
    "какой",
    "какая",
    "какие",
    "какое",
    "сколько",
    "почему",
    "есть",
    "ли",
    "the",
    "a",
    "an",
    "is",
    "for",
    "to",
    "of",
  ]);

  function abbreviationsForPreferred(preferred) {
    var words = preferred.toLowerCase().split(/\s+/).filter(Boolean);
    var out = [];
    if (!words.length) return out;
    out.push(words.map(function (w) {
      return w[0];
    }).join(""));
    out.push(words.map(function (w) {
      return w.slice(0, 2);
    }).join(""));
    out.push(words.map(function (w) {
      return w.slice(0, 3);
    }).join(""));
    out.push(preferred.toLowerCase().replace(/\s+/g, ""));
    if (words.length >= 2) {
      var w0 = words[0].replace(/[ьъ]/g, "");
      var w1 = words[1];
      if (w0.length >= 2 && w1.length >= 3) {
        var slang = w0.slice(0, 2) + w1.slice(1, 3);
        out.push(slang);
        if (w0[0] === "э") {
          out.push("е" + slang.slice(1));
        }
      }
    }
    return out;
  }

  function eachDictionaryWord(fn) {
    ENTRIES.forEach(function (entry) {
      function scan(text) {
        String(text || "")
          .toLowerCase()
          .split(/\s+/)
          .forEach(function (w) {
            w = w.replace(/[.,]/g, "");
            if (w) fn(w, entry);
          });
      }
      scan(entry.preferred);
      (entry.synonyms || []).forEach(scan);
    });
  }

  function isMorphologicalVariant(token) {
    var t = String(token).toLowerCase();
    var found = false;
    eachDictionaryWord(function (w) {
      if (found || w.length < 4) return;
      var stem = w.slice(0, w.length - 1);
      if (t === w) {
        found = true;
        return;
      }
      if (t.length >= stem.length && t.indexOf(stem) === 0 && t.length <= w.length + 3) {
        found = true;
      }
    });
    return found;
  }

  function isLikelyTypoOfKnown(token) {
    var t = String(token).toLowerCase();
    if (t.length < 5) return false;
    var hit = false;
    eachDictionaryWord(function (w) {
      if (hit || w.length < 5) return;
      if (levenshtein(t, w) <= 2 && similarity(t, w) >= 0.72) hit = true;
    });
    return hit;
  }

  function canLearnSynonym(term) {
    var t = String(term).trim().toLowerCase();
    if (!t) return false;
    if (isMorphologicalVariant(t)) return false;
    if (isLikelyTypoOfKnown(t)) return false;
    return true;
  }

  function isKnownToken(token) {
    if (STOP.has(token)) return true;
    if (token.length < 2) return true;
    if (KNOWN.has(token)) return true;
    if (isMorphologicalVariant(token)) return true;
    if (isLikelyTypoOfKnown(token)) return true;
    return false;
  }

  function clarifyScore(suggestion) {
    var entry = null;
    for (var i = 0; i < ENTRIES.length; i++) {
      if (ENTRIES[i].id === suggestion.entryId) {
        entry = ENTRIES[i];
        break;
      }
    }
    var score = suggestion.confidence;
    if (entry && entry.category === "метрика") score += 0.2;
    if (suggestion.term.length <= 6) score += 0.08;
    if (suggestion.entryId === "economic_capital") score += 0.12;
    return score;
  }

  function suggestForToken(token) {
    var best = null;
    ENTRIES.forEach(function (entry) {
      var pref = entry.preferred.toLowerCase();
      var candidates = abbreviationsForPreferred(pref).concat([pref, pref.replace(/\s+/g, "")]);
      (entry.synonyms || []).forEach(function (s) {
        candidates.push(String(s).toLowerCase());
      });

      candidates.forEach(function (cand) {
        if (!cand || cand.length < 2) return;
        var score = similarity(token, cand);
        if (token.length >= 3 && cand.indexOf(token) >= 0) score = Math.max(score, 0.82);
        if (cand.indexOf(token) >= 0 && token.length >= 3) score = Math.max(score, 0.78);
        if (
          token.length >= 3 &&
          token.length <= 6 &&
          cand.length >= 3 &&
          cand.length <= 6 &&
          entry.category === "метрика"
        ) {
          score = Math.max(score, similarity(token, cand) + 0.05);
        }
        score = Math.min(1, score);
        if (!best || score > best.confidence) {
          best = {
            term: token,
            entryId: entry.id,
            preferred: entry.preferred,
            confidence: score,
            matchedVariant: cand,
          };
        }
      });
    });

    if (!best || best.confidence < 0.55) return null;
    if (isMorphologicalVariant(token) || isLikelyTypoOfKnown(token)) return null;
    return best;
  }

  function findUnclearTerms(text) {
    var tokens = tokenize(text);
    var seen = new Set();
    var out = [];

    tokens.forEach(function (token) {
      if (seen.has(token) || isKnownToken(token)) return;
      seen.add(token);
      var suggestion = suggestForToken(token);
      if (suggestion) out.push(suggestion);
    });

    return out.sort(function (a, b) {
      return clarifyScore(b) - clarifyScore(a);
    });
  }

  function loadDictionary(url) {
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("synonyms load failed");
        return res.json();
      })
      .then(function (data) {
        ENTRIES_BASE = data;
        var merged = mergeEntries(data, loadCustomSynonyms());
        initFromDictionary(merged);
        return merged;
      });
  }

  function getMergedDictionary() {
    return mergeEntries(ENTRIES_BASE, loadCustomSynonyms());
  }

  global.SattaSynonymAgent = {
    initFromDictionary: initFromDictionary,
    normalizeQuery: normalizeQuery,
    loadDictionary: loadDictionary,
    findUnclearTerms: findUnclearTerms,
    saveCustomSynonym: saveCustomSynonym,
    canLearnSynonym: canLearnSynonym,
    getMergedDictionary: getMergedDictionary,
    loadCustomSynonyms: loadCustomSynonyms,
  };
})(typeof window !== "undefined" ? window : globalThis);
