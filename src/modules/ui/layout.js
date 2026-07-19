/**
 * KartData Layout Module — CSS Grid panel management (no external dependencies)
 */
export class LayoutModule {
  constructor() {
    this.container = null;
  }

  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('[Layout] Container not found:', containerId);
    }
    return this;
  }

  togglePanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('panel-hidden');
  }
}
