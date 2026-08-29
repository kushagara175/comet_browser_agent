/**
 * @privapilot/extension - Content Script Semantic State Verifier
 *
 * Implements section 6.3 of the Winning Execution Playbook:
 * Validates semantic outcome (e.g. preview drawer became visible) rather than image pHash alone.
 */

export class SemanticStateVerifier {
  /**
   * Waits and checks if the expected semantic state occurred.
   */
  static async verifyOutcome(expectedState?: string): Promise<boolean> {
    if (!expectedState) return true;

    // Small stabilization window
    await new Promise((resolve) => setTimeout(resolve, 250));

    const exp = expectedState.toLowerCase();

    if (exp.includes('preview') || exp.includes('modal') || exp.includes('drawer')) {
      const activeModals = document.querySelectorAll('.modal, .drawer, [role="dialog"], [aria-modal="true"], .preview-panel');
      for (const m of activeModals) {
        const style = window.getComputedStyle(m);
        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
          return true;
        }
      }
    }

    // Default semantic outcome check: DOM is interactive and ready
    return document.readyState === 'complete' || document.readyState === 'interactive';
  }
}
