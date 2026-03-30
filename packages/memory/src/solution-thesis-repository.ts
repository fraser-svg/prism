import type { AbsolutePath, EntityId, SolutionThesis } from "@prism/core";
import { CompositeArtifactRepository } from "./composite-artifact-repository";
import { projectPaths, solutionThesisPaths } from "./paths";

export function createSolutionThesisRepository(projectRoot: AbsolutePath) {
  return new CompositeArtifactRepository<SolutionThesis>(
    (id: EntityId) => {
      const p = solutionThesisPaths(projectRoot, id);
      return { dir: p.thesisDir, metadataFile: p.metadataFile };
    },
    () => projectPaths(projectRoot).thesesDir,
  );
}
