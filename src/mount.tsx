import { createRoot } from "react-dom/client";
import { AnimatedTopDock } from "@designcodeio/threeui";
import { Scene } from "./Scene";

const host = document.getElementById("shaderFrame");
if (host) {
  createRoot(host).render(<Scene />);
}

const navHost = document.getElementById("navDock");
if (navHost) {
  createRoot(navHost).render(
    <AnimatedTopDock
      variant="modern"
      proximity={122}
      spring={0.19}
      damping={0.70}
      widthGrowth={17}
      heightGrowth={16}
      drop={3.5}
    />,
  );
  window.requestAnimationFrame(() => window.dispatchEvent(new Event("scroll")));
}
