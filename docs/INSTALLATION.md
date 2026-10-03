# Installing Facsimile

Facsimile includes local installers for Windows, macOS, and Linux.

The installer creates an isolated Python environment, installs the backend,
installs the React dependencies, builds the frontend, and creates a launcher.

## Requirements

Install these before running the installer:

- Python 3.11 or newer
- Node.js 20 or newer
- npm (included with Node.js)

No brokerage credentials are required.

## Windows

From the Facsimile repository folder, double-click:

```text
install.bat
```

or run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

The Windows installer creates:

- `.venv\` for the isolated Python environment
- `frontend\dist\` for the built UI
- `Facsimile.cmd` as the launcher
- a desktop shortcut named **Facsimile** when Windows permits it

Launch later with:

```text
Facsimile.cmd
```

## macOS / Linux

Run:

```bash
chmod +x install.sh
./install.sh
```

The installer creates:

- `.venv/`
- `frontend/dist/`
- `facsimile.sh`

Launch with:

```bash
./facsimile.sh
```

## Application address

The launcher starts Facsimile locally at:

```text
http://127.0.0.1:8765
```

The default launcher opens this address automatically in the system browser.

To prevent automatic browser launch:

```bash
facsimile --no-browser
```

## Reinstall / update

The installers are safe to run again after pulling newer code. They reuse the
existing virtual environment, reinstall the editable backend package, refresh
frontend dependencies, and rebuild the frontend.

## Development mode

The installer is for running the assembled workstation. Development can still
use separate backend/frontend servers:

```bash
python -m pip install -e ".[dev]"
uvicorn facsimile.api:app --reload
```

and in another terminal:

```bash
cd frontend
npm install
npm run dev
```
