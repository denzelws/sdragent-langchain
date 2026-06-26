import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function askForApproval(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`${prompt} (y/N) `);
  rl.close();

  return ["y", "yes"].includes(answer.trim().toLowerCase());
}
