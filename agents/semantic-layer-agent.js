(function (global) {
  var LAYER = null;

  function load(baseUrl) {
    baseUrl = baseUrl || "data/";
    return fetch(baseUrl + "semantic-layer.json").then(function (r) {
      return r.json();
    }).then(function (data) {
      LAYER = data;
      return LAYER;
    });
  }

  function lower(text) {
    return String(text || "").toLowerCase();
  }

  function hasEc(text) {
    var t = lower(text);
    if (
      t.indexOf("экономический капитал") >= 0 ||
      t.indexOf("economic capital") >= 0 ||
      t.indexOf("екап") >= 0 ||
      t.indexOf("экап") >= 0
    ) {
      return true;
    }
    return /(?:^|[\s,.(«"'])эк(?:$|[\s,.?;:»"')])/i.test(t);
  }

  function uniq(arr) {
    var s = Object.create(null);
    var out = [];
    (arr || []).forEach(function (x) {
      if (x && !s[x]) {
        s[x] = true;
        out.push(x);
      }
    });
    return out;
  }

  function entityMeta(entityId) {
    var ent = LAYER && LAYER.entities && LAYER.entities[entityId];
    return ent && ent.attribute_meta ? ent.attribute_meta : {};
  }

  function entityRequiredAttributes(entityId) {
    var meta = entityMeta(entityId);
    var out = [];
    Object.keys(meta).forEach(function (key) {
      if (meta[key].required) out.push(key);
    });
    return out;
  }

  function operationRequiredInputs(operation) {
    var map = (LAYER && LAYER.operation_inputs) || {};
    return map[operation] || map.get_value || [];
  }

  function mergedRequired(entityId, operation) {
    return uniq(entityRequiredAttributes(entityId).concat(operationRequiredInputs(operation)));
  }

  function attrQuestion(entityId, attrId) {
    var meta = entityMeta(entityId)[attrId];
    if (!meta) return "Уточните параметр «" + attrId + "».";
    var q = meta.question;
    if (meta.allowed_values && meta.allowed_values.length) {
      var opts = meta.allowed_values.map(function (v) {
        return "• " + (v.labels[0] || v.id);
      });
      return q + "\n\n" + opts.join("\n");
    }
    return q;
  }

  function parseEnumAttr(attrId, text, entityId) {
    var meta = entityMeta(entityId)[attrId];
    if (!meta || !meta.allowed_values) return null;
    var t = lower(text).trim();
    var hit = null;
    meta.allowed_values.forEach(function (v) {
      (v.labels || []).forEach(function (label) {
        if (t.indexOf(lower(label)) >= 0) hit = v.id;
      });
      if (t === v.id) hit = v.id;
    });
    return hit;
  }

  function parseClarificationValue(attrId, text, entityId) {
    entityId = entityId || "EconomicCapital";
    var t = String(text || "").trim();
    if (!t) return null;

    if (attrId === "as_of_date") {
      if (global.SattaDateParser) {
        var dates = global.SattaDateParser.findDates(t);
        if (dates.length) return dates[0].normalized;
      }
      return null;
    }

    if (attrId === "period_range" || attrId === "period") {
      if (global.SattaDateParser) {
        var periods = global.SattaDateParser.findPeriods(t);
        if (periods.length) return periods[0].normalized;
      }
      return null;
    }

    var enumVal = parseEnumAttr(attrId, t, entityId);
    if (enumVal) return enumVal;

    return null;
  }

  function extractTimeFromSynonym(synonymContext) {
    var out = {};
    var attrs = synonymContext && synonymContext.extracted_attributes;
    if (!attrs) return out;
    if (attrs.dates && attrs.dates.length) {
      out.as_of_date = attrs.dates[attrs.dates.length - 1].iso;
    }
    if (attrs.periods && attrs.periods.length) {
      out.period_range = attrs.periods[0].normalized;
    }
    return out;
  }

  function extractBusinessTermsFromSynonym(synonymContext, entityId) {
    var out = {};
    var attrs = synonymContext && synonymContext.extracted_attributes;
    if (!attrs || !attrs.business_terms) return out;
    attrs.business_terms.forEach(function (term) {
      var source = term.original || term.normalized || "";
      if (term.entryId === "scenario" || term.entityId === "Scenario") {
        var scen = parseEnumAttr("scenario", source, entityId);
        if (scen) out.scenario = scen;
      }
      if (
        term.entryId === "calculation_snapshot" ||
        term.entityId === "CalculationSnapshot"
      ) {
        var snap = parseEnumAttr("calculation_snapshot", source, entityId);
        if (snap) out.calculation_snapshot = snap;
      }
    });
    return out;
  }

  function extractFiltersFromText(text, entityId) {
    var filters = {};
    var t = lower(text);

    if (global.SattaDateParser) {
      var dates = global.SattaDateParser.findDates(text);
      if (dates.length) filters.as_of_date = dates[dates.length - 1].normalized;
      var periods = global.SattaDateParser.findPeriods(text);
      if (periods.length && !filters.as_of_date) filters.period_range = periods[0].normalized;
    }

    ["calculation_snapshot", "scenario"].forEach(function (attr) {
      var v = parseEnumAttr(attr, t, entityId);
      if (v) filters[attr] = v;
    });

    if (t.indexOf("последн") >= 0 && t.indexOf("срез") >= 0) {
      filters.calculation_snapshot = "latest";
    }
    if (t.indexOf("базов") >= 0 && (t.indexOf("сценар") >= 0 || t.indexOf("сценари") >= 0)) {
      filters.scenario = "base";
    }

    return filters;
  }

  function detectDimensions(text) {
    var dims = [];
    var t = lower(text);
    (LAYER.dimension_phrases || []).forEach(function (row) {
      var hit = (row.patterns || []).some(function (p) {
        return new RegExp(p, "i").test(t);
      });
      if (hit) dims.push(row.dimension);
    });
    return uniq(dims);
  }

  function detectOperation(text, dimensions) {
    var t = lower(text);
    var ops = [];
    (LAYER.intents || []).forEach(function (intent) {
      var hit = (intent.patterns || []).some(function (p) {
        return t.indexOf(p) >= 0 || new RegExp(p, "i").test(t);
      });
      if (hit) ops.push(intent.operation);
    });
    if (t.indexOf("почему") >= 0 || t.indexOf("вырос") >= 0) {
      return "explain_change";
    }
    if (t.indexOf("сравни") >= 0 && t.indexOf("портфел") >= 0) {
      return "compare_portfolios";
    }
    if (dimensions.length) return "aggregate";
    if (t.indexOf("изменил") >= 0) return "analyze_dynamics";
    return ops[0] || "get_value";
  }

  function buildChecklist(entityId, required, filters) {
    var meta = entityMeta(entityId);
    return required.map(function (id) {
      var m = meta[id] || { label: id };
      var val = filters[id];
      return {
        id: id,
        label: m.label || id,
        filled: val != null && val !== "",
        value: val != null ? val : null,
      };
    });
  }

  function pickNextMissing(missing, entityId) {
    var seq = (LAYER && LAYER.clarify_sequence) || [];
    var meta = entityMeta(entityId);
    var ordered = seq.filter(function (id) {
      return missing.indexOf(id) >= 0;
    });
    if (ordered.length) return ordered[0];
    missing.sort(function (a, b) {
      return (meta[a] && meta[a].clarify_order) - (meta[b] && meta[b].clarify_order);
    });
    return missing[0];
  }

  function buildSemanticQuery(entity, operation, metric, dimensions, filters, time) {
    return {
      entity: entity,
      operation: operation,
      metric: metric,
      dimensions: dimensions,
      filters: filters,
      time: time || {},
    };
  }

  function analyze(normalizedQuery, synonymContext, dialogState) {
    synonymContext = synonymContext || {};
    dialogState = dialogState || {};
    var text = String(normalizedQuery || "");
    var entity = dialogState.entity || "EconomicCapital";
    var metric = dialogState.metric || "economic_capital";

    if (!hasEc(text) && !dialogState.active) {
      if (lower(text).indexOf("капитал") >= 0) {
        return {
          status: "AMBIGUOUS",
          entity: entity,
          metric: metric,
          clarification: {
            required: true,
            attribute: "metric",
            question: "Вы имеете в виду «Экономический капитал»?",
          },
        };
      }
      return {
        status: "UNSUPPORTED",
        entity: null,
        metric: metric,
        clarification: {
          required: true,
          attribute: null,
          question: "Запрос не относится к Economic Capital в текущей модели Semantic Layer.",
        },
      };
    }

    var dimensions = uniq((dialogState.dimensions || []).concat(detectDimensions(text)));
    var operation = dialogState.operation || detectOperation(text, dimensions);

    var filters = Object.assign(
      {},
      extractFiltersFromText(text, entity),
      extractTimeFromSynonym(synonymContext),
      extractBusinessTermsFromSynonym(synonymContext, entity),
      dialogState.filters || {}
    );

    if (filters.period_range && operation === "get_value" && !filters.as_of_date) {
      operation = "analyze_dynamics";
    }

    var required = mergedRequired(entity, operation);
    var missing = required.filter(function (key) {
      return filters[key] == null || filters[key] === "";
    });

    var time = {};
    if (filters.as_of_date) {
      time = { type: "as_of", from: filters.as_of_date, to: filters.as_of_date };
    } else if (filters.period_range) {
      var parts = String(filters.period_range).split("..");
      time = {
        type: "period",
        from: parts[0],
        to: parts[1] || parts[0],
        label: filters.period_range,
      };
    }

    var semanticQuery = buildSemanticQuery(entity, operation, metric, dimensions, filters, time);
    var checklist = buildChecklist(entity, required, filters);
    var requiredData = [
      "EconomicCapital.value",
      "EconomicCapital.as_of_date",
      "EconomicCapital.calculation_snapshot",
      "EconomicCapital.scenario",
    ];

    if (missing.length) {
      var nextAttr = pickNextMissing(missing, entity);
      return {
        status: "NEEDS_CLARIFICATION",
        entity: entity,
        operation: operation,
        metric: metric,
        semantic_query: semanticQuery,
        required_attributes: required,
        missing_attributes: missing,
        resolved_filters: filters,
        clarification: {
          required: true,
          attribute: nextAttr,
          question: attrQuestion(entity, nextAttr),
        },
        business_rules: (LAYER.business_rules || []).slice(0, 2),
        required_data: requiredData,
        ui: {
          entity: entity,
          operation: operation,
          dimensions: dimensions,
          required_checklist: checklist,
          status: "NEEDS_CLARIFICATION",
        },
        dialog: {
          active: true,
          entity: entity,
          operation: operation,
          metric: metric,
          dimensions: dimensions,
          filters: filters,
          awaiting_attribute: nextAttr,
          normalized_query: dialogState.normalized_query || text,
        },
      };
    }

    return {
      status: "READY",
      entity: entity,
      operation: operation,
      metric: metric,
      semantic_query: semanticQuery,
      required_attributes: required,
      missing_attributes: [],
      clarification: { required: false, attribute: null, question: null },
      business_rules: (LAYER.business_rules || []).slice(0, 2),
      required_data: requiredData,
      evidence_requirements: {
        source: "economic_capital_fact",
        calculation_date: filters.as_of_date || null,
        calculation_snapshot: filters.calculation_snapshot,
        scenario: filters.scenario,
      },
      ui: {
        entity: entity,
        operation: operation,
        dimensions: dimensions,
        required_checklist: checklist,
        status: "READY",
      },
      dialog: { active: false },
    };
  }

  function applyDialogAnswer(dialog, userAnswer) {
    if (!dialog || !dialog.awaiting_attribute) {
      return {
        error: true,
        message: "Нет активного уточнения параметра.",
        dialog: dialog,
      };
    }
    var val = parseClarificationValue(dialog.awaiting_attribute, userAnswer, dialog.entity);
    if (val == null) {
      return {
        error: true,
        message: "Не удалось распознать значение. Повторите ответ.",
        dialog: dialog,
      };
    }
    dialog.filters = dialog.filters || {};
    dialog.filters[dialog.awaiting_attribute] = val;
    dialog.last_answer = userAnswer;
    return { error: false, dialog: dialog };
  }

  global.SattaSemanticLayerAgent = {
    load: load,
    analyze: analyze,
    parseClarificationValue: parseClarificationValue,
    applyDialogAnswer: applyDialogAnswer,
    getLayer: function () {
      return LAYER;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
