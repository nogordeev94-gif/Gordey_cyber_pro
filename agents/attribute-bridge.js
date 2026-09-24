(function (global) {
  function fromSynonymResult(synonymResult) {
    var terms = (synonymResult && synonymResult.terms) || [];
    var attrs = {
      dates: [],
      periods: [],
      entity_values: [],
      business_terms: [],
      metrics: [],
    };
    terms.forEach(function (t) {
      if (t.type === "DATE") {
        attrs.dates.push({ original: t.original, iso: t.normalized });
      } else if (t.type === "PERIOD") {
        attrs.periods.push({ original: t.original, normalized: t.normalized });
      } else if (t.type === "ENTITY_VALUE") {
        attrs.entity_values.push({
          original: t.original,
          normalized: t.normalized,
          entityId: t.entityId,
        });
      } else if (
        t.type === "BUSINESS_TERM" ||
        t.type === "BUSINESS_TERM_SYNONYM" ||
        t.type === "TYPO"
      ) {
        attrs.business_terms.push({
          original: t.original,
          normalized: t.normalized,
          entryId: t.entryId,
          entityId: t.entityId,
        });
        if (t.entryId === "economic_capital") {
          attrs.metrics.push({ original: t.original, normalized: t.normalized });
        }
      }
    });
    return attrs;
  }

  function timeFromAttributes(attrs) {
    if (!attrs) return null;
    if (attrs.dates && attrs.dates.length) {
      var d = attrs.dates[attrs.dates.length - 1].iso;
      return { type: "as_of", from: d, to: d, label: d };
    }
    if (attrs.periods && attrs.periods.length) {
      var p = attrs.periods[0].normalized;
      if (p.indexOf("..") >= 0) {
        var parts = p.split("..");
        return {
          type: "period",
          from: parts[0],
          to: parts[1],
          label: attrs.periods[0].original,
        };
      }
    }
    return null;
  }

  function summarize(attrs) {
    if (!attrs) return {};
    return {
      calculation_dates: (attrs.dates || []).map(function (d) {
        return d.iso;
      }),
      periods: (attrs.periods || []).map(function (p) {
        return p.normalized;
      }),
      portfolios: (attrs.entity_values || []).map(function (v) {
        return v.normalized;
      }),
      metrics: (attrs.metrics || []).map(function (m) {
        return m.normalized;
      }),
    };
  }

  global.SattaAttributeBridge = {
    fromSynonymResult: fromSynonymResult,
    timeFromAttributes: timeFromAttributes,
    summarize: summarize,
  };
})(typeof window !== "undefined" ? window : globalThis);
