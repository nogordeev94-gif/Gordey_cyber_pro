(function () {
  var STORAGE_KEY = "satta:normalize-logs";
  var flow = document.getElementById("log-flow");
  var empty = document.getElementById("log-empty");
  var history = document.getElementById("log-history");
  var originalEl = document.getElementById("log-original");
  var normalizedEl = document.getElementById("log-normalized");
  var note = document.getElementById("log-note");

  var logs = [];
  try {
    logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (e) {
    logs = [];
  }

  if (!logs.length) return;

  var latest = logs[logs.length - 1];
  originalEl.textContent = latest.original;
  normalizedEl.textContent = latest.normalized;
  flow.hidden = false;
  empty.hidden = true;

  if (note && latest.clarifications && latest.clarifications.length) {
    note.hidden = false;
    note.innerHTML = latest.clarifications
      .map(function (c) {
        if (c.accepted) {
          return (
            "Добавлено в словарь: <strong>" +
            c.term +
            "</strong> → <strong>" +
            c.preferred +
            "</strong>"
          );
        }
        return "Не добавлено: «" + c.term + "» (пользователь ответил «нет»)";
      })
      .join("<br />");
  }

  if (logs.length > 1) {
    history.hidden = false;
    history.innerHTML = logs
      .slice()
      .reverse()
      .slice(1, 6)
      .map(function (item) {
        return (
          "<li><strong>" +
          new Date(item.ts).toLocaleString("ru-RU") +
          "</strong><br />" +
          item.original +
          " → " +
          item.normalized +
          "</li>"
        );
      })
      .join("");
  }
})();
