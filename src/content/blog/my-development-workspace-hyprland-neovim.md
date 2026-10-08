---
title: "My Development Workspace: Arch Linux, Hyprland, and a Tailored Neovim Stack"
description: "A breakdown of my daily driver workspace — running Omarchy Linux on Hyprland, polyglot version management with mise, and an optimized LazyVim setup for React, TypeScript, Tailwind, and PHP."
pubDate: 2026-10-08
featured: true
tags:
  - workspace
  - neovim
  - linux
  - hyprland
  - developer tools
---

A fast, distraction-free environment is the foundation of high-leverage engineering. Over the years, my setup has converged on a simple principle: **zero cognitive friction, keyboard-driven navigation, and sub-second feedback loops**.

Here is an architectural tour of my daily driver workspace — from the operating system and tiling window manager to my tailored Neovim configuration.

---

## 1. The Foundation: Omarchy Linux & Hyprland

I run **Omarchy Linux**, a streamlined Arch Linux-based distribution that provides rolling-release packages with zero unnecessary background services.

### Why Hyprland?
For the desktop session, I rely on **[Hyprland](https://hyprland.org/)**, a dynamic tiling Wayland compositor.
- **Fluid Workspaces**: Instant switching between workspaces without animation stutter.
- **Tiling Efficiency**: Code on the left, browser and terminal splits on the right, arranged automatically without manual window dragging.
- **Clean Aesthetic**: Native Wayland tearing support for low-latency input, subtle blur/borders, and minimal visual noise.

Everything runs on Wayland with native clipboard integration via `wl-clipboard` and OSC 52 fallbacks for remote sessions.

---

## 2. Polyglot Runtime Management with `mise`

Instead of managing separate version tools like `nvm`, `pyenv`, `gvm`, or `sdkman`, I manage all developer runtimes using **[mise](https://mise.jdx.dev/)**.

With `mise`, every project defines its exact runtimes in a clean `.mise.toml` or `mise.toml`:
- **Node.js**: LTS and current versions for web and tooling.
- **Go**: Fast CLI scripting and backend testing tools.
- **Java**: Temurin JDK for enterprise test suites and automation.
- **Python & uv**: Lightning-fast package management and scripting.

`mise` executes with virtually zero shell startup latency compared to legacy shims.

---

## 3. The Core Editor: Neovim Built on LazyVim

My primary editor is **Neovim (v0.12+)**, configured through **[LazyVim](https://lazyvim.org/)** and tracked in my public repository: [**`halowahyudi/nvim-config`**](https://github.com/halowahyudi/nvim-config).

### Interface & Philosophy
- **Colorscheme**: Minimalist themes with transparent background integration that blend directly into the terminal aesthetic.
- **Docked File Explorer**: Neo-tree docked cleanly on the right side rather than the left, preserving standard left-to-right eye focus on code buffers.
- **Floating Terminal**: Integrated with `nvzone/floaterm` via `<C-p>` for instant command execution without disrupting window splits.
- **Clean UI**: Bufferline tab bar disabled in favor of buffer pickers and quick fuzzy jumping.

---

## 4. Specialized Language Tooling

My daily engineering stack spans full-stack web applications, APIs, and security tooling. The Neovim configuration is tuned for four core domains:

### Tailwind CSS IntelliSense & Visual Feedback
- **LSP**: `tailwindcss-language-server` via Mason for auto-completion and linting.
- **Live Color Highlights**: Powered by `mini.hipatterns`, rendering real-time background color swatches on Tailwind color classes (e.g., `bg-blue-500`, `text-emerald-400`).
- **Modern React Class Matching**: Configured with custom regex patterns for utility functions like `cn()`, `cva()`, and `cx()` commonly used in modern component systems (such as shadcn/ui).
- **Template Support**: Seamlessly enabled across React (`.jsx`, `.tsx`), HTML, and PHP / Blade templates.

### ReactJS & TypeScript
- **TypeScript LSP**: High-performance type inference and refactoring via `vtsls`.
- **Auto Closing & Renaming Tags**: `nvim-ts-autotag` automatically pairs and updates HTML/JSX tag closures in real time.
- **Emmet Expansion**: `emmet-language-server` for expanding complex tag hierarchies in seconds.
- **Auto-Formatting & Linting**: Format-on-save powered by `conform.nvim` with Prettier, paired with `vscode-eslint-language-server`.

### PHP Intelligence
- **Intelephense LSP**: Fast indexing, parameter hints, symbol lookups, and jump-to-definition.
- **Syntax Parsing**: Treesitter parsers for PHP and HTML AST highlighting.
- **Code Standards**: Automatic formatting and diagnostics via `php-cs-fixer` and `phpcs`.

---

## 5. Reproducibility & Open Source

All configuration files are version-controlled and public:

- **Neovim Config**: [github.com/halowahyudi/nvim-config](https://github.com/halowahyudi/nvim-config)

To replicate the editor setup anywhere:

```bash
# Clone config
git clone https://github.com/halowahyudi/nvim-config.git ~/.config/nvim

# Launch Neovim (plugins and LSPs sync automatically)
nvim
```

Keeping the workspace lightweight and modular keeps compile times low, memory footprints negligible, and focus where it matters: building and securing software.
