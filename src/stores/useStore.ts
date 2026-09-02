import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getThemeById, applyThemeToDocument } from "../themes";
import type { Project } from "../types";

export type ViewMode = "source" | "live" | "preview";
export type SaveStatus = "saved" | "saving" | "unsaved";
export type SidePanelId = "assistant" | "sources";

export interface CustomLayout {
  id: string;
  name: string;
  panelOrder: SidePanelId[];
  showAssistantPanel: boolean;
  showSourcesPanel: boolean;
  assistantWidth: number;
  sourcePanelWidth: number;
  splitActive: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
}

export interface Tab {
  id: string; // absolute file path
  title: string;
  pinned: boolean;
}

export interface SessionTab {
  id: string;
  title: string;
  active: boolean;
}

export interface UserAccount {
  name: string;
  email: string;
  avatarLetter: string;
  avatarColor: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const INITIAL_ASSISTANT_MESSAGES: AssistantMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    timestamp: "12:00 PM",
    content: "Welcome to Local Study Notebook! I am your offline study assistant. You can ask me for study tips, markdown help, or note-taking advice.",
  },
];

export interface Settings {
  fontSize: number;
  theme: string;
  accentColor: string;
  cornerRoundness: "sm" | "md" | "lg" | "none";
  lineWrap: boolean;
  tabSize: number;
  fontFamily: string;
  showLineNumbers: boolean;
  livePreviewEnabled: boolean;
  livePreviewTimeout: number; // in ms
  startupFolder: string;
  newNoteLocation: string;
  excludedFolders: string;
  attachmentsFolder: string;
  confirmBeforeDelete: boolean;
  reduceMotion: boolean;
  autoPairBrackets: boolean;
  showWordCount: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  fontSize: 14,
  theme: "obsidian-dark",
  accentColor: "",
  cornerRoundness: "md",
  lineWrap: true,
  tabSize: 4,
  fontFamily: "system",
  showLineNumbers: false,
  livePreviewEnabled: true,
  livePreviewTimeout: 1000,
  startupFolder: "",
  newNoteLocation: "",
  excludedFolders: "node_modules, .git",
  attachmentsFolder: "_attachments",
  confirmBeforeDelete: true,
  reduceMotion: false,
  autoPairBrackets: true,
  showWordCount: true,
};

interface AppState {
  // Explorer States
  currentFolderPath: string | null;
  explorerEntries: FileEntry[];
  pinnedPaths: string[];
  showSourcesPanel: boolean; // Toggles the Sidebar Explorer panel
  sidebarTab: "sources" | "notes"; // "sources" represents Folder Explorer, "notes" is Pinned/Recent notes list

  // Panel ordering (left-to-right order of the two side panels, StudyBoard is always last/center)
  panelOrder: SidePanelId[];
  reorderPanels: (fromId: SidePanelId, toId: SidePanelId) => void;

  // Split-Screen Workspace States
  splitActive: boolean;
  activePanel: "left" | "right";
  leftTabs: Tab[];
  rightTabs: Tab[];
  activeLeftTabId: string | null;
  activeRightTabId: string | null;
  leftDraft: string;
  rightDraft: string;
  leftViewMode: ViewMode;
  rightViewMode: ViewMode;
  leftSaveStatus: SaveStatus;
  rightSaveStatus: SaveStatus;
  leftLivePreviewActive: boolean;
  rightLivePreviewActive: boolean;
  sourcePreviewHeight: number;
  sourcePanelWidth: number;

  // Settings
  showSettings: boolean;
  settings: Settings;

  // Projects
  projects: Project[];
  showProjectsPanel: boolean;
  addProject: (id: string, name: string, path: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  toggleProjectPinned: (id: string) => void;
  openProject: (id: string) => Promise<void>;
  setShowProjectsPanel: (show: boolean) => void;

  // Actions
  openFolder: (path: string) => Promise<void>;
  closeFolder: () => void;
  refreshExplorer: () => Promise<void>;
  createFile: (dirPath: string, name: string) => Promise<string>;
  createFolder: (parentPath: string, name: string) => Promise<string>;
  renameEntry: (oldPath: string, newPath: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;

  openFile: (path: string, panel?: "left" | "right") => Promise<void>;
  openNewNote: () => Promise<void>;
  closeTab: (panel: "left" | "right", path: string) => Promise<void>;
  selectTab: (panel: "left" | "right", path: string) => Promise<void>;
  flushPendingSave: (panel?: "left" | "right") => Promise<void>;
  setDraftContent: (panel: "left" | "right", content: string) => void;
  saveFile: (panel: "left" | "right", path: string, content: string) => Promise<void>;
  togglePinPath: (path: string) => void;
  setPanelViewMode: (panel: "left" | "right", mode: ViewMode) => void;
  setPanelLivePreview: (panel: "left" | "right", active: boolean) => void;
  setActivePanel: (panel: "left" | "right") => void;
  splitScreen: () => void;
  closeSplit: () => void;
  moveTab: (fromPanel: "left" | "right", toPanel: "left" | "right", path: string) => Promise<void>;
  toggleSourcesPanel: () => void;
  setSidebarTab: (t: "sources" | "notes") => void;
  setSourcePreviewHeight: (h: number) => void;
  setSourcePanelWidth: (w: number) => void;

  // Settings Actions
  setShowSettings: (show: boolean) => void;
  updateSettings: (s: Partial<Settings>) => void;

  // Assistant / Co-pilot States & Actions
  showAssistantPanel: boolean;
  assistantWidth: number;
  assistantMessages: AssistantMessage[];
  selectedModel: string;
  assistantTopicTitle: string;
  filterQuery: string;
  sendAssistantMessage: (text: string) => Promise<void>;
  clearAssistantMessages: () => void;
  setAssistantWidth: (w: number) => void;
  toggleAssistantPanel: () => void;
  setSelectedModel: (m: string) => void;
  setAssistantTopicTitle: (t: string) => void;
  setFilterQuery: (q: string) => void;

  // Session & Account States & Actions (TopBar)
  sessions: SessionTab[];
  activeSessionId: string;
  userAccount: UserAccount;
  showSearchModal: boolean;
  topbarViewMode: "grid" | "split" | "single";
  createSession: (title?: string) => void;
  closeSession: (id: string) => void;
  selectSession: (id: string) => void;
  setShowSearchModal: (show: boolean) => void;
  setTopbarViewMode: (mode: "grid" | "split" | "single") => void;

  // Launcher & Panel Arrangement States & Actions (Iteration 3)
  showLauncherModal: boolean;
  showPanelLayoutModal: boolean;
  panelPreset: "default" | "focus" | "assistant" | "explorer" | "custom";
  setShowLauncherModal: (show: boolean) => void;
  setShowPanelLayoutModal: (show: boolean) => void;
  applyPanelPreset: (preset: "default" | "focus" | "assistant" | "explorer") => void;
  scaffoldWorkspaceTemplate: (folderPath: string) => Promise<void>;

  // Custom saved layouts (TICKET-B4)
  customLayouts: CustomLayout[];
  saveCustomLayout: (name: string) => void;
  applyCustomLayout: (id: string) => void;
  deleteCustomLayout: (id: string) => void;
}

export const useStore = create<AppState>((set, get) => {
  // Load initial settings and pinned paths from localStorage
  const localSettings = localStorage.getItem("lsn_settings");
  const initialSettings = localSettings ? { ...DEFAULT_SETTINGS, ...JSON.parse(localSettings) } : DEFAULT_SETTINGS;
  const initialPinned = localStorage.getItem("lsn_pinned");
  const pinnedPaths = initialPinned ? JSON.parse(initialPinned) : [];
  const savedFolder = localStorage.getItem("lsn_last_folder");
  const localProjects = localStorage.getItem("lsn_projects");
  const initialProjects: Project[] = localProjects ? JSON.parse(localProjects) : [];
  const localPanelOrder = localStorage.getItem("lsn_panel_order");
  const parsedPanelOrder: SidePanelId[] | null = localPanelOrder ? JSON.parse(localPanelOrder) : null;
  const isValidPanelOrder =
    parsedPanelOrder &&
    parsedPanelOrder.length === 2 &&
    parsedPanelOrder.includes("assistant") &&
    parsedPanelOrder.includes("sources");
  const initialPanelOrder: SidePanelId[] = isValidPanelOrder ? parsedPanelOrder! : ["assistant", "sources"];
  const localCustomLayouts = localStorage.getItem("lsn_custom_layouts");
  const initialCustomLayouts: CustomLayout[] = localCustomLayouts ? JSON.parse(localCustomLayouts) : [];

  // Apply the persisted theme immediately (live colors)
  const themeColors = getThemeById(initialSettings.theme).colors;
  applyThemeToDocument({
    ...themeColors,
    accent: initialSettings.accentColor || themeColors.accent,
    accentHover: initialSettings.accentColor || themeColors.accentHover,
  });

  // Local write timer refs managed inside store callbacks
  let leftSaveTimer: number | null = null;
  let rightSaveTimer: number | null = null;

  return {
    // Explorer States
    currentFolderPath: savedFolder || null,
    explorerEntries: [],
    pinnedPaths: pinnedPaths,
    showSourcesPanel: true,
    sidebarTab: "sources",
    sourcePanelWidth: 200,
    panelOrder: initialPanelOrder,

    // Projects
    projects: initialProjects,
    showProjectsPanel: false,

    // Split-Screen Workspace States
    splitActive: false,
    activePanel: "left",
    leftTabs: [],
    rightTabs: [],
    activeLeftTabId: null,
    activeRightTabId: null,
    leftDraft: "",
    rightDraft: "",
    leftViewMode: "live",
    rightViewMode: "live",
    leftSaveStatus: "saved",
    rightSaveStatus: "saved",
    leftLivePreviewActive: false,
    rightLivePreviewActive: false,
    sourcePreviewHeight: 250,

    // Assistant States
    showAssistantPanel: true,
    assistantWidth: 380,
    assistantMessages: INITIAL_ASSISTANT_MESSAGES,
    selectedModel: "Big Pickle",
    assistantTopicTitle: "Local Study Notebook implementation plan",
    filterQuery: "",

    // Session & Account States
    sessions: [
      { id: "sess-1", title: "Local Study Notebook impl", active: true },
      { id: "sess-2", title: "New session - 2026-08-31T14", active: false }
    ],
    activeSessionId: "sess-1",
    userAccount: {
      name: "Developer Workspace",
      email: "developer@localnotebook.app",
      avatarLetter: "D",
      avatarColor: "#7c3aed"
    },
    showSearchModal: false,
    topbarViewMode: "split",

    // Launcher & Panel Arrangement States (Iteration 3)
    showLauncherModal: false,
    showPanelLayoutModal: false,
    panelPreset: "default",
    customLayouts: initialCustomLayouts,

    // Settings
    showSettings: false,
    settings: initialSettings,

    // Folder Actions
    openFolder: async (path) => {
      set({ currentFolderPath: path });
      localStorage.setItem("lsn_last_folder", path);
      await get().refreshExplorer();
    },

    closeFolder: () => {
      set({ currentFolderPath: null, explorerEntries: [], leftTabs: [], rightTabs: [], activeLeftTabId: null, activeRightTabId: null });
      localStorage.removeItem("lsn_last_folder");
    },

    refreshExplorer: async () => {
      const folderPath = get().currentFolderPath;
      if (!folderPath) return;
      try {
        const excludedList = get()
          .settings.excludedFolders.split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        const entries = await invoke<FileEntry[]>("read_local_dir", {
          path: folderPath,
          excludedFolders: excludedList,
        });
        set({ explorerEntries: entries });
      } catch (err) {
        console.error("Failed to read local folder explorer directory:", err);
      }
    },

    createFile: async (dirPath, name) => {
      try {
        const path = await invoke<string>("create_local_file", {
          dirPath,
          name,
          vaultRoot: get().currentFolderPath || undefined,
        });
        await get().refreshExplorer();
        return path;
      } catch (err) {
        throw new Error(String(err));
      }
    },

    createFolder: async (parentPath, name) => {
      try {
        const path = await invoke<string>("create_local_dir", {
          parentPath,
          name,
          vaultRoot: get().currentFolderPath || undefined,
        });
        await get().refreshExplorer();
        return path;
      } catch (err) {
        throw new Error(String(err));
      }
    },

    renameEntry: async (oldPath, newPath) => {
      try {
        await invoke("rename_local_entry", {
          oldPath,
          newPath,
          vaultRoot: get().currentFolderPath || undefined,
        });
        
        // Update tabs referencing this path
        const updateTabs = (tabs: Tab[]) =>
          tabs.map((t) => {
            if (t.id === oldPath) {
              const name = newPath.split(/[\\/]/).pop() ?? newPath;
              return { ...t, id: newPath, title: name.replace(/\.md$/, "") };
            }
            return t;
          });

        const leftTabs = updateTabs(get().leftTabs);
        const rightTabs = updateTabs(get().rightTabs);
        const activeLeft = get().activeLeftTabId === oldPath ? newPath : get().activeLeftTabId;
        const activeRight = get().activeRightTabId === oldPath ? newPath : get().activeRightTabId;

        set({ leftTabs, rightTabs, activeLeftTabId: activeLeft, activeRightTabId: activeRight });
        await get().refreshExplorer();
      } catch (err) {
        throw new Error(String(err));
      }
    },

    deleteEntry: async (path) => {
      try {
        await invoke("delete_local_entry", {
          path,
          vaultRoot: get().currentFolderPath || undefined,
        });
        
        // Close tabs referencing this path
        get().closeTab("left", path);
        get().closeTab("right", path);
        
        await get().refreshExplorer();
      } catch (err) {
        throw new Error(String(err));
      }
    },

    // File Workspace Actions
    openFile: async (path, panel) => {
      const targetPanel = panel || get().activePanel;
      const isLeft = targetPanel === "left";
      const tabs = isLeft ? get().leftTabs : get().rightTabs;
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;

      if (activeId === path) return;

      await get().flushPendingSave(targetPanel);

      // Check if already open in this panel
      const existing = tabs.find((t) => t.id === path);
      if (existing) {
        if (isLeft) {
          set({ activeLeftTabId: path });
        } else {
          set({ activeRightTabId: path });
        }
        // Load contents into draft
        try {
          const content = await invoke<string>("read_local_file", {
            path,
            vaultRoot: get().currentFolderPath || undefined,
          });
          if (isLeft) set({ leftDraft: content, leftSaveStatus: "saved" }); else set({ rightDraft: content, rightSaveStatus: "saved" });
        } catch {}
        return;
      }

      // Read file content
      let content = "";
      try {
        content = await invoke<string>("read_local_file", {
          path,
          vaultRoot: get().currentFolderPath || undefined,
        });
      } catch (err) {
        console.error("Failed to read file", err);
        return;
      }

      const filename = path.split(/[\\/]/).pop() ?? "Note";
      const title = filename.replace(/\.md$/, "");
      const isPinned = get().pinnedPaths.includes(path);
      const newTab: Tab = { id: path, title, pinned: isPinned };

      const activeTab = tabs.find((t) => t.id === activeId);

      if (tabs.length === 0 || activeId === null || !activeTab || activeTab.pinned) {
        // Open in new tab
        const newTabs = [...tabs, newTab];
        if (isLeft) {
          set({ leftTabs: newTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
        } else {
          set({ rightTabs: newTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
        }
      } else {
        // Reuse current active unpinned tab
        const newTabs = tabs.map((t) => (t.id === activeId ? newTab : t));
        if (isLeft) {
          set({ leftTabs: newTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
        } else {
          set({ rightTabs: newTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
        }
      }
    },

    openNewNote: async () => {
      const folderPath = get().currentFolderPath;
      if (!folderPath) {
        alert("Please open a local workspace folder first to create notes!");
        return;
      }

      const subFolder = get().settings.newNoteLocation.trim();
      let targetDir = folderPath;
      if (subFolder) {
        targetDir = `${folderPath}/${subFolder}`.replace(/[\\/]+/g, "/");
        try {
          await get().createFolder(folderPath, subFolder);
        } catch {
          // Subfolder may already exist
        }
      }

      // Try "Untitled", "Untitled 1", "Untitled 2", ... letting the backend's actual
      // filesystem check decide what already exists, rather than predicting it here —
      // `explorerEntries` is a flat, top-level-only, possibly-stale list, and comparing
      // its paths against a JS-joined `${dir}/${name}` string breaks on Windows anyway
      // (backend paths use `\`, this join always uses `/`), so a real pre-existing
      // "Untitled.md" was never detected and every click hit the backend's own
      // "File already exists" rejection instead of picking the next available name.
      const MAX_ATTEMPTS = 200;
      let lastErr: unknown = null;
      for (let index = 0; index <= MAX_ATTEMPTS; index++) {
        const name = index === 0 ? "Untitled" : `Untitled ${index}`;
        try {
          const path = await get().createFile(targetDir, name);
          await get().openFile(path);
          return;
        } catch (err) {
          lastErr = err;
          if (!String(err).toLowerCase().includes("already exists")) break;
        }
      }
      alert("Failed to create new file: " + lastErr);
    },

    closeTab: async (panel, path) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;

      if (activeId === path) {
        await get().flushPendingSave(panel);
      }

      const tabs = isLeft ? get().leftTabs : get().rightTabs;
      const newTabs = tabs.filter((t) => t.id !== path);
      let nextActive = activeId;

      if (activeId === path) {
        nextActive = newTabs.length ? newTabs[newTabs.length - 1].id : null;
      }

      if (isLeft) {
        set({ leftTabs: newTabs, activeLeftTabId: nextActive });
        if (nextActive) {
          try {
            const c = await invoke<string>("read_local_file", { path: nextActive });
            set({ leftDraft: c, leftSaveStatus: "saved" });
          } catch {}
        } else {
          set({ leftDraft: "", leftSaveStatus: "saved" });
        }
      } else {
        set({ rightTabs: newTabs, activeRightTabId: nextActive });
        if (nextActive) {
          try {
            const c = await invoke<string>("read_local_file", { path: nextActive });
            set({ rightDraft: c, rightSaveStatus: "saved" });
          } catch {}
        } else {
          set({ rightDraft: "", rightSaveStatus: "saved" });
        }
      }
    },

    selectTab: async (panel, path) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;
      if (activeId === path) return;

      await get().flushPendingSave(panel);

      if (isLeft) {
        set({ activeLeftTabId: path });
        try {
          const c = await invoke<string>("read_local_file", { path });
          set({ leftDraft: c, leftSaveStatus: "saved" });
        } catch (e) {
          console.error("Failed to read file on selectTab", e);
        }
      } else {
        set({ activeRightTabId: path });
        try {
          const c = await invoke<string>("read_local_file", { path });
          set({ rightDraft: c, rightSaveStatus: "saved" });
        } catch (e) {
          console.error("Failed to read file on selectTab", e);
        }
      }
    },

    flushPendingSave: async (panel) => {
      if (!panel || panel === "left") {
        if (leftSaveTimer !== null) {
          window.clearTimeout(leftSaveTimer);
          leftSaveTimer = null;
        }
        const leftId = get().activeLeftTabId;
        if (leftId && get().leftSaveStatus === "unsaved") {
          await get().saveFile("left", leftId, get().leftDraft);
        }
      }
      if (!panel || panel === "right") {
        if (rightSaveTimer !== null) {
          window.clearTimeout(rightSaveTimer);
          rightSaveTimer = null;
        }
        const rightId = get().activeRightTabId;
        if (rightId && get().rightSaveStatus === "unsaved") {
          await get().saveFile("right", rightId, get().rightDraft);
        }
      }
    },

    setDraftContent: (panel, content) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;
      if (!activeId) return;

      if (isLeft) {
        set({ leftDraft: content, leftSaveStatus: "unsaved" });
        if (leftSaveTimer !== null) window.clearTimeout(leftSaveTimer);
        leftSaveTimer = window.setTimeout(async () => {
          leftSaveTimer = null;
          if (get().activeLeftTabId === activeId && get().leftSaveStatus === "unsaved") {
            await get().saveFile("left", activeId, content);
          }
        }, get().settings.livePreviewTimeout);
      } else {
        set({ rightDraft: content, rightSaveStatus: "unsaved" });
        if (rightSaveTimer !== null) window.clearTimeout(rightSaveTimer);
        rightSaveTimer = window.setTimeout(async () => {
          rightSaveTimer = null;
          if (get().activeRightTabId === activeId && get().rightSaveStatus === "unsaved") {
            await get().saveFile("right", activeId, content);
          }
        }, get().settings.livePreviewTimeout);
      }
    },

    saveFile: async (panel, path, content) => {
      const isLeft = panel === "left";
      if (isLeft) set({ leftSaveStatus: "saving" }); else set({ rightSaveStatus: "saving" });

      try {
        await invoke("write_local_file", {
          path,
          content,
          vaultRoot: get().currentFolderPath || undefined,
        });
        if (isLeft) set({ leftSaveStatus: "saved" }); else set({ rightSaveStatus: "saved" });
        
        // Refresh filename if user updated the first header
        const filename = path.split(/[\\/]/).pop() ?? "Note";
        let displayTitle = filename.replace(/\.md$/, "");
        
        const firstHeading = content
          .split(/\r?\n/)
          .map((str: string) => str.trim())
          .find((l: string) => l.startsWith('#'));
        
        if (firstHeading) {
          displayTitle = firstHeading.replace(/^#+\s*/, "").trim();
        }

        const updateTabTitle = (tabs: Tab[]) =>
          tabs.map((t) => (t.id === path ? { ...t, title: displayTitle } : t));

        if (isLeft) {
          set({ leftTabs: updateTabTitle(get().leftTabs) });
        } else {
          set({ rightTabs: updateTabTitle(get().rightTabs) });
        }
      } catch (err) {
        if (isLeft) set({ leftSaveStatus: "unsaved" }); else set({ rightSaveStatus: "unsaved" });
        console.error("Autosave failed", err);
      }
    },

    togglePinPath: (path) => {
      const pinned = get().pinnedPaths;
      const isPinned = pinned.includes(path);
      const nextPinned = isPinned ? pinned.filter((p) => p !== path) : [...pinned, path];
      
      set({ pinnedPaths: nextPinned });
      localStorage.setItem("lsn_pinned", JSON.stringify(nextPinned));

      const updatePin = (tabs: Tab[]) =>
        tabs.map((t) => (t.id === path ? { ...t, pinned: !isPinned } : t));

      set({ leftTabs: updatePin(get().leftTabs), rightTabs: updatePin(get().rightTabs) });
    },

    setPanelViewMode: (panel, mode) => {
      if (panel === "left") set({ leftViewMode: mode }); else set({ rightViewMode: mode });
    },

    setPanelLivePreview: (panel, active) => {
      if (panel === "left") set({ leftLivePreviewActive: active }); else set({ rightLivePreviewActive: active });
    },

    setActivePanel: (panel) => set({ activePanel: panel }),

    splitScreen: () => {
      // Set split to active and copy left tab structure into right if right is empty
      const leftActiveId = get().activeLeftTabId;
      const rightTabs = get().rightTabs;
      
      if (rightTabs.length === 0 && leftActiveId) {
        const leftTab = get().leftTabs.find((t) => t.id === leftActiveId);
        if (leftTab) {
          set({
            rightTabs: [leftTab],
            activeRightTabId: leftActiveId,
            rightDraft: get().leftDraft,
            rightViewMode: get().leftViewMode,
            rightSaveStatus: "saved"
          });
        }
      }
      set({ splitActive: true, activePanel: "right" });
    },

    closeSplit: () => {
      set({ splitActive: false, rightTabs: [], activeRightTabId: null, activePanel: "left" });
    },

    moveTab: async (fromPanel, toPanel, path) => {
      if (fromPanel === toPanel) return;
      const fromIsLeft = fromPanel === "left";
      const toIsLeft = toPanel === "left";

      const fromTabs = fromIsLeft ? get().leftTabs : get().rightTabs;
      const tab = fromTabs.find((t) => t.id === path);
      if (!tab) return;

      const fromActiveId = fromIsLeft ? get().activeLeftTabId : get().activeRightTabId;
      const isActiveInSource = fromActiveId === path;

      // Reuse the already-loaded draft when moving the source panel's active tab;
      // otherwise (a background tab) there's no in-memory copy, so read it from disk.
      let content: string;
      if (isActiveInSource) {
        await get().flushPendingSave(fromPanel);
        content = fromIsLeft ? get().leftDraft : get().rightDraft;
      } else {
        try {
          content = await invoke<string>("read_local_file", { path });
        } catch (err) {
          console.error("Failed to read file for tab move", err);
          return;
        }
      }

      // Remove from source panel, promoting another tab to active there if needed
      const newFromTabs = fromTabs.filter((t) => t.id !== path);
      const nextFromActive = isActiveInSource
        ? newFromTabs.length
          ? newFromTabs[newFromTabs.length - 1].id
          : null
        : fromActiveId;

      if (fromIsLeft) {
        set({ leftTabs: newFromTabs, activeLeftTabId: nextFromActive });
      } else {
        set({ rightTabs: newFromTabs, activeRightTabId: nextFromActive });
      }

      if (isActiveInSource) {
        if (nextFromActive) {
          try {
            const c = await invoke<string>("read_local_file", { path: nextFromActive });
            if (fromIsLeft) set({ leftDraft: c, leftSaveStatus: "saved" });
            else set({ rightDraft: c, rightSaveStatus: "saved" });
          } catch {}
        } else {
          if (fromIsLeft) set({ leftDraft: "", leftSaveStatus: "saved" });
          else set({ rightDraft: "", rightSaveStatus: "saved" });
        }
      }

      // Ensure the destination panel exists (auto-split when dropping into an unsplit view)
      if (!get().splitActive) {
        set({ splitActive: true });
      }

      const toTabs = toIsLeft ? get().leftTabs : get().rightTabs;
      const newToTabs = toTabs.some((t) => t.id === path) ? toTabs : [...toTabs, tab];

      if (toIsLeft) {
        set({ leftTabs: newToTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
      } else {
        set({ rightTabs: newToTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
      }

      set({ activePanel: toPanel });
    },

    toggleSourcesPanel: () => set((s) => ({ showSourcesPanel: !s.showSourcesPanel })),
    setSidebarTab: (t) => set({ sidebarTab: t }),
    setSourcePreviewHeight: (h) => set({ sourcePreviewHeight: h }),
    setSourcePanelWidth: (w) => set({ sourcePanelWidth: w }),
    reorderPanels: (fromId, toId) => {
      const order = get().panelOrder;
      const fromIndex = order.indexOf(fromId);
      const toIndex = order.indexOf(toId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

      const nextOrder = [...order];
      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, fromId);

      set({ panelOrder: nextOrder });
      localStorage.setItem("lsn_panel_order", JSON.stringify(nextOrder));
    },
    // Settings
    setShowSettings: (show) => set({ showSettings: show }),
    updateSettings: (updated) => {
      const nextSettings = { ...get().settings, ...updated };
      set({ settings: nextSettings });
      localStorage.setItem("lsn_settings", JSON.stringify(nextSettings));

      if (updated.excludedFolders !== undefined) {
        setTimeout(() => get().refreshExplorer(), 0);
      }

      // Apply theme colors live
      const theme = getThemeById(nextSettings.theme).colors;
      const accent = nextSettings.accentColor || theme.accent;
      applyThemeToDocument({
        ...theme,
        accent,
        accentHover: nextSettings.accentColor || theme.accentHover,
      });
    },
    // Project actions
    addProject: (id, name, path) => {
      const project: Project = { id, name, path, lastOpened: new Date().toISOString() };
      const exists = get().projects.some((p) => p.path === path || p.id === id);
      const projects = exists
        ? get().projects.map((p) => (p.path === path || p.id === id ? project : p))
        : [...get().projects, project];
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
      set({ showProjectsPanel: false });
    },
    renameProject: (id, name) => {
      const projects = get().projects.map((p) => (p.id === id ? { ...p, name } : p));
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    deleteProject: (id) => {
      const projects = get().projects.filter((p) => p.id !== id);
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    toggleProjectPinned: (id) => {
      const projects = get().projects.map((p) =>
        p.id === id ? { ...p, pinned: !p.pinned } : p
      );
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    openProject: async (id) => {
      const project = get().projects.find((p) => p.id === id);
      if (!project) return;
      await get().openFolder(project.path);
      const projects = get().projects.map((p) =>
        p.id === id ? { ...p, lastOpened: new Date().toISOString() } : p
      );
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
      set({ showProjectsPanel: false, currentFolderPath: project.path });
    },
    setShowProjectsPanel: (show) => set({ showProjectsPanel: show }),

    // Assistant Actions
    sendAssistantMessage: async (text: string) => {
      if (!text.trim()) return;
      const userMsg: AssistantMessage = {
        id: "msg-" + Date.now(),
        role: "user",
        content: text.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      
      const newMessages = [...get().assistantMessages, userMsg];
      set({ assistantMessages: newMessages });

      // Generate realistic study notebook assistant reply
      const promptLower = text.toLowerCase();
      let reply = "I have analyzed your notes and workspace structure. Everything is synced locally.";
      if (promptLower.includes("plan") || promptLower.includes("task")) {
        reply = "Here is the summary of current workspace tasks:\n- Explorer is configured to browse local files\n- Study board active with document live preview\n- Auto-save is active across all open tabs.";
      } else if (promptLower.includes("theme") || promptLower.includes("color")) {
        reply = "Theme configuration updated. You can tweak color tokens and corner radius in Settings.";
      } else if (promptLower.includes("file") || promptLower.includes("note")) {
        reply = `Found **${get().explorerEntries.length}** root entries in active workspace. Click any \`.md\` file in the tree to open.`;
      } else {
        reply = `Processing with **${get().selectedModel}**:\n\nYour request: *"${text}"* has been recorded. Working on the study notes workspace.`;
      }

      setTimeout(() => {
        const assistantMsg: AssistantMessage = {
          id: "msg-" + (Date.now() + 1),
          role: "assistant",
          content: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        set({ assistantMessages: [...get().assistantMessages, assistantMsg] });
      }, 400);
    },
    clearAssistantMessages: () => set({ assistantMessages: [] }),
    setAssistantWidth: (w) => set({ assistantWidth: w }),
    toggleAssistantPanel: () => set((s) => ({ showAssistantPanel: !s.showAssistantPanel })),
    setSelectedModel: (m) => set({ selectedModel: m }),
    setAssistantTopicTitle: (t) => set({ assistantTopicTitle: t }),
    setFilterQuery: (q) => set({ filterQuery: q }),

    // Session Actions
    createSession: (title) => {
      const id = "sess-" + Date.now();
      const newTitle = title || `New session - ${new Date().toISOString().slice(0, 16)}`;
      const sessions = get().sessions.map((s) => ({ ...s, active: false }));
      sessions.push({ id, title: newTitle, active: true });
      set({ sessions, activeSessionId: id });
    },
    closeSession: (id) => {
      const current = get().sessions;
      if (current.length <= 1) return;
      const filtered = current.filter((s) => s.id !== id);
      let activeId = get().activeSessionId;
      if (activeId === id) {
        activeId = filtered[filtered.length - 1].id;
      }
      const updated = filtered.map((s) => ({ ...s, active: s.id === activeId }));
      set({ sessions: updated, activeSessionId: activeId });
    },
    selectSession: (id) => {
      const updated = get().sessions.map((s) => ({ ...s, active: s.id === id }));
      set({ sessions: updated, activeSessionId: id });
    },
    setShowSearchModal: (show) => set({ showSearchModal: show }),
    setTopbarViewMode: (mode) => set({ topbarViewMode: mode }),

    // Launcher & Panel Arrangement Actions (Iteration 3)
    setShowLauncherModal: (show) => set({ showLauncherModal: show }),
    setShowPanelLayoutModal: (show) => set({ showPanelLayoutModal: show }),

    applyPanelPreset: (preset) => {
      set({ panelPreset: preset });
      if (preset === "default") {
        set({ showAssistantPanel: true, showSourcesPanel: true, assistantWidth: 360, sourcePanelWidth: 200, splitActive: false });
      } else if (preset === "focus") {
        set({ showAssistantPanel: false, showSourcesPanel: false, splitActive: false });
      } else if (preset === "assistant") {
        set({ showAssistantPanel: true, showSourcesPanel: false, assistantWidth: 420, splitActive: false });
      } else if (preset === "explorer") {
        set({ showAssistantPanel: false, showSourcesPanel: true, sourcePanelWidth: 240, splitActive: false });
      }
    },

    saveCustomLayout: (name) => {
      const layout: CustomLayout = {
        id: "layout-" + Date.now(),
        name,
        panelOrder: get().panelOrder,
        showAssistantPanel: get().showAssistantPanel,
        showSourcesPanel: get().showSourcesPanel,
        assistantWidth: get().assistantWidth,
        sourcePanelWidth: get().sourcePanelWidth,
        splitActive: get().splitActive,
      };
      const customLayouts = [...get().customLayouts, layout];
      set({ customLayouts, panelPreset: "custom" });
      localStorage.setItem("lsn_custom_layouts", JSON.stringify(customLayouts));
    },

    applyCustomLayout: (id) => {
      const layout = get().customLayouts.find((l) => l.id === id);
      if (!layout) return;
      set({
        panelOrder: layout.panelOrder,
        showAssistantPanel: layout.showAssistantPanel,
        showSourcesPanel: layout.showSourcesPanel,
        assistantWidth: layout.assistantWidth,
        sourcePanelWidth: layout.sourcePanelWidth,
        splitActive: layout.splitActive,
        panelPreset: "custom",
      });
      localStorage.setItem("lsn_panel_order", JSON.stringify(layout.panelOrder));
    },

    deleteCustomLayout: (id) => {
      const customLayouts = get().customLayouts.filter((l) => l.id !== id);
      set({ customLayouts });
      localStorage.setItem("lsn_custom_layouts", JSON.stringify(customLayouts));
    },

    scaffoldWorkspaceTemplate: async (folderPath: string) => {
      try {
        // Create default template directories via Tauri commands
        await invoke("create_local_dir", { parentPath: folderPath, name: "Sources", vaultRoot: folderPath });
        await invoke("create_local_dir", { parentPath: folderPath, name: "Guides", vaultRoot: folderPath });
        await invoke("create_local_dir", { parentPath: folderPath, name: "_attachments", vaultRoot: folderPath });

        // Content for Welcome.md
        const welcomeContent = `# Welcome to Local Study Notebook 🚀

Welcome to your offline-first, local-first study workspace!

## 📁 Default Workspace Structure
- **Sources/**: Store raw study documents, research notes, and web captures.
- **Guides/**: Keep course outlines, exam prep summaries, and structured guides.
- **_attachments/**: Media files, figures, and diagrams.

## ⚡ Quick Guide
- **Smart Markdown Editor**: Raw markdown syntax renders automatically when hovering or editing lines!
- **Split-Screen Workspace**: Open notes side-by-side.
- **Local File Explorer**: Fast workspace tree view with right-click context menu.
- **AI Study Assistant**: Chat with your local study co-pilot.

---
*Start learning!*`;

        // Content for Study_Plan.md
        const planContent = `# 📚 Sample Study Plan

## Topic: Core Objectives
- [ ] Review Chapter 1: Foundations
- [ ] Create summary notes in \`Guides/\`
- [ ] Self-quiz on key concepts

## Notes & Hypotheses
Add your personal study observations here...`;

        // Write template files
        const welcomePath = await invoke<string>("create_local_file", { dirPath: folderPath, name: "Welcome.md", vaultRoot: folderPath });
        await invoke("write_local_file", { path: welcomePath, content: welcomeContent, vaultRoot: folderPath });

        const guidesDir = `${folderPath}/Guides`;
        const planPath = await invoke<string>("create_local_file", { dirPath: guidesDir, name: "Study_Plan.md", vaultRoot: folderPath });
        await invoke("write_local_file", { path: planPath, content: planContent, vaultRoot: folderPath });

        // Open newly created folder and open Welcome.md
        await get().openFolder(folderPath);
        await get().openFile(welcomePath);
      } catch (err) {
        console.error("Failed to scaffold workspace template:", err);
      }
    },
  };
});
