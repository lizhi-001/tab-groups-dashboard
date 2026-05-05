# Privacy Policy — Tab Groups Dashboard

**Last updated:** 2026-05-05

---

## Overview

Tab Groups Dashboard is designed to work entirely within your browser. It does **not** require an account, does **not** sell data, does **not** use remote code, and does **not** transmit your browsing information to any external server.

---

## What Data We Access

| Data | Why We Access It |
|------|-----------------|
| Open tab metadata (title, URL, favicon) | Display tabs organized by group on the dashboard |
| Chrome tab group info (name, color) | Show group labels and their associated colors |
| Window information | Organize tabs by the window they belong to |
| User-created favorites | Display your pinned favorite sites |

---

## Permissions Explained

| Permission | Purpose |
|------------|---------|
| `tabs` | Read open tabs to display them organized on the dashboard |
| `tabGroups` | Read Chrome native tab group names, colors, and collapse state |
| `storage` | Persist your favorites and preferences locally |
| `activeTab` | Navigate to a specific tab when you click on it |

---

## Data Storage & Retention

- All data is stored locally via Chrome's `chrome.storage.local` API
- Data persists until you remove it manually, clear extension data, or uninstall the extension
- **No data is ever transmitted externally**
- No cookies, no analytics, no tracking

---

## Data Sharing

We do **not** collect, transmit, sell, or share any user data with third parties.

The only network requests made by this extension are to load Google Fonts (for typography) and favicon images from Google's favicon service — both of which are standard browser requests that contain no personal information.

---

## Third-Party Services

| Service | Purpose | Data Sent |
|---------|---------|-----------|
| Google Fonts | Typography (Inter font) | Standard HTTP request |
| Google Favicon API | Display website icons | Domain name only |

---

## User Controls

You can:
- Remove any favorite at any time
- Clear all extension data via Chrome's extension management page
- Uninstall the extension to remove all stored data
- Use Chrome's built-in "Clear browsing data" to remove extension storage

---

## Changes to This Policy

If we update this privacy policy, the "Last updated" date at the top will be changed. Significant changes will be noted in the extension's changelog.

---

## Contact

For questions or concerns about this privacy policy, please open an issue on our [GitHub repository](https://github.com/your-username/tab-groups-dashboard).
