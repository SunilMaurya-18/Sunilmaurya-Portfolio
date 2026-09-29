import * as THREE from "./vendor/three.module.min.js";

const canvas = document.getElementById("worldCanvas");
if (canvas) {
  const rootEl = document.documentElement;
  const reduce =
    rootEl.classList.contains("reduce") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = window.matchMedia("(max-width: 760px)").matches;

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: !mobile,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0a0a, 0.055);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 80);
  camera.position.set(0, 1.1, 13);

  const world = new THREE.Group();
  scene.add(world);

  const core = new THREE.Group();
  core.position.set(-0.4, 0.85, 0);
  world.add(core);

  const ico = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.15, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.72,
    })
  );
  core.add(ico);

  const icoInner = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.05, 0),
    new THREE.MeshBasicMaterial({
      color: 0xff2a2a,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    })
  );
  core.add(icoInner);

  function makeRing(radius, tube, color, opacity) {
    return new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 12, 96),
      new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        depthWrite: false,
      })
    );
  }

  const ringA = makeRing(3.15, 0.012, 0xffffff, 0.8);
  ringA.rotation.x = Math.PI / 2.35;
  core.add(ringA);

  const ringB = makeRing(3.85, 0.008, 0x9a9a9a, 0.45);
  ringB.rotation.x = Math.PI / 3.1;
  ringB.rotation.y = 0.7;
  core.add(ringB);

  const ringC = makeRing(2.45, 0.01, 0xff2a2a, 0.55);
  ringC.rotation.x = 1.15;
  ringC.rotation.z = 0.45;
  core.add(ringC);

  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 256;
  glowCanvas.height = 256;
  const glowCtx = glowCanvas.getContext("2d");
  const glowGrad = glowCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
  glowGrad.addColorStop(0, "rgba(255, 255, 255, 0.55)");
  glowGrad.addColorStop(0.28, "rgba(255, 42, 42, 0.16)");
  glowGrad.addColorStop(1, "rgba(255, 42, 42, 0)");
  glowCtx.fillStyle = glowGrad;
  glowCtx.fillRect(0, 0, 256, 256);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  glow.scale.set(11, 11, 1);
  glow.position.set(-0.4, 0.85, -1.2);
  world.add(glow);

  const dustCount = mobile ? 36 : 72;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);
  const dustBaseY = new Float32Array(dustCount);
  const palette = [
    [1, 1, 1],
    [0.72, 0.72, 0.72],
    [0.48, 0.48, 0.48],
  ];
  for (let i = 0; i < dustCount; i += 1) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 26;
    dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 16;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 16;
    const tone = i % 11 === 0 ? [1, 0.16, 0.16] : palette[i % palette.length];
    dustColors[i * 3] = tone[0];
    dustColors[i * 3 + 1] = tone[1];
    dustColors[i * 3 + 2] = tone[2];
    dustSeed[i] = Math.random() * Math.PI * 2;
    dustBaseY[i] = dustPositions[i * 3 + 1];
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  dustGeo.setAttribute("color", new THREE.BufferAttribute(dustColors, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      size: mobile ? 0.028 : 0.034,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
  );
  world.add(dust);

  const netCount = mobile ? 22 : 36;
  const net = [];
  for (let i = 0; i < netCount; i += 1) {
    const radius = 2.4 + Math.random() * 3.4;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    net.push(
      new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta) * 0.72,
        radius * Math.cos(phi)
      )
    );
  }
  const linkPositions = [];
  for (let i = 0; i < net.length; i += 1) {
    for (let j = i + 1; j < net.length; j += 1) {
      if (net[i].distanceTo(net[j]) < 1.55) {
        linkPositions.push(net[i].x, net[i].y, net[i].z, net[j].x, net[j].y, net[j].z);
      }
    }
  }
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute("position", new THREE.Float32BufferAttribute(linkPositions, 3));
  const links = new THREE.LineSegments(
    linkGeo,
    new THREE.LineBasicMaterial({
      color: 0xd0d0d0,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    })
  );
  core.add(links);

  const netGeo = new THREE.BufferGeometry();
  const netFlat = new Float32Array(net.length * 3);
  net.forEach(function (point, index) {
    netFlat[index * 3] = point.x;
    netFlat[index * 3 + 1] = point.y;
    netFlat[index * 3 + 2] = point.z;
  });
  netGeo.setAttribute("position", new THREE.BufferAttribute(netFlat, 3));
  const netPoints = new THREE.Points(
    netGeo,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.04,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
  );
  core.add(netPoints);

  const specks = new THREE.Group();
  world.add(specks);
  for (let i = 0; i < (mobile ? 2 : 4); i += 1) {
    const speck = new THREE.Mesh(
      new THREE.SphereGeometry(0.03 + Math.random() * 0.03, 10, 10),
      new THREE.MeshBasicMaterial({
        color: i === 0 ? 0xff2a2a : 0xffffff,
        transparent: true,
        opacity: 0.4,
      })
    );
    speck.position.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 8);
    speck.userData.seed = Math.random() * Math.PI * 2;
    speck.userData.speed = 0.35 + Math.random() * 0.6;
    specks.add(speck);
  }

  let grid = null;

  function paintGrid(center, line, opacity) {
    if (grid) {
      world.remove(grid);
      grid.geometry.dispose();
      const old = [].concat(grid.material);
      old.forEach(function (material) {
        material.dispose();
      });
    }
    grid = new THREE.GridHelper(70, 48, center, line);
    const materials = [].concat(grid.material);
    materials.forEach(function (material) {
      material.transparent = true;
      material.opacity = opacity;
      material.depthWrite = false;
    });
    grid.position.y = -4.6;
    world.add(grid);
  }

  scene.fog.color.set(0x0a0a0a);
  scene.fog.density = 0.055;
  dust.material.opacity = 0.45;
  dust.material.blending = THREE.AdditiveBlending;
  dust.material.color.set(0xffffff);
  netPoints.material.opacity = 0.45;
  links.material.opacity = 0.2;
  links.material.color.set(0xd0d0d0);
  ico.material.color.set(0xffffff);
  ico.material.opacity = 0.38;
  icoInner.material.opacity = 0.22;
  glow.material.opacity = 0.28;
  ringA.material.opacity = 0.35;
  ringB.material.opacity = 0.2;
  ringC.material.opacity = 0.28;
  paintGrid(0xffffff, 0x3a3a3a, 0.16);

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  window.addEventListener(
    "pointermove",
    function (event) {
      if (reduce) return;
      if (event.pointerType && event.pointerType !== "mouse") return;
      targetX = event.clientX / window.innerWidth - 0.5;
      targetY = event.clientY / window.innerHeight - 0.5;
    },
    { passive: true }
  );

  const clock = new THREE.Clock();
  const baseY = specks.children.map(function (speck) {
    return speck.position.y;
  });

  function frame() {
    window.requestAnimationFrame(frame);
    if (document.hidden) return;
    const elapsed = clock.getElapsedTime();
    if (!reduce) {
      ico.rotation.y = elapsed * 0.18;
      ico.rotation.x = elapsed * 0.07;
      icoInner.rotation.y = -elapsed * 0.28;
      icoInner.rotation.x = elapsed * 0.12;
      ringA.rotation.z = elapsed * 0.22;
      ringB.rotation.z = -elapsed * 0.16;
      ringC.rotation.y = elapsed * 0.2;
      core.rotation.y = elapsed * 0.05;
      const dustPos = dustGeo.attributes.position.array;
      for (let i = 0; i < dustCount; i += 1) {
        dustPos[i * 3 + 1] = dustBaseY[i] + Math.sin(elapsed * 0.45 + dustSeed[i]) * 0.35;
      }
      dustGeo.attributes.position.needsUpdate = true;
      specks.children.forEach(function (speck, index) {
        speck.position.y = baseY[index] + Math.sin(elapsed * speck.userData.speed + speck.userData.seed) * 0.28;
      });
    }
    currentX += (targetX - currentX) * 0.06;
    currentY += (targetY - currentY) * 0.06;
    world.rotation.y = currentX * 0.38;
    world.rotation.x = currentY * 0.16;
    camera.position.x = currentX * 1.6;
    camera.position.y = 1.1 - currentY * 0.7;
    camera.lookAt(0, 0.35, 0);
    renderer.render(scene, camera);
  }

  frame();

  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
