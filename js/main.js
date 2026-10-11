(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = root.classList.contains("reduce");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/\\";

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- sound: scroll-reactive score + UI ticks (off by default) ---------- */

  var sound = (function () {
    var btn = document.getElementById("soundToggle");
    var label = btn && btn.querySelector(".sound-label");
    var Ctx = window.AudioContext || window.webkitAudioContext;
    // A licensed track named in data-track on the button replaces the generated score.
    var TRACK_URL = btn && btn.getAttribute("data-track");
    var MASTER = 0.5;

    // One slow chord per scene: [bass, ...voices] as MIDI notes.
    var CHORDS = [
      [45, 57, 60, 64],
      [41, 57, 60, 65],
      [48, 55, 60, 64],
      [43, 55, 59, 62],
      [40, 55, 59, 64],
      [41, 57, 60, 64],
      [45, 57, 59, 64]
    ];

    var ac = null;
    var on = false;
    var lastTick = 0;
    var bus = null;
    var voices = [];
    var trackEl = null;
    var mode = null;
    var scene = 1;
    var intensity = 0.3;
    var clockRate = 0;
    var clockTimer = null;
    var swell = 0;

    function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

    function impulse(seconds) {
      var rate = ac.sampleRate;
      var len = Math.floor(rate * seconds);
      var buf = ac.createBuffer(2, len, rate);
      for (var c = 0; c < 2; c++) {
        var d = buf.getChannelData(c);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      return buf;
    }

    function buildBus() {
      var master = ac.createGain();
      master.gain.value = 0;
      var filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 700;
      filter.Q.value = 0.5;
      var verb = ac.createConvolver();
      verb.buffer = impulse(5);
      var wet = ac.createGain();
      wet.gain.value = 0.6;
      var dry = ac.createGain();
      dry.gain.value = 0.55;
      var input = ac.createGain();
      input.connect(filter);
      filter.connect(dry).connect(master);
      filter.connect(verb).connect(wet).connect(master);
      master.connect(ac.destination);
      var fx = ac.createGain();
      fx.gain.value = 1;
      fx.connect(verb);
      fx.connect(master);
      return { master: master, filter: filter, input: input, fx: fx };
    }

    function organVoice(freq, level, t) {
      var out = ac.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(level, t + 3.5);
      out.connect(bus.input);
      var oscs = [];
      [[1, 1], [2, 0.32], [4, 0.1]].forEach(function (p) {
        [-4, 4].forEach(function (cents) {
          var o = ac.createOscillator();
          var g = ac.createGain();
          o.type = "sine";
          o.frequency.value = freq * p[0];
          o.detune.value = cents;
          g.gain.value = p[1] * 0.5;
          o.connect(g).connect(out);
          o.start(t);
          oscs.push(o);
        });
      });
      return { out: out, oscs: oscs };
    }

    function releaseVoices(list, t) {
      list.forEach(function (v) {
        v.out.gain.cancelScheduledValues(t);
        v.out.gain.setValueAtTime(Math.max(v.out.gain.value, 0.0001), t);
        v.out.gain.exponentialRampToValueAtTime(0.0001, t + 4);
        v.oscs.forEach(function (o) { o.stop(t + 4.2); });
      });
    }

    function playChord(index) {
      if (mode !== "synth") return;
      var t = ac.currentTime;
      releaseVoices(voices, t);
      var chord = CHORDS[(index - 1 + CHORDS.length) % CHORDS.length];
      voices = chord.map(function (n, k) { return organVoice(midi(n), k === 0 ? 0.16 : 0.07, t); });
    }

    function clockTick() {
      if (!on || !ac) return;
      var t = ac.currentTime;
      var len = Math.floor(ac.sampleRate * 0.03);
      var buf = ac.createBuffer(1, len, ac.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
      var src = ac.createBufferSource();
      src.buffer = buf;
      var bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3200;
      bp.Q.value = 6;
      var g = ac.createGain();
      g.gain.value = 0.35;
      src.connect(bp).connect(g).connect(bus.fx);
      src.start(t);
    }

    function scheduleClock() {
      clearTimeout(clockTimer);
      if (!on || !clockRate) return;
      clockTick();
      clockTimer = setTimeout(scheduleClock, clockRate);
    }

    function applyMix() {
      if (!on || !bus) return;
      var t = ac.currentTime;
      var cutoff = 500 + Math.pow(intensity, 1.4) * 3200 + swell * 900;
      bus.filter.frequency.setTargetAtTime(cutoff, t, 0.6);
      var level = document.hidden ? 0 : MASTER * (0.75 + intensity * 0.25 + swell * 0.2);
      bus.master.gain.setTargetAtTime(level, t, 0.8);
    }

    function startTrack() {
      trackEl = new Audio(TRACK_URL);
      trackEl.loop = true;
      trackEl.preload = "auto";
      ac.createMediaElementSource(trackEl).connect(bus.input);
      return trackEl.play();
    }

    function start() {
      if (!ac) ac = new Ctx();
      if (ac.state === "suspended") ac.resume();
      if (!bus) bus = buildBus();
      if (mode === "track" && trackEl) { trackEl.play(); applyMix(); scheduleClock(); return; }
      if (mode === "synth") { playChord(scene); applyMix(); scheduleClock(); return; }
      if (!TRACK_URL) { mode = "synth"; playChord(scene); applyMix(); scheduleClock(); return; }
      fetch(TRACK_URL, { method: "HEAD" }).then(function (res) {
        if (!res.ok || !/audio/.test(res.headers.get("content-type") || "")) throw new Error("no track");
        mode = "track";
        return startTrack();
      }).catch(function () {
        mode = "synth";
      }).then(function () {
        if (!on) return;
        playChord(scene);
        applyMix();
        scheduleClock();
      });
    }

    function stop() {
      if (!ac || !bus) return;
      var t = ac.currentTime;
      bus.master.gain.setTargetAtTime(0, t, 0.4);
      clearTimeout(clockTimer);
      releaseVoices(voices, t);
      voices = [];
      if (trackEl) setTimeout(function () { if (!on) trackEl.pause(); }, 1500);
    }

    function tone(freq, dur, gain, type, toFx) {
      if (!on || !ac) return;
      var t = ac.currentTime;
      var osc = ac.createOscillator();
      var g = ac.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(toFx && bus ? bus.fx : ac.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }

    if (btn) {
      if (!Ctx) btn.hidden = true;
      btn.addEventListener("click", function () {
        on = !on;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
        if (label) label.textContent = on ? "Sound on" : "Sound off";
        if (on) start(); else stop();
      });
    }
    document.addEventListener("visibilitychange", applyMix);

    return {
      tick: function (fontSize) {
        var now = performance.now();
        if (now - lastTick < 52) return;
        lastTick = now;
        tone(clamp(2600 - fontSize * 14, 700, 2400), 0.025, 0.012, "square");
      },
      blip: function (i) {
        var chord = CHORDS[(scene - 1) % CHORDS.length];
        tone(midi(chord[1 + (i % 3)] + 12), 2.6, 0.06, "sine", true);
      },
      setScene: function (n) {
        if (n === scene) return;
        scene = n;
        if (on) playChord(n);
      },
      setIntensity: function (v) {
        v = clamp(v, 0, 1);
        if (Math.abs(v - intensity) < 0.01) return;
        intensity = v;
        applyMix();
      },
      setClock: function (ms) {
        if (ms === clockRate) return;
        var wasOff = !clockRate;
        clockRate = ms;
        if (on && (wasOff || !ms)) scheduleClock();
      },
      setSwell: function (v) {
        v = clamp(v, 0, 1);
        if (Math.abs(v - swell) < 0.02) return;
        swell = v;
        applyMix();
      }
    };
  })();

  function scramble(el, text, duration, done) {
    if (reduce) { el.textContent = text; if (done) done(); return; }
    var start = performance.now();
    var len = Math.max(text.length, el.textContent.length);
    (function frame(now) {
      var t = clamp((now - start) / duration, 0, 1);
      var settled = Math.floor(t * len);
      var out = "";
      for (var i = 0; i < len; i++) {
        if (i < settled) out += text.charAt(i);
        else if (i < text.length || t < 1) out += GLYPHS.charAt((Math.random() * GLYPHS.length) | 0);
      }
      el.textContent = t < 1 ? out : text;
      if (t < 1) requestAnimationFrame(frame);
      else if (done) done();
    })(start);
  }

  /* ---------- loader ---------- */

  function finishLoading() {
    root.classList.remove("is-loading");
    root.classList.add("ready");
    var loader = document.getElementById("loader");
    if (loader) loader.classList.add("done");
    startTyping();
    onScroll();
  }

  if (reduce) {
    finishLoading();
  } else {
    var lines = document.querySelectorAll(".loader-line");
    var step = 260;
    Array.prototype.forEach.call(lines, function (line, i) {
      setTimeout(function () {
        line.classList.add("on");
        var target = line.querySelector("[data-scramble]");
        scramble(target, target.getAttribute("data-scramble"), 420);
      }, 200 + i * step);
    });
    setTimeout(finishLoading, 200 + lines.length * step + 650);
  }

  /* ---------- reveal on scroll ---------- */

  var revealables = document.querySelectorAll("[data-rise], [data-reveal], .clip");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    Array.prototype.forEach.call(revealables, function (el) {
      if (!el.closest(".hero") || el.hasAttribute("data-rise")) io.observe(el);
    });
  } else {
    Array.prototype.forEach.call(revealables, function (el) { el.classList.add("in"); });
  }

  /* ---------- typewriter ---------- */

  var typeEl = document.getElementById("typeLine");
  var phrases = Array.prototype.map.call(document.querySelectorAll(".type-line-sizer span"), function (s) {
    return s.textContent.trim();
  });
  var typingStarted = false;

  function startTyping() {
    if (!typeEl || typingStarted || !phrases.length) return;
    typingStarted = true;
    var caret = typeEl.querySelector(".caret");
    var text = document.createTextNode("");
    typeEl.insertBefore(text, caret);

    if (reduce) { text.nodeValue = phrases[0]; return; }

    var prefix = "I build ";
    var p = 0;
    var i = 0;
    var deleting = false;
    text.nodeValue = "";

    (function tick() {
      var full = phrases[p];
      var delay;
      if (!deleting) {
        i++;
        text.nodeValue = full.slice(0, i);
        delay = i <= prefix.length && p > 0 ? 0 : 55 + Math.random() * 45;
        if (i >= full.length) { deleting = true; delay = 1700; }
      } else {
        i--;
        text.nodeValue = full.slice(0, i);
        delay = 28;
        if (i <= prefix.length) {
          deleting = false;
          p = (p + 1) % phrases.length;
          delay = 260;
        }
      }
      setTimeout(tick, delay);
    })();
  }

  /* ---------- hero dot field ---------- */

  (function heroField() {
    var canvas = document.getElementById("heroField");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = 0, h = 0, gap = 16, cols = 0, rows = 0;
    var mx = -9999, my = -9999, tmx = -9999, tmy = -9999;
    var visible = true;
    var BUCKETS = 10;
    var buckets = [];
    for (var b = 0; b < BUCKETS; b++) buckets.push([]);

    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      gap = w < 700 ? 13 : 16;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / gap) + 1;
      rows = Math.ceil(h / gap) + 1;
      if (reduce) draw(0);
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      for (var k = 0; k < BUCKETS; k++) buckets[k].length = 0;
      mx += (tmx - mx) * 0.08;
      my += (tmy - my) * 0.08;
      var cx = w * 0.72, cy = h * 0.42;
      var maxR = Math.max(w, h) * 0.55;
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var px = x * gap, py = y * gap;
          var wave = Math.sin(px * 0.011 + t * 0.6) * Math.cos(py * 0.014 - t * 0.45) + Math.sin((px + py) * 0.005 + t * 0.3);
          var v = (wave + 2) / 4;
          var dc = Math.hypot(px - cx, py - cy) / maxR;
          v *= clamp(1.15 - dc, 0, 1);
          var dm = Math.hypot(px - mx, py - my);
          if (dm < 200) v += (1 - dm / 200) * 0.75;
          v = clamp(v, 0, 1);
          if (v < 0.06) continue;
          buckets[Math.min(BUCKETS - 1, (v * BUCKETS) | 0)].push(px, py);
        }
      }
      for (var bi = 0; bi < BUCKETS; bi++) {
        var list = buckets[bi];
        if (!list.length) continue;
        var level = (bi + 1) / BUCKETS;
        var size = 0.8 + level * 1.8;
        var half = size / 2;
        ctx.fillStyle = "rgba(255,255,255," + (0.08 + level * 0.82).toFixed(3) + ")";
        ctx.beginPath();
        for (var j = 0; j < list.length; j += 2) ctx.rect(list[j] - half, list[j + 1] - half, size, size);
        ctx.fill();
      }
    }

    function loop(now) {
      if (visible && !document.hidden) draw(now / 1000);
      requestAnimationFrame(loop);
    }

    window.addEventListener("resize", resize);
    resize();

    if (reduce) return;
    canvas.parentElement.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      tmx = e.clientX - r.left; tmy = e.clientY - r.top;
      if (mx < -1000) { mx = tmx; my = tmy; }
    });
    canvas.parentElement.addEventListener("pointerleave", function () { tmx = tmy = -9999; mx = my = -9999; });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(canvas);
    }
    requestAnimationFrame(loop);
  })();

  /* ---------- story: evolving system ---------- */

  var STAGES = [
    { name: "Endpoint", line: "One controller, one response." },
    { name: "Persist", line: "Give the data a schema and a home." },
    { name: "Secure", line: "JWT, roles, and validated input." },
    { name: "Scale", line: "Cache hot reads. Queue the slow work." },
    { name: "Ship", line: "Containerize it, deploy it, watch it." },
    { name: "Augment", line: "Add AI where it actually helps." }
  ];
  // x/y: wide layout (900 x 460), cx/cy: compact layout (520 x 520)
  var NODES = [
    { id: "client", label: "Client", x: 450, y: 40, cx: 260, cy: 30, s: 0 },
    { id: "api", label: "REST API", x: 450, y: 130, cx: 260, cy: 110, s: 0 },
    { id: "auth", label: "Auth / JWT", x: 230, y: 130, cx: 85, cy: 110, s: 2 },
    { id: "valid", label: "Validation", x: 640, y: 130, cx: 435, cy: 110, s: 2 },
    { id: "svc", label: "Service", x: 450, y: 220, cx: 260, cy: 200, s: 1 },
    { id: "cache", label: "Redis", x: 260, y: 220, cx: 85, cy: 200, s: 3 },
    { id: "queue", label: "Queue", x: 640, y: 220, cx: 435, cy: 200, s: 3 },
    { id: "db", label: "PostgreSQL", x: 450, y: 310, cx: 260, cy: 290, s: 1 },
    { id: "worker", label: "Worker", x: 640, y: 310, cx: 435, cy: 290, s: 3 },
    { id: "ci", label: "CI / CD", x: 90, y: 310, cx: 435, cy: 380, s: 4 },
    { id: "logs", label: "Logs", x: 260, y: 310, cx: 260, cy: 470, s: 4 },
    { id: "box", label: "Docker", x: 450, y: 410, cx: 260, cy: 380, s: 4 },
    { id: "llm", label: "Spring AI", x: 835, y: 130, cx: 85, cy: 290, s: 5 },
    { id: "vec", label: "Vectors", x: 835, y: 40, cx: 85, cy: 380, s: 5 }
  ];
  var EDGES = [
    ["client", "api"], ["api", "auth"], ["api", "valid"], ["api", "svc"], ["svc", "db"],
    ["svc", "cache"], ["svc", "queue"], ["queue", "worker"], ["ci", "box"], ["logs", "box"],
    ["db", "box"], ["worker", "box"], ["svc", "llm"], ["llm", "vec"]
  ];
  var STAGE_COUNTS = STAGES.map(function (_, s) {
    return NODES.filter(function (n) { return n.s <= s; }).length;
  });

  var storyEl = document.getElementById("story");
  var evolve = document.getElementById("evolve");
  var storyValue = document.getElementById("storyValue");
  var storyStage = document.getElementById("storyStage");
  var storyLine = document.getElementById("storyLine");
  var storySteps = document.querySelectorAll("#storySteps li");
  var nodeEls = {};
  var edgeEls = [];
  var currentStage = -1;
  var shownValue = 0;
  var targetValue = 0;

  var compactQuery = window.matchMedia("(max-width: 700px)");

  function buildEvolve() {
    if (!evolve) return;
    var NS = "http://www.w3.org/2000/svg";
    var compact = compactQuery.matches;
    var fontSize = compact ? 15 : 13;
    evolve.setAttribute("viewBox", compact ? "0 0 520 520" : "0 0 900 460");
    evolve.style.setProperty("--node-font", fontSize + "px");
    evolve.innerHTML = "";
    nodeEls = {};
    edgeEls = [];
    var byId = {};
    NODES.forEach(function (n) {
      byId[n.id] = { x: compact ? n.cx : n.x, y: compact ? n.cy : n.y, s: n.s, label: n.label, id: n.id };
    });
    EDGES.forEach(function (e) {
      var a = byId[e[0]], b = byId[e[1]];
      var path = document.createElementNS(NS, "path");
      var midY = (a.y + b.y) / 2;
      path.setAttribute("d", a.x === b.x || a.y === b.y
        ? "M" + a.x + " " + a.y + " L" + b.x + " " + b.y
        : "M" + a.x + " " + a.y + " C" + a.x + " " + midY + " " + b.x + " " + midY + " " + b.x + " " + b.y);
      path.setAttribute("class", "evolve-edge");
      evolve.appendChild(path);
      edgeEls.push({ el: path, s: Math.max(a.s, b.s) });
    });
    Object.keys(byId).forEach(function (id) {
      var n = byId[id];
      var w = n.label.length * fontSize * 0.66 + 44;
      var g = document.createElementNS(NS, "g");
      g.setAttribute("class", "evolve-node");
      g.setAttribute("transform", "translate(" + n.x + " " + n.y + ")");
      g.innerHTML =
        '<rect class="evolve-halo" x="' + (-w / 2) + '" y="-19" width="' + w + '" height="38" rx="19"></rect>' +
        '<rect class="evolve-chip" x="' + (-w / 2) + '" y="-19" width="' + w + '" height="38" rx="19"></rect>' +
        '<circle class="evolve-dot" cx="' + (-w / 2 + 17) + '" r="3.2"></circle>' +
        '<text x="9" dominant-baseline="central" text-anchor="middle">' + n.label + "</text>";
      evolve.appendChild(g);
      nodeEls[n.id] = { el: g, s: n.s };
    });
    var stage = currentStage;
    currentStage = -1;
    if (stage >= 0) setStage(stage);
  }
  buildEvolve();
  if (compactQuery.addEventListener) compactQuery.addEventListener("change", buildEvolve);

  function setStage(s) {
    if (s === currentStage) return;
    currentStage = s;
    Object.keys(nodeEls).forEach(function (id) {
      var n = nodeEls[id];
      n.el.classList.toggle("on", n.s <= s);
      n.el.classList.toggle("new", n.s === s);
    });
    edgeEls.forEach(function (e) { e.el.classList.toggle("on", e.s <= s); });
    storyStage.textContent = STAGES[s].name;
    storyLine.textContent = STAGES[s].line;
    [storyStage, storyLine].forEach(function (el) {
      el.classList.remove("swap"); void el.offsetWidth; el.classList.add("swap");
    });
    targetValue = STAGE_COUNTS[s];
  }

  function tickValue() {
    if (Math.abs(targetValue - shownValue) > 0.01) {
      shownValue += (targetValue - shownValue) * 0.12;
      if (Math.abs(targetValue - shownValue) < 0.05) shownValue = targetValue;
      storyValue.textContent = pad2(Math.round(shownValue));
    }
    requestAnimationFrame(tickValue);
  }
  if (storyValue) { storyValue.textContent = "00"; requestAnimationFrame(tickValue); }

  /* ---------- craft: terminal beats ---------- */

  var beats = document.querySelectorAll(".craft-beat");
  var craftSticky = document.querySelector(".craft-sticky");
  var terminal = document.getElementById("terminal");
  var activeBeat = -1;
  var typingTimer = null;

  function terminalLine(text, typed) {
    var p = document.createElement("p");
    p.innerHTML = '<span class="terminal-prompt">›</span>';
    var node = document.createTextNode(typed ? "" : text);
    p.appendChild(node);
    terminal.appendChild(p);
    if (!typed || reduce) { node.nodeValue = text; return; }
    var caret = document.createElement("span");
    caret.className = "caret";
    p.appendChild(caret);
    var i = 0;
    (function type() {
      node.nodeValue = text.slice(0, ++i);
      if (i < text.length) typingTimer = setTimeout(type, 16 + Math.random() * 26);
      else caret.remove();
    })();
  }

  function renderTerminal(upTo) {
    if (!terminal) return;
    clearTimeout(typingTimer);
    var current = terminal.children.length;
    if (upTo + 1 < current) {
      while (terminal.children.length > upTo + 1) terminal.removeChild(terminal.lastElementChild);
      var caret = terminal.querySelector(".caret");
      if (caret) caret.remove();
      terminal.lastElementChild.childNodes[1].nodeValue = beats[upTo].getAttribute("data-line");
      return;
    }
    terminal.innerHTML = "";
    for (var k = 0; k <= upTo; k++) terminalLine(beats[k].getAttribute("data-line"), k === upTo && k >= current - 1);
  }

  function setBeat(i) {
    if (i === activeBeat) return;
    var first = activeBeat < 0;
    activeBeat = i;
    Array.prototype.forEach.call(beats, function (b, k) { b.classList.toggle("is-on", k === i); });
    renderTerminal(i);
    craftParticles.setShape(i);
    if (!first) sound.blip(i);
  }

  /* ---------- craft: morphing particle still ---------- */

  var craftParticles = (function () {
    var COUNT = 1200;
    var canvas = document.getElementById("craftStill");
    var api = { setShape: function () {} };
    if (!canvas || !canvas.getContext) return api;
    var ctx = canvas.getContext("2d");
    var TAN = Math.tan(Math.PI / 12);
    var CAM = 4.9;

    function jz() { return (Math.random() - 0.5) * 0.14; }
    function rect(cx, cy, w, h) {
      return function () {
        var r = 2 * (w + h) * Math.random();
        if (r < w) return [cx - w / 2 + r, cy - h / 2, jz()];
        r -= w;
        if (r < h) return [cx + w / 2, cy - h / 2 + r, jz()];
        r -= h;
        if (r < w) return [cx + w / 2 - r, cy + h / 2, jz()];
        r -= w;
        return [cx - w / 2, cy + h / 2 - r, jz()];
      };
    }
    function line(x1, y1, x2, y2, j) {
      j = j || 0.015;
      return function () {
        var a = Math.random();
        return [x1 + (x2 - x1) * a + (Math.random() - 0.5) * j, y1 + (y2 - y1) * a + (Math.random() - 0.5) * j, jz()];
      };
    }
    function ring(cx, cy, rx, ry, from, to) {
      from = from || 0; to = to == null ? Math.PI * 2 : to;
      return function () {
        var a = from + Math.random() * (to - from);
        return [cx + Math.cos(a) * rx, cy + Math.sin(a) * (ry == null ? rx : ry), jz()];
      };
    }
    function compose(parts) {
      var out = new Float32Array(COUNT * 3);
      var n = 0;
      parts.forEach(function (part, idx) {
        var count = idx === parts.length - 1 ? COUNT - n : Math.floor(COUNT * part.share);
        for (var k = 0; k < count && n < COUNT; k++, n++) {
          var p = part.sample();
          out[n * 3] = p[0]; out[n * 3 + 1] = p[1]; out[n * 3 + 2] = p[2];
        }
      });
      return out;
    }

    var SHAPES = [
      // Think: a four-point spark
      function () {
        return compose([{ share: 1, sample: function () {
          var a = Math.random() * Math.PI * 2;
          var r = 1.05 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 2 / 3) + Math.pow(Math.abs(Math.sin(a)), 2 / 3), 1.5);
          var f = Math.pow(Math.random(), 0.35);
          return [Math.cos(a) * r * f, Math.sin(a) * r * f, jz()];
        } }]);
      },
      // Design: connected boxes
      function () {
        return compose([
          { share: 0.22, sample: rect(-0.8, 0.45, 0.6, 0.4) },
          { share: 0.22, sample: rect(0.8, 0.45, 0.6, 0.4) },
          { share: 0.26, sample: rect(0, -0.55, 0.72, 0.42) },
          { share: 0.15, sample: line(-0.8, 0.25, -0.22, -0.34) },
          { share: 0.15, sample: line(0.8, 0.25, 0.22, -0.34) }
        ]);
      },
      // Build: a database next to a code window
      function () {
        return compose([
          { share: 0.08, sample: ring(-0.62, 0.42, 0.28, 0.08) },
          { share: 0.05, sample: ring(-0.62, 0.12, 0.28, 0.08, Math.PI, Math.PI * 2) },
          { share: 0.05, sample: ring(-0.62, -0.18, 0.28, 0.08, Math.PI, Math.PI * 2) },
          { share: 0.05, sample: ring(-0.62, -0.48, 0.28, 0.08, Math.PI, Math.PI * 2) },
          { share: 0.06, sample: line(-0.9, 0.42, -0.9, -0.48) },
          { share: 0.06, sample: line(-0.34, 0.42, -0.34, -0.48) },
          { share: 0.26, sample: rect(0.55, 0.02, 1, 0.85) },
          { share: 0.07, sample: line(0.05, 0.305, 1.05, 0.305) },
          { share: 0.02, sample: ring(0.16, 0.375, 0.02) },
          { share: 0.02, sample: ring(0.25, 0.375, 0.02) },
          { share: 0.02, sample: ring(0.34, 0.375, 0.02) },
          { share: 0.08, sample: line(0.15, 0.15, 0.75, 0.15) },
          { share: 0.07, sample: line(0.27, 0.0, 0.95, 0.0) },
          { share: 0.06, sample: line(0.27, -0.15, 0.7, -0.15) },
          { share: 0.05, sample: line(0.15, -0.3, 0.55, -0.3) }
        ]);
      },
      // Ship: a rocket with an exhaust trail
      function () {
        var pts = compose([
          { share: 0.24, sample: rect(0, 0.35, 0.38, 0.9) },
          { share: 0.05, sample: line(-0.19, 0.8, 0, 1.2) },
          { share: 0.05, sample: line(0.19, 0.8, 0, 1.2) },
          { share: 0.04, sample: ring(0, 0.5, 0.09) },
          { share: 0.05, sample: line(-0.19, 0.05, -0.46, -0.5) },
          { share: 0.04, sample: line(-0.46, -0.5, -0.19, -0.5) },
          { share: 0.05, sample: line(0.19, 0.05, 0.46, -0.5) },
          { share: 0.04, sample: line(0.46, -0.5, 0.19, -0.5) },
          { share: 0.44, sample: function () {
            var e = Math.random();
            return [(Math.random() - 0.5) * (0.08 + 0.5 * e), -0.15 - 0.95 * e + (Math.random() - 0.5) * 0.05, jz()];
          } }
        ]);
        for (var k = 0; k < COUNT; k++) pts[k * 3 + 1] *= 0.88;
        return pts;
      },
      // Evolve: a double helix
      function () {
        var out = new Float32Array(COUNT * 3);
        var strand = 372;
        var n = 0;
        for (var s = 0; s < 2; s++) {
          for (var k = 0; k < strand; k++, n++) {
            var t = k / strand;
            var a = t * Math.PI * 6 + s * Math.PI;
            out[n * 3] = 0.72 * Math.cos(a) + (Math.random() - 0.5) * 0.04;
            out[n * 3 + 1] = (t - 0.5) * 2 + (Math.random() - 0.5) * 0.04;
            out[n * 3 + 2] = 0.72 * Math.sin(a) + (Math.random() - 0.5) * 0.04;
          }
        }
        var rungs = 26;
        var per = Math.floor((COUNT - n) / rungs);
        for (var r = 0; r < rungs; r++) {
          var tt = (r + 0.5) / rungs;
          var aa = tt * Math.PI * 6;
          var y = (tt - 0.5) * 2, x = 0.72 * Math.cos(aa), z = 0.72 * Math.sin(aa);
          for (var q = 0; q < per && n < COUNT; q++, n++) {
            var f = q / per;
            out[n * 3] = x - 2 * x * f + (Math.random() - 0.5) * 0.02;
            out[n * 3 + 1] = y + (Math.random() - 0.5) * 0.02;
            out[n * 3 + 2] = z - 2 * z * f + (Math.random() - 0.5) * 0.02;
          }
        }
        return out;
      }
    ];
    var PULSE = [0.06, 0.02, 0.02, 0.03, 0.03];

    var targets = SHAPES.map(function (make) { return make(); });
    var pos = new Float32Array(targets[0]);
    var push = new Float32Array(COUNT * 3);
    var shape = 0;
    var rotY = 0, rotX = 0, scale = 1;
    var mouse = { x: 0, y: 0, inside: false };
    var w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var visible = false;
    var last = 0;

    function resize() {
      var r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible || document.hidden || !w) { last = now; return; }
      var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      var t = now / 1000;
      var target = targets[shape];
      var ease = reduce ? 1 : Math.min(1, (1 - Math.pow(0.001, dt)) * 0.9);

      if (!reduce) {
        if (shape === 4) rotY += 0.25 * dt;
        else rotY += (0.45 * Math.sin(0.3 * t) - rotY) * 0.04;
        rotX += (0.2 * mouse.y - rotX) * 0.05;
        scale = 1 + Math.sin(1.2 * t) * PULSE[shape];
      }

      var cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
      var halfH = CAM * TAN;
      var lx = 0, ly = 0, lz = 0;
      var repel = mouse.inside && !reduce;
      if (repel) {
        // mouse on the z=0 plane, moved into the cloud's local space
        var wx = mouse.x * halfH * (w / h), wy = mouse.y * halfH;
        var ax = wx, ay = cx * wy, az = -sx * wy;
        lx = (cy * ax - sy * az) / scale;
        ly = ay / scale;
        lz = (sy * ax + cy * az) / scale;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      var focal = (h / 2) / TAN * (w > 500 ? 1.4 : 1);
      var R2 = 0.55 * 0.55;

      for (var i = 0; i < COUNT; i++) {
        var o = i * 3;
        push[o] *= 0.88; push[o + 1] *= 0.88; push[o + 2] *= 0.88;
        if (repel) {
          var dx = pos[o] - lx, dy = pos[o + 1] - ly, dz = pos[o + 2] - lz;
          var d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < R2 && d2 > 1e-4) {
            var d = Math.sqrt(d2);
            var f = (1 - d / 0.55) * 0.09;
            push[o] += dx / d * f; push[o + 1] += dy / d * f; push[o + 2] += dz / d * f;
          }
        }
        pos[o] += (target[o] + push[o] - pos[o]) * ease;
        pos[o + 1] += (target[o + 1] + push[o + 1] - pos[o + 1]) * ease;
        pos[o + 2] += (target[o + 2] + push[o + 2] - pos[o + 2]) * ease;

        var px = pos[o] * scale, py = pos[o + 1] * scale, pz = pos[o + 2] * scale;
        var x1 = cy * px + sy * pz;
        var z1 = -sy * px + cy * pz;
        var y2 = cx * py - sx * z1;
        var z2 = sx * py + cx * z1;
        var depth = CAM - z2;
        if (depth <= 0.1) continue;
        var k = focal / depth;
        var size = Math.max(1, 0.03 * k * 0.55);
        ctx.fillRect(w / 2 + x1 * k - size / 2, h / 2 - y2 * k - size / 2, size, size);
      }
      ctx.globalCompositeOperation = "source-over";
    }

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      mouse.inside = inside;
      mouse.x = inside ? ((e.clientX - r.left) / r.width) * 2 - 1 : 0;
      mouse.y = inside ? -(((e.clientY - r.top) / r.height) * 2 - 1) : 0;
    }, { passive: true });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }, { rootMargin: "12% 0px" }).observe(canvas);
    } else {
      visible = true;
    }
    resize();
    requestAnimationFrame(frame);

    api.setShape = function (i) { shape = clamp(i, 0, SHAPES.length - 1); };
    return api;
  })();

  /* ---------- stack: pinned domains ---------- */

  var DOMAINS = [
    { name: "Languages", tag: "Where it starts", tools: ["Java", "SQL", "JavaScript", "TypeScript", "C"] },
    { name: "Backend", tag: "Services & APIs", tools: ["Spring Boot", "Spring Security", "Spring Data JPA", "Hibernate", "JWT", "Node.js"] },
    { name: "Data", tag: "State that matters", tools: ["PostgreSQL", "MongoDB", "Redis"] },
    { name: "Delivery", tag: "Package & ship", tools: ["Docker", "Maven", "Nginx", "Git", "OpenAPI", "Postman"] },
    { name: "Testing", tag: "Proof of behavior", tools: ["JUnit", "Mockito", "Integration tests"] },
    { name: "AI", tag: "Exploring now", tools: ["Spring AI", "RAG", "Embeddings", "LLM apps", "MCP"] }
  ];
  var domainsEl = document.getElementById("stack");
  var domainName = document.getElementById("domainName");
  var domainIndex = document.getElementById("domainIndex");
  var domainTools = document.getElementById("domainTools");
  var domainTag = document.getElementById("domainTag");
  var currentDomain = -1;
  var domainTotal = document.getElementById("domainTotal");
  if (domainTotal) domainTotal.textContent = pad2(DOMAINS.length);

  function setDomain(i) {
    if (i === currentDomain || !domainTools) return;
    currentDomain = i;
    var d = DOMAINS[i];
    var frameEl = document.getElementById("domainFrame");
    if (frameEl && !reduce) { frameEl.classList.remove("flash"); void frameEl.offsetWidth; frameEl.classList.add("flash"); }
    domainName.textContent = d.name;
    domainName.classList.remove("swap"); void domainName.offsetWidth; domainName.classList.add("swap");
    domainIndex.textContent = pad2(i + 1);
    domainTag.textContent = d.tag;
    domainTools.innerHTML = "";
    d.tools.forEach(function (tool, k) {
      var li = document.createElement("li");
      li.style.setProperty("--i", k);
      li.innerHTML = "<small>" + pad2(k + 1) + "</small><span></span>";
      domainTools.appendChild(li);
      var label = li.querySelector("span");
      label.textContent = tool;
      requestAnimationFrame(function () {
        li.classList.add("in");
        scramble(label, tool, 380 + k * 60);
      });
    });
  }
  setDomain(0);

  /* ---------- scroll driver ---------- */

  var progress = document.getElementById("progress");
  var sceneNum = document.getElementById("sceneNum");
  var scenes = document.querySelectorAll("[data-scene]");
  var currentScene = "01";
  var ticking = false;
  var workIndexes = document.querySelectorAll(".work-index");
  var dimSections = document.querySelectorAll("#hero, #craft, #work, #now");
  var SCENE_INTENSITY = { "01": 0.22, "03": 0.45, "04": 0.55, "05": 0.4, "06": 0.6, "07": 0.9 };
  var lastScrollY = window.scrollY;
  var lastScrollT = performance.now();
  var swellTimer = null;

  function pinProgress(el) {
    var r = el.getBoundingClientRect();
    var span = r.height - window.innerHeight;
    return span > 0 ? clamp(-r.top / span, 0, 1) : 0;
  }

  function update() {
    ticking = false;
    var vh = window.innerHeight;
    var max = document.documentElement.scrollHeight - vh;
    if (progress) progress.style.setProperty("--p", max > 0 ? (window.scrollY / max).toFixed(4) : 0);

    if (storyEl) {
      var sp = pinProgress(storyEl);
      var n = STAGES.length;
      setStage(Math.min(n - 1, Math.floor(sp * n * 0.999)));
      Array.prototype.forEach.call(storySteps, function (li, k) {
        li.style.setProperty("--f", clamp(sp * n - k, 0, 1).toFixed(3));
      });
    }

    if (beats.length) {
      var best = 0, bestD = Infinity;
      var stickyBox = craftSticky.getBoundingClientRect();
      var focus = stickyBox.height < vh * 0.8 ? (Math.max(0, stickyBox.bottom) + vh) / 2 : vh / 2;
      Array.prototype.forEach.call(beats, function (b, k) {
        var r = b.getBoundingClientRect();
        var d = Math.abs(r.top + r.height / 2 - focus);
        if (d < bestD) { bestD = d; best = k; }
      });
      setBeat(best);
    }

    if (domainsEl) {
      var dp = pinProgress(domainsEl);
      setDomain(Math.min(DOMAINS.length - 1, Math.floor(dp * DOMAINS.length * 0.999)));
    }

    if (!reduce) {
      Array.prototype.forEach.call(workIndexes, function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var t = clamp((vh - r.top) / (vh + r.height), 0, 1);
        el.style.transform = "translateY(" + (18 - 36 * t).toFixed(1) + "%)";
      });
      var edge = vh * 0.35;
      Array.prototype.forEach.call(dimSections, function (el) {
        var n = clamp((edge - el.getBoundingClientRect().bottom) / edge, 0, 1);
        var v = (1 - 0.45 * n).toFixed(3);
        if (el._dim !== v) { el._dim = v; el.style.filter = v === "1.000" ? "" : "brightness(" + v + ")"; }
      });
    }

    var scene = currentScene;
    Array.prototype.forEach.call(scenes, function (s) {
      var r = s.getBoundingClientRect();
      if (r.top <= vh * 0.5 && r.bottom > vh * 0.5) scene = s.getAttribute("data-scene");
    });
    if (scene !== currentScene && sceneNum) {
      currentScene = scene;
      sceneNum.textContent = scene;
      sceneNum.classList.remove("flip"); void sceneNum.offsetWidth; sceneNum.classList.add("flip");
    }

    sound.setScene(parseInt(currentScene, 10));
    if (currentScene === "02" && storyEl) {
      sound.setIntensity(0.25 + pinProgress(storyEl) * 0.75);
      sound.setClock(Math.round(1250 - currentStage * 150));
    } else {
      sound.setIntensity(currentScene === "03" ? 0.4 + Math.max(0, activeBeat) * 0.08 : SCENE_INTENSITY[currentScene] || 0.4);
      sound.setClock(0);
    }

    var now = performance.now();
    var speed = Math.abs(window.scrollY - lastScrollY) / Math.max(16, now - lastScrollT);
    lastScrollY = window.scrollY;
    lastScrollT = now;
    sound.setSwell(speed / 4);
    clearTimeout(swellTimer);
    swellTimer = setTimeout(function () { sound.setSwell(0); }, 250);
  }

  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();

  /* ---------- cursor & magnetic ---------- */

  if (finePointer && !reduce) {
    root.classList.add("has-cursor");
    var cursor = document.getElementById("cursor");
    var glitch = document.getElementById("glyphGlitch");
    var glitchLayers = glitch ? glitch.querySelectorAll("span") : [];
    var x = -100, y = -100, gx = -100, gy = -100;
    var onText = false;
    var lastNode = null, lastOffset = -1;

    function hideGlitch() {
      if (!glitch) return;
      lastNode = null; lastOffset = -1;
      glitch.hidden = true;
      for (var k = 0; k < glitchLayers.length; k++) glitchLayers[k].textContent = "";
    }

    function charRangeAt(px, py) {
      var range = null;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(px, py);
      } else if (document.caretPositionFromPoint) {
        var pos = document.caretPositionFromPoint(px, py);
        if (!pos) return null;
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
      if (!range || range.startContainer.nodeType !== 3) return null;
      var node = range.startContainer;
      var parent = node.parentElement;
      if (!parent || parent.closest(".cursor, .glyph-glitch, .sr, script, style, .sound-toggle, .loader")) return null;
      var start = range.startOffset;
      var data = node.data;
      if (start >= data.length) start = data.length - 1;
      if (start < 0) return null;
      var ch = data.charAt(start);
      if (!ch.trim()) return null;
      var r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, start + 1);
      var box = r.getBoundingClientRect();
      if (px < box.left - 2 || px > box.right + 2 || py < box.top - 2 || py > box.bottom + 2) return null;
      return r;
    }

    function updateGlitch(e) {
      var r = charRangeAt(e.clientX, e.clientY);
      var isText = !!r;
      if (isText !== onText) { onText = isText; cursor.classList.toggle("is-text", isText); }
      if (!r) { hideGlitch(); return; }
      var box = r.getBoundingClientRect();
      var parent = r.startContainer.parentElement;
      if (box.width < 1 || box.height < 1) { hideGlitch(); return; }
      var cs = getComputedStyle(parent);
      if (r.startContainer !== lastNode || r.startOffset !== lastOffset) {
        lastNode = r.startContainer; lastOffset = r.startOffset;
        sound.tick(parseFloat(cs.fontSize) || 16);
      }
      var ch = r.toString();
      glitch.hidden = false;
      glitch.style.left = box.left + "px";
      glitch.style.top = box.top + "px";
      glitch.style.width = box.width + "px";
      glitch.style.height = box.height + "px";
      glitch.style.color = cs.color === "rgba(0, 0, 0, 0)" ? "#fff" : cs.color;
      glitch.style.fontFamily = cs.fontFamily;
      glitch.style.fontSize = cs.fontSize;
      glitch.style.fontWeight = cs.fontWeight;
      glitch.style.fontStretch = cs.fontStretch;
      glitch.style.letterSpacing = cs.letterSpacing;
      glitch.style.textTransform = cs.textTransform;
      for (var k = 0; k < glitchLayers.length; k++) glitchLayers[k].textContent = ch;
    }

    var glitchQueued = false, lastEvent = null;
    window.addEventListener("pointermove", function (e) {
      x = e.clientX; y = e.clientY;
      if (gx < -50) { gx = x; gy = y; }
      var interactive = e.target.closest && e.target.closest("a, button, [data-magnetic]");
      cursor.classList.toggle("is-hover", !!interactive);
      lastEvent = e;
      if (!glitchQueued) {
        glitchQueued = true;
        requestAnimationFrame(function () {
          glitchQueued = false;
          if (interactive) { hideGlitch(); if (onText) { onText = false; cursor.classList.remove("is-text"); } }
          else updateGlitch(lastEvent);
        });
      }
    }, { passive: true });
    window.addEventListener("scroll", hideGlitch, { passive: true });
    window.addEventListener("pointerdown", function () { cursor.classList.add("is-down"); });
    window.addEventListener("pointerup", function () { cursor.classList.remove("is-down"); });
    document.documentElement.addEventListener("pointerleave", function () { x = y = gx = gy = -100; hideGlitch(); });

    (function follow() {
      gx += (x - gx) * 0.18;
      gy += (y - gy) * 0.18;
      cursor.style.transform = "translate3d(" + gx.toFixed(1) + "px," + gy.toFixed(1) + "px,0)";
      requestAnimationFrame(follow);
    })();

    document.querySelectorAll("[data-magnetic]").forEach(function (el) {
      el.style.transition = "transform .5s cubic-bezier(0.22, 1, 0.36, 1)";
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) * 0.12;
        var dy = (e.clientY - (r.top + r.height / 2)) * 0.25;
        el.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)";
      });
      el.addEventListener("pointerleave", function () { el.style.transform = ""; });
    });
  }

  /* ---------- copy email ---------- */

  document.querySelectorAll(".copy-email").forEach(function (link) {
    var status = link.querySelector("[role=status]");
    var timer = null;
    link.addEventListener("click", function (e) {
      if (!navigator.clipboard || !window.isSecureContext) return;
      e.preventDefault();
      var email = link.getAttribute("data-email");
      navigator.clipboard.writeText(email).then(function () {
        link.classList.add("copied");
        if (status) status.textContent = "Email copied to clipboard";
        clearTimeout(timer);
        timer = setTimeout(function () {
          link.classList.remove("copied");
          if (status) status.textContent = "";
        }, 1800);
      }, function () {
        window.location.href = link.getAttribute("href");
      });
    });
  });
})();
