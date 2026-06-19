import { nodeActions } from "./nodes";
import { contentTypeActions } from "./content-types";
import { mediaActions } from "./media";

export const server = {
  nodes: nodeActions,
  contentTypes: contentTypeActions,
  media: mediaActions,
};
