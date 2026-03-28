import type { AbsolutePath, EntityId, Review } from "@prism/core";
import { CompositeArtifactRepository } from "./composite-artifact-repository";
import { reviewPaths, projectPaths } from "./paths";

export function createReviewRepository(projectRoot: AbsolutePath) {
  return new CompositeArtifactRepository<Review>(
    (id: EntityId) => {
      const p = reviewPaths(projectRoot, id);
      return { dir: p.reviewDir, metadataFile: `${p.reviewDir}/metadata.json` as AbsolutePath };
    },
    () => projectPaths(projectRoot).reviewsDir,
  );
}
