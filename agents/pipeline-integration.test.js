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
vm.createContext(ctx);
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
ctx.window.localStorage = storage;
ctx.localStorage = storage;
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

Agent.loadDictionary("data/synonyms.json").then(function () {
  var q =
    "какой екап за дату 31.12.25, последний срез, базовый сценарий?";
  var syn = Agent.analyzeQuery(q);
  assert(syn.extracted_attributes.dates[0].iso === "2025-12-31", "synonym parses date");

  syn.status = "MATCHED";
  syn.clarification_required = false;
  syn.normalized_query = syn.normalized_query.replace(/екап/gi, "Экономический капитал");

  return Pipeline.runAfterSynonym(q, syn).then(function (record) {
    assert(record.status === "COMPLETE", "pipeline completes when semantic READY");
    assert(record.semantic.status === "READY", "semantic READY");
    var f = record.semantic.semantic_query.filters;
    assert(f.as_of_date === "2025-12-31", "semantic filter date");
    assert(f.scenario === "base", "semantic filter scenario");
    assert(record.sql.sql.indexOf("2025-12-31") >= 0, "sql filters date");
    assert(record.sql.sql.indexOf("Base") >= 0, "sql filters scenario");
    assert(record.final_answer.indexOf("2025-12-31") >= 0, "answer uses date");
    assert(record.final_answer.indexOf("2026-06-30") < 0, "answer not default june");
    console.log("SQL snippet:", record.sql.sql.split("\n").slice(-3).join(" "));
  });
});
