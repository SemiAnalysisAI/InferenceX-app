export type Channel = 'music' | 'sound';
const volatile = new Map<Channel, boolean>();
export function enabled(channel: Channel) {
  // The speaker is the county-wide mute. Keep the separate music choice for unmute.
  if (channel === 'music' && !enabled('sound')) return false;
  if (volatile.has(channel)) return volatile.get(channel)!;
  try {
    return localStorage.getItem(`south-park-${channel}`) !== 'false';
  } catch {
    return true;
  }
}
export function setEnabled(channel: Channel, on: boolean) {
  try {
    localStorage.setItem(`south-park-${channel}`, String(on));
    volatile.delete(channel);
  } catch {
    volatile.set(channel, on);
  }
}
