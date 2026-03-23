---
allowed-tools: Read, Edit, Write, Glob, Grep, Bash(cp *), Bash(curl *), Bash(ls *), Bash(file *), Bash(mv *), AskUserQuestion
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

## Step 2: Add the logo (if provided)

- Check existing logos at `packages/app/public/logos/` for naming conventions
- If a file path is provided, copy it to `packages/app/public/logos/{org-slug}.{ext}` (lowercase, hyphenated)
- If a URL is provided, download it to `packages/app/public/logos/{org-slug}.{ext}`
- Prefer SVG format. If the source is PNG/JPG, use that extension
- Verify the file was saved correctly

## Step 3: Add the quote to quotes-data.ts

- Read `packages/app/src/components/quotes/quotes-data.ts`
- Append the new quote entry to the `QUOTES` array (before the closing `];`)
- Include `logo: '{filename}'` if a logo was added
- Include `link: '{url}'` if a link was provided
- Use `\u2122` for the trademark symbol (™) and `\u2014` for em dashes if needed in the quote text

## Step 4: Ask about the quote carousel

Ask the user:

> **Should this quote appear in the homepage quote carousel?**
> (Currently the carousel uses a whitelist — only explicitly listed orgs are shown)

- If **yes**: add the org name to the whitelist array in `packages/app/src/components/page-content.tsx` (search for the `QUOTES.filter` call with `.includes(q.org)`)
- If **no**: do nothing — the quote will only appear on the `/quotes` supporters page

## Step 5: Verify

- Confirm the quote was added to `quotes-data.ts`
- If carousel was updated, confirm the org is in the whitelist
- If a logo was added, confirm the file exists in `packages/app/public/logos/`
