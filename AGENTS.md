# AGENTS.md

This file provides guidance to the AI agent when working with code in this repository.

## Project

Single-file Tampermonkey userscript (`steam-market-listings-group.user.js`) that runs on Steam Community market listing pages. It extracts sell order data from `unsafeWindow.SSR.loaderData`, groups listings by date and buyer price, and replaces the default listing UI with a summary table.

## Key Technical Details

- Uses `unsafeWindow` to access Steam's SSR data — do not replace with `window`.
- Runs at `document-idle`; the page's React/SSR data must already be populated.
- `@match` targets `*://steamcommunity.com/market/listings/*` only.
- All UI is Chinese (zh-CN). Keep UI strings in Chinese.
- Styling uses `GM_addStyle` with inline CSS matching Steam's dark theme (`#1b2838` palette, `#66c0f4` accent).
- The script locates the listing container by walking the DOM for `¥` price text nodes and finding their common ancestor — this is fragile and depends on Steam's current page structure.

## Conventions

- Single IIFE with `'use strict'`, no build step, no dependencies.
- All HTML is built via template literals with `escapeHtml()` for XSS safety — always use it for user/server data.
- Console logs use `[SMG]` prefix for debugging.
