(function () {
  var graphEl = document.getElementById("ontology-graph");
  var detailEl = document.getElementById("ontology-detail");
  if (!graphEl) return;

  var nodes = [
    { id: "EconomicCapital", x: 280, y: 80 },
    { id: "EconomicCapitalComponent", x: 80, y: 200 },
    { id: "Portfolio", x: 480, y: 200 },
    { id: "RiskFactor", x: 80, y: 320 },
    { id: "EconomicCapitalChange", x: 280, y: 240 },
    { id: "FactorContribution", x: 280, y: 360 },
    { id: "Scenario", x: 480, y: 320 },
    { id: "Methodology", x: 480, y: 80 },
    { id: "Client", x: 600, y: 240 },
    { id: "Product", x: 600, y: 320 },
    { id: "RiskType", x: 80, y: 80 },
  ];

  var edges = [
    { from: "EconomicCapital", to: "EconomicCapitalComponent", label: "consists_of" },
    { from: "EconomicCapital", to: "Portfolio", label: "calculated_for" },
    { from: "EconomicCapital", to: "RiskFactor", label: "affected_by" },
    { from: "EconomicCapital", to: "EconomicCapitalChange", label: "has_change" },
    { from: "EconomicCapitalChange", to: "FactorContribution", label: "decomposed_by" },
    { from: "FactorContribution", to: "RiskFactor", label: "attributed_to" },
    { from: "EconomicCapital", to: "Methodology", label: "uses" },
    { from: "EconomicCapital", to: "Scenario", label: "under" },
    { from: "Portfolio", to: "Client", label: "includes" },
    { from: "Portfolio", to: "Product", label: "includes" },
    { from: "EconomicCapitalComponent", to: "RiskType", label: "by" },
  ];

  var layer = null;
  var expanded = Object.create(null);
  var selectedId = null;

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function shortLabel(id) {
    return id
      .replace("EconomicCapital", "EC")
      .replace("Component", "Comp")
      .replace("Contribution", "Contr");
  }

  function entityInfo(id) {
    var ent = layer && layer.entities && layer.entities[id];
    if (!ent) {
      return { title: id, description: "", attributes: [], operations: [] };
    }
    return ent;
  }

  function relationsFor(id) {
    return (layer.relationships || [])
      .filter(function (r) {
        return r.from === id || r.to === id;
      })
      .map(function (r) {
        if (r.from === id) return r.type + " → " + r.to;
        return r.from + " → " + r.type;
      });
  }

  function renderDetail(id) {
    selectedId = id;
    var ent = entityInfo(id);
    var rel = relationsFor(id);
    detailEl.innerHTML =
      "<h2 class='ontology-detail__title'>" +
      esc(ent.title || id) +
      "</h2>" +
      "<p class='ontology-detail__id'><code>" +
      esc(id) +
      "</code></p>" +
      "<p class='ontology-detail__desc'>" +
      esc(ent.description || "Сущность семантического слоя Economic Capital.") +
      "</p>" +
      "<p><strong>Атрибуты</strong><br />" +
      esc((ent.attributes || []).join(", ") || "—") +
      "</p>" +
      "<p><strong>Операции</strong><br />" +
      esc((ent.operations || []).join(", ") || "—") +
      "</p>" +
      "<p><strong>Связи</strong><br />" +
      (rel.length ? rel.map(esc).join("<br />") : "—") +
      "</p>";
  }

  function cardHtml(id) {
    var ent = entityInfo(id);
    var rel = relationsFor(id).slice(0, 4);
    return (
      '<div xmlns="http://www.w3.org/1999/xhtml" class="ontology-card">' +
      '<p class="ontology-card__title">' +
      esc(ent.title || id) +
      "</p>" +
      '<p class="ontology-card__text">' +
      esc(ent.description || "Сущность предметной области.") +
      "</p>" +
      (ent.attributes && ent.attributes.length
        ? '<p class="ontology-card__meta"><strong>Атрибуты:</strong> ' +
          esc(ent.attributes.join(", ")) +
          "</p>"
        : "") +
      (ent.operations && ent.operations.length
        ? '<p class="ontology-card__meta"><strong>Операции:</strong> ' +
          esc(ent.operations.join(", ")) +
          "</p>"
        : "") +
      (rel.length
        ? '<p class="ontology-card__meta"><strong>Связи:</strong> ' + esc(rel.join("; ")) + "</p>"
        : "") +
      '<p class="ontology-card__hint">Повторный клик — свернуть</p></div>'
    );
  }

  function draw() {
    var svg =
      '<svg viewBox="0 0 720 520" role="img" aria-label="Граф онтологии" class="ontology-svg">';
    edges.forEach(function (e) {
      var a = nodes.find(function (n) {
        return n.id === e.from;
      });
      var b = nodes.find(function (n) {
        return n.id === e.to;
      });
      if (!a || !b) return;
      svg +=
        '<line class="ontology-edge" x1="' +
        a.x +
        '" y1="' +
        a.y +
        '" x2="' +
        b.x +
        '" y2="' +
        b.y +
        '" />';
    });

    nodes.forEach(function (n) {
      var isExpanded = !!expanded[n.id];
      var isSelected = selectedId === n.id;
      var gClass =
        "ontology-node" +
        (isExpanded ? " ontology-node--expanded" : "") +
        (isSelected ? " ontology-node--selected" : "");
      svg +=
        '<g class="' +
        gClass +
        '" data-id="' +
        n.id +
        '" transform="translate(' +
        n.x +
        "," +
        n.y +
        ')">' +
        '<circle class="ontology-node__hit" r="' +
        (isExpanded ? 32 : 28) +
        '" />' +
        '<text class="ontology-node__label" text-anchor="middle" y="4">' +
        esc(shortLabel(n.id)) +
        "</text>" +
        '<text class="ontology-node__chevron" text-anchor="middle" y="22" font-size="10">' +
        (isExpanded ? "▲" : "▼") +
        "</text>";

      if (isExpanded) {
        svg +=
          '<foreignObject class="ontology-node__fo" x="-110" y="38" width="220" height="200" pointer-events="all">' +
          cardHtml(n.id) +
          "</foreignObject>";
      }
      svg += "</g>";
    });
    svg += "</svg>";
    graphEl.innerHTML = svg;

    graphEl.querySelectorAll(".ontology-node").forEach(function (g) {
      g.addEventListener("click", function (ev) {
        if (ev.target.closest && ev.target.closest(".ontology-card")) return;
        var id = g.getAttribute("data-id");
        if (expanded[id]) {
          delete expanded[id];
        } else {
          expanded[id] = true;
        }
        renderDetail(id);
        draw();
      });
    });
  }

  fetch("data/semantic-layer.json")
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      layer = data;
      expanded.EconomicCapital = true;
      draw();
      renderDetail("EconomicCapital");
    })
    .catch(function () {
      draw();
    });
})();
