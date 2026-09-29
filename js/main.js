(function () {
  const root = document.documentElement;
  const reduce = root.classList.contains("reduce");
  const intro = document.getElementById("intro");
  const nav = document.getElementById("nav");
  const fab = document.getElementById("fab");
  const navToggle = document.getElementById("navToggle");
  const quick = document.getElementById("quick");
  const quickPanel = document.getElementById("quickPanel");

  if (window.matchMedia("(max-width: 760px)").matches) {
    root.classList.add("compact");
  }

  function finishIntro() {
    root.classList.remove("is-intro");
    root.classList.add("ready");
    onScroll();
    if (!intro) return;
    intro.classList.add("leave");
    intro.setAttribute("aria-hidden", "true");
    const done = function () {
      intro.remove();
    };
    intro.addEventListener("transitionend", done, { once: true });
    window.setTimeout(done, 1000);
  }

  if (reduce) {
    root.classList.add("ready");
    if (intro) intro.remove();
  } else {
    const hold = root.classList.contains("compact") ? 3150 : 4450;
    const skip = document.getElementById("skipIntro");
    let closed = false;
    const close = function () {
      if (closed) return;
      closed = true;
      finishIntro();
    };
    window.setTimeout(close, hold);
    if (skip) skip.addEventListener("click", close);
  }

  const onScroll = function () {
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 8);
    const navLinks = Array.prototype.slice.call(document.querySelectorAll("[data-nav]"));
    const sections = navLinks
      .map(function (link) {
        return document.querySelector(link.getAttribute("href"));
      })
      .filter(Boolean);
    if (!sections.length) return;
    let current = sections[0];
    let best = -Infinity;
    sections.forEach(function (section) {
      const top = section.getBoundingClientRect().top;
      if (top <= 140 && top > best) {
        best = top;
        current = section;
      }
    });
    navLinks.forEach(function (link) {
      const on = link.getAttribute("href") === "#" + current.id;
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if ("IntersectionObserver" in window) {
    const reveal = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          reveal.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
    document.querySelectorAll(".reveal").forEach(function (node) {
      reveal.observe(node);
    });
  } else {
    document.querySelectorAll(".reveal").forEach(function (node) {
      node.classList.add("in");
    });
  }

  let opener = null;
  let menuOpen = false;

  function focusable() {
    return quickPanel.querySelectorAll("a, button");
  }

  function setMenu(open, trigger) {
    menuOpen = open;
    quick.classList.toggle("open", open);
    quick.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) quick.removeAttribute("inert");
    else quick.setAttribute("inert", "");
    root.classList.toggle("menu-open", open);
    fab.setAttribute("aria-expanded", open ? "true" : "false");
    if (navToggle) navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    fab.querySelector(".fab-label").textContent = open ? "Close" : "Index";
    if (open) {
      opener = trigger || fab;
      const first = focusable()[0];
      if (first) first.focus();
    } else if (opener) {
      opener.focus();
    }
  }

  function toggleFrom(trigger) {
    setMenu(!menuOpen, trigger);
  }

  fab.addEventListener("click", function () { toggleFrom(fab); });
  if (navToggle) navToggle.addEventListener("click", function () { toggleFrom(navToggle); });

  quick.querySelector(".quick-backdrop").addEventListener("click", function () {
    setMenu(false);
  });

  quick.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      if (link.getAttribute("href").charAt(0) === "#") setMenu(false);
    });
  });

  const orbit = document.getElementById("orbit");
  const heroTitle = document.querySelector(".hero h1");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  if (!reduce && finePointer) {
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let live = true;

    window.addEventListener("pointermove", function (event) {
      if (event.pointerType && event.pointerType !== "mouse") return;
      tx = event.clientX / window.innerWidth - 0.5;
      ty = event.clientY / window.innerHeight - 0.5;
    }, { passive: true });

    const loop = function () {
      if (!live) return;
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      if (orbit) {
        orbit.style.transform = "rotateX(" + (-6 - cy * 12).toFixed(2) + "deg) rotateY(" + (cx * 18).toFixed(2) + "deg)";
      }
      if (heroTitle) {
        heroTitle.style.transform = "rotateX(" + (-cy * 4).toFixed(2) + "deg) rotateY(" + (cx * 6).toFixed(2) + "deg)";
      }
      window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);

    document.addEventListener("visibilitychange", function () {
      const next = !document.hidden;
      if (next && !live) window.requestAnimationFrame(loop);
      live = next;
    });

    const bindTilt = function (selector, max, lift) {
      document.querySelectorAll(selector).forEach(function (el) {
        el.addEventListener("pointermove", function (event) {
          if (event.pointerType && event.pointerType !== "mouse") return;
          const rect = el.getBoundingClientRect();
          const px = (event.clientX - rect.left) / rect.width - 0.5;
          const py = (event.clientY - rect.top) / rect.height - 0.5;
          el.classList.add("is-tilting");
          el.style.transform = "translateY(" + lift + "px) rotateX(" + (-py * max).toFixed(2) + "deg) rotateY(" + (px * max).toFixed(2) + "deg)";
        });
        el.addEventListener("pointerleave", function () {
          el.classList.remove("is-tilting");
          el.style.transform = "";
        });
      });
    };

    bindTilt(".study", 9, 0);
    bindTilt(".card", 8, -6);
  }

  document.addEventListener("keydown", function (event) {
    if (!menuOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setMenu(false);
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = focusable();
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
