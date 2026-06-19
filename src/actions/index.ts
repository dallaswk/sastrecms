import { nodeActions } from "./nodes";
import { contentTypeActions } from "./content-types";

export const server = {
  nodes: nodeActions,
  contentTypes: contentTypeActions,
};
