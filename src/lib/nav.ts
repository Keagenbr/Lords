// Switch active menu (Main / Specials / Drinks)
const tabs = document.querySelectorAll(".tab-btn");
const menuGroups = document.querySelectorAll(".menu-group");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.getAttribute("data-menu");

    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    menuGroups.forEach((group) => {
      if (group.id === `menu-${target}`) {
        group.classList.remove("hidden");
        group.classList.add("active");
      } else {
        group.classList.add("hidden");
        group.classList.remove("active");
      }
    });
  });
});

// Filter items live using input search
const searchInput = document.getElementById("menu-search") as HTMLInputElement;

searchInput?.addEventListener("input", (e) => {
  const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
  const items = document.querySelectorAll(".menu-item");

  items.forEach((item) => {
    const name = item.getAttribute("data-name") || "";
    const tags = item.getAttribute("data-tags") || "";
    const match = name.includes(query) || tags.includes(query);

    (item as HTMLElement).style.display = match ? "block" : "none";
  });
});
