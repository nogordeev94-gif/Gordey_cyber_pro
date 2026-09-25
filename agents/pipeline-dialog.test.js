var fs = require("fs");
var vm = require("vm");
var path = require("path");
var dir = __dirname;

function load(file, ctx) {
  vm.runInContext(fs.readFileSync(path.join(dir, file), "utf8"), ctx);
}

var ctx = {
  global: {},
  fetch: function (url) {
    var rel = url.replace("data/", "");
    var p = path.join(dir, "../data", rel);
    return Promise.resolve({
      ok: true,
      json: function () {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      },
    });
  },
};
ctx.window = ctx.global;
ctx.globalThis = ctx.global;
var storage = {
  _data: {},
  getItem: function (k) {
    return this._data[k] || null;
  },
  setItem: function (k, v) {
    this._data[k] = v;
  },
  removeItem: function (k) {
    delete this._data[k];
  },
};
ctx.global.localStorage = storage;
vm.createContext(ctx);
vm.runInContext("var localStorage = global.localStorage;", ctx);
[
  "morphology.js",
  "date-parser.js",
  "attribute-bridge.js",
  "ontology-index.js",
  "synonym-agent.js",
  "semantic-layer-agent.js",
  "sql-agent.js",
  "pipeline.js",
].forEach(function (f) {
  load(f, ctx);
});

var Agent = ctx.global.SattaSynonymAgent;
var Pipeline = ctx.global.SattaPipeline;

function assert(cond, msg) {
  console.log((cond ? "OK" : "FAIL") + " — " + msg);
  if (!cond) process.exitCode = 1;
}

function synonymFor(question) {
  var syn = Agent.analyzeQuery(question);
  syn.status = "MATCHED";
  syn.clarification_required = false;
  if (syn.normalized_query) {
    syn.normalized_query = syn.normalized_query.replace(
      /\bекап\b/gi,
      "Экономический капитал"
    );
  }
  return syn;
}

Agent.loadDictionary("data/synonyms.json").then(function () {
  return Pipeline.runAfterSynonym("Какой ЭК?", synonymFor("Какой ЭК?")).then(function (r1) {
    assert(r1.status === "NEEDS_CLARIFICATION", "Test 1 pipeline status");
    assert(!r1.sql, "Test 1 SQL not called");
    assert(
      r1.semantic.clarification.question.indexOf("дату") >= 0,
      "Test 1 date question"
    );

    return Pipeline.continueDialog("31.12.2025").then(function (r2) {
      assert(r2.status === "NEEDS_CLARIFICATION", "after date needs snapshot");
      assert(!r2.sql, "after date SQL not called");

      return Pipeline.continueDialog("Последний").then(function (r3) {
        assert(r3.status === "NEEDS_CLARIFICATION", "after snapshot needs scenario");

        return Pipeline.continueDialog("Базовый").then(function (r4) {
          assert(r4.status === "COMPLETE", "dialog ends COMPLETE");
          assert(r4.sql && r4.sql.sql, "SQL called after READY");
          assert(
            r4.semantic.semantic_query.filters.as_of_date === "2025-12-31",
            "dialog preserved date"
          );
          assert(
            r4.semantic.semantic_query.filters.calculation_snapshot === "latest",
            "dialog preserved snapshot"
          );
          assert(r4.semantic.semantic_query.filters.scenario === "base", "dialog scenario");
        });
      });
    });
  });
});
