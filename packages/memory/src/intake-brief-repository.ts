import type { AbsolutePath, EntityId, IntakeBrief } from "@prism/core";
import { CompositeArtifactRepository } from "./composite-artifact-repository";
import { intakeBriefPaths, projectPaths } from "./paths";

export function createIntakeBriefRepository(projectRoot: AbsolutePath) {
  return new CompositeArtifactRepository<IntakeBrief>(
    (id: EntityId) => {
      const p = intakeBriefPaths(projectRoot, id);
      return { dir: p.intakeDir, metadataFile: p.metadataFile };
    },
    () => projectPaths(projectRoot).intakeDir,
  );
}
