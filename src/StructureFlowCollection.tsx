import {
  DotMatrixBackground,
  type DotMatrixBackgroundProps,
} from "./shaders/dot-matrix/DotMatrixBackground";

type StructureFlowCollectionProps = DotMatrixBackgroundProps & {
  variant: "dot-matrix";
};

export function StructureFlowCollection({
  variant,
  ...props
}: StructureFlowCollectionProps) {
  if (variant === "dot-matrix") {
    return <DotMatrixBackground {...props} />;
  }
  return null;
}
