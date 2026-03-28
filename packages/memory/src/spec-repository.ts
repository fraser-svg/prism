import type { AbsolutePath, EntityId, Spec } from "@prism/core";
import { CompositeArtifactRepository } from "./composite-artifact-repository";
import { specPaths, projectPaths } from "./paths";

export function createSpecRepository(projectRoot: AbsolutePath) {
  return new CompositeArtifactRepository<Spec>(
    (id: EntityId) => {
      const p = specPaths(projectRoot, id);
      return { dir: p.specDir, metadataFile: p.metadataFile };
    },
    () => projectPaths(projectRoot).specsDir,
  );
}
