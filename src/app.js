// KartData Application Bootstrapper
// Import all modules and initialize the application

// Phase 0: Minimal bootstrap — just confirms the DOM is ready
// Later phases: import and wire all module inits

document.addEventListener('DOMContentLoaded', () => {
    console.log('KartData v3 — Precision Telemetry Suite');

    // Auto-detect dark mode
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
    }

    console.log('KartData ready — waiting for telemetry data...');
});
