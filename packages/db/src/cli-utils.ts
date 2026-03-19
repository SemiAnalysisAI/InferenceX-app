import readline from 'readline';

/** Prompt the user for y/N confirmation. Returns true if 'y'. */
export function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/** Returns true if --yes was passed as a CLI arg. */
export function hasYesFlag(): boolean {
  return process.argv.includes('--yes') || process.argv.includes('-y');
}
