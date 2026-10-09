// Double-submit guard for plain HTML forms (login pages).
//
// Why: a button that is greyed out BEFORE the form is ready tells people
// nothing, so we leave submit buttons enabled and let the browser's own
// validation explain what is missing. We only disable the button AFTER a
// valid submit has started, so a second click can't send the request twice.

document.querySelectorAll<HTMLFormElement>("form[data-login-form]").forEach(
  (form) => {
    const button = form.querySelector<HTMLButtonElement>(
      "button[type='submit']",
    );
    if (!button) return;

    const originalLabel = button.textContent?.trim() ?? "";
    const busyLabel = button.dataset.submitLabel || "Please wait...";

    // "submit" only fires once the browser's required/type checks pass.
    form.addEventListener("submit", (event) => {
      // A second submit while the first is in flight: ignore it.
      if (button.dataset.busy === "true") {
        event.preventDefault();
        return;
      }
      button.dataset.busy = "true";
      button.setAttribute("aria-busy", "true");
      button.textContent = busyLabel;
      // Disable on the next tick: disabling synchronously can stop the
      // form from submitting in some browsers.
      setTimeout(() => (button.disabled = true), 0);
    });

    // Back/forward cache restores the page as it was; reset the button so
    // the person isn't stuck on "Signing in..." after pressing Back.
    window.addEventListener("pageshow", () => {
      button.disabled = false;
      button.textContent = originalLabel;
      delete button.dataset.busy;
      button.removeAttribute("aria-busy");
    });
  },
);
