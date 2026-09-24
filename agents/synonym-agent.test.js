var fs = require("fs");
var vm = require("vm");
var path = require("path");
var dir = __dirname;

function load(file, ctx) {
  vm.runInContext(fs.readFileSync(path.join(dir, file), "utf8"), ctx);
}

var ctx = { global: {}, fetch: function (url) {
  var p = url.replace("data/", path.join(dir, "../data/"));
  return Promise.resolve({
    ok: true,
    json: function () {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    },
  });
}};
ctx.window = ctx.global;
vm.createContext(ctx);
load("morphology.js", ctx);
load("date-parser.js", ctx);
load("ontology-index.js", ctx);
load("synonym-agent.js", ctx);

var Agent = ctx.global.SattaSynonymAgent;

Agent.loadDictionary("data/synonyms.json").then(function () {
  function assert(cond, msg) {
    console.log((cond ? "OK" : "FAIL") + " — " + msg);
    if (!cond) process.exitCode = 1;
  }

  var q1 = Agent.analyzeQuery("покажи екап по портфелю на 31.12.25");
  assert(q1.clarification_required, "екап needs confirmation");
  assert(q1.normalized_query.indexOf("31.12.25") < 0, "date normalized");
  assert(q1.normalized_query.indexOf("2025-12-31") >= 0, "iso date present");
  assert(q1.normalized_query.indexOf("портфелю") < 0, "portfolio inflected replaced");
  assert(q1.terms.some(function (t) { return t.type === "DATE"; }), "date term");

  var q2 = Agent.analyzeQuery("покажи экономичсекий капитал по портфелю");
  assert(
    q2.normalized_query.toLowerCase().indexOf("экономический капитал") >= 0,
    "typo phrase fixed"
  );

  var q3 = Agent.analyzeQuery("покажи екап за декабрь 2025");
  assert(q3.terms.some(function (t) { return t.type === "PERIOD"; }), "period detected");

  var q4 = Agent.analyzeQuery("почему вырос экономический капитал?");
  assert(q4.normalized_query.split(" ").length >= 4, "no words dropped");

  var q5 = Agent.analyzeQuery("покажи капитал по портфелю");
  assert(q5.clarification_required, "капитал ambiguous");

  console.log("normalized sample:", q1.normalized_query);
});
