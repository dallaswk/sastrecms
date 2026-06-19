import { nodeActions } from "./nodes";
import { contentTypeActions } from "./content-types";
import { mediaActions } from "./media";
import { settingsActions } from "./settings";

export const server = {
  nodes: nodeActions,
  contentTypes: contentTypeActions,
  media: mediaActions,
  settings: settingsActions,
};
