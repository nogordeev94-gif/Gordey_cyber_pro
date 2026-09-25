(function () {
  var form = document.getElementById("ask-form");
  var input = document.getElementById("question");
  var clarify = document.getElementById("clarify");
  var clarifyText = document.getElementById("clarify-text");
  var clarifyYes = document.getElementById("clarify-yes");
  var clarifyNo = document.getElementById("clarify-no");
  var clarifyActions = clarify && clarify.querySelector(".clarify__actions");

  var pendingQuestion = "";
  var pendingClarification = null;
  var clarifyMode = "synonym";
  var rejectedTerms = new Set();

  if (!form || !input) return;

  function hideClarify() {
    if (clarify) clarify.hidden = true;
    pendingClarification = null;
    clarifyMode = "synonym";
    if (clarifyActions) clarifyActions.hidden = false;
  }

  function showClarify(message, mode) {
    clarifyMode = mode || "synonym";
    if (!clarify || !clarifyText) return;
    clarifyText.textContent = message;
    if (clarifyActions) {
      clarifyActions.hidden = clarifyMode === "semantic";
    }
    clarify.hidden = false;
  }

  function bootstrapAgents() {
    return SattaSynonymAgent.loadDictionary("data/synonyms.json").then(function () {
      return SattaSynonymAgent.loadEntityMap("data/entity-map.json");
    });
  }

  function handlePipelineResult(record) {
    if (record.status === "COMPLETE") {
      try {
        sessionStorage.setItem("satta:view-log-ts", String(record.ts));
      } catch (e) {
        /* ignore */
      }
      window.location.href = "logs.html";
      return;
    }

    if (
      record.status === "NEEDS_CLARIFICATION" ||
      record.status === "AMBIGUOUS"
    ) {
      var sem = record.semantic || {};
      var q =
        (sem.clarification && sem.clarification.question) ||
        "Нужно уточнение параметров запроса.";
      showClarify(q + "\n\nОтветьте в поле ввода ниже.", "semantic");
      SattaPipeline.savePipelineLog(record);
      return;
    }

    if (record.status === "UNSUPPORTED") {
      var unsupportedQ =
        (record.semantic &&
          record.semantic.clarification &&
          record.semantic.clarification.question) ||
        "Запрос не поддерживается текущей моделью Semantic Layer.";
      showClarify(unsupportedQ, "semantic");
      SattaPipeline.saveDialog(null);
      return;
    }

    if (record.status === "NO_DIALOG") {
      showClarify(
        "Сессия уточнения истекла. Сформулируйте вопрос заново.",
        "semantic"
      );
      SattaPipeline.saveDialog(null);
      return;
    }

    showClarify(
      "Не удалось обработать запрос. Попробуйте ещё раз или переформулируйте вопрос.",
      "semantic"
    );
  }

  function runPipeline(question, analysis, dialogState) {
    return SattaPipeline.runAfterSynonym(question, analysis, dialogState).then(
      handlePipelineResult
    );
  }

  function finishSynonymPhase(question) {
    var analysis = SattaSynonymAgent.analyzeQuery(question);

    if (analysis.status === "OUT_OF_SCOPE") {
      pendingClarification = { outOfScope: true };
      showClarify(
        analysis.clarification && analysis.clarification.question
          ? analysis.clarification.question
          : "Запрос не относится к бизнес-метрикам.",
        "synonym"
      );
      return;
    }

    if (analysis.status === "NEEDS_CONFIRMATION") {
      var c = analysis.clarification;
      if (c && rejectedTerms.has(String(c.original_term).toLowerCase())) {
        analysis.status = "MATCHED";
        analysis.clarification = null;
        return runPipeline(question, analysis);
      }
      if (c) {
        pendingClarification = c;
        showClarify(c.question, "synonym");
        return;
      }
    }

    runPipeline(question, analysis);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) {
      input.focus();
      return;
    }

    var dialog = SattaPipeline.loadDialog();
    if (dialog && dialog.active) {
      input.value = "";
      bootstrapAgents().then(function () {
        SattaPipeline.continueDialog(q).then(handlePipelineResult);
      });
      return;
    }

    pendingQuestion = q;
    rejectedTerms = new Set();
    hideClarify();

    bootstrapAgents()
      .then(function () {
        finishSynonymPhase(q);
      })
      .catch(function () {
        showClarify(
          "Не удалось загрузить словарь или агенты. Обновите страницу или откройте сайт через HTTP-сервер.",
          "semantic"
        );
      });
  });

  if (clarifyYes) {
    clarifyYes.addEventListener("click", function () {
      if (!pendingClarification || !pendingQuestion) return;
      if (pendingClarification.outOfScope) {
        hideClarify();
        return;
      }
      SattaSynonymAgent.saveCustomSynonym(
        pendingClarification.entryId,
        pendingClarification.original_term
      );
      hideClarify();
      finishSynonymPhase(pendingQuestion);
    });
  }

  if (clarifyNo) {
    clarifyNo.addEventListener("click", function () {
      if (!pendingClarification || !pendingQuestion) return;
      rejectedTerms.add(pendingClarification.original_term);
      hideClarify();
      finishSynonymPhase(pendingQuestion);
    });
  }

  var existingDialog = SattaPipeline.loadDialog();
  if (existingDialog && existingDialog.active) {
    SattaSemanticLayerAgent.load("data/").then(function () {
      var sem = SattaSemanticLayerAgent.analyze(
        existingDialog.normalized_query,
        existingDialog.synonym_context,
        existingDialog
      );
      if (sem.clarification && sem.clarification.question) {
        showClarify(
          sem.clarification.question + "\n\nОтветьте в поле ввода ниже.",
          "semantic"
        );
      }
    });
  }
})();
