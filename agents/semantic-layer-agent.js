(function (global) {
  var LAYER = null;
  var ENTITY_MAP = null;

  function load(baseUrl) {
    baseUrl = baseUrl || "data/";
    return Promise.all([
      fetch(baseUrl + "semantic-layer.json").then(function (r) {
        return r.json();
      }),
      fetch(baseUrl + "entity-map.json").then(function (r) {
        return r.json();
      }),
    ]).then(function (pair) {
      LAYER = pair[0];
      ENTITY_MAP = pair[1];
      return LAYER;
    });
  }

  function lower(text) {
    return String(text || "").toLowerCase();
  }

  function hasEc(text) {
    var t = lower(text);
    return (
      t.indexOf("экономический капитал") >= 0 ||
      t.indexOf("economic capital") >= 0 ||
      t.indexOf("эк ") >= 0 ||
      t.indexOf("екап") >= 0 ||
      t.indexOf("экап") >= 0 ||
      /\bэк\b/.test(t)
    );
  }

  function resolveTime(text, synonymContext) {
    var time = detectTime(text);
    if (time) return time;
    if (global.SattaAttributeBridge && synonymContext && synonymContext.extracted_attributes) {
      time = global.SattaAttributeBridge.timeFromAttributes(synonymContext.extracted_attributes);
    }
    return time;
  }

  function mergeDimensions(text, synonymContext) {
    var dimensions = detectPortfolioFilters(text);
    var attrs = synonymContext && synonymContext.extracted_attributes;
    if (attrs && attrs.entity_values) {
      attrs.entity_values.forEach(function (ev) {
        if (ev.entityId === "Portfolio" || (ev.meta && ev.meta.entity === "Portfolio")) {
          dimensions.push({
            entity: "Portfolio",
            attribute: "portfolio_type",
            value: ev.normalized,
            label: ev.original,
            source: "synonym_agent",
          });
        }
      });
    }
    return dimensions;
  }

  function detectPortfolioFilters(text) {
    var t = lower(text);
    var dims = [];
    if (t.indexOf("корпоратив") >= 0) {
      dims.push({
        entity: "Portfolio",
        attribute: "portfolio_type",
        value: "Corporate",
        label: "Корпоративный",
      });
    }
    if (t.indexOf("рознич") >= 0) {
      dims.push({
        entity: "Portfolio",
        attribute: "portfolio_type",
        value: "Retail",
        label: "Розничный",
      });
    }
    if (t.indexOf("портфел") >= 0 && !dims.length) {
      dims.push({
        entity: "Portfolio",
        attribute: "portfolio_name",
        value: null,
        label: "Портфель (без уточнения типа)",
      });
    }
    return dims;
  }

  function detectTime(text) {
    var t = lower(text);
    if (t.indexOf("июн") >= 0) {
      return { type: "period", from: "2026-06-01", to: "2026-06-30", label: "2026-06" };
    }
    if (t.indexOf("май") >= 0) {
      return { type: "period", from: "2026-05-01", to: "2026-05-31", label: "2026-05" };
    }
    return null;
  }

  function detectOperations(text) {
    var t = lower(text);
    var ops = [];
    (LAYER.intents || []).forEach(function (intent) {
      var hit = (intent.patterns || []).some(function (p) {
        return t.indexOf(p) >= 0;
      });
      if (hit) ops.push(intent.operation);
    });
    if (t.indexOf("почему") >= 0 || t.indexOf("вырос") >= 0 || t.indexOf("выросла") >= 0) {
      ops = ["explain_change", "find_drivers", "decompose"];
    }
    if (t.indexOf("сравни") >= 0 && t.indexOf("портфел") >= 0) {
      ops = ["compare_portfolios"];
    }
    if (t.indexOf("изменил") >= 0 && ops.indexOf("analyze_dynamics") < 0) {
      ops.unshift("analyze_dynamics");
    }
    if (!ops.length && (t.indexOf("покаж") >= 0 || t.indexOf("какой") >= 0)) {
      ops = ["get_value"];
    }
    return uniq(ops);
  }

  function uniq(arr) {
    var s = Object.create(null);
    var out = [];
    arr.forEach(function (x) {
      if (!s[x]) {
        s[x] = true;
        out.push(x);
      }
    });
    return out;
  }

  function buildIntentLabel(ops) {
    if (ops.indexOf("explain_change") >= 0) return "Объяснение изменения экономического капитала";
    if (ops.indexOf("compare_portfolios") >= 0) return "Сравнение портфелей по экономическому капиталу";
    if (ops.indexOf("analyze_dynamics") >= 0) return "Анализ динамики экономического капитала";
    return "Получение значения метрики";
  }

  function analyze(normalizedQuery, synonymContext) {
    var text = String(normalizedQuery || "");
    var t = lower(text);
    synonymContext = synonymContext || {};

    if (t.indexOf("капитал") >= 0 && !hasEc(text)) {
      return {
        status: "NEEDS_CLARIFICATION",
        clarification: {
          question: "Вы имеете в виду «Экономический капитал»?",
          parameter: "metric",
          suggested_entity: "EconomicCapital",
        },
      };
    }


    var operations = detectOperations(text);
    var dimensions = mergeDimensions(text, synonymContext);
    var time = resolveTime(text, synonymContext);
    var primaryOp = operations[0] || "get_value";
    var inherited =
      global.SattaAttributeBridge && synonymContext.extracted_attributes
        ? global.SattaAttributeBridge.summarize(synonymContext.extracted_attributes)
        : {};

    var semanticQuery = {
      operation: primaryOp,
      operation_chain: operations,
      entity: "EconomicCapital",
      metric: "value",
      dimensions: dimensions,
      time: time,
    };

    var required = [
      "EconomicCapital.value",
      "EconomicCapital.as_of_date",
      "EconomicCapital.portfolio",
      "EconomicCapital.methodology_version",
    ];
    if (operations.indexOf("decompose") >= 0 || operations.indexOf("find_drivers") >= 0) {
      required = required.concat([
        "EconomicCapitalChange.absolute_change",
        "FactorContribution.contribution_value",
        "RiskFactor.factor_name",
      ]);
    }

    var rules = (LAYER.business_rules || []).slice(0, 2);
    if (operations.indexOf("compare_portfolios") >= 0) {
      rules.push("Для сравнения портфелей используется одна версия методологии");
    }

    return {
      status: "OK",
      intent: buildIntentLabel(operations),
      semantic_query: semanticQuery,
      required_data: required,
      business_rules: rules,
      expected_result: {
        value: operations.indexOf("get_value") >= 0 || operations.indexOf("compare_portfolios") >= 0,
        absolute_change: operations.indexOf("analyze_dynamics") >= 0 || operations.indexOf("explain_change") >= 0,
        relative_change: operations.indexOf("analyze_dynamics") >= 0,
        drivers: operations.indexOf("find_drivers") >= 0,
      },
      evidence_requirements: {
        source: "economic_capital_fact",
        period: time ? time.label : "latest",
        methodology_version: "v3.2",
        calculation_date: time ? (time.type === "as_of" ? time.from : time.to) : "latest",
      },
      inherited_attributes: inherited,
      ui: {
        operation: primaryOp,
        entity: "EconomicCapital",
        dimensions: dimensions,
        time: time,
        inherited_attributes: inherited,
        required_entities: uniq(
          ["EconomicCapital"].concat(
            operations.indexOf("decompose") >= 0 ? ["EconomicCapitalChange", "FactorContribution", "RiskFactor"] : []
          )
        ),
      },
    };
  }

  global.SattaSemanticLayerAgent = {
    load: load,
    analyze: analyze,
    getLayer: function () {
      return LAYER;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
