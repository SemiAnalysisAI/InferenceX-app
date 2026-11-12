import type { LaunchStep } from '@semianalysisai/inferencex-db/lib/launch-record';
import type { ReproduceLogs } from '@semianalysisai/inferencex-db/queries/reproduce';

export type LaunchCommand =
  | { kind: 'recorded'; file: string; script: string }
  | { kind: 'engine-args'; file: string; engine: 'vLLM' | 'SGLang'; text: string }
  | { kind: 'unavailable'; reason: 'no-logs' | 'not-recorded' };

const ENV_ASSIGNMENT = /\s+(?=[A-Za-z_]\w*=)/u;

function stepHeading(step: LaunchStep): string {
  const name =
    step.kind === 'worker'
      ? `${step.role} worker ${step.index}`
      : step.kind === 'frontend'
        ? `${step.role} ${step.index}`
        : step.role;
  return step.hosts.length > 0 ? `# ${name} on ${step.hosts.join(', ')}` : `# ${name}`;
}

function stepLines(step: LaunchStep): string[] {
  if (!step.env) return [step.command];
  const assignments = step.env.split(ENV_ASSIGNMENT).filter(Boolean);
  return ['env \\', ...assignments.map((assignment) => `  ${assignment} \\`), `  ${step.command}`];
}

/**
 * Render the launch a point's logs recorded as a copyable shell script. srtctl sweep
 * logs record each process's exact environment and command. Runs launched without
 * srtctl only have the arguments the engine printed at startup, which vLLM and SGLang
 * log and other engines do not, so those are shown as JSON rather than rebuilt into
 * a command line the run never executed.
 */
export function buildLaunchCommand(logs: ReproduceLogs | null): LaunchCommand {
  if (!logs) return { kind: 'unavailable', reason: 'no-logs' };
  if (logs.launch && logs.launch_file) {
    const { launch } = logs;
    const header = [
      launch.container && `# Container: ${launch.container}`,
      launch.srtctl_version && `# srtctl ${launch.srtctl_version}`,
      launch.recipe && `# Recipe: ${launch.recipe}`,
    ].filter(Boolean);
    const blocks = launch.steps.map((step) => [stepHeading(step), ...stepLines(step)].join('\n'));
    const client = logs.benchmark_command && `# benchmark client\n${logs.benchmark_command}`;
    return {
      kind: 'recorded',
      file: logs.launch_file,
      script: [header.join('\n'), ...blocks, client].filter(Boolean).join('\n\n'),
    };
  }
  const args = logs.engine?.engine_args;
  if (args && logs.engine_file) {
    return {
      kind: 'engine-args',
      file: logs.engine_file,
      engine: args.source === 'vllm-non-default-args' ? 'vLLM' : 'SGLang',
      text: JSON.stringify(args.args, null, 2),
    };
  }
  return { kind: 'unavailable', reason: 'not-recorded' };
}
