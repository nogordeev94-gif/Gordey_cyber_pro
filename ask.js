(function () {
  var form = document.getElementById("ask-form");
  var input = document.getElementById("question");
  var answer = document.getElementById("answer");
  var answerText = document.getElementById("answer-text");

  if (!form || !input) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) {
      input.focus();
      return;
    }

    answerText.textContent =
      "Здесь появится ответ по экономическому капиталу с контекстом (период, портфель, сценарий). Сейчас это превью интерфейса — подключение к данным настраивается отдельно.";
    answer.hidden = false;
  });
})();
