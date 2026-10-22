import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export const InstallPrompt: React.FC = () => {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallEvent(null);
      setMessage("StormSale has been installed.");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setMessage(
        choice.outcome === "accepted"
          ? "StormSale has been installed."
          : "Installation was dismissed.",
      );
      setInstallEvent(null);
    } catch (error) {
      console.error("Could not show the StormSale install prompt:", error);
      setMessage("The install prompt could not be opened. Try your browser's install menu.");
      setInstallEvent(null);
    }
  };

  return (
    <>
      {installEvent && (
        <button
          type="button"
          onClick={install}
          className="fixed bottom-4 right-4 z-40 rounded-full bg-indigo-600 px-5 py-3 font-semibold text-white shadow-lg hover:bg-indigo-700"
        >
          Install StormSale App
        </button>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
    </>
  );
};
