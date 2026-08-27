import { nodeActions } from "./nodes";
import { contentTypeActions } from "./content-types";
import { mediaActions } from "./media";
import { settingsActions } from "./settings";
import { tokenActions } from "./tokens";
import { userActions } from "./users";
import { permissionActions } from "./permissions";
import { presetActions } from "./presets";
import { menuActions } from "./menus";
import { formActions } from "./forms";
import { aiActions } from "./ai";
import { fixActions } from "./fixes";
import { aiFixActions } from "./ai-fix";

export const server = {
  nodes: nodeActions,
  contentTypes: contentTypeActions,
  media: mediaActions,
  settings: settingsActions,
  tokens: tokenActions,
  users: userActions,
  permissions: permissionActions,
  presets: presetActions,
  menus: menuActions,
  forms: formActions,
  ai: aiActions,
  fixes: fixActions,
  aiFix: aiFixActions,
};
