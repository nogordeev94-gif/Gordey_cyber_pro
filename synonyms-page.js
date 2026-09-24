(function () {
  var tbody = document.querySelector("#synonyms-table tbody");
  if (!tbody) return;

  function loadCustom() {
    try {
      return JSON.parse(localStorage.getItem("satta:custom-synonyms") || "{}");
    } catch (e) {
      return {};
    }
  }

  function mergeRows(base, custom) {
    return base.map(function (row) {
      var extra = custom[row.id] || [];
      var synonyms = row.synonyms.slice();
      extra.forEach(function (s) {
        if (synonyms.indexOf(s) === -1) synonyms.push(s + " (добавлено в чате)");
      });
      return {
        preferred: row.preferred,
        category: row.category,
        synonyms: synonyms,
      };
    });
  }

  fetch("data/synonyms.json")
    .then(function (r) {
      return r.json();
    })
    .then(function (rows) {
      var merged = mergeRows(rows, loadCustom());
      tbody.innerHTML = merged
        .map(function (row) {
          return (
            "<tr><td>" +
            row.preferred +
            "</td><td>" +
            row.category +
            "</td><td>" +
            row.synonyms.join(", ") +
            "</td></tr>"
          );
        })
        .join("");
    })
    .catch(function () {
      tbody.innerHTML =
        '<tr><td colspan="3">Не удалось загрузить data/synonyms.json</td></tr>';
    });
})();
