---
allowed-tools: Read, Edit, Glob, Grep, WebFetch, Bash(git *), Bash(gh *), AskUserQuestion
description: Add a new "In the Media" mention to InferenceX
---

Add a new media mention to the InferenceX media page.

## Step 1: Gather details

The user will provide a URL. If not provided via $ARGUMENTS, ask for it.

## Step 2: Extract article info

- Fetch the URL with WebFetch to get the **title**, **organization/publisher**, **date**, and **type** (article or video)
- If WebFetch fails/times out, infer from the URL slug and ask the user to confirm
- YouTube/video URLs → type `video`, all others → type `article`

## Step 3: Confirm with user

Show the extracted details and ask the user to confirm or correct:

- **Title**: extracted title
- **Organization**: publisher name
- **Date**: publication date (YYYY-MM-DD)
- **Type**: article or video

## Step 4: Add to media-data.ts

- Read `packages/app/src/components/media/media-data.ts`
- Insert the new entry in **date-sorted order** (newest first)
- Find the right position by comparing dates

## Step 5: Create branch and PR

- If not already on a feature branch, create one from `origin/master`: `feat/add-{org-slug}-media-mention`
- Commit with message: `feat: add {Org} {title snippet} media mention`
- Push and create a PR
