import type { AbsolutePath, EntityId, ReleaseState } from "@prism/core";
import { JsonArtifactRepository } from "./json-artifact-repository";
import { releaseStatePaths, projectPaths } from "./paths";

export function createReleaseStateRepository(projectRoot: AbsolutePath) {
  return new JsonArtifactRepository<ReleaseState>(
    (id: EntityId) => {
      const p = releaseStatePaths(projectRoot, id);
      return { dir: p.releaseStateDir, file: p.stateFile };
    },
    () => projectPaths(projectRoot).releaseStateDir,
  );
}
