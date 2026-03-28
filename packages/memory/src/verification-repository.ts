import type { AbsolutePath, EntityId, VerificationResult } from "@prism/core";
import { JsonArtifactRepository } from "./json-artifact-repository";
import type { ArtifactWriteCallback } from "./contracts";
import { runPaths, projectPaths } from "./paths";

export function createVerificationRepository(projectRoot: AbsolutePath, onWrite?: ArtifactWriteCallback) {
  return new JsonArtifactRepository<VerificationResult>(
    (id: EntityId) => {
      const p = runPaths(projectRoot, id);
      return { dir: p.runDir, file: p.verificationFile };
    },
    () => projectPaths(projectRoot).runsDir,
    onWrite,
    "verification",
  );
}
