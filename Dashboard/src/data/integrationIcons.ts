import googleDriveIcon from "../assets/google-workspace/drive.png";
import obsidianIcon from "../assets/obsidian/obsidian-logo-gradient.svg";
import aiAgentIcon from "../assets/integrations/ai-agent.svg";
import codexIcon from "../assets/integrations/codex.png";
import microsoftIcon from "../assets/integrations/microsoft.svg";
import researchIcon from "../assets/integrations/research.svg";
import zoteroIcon from "../assets/integrations/zotero.png";

export const integrationIconSrcById: Record<string, string> = {
  "ai-agent": aiAgentIcon,
  codex: codexIcon,
  "google-drive": googleDriveIcon,
  microsoft: microsoftIcon,
  obsidian: obsidianIcon,
  research: researchIcon,
  zotero: zoteroIcon,
};

export function integrationIconSrcFor(id: string) {
  return integrationIconSrcById[id];
}
