# Customization, updates, and recovery

[English](MAINTENANCE.md) · [Español](MAINTENANCE.es.md) · [한국어](MAINTENANCE.ko.md)

The first installation records `.pinto/baseline.json`. Reinstalling does not overwrite that baseline. Give your agent the app's customization guide when starting a new session.

```sh
npm run changes
npm run backup
```

These show changes against the baseline and back up the source to `.pinto/backups/<id>/`. User images and notes stay in their original locations and are not part of a source backup.

Download the new source into a separate folder, then compare it from the current installation:

```sh
npm run update:plan -- --from '/path/to/new-source'
```

Local edits are preserved. Conflicting changes to the same file are not automatically applied; prepare a merge that preserves the user's work. If there are no conflicts, close PINTO and run:

```sh
npm run update:apply -- --from '/path/to/new-source'
node scripts/setup.mjs --no-shortcut --language en
```

The updater installs, checks, tests, and builds a staged candidate before applying it. It checks for source changes during verification, makes a backup, and rolls back if replacement fails. Omit `--no-shortcut` when launchers need updating.

To restore, close the app:

```sh
npm run restore -- --backup '<id>'
```

Ordinary source backups exclude dependencies/build output; reinstall and rebuild as needed. Automatic update backups may also restore the runtime. The result includes `safetyBackup` for the state immediately before restoration.

Data lives in `%APPDATA%/PINTO/` on Windows or `~/Library/Application Support/PINTO/` on macOS. If a workspace was selected, images and annotations live under `.image-notes/<id>/` there. The language preference is in `language.json` inside PINTO's user data directory.
