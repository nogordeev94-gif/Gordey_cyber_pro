(function () {
  var tbody = document.querySelector("#synonyms-table tbody");
  if (!tbody) return;

  fetch("data/synonyms.json")
    .then(function (r) {
      return r.json();
    })
    .then(function (rows) {
      tbody.innerHTML = rows
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
