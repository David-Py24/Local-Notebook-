import { useEffect } from "react";
import { useStore } from "./stores/useStore";
import { useScheduler } from "./services/useScheduler";
import Layout from "./components/Layout";

function App() {
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const refreshExplorer = useStore((s) => s.refreshExplorer);
  const reduceMotion = useStore((s) => s.settings.reduceMotion);
  const onboardingComplete = useStore((s) => s.onboardingComplete);
  const refreshGoogleAccount = useStore((s) => s.refreshGoogleAccount);

  const startupFolder = useStore((s) => s.settings.startupFolder);
  const openFolder = useStore((s) => s.openFolder);

  // Restore the signed-in Google Drive account (refresh token lives in the OS Credential Manager)
  useEffect(() => {
    refreshGoogleAccount();
  }, [refreshGoogleAccount]);

  // Scheduled study tasks clock (Phase 3): fires due tasks while the app is open.
  useScheduler();

  useEffect(() => {
    if (!onboardingComplete) return;
    if (!currentFolderPath && startupFolder) {
      openFolder(startupFolder);
    } else if (currentFolderPath) {
      refreshExplorer();
    }
  }, [currentFolderPath, startupFolder, openFolder, refreshExplorer, onboardingComplete]);

  // Apply reduce motion preference globally
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [reduceMotion]);

  // Register window close handler to flush pending saves before exit
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function registerCloseHandler() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onCloseRequested(async (event) => {
          event.preventDefault();
          await useStore.getState().flushPendingSave();
          // Best-effort sidecar teardown so dirty exits don't orphan an `opencode serve`
          // that then hogs a port for the next launch (OPENCODE_HTTP500_DIAGNOSIS_PLAN.md,
          // workstream C). Fire-and-forget: the app teardown continues immediately.
          void useStore.getState().stopOpencodeServer();
          if (unlisten) {
            unlisten();
          }
          await appWindow.close();
        });
      } catch (err) {
        console.warn("Tauri close listener setup failed or not in Tauri environment", err);
      }
    }

    registerCloseHandler();

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const state = useStore.getState();
      if (state.leftSaveStatus === "unsaved" || state.rightSaveStatus === "unsaved") {
        state.flushPendingSave();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (unlisten) unlisten();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return <Layout />;
}

export default App;
