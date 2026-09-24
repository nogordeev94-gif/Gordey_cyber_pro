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
  var ENTITY_MAP = {};

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
    if (global.SattaMorphology) {
      global.SattaMorphology.buildFromDictionary(ENTRIES);
    }
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
    "покажи",
    "показать",
    "изменился",
    "изменилась",
    "сравни",
    "сравнить",
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
    if (global.SattaMorphology) {
      var hit = global.SattaMorphology.resolveForm(t);
      if (hit) return true;
    }
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

  function lookupExactToken(token) {
    var t = String(token).toLowerCase();
    var found = null;
    ENTRIES.forEach(function (entry) {
      if (found) return;
      if (entry.preferred.toLowerCase() === t) found = entry;
      (entry.synonyms || []).forEach(function (s) {
        if (String(s).toLowerCase() === t) found = entry;
      });
    });
    return found;
  }

  function canonicalForEntry(entry) {
    if (global.SattaMorphology) {
      return global.SattaMorphology.capitalizePreferred(entry.preferred);
    }
    return entry.preferred;
  }

  function replaceTokenInText(text, token, replacement) {
    var re = buildBoundaryPattern(token);
    return String(text).replace(re, replacement);
  }

  function analyzeQuery(text) {
    var tokens = tokenize(text);
    var terms = [];
    var normalized = String(text || "");
    var clarification = null;
    var unknownTerm = null;
    var seen = Object.create(null);

    tokens.forEach(function (token) {
      var lower = token.toLowerCase();
      if (seen[lower] || STOP.has(lower)) return;
      seen[lower] = true;

      if (KNOWN.has(lower) && !lookupExactToken(lower)) {
        if (!global.SattaMorphology || !global.SattaMorphology.resolveForm(lower)) {
          return;
        }
      }

      var exactEntry = lookupExactToken(lower);
      if (exactEntry) {
        terms.push({
          original: token,
          canonical: canonicalForEntry(exactEntry),
          match_type: KNOWN.has(lower) ? "exact" : "synonym",
          confidence: 1,
          entryId: exactEntry.id,
        });
        return;
      }

      if (global.SattaMorphology) {
        var morph = global.SattaMorphology.resolveForm(lower);
        if (morph) {
          terms.push({
            original: token,
            canonical: morph.canonical,
            match_type: "morphology",
            confidence: 0.98,
            entryId: morph.entryId,
          });
          if (morph.preferred.indexOf(" ") < 0) {
            normalized = replaceTokenInText(normalized, token, morph.preferred);
          }
          return;
        }
      }

      if (isLikelyTypoOfKnown(lower)) {
        return;
      }

      var suggestion = suggestForToken(lower);
      if (suggestion) {
        terms.push({
          original: token,
          canonical: suggestion.preferred,
          match_type: "fuzzy",
          confidence: suggestion.confidence,
          entryId: suggestion.entryId,
        });
        if (!clarification) {
          var sugEntry = null;
          for (var ei = 0; ei < ENTRIES.length; ei++) {
            if (ENTRIES[ei].id === suggestion.entryId) {
              sugEntry = ENTRIES[ei];
              break;
            }
          }
          var canon = canonicalForEntry(sugEntry || { preferred: suggestion.preferred });
          clarification = {
            original_term: token,
            suggested_term: canon,
            question: "Под «" + token + "» вы имеете в виду «" + canon + "»?",
            entryId: suggestion.entryId,
            confidence: suggestion.confidence,
          };
        }
        return;
      }

      if (lower.length >= 4) {
        unknownTerm = token;
        terms.push({
          original: token,
          canonical: null,
          match_type: "unknown",
          confidence: 0,
        });
      }
    });

    normalized = normalizeQuery(text);
    tokens.forEach(function (token) {
      var lower = token.toLowerCase();
      if (!global.SattaMorphology) return;
      var morph = global.SattaMorphology.resolveForm(lower);
      if (morph && morph.preferred.indexOf(" ") < 0) {
        normalized = replaceTokenInText(normalized, token, morph.preferred);
      }
    });
    normalized = normalizeQuery(normalized);

    if (clarification) {
      return {
        status: "NEEDS_CONFIRMATION",
        normalized_query: normalized,
        terms: terms,
        clarification: clarification,
      };
    }

    if (unknownTerm) {
      return {
        status: "UNKNOWN",
        normalized_query: normalized,
        terms: terms,
        clarification: {
          question:
            "Не удалось распознать термин «" +
            unknownTerm +
            "». Уточните формулировку или добавьте синоним в словарь.",
          original_term: unknownTerm,
        },
      };
    }

    var hasMorph = terms.some(function (t) {
      return t.match_type === "morphology";
    });
    return {
      status: hasMorph ? "NORMALIZED" : "MATCHED",
      normalized_query: normalized,
      terms: terms,
      clarification: null,
    };
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

  function loadEntityMap(url) {
    return fetch(url || "data/entity-map.json")
      .then(function (res) {
        return res.json();
      })
      .then(function (map) {
        ENTITY_MAP = map || {};
        return ENTITY_MAP;
      })
      .catch(function () {
        ENTITY_MAP = {};
        return ENTITY_MAP;
      });
  }

  function getMergedDictionary() {
    return mergeEntries(ENTRIES_BASE, loadCustomSynonyms());
  }

  global.SattaSynonymAgent = {
    initFromDictionary: initFromDictionary,
    normalizeQuery: normalizeQuery,
    analyzeQuery: analyzeQuery,
    loadDictionary: loadDictionary,
    loadEntityMap: loadEntityMap,
    findUnclearTerms: findUnclearTerms,
    saveCustomSynonym: saveCustomSynonym,
    canLearnSynonym: canLearnSynonym,
    getMergedDictionary: getMergedDictionary,
    loadCustomSynonyms: loadCustomSynonyms,
  };
})(typeof window !== "undefined" ? window : globalThis);
