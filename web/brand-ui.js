export const INSTAGRAM_URL='https://www.instagram.com/onoff.ilguang/';
export const INSTAGRAM_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.7" r=".9" fill="currentColor" stroke="none"/></svg>';
export function instagramLink(){return `<a class="instagram-link" href="${INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer" aria-label="온오프 인스타그램 열기">${INSTAGRAM_ICON}</a>`;}
