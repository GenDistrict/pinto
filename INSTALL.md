# Install PINTO with a coding agent

[English](INSTALL.md) · [Español](INSTALL.es.md) · [한국어](INSTALL.ko.md)

When the user gives you the repository URL and asks to install, complete download, setup, and launch. Read `AGENTS.md` and use the user's preferred language in your response.

## Download

Repository: https://github.com/GenDistrict/pinto — branch: `main`.

Use `git clone https://github.com/GenDistrict/pinto.git` if Git is available. Otherwise download `https://github.com/GenDistrict/pinto/archive/refs/heads/main.zip` and extract `pinto-main` into a user-writable app folder. Git installation is not required. Check for `package.json`, `package-lock.json`, `install.ps1`, and `install.sh`.

If PINTO already exists, preserve user code and data. Repair it or follow [maintenance](docs/MAINTENANCE.md); do not overwrite it with a fresh clone.

## Install and launch

Read the script first and follow the host's execution/permission policies. From the source folder:

```powershell
# Windows: choose en, es, or ko
./install.ps1 -Language en
```

```sh
# macOS
sh ./install.sh --language en
```

Language is optional. The app uses the saved choice or system language (English fallback). The bottom selector saves future preferences. `--language` overrides the language for that launch. User notes are not translated.

`-Workspace '<existing folder>'` / `--workspace '<existing folder>'` optionally selects image storage. Otherwise PINTO's user data folder is used. This is not an AI-service connection.

The scripts use an existing compatible Node.js or download an official, checksum-verified runtime into `.pinto/runtime/`. They install locked dependencies, prepare Electron, build, and run `setup.mjs`. Do not weaken OS security or modify global AI settings. Windows creates `PINTO.lnk`; macOS creates `~/Applications/PINTO.app` and `PINTO.command`. Users do not supply signing certificates.

`-NoShortcut` / `--no-shortcut` skips the user shortcut. `-NoLaunch` / `--no-launch` skips launch. Never claim to have opened a window if launch was skipped.

## Verify and report

Read `.pinto/install-result.json`. A verified launch has `status: "ready"` and `windowReady: true`. Check `sourceRoot`, `launcher`, `sourceEditable`, `locale`, and `modificationGuide`. If a private runtime was installed, use its `nodePath`, for example `<nodePath> scripts/task.mjs build`.

In this same AI conversation report the verified launch result, actual source location, launcher/command, and that the AI can customize the local source. Give examples such as changing font sizes, shortcuts, and copied instruction formatting. Do not claim more than was verified.

## Failure and recovery

Installers return nonzero on failure. Diagnose the stage instead of reporting success. Check `.pinto/app.log` and `npm run doctor -- --json`, using the private runtime when needed. Re-running setup preserves the baseline and user code. Images/notes remain in user data or the chosen workspace's `.image-notes/` folder.
