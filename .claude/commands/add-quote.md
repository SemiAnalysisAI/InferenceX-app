---
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(cp *), Bash(curl *), Bash(ls *), Bash(file *), Bash(mv *), Bash(ffmpeg *), Bash(rm packages/app/public/logos/*), AskUserQuestion, WebSearch, WebFetch
description: Add a new supporter quote to InferenceX
---

Add a new supporter quote to the InferenceX quotes page.

## Step 1: Gather quote details

Ask the user for the following (if not already provided via $ARGUMENTS):

1. **Quote text** — the full quote
2. **Name** — person's name
3. **Title** — person's role/title
4. **Organization** — company/org name
5. **Logo** — path to a logo file, a URL, or skip (optional)
6. **Link** — optional URL to link the quote to

## Step 2: Find a link (if not provided)

If the user did not provide a link, search for one:

- Search the web for the person's name + organization (e.g. "Mingyi Lu SGLang")
- Look for LinkedIn profiles, personal websites, or official org pages
- Present 2-3 candidate URLs to the user and let them pick one (or skip)

## Step 3: Add the logo

### If a logo was provided:

- If a file path, copy it to `packages/app/public/logos/{org-slug}.{ext}` (lowercase, hyphenated)
- If a URL, download it to `packages/app/public/logos/{org-slug}.{ext}`

### If no logo was provided, search for one:

1. **Prefer SVG**: Search for the org's press kit / brand assets page (e.g. "{org} press kit", "{org} brand assets", "{org} logo svg"). Download the SVG if found.
2. **Fallback to PNG**: If no SVG is available, search for a high-quality PNG logo and download it.
3. If nothing usable is found, skip the logo.

### Image format rules:

- **SVG** — use as-is, no conversion needed. Save as `{org-slug}.svg`
- **PNG/JPG** — convert to WebP using ffmpeg:
  ```
  ffmpeg -i input.png -vf "scale=160:-1" -quality 80 packages/app/public/logos/{org-slug}.webp -y
  ```
  This scales to 160px wide (2x retina for the 80px display size) and compresses. Delete the original PNG/JPG after conversion.
- Check existing logos at `packages/app/public/logos/` for naming conventions
- Verify the file was saved correctly

## Step 4: Add the quote to quotes-data.ts

- Read `packages/app/src/components/quotes/quotes-data.ts`
- Append the new quote entry to the `QUOTES` array (before the closing `];`)
- Include `logo: '{filename}'` if a logo was added
- Include `link: '{url}'` if a link was provided
- Use `\u2122` for the trademark symbol (™) and `\u2014` for em dashes if needed in the quote text

## Step 5: Ask about the quote carousel

Ask the user:

> **Should this quote appear in the homepage quote carousel?**
> (Currently the carousel uses a whitelist — only explicitly listed orgs are shown)

- If **yes**: add the org name to the whitelist array in `packages/app/src/components/page-content.tsx` (search for the `QUOTES.filter` call with `.includes(q.org)`)
- If **no**: do nothing — the quote will only appear on the `/quotes` supporters page

## Step 6: Verify

- Confirm the quote was added to `quotes-data.ts`
- If carousel was updated, confirm the org is in the whitelist
- If a logo was added, confirm the file exists in `packages/app/public/logos/`
