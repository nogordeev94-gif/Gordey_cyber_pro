(function (global) {
  var STORAGE_KEY = "satta:pipeline-logs";
  var DIALOG_KEY = "user:semantic-dialog";

  function savePipelineLog(record) {
    var logs = [];
    try {
      logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
      logs = [];
    }
    logs.push(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-30)));
  }

  function saveDialog(dialog) {
    if (!dialog || !dialog.active) {
      localStorage.removeItem(DIALOG_KEY);
      return;
    }
    localStorage.setItem(DIALOG_KEY, JSON.stringify(dialog));
  }

  function loadDialog() {
    try {
      return JSON.parse(localStorage.getItem(DIALOG_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function runSemantic(userQuery, synonymResult, dialogState) {
    var Semantic = global.SattaSemanticLayerAgent;
    return Semantic.load("data/").then(function () {
      var semantic = Semantic.analyze(synonymResult.normalized_query, {
        terms: synonymResult.terms,
        extracted_attributes: synonymResult.extracted_attributes,
      }, dialogState);

      if (semantic.status !== "READY") {
        if (semantic.dialog && semantic.dialog.active) {
          semantic.dialog.active = true;
          semantic.dialog.synonym_context = {
            terms: synonymResult.terms,
            extracted_attributes: synonymResult.extracted_attributes,
          };
          semantic.dialog.user_query = userQuery;
          semantic.dialog.normalized_query =
            semantic.dialog.normalized_query || synonymResult.normalized_query;
          saveDialog(semantic.dialog);
        }
        return {
          status: semantic.status,
          user_query: userQuery,
          ts: Date.now(),
          synonym: synonymResult,
          normalized_query: synonymResult.normalized_query,
          semantic: semantic,
        };
      }

      saveDialog(null);
      var Sql = global.SattaSqlAgent;
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
            semantic_filters: semantic.semantic_query && semantic.semantic_query.filters,
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

  function runAfterSynonym(userQuery, synonymResult, dialogState) {
    return runSemantic(userQuery, synonymResult, dialogState || { active: false });
  }

  function continueDialog(userAnswer) {
    var Semantic = global.SattaSemanticLayerAgent;
    var dialog = loadDialog();
    if (!dialog || !dialog.active) {
      return Promise.resolve({ status: "NO_DIALOG" });
    }
    return Semantic.load("data/").then(function () {
      return continueDialogAfterLoad(userAnswer, dialog, Semantic);
    });
  }

  function continueDialogAfterLoad(userAnswer, dialog, Semantic) {
    var applied = Semantic.applyDialogAnswer(dialog, userAnswer);
    if (applied.error) {
      return Promise.resolve({
        status: "NEEDS_CLARIFICATION",
        semantic: {
          status: "NEEDS_CLARIFICATION",
          clarification: {
            question: applied.message,
            attribute: dialog.awaiting_attribute,
          },
        },
        dialog: dialog,
      });
    }
    dialog = applied.dialog;
    dialog.active = true;
    delete dialog.awaiting_attribute;
    var synonymStub = {
      normalized_query: dialog.normalized_query,
      terms: (dialog.synonym_context && dialog.synonym_context.terms) || [],
      extracted_attributes:
        (dialog.synonym_context && dialog.synonym_context.extracted_attributes) || null,
    };
    return runSemantic(dialog.user_query || dialog.normalized_query, synonymStub, dialog);
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
    continueDialog: continueDialog,
    savePipelineLog: savePipelineLog,
    loadDialog: loadDialog,
    saveDialog: saveDialog,
    getLatestLog: getLatestLog,
    STORAGE_KEY: STORAGE_KEY,
    DIALOG_KEY: DIALOG_KEY,
  };
})(typeof window !== "undefined" ? window : globalThis);
