import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../stores/useStore";

const STEPS = ["welcome", "workspace", "ai-intro"] as const;
type Step = (typeof STEPS)[number];

export default function WelcomeOnboarding() {
  const onboardingComplete = useStore((s) => s.onboardingComplete);
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const openFolder = useStore((s) => s.openFolder);
  const scaffoldWorkspaceTemplate = useStore((s) => s.scaffoldWorkspaceTemplate);
  const projects = useStore((s) => s.projects);
  const openProject = useStore((s) => s.openProject);

  const [step, setStep] = useState<Step>("welcome");

  if (onboardingComplete) return null;

  const handleOpenExisting = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        await openFolder(selected);
        completeOnboarding();
      }
    } catch (err) {
      alert("Failed to open folder: " + err);
    }
  };

  const handleCreateTemplated = async () => {
    try {
      const parent = await open({ directory: true, multiple: false });
      if (!parent || typeof parent !== "string") return;

      const folderName = prompt("Enter a name for the new study workspace:", "My Study Notebook");
      if (!folderName || !folderName.trim()) return;

      const targetPath = `${parent.replace(/\\/g, "/")}/${folderName.trim()}`;
      await useStore.getState().createFolder(parent, folderName.trim());
      await scaffoldWorkspaceTemplate(targetPath);
      completeOnboarding();
    } catch (err) {
      alert("Failed to create workspace: " + err);
    }
  };

  const handleOpenRecent = async (id: string) => {
    await openProject(id);
    completeOnboarding();
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm select-none">
      <div className="flex w-full max-w-lg flex-col rounded-xl border border-border bg-[#18181b] text-text shadow-2xl overflow-hidden">

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 pt-5 pb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full transition-colors ${
                  s === step ? "bg-accent" : i < STEPS.indexOf(step) ? "bg-accent/50" : "bg-border"
                }`}
              />
            </div>
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === "welcome" && (
          <div className="flex flex-col items-center px-8 pt-4 pb-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/20 mb-5">
              <span className="text-3xl font-bold font-mono text-accent">L</span>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Welcome to Local Study Notebook</h1>
            <p className="text-sm text-muted text-center leading-relaxed mb-8 max-w-sm">
              Your offline-first, local-first study workspace. Take notes, manage sources, and chat with an AI assistant — all on your machine.
            </p>
            <button
              onClick={() => setStep("workspace")}
              className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer"
            >
              Get Started
            </button>
            <button
              onClick={handleSkip}
              className="mt-3 text-xs text-muted hover:text-text transition-colors cursor-pointer"
            >
              Skip setup
            </button>
          </div>
        )}

        {/* Step 2: Workspace */}
        {step === "workspace" && (
          <div className="flex flex-col px-8 pt-4 pb-8">
            <h2 className="text-lg font-bold text-white text-center mb-1">Set up your workspace</h2>
            <p className="text-xs text-muted text-center mb-6">Choose a folder to use as your study vault.</p>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                onClick={handleCreateTemplated}
                className="group flex flex-col items-start p-4 rounded-lg border border-accent/40 bg-accent/10 hover:bg-accent/20 hover:border-accent transition-all text-left cursor-pointer"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white mb-2 shadow-xs group-hover:scale-105 transition-transform">
                  <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <h3 className="text-xs font-bold text-white mb-1">Create Templated Project</h3>
                <p className="text-[10px] text-muted leading-relaxed">
                  Scaffolds <code className="text-cyan-400">Sources/</code>, <code className="text-cyan-400">Guides/</code>, and starter files.
                </p>
              </button>

              <button
                onClick={handleOpenExisting}
                className="group flex flex-col items-start p-4 rounded-lg border border-border/80 bg-bg/40 hover:bg-card hover:border-text/40 transition-all text-left cursor-pointer"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/80 bg-bg text-muted group-hover:text-white mb-2 shadow-xs group-hover:scale-105 transition-transform">
                  <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3 className="text-xs font-bold text-white mb-1">Open Existing Workspace</h3>
                <p className="text-[10px] text-muted leading-relaxed">
                  Browse your local drive for an existing study folder.
                </p>
              </button>
            </div>

            {projects.length > 0 && (
              <div className="pt-3 border-t border-border/40">
                <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Recent Workspaces</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin pr-1">
                  {projects.slice(0, 3).map((proj) => (
                    <div
                      key={proj.id}
                      onClick={() => handleOpenRecent(proj.id)}
                      className="flex items-center justify-between p-2 rounded-md border border-border/40 bg-bg/20 hover:bg-card hover:border-accent/40 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <svg className="w-3.5 h-3.5 text-accent shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                        <span className="truncate text-xs font-medium text-text">{proj.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between mt-5">
              <button
                onClick={() => setStep("welcome")}
                className="text-xs text-muted hover:text-text transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={() => setStep("ai-intro")}
                className="text-xs text-muted hover:text-text transition-colors cursor-pointer"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {/* Step 3: AI Intro */}
        {step === "ai-intro" && (
          <div className="flex flex-col items-center px-8 pt-4 pb-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/20 mb-5">
              <svg className="w-7 h-7 stroke-accent" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Meet Your AI Assistant</h2>
            <p className="text-sm text-muted text-center leading-relaxed mb-5 max-w-sm">
              Your local study co-pilot. Ask for study tips, note summaries, or markdown help — powered by your own AI provider.
            </p>

            <div className="w-full rounded-lg border border-border/60 bg-bg/40 p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-white">
                  <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-white mb-1">Where to find it</p>
                  <p className="text-[11px] text-muted leading-relaxed">
                    The AI Assistant lives in the <span className="text-accent font-medium">sparkle icon</span> on the left sidebar. Toggle it anytime to chat.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={completeOnboarding}
              className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer"
            >
              Start Exploring
            </button>
            <button
              onClick={completeOnboarding}
              className="mt-3 text-xs text-muted hover:text-text transition-colors cursor-pointer"
            >
              Set up AI later in Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
