(function () {
  var STORAGE_KEY = "satta:pipeline-logs";
  var root = document.getElementById("pipeline-root");
  var empty = document.getElementById("log-empty");
  var history = document.getElementById("log-history");

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function preJson(obj) {
    return esc(JSON.stringify(obj, null, 2));
  }

  function attrBox(label, obj) {
    if (!obj || (typeof obj === "object" && !Object.keys(obj).length)) return "";
    return (
      "<p class='pipe-meta'><strong>" +
      esc(label) +
      "</strong></p><pre class='pipe-json'>" +
      preJson(obj) +
      "</pre>"
    );
  }

  function step(title, bodyHtml) {
    return (
      '<section class="pipe-step">' +
      '<h2 class="pipe-step__title">' +
      esc(title) +
      "</h2>" +
      bodyHtml +
      "</section>"
    );
  }

  function renderRecord(record) {
    var html = "";
    html += step(
      "STEP 1 — User Query",
      '<p class="pipe-text">' + esc(record.user_query) + "</p>"
    );

    var syn = record.synonym || {};
    var termsHtml = (syn.terms || [])
      .map(function (t) {
        return (
          "<li><code>" +
          esc(t.original) +
          "</code> → <strong>" +
          esc(t.normalized || t.canonical || "—") +
          "</strong> <span class='pipe-meta'>[" +
          esc(t.type || "—") +
          "] (" +
          esc(t.match_type) +
          ", " +
          (t.confidence != null ? t.confidence.toFixed(2) : "—") +
          ")</span></li>"
        );
      })
      .join("");
    html += step(
      "STEP 2 — Synonym Agent",
      "<p class='pipe-meta'>status: <strong>" +
        esc(syn.status) +
        "</strong></p>" +
        "<p class='pipe-text'>" +
        esc(syn.normalized_query) +
        "</p>" +
        "<ul class='pipe-list'>" +
        termsHtml +
        "</ul>" +
        (syn.clarification
          ? "<p class='pipe-note'>" + esc(syn.clarification.question || "") + "</p>"
          : "") +
        attrBox("Важные атрибуты (Synonym)", syn.extracted_attributes)
    );

    if (record.status === "NEEDS_CLARIFICATION" && record.semantic) {
      html += step(
        "STEP 3 — Semantic Layer Agent",
        "<div class='semantic-panel'>" +
          "<p class='semantic-panel__badge'>NEEDS CLARIFICATION</p>" +
          "<p class='pipe-text'>" +
          esc(record.semantic.clarification.question) +
          "</p></div>"
      );
      return html;
    }

    var sem = record.semantic || {};
    var ui = sem.ui || {};
    html += step(
      "STEP 3 — Semantic Layer Agent",
      "<div class='semantic-panel'>" +
        "<p class='semantic-panel__badge'>SEMANTIC LAYER</p>" +
        "<dl class='semantic-dl'>" +
        "<dt>Intent</dt><dd>" +
        esc(sem.intent) +
        "</dd>" +
        "<dt>Operation</dt><dd><code>" +
        esc(ui.operation || (sem.semantic_query && sem.semantic_query.operation)) +
        "</code></dd>" +
        "<dt>Entity</dt><dd>" +
        esc(ui.entity) +
        "</dd>" +
        "<dt>Dimensions</dt><dd>" +
        esc(
          (ui.dimensions || [])
            .map(function (d) {
              return d.label || d.value || d.attribute;
            })
            .join(", ") || "—"
        ) +
        "</dd>" +
        "<dt>Period / Date</dt><dd>" +
        esc(
          (ui.time && (ui.time.label || ui.time.from)) ||
            (sem.semantic_query && sem.semantic_query.time && sem.semantic_query.time.from) ||
            "—"
        ) +
        "</dd>" +
        attrBox("Унаследовано от Synonym", ui.inherited_attributes || sem.inherited_attributes) +
        "<dt>Required entities</dt><dd>" +
        esc((ui.required_entities || []).join(", ")) +
        "</dd>" +
        "<dt>Business rules</dt><dd>" +
        esc((sem.business_rules || []).join("; ")) +
        "</dd>" +
        "</dl></div>"
    );

    html += step(
      "STEP 4 — Semantic Query",
      "<pre class='pipe-json'>" + preJson(sem.semantic_query) + "</pre>" +
        "<p class='pipe-meta'>Evidence</p><pre class='pipe-json'>" +
        preJson(sem.evidence_requirements) +
        "</pre>"
    );

    var sql = record.sql || {};
    var trace = record.attribute_trace || {};
    html += step(
      "STEP 5 — SQL Agent",
      "<pre class='pipe-sql'>" + esc(sql.sql) + "</pre>" +
        "<p class='pipe-meta'>mapping: " +
        esc(sql.mapping_version) +
        "</p>" +
        attrBox("Фильтры SQL", sql.applied_filters || trace.sql_filters)
    );

    html += step(
      "STEP 6 — Execution",
      attrBox("Применённые фильтры", sql.execution && sql.execution.applied_filters) +
        "<pre class='pipe-json'>" +
        preJson(sql.execution) +
        "</pre>"
    );

    html += step(
      "STEP 7 — Final Answer",
      "<pre class='pipe-answer'>" + esc(record.final_answer) + "</pre>"
    );

    return html;
  }

  var logs = [];
  try {
    logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (e) {
    logs = [];
  }

  if (!logs.length) return;

  var latest = logs[logs.length - 1];
  root.innerHTML = renderRecord(latest);
  root.hidden = false;
  empty.hidden = true;

  if (logs.length > 1 && history) {
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
          esc(item.user_query) +
          "</li>"
        );
      })
      .join("");
  }
})();
