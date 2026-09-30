// src/scripts/passwordToggle.ts
//
// Show / hide for password fields marked up as:
//   <div class="pw-wrap" data-pw-field>
//     <input class="pw-input" type="password" ...>
//     <button type="button" class="pw-toggle">...</button>
//   </div>
//
// Mouse devices: the password is visible while the pointer is over the eye.
// Touch devices: tap the eye to show, tap again to hide.
// Keyboard: Enter / Space on the focused button toggles it.

const canHover = () =>
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

document.querySelectorAll<HTMLElement>("[data-pw-field]").forEach((field) => {
  const input = field.querySelector<HTMLInputElement>("input");
  const button = field.querySelector<HTMLButtonElement>(".pw-toggle");
  if (!input || !button) return;

  let pinned = false; // toggled by tap / keyboard
  let hovering = false; // pointer over the eye (mouse only)

  const render = () => {
    const visible = pinned || hovering;
    input.type = visible ? "text" : "password";
    field.classList.toggle("is-visible", visible);
    button.setAttribute("aria-pressed", String(pinned));
    button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  };

  button.addEventListener("mouseenter", () => {
    if (!canHover()) return;
    hovering = true;
    render();
  });
  button.addEventListener("mouseleave", () => {
    hovering = false;
    render();
  });

  button.addEventListener("click", (event) => {
    // A real mouse click on a hover device is ignored (hover already
    // shows it). Keyboard "clicks" have detail === 0 and always toggle.
    if (canHover() && event.detail !== 0) return;
    pinned = !pinned;
    render();
  });

  // Never leave a revealed password behind when the form is sent.
  input.form?.addEventListener("submit", () => {
    pinned = false;
    hovering = false;
    render();
  });

  render();
});
