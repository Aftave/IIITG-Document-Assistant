
import os
import uuid
import math
import httpx
import fitz
from typing import List, Optional
from pyngrok import ngrok
import nest_asyncio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import BitsAndBytesConfig
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from qdrant_client.models import (
    Distance,
    VectorParams,
    SparseVectorParams,
    PointStruct,
    Prefetch,
    FusionQuery,
    Fusion,
    Filter,
    FieldCondition,
    MatchValue,
    MatchAny,
    PayloadSchemaType,
    FilterSelector,
)

from sentence_transformers import SentenceTransformer, CrossEncoder
from fastembed import SparseTextEmbedding
from transformers import AutoModelForCausalLM, AutoTokenizer

import uvicorn

QDRANT_URL = os.environ["QDRANT_URL"]
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY")
QWEN_MODEL = os.environ.get("QWEN_MODEL", "Qwen/Qwen2.5-7B-Instruct")

try:
    ngrok.set_auth_token("NGROK_TOKEN")
except Exception:
    pass

COLLECTION_NAME = "institute_docs"

DENSE_MODEL_NAME = "all-MiniLM-L6-v2"
DENSE_DIM = 384

SPARSE_MODEL_NAME = "Qdrant/bm25"
RERANKER_MODEL_NAME = "BAAI/bge-reranker-v2-m3"

THRESHOLD = 0.1
FINAL_K = 7
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150

NOT_FOUND = "Not found in the document."
NAMESPACE_URL = uuid.NAMESPACE_URL

app = FastAPI(title="IIIT Guwahati RAG Service")

if QDRANT_URL == ":memory:":
    qdrant = QdrantClient(":memory:")
else:
    qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

print("Loading dense model...")
dense_model = SentenceTransformer(DENSE_MODEL_NAME)

print("Loading sparse model...")
sparse_model = SparseTextEmbedding(model_name=SPARSE_MODEL_NAME)

print("Loading reranker...")
reranker = CrossEncoder(RERANKER_MODEL_NAME)

print("Loading Qwen tokenizer + model (this may take a while)...")
tokenizer = AutoTokenizer.from_pretrained(QWEN_MODEL)
qwen_model = AutoModelForCausalLM.from_pretrained(
    QWEN_MODEL,
    quantization_config=BitsAndBytesConfig(load_in_4bit=True),
    device_map="auto",
)
print("All models loaded!")


def ensure_collection():
    collections = [c.name for c in qdrant.get_collections().collections]
    if COLLECTION_NAME not in collections:
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config={
                "dense": VectorParams(size=DENSE_DIM, distance=Distance.COSINE),
            },
            sparse_vectors_config={
                "sparse": SparseVectorParams(),
            },
        )
        qdrant.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="documentId",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        qdrant.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="allowedRoles",
            field_schema=PayloadSchemaType.KEYWORD,
        )
    try:
      qdrant.create_payload_index(
      collection_name=COLLECTION_NAME,
      field_name="subject",
      field_schema=PayloadSchemaType.KEYWORD,
      )
    except Exception:
        pass


@app.on_event("startup")
def on_startup():
    ensure_collection()


class IngestRequest(BaseModel):
    documentId: str
    title: str
    category: str
    subject: str = ""
    allowedRoles: List[str]
    downloadUrl: str


class IngestResponse(BaseModel):
    documentId: str
    pageCount: int
    chunkCount: int


class ChatMessage(BaseModel):
    role: str
    content: str


class QueryRequest(BaseModel):
    documentId: Optional[str] = None
    subject: Optional[str] = None
    role: str
    question: str
    history: Optional[List[ChatMessage]] = []


class QueryResponse(BaseModel):
    answer: str
    sources: List[int]


class DeleteRequest(BaseModel):
    documentId: str


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    chunks = []
    start = 0
    length = len(text)
    while start < length:
        end = min(start + size, length)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == length:
            break
        start = end - overlap
    return chunks


def scope_filter(role: str, document_id: Optional[str] = None, subject: Optional[str] = None) -> Filter:
    must = [FieldCondition(key="allowedRoles", match=MatchAny(any=[role]))]
    if document_id:
        must.append(FieldCondition(key="documentId", match=MatchValue(value=document_id)))
    elif subject:
        must.append(FieldCondition(key="subject", match=MatchValue(value=subject)))
    return Filter(must=must)


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))

def norm_role(r: str) -> str:
    return "user" if r == "user" else "assistant"
  
def rewrite_query(question: str, history: List[ChatMessage]) -> str:
    if not history:
        return question

    history_text = "\n".join(f"{norm_role(h.role)}: {h.content}" for h in history[-6:])

    prompt = (
        "Given the conversation history and a follow-up question, rewrite the "
        "follow-up into a standalone, specific question that includes necessary "
        "context (e.g. subject/paper/topic being discussed). "
        "Only output the rewritten question, nothing else.\n\n"
        f"History:\n{history_text}\n\n"
        f"Follow-up question: {question}\n"
        "Standalone question:"
    )

    messages = [{"role": "user", "content": prompt}]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(qwen_model.device)
    try:
      output = qwen_model.generate(
        **inputs,
        max_new_tokens=700,
        do_sample=True,
        temperature=0.5,
        top_p=0.9,
    )
    except RuntimeError:
      output = qwen_model.generate(**inputs, max_new_tokens=700, do_sample=False)
    new_tokens = output[0][inputs.input_ids.shape[-1]:]
    rewritten = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()

    return rewritten if rewritten else question


def generate_answer(question: str, context_chunks: List[str], history: List[ChatMessage]) -> str:
    system_prompt = (
    "You are the IIIT Guwahati institute document assistant, acting like a knowledgeable "
    "teacher. The provided context comes from official institute documents and is your "
    "primary source of truth.\n\n"
    "Rules:\n"
    "1. Use the context to understand the topic, then answer in your own words. Do not "
    "copy lines verbatim unless quoting is necessary.\n"
    "2. You may explain, summarize, compare, give examples, and reason beyond the exact "
    "text. If asked to create something (questions, quizzes, summaries, notes, "
    "explanations), generate it based on the topics and concepts in the context.\n"
    "3. Use your own general knowledge to fill gaps or clarify concepts, but never "
    "contradict the context. If the context and your knowledge differ, follow the context.\n"
    "4. For facts taken directly from the context (dates, rules, numbers, policies), "
    "cite the page as (Page N). Citations are not needed for generated content such as "
    "practice questions.\n"
    f"5. Reply with exactly '{NOT_FOUND}' only if the question is completely unrelated "
    "to the context's subject matter.\n"
    "6. Keep answers clear, well structured and relevant to the question."
)

    messages = [{"role": "system", "content": system_prompt}]

    for h in history[-6:]:
        messages.append({"role": norm_role(h.role), "content": h.content})

    context = "\n\n".join(context_chunks)
    messages.append(
        {
            "role": "user",
            "content": f"Context:\n{context}\n\nQuestion: {question}",
        }
    )

    text = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    inputs = tokenizer([text], return_tensors="pt").to(qwen_model.device)

    try:
      output = qwen_model.generate(
          **inputs,
          max_new_tokens=700,
          do_sample=True,
          temperature=0.5,
          top_p=0.9,
      )
    except RuntimeError:
      output = qwen_model.generate(
          **inputs,
          max_new_tokens=700,
          do_sample=False
      )

    new_tokens = output[0][inputs.input_ids.shape[-1]:]
    answer = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
    return answer


@app.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest):
    try:
        with httpx.Client(timeout=120.0) as client:
            resp = client.get(req.downloadUrl)
            resp.raise_for_status()
            pdf_bytes = resp.content
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to download PDF: {e}")

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {e}")

    page_count = doc.page_count
    all_chunks = []

    for page_num in range(page_count):
        page = doc.load_page(page_num)
        text = page.get_text()
        if not text.strip():
            continue
        chunks = chunk_text(text)
        for c in chunks:
            all_chunks.append((page_num + 1, c))

    doc.close()

    if not all_chunks:
        raise HTTPException(status_code=400, detail="No extractable text found in PDF")

    texts = [c[1] for c in all_chunks]

    dense_vectors = dense_model.encode(texts, show_progress_bar=False).tolist()
    sparse_embeddings = list(sparse_model.embed(texts))

    points = []
    for idx, ((page_num, chunk), dense_vec, sparse_emb) in enumerate(
        zip(all_chunks, dense_vectors, sparse_embeddings)
    ):
        point_id = str(uuid.uuid5(NAMESPACE_URL, f"{req.documentId}-{idx}"))
        points.append(
            PointStruct(
                id=point_id,
                vector={
                    "dense": dense_vec,
                    "sparse": qmodels.SparseVector(
                        indices=sparse_emb.indices.tolist(),
                        values=sparse_emb.values.tolist(),
                    ),
                },
                payload={
                    "documentId": req.documentId,
                    "title": req.title,
                    "category": req.category,
                    "subject": req.subject,
                    "allowedRoles": req.allowedRoles,
                    "page": page_num,
                    "text": chunk,
                },
            )
        )

    qdrant.upsert(collection_name=COLLECTION_NAME, points=points)

    return IngestResponse(
        documentId=req.documentId,
        pageCount=page_count,
        chunkCount=len(points),
    )


@app.post("/query", response_model=QueryResponse)
def query(req: QueryRequest):
    search_query = rewrite_query(req.question, req.history or [])

    dense_vec = dense_model.encode(search_query).tolist()
    sparse_emb = list(sparse_model.embed([search_query]))[0]

    sparse_vec = qmodels.SparseVector(
        indices=sparse_emb.indices.tolist(),
        values=sparse_emb.values.tolist(),
    )

    qfilter = scope_filter(req.role, req.documentId, req.subject)

    result = qdrant.query_points(
        collection_name=COLLECTION_NAME,
        prefetch=[
            Prefetch(query=dense_vec, using="dense", limit=30, filter=qfilter),
            Prefetch(query=sparse_vec, using="sparse", limit=30, filter=qfilter),
        ],
        query=FusionQuery(fusion=Fusion.RRF),
        limit=30,
        with_payload=True,
    )

    candidates = result.points

    if not candidates:
        return QueryResponse(answer=NOT_FOUND, sources=[])

    pairs = [(req.question, c.payload["text"]) for c in candidates]
    scores = reranker.predict(pairs)

    scored_candidates = list(zip(candidates, scores))
    scored_candidates.sort(key=lambda x: x[1], reverse=True)

    top_score = sigmoid(float(scored_candidates[0][1]))

    if top_score < THRESHOLD:
        return QueryResponse(answer=NOT_FOUND, sources=[])

    top_candidates = scored_candidates[:FINAL_K]

    context_chunks = [c.payload["text"] for c, _ in top_candidates]
    pages = sorted(set(c.payload["page"] for c, _ in top_candidates))

    answer = generate_answer(req.question, context_chunks, req.history or [])

    return QueryResponse(answer=answer, sources=pages)


@app.post("/delete-document")
def delete_document(req: DeleteRequest):
    qdrant.delete(
        collection_name=COLLECTION_NAME,
        points_selector=FilterSelector(
            filter=Filter(
                must=[
                    FieldCondition(
                        key="documentId", match=MatchValue(value=req.documentId)
                    )
                ]
            )
        ),
    )
    return {"status": "deleted", "documentId": req.documentId}


@app.get("/health")
def health():
    return {"status": "ok"}
