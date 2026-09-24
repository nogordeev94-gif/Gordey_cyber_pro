(function (global) {
  var PHRASES = [];
  var ENTITY_VALUES = [];

  function capitalize(s) {
    var t = String(s || "").trim();
    if (!t) return t;
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function addPhrase(phrase, meta) {
    var p = String(phrase || "").toLowerCase().trim();
    if (!p || p.length < 2) return;
    PHRASES.push({
      phrase: p,
      length: p.length,
      canonical: meta.canonical,
      entryId: meta.entryId || null,
      entityId: meta.entityId || null,
      source: meta.source || "semantic_layer",
    });
  }

  function buildFromSemanticLayer(layer, entityMap) {
    PHRASES = [];
    ENTITY_VALUES = [
      {
        pattern: /корпоративн[а-яё]*/i,
        normalized: "Corporate",
        label: "корпоративный",
        entity: "Portfolio",
        attribute: "portfolio_type",
      },
      {
        pattern: /розничн[а-яё]*/i,
        normalized: "Retail",
        label: "розничный",
        entity: "Portfolio",
        attribute: "portfolio_type",
      },
    ];
    var entities = layer && layer.entities ? layer.entities : {};
    Object.keys(entities).forEach(function (entityId) {
      var ent = entities[entityId];
      var title = ent.title || entityId;
      var mapKey = null;
      Object.keys(entityMap || {}).forEach(function (k) {
        if (entityMap[k] === entityId) mapKey = k;
      });
      addPhrase(title.toLowerCase(), {
        canonical: capitalize(title),
        entryId: mapKey,
        entityId: entityId,
        source: "semantic_layer",
      });
      if (title.indexOf(" ") < 0) {
        addPhrase(title.toLowerCase(), {
          canonical: capitalize(title),
          entryId: mapKey,
          entityId: entityId,
          source: "semantic_layer",
        });
      }
    });
    PHRASES.sort(function (a, b) {
      return b.length - a.length;
    });
  }

  function augmentFromDictionary(entries, entityMap) {
    (entries || []).forEach(function (entry) {
      var entityId = entityMap[entry.id] || null;
      var canonical = capitalize(entry.preferred);
      addPhrase(entry.preferred.toLowerCase(), {
        canonical: canonical,
        entryId: entry.id,
        entityId: entityId,
        source: "dictionary",
      });
      (entry.synonyms || []).forEach(function (syn) {
        addPhrase(String(syn).toLowerCase(), {
          canonical: canonical,
          entryId: entry.id,
          entityId: entityId,
          source: "dictionary",
        });
      });
    });
    PHRASES.sort(function (a, b) {
      return b.length - a.length;
    });
  }

  function findPhraseSpans(text, usedMask) {
    var lower = text.toLowerCase();
    var spans = [];
    PHRASES.forEach(function (item) {
      var idx = 0;
      while (idx < lower.length) {
        var pos = lower.indexOf(item.phrase, idx);
        if (pos < 0) break;
        var end = pos + item.phrase.length;
        var before = pos === 0 ? " " : lower[pos - 1];
        var after = end >= lower.length ? " " : lower[end];
        var okBefore = !/[a-zа-яё0-9]/i.test(before);
        var okAfter = !/[a-zа-яё0-9]/i.test(after);
        if (okBefore && okAfter && !rangeUsed(usedMask, pos, end)) {
          spans.push({
            start: pos,
            end: end,
            original: text.slice(pos, end),
            phrase: item,
          });
        }
        idx = pos + 1;
      }
    });
    return spans;
  }

  function rangeUsed(mask, start, end) {
    for (var i = start; i < end; i++) {
      if (mask[i]) return true;
    }
    return false;
  }

  function markRange(mask, start, end) {
    for (var i = start; i < end; i++) mask[i] = true;
  }

  function findEntityValueSpans(text, usedMask) {
    var spans = [];
    ENTITY_VALUES.forEach(function (ev) {
      var m = text.match(ev.pattern);
      if (!m) return;
      var pos = text.search(ev.pattern);
      if (pos < 0) return;
      var end = pos + m[0].length;
      if (rangeUsed(usedMask, pos, end)) return;
      spans.push({
        start: pos,
        end: end,
        original: m[0],
        normalized: ev.label.charAt(0).toUpperCase() + ev.label.slice(1),
        type: "ENTITY_VALUE",
        meta: ev,
      });
    });
    return spans;
  }

  global.SattaOntologyIndex = {
    buildFromSemanticLayer: buildFromSemanticLayer,
    augmentFromDictionary: augmentFromDictionary,
    findPhraseSpans: findPhraseSpans,
    findEntityValueSpans: findEntityValueSpans,
    markRange: markRange,
    rangeUsed: rangeUsed,
    getPhrases: function () {
      return PHRASES;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
