/* eslint-disable @typescript-eslint/no-explicit-any */
import { initUI } from './ui';

// Initialize UI and Observer
initUI();

// Flag to prevent multiple injections
if (!(window as any).hasReapExtensionActive) {
    (window as any).hasReapExtensionActive = true;
    console.log("REAP Extension Loaded (Refactored)");
}
