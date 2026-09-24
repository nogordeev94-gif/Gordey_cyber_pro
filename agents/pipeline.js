(function (global) {
  var STORAGE_KEY = "satta:pipeline-logs";

  function savePipelineLog(record) {
    var logs = [];
    try {
      logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
      logs = [];
    }
    logs.push(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-30)));
    try {
      localStorage.setItem(
        "satta:normalize-logs",
        JSON.stringify(
          logs.slice(-30).map(function (r) {
            return {
              original: r.user_query,
              normalized: r.synonym && r.synonym.normalized_query,
              ts: r.ts,
              clarifications: r.synonym && r.synonym.terms ? r.synonym.terms : [],
              pipeline: true,
            };
          })
        )
      );
    } catch (e2) {
      /* ignore */
    }
  }

  function runAfterSynonym(userQuery, synonymResult) {
    var Semantic = global.SattaSemanticLayerAgent;
    var Sql = global.SattaSqlAgent;
    return Semantic.load("data/").then(function () {
      var semantic = Semantic.analyze(synonymResult.normalized_query, {
        terms: synonymResult.terms,
        extracted_attributes: synonymResult.extracted_attributes,
      });
      if (semantic.status === "NEEDS_CLARIFICATION") {
        return {
          status: "NEEDS_CLARIFICATION",
          user_query: userQuery,
          ts: Date.now(),
          synonym: synonymResult,
      normalized_query: synonymResult.normalized_query,
          semantic: semantic,
        };
      }
      return Sql.load("data/").then(function () {
        var sqlResult = Sql.run(semantic);
        var record = {
          status: "COMPLETE",
          user_query: userQuery,
          ts: Date.now(),
          synonym: synonymResult,
          normalized_query: synonymResult.normalized_query,
          attribute_trace: {
            synonym: synonymResult.extracted_attributes,
            semantic_time: semantic.semantic_query && semantic.semantic_query.time,
            evidence: semantic.evidence_requirements,
            sql_filters: sqlResult.applied_filters,
          },
          semantic: semantic,
          sql: sqlResult,
          final_answer: sqlResult.final_answer,
        };
        savePipelineLog(record);
        return record;
      });
    });
  }

  function getLatestLog() {
    try {
      var logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return logs.length ? logs[logs.length - 1] : null;
    } catch (e) {
      return null;
    }
  }

  global.SattaPipeline = {
    runAfterSynonym: runAfterSynonym,
    savePipelineLog: savePipelineLog,
    getLatestLog: getLatestLog,
    STORAGE_KEY: STORAGE_KEY,
  };
})(typeof window !== "undefined" ? window : globalThis);
