import { nodeActions } from "./nodes";
import { contentTypeActions } from "./content-types";
import { mediaActions } from "./media";
import { settingsActions } from "./settings";
import { tokenActions } from "./tokens";
import { userActions } from "./users";

export const server = {
  nodes: nodeActions,
  contentTypes: contentTypeActions,
  media: mediaActions,
  settings: settingsActions,
  tokens: tokenActions,
  users: userActions,
};
