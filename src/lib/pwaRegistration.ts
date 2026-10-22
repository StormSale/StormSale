export interface PwaRegistrationCallbacks {
  onOfflineReady: () => void;
  onRegisterError: (error: unknown) => void;
}

export function createPwaRegistrationCallbacks(): PwaRegistrationCallbacks {
  return {
    onOfflineReady() {
      window.dispatchEvent(new Event("pwa:offline-ready"));
    },
    onRegisterError(error) {
      window.dispatchEvent(new CustomEvent("pwa:register-error", { detail: error }));
    },
  };
}
