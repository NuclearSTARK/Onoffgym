// Shared by both static hosts. Keep scripts local; do not allow inline handlers
// or eval. Styles remain compatible with the app's dynamic viewport/canvas UI.
export const CONTENT_SECURITY_POLICY="script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
