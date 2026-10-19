import readline from 'readline';

export function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export function hasYesFlag(): boolean {
  return process.argv.includes('--yes') || process.argv.includes('-y');
}

export function hasNoSslFlag(): boolean {
  return process.argv.includes('--no-ssl');
}
