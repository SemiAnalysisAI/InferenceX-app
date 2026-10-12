// Equivalent tools share colors across providers; user-connected MCP tools keep fallback gray.

const SHELL = '#8b5cf6';
const READ = '#0ea5e9';
const EDIT = '#10b981';
const WRITE = '#f59e0b';
const SEARCH = '#f97316';
const WEB = '#ec4899';
const AGENT = '#6366f1';
const PLAN = '#14b8a6';
const ASK = '#f43f5e';
const LSP = '#06b6d4';

export const TOOL_COLORS: Record<string, string> = {
  // Claude Code
  Bash: SHELL,
  bash: SHELL,
  PowerShell: SHELL,
  BashOutput: SHELL,
  KillShell: SHELL,
  Monitor: SHELL,
  Read: READ,
  NotebookRead: READ,
  Edit: EDIT,
  MultiEdit: EDIT,
  NotebookEdit: EDIT,
  Write: WRITE,
  Grep: SEARCH,
  Glob: SEARCH,
  LS: SEARCH,
  WebFetch: WEB,
  WebSearch: WEB,
  Agent: AGENT,
  Task: AGENT,
  SendMessage: AGENT,
  TaskCreate: PLAN,
  TaskUpdate: PLAN,
  TaskList: PLAN,
  TaskGet: PLAN,
  TaskOutput: PLAN,
  TaskStop: PLAN,
  TodoWrite: PLAN,
  EnterPlanMode: PLAN,
  ExitPlanMode: PLAN,
  AskUserQuestion: ASK,
  LSP,

  // Codex CLI / cloud (OpenAI Responses)
  exec_command: SHELL,
  shell_command: SHELL,
  shell: SHELL,
  local_shell: SHELL,
  local_shell_call: SHELL,
  write_stdin: SHELL,
  wait: SHELL,
  kill: SHELL,
  js: SHELL,
  js_reset: SHELL,
  code_interpreter_call: SHELL,
  apply_patch: EDIT,
  custom_tool_call: EDIT,
  read_text_file: READ,
  read_file: READ,
  view_image: READ,
  file_search_call: SEARCH,
  web_search: WEB,
  web_search_call: WEB,
  update_plan: PLAN,
  spawn_agent: AGENT,
  wait_agent: AGENT,
  close_agent: AGENT,
  interrupt_agent: AGENT,
  send_input: AGENT,
  list_agents: AGENT,
  request_user_input: ASK,
};

const DEFAULT_TOOL_COLOR = '#6b7280';

export function getToolColor(name: string, fallback: string = DEFAULT_TOOL_COLOR): string {
  return TOOL_COLORS[name] ?? fallback;
}
