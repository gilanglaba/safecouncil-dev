/**
 * Tiny helper: open the browser's native print dialog. The caller is
 * responsible for having a <PrintableReport result={...} /> mounted inside
 * a .sc-printable container on the current page before calling this —
 * the @media print CSS injected by PrintableReport hides the rest of the
 * page and shows only that container.
 *
 * This exists so callers don't have to think about timing or call
 * window.print directly; we wait one animation frame so React has
 * finished mounting any state-driven PrintableReport before the dialog
 * opens.
 */
export function triggerPrint() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.print());
  });
}
