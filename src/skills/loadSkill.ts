import fs from "node:fs/promises";
import path from "node:path";
import type { LoadedSkill, SkillName } from "./skillTypes.js";

export async function loadSkill(skillName: SkillName): Promise<LoadedSkill> {
  const skillPath = path.join(process.cwd(), "skills", skillName, "SKILL.md");

  try {
    const content = await fs.readFile(skillPath, "utf8");
    return {
      name: skillName,
      path: skillPath,
      content
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Skill "${skillName}" is missing at ${skillPath}.`);
    }

    throw error;
  }
}
