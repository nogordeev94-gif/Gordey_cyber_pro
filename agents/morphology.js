/**
 * Генерация русских словоформ для терминов словаря (не префиксный хак).
 */
(function (global) {
  var FORM_INDEX = Object.create(null);

  function uniq(arr) {
    var s = Object.create(null);
    var out = [];
    arr.forEach(function (x) {
      if (!x || s[x]) return;
      s[x] = true;
      out.push(x);
    });
    return out;
  }

  function generateRussianForms(lemma) {
    var w = String(lemma).toLowerCase().replace(/[.,]/g, "");
    if (!w || w.length < 3) return [w];

    var forms = [w];
    var stem;

    if (/ель$/.test(w)) {
      stem = w.slice(0, -1);
      forms = forms.concat(
        ["ь", "я", "ю", "ем", "е", "и", "ей", "ям", "ями", "ях"].map(function (e) {
          return stem + e;
        })
      );
    } else if (/тель$/.test(w)) {
      stem = w.slice(0, -1);
      forms = forms.concat(
        ["ь", "я", "ю", "ем", "е", "и", "ей", "ям", "ями", "ях"].map(function (e) {
          return stem + e;
        })
      );
    } else if (/ент$/.test(w)) {
      stem = w;
      forms = forms.concat(
        ["а", "у", "ом", "е", "ы", "ов", "ам", "ами", "ах"].map(function (e) {
          return stem + e;
        })
      );
    } else if (/ик$/.test(w)) {
      stem = w.slice(0, -2);
      forms = forms.concat(
        ["ик", "ика", "ику", "иком", "ике", "ики", "иков", "икам", "иками", "иках"].map(function (e) {
          return stem + e;
        })
      );
    } else if (/ия$/.test(w)) {
      stem = w.slice(0, -2);
      forms = forms.concat(
        ["ия", "ии", "ию", "ией", "ии", "ий", "иям", "иями", "иях"].map(function (e) {
          return stem + e;
        })
      );
    } else if (/а$/.test(w) && w.length > 4) {
      stem = w.slice(0, -1);
      forms = forms.concat(
        ["а", "ы", "е", "у", "ой", "е", "ам", "ами", "ах"].map(function (e) {
          return stem + e;
        })
      );
    } else if (/о$/.test(w) && w.length > 4) {
      stem = w.slice(0, -1);
      forms = forms.concat(
        ["о", "а", "у", "ом", "е", "ам", "ами", "ах"].map(function (e) {
          return stem + e;
        })
      );
    } else if (/ь$/.test(w)) {
      stem = w.slice(0, -1);
      forms = forms.concat(
        ["ь", "и", "и", "ью", "и", "ей", "ям", "ями", "ях"].map(function (e) {
          return stem + e;
        })
      );
    } else {
      stem = w;
      forms = forms.concat(
        ["а", "у", "ом", "е", "ы", "ов", "ам", "ами", "ах"].map(function (e) {
          return stem + e;
        })
      );
    }

    return uniq(forms);
  }

  function capitalizePreferred(text) {
    var s = String(text || "").trim();
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function registerLemma(lemma, meta) {
    generateRussianForms(lemma).forEach(function (form) {
      if (!form) return;
      if (!FORM_INDEX[form]) FORM_INDEX[form] = meta;
    });
  }

  function buildFromDictionary(entries) {
    FORM_INDEX = Object.create(null);
    (entries || []).forEach(function (entry) {
      var canonical = capitalizePreferred(entry.preferred);
      var meta = {
        entryId: entry.id,
        canonical: canonical,
        preferred: entry.preferred,
      };
      var pref = String(entry.preferred || "").toLowerCase().trim();
      if (pref.indexOf(" ") < 0 && pref.length >= 3) {
        registerLemma(pref, meta);
      } else if (pref) {
        FORM_INDEX[pref] = meta;
      }
      (entry.synonyms || []).forEach(function (syn) {
        var s = String(syn).toLowerCase().trim();
        if (!s) return;
        if (s.indexOf(" ") < 0 && s.length >= 3) {
          registerLemma(s, meta);
        } else {
          FORM_INDEX[s] = meta;
        }
      });
    });
  }

  function resolveForm(token) {
    var t = String(token || "").toLowerCase();
    return FORM_INDEX[t] || null;
  }

  global.SattaMorphology = {
    buildFromDictionary: buildFromDictionary,
    resolveForm: resolveForm,
    generateRussianForms: generateRussianForms,
    capitalizePreferred: capitalizePreferred,
  };
})(typeof window !== "undefined" ? window : globalThis);
