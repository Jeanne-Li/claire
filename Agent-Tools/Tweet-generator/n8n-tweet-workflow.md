# TweetGenerator Workflow

This workflow listens for new or updated records in your **PostgreSQL** table (e.g., `techcrunch`), uses **OpenAI** to generate a tweet, and then saves that tweet back into another (or the same) table.

---

## What It Does
1. **Postgres Trigger** node: Watches for inserted or updated rows in your chosen table (`techcrunch`).
2. **OpenAI** node: Takes the row’s data and generates a catchy tweet.
3. **Postgres Upsert** node: Stores or updates the generated tweet in the `techcrunch_rss` table.

---

## How to Use This Workflow

1. **Obtain the JSON File**  
   - You have a file (or snippet) with the `TweetGenerator` workflow’s definition (do not repeat it in the README—keep it separately).

2. **In n8n**, click **Workflows → Import → Paste/Upload** the JSON.  
   - **Save** it under any name (e.g., `TweetGenerator`).

3. **Check Credentials**  
   - **Postgres** nodes must match your Docker or local database (host, port, DB name, user, password).  
   - **OpenAI** node must have a valid API key or credentials.

4. **Activate** the workflow.  
   - When new rows arrive in the `techcrunch` table, the workflow generates and upserts tweets automatically.

---

## Docker Environment Tips

- Ensure your `docker-compose.yml` is set up with:
  - **Postgres** container (exposing the correct port).
  - **n8n** container (with environment variables pointing to Postgres).
- Confirm that your **Postgres** triggers can fire inside Docker (the table must exist in the same DB referenced by n8n).

---

That’s it! You now have a streamlined way to generate tweets from incoming data using **OpenAI**, all managed through n8n. Feel free to extend this workflow for other use cases—like sending the tweet directly to Twitter or applying further text transformations. 
