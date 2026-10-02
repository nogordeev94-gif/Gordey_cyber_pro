(function () {
  var form = document.getElementById("ask-form");
  var input = document.getElementById("question");
  var submitBtn = document.getElementById("ask-submit");
  var clarify = document.getElementById("clarify");
  var clarifyText = document.getElementById("clarify-text");
  var clarifyHintMode = document.getElementById("clarify-hint-mode");
  var clarifyReset = document.getElementById("clarify-reset");
  var clarifyYes = document.getElementById("clarify-yes");
  var clarifyNo = document.getElementById("clarify-no");
  var clarifyConfirmActions = document.getElementById("clarify-confirm-actions");

  var pendingQuestion = "";
  var pendingClarification = null;
  var clarifyMode = "synonym";
  var rejectedTerms = new Set();

  if (!form || !input) return;

  function setSubmitLabel(mode) {
    if (!submitBtn) return;
    submitBtn.textContent = mode === "semantic" ? "Ответить" : "Спросить";
  }

  function setInputPlaceholder(mode) {
    if (!input) return;
    input.placeholder =
      mode === "semantic"
        ? "Введите ответ на уточняющий вопрос (например: 31.12.2025)"
        : "Например: какой ЭК по портфелю «Корпоративный» на сегодня?";
  }

  function hideClarify() {
    if (clarify) {
      clarify.hidden = true;
      clarify.classList.remove("clarify--semantic");
    }
    pendingClarification = null;
    clarifyMode = "synonym";
    setSubmitLabel("synonym");
    setInputPlaceholder("synonym");
    if (clarifyConfirmActions) clarifyConfirmActions.hidden = false;
    if (clarifyHintMode) clarifyHintMode.hidden = true;
    if (clarifyReset) clarifyReset.hidden = true;
  }

  function showClarify(message, mode) {
    clarifyMode = mode || "synonym";
    if (!clarify || !clarifyText) return;
    clarifyText.textContent = message;
    if (clarifyMode === "semantic") {
      clarify.classList.add("clarify--semantic");
      if (clarifyConfirmActions) clarifyConfirmActions.hidden = true;
      if (clarifyHintMode) {
        clarifyHintMode.textContent =
          "Введите ответ в поле выше и нажмите «Ответить».";
        clarifyHintMode.hidden = false;
      }
      if (clarifyReset) clarifyReset.hidden = false;
      setSubmitLabel("semantic");
      setInputPlaceholder("semantic");
    } else {
      clarify.classList.remove("clarify--semantic");
      if (clarifyConfirmActions) clarifyConfirmActions.hidden = false;
      if (clarifyHintMode) clarifyHintMode.hidden = true;
      if (clarifyReset) clarifyReset.hidden = true;
      setSubmitLabel("synonym");
      setInputPlaceholder("synonym");
    }
    clarify.hidden = false;
    clarify.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function bootstrapAgents() {
    return SattaSynonymAgent.loadDictionary("data/synonyms.json").then(function () {
      return SattaSynonymAgent.loadEntityMap("data/entity-map.json");
    });
  }

  function pipelineError(err) {
    console.error(err);
    showClarify(
      "Ошибка обработки запроса. Обновите страницу. Если открываете файл с диска (file://), запустите локальный сервер: npx serve .",
      "semantic"
    );
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

    if (record.status === "NEEDS_CLARIFICATION" || record.status === "AMBIGUOUS") {
      var sem = record.semantic || {};
      var clar = sem.clarification || {};
      var q = clar.question || "Нужно уточнение параметров запроса.";
      if (clar.input && clar.input.options && clar.input.options.length) {
        q +=
          "\n\n" +
          clar.input.options
            .map(function (o) {
              return "• " + (o.label || o.value);
            })
            .join("\n");
      }
      showClarify(q, "semantic");
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
      showClarify("Сессия уточнения истекла. Сформулируйте вопрос заново.", "semantic");
      SattaPipeline.saveDialog(null);
      return;
    }

    showClarify(
      "Не удалось обработать запрос. Попробуйте ещё раз или переформулируйте вопрос.",
      "semantic"
    );
  }

  function runPipeline(question, analysis, dialogState) {
    return SattaPipeline.runAfterSynonym(question, analysis, dialogState)
      .then(handlePipelineResult)
      .catch(pipelineError);
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
      bootstrapAgents()
        .then(function () {
          return SattaPipeline.continueDialog(q);
        })
        .then(handlePipelineResult)
        .catch(pipelineError);
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
          "Не удалось загрузить словарь или агенты. Откройте сайт по HTTP (не file://), например: npx serve .",
          "semantic"
        );
      });
  });

  if (clarifyReset) {
    clarifyReset.addEventListener("click", function () {
      SattaPipeline.saveDialog(null);
      hideClarify();
      input.focus();
    });
  }

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

  if (location.protocol === "file:") {
    showClarify(
      "Страница открыта как файл (file://). Агенты не загрузят данные. Запустите в папке проекта: npx serve . и откройте http://localhost:3000",
      "semantic"
    );
  }

  var existingDialog = SattaPipeline.loadDialog();
  if (existingDialog && existingDialog.active) {
    setSubmitLabel("semantic");
    setInputPlaceholder("semantic");
    SattaSemanticLayerAgent.load("data/").then(function () {
      var sem = SattaSemanticLayerAgent.analyze(
        existingDialog.normalized_query,
        existingDialog.synonym_context,
        existingDialog
      );
      if (sem.clarification && sem.clarification.question) {
        var clar = sem.clarification;
        var msg = clar.question;
        if (clar.input && clar.input.options) {
          msg +=
            "\n\n" +
            clar.input.options
              .map(function (o) {
                return "• " + (o.label || o.value);
              })
              .join("\n");
        }
        showClarify(msg, "semantic");
      }
    });
  }
})();
