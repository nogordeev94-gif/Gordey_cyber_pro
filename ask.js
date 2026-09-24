(function () {
  var form = document.getElementById("ask-form");
  var input = document.getElementById("question");
  var clarify = document.getElementById("clarify");
  var clarifyText = document.getElementById("clarify-text");
  var clarifyYes = document.getElementById("clarify-yes");
  var clarifyNo = document.getElementById("clarify-no");

  var pendingQuestion = "";
  var pendingClarification = null;
  var confirmedTerms = [];
  var rejectedTerms = new Set();

  if (!form || !input) return;

  function hideClarify() {
    if (clarify) clarify.hidden = true;
    pendingClarification = null;
  }

  function showClarify(message) {
    if (!clarify || !clarifyText) return;
    clarifyText.textContent = message;
    clarify.hidden = false;
  }

  function bootstrapAgents() {
    return SattaSynonymAgent.loadDictionary("data/synonyms.json").then(function () {
      return SattaSynonymAgent.loadEntityMap("data/entity-map.json");
    });
  }

  function runPipeline(question, analysis) {
    return SattaPipeline.runAfterSynonym(question, analysis).then(function (record) {
      if (record.status === "NEEDS_CLARIFICATION") {
        SattaPipeline.savePipelineLog(record);
      }
      window.location.href = "logs.html";
    });
  }

  function finishSynonymPhase(question) {
    var analysis = SattaSynonymAgent.analyzeQuery(question);

    if (analysis.status === "NEEDS_CONFIRMATION") {
      var c = analysis.clarification;
      if (c && rejectedTerms.has(String(c.original_term).toLowerCase())) {
        analysis.status = "MATCHED";
        analysis.clarification = null;
        return runPipeline(question, analysis);
      }
      if (c) {
        pendingClarification = c;
        showClarify(c.question);
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
    pendingQuestion = q;
    confirmedTerms = [];
    rejectedTerms = new Set();
    hideClarify();

    bootstrapAgents()
      .then(function () {
        finishSynonymPhase(q);
      })
      .catch(function () {
        window.location.href = "logs.html";
      });
  });

  if (clarifyYes) {
    clarifyYes.addEventListener("click", function () {
      if (!pendingClarification || !pendingQuestion) return;
      if (pendingClarification.unknown) {
        hideClarify();
        return;
      }
      SattaSynonymAgent.saveCustomSynonym(
        pendingClarification.entryId,
        pendingClarification.original_term
      );
      confirmedTerms.push({
        term: pendingClarification.original_term,
        preferred: pendingClarification.suggested_term,
        accepted: true,
      });
      hideClarify();
      finishSynonymPhase(pendingQuestion);
    });
  }

  if (clarifyNo) {
    clarifyNo.addEventListener("click", function () {
      if (!pendingClarification || !pendingQuestion) return;
      if (!pendingClarification.unknown) {
        rejectedTerms.add(pendingClarification.original_term);
        confirmedTerms.push({
          term: pendingClarification.original_term,
          preferred: pendingClarification.suggested_term,
          accepted: false,
        });
      }
      hideClarify();
      if (!pendingClarification.unknown) {
        finishSynonymPhase(pendingQuestion);
      }
    });
  }
})();
