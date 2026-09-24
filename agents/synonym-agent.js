/**
 * Агент нормализации: заменяет синонимы на предпочтительные термины.
 */
(function (global) {
  var RULES = [];

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

  function initFromDictionary(entries) {
    RULES = [];
    (entries || []).forEach(function (entry) {
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

  function normalizeQuery(text) {
    var result = String(text || "");
    RULES.forEach(function (rule) {
      result = result.replace(rule.pattern, rule.to);
    });
    return result;
  }

  function loadDictionary(url) {
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("synonyms load failed");
        return res.json();
      })
      .then(function (data) {
        initFromDictionary(data);
        return data;
      });
  }

  global.SattaSynonymAgent = {
    initFromDictionary: initFromDictionary,
    normalizeQuery: normalizeQuery,
    loadDictionary: loadDictionary,
  };
})(typeof window !== "undefined" ? window : globalThis);
