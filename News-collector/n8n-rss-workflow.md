RSS Feed Workflow
This project automatically fetches RSS feed items (for example, from TechCrunch and TechRepublic) using n8n and stores them in PostgreSQL (claire_db). You can easily expand or modify the workflow to handle additional RSS feeds.

Table of Contents
Overview
Prerequisites
Architecture
Setup and Usage
1. Docker Compose
2. Database Tables
3. pgAdmin
4. n8n Workflow
Example n8n Workflow
Troubleshooting
License
Overview
Goal: Automate retrieval of RSS feed items (e.g., TechCrunch or TechRepublic) and store them in a PostgreSQL database.
Tools:
Postgres for data storage
n8n for orchestration (fetching RSS feeds, inserting data)
pgAdmin for easy database administration
This setup allows you to seamlessly pull in new articles or blog entries and store them for further processing, analytics, or archiving.

Prerequisites
Docker and Docker Compose installed locally.
Basic familiarity with n8n, PostgreSQL, and pgAdmin.
Architecture
scss
Copier
 ┌───────────────┐    ┌────────────┐
 │    n8n        │ →  │ PostgreSQL │
 │ (RSS fetching)│    │ (claire_db)│
 └───────────────┘    └────────────┘
           ↓
       (pgAdmin)
n8n periodically polls the RSS feeds.
n8n inserts new items into PostgreSQL.
pgAdmin provides a GUI for inspecting and managing your database.
Setup and Usage
1. Docker Compose
Your docker-compose.yml sets up:

Postgres (claire_postgres container)
pgAdmin (exposed on port 5050)
n8n (exposed on port 5678)
To start all services, run:

bash
Copier
docker compose up -d
Then visit:

pgAdmin at http://localhost:5050
n8n at http://localhost:5678 (login with the credentials specified in your environment variables)
2. Database Tables
In pgAdmin, create (or confirm) tables for each RSS feed. For example:

TechCrunch table (techcrunch_rss):

sql
Copier
CREATE TABLE IF NOT EXISTS techcrunch_rss (
  id SERIAL PRIMARY KEY,
  creator TEXT,
  title TEXT,
  link TEXT UNIQUE,
  pub_date TIMESTAMP,
  dc_creator TEXT,
  content TEXT,
  content_snippet TEXT,
  guid TEXT,
  categories TEXT[],
  iso_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

3. pgAdmin
Open http://localhost:5050, log in with your admin email and password.
Connect to claire_db to view or edit these tables.
4. n8n Workflow
Within n8n (http://localhost:5678), create a new workflow with these main steps:

Cron (or Schedule) Trigger – to run every X minutes/hours.
RSS Feed Read – specify the RSS feed URL (e.g., TechCrunch or TechRepublic).
Postgres – Insert or Upsert data into the corresponding table (techcrunch_rss or techrepublic_rss).
You can set up multiple workflows if you want to handle multiple feeds separately (e.g., one for TechCrunch, one for TechRepublic).

