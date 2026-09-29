import { StructureFlowCollection } from "@designcodeio/threeui";
import "@designcodeio/threeui/style.css";

export function Scene() {
  return (
    <div className="shader-frame">
      <StructureFlowCollection
        variant="dot-matrix"
        speed={1.00}
        gridScale={60}
        mouseAmount={0.22}
        pulseSpeed={0.40}
        hue={0}
        radius={0.150}
        opacity={0.35}
      />
    </div>
  );
}
