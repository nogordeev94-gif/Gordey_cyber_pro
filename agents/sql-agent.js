(function (global) {
  var MAPPING = null;
  var DEMO = {
    economic_capital_fact: [],
    portfolio: [],
    factor_contribution: [],
    risk_factor: [],
  };

  function load(baseUrl) {
    baseUrl = baseUrl || "data/";
    return Promise.all([
      fetch(baseUrl + "mapping.json").then(function (r) {
        return r.json();
      }),
      fetch(baseUrl + "demo/economic_capital_fact.json").then(function (r) {
        return r.json();
      }),
      fetch(baseUrl + "demo/portfolio.json").then(function (r) {
        return r.json();
      }),
      fetch(baseUrl + "demo/factor_contribution.json").then(function (r) {
        return r.json();
      }),
      fetch(baseUrl + "demo/risk_factor.json").then(function (r) {
        return r.json();
      }),
    ]).then(function (parts) {
      MAPPING = parts[0];
      DEMO.economic_capital_fact = parts[1];
      DEMO.portfolio = parts[2];
      DEMO.factor_contribution = parts[3];
      DEMO.risk_factor = parts[4];
      return MAPPING;
    });
  }

  function mapField(logicalPath) {
    var m = MAPPING && MAPPING.attributes && MAPPING.attributes[logicalPath];
    if (!m) return null;
    return { table: m.table, field: m.field };
  }

  function buildSql(semanticResult) {
    var sq = semanticResult.semantic_query;
    var ec = mapField("EconomicCapital.value");
    var table = ec ? ec.table : "economic_capital_fact";
    var valueField = ec ? ec.field : "economic_capital";
    var lines = [
      "SELECT f.date, f.portfolio_name, f." + valueField + " AS economic_capital",
      "FROM " + table + " f",
    ];
    var joins = [];
    var where = ["f.scenario = 'Base'"];

    var corp = false;
    var retail = false;
    (sq.dimensions || []).forEach(function (d) {
      if (d.value === "Corporate") corp = true;
      if (d.value === "Retail") retail = true;
    });

    if (corp && !retail) {
      joins.push("JOIN portfolio p ON p.portfolio_id = f.portfolio_id");
      where.push("p.portfolio_type = 'Corporate'");
    } else if (retail && !corp) {
      joins.push("JOIN portfolio p ON p.portfolio_id = f.portfolio_id");
      where.push("p.portfolio_type = 'Retail'");
    } else if (corp && retail) {
      joins.push("JOIN portfolio p ON p.portfolio_id = f.portfolio_id");
      where.push("p.portfolio_type IN ('Corporate', 'Retail')");
    }

    if (sq.time) {
      where.push("f.date BETWEEN '" + sq.time.from + "' AND '" + sq.time.to + "'");
    }

    if (joins.length) lines.push(joins.join("\n"));
    lines.push("WHERE " + where.join("\n  AND "));
    lines.push("ORDER BY f.date, f.portfolio_name;");

    return lines.join("\n");
  }

  function formatMoney(n) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
  }

  function execute(semanticResult) {
    var sq = semanticResult.semantic_query;
    var rows = DEMO.economic_capital_fact.slice();

    var corp = false;
    var retail = false;
    (sq.dimensions || []).forEach(function (d) {
      if (d.value === "Corporate") corp = true;
      if (d.value === "Retail") retail = true;
    });

    if (corp && retail) {
      /* compare both */
    } else if (corp && !retail) {
      rows = rows.filter(function (r) {
        return r.portfolio_id === "P_CORP";
      });
    } else if (retail && !corp) {
      rows = rows.filter(function (r) {
        return r.portfolio_id === "P_RET";
      });
    }

    if (sq.time) {
      rows = rows.filter(function (r) {
        return r.date >= sq.time.from && r.date <= sq.time.to;
      });
    }

    var result = { rows: rows, aggregates: {}, drivers: [] };
    var ops = sq.operation_chain || [sq.operation];

    if (ops.indexOf("analyze_dynamics") >= 0 || ops.indexOf("compare") >= 0) {
      var byPortfolio = {};
      rows.forEach(function (r) {
        if (!byPortfolio[r.portfolio_id]) byPortfolio[r.portfolio_id] = [];
        byPortfolio[r.portfolio_id].push(r);
      });
      Object.keys(byPortfolio).forEach(function (pid) {
        var list = byPortfolio[pid].sort(function (a, b) {
          return a.date.localeCompare(b.date);
        });
        if (list.length >= 2) {
          var first = list[0];
          var last = list[list.length - 1];
          var abs = last.economic_capital - first.economic_capital;
          var rel = abs / first.economic_capital;
          result.aggregates[pid] = {
            portfolio_name: last.portfolio_name,
            from: first.date,
            to: last.date,
            value_from: first.economic_capital,
            value_to: last.economic_capital,
            absolute_change: abs,
            relative_change: rel,
          };
        }
      });
    }

    if (ops.indexOf("compare_portfolios") >= 0) {
      var june = rows.filter(function (r) {
        return r.date === "2026-06-30";
      });
      result.aggregates.compare = june.map(function (r) {
        return {
          portfolio_name: r.portfolio_name,
          economic_capital: r.economic_capital,
        };
      });
    }

    if (ops.indexOf("find_drivers") >= 0 || ops.indexOf("decompose") >= 0) {
      var pid = corp ? "P_CORP" : "P_CORP";
      result.drivers = DEMO.factor_contribution
        .filter(function (f) {
          return f.portfolio_id === pid && f.date === "2026-06-30";
        })
        .map(function (f) {
          var rf = DEMO.risk_factor.find(function (x) {
            return x.factor_id === f.factor_id;
          });
          return {
            factor_id: f.factor_id,
            factor_name: rf ? rf.factor_name : f.factor_id,
            contribution_value: f.contribution_value,
          };
        });
    }

    if (ops.indexOf("get_value") >= 0 && rows.length === 1) {
      result.aggregates.latest = {
        date: rows[0].date,
        portfolio_name: rows[0].portfolio_name,
        economic_capital: rows[0].economic_capital,
      };
    }

    if (ops.indexOf("get_value") >= 0 && rows.length > 1) {
      var latest = rows[rows.length - 1];
      result.aggregates.latest = {
        date: latest.date,
        portfolio_name: latest.portfolio_name,
        economic_capital: latest.economic_capital,
      };
    }

    return result;
  }

  function buildFinalAnswer(semanticResult, execution) {
    var sq = semanticResult.semantic_query;
    var ops = sq.operation_chain || [sq.operation];
    var parts = [];

    if (ops.indexOf("compare_portfolios") >= 0 && execution.aggregates.compare) {
      execution.aggregates.compare.forEach(function (item) {
        parts.push(
          item.portfolio_name + ": " + formatMoney(item.economic_capital) + " (на 2026-06-30)"
        );
      });
      return "Сравнение экономического капитала по портфелям (демо-данные):\n" + parts.join("\n");
    }

    if (execution.aggregates.latest) {
      var l = execution.aggregates.latest;
      parts.push(
        "Экономический капитал (" +
          l.portfolio_name +
          ", " +
          l.date +
          "): " +
          formatMoney(l.economic_capital)
      );
    }

    Object.keys(execution.aggregates).forEach(function (k) {
      if (k === "compare" || k === "latest") return;
      var a = execution.aggregates[k];
      if (a.absolute_change != null) {
        parts.push(
          a.portfolio_name +
            ": изменение за период " +
            a.from +
            " → " +
            a.to +
            " = " +
            formatMoney(a.absolute_change) +
            " (" +
            (a.relative_change * 100).toFixed(2) +
            "%)"
        );
      }
    });

    if (execution.drivers && execution.drivers.length) {
      parts.push("Основные драйверы изменения (декомпозиция):");
      execution.drivers.forEach(function (d) {
        parts.push("• " + d.factor_name + ": " + formatMoney(d.contribution_value));
      });
    }

    if (!parts.length && execution.rows.length) {
      execution.rows.forEach(function (r) {
        parts.push(r.portfolio_name + " " + r.date + ": " + formatMoney(r.economic_capital));
      });
    }

    return parts.join("\n");
  }

  function run(semanticResult) {
    var sql = buildSql(semanticResult);
    var execution = execute(semanticResult);
    var answer = buildFinalAnswer(semanticResult, execution);
    return {
      sql: sql,
      execution: execution,
      final_answer: answer,
      mapping_version: MAPPING ? MAPPING.version : null,
    };
  }

  global.SattaSqlAgent = {
    load: load,
    buildSql: buildSql,
    execute: execute,
    run: run,
  };
})(typeof window !== "undefined" ? window : globalThis);
