import type { AbsolutePath, EntityId, Spec } from "@prism/core";
import { CompositeArtifactRepository } from "./composite-artifact-repository";
import type { ArtifactWriteCallback } from "./contracts";
import { specPaths, projectPaths } from "./paths";

export function createSpecRepository(projectRoot: AbsolutePath, onWrite?: ArtifactWriteCallback) {
  return new CompositeArtifactRepository<Spec>(
    (id: EntityId) => {
      const p = specPaths(projectRoot, id);
      return { dir: p.specDir, metadataFile: p.metadataFile };
    },
    () => projectPaths(projectRoot).specsDir,
    onWrite,
    "spec",
  );
}
