const MONTH_KEY = 'inferencex-visit-month';
const DAYS_KEY = 'inferencex-visit-days';
const FIRST_SEEN_KEY = 'inferencex-first-seen';
const LAST_SEEN_KEY = 'inferencex-last-seen';
const SESSION_KEY = 'inferencex-visit-counted';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonth(): string {
  return todayISO().slice(0, 7);
}

function readDays(): string[] {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
    if (!raw) return [];
    return raw.split(',').filter(Boolean);
  } catch {
    return [];
  }
}

export function getMonthlyVisitCount(): number {
  try {
    if (localStorage.getItem(MONTH_KEY) !== currentMonth()) return 0;
    return readDays().length;
  } catch {
    return 0;
  }
}

export function getFirstSeen(): string | null {
  try {
    return localStorage.getItem(FIRST_SEEN_KEY);
  } catch {
    return null;
  }
}

export function getLastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export function recordVisitIfNew(): number {
  try {
    if (sessionStorage.getItem(SESSION_KEY) !== null) return getMonthlyVisitCount();

    const month = currentMonth();
    const today = todayISO();
    const storedMonth = localStorage.getItem(MONTH_KEY);
    const days = storedMonth === month ? readDays() : [];
    if (!days.includes(today)) days.push(today);

    if (localStorage.getItem(FIRST_SEEN_KEY) === null) {
      localStorage.setItem(FIRST_SEEN_KEY, today);
    }
    localStorage.setItem(LAST_SEEN_KEY, today);
    localStorage.setItem(MONTH_KEY, month);
    localStorage.setItem(DAYS_KEY, days.join(','));
    sessionStorage.setItem(SESSION_KEY, '1');
    return days.length;
  } catch {
    return 0;
  }
}
