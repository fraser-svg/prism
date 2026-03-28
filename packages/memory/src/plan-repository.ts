import type { AbsolutePath, EntityId, Plan } from "@prism/core";
import { CompositeArtifactRepository } from "./composite-artifact-repository";
import type { ArtifactWriteCallback } from "./contracts";
import { planPaths, projectPaths } from "./paths";

export function createPlanRepository(projectRoot: AbsolutePath, onWrite?: ArtifactWriteCallback) {
  return new CompositeArtifactRepository<Plan>(
    (id: EntityId) => {
      const p = planPaths(projectRoot, id);
      return { dir: p.planDir, metadataFile: p.metadataFile };
    },
    () => projectPaths(projectRoot).plansDir,
    onWrite,
    "plan",
  );
}
