import type { AbsolutePath, EntityId, Review } from "@prism/core";
import { CompositeArtifactRepository } from "./composite-artifact-repository";
import type { ArtifactWriteCallback } from "./contracts";
import { reviewPaths, projectPaths } from "./paths";

export function createReviewRepository(projectRoot: AbsolutePath, onWrite?: ArtifactWriteCallback) {
  return new CompositeArtifactRepository<Review>(
    (id: EntityId) => {
      const p = reviewPaths(projectRoot, id);
      return { dir: p.reviewDir, metadataFile: `${p.reviewDir}/metadata.json` as AbsolutePath };
    },
    () => projectPaths(projectRoot).reviewsDir,
    onWrite,
    "review",
  );
}
