# RSS_Feed Workflow

This workflow retrieves RSS articles (e.g., from TechCrunch, TechRepublic, etc.) and inserts/updates them in a PostgreSQL database. It uses **n8n** triggers for each RSS feed and **Postgres** nodes to store the data.

---

## What It Does
1. **RSS Triggers** poll specified feeds at a set interval (e.g., every minute).
2. **Postgres Nodes** upsert the feed data into tables (`techcrunch_rss`, `techrepublic_rss`, etc.) so you have a live record of the latest articles.

---

## What is the sources

   - techcrunch
   - techrepublic
   - theverge

## How to Use This Workflow

1. **Obtain the JSON File**  
   - You have a file (or snippet) containing the workflow’s JSON definition. (We won’t repeat it here; keep it in a separate `.json` file.)

2. **In n8n**, click **Workflows** → **Import** → **Paste or Upload** the JSON.  
   - **Save** it as `RSS_Feed` (or any name you prefer).

3. **Check PostgreSQL Credentials** in each **Postgres** node:  
   - Ensure the **host**, **port**, **database name**, **username**, and **password** match your Docker environment.

4. **Activate** the workflow.  
   - By default, the workflow will start polling immediately at the specified intervals.
