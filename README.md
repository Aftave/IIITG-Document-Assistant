# IIITG Document Assistant

A role-based RAG (Retrieval-Augmented Generation) chatbot for IIIT Guwahati. Admins upload official institute PDFs (academic rules, circulars, policies and so on). Students, faculty and staff ask questions and get answers with page citations, restricted to the documents their role is allowed to see.

---

## Features

- **Role-based access:** student, faculty, staff and admin. Admin-only upload and delete.
- **Institute-only sign-up:** Clerk restricted to `iiitg.ac.in` (allowlist in the Clerk dashboard).
- **Subject-wise chat:** ask questions across all documents of a subject.
- **Hybrid search:** dense embeddings plus BM25 sparse search, fused with RRF.
- **Cross-encoder re-ranking** (`BAAI/bge-reranker-v2-m3`) with threshold gating, so unrelated questions return "Not found".
- **Open-source LLM:** Qwen2.5 from Hugging Face, no paid API.
- **Persistent chat history** per user and subject.
- **Async ingestion:** BullMQ queue and worker process PDFs in the background.
- **Modern black-and-white UI** with drag-and-drop upload.

---

## Architecture

```
Browser (Next.js + Clerk)
        │
        ▼
Express API ──► MongoDB (users, documents, messages)
   │   │
   │   └──► AWS S3 (PDF files)
   │
   ▼
BullMQ queue (Valkey)
   │
   ▼
Node Worker ──► RAG service (FastAPI on Colab via ngrok) ──► Qdrant Cloud
                         │
                         └── Qwen LLM + embeddings + re-ranker
```

### Upload flow
1. Admin uploads a PDF (max 50 MB) with category, subject and allowed roles.
2. API stores it in S3 (`institute-docs/<category>/<uuid>-<filename>`) and creates a Mongo record (`processing`).
3. API enqueues a `process-pdf` job with a presigned URL.
4. Worker calls the RAG service `/ingest`, which chunks, embeds and stores vectors in Qdrant.
5. Worker calls the API internal route to set the status to `ready` or `failed`.

### Query flow
1. User asks a question in a subject chat.
2. API loads the last 6 messages and calls the RAG service.
3. RAG service rewrites the query (if there is history), then runs dense and sparse search filtered by role and subject.
4. RRF fusion, then cross-encoder re-ranking, then threshold check, then the top 5 chunks.
5. Qwen generates the answer with `(Page N)` citations.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (TypeScript, Tailwind), Clerk |
| API | Node.js, Express, Mongoose |
| Queue | BullMQ on Valkey (Redis-compatible) |
| Worker | Node.js |
| RAG service | Python, FastAPI, sentence-transformers, transformers |
| Vector DB | Qdrant Cloud (dense + BM25 sparse) |
| LLM | Qwen2.5 Instruct (Hugging Face) |
| Database | MongoDB |
| Storage | AWS S3 |
| Auth | Clerk (webhooks via Svix) |

---

## Project Structure

```
IIITG-Document-Assistant/
├── docker-compose.yml
├── .gitignore
├── README.md
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── library/
│   │   └── admin/upload/
│   ├── components/        (Navbar, BackButton, ChatWindow)
│   └── .env.example
└── backend/
    ├── api/
    │   ├── src/           (config, models, routes, middleware)
    │   └── .env.example
    ├── worker/
    │   └── .env.example
    └── rag-service/
        ├── main.py
        ├── requirements.txt
        └── .env.example
```

---

## Prerequisites

- Node.js 20+
- Docker Desktop (for MongoDB and Valkey)
- A Clerk account
- An AWS account with an S3 bucket
- A Qdrant Cloud cluster
- A Google account (Colab, GPU runtime) and an ngrok account
- Git

---

## Setup

### 1. Clone

```bash
git clone https://github.com/Aftave/IIITG-Document-Assistant.git
cd IIITG-Document-Assistant
```

### 2. Start local infrastructure

```bash
docker compose up -d
```

This starts MongoDB and Valkey (and optionally a local Qdrant).

### 3. AWS S3

Create a bucket and an IAM user with read, write and delete access to it. Set `AWS_REGION` to the **same region as the bucket**, otherwise you get `PermanentRedirect`.

### 4. Clerk

1. Create a Clerk application and copy the publishable and secret keys.
2. Restrict sign-up to `iiitg.ac.in` (Configure → Restrictions → Allowlist).
3. Add a webhook endpoint `https://<public-api-url>/api/webhooks/clerk` for `user.created`, `user.updated` and `user.deleted`, and copy the signing secret.

Clerk cannot reach `localhost`. Expose port 5000 with a tunnel (VS Code port forwarding, ngrok, Pinggy) and update the webhook URL whenever it changes.

### 5. Environment variables

Copy each example file and fill in your values:

```powershell
Copy-Item backend/api/.env.example backend/api/.env
Copy-Item backend/worker/.env.example backend/worker/.env
Copy-Item frontend/.env.example frontend/.env.local
```

**`backend/api/.env`**
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/iiitg-docs
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:3000
RAG_SERVICE_URL=https://your-subdomain.ngrok-free.dev
INTERNAL_API_TOKEN=change-me-to-a-long-random-string
CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxxxxx
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_S3_BUCKET=your-bucket-name
```

**`backend/worker/.env`**
```env
REDIS_URL=redis://localhost:6379
RAG_SERVICE_URL=https://your-subdomain.ngrok-free.dev
API_URL=http://localhost:5000
INTERNAL_API_TOKEN=change-me-to-a-long-random-string
```

**`frontend/.env.local`**
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxx
```

**RAG service (set as Colab Secrets, not a local file)**

| Secret | Purpose |
|---|---|
| `QDRANT_URL` | Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | Qdrant API key |
| `NGROK_TOKEN` | ngrok auth token |

`QWEN_MODEL` is optional and defaults to `Qwen/Qwen2.5-3B-Instruct`.

`INTERNAL_API_TOKEN` must be identical in the API and worker.

### 6. Install and run each service

**API**
```bash
cd backend/api
npm install
npm run dev
```

**Worker**
```bash
cd backend/worker
npm install
npm run dev
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

### 7. RAG service on Colab

1. Open a new Colab notebook and choose **Runtime → Change runtime type → T4 GPU**.
2. Add the Colab Secrets above (turn on notebook access for each).
3. Run this cell:

```python
import os, sys
%cd /content
!rm -rf IIITG-Document-Assistant
!git clone https://github.com/Aftave/IIITG-Document-Assistant
%cd /content/IIITG-Document-Assistant/backend/rag-service
!pip install -q -r requirements.txt pyngrok nest_asyncio

from google.colab import userdata
os.environ["QDRANT_URL"] = userdata.get("QDRANT_URL")
os.environ["QDRANT_API_KEY"] = userdata.get("QDRANT_API_KEY")
os.environ["QWEN_MODEL"] = "Qwen/Qwen2.5-3B-Instruct"

import nest_asyncio, uvicorn
from pyngrok import ngrok
nest_asyncio.apply()
ngrok.set_auth_token(userdata.get("NGROK_TOKEN"))

sys.path.insert(0, os.getcwd())
print("Public URL:", ngrok.connect(8000).public_url)

import main
uvicorn.run(main.app, host="0.0.0.0", port=8000)
```

4. Copy the printed URL into `RAG_SERVICE_URL` in the API and worker `.env`, then restart both.
5. Check `<ngrok-url>/health`.

The ngrok URL changes on every Colab restart. If the cell stops, the service is down.

### Run order

1. `docker compose up -d`
2. Colab RAG cell, then update `RAG_SERVICE_URL`
3. API
4. Worker
5. Frontend
6. Tunnel for the Clerk webhook (only needed when users sign up or roles change)

---

## Roles

| Role | Chat | Upload / Delete |
|---|---|---|
| student | Documents allowed for students | No |
| faculty | Documents allowed for faculty | No |
| staff | Documents allowed for staff | No |
| admin | All documents | Yes |

New users default to `student`. To change a role:

1. Clerk Dashboard → Users → select the user → **Public metadata**.
2. Set `{"role": "admin"}` (or `faculty`, `staff`).
3. The `user.updated` webhook syncs it to MongoDB.
4. The user signs out and back in.

---

## Usage

1. Sign in with an `@iiitg.ac.in` account.
2. **Admin:** go to Upload, drop a PDF, and fill in subject, category and allowed roles. Wait for the status to become `ready`.
3. **Everyone:** open the Library, pick a subject (or "Chat with all →"), and ask questions.

Categories: Academic, Admissions, Examinations, Hostel, Circulars, Policies. Subject is a free-text field.

---

## API Endpoints

Verify these against your route files; the paths for upload and RAG query are the most likely to differ.

**Express API**

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/webhooks/clerk` | Clerk | Sync users and roles |
| GET | `/api/documents` | Signed in | List documents allowed for the role |
| POST | `/api/documents/upload` | Admin | Upload a PDF |
| DELETE | `/api/documents/:id` | Admin | Delete from S3, Qdrant and Mongo |
| POST | `/api/chat/subject/:subject/message` | Signed in | Ask a question |
| GET | `/api/chat/subject/:subject/history` | Signed in | Load chat history |
| POST | `/api/internal/documents/:id/status` | Worker | Update status (`x-internal-token`) |

**RAG service**

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/ingest` | Chunk, embed and store a PDF |
| POST | `/query` | Hybrid search, re-rank and answer |
| POST | `/delete-document` | Remove a document's chunks |

---

## Key Configuration

| Setting | Value | Where |
|---|---|---|
| Embedding model | `all-MiniLM-L6-v2` (384-dim) | `main.py` |
| Sparse model | `Qdrant/bm25` | `main.py` |
| Re-ranker | `BAAI/bge-reranker-v2-m3` | `main.py` |
| Prefetch limit | 30 | `main.py` |
| Final chunks | 5 (`FINAL_K`) | `main.py` |
| Threshold | 0.25 (`THRESHOLD`) | `main.py` |
| LLM | `QWEN_MODEL` env var | Colab cell |
| Qdrant collection | `institute_docs` | `main.py` |

Changing only the LLM needs no re-upload. Changing the embedding model requires re-uploading all documents.

---

## Testing Checklist

- [ ] `/health` on the RAG service returns OK
- [ ] Sign-up with a non-`iiitg.ac.in` email is blocked
- [ ] New user appears in MongoDB with role `student`
- [ ] Admin upload succeeds and the status changes to `ready`
- [ ] Student cannot see upload or delete
- [ ] Answer includes `(Page N)` citations
- [ ] Unrelated question returns "Not found"
- [ ] Chat history persists after reload
- [ ] Admin delete removes the document everywhere

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `NameError: QDRANT_URL is not defined` | Read it in `main.py`: `QDRANT_URL = os.environ["QDRANT_URL"]` |
| Colab path repeats `IIITG-Document-Assistant/backend/...` | Use the launcher cell above (it starts from `/content` and removes the old clone), then restart the session |
| ngrok 503 `ERR_NGROK_3004` | Uvicorn stopped. Re-run the Colab cell and update `RAG_SERVICE_URL` |
| `ERR_NGROK_334` (endpoint in use) | Colab already uses the free ngrok URL. Use a different tunnel for port 5000 |
| Clerk webhook "IP range blocked" | `localhost` is not reachable. Use a public tunnel |
| cloudflared fails on campus network | QUIC and port 7844 are blocked. Use VS Code port forwarding, Pinggy or a hotspot |
| Webhook returns 500 at `evt.data` | Use `wh.verify()` only to validate, then `JSON.parse(req.body.toString("utf8"))` |
| Role change does not sync | Set metadata on the newest user and sign out and in |
| `secret-key-invalid` | `CLERK_SECRET_KEY` must belong to the same Clerk app as the publishable key |
| S3 `PermanentRedirect` | `AWS_REGION` must match the bucket region |
| Worker job 404 | Worker calls `/api/internal/documents/:id/status`, so the API route must match |
| Documents show "Unassigned" | Add `subject` to `.select(...)` in `GET /api/documents`, or re-upload old documents |
| `docs.forEach is not a function` | API returns `{documents: [...]}`. Use `Array.isArray(data) ? data : data.documents ?? []` |
| Chat history missing after reload | Check the `/history` endpoint returns a plain array |
| `git push` rejected (fetch first) | `git pull origin main --allow-unrelated-histories --no-edit`, then push |
| Stuck in Vim during merge | Press `Esc`, `:q!`, then `git commit -m "Merge remote main"`. Or run `git config --global core.editor notepad` |
| `frontend/` missing on GitHub | Nested `.git` from `create-next-app`. Run `Remove-Item -Recurse -Force frontend\.git`, `git rm --cached frontend -f`, `git add frontend` |

---

## Security Notes

- Never commit `.env` files. Only `.env.example` is tracked.
- Rotate any key that was ever pasted in chat or committed (ngrok, Qdrant, AWS, Clerk).
- Removing a secret from the repo does not remove it from git history. Rotating is the only safe fix.
- The internal status route is protected by `INTERNAL_API_TOKEN`.
- Role checks happen on the server (API and Qdrant filter), not only in the UI.

---

## Roadmap

- RAGAS evaluation (Faithfulness, Answer Relevancy, Context Precision, Context Recall)
- Streaming responses
- Dockerfiles and cloud deployment (replacing Colab)
- OCR for scanned PDFs
- Subject tagging script for old documents

---

## License
