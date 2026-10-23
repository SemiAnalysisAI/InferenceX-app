interface AnalyticsClient {
  capture: (eventName: string, properties?: Record<string, unknown>) => void;
}

interface PendingEvent {
  eventName: string;
  properties?: Record<string, unknown>;
}

const pendingEvents: PendingEvent[] = [];
let analyticsClient: AnalyticsClient | null = null;

export function registerAnalyticsClient(client: AnalyticsClient): void {
  analyticsClient = client;
  for (const event of pendingEvents.splice(0)) {
    client.capture(event.eventName, event.properties);
  }
}

export function track(eventName: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  if (analyticsClient) {
    analyticsClient.capture(eventName, properties);
    return;
  }
  pendingEvents.push({ eventName, properties });
}
