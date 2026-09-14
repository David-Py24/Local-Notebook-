import { invoke } from "@tauri-apps/api/core";

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  folders: string[];
  files: { path: string; name: string; content: string }[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "standard-study",
    name: "Standard Study Vault",
    description: "Ideal for course work, exam prep, and structured notes with Sources and Guides.",
    folders: ["Sources", "Guides", "_attachments"],
    files: [
      {
        path: "",
        name: "Welcome.md",
        content: `# Welcome to Local Study Notebook 🚀

Welcome to your offline-first, local-first study workspace!

## 📁 Workspace Structure
- **Sources/**: Store raw study documents, research notes, and web captures.
- **Guides/**: Keep course outlines, exam prep summaries, and structured guides.
- **_attachments/**: Media files, figures, and diagrams.

## ⚡ Quick Features
- **Context-Aware Editor**: Markdown syntax hides automatically when moving away from active words!
- **Split-Screen Workspace**: Open notes side-by-side.
- **AI Study Co-pilot**: Chat with your local study assistant or OpenCode agent.

---
*Happy Studying!*`,
      },
      {
        path: "Guides",
        name: "Study_Plan.md",
        content: `# 📚 Sample Study Plan

## Core Objectives
- [ ] Review Chapter 1: Foundations
- [ ] Create summary notes in \`Guides/\`
- [ ] Self-quiz on key concepts

## Key Observations
Add your personal study observations here...`,
      },
    ],
  },
  {
    id: "research-literature",
    name: "Research & Literature Vault",
    description: "Designed for academic research, paper notes, and atomic permanent notes (Zettelkasten style).",
    folders: ["Papers", "Literature_Notes", "Permanent_Notes", "_attachments"],
    files: [
      {
        path: "",
        name: "Welcome.md",
        content: `# 🔬 Research & Literature Vault

Organize your paper summaries, citations, and syntheses.

## 📁 Folders
- **Papers/**: Raw research paper notes and PDFs.
- **Literature_Notes/**: Summaries and direct extracts from sources.
- **Permanent_Notes/**: Atomic, synthesized ideas connected via wiki-links.
- **_attachments/**: Diagrams and figures.`,
      },
      {
        path: "Literature_Notes",
        name: "Reading_List.md",
        content: `# 📖 Literature Reading List

## High Priority
- [ ] Paper 1: Title & Authors
- [ ] Paper 2: Title & Authors

## Key Takeaways
Record major insights here...`,
      },
    ],
  },
  {
    id: "minimal-notebook",
    name: "Minimal Notebook",
    description: "Clean, simple workspace for daily note-taking and quick drafts.",
    folders: ["Notes", "_attachments"],
    files: [
      {
        path: "",
        name: "Welcome.md",
        content: `# 📝 Minimal Notebook

A distraction-free space for your thoughts.

- Create notes inside \`Notes/\`
- Use \`[[WikiLinks]]\` to connect related concepts.`,
      },
    ],
  },
];

export async function applyProjectTemplate(folderPath: string, templateId: string = "standard-study"): Promise<void> {
  const template = PROJECT_TEMPLATES.find((t) => t.id === templateId) || PROJECT_TEMPLATES[0];

  // 1. Create folders
  for (const folder of template.folders) {
    try {
      await invoke("create_local_dir", { parentPath: folderPath, name: folder, vaultRoot: folderPath });
    } catch (err) {
      console.warn(`Folder creation warning (${folder}):`, err);
    }
  }

  // 2. Create files
  for (const file of template.files) {
    try {
      const targetDir = file.path ? `${folderPath}/${file.path}` : folderPath;
      const filePos = await invoke<string>("create_local_file", { dirPath: targetDir, name: file.name, vaultRoot: folderPath });
      await invoke("write_local_file", { path: filePos, content: file.content, vaultRoot: folderPath });
    } catch (err) {
      console.warn(`File creation warning (${file.name}):`, err);
    }
  }
}
