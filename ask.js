(function () {
  var form = document.getElementById("ask-form");
  var input = document.getElementById("question");
  var clarify = document.getElementById("clarify");
  var clarifyText = document.getElementById("clarify-text");
  var clarifyYes = document.getElementById("clarify-yes");
  var clarifyNo = document.getElementById("clarify-no");
  var STORAGE_KEY = "satta:normalize-logs";

  var pendingQuestion = "";
  var pendingSuggestion = null;
  var confirmedTerms = [];

  if (!form || !input) return;

  function saveLog(original, normalized, meta) {
    var logs = [];
    try {
      logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
      logs = [];
    }
    logs.push({
      original: original,
      normalized: normalized,
      ts: Date.now(),
      clarifications: meta && meta.clarifications ? meta.clarifications : [],
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-50)));
  }

  function hideClarify() {
    if (clarify) clarify.hidden = true;
    pendingSuggestion = null;
  }

  function showClarify(suggestion) {
    pendingSuggestion = suggestion;
    if (!clarify || !clarifyText) return;
    clarifyText.textContent =
      'Термин «' +
      suggestion.term +
      '» — вы имели в виду «' +
      suggestion.preferred +
      '»?';
    clarify.hidden = false;
  }

  function finishFlow(question) {
    var normalized = SattaSynonymAgent.normalizeQuery(question);
    saveLog(question, normalized, { clarifications: confirmedTerms.slice() });
    window.location.href = "logs.html";
  }

  var rejectedTerms = new Set();

  function processQuestion(question) {
    var unclear = SattaSynonymAgent.findUnclearTerms(question).filter(function (s) {
      return !rejectedTerms.has(s.term);
    });
    if (unclear.length) {
      showClarify(unclear[0]);
      return;
    }
    finishFlow(question);
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

    SattaSynonymAgent.loadDictionary("data/synonyms.json")
      .then(function () {
        processQuestion(q);
      })
      .catch(function () {
        saveLog(q, q, { clarifications: [] });
        window.location.href = "logs.html";
      });
  });

  if (clarifyYes) {
    clarifyYes.addEventListener("click", function () {
      if (!pendingSuggestion || !pendingQuestion) return;
      SattaSynonymAgent.saveCustomSynonym(
        pendingSuggestion.entryId,
        pendingSuggestion.term
      );
      confirmedTerms.push({
        term: pendingSuggestion.term,
        preferred: pendingSuggestion.preferred,
        accepted: true,
      });
      hideClarify();
      processQuestion(pendingQuestion);
    });
  }

  if (clarifyNo) {
    clarifyNo.addEventListener("click", function () {
      if (!pendingSuggestion || !pendingQuestion) return;
      confirmedTerms.push({
        term: pendingSuggestion.term,
        preferred: pendingSuggestion.preferred,
        accepted: false,
      });
      rejectedTerms.add(pendingSuggestion.term);
      hideClarify();
      processQuestion(pendingQuestion);
    });
  }
})();
