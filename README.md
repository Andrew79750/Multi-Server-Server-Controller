# ESS Server Controller

**ESS Server Controller** is a Windows desktop dashboard for managing VPS-hosted game servers, websites, Git repositories, logs, and release updates from one clean control panel.

It is built for operators who need a fast, practical way to keep multiple ESS services organized without jumping between folders, terminals, Git tools, and browser tabs.

## What It Does

ESS Server Controller brings the most common server-management actions into one app:

- Monitor configured services from a central dashboard
- Start, stop, and restart server profiles
- Track uptime, process IDs, status, and recent activity
- Manage website/service profiles alongside game servers
- Watch configured Git repositories for updates
- Pull repository updates manually or automatically
- View centralized logs for servers, websites, GitHub checks, and app events
- Receive app update notifications from GitHub Releases
- Customize server profiles, launch commands, paths, appearance, and update behavior

## Core Features

### Unified Dashboard

The dashboard gives you a quick overview of your VPS environment at a glance. It shows server counts, running services, GitHub update status, and recent events so you can immediately see what needs attention.

### Server Management

Create and manage server profiles for services such as:

- FiveM servers
- ArmA 3 servers
- Mission/server folders
- Custom Windows services
- Any configured launch command

Each profile can be started, stopped, restarted, opened in File Explorer, and monitored from inside the app.

### Website Management

Website profiles are handled in the same interface as server profiles, making it easy to keep web projects and server-side services visible in the same operational view.

### GitHub Repository Updater

ESS Server Controller can track multiple local Git repositories and compare them with their upstream branches.

Supported GitHub workflow features include:

- Add local repositories to the updater
- Enable or disable repositories individually
- Run manual update checks
- See which repositories are up to date
- Detect available updates
- Pull updates directly from the app
- Optionally pull automatically when updates are detected
- Use cooldowns and per-repository locks to avoid noisy or overlapping Git activity

This is useful for server files, mission folders, website code, and other repositories that need to stay current on a VPS.

### Centralized Logs

The Logs page collects important events from across the controller:

- Server start and stop events
- Server errors and warnings
- Website events
- GitHub updater activity
- App update checks
- General app information

Logs can be filtered by category or severity, cleared when needed, and exported for review.

### App Update Notifications

The controller can check GitHub Releases for newer versions and notify you when an update is available.

The update panel shows:

- Current version
- Latest version
- Release title
- Publish date
- Release notes
- Download link
- Skip/remind-later options

### Configurable Profiles

Server profiles are editable from the Settings page. You can adjust names, root folders, and launch commands without digging through app files.

Missing or incomplete commands are handled gracefully, so a profile can exist as a tracked folder even before it is fully configured to launch.

### Windows Convenience Options

ESS Server Controller includes small quality-of-life tools for Windows VPS use:

- Start with Windows toggle
- Create desktop shortcut
- Open app folder
- Open external files folder
- Dark and light theme support
- Configurable notification timeout

## Designed For

ESS Server Controller is especially useful for:

- VPS administrators
- Game server owners
- FiveM and ArmA 3 server operators
- Small community server teams
- Developers managing multiple live service folders
- Anyone who wants a cleaner control center for server files, Git updates, and operational logs

## Default Managed Areas

The app is designed around common ESS server environments, including:

- FiveM server folders
- ArmA 3 server folders
- Altis Life mission/server files
- CQC mission files
- Controller website files
- Related Git repositories

These profiles can be adjusted to fit your actual server layout.

## Why Use It

Running several services on a Windows VPS can get messy quickly. ESS Server Controller keeps the daily tasks in one place: check what is running, open the right folder, pull the latest code, review logs, and launch or restart services when needed.

It is not trying to be a giant enterprise panel. It is a focused desktop command center for the server workflows ESS uses every day.
