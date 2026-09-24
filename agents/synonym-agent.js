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

  var ONTOLOGY_READY = false;

  function ensureOntologyIndex() {
    if (ONTOLOGY_READY || !global.SattaOntologyIndex) return Promise.resolve();
    return fetch("data/semantic-layer.json")
      .then(function (res) {
        return res.json();
      })
      .then(function (layer) {
        global.SattaOntologyIndex.buildFromSemanticLayer(layer, ENTITY_MAP);
        global.SattaOntologyIndex.augmentFromDictionary(ENTRIES, ENTITY_MAP);
        if (global.SattaMorphology) {
          global.SattaMorphology.buildFromDictionary(ENTRIES);
        }
        ONTOLOGY_READY = true;
      })
      .catch(function () {
        if (global.SattaOntologyIndex) {
          global.SattaOntologyIndex.augmentFromDictionary(ENTRIES, ENTITY_MAP);
        }
        ONTOLOGY_READY = true;
      });
  }

  function rebuildFromSegments(original, segments) {
    var sorted = segments.slice().sort(function (a, b) {
      return a.start - b.start;
    });
    var out = "";
    var pos = 0;
    sorted.forEach(function (seg) {
      out += original.slice(pos, seg.start);
      out += seg.normalizedText != null ? seg.normalizedText : seg.original;
      pos = seg.end;
    });
    out += original.slice(pos);
    return out.replace(/\s+/g, " ").trim();
  }

  function termRecord(seg) {
    return {
      original: seg.original,
      normalized: seg.normalizedText != null ? seg.normalizedText : seg.original,
      type: seg.type,
      source: seg.source || "preserved",
      match_type: seg.match_type || "none",
      confidence: seg.confidence != null ? seg.confidence : 1,
      entryId: seg.entryId || null,
      entityId: seg.entityId || null,
    };
  }

  function classifyWordToken(token, originalCase) {
    var lower = token.toLowerCase();
    if (STOP.has(lower)) {
      return {
        type: "STOPWORD",
        normalizedText: originalCase,
        source: "natural_language",
        match_type: "none",
        confidence: 1,
      };
    }

    var exactEntry = lookupExactToken(lower);
    if (exactEntry) {
      return {
        type: lower === exactEntry.preferred.toLowerCase() ? "BUSINESS_TERM" : "BUSINESS_TERM_SYNONYM",
        normalizedText: canonicalForEntry(exactEntry),
        source: "dictionary",
        match_type: "exact",
        confidence: 1,
        entryId: exactEntry.id,
      };
    }

    if (global.SattaMorphology) {
      var morph = global.SattaMorphology.resolveForm(lower);
      if (morph) {
        var rep =
          morph.preferred.indexOf(" ") < 0 ? morph.preferred : morph.canonical;
        return {
          type: "BUSINESS_TERM",
          normalizedText: morph.canonical,
          source: morph.entryId ? "dictionary" : "semantic_layer",
          match_type: "morphology",
          confidence: 0.98,
          entryId: morph.entryId,
        };
      }
    }

    var typoFix = findUnambiguousTypo(lower);
    if (typoFix) {
      return {
        type: "TYPO",
        normalizedText: typoFix.canonical,
        source: typoFix.source,
        match_type: "typo",
        confidence: typoFix.confidence,
        entryId: typoFix.entryId,
      };
    }

    var fuzzyHits = collectFuzzyMatches(lower);
    if (fuzzyHits.length === 1 && fuzzyHits[0].confidence >= 0.55) {
      return {
        type: "BUSINESS_TERM_UNKNOWN",
        normalizedText: originalCase,
        source: "semantic_layer",
        match_type: "fuzzy",
        confidence: fuzzyHits[0].confidence,
        entryId: fuzzyHits[0].entryId,
        needsConfirmation: true,
        suggested: fuzzyHits[0].canonical,
      };
    }
    if (fuzzyHits.length > 1) {
      return {
        type: "BUSINESS_TERM_UNKNOWN",
        normalizedText: originalCase,
        source: "semantic_layer",
        match_type: "ambiguous",
        confidence: fuzzyHits[0].confidence,
        needsConfirmation: true,
        ambiguous: fuzzyHits,
      };
    }

    if (lower === "капитал") {
      return {
        type: "BUSINESS_TERM_UNKNOWN",
        normalizedText: originalCase,
        source: "semantic_layer",
        match_type: "ambiguous",
        confidence: 0.5,
        needsConfirmation: true,
        ambiguous: collectCapitalCandidates(),
      };
    }

    return {
      type: lower.length >= 2 ? "UNKNOWN" : "STOPWORD",
      normalizedText: originalCase,
      source: "preserved",
      match_type: "none",
      confidence: 1,
    };
  }

  function collectCapitalCandidates() {
    var out = [];
    ENTRIES.forEach(function (entry) {
      if (entry.preferred.toLowerCase().indexOf("капитал") >= 0) {
        out.push({
          entryId: entry.id,
          canonical: canonicalForEntry(entry),
          confidence: entry.id === "economic_capital" ? 0.55 : 0.5,
        });
      }
    });
    return out;
  }

  function collectFuzzyMatches(token) {
    var suggestion = suggestForToken(token);
    var hits = [];
    if (suggestion) {
      hits.push({
        entryId: suggestion.entryId,
        canonical: canonicalForEntry({ preferred: suggestion.preferred }),
        confidence: suggestion.confidence,
      });
    }
    return hits;
  }

  function findUnambiguousTypo(token) {
    if (token.length < 5) return null;
    var best = null;
    var second = null;
    eachDictionaryWord(function (w, entry) {
      if (w.length < 5) return;
      var dist = levenshtein(token, w);
      if (dist > 2) return;
      var score = similarity(token, w);
      if (score < 0.72) return;
      var cand = {
        word: w,
        entryId: entry.id,
        canonical: canonicalForEntry(entry),
        confidence: score,
        source: "dictionary",
      };
      if (!best || cand.confidence > best.confidence) {
        second = best;
        best = cand;
      } else if (!second || cand.confidence > second.confidence) {
        second = cand;
      }
    });
    if (!best) return null;
    if (second && best.confidence - second.confidence < 0.08) return null;
    return best;
  }

  function matchExactPhrase(text) {
    var lower = String(text || "").toLowerCase().trim();
    if (!lower || !global.SattaOntologyIndex) return null;
    var hit = null;
    global.SattaOntologyIndex.getPhrases().forEach(function (item) {
      if (item.phrase === lower) hit = item;
    });
    if (!hit) return null;
    return {
      normalizedText: hit.canonical,
      type: "BUSINESS_TERM",
      source: hit.source,
      match_type: hit.source === "dictionary" ? "exact" : "semantic_layer",
      confidence: 1,
      entryId: hit.entryId,
      entityId: hit.entityId,
    };
  }

  function fuzzyPhraseFix(text) {
    var lower = text.toLowerCase();
    var best = null;
    if (!global.SattaOntologyIndex) return null;
    global.SattaOntologyIndex.getPhrases().forEach(function (item) {
      if (item.phrase.indexOf(" ") < 0) return;
      var score = similarity(lower, item.phrase);
      var minScore = item.phrase.length >= 12 ? 0.74 : 0.82;
      if (score >= minScore && (!best || score > best.score)) {
        best = { score: score, item: item };
      }
    });
    if (!best) return null;
    return {
      normalizedText: best.item.canonical,
      type: "TYPO",
      source: best.item.source,
      match_type: "typo",
      confidence: best.score,
      entryId: best.item.entryId,
      entityId: best.item.entityId,
    };
  }

  function segmentQuery(text) {
    var original = String(text || "");
    var mask = new Array(original.length);
    for (var i = 0; i < mask.length; i++) mask[i] = false;
    var segments = [];

    function pushSpan(span) {
      segments.push(span);
      if (global.SattaOntologyIndex) {
        global.SattaOntologyIndex.markRange(mask, span.start, span.end);
      } else {
        for (var j = span.start; j < span.end; j++) mask[j] = true;
      }
    }

    if (global.SattaDateParser) {
      global.SattaDateParser.extractTemporal(original).forEach(function (t) {
        pushSpan({
          start: t.start,
          end: t.end,
          original: t.original,
          normalizedText: t.normalized,
          type: t.type,
          source: "date_parser",
          match_type: "exact",
          confidence: 1,
        });
      });
    }

    if (global.SattaOntologyIndex) {
      global.SattaOntologyIndex.findEntityValueSpans(original, mask).forEach(function (ev) {
        pushSpan({
          start: ev.start,
          end: ev.end,
          original: ev.original,
          normalizedText: ev.normalized,
          type: ev.type,
          source: "semantic_layer",
          match_type: "entity_value",
          confidence: 1,
          meta: ev.meta,
        });
      });

      var phraseSpans = global.SattaOntologyIndex.findPhraseSpans(original, mask);
      phraseSpans.sort(function (a, b) {
        return b.end - b.start - (a.end - a.start) || a.start - b.start;
      });
      phraseSpans.forEach(function (ps) {
        if (global.SattaOntologyIndex.rangeUsed(mask, ps.start, ps.end)) return;
        pushSpan({
          start: ps.start,
          end: ps.end,
          original: ps.original,
          normalizedText: ps.phrase.canonical,
          type: ps.phrase.source === "dictionary" ? "BUSINESS_TERM" : "BUSINESS_TERM",
          source: ps.phrase.source,
          match_type: ps.phrase.source === "dictionary" ? "exact" : "semantic_layer",
          confidence: 1,
          entryId: ps.phrase.entryId,
          entityId: ps.phrase.entityId,
        });
      });
    }

    var pos = 0;
    while (pos < original.length) {
      if (mask[pos]) {
        pos++;
        continue;
      }
      var ch = original[pos];
      if (/\s/.test(ch)) {
        var ws = pos;
        while (pos < original.length && /\s/.test(original[pos])) pos++;
        segments.push({
          start: ws,
          end: pos,
          original: original.slice(ws, pos),
          normalizedText: original.slice(ws, pos),
          type: "STOPWORD",
          source: "natural_language",
          match_type: "none",
          confidence: 1,
        });
        continue;
      }
      var gapStart = pos;
      while (pos < original.length && !mask[pos]) pos++;
      var gapSlice = original.slice(gapStart, pos);
      var gapTrim = gapSlice.trim();
      if (!gapTrim) continue;
      var trimOffset = gapSlice.indexOf(gapTrim);
      var contentStart = gapStart + (trimOffset >= 0 ? trimOffset : 0);
      var contentEnd = contentStart + gapTrim.length;

      var words = gapTrim.split(/\s+/).filter(Boolean);
      var wi = 0;
      var cursor = contentStart;
      while (wi < words.length) {
        var merged = null;
        var mergedLen = 0;
        for (var wj = words.length; wj > wi; wj--) {
          var phraseText = words.slice(wi, wj).join(" ");
          var phraseTry = fuzzyPhraseFix(phraseText) || matchExactPhrase(phraseText);
          if (phraseTry) {
            merged = phraseTry;
            mergedLen = wj - wi;
            break;
          }
        }
        if (merged) {
          var phraseText2 = words.slice(wi, wi + mergedLen).join(" ");
          var pStart = original.indexOf(phraseText2, cursor);
          if (pStart < 0) pStart = cursor;
          var pEnd = pStart + phraseText2.length;
          cursor = pEnd;
          pushSpan({
            start: pStart,
            end: pEnd,
            original: phraseText2,
            normalizedText: merged.normalizedText,
            type: merged.type || "BUSINESS_TERM",
            source: merged.source,
            match_type: merged.match_type,
            confidence: merged.confidence,
            entryId: merged.entryId,
            entityId: merged.entityId,
          });
          wi += mergedLen;
          continue;
        }

        var part = words[wi];
        wi++;
        var pStart = original.indexOf(part, cursor);
        if (pStart < 0) pStart = cursor;
        var pEnd = pStart + part.length;
        cursor = pEnd;
        if (/^[^a-zA-Zа-яёА-ЯЁ0-9]+$/.test(part)) {
          segments.push({
            start: pStart,
            end: pEnd,
            original: part,
            normalizedText: part,
            type: "STOPWORD",
            source: "natural_language",
            match_type: "none",
            confidence: 1,
          });
          continue;
        }
        var cls = classifyWordToken(part, part);
        segments.push({
          start: pStart,
          end: pEnd,
          original: part,
          normalizedText: cls.needsConfirmation ? part : cls.normalizedText,
          type: cls.type,
          source: cls.source,
          match_type: cls.match_type,
          confidence: cls.confidence,
          entryId: cls.entryId,
          needsConfirmation: cls.needsConfirmation,
          suggested: cls.suggested,
          ambiguous: cls.ambiguous,
        });
      }
      continue;
    }

    return segments.sort(function (a, b) {
      return a.start - b.start;
    });
  }

  function analyzeQuery(text) {
    var original = String(text || "");
    var segments = segmentQuery(original);
    var terms = [];
    var unknownTerms = [];
    var clarification = null;

    segments.forEach(function (seg) {
      if (
        seg.type === "STOPWORD" ||
        seg.type === "UNKNOWN" ||
        seg.original.trim().length <= 1
      ) {
        if (seg.type === "UNKNOWN") unknownTerms.push(seg.original);
        return;
      }
      terms.push(termRecord(seg));

      if (seg.needsConfirmation && !clarification) {
        if (seg.ambiguous && seg.ambiguous.length > 1) {
          var opts = seg.ambiguous
            .slice(0, 3)
            .map(function (o) {
              return o.canonical;
            })
            .join("», «");
          clarification = {
            original_term: seg.original,
            suggested_term: seg.ambiguous[0].canonical,
            question:
              "Термин «" +
              seg.original +
              "» неоднозначен. Вы имеете в виду «" +
              opts +
              "»?",
            entryId: seg.ambiguous[0].entryId,
            confidence: seg.ambiguous[0].confidence,
          };
        } else {
          clarification = {
            original_term: seg.original,
            suggested_term: seg.suggested,
            question:
              "Под «" +
              seg.original +
              "» вы имеете в виду «" +
              seg.suggested +
              "»?",
            entryId: seg.entryId,
            confidence: seg.confidence,
          };
        }
      }
    });

    var normalizedSegments = segments.map(function (seg) {
      if (seg.needsConfirmation) {
        return Object.assign({}, seg, { normalizedText: seg.original });
      }
      return seg;
    });

    var normalized_query = rebuildFromSegments(original, normalizedSegments);
    var hasTypoOrMorph = terms.some(function (t) {
      return t.match_type === "typo" || t.match_type === "morphology";
    });

    var extracted_attributes = global.SattaAttributeBridge
      ? global.SattaAttributeBridge.fromSynonymResult({ terms: terms })
      : null;

    var result = {
      original_query: original,
      normalized_query: normalized_query,
      terms: terms,
      extracted_attributes: extracted_attributes,
      unknown_terms: unknownTerms,
      clarification_required: !!clarification,
      clarification: clarification,
      status: clarification
        ? "NEEDS_CONFIRMATION"
        : hasTypoOrMorph
          ? "NORMALIZED"
          : "MATCHED",
    };
    return result;
  }

  function analyzeQueryAsync(text) {
    return ensureOntologyIndex().then(function () {
      return analyzeQuery(text);
    });
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
    if (isMorphologicalVariant(token)) return null;
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
    return best;
  }

  function findUnclearTerms(text) {
    var analysis = analyzeQuery(text);
    if (!analysis.clarification) return [];
    return [
      {
        term: analysis.clarification.original_term,
        preferred: analysis.clarification.suggested_term,
        entryId: analysis.clarification.entryId,
        confidence: analysis.clarification.confidence || 0.8,
      },
    ];
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
        ONTOLOGY_READY = false;
        return loadEntityMap("data/entity-map.json").then(function () {
          return ensureOntologyIndex().then(function () {
            return merged;
          });
        });
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
    analyzeQueryAsync: analyzeQueryAsync,
    segmentQuery: segmentQuery,
    loadDictionary: loadDictionary,
    loadEntityMap: loadEntityMap,
    findUnclearTerms: findUnclearTerms,
    saveCustomSynonym: saveCustomSynonym,
    canLearnSynonym: canLearnSynonym,
    getMergedDictionary: getMergedDictionary,
    loadCustomSynonyms: loadCustomSynonyms,
  };
})(typeof window !== "undefined" ? window : globalThis);
