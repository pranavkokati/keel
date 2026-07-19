/**
 * Runtime QA — the answer to the single biggest capability gap between Keel
 * and the frontier (Replit Agent 3's headline feature): checking whether a
 * generated app actually WORKS when interacted with, not just whether it
 * compiles. Verdict (engine.js) is a static check — contrast, spacing, DOM
 * structure. Self-heal (selfHeal.js) is a build check — does esbuild throw.
 * Neither one ever clicks anything. This module does.
 *
 * It runs inside the same live preview iframe Verdict already instruments
 * (see inject.js), so it needs no headless browser, no server, no extra
 * infrastructure — it's already sitting in a real DOM with the real
 * generated app rendered. It clicks every safely-clickable interactive
 * element, watches for thrown errors, and reports back what actually broke.
 *
 * Deliberate, stated safety scope limit: this NEVER submits a <form>.
 * Keel-generated apps can have real onSubmit handlers wired to a live
 * Supabase table (see src/lib/generation/backendProvision.js) — an
 * automated QA pass that actually fires those would write real junk rows
 * into a real database on every single generation. That's an unacceptable
 * side effect for a feature whose entire point is safety and trust, so
 * forms are checked structurally only (does a submit control exist, is it
 * disabled) and never triggered. Real external links (different origin,
 * target=_blank, or an href that isn't `#`/relative/javascript:void) are
 * also skipped rather than followed, for the same reason — this harness
 * should never cause a real network side effect anywhere.
 */

export const RUNTIME_QA_SCRIPT = `
(function () {
  if (window.__keelRuntimeQaRun) return;

  var MAX_ELEMENTS = 25;
  var SETTLE_MS = 120;

  function cssSelector(el) {
    if (el.id) return "#" + el.id;
    var parts = [], node = el, depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
      var part = node.tagName.toLowerCase();
      if (node.classList.length) part += "." + Array.from(node.classList).slice(0, 2).join(".");
      parts.unshift(part);
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  function isExternalOrUnsafeLink(el) {
    if (el.tagName !== "A") return false;
    var href = el.getAttribute("href") || "";
    if (href === "" || href === "#") return false;
    if (href.startsWith("/") || href.startsWith("./") || href.startsWith("../")) return false;
    if (el.target === "_blank") return true;
    try {
      var url = new URL(href, window.location.href);
      return url.origin !== window.location.origin;
    } catch (e) {
      return true; // can't resolve it -> treat as unsafe, skip
    }
  }

  function isInsideForm(el) {
    return Boolean(el.closest && el.closest("form"));
  }

  function isSubmitControl(el) {
    var type = (el.getAttribute("type") || "").toLowerCase();
    return type === "submit" || (el.tagName === "BUTTON" && isInsideForm(el) && type !== "button" && type !== "reset");
  }

  function visible(el) {
    var rect = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
  }

  function findCandidates() {
    var selector = 'button, a, [role="button"], [role="tab"], [role="menuitem"], input[type="checkbox"], input[type="radio"]';
    return Array.from(document.querySelectorAll(selector)).filter(visible);
  }

  function findForms() {
    return Array.from(document.querySelectorAll("form"));
  }

  function checkForms() {
    return findForms().map(function (form) {
      var submitControl = form.querySelector('button[type="submit"], input[type="submit"], button:not([type="button"]):not([type="reset"])');
      var requiredInputs = Array.from(form.querySelectorAll("[required]"));
      return {
        selector: cssSelector(form),
        hasSubmitControl: Boolean(submitControl),
        submitControlDisabled: submitControl ? Boolean(submitControl.disabled) : null,
        requiredFieldCount: requiredInputs.length,
      };
    });
  }

  function withErrorCapture(fn) {
    var caught = [];
    var origOnError = window.onerror;
    var origOnRejection = window.onunhandledrejection;
    var origConsoleError = console.error;

    window.onerror = function (msg) { caught.push(String(msg)); return true; };
    window.onunhandledrejection = function (ev) { caught.push("Unhandled promise rejection: " + String(ev.reason && ev.reason.message || ev.reason)); };
    console.error = function () {
      caught.push(Array.prototype.slice.call(arguments).map(String).join(" "));
      origConsoleError.apply(console, arguments);
    };

    try {
      fn();
    } catch (syncErr) {
      caught.push(String(syncErr && syncErr.message || syncErr));
    }

    return new Promise(function (resolve) {
      setTimeout(function () {
        window.onerror = origOnError;
        window.onunhandledrejection = origOnRejection;
        console.error = origConsoleError;
        resolve(caught);
      }, SETTLE_MS);
    });
  }

  async function run() {
    var candidates = findCandidates()
      .filter(function (el) { return !isExternalOrUnsafeLink(el) && !isSubmitControl(el); })
      .slice(0, MAX_ELEMENTS);

    var issues = [];
    var testedCount = 0;

    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      // Re-check visibility right before interacting — an earlier click in
      // this same pass may have unmounted or hidden this element (e.g. a
      // modal closing, a tab switching away). Skip rather than force it.
      if (!document.body.contains(el) || !visible(el)) continue;

      testedCount++;
      var selector = cssSelector(el);
      var errors = await withErrorCapture(function () {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      });

      if (errors.length > 0) {
        issues.push({ selector: selector, tag: el.tagName.toLowerCase(), errors: errors.slice(0, 3) });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      testedCount: testedCount,
      brokenCount: issues.length,
      issues: issues,
      forms: checkForms(),
      note: "Form submission is never triggered (safety: could write real data to a live backend). Forms are checked structurally only.",
    };
  }

  window.__keelRuntimeQaRun = run;
})();
`;

/** Agent-pasteable summary of a runtime QA result, same shape/spirit as verdict/engine.js's formatFixListForAgent. */
export function formatRuntimeQaForAgent(result) {
  if (!result) return '';
  const lines = [`Runtime QA: clicked ${result.testedCount} interactive element(s), ${result.brokenCount} threw an error.`];
  for (const issue of result.issues) {
    lines.push(`  - [${issue.selector}] (${issue.tag}): ${issue.errors.join(' | ')}`);
  }
  const emptyForms = result.forms.filter((f) => !f.hasSubmitControl);
  if (emptyForms.length > 0) {
    lines.push(`${emptyForms.length} form(s) have no submit control: ${emptyForms.map((f) => f.selector).join(', ')}`);
  }
  const disabledForms = result.forms.filter((f) => f.submitControlDisabled);
  if (disabledForms.length > 0) {
    lines.push(`${disabledForms.length} form(s) have a disabled submit control: ${disabledForms.map((f) => f.selector).join(', ')}`);
  }
  return lines.join('\n');
}
