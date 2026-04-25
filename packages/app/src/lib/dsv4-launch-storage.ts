export const DSV4_MODAL_DISMISSED_KEY = 'inferencex-dsv4-modal-dismissed';

export function isDsv4ModalDismissed(): boolean {
  try {
    return localStorage.getItem(DSV4_MODAL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveDsv4ModalDismissed(): void {
  try {
    localStorage.setItem(DSV4_MODAL_DISMISSED_KEY, '1');
  } catch {
    // localStorage unavailable
  }
}
