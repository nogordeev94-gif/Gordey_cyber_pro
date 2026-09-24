(function () {
  var STORAGE_KEY = "satta:normalize-logs";
  var flow = document.getElementById("log-flow");
  var empty = document.getElementById("log-empty");
  var history = document.getElementById("log-history");
  var originalEl = document.getElementById("log-original");
  var normalizedEl = document.getElementById("log-normalized");

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
