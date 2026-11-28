export const stampNames = {
  palette: ['Flip the paper', '换一张纸'],
  note: ['Read an architecture note', '阅读架构便签'],
  library: ['Pick a library sketch', '选取素材'],
  place: ['Place a library sketch', '放置素材'],
  flow: ['Wire a flowchart', '连接流程图'],
  text: ['Edit a diagram label', '编辑图形标签'],
  chart: ['Mark a measured point', '标注实测数据'],
  figure: ['Greet both sketch partners', '问候两位草图伙伴'],
  secret: ['Find a palette secret', '找到命令彩蛋'],
  relay: ['Clear a Relay room', '通过中继房间'],
} as const;

export type Stamp = keyof typeof stampNames;

export function readStamps(): Stamp[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem('excalidraw-desk-stamps') ?? '[]');
    if (!Array.isArray(stored)) return [];
    return [...new Set(stored.filter((id): id is Stamp => Object.hasOwn(stampNames, id)))];
  } catch {
    return [];
  }
}
