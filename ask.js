(function () {
  var form = document.getElementById("ask-form");
  var input = document.getElementById("question");
  var answer = document.getElementById("answer");
  var answerText = document.getElementById("answer-text");
  var STORAGE_KEY = "satta:normalize-logs";

  if (!form || !input) return;

  function saveLog(original, normalized) {
    var logs = [];
    try {
      logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
      logs = [];
    }
    logs.push({ original: original, normalized: normalized, ts: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(-50)));
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) {
      input.focus();
      return;
    }

    SattaSynonymAgent.loadDictionary("data/synonyms.json")
      .then(function () {
        var normalized = SattaSynonymAgent.normalizeQuery(q);
        saveLog(q, normalized);
        window.location.href = "logs.html";
      })
      .catch(function () {
        saveLog(q, q);
        if (answerText) {
          answerText.textContent =
            "Агент синонимов недоступен. Проверьте файл data/synonyms.json.";
          answer.hidden = false;
        }
      });
  });
})();
