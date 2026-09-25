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
load("date-parser.js", ctx);
load("semantic-layer-agent.js", ctx);

var Semantic = ctx.global.SattaSemanticLayerAgent;

function assert(cond, msg) {
  console.log((cond ? "OK" : "FAIL") + " — " + msg);
  if (!cond) process.exitCode = 1;
}

function dialogStateFrom(dialog) {
  var state = Object.assign({}, dialog);
  state.active = true;
  delete state.awaiting_attribute;
  return state;
}

Semantic.load("data/").then(function () {
  var s1 = Semantic.analyze("Какой ЭК?", {}, {});
  assert(s1.status === "NEEDS_CLARIFICATION", "Test 1 status");
  assert(s1.clarification.attribute === "as_of_date", "Test 1 asks date");
  assert(s1.clarification.question.indexOf("дату") >= 0, "Test 1 question");

  var s2 = Semantic.analyze("Какой ЭК на 31.12.2025?", {}, {});
  assert(s2.status === "NEEDS_CLARIFICATION", "Test 2 status");
  assert(s2.clarification.attribute === "calculation_snapshot", "Test 2 asks snapshot");
  assert(s2.semantic_query.filters.as_of_date === "2025-12-31", "Test 2 keeps date");

  var s3 = Semantic.analyze("Какой ЭК на 31.12.2025, последний срез?", {}, {});
  assert(s3.status === "NEEDS_CLARIFICATION", "Test 3 status");
  assert(s3.clarification.attribute === "scenario", "Test 3 asks scenario");
  assert(s3.semantic_query.filters.calculation_snapshot === "latest", "Test 3 snapshot");

  var s4 = Semantic.analyze(
    "Какой ЭК на 31.12.2025, последний срез, базовый сценарий?",
    {},
    {}
  );
  assert(s4.status === "READY", "Test 4 READY");
  assert(s4.semantic_query.filters.scenario === "base", "Test 4 scenario");

  var s5 = Semantic.analyze("Покажи ЭК по продуктам.", {}, {});
  assert(s5.operation === "aggregate", "Test 5 aggregate");
  assert(s5.semantic_query.dimensions.indexOf("product") >= 0, "Test 5 product dimension");
  assert(s5.status === "NEEDS_CLARIFICATION", "Test 5 needs params");

  var s6 = Semantic.analyze("Покажи ЭК по ГБЛ на 31.12.2025.", {}, {});
  assert(s6.semantic_query.dimensions.indexOf("gbl") >= 0, "Test 6 gbl dimension");
  assert(s6.missing_attributes.indexOf("calculation_snapshot") >= 0, "Test 6 missing snapshot");
  assert(s6.missing_attributes.indexOf("scenario") >= 0, "Test 6 missing scenario");

  var s7 = Semantic.analyze(
    "Покажи ЭК по продуктам на 31.12.2025, последний срез, базовый сценарий.",
    {},
    {}
  );
  assert(s7.status === "READY", "Test 7 READY");
  assert(s7.operation === "aggregate", "Test 7 aggregate");
  assert(s7.semantic_query.dimensions.indexOf("product") >= 0, "Test 7 product");
  assert(s7.semantic_query.filters.as_of_date === "2025-12-31", "Test 7 date");

  var d0 = s1.dialog;
  var a1 = Semantic.applyDialogAnswer(d0, "31.12.2025");
  assert(!a1.error, "Test 8 step date apply");
  var s8a = Semantic.analyze(d0.normalized_query, {}, dialogStateFrom(a1.dialog));
  assert(s8a.clarification.attribute === "calculation_snapshot", "Test 8 snapshot question");

  var a2 = Semantic.applyDialogAnswer(s8a.dialog, "Последний");
  var s8b = Semantic.analyze(d0.normalized_query, {}, dialogStateFrom(a2.dialog));
  assert(s8b.clarification.attribute === "scenario", "Test 8 scenario question");

  var a3 = Semantic.applyDialogAnswer(s8b.dialog, "Базовый");
  var s8c = Semantic.analyze(d0.normalized_query, {}, dialogStateFrom(a3.dialog));
  assert(s8c.status === "READY", "Test 8 READY");
  assert(s8c.operation === "get_value", "Test 8 preserves get_value");
  assert(s8c.semantic_query.filters.as_of_date === "2025-12-31", "Test 8 final date");
  assert(s8c.semantic_query.filters.calculation_snapshot === "latest", "Test 8 final snapshot");
  assert(s8c.semantic_query.filters.scenario === "base", "Test 8 final scenario");

  var sGbl = Semantic.analyze(
    "Покажи ЭК по ГБЛ на 31.12.2025, последний срез, базовый сценарий.",
    {},
    {}
  );
  assert(sGbl.status === "READY", "Test 7 GBL READY");
  assert(sGbl.semantic_query.dimensions.indexOf("gbl") >= 0, "Test 7 GBL dimension");
  assert(sGbl.semantic_query.filters.as_of_date === "2025-12-31", "Test 7 GBL date");
});
