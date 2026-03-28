import type { AbsolutePath, EntityId, ProblemStatement } from "@prism/core";
import { CompositeArtifactRepository } from "./composite-artifact-repository";
import { problemPaths, projectPaths } from "./paths";

export function createProblemRepository(projectRoot: AbsolutePath) {
  return new CompositeArtifactRepository<ProblemStatement>(
    (id: EntityId) => {
      const p = problemPaths(projectRoot, id);
      return { dir: p.problemDir, metadataFile: p.metadataFile };
    },
    () => projectPaths(projectRoot).problemsDir,
  );
}
