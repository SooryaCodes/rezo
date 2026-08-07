"""Policy retrieval.

The Policy Agent never answers from model memory. Clauses are retrieved from the
store's own pack and the agent must cite one by id, which the guarded tool layer
then verifies actually exists. That is what makes a hallucinated policy
impossible rather than merely unlikely.

Two backends: a dependency-free lexical retriever that is exact and fast at
policy-pack scale, and ChromaDB for semantic retrieval when the corpus grows
past what lexical matching handles well. Both return the same shape.
"""
from __future__ import annotations

import math
import re
from collections import Counter

from ..config import settings

STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "and", "or",
    "of", "to", "in", "on", "for", "with", "at", "by", "from", "it", "its",
    "this", "that", "these", "those", "i", "my", "me", "you", "your", "we",
    "not", "no", "but", "if", "then", "than", "as", "so", "can", "will",
}

# Vocabulary that ties everyday buyer language to policy language.
SYNONYMS = {
    "broken": ["damage", "damaged"], "broke": ["damage", "damaged"],
    "torn": ["damage", "damaged", "tear"], "tear": ["damage", "torn"],
    "crack": ["damage", "damaged"], "cracked": ["damage", "damaged"],
    "stain": ["damage", "stained"], "ripped": ["damage", "torn"],
    "missing": ["not", "delivered", "lost"], "lost": ["not", "delivered"],
    "stuck": ["not", "delivered", "transit"],
    "small": ["size"], "big": ["size"], "tight": ["size"], "loose": ["size"],
    "faulty": ["defect", "functional"], "defective": ["defect", "functional"],
    "freezing": ["functional", "defect"], "refund": ["refund", "money"],
}


def tokenize(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    out: list[str] = []
    for w in words:
        if w in STOPWORDS or len(w) < 2:
            continue
        out.append(w)
        out.extend(SYNONYMS.get(w, []))
    return out


class LexicalRetriever:
    """TF-IDF over clause text with a claim-type boost."""

    def __init__(self, clauses: list[dict]):
        self.clauses = clauses
        self.docs = [tokenize(f"{c.get('title', '')} {c.get('text', '')}")
                     for c in clauses]
        self.df = Counter()
        for doc in self.docs:
            for term in set(doc):
                self.df[term] += 1
        self.n = max(1, len(self.docs))

    def _idf(self, term: str) -> float:
        return math.log(1 + self.n / (1 + self.df.get(term, 0)))

    def search(self, query: str, claim_type: str = "", top_k: int = 4) -> list[dict]:
        q = tokenize(query)
        if not q and not claim_type:
            return [dict(c, _score=0.0) for c in self.clauses[:top_k]]

        scored = []
        for clause, doc in zip(self.clauses, self.docs):
            tf = Counter(doc)
            length = max(1, len(doc))
            score = sum((tf[t] / length) * self._idf(t) for t in q if t in tf)
            # A clause that formally covers this claim type outranks one that
            # merely shares vocabulary.
            if claim_type and claim_type in clause.get("claim_types", []):
                score += 1.0
            scored.append(dict(clause, _score=round(score, 4)))

        scored.sort(key=lambda c: c["_score"], reverse=True)
        return scored[:top_k]


class ChromaRetriever:
    """Semantic retrieval. Same interface; used when REZO_RETRIEVER=chroma."""

    def __init__(self, clauses: list[dict], collection_name: str):
        import chromadb  # imported lazily so it stays an optional dependency

        self.clauses = {c["id"]: c for c in clauses}
        self.client = chromadb.EphemeralClient()
        self.collection = self.client.get_or_create_collection(collection_name)
        if clauses:
            self.collection.upsert(
                ids=[c["id"] for c in clauses],
                documents=[f"{c.get('title', '')}. {c.get('text', '')}" for c in clauses],
                metadatas=[{"claim_types": ",".join(c.get("claim_types", []))}
                           for c in clauses])

    def search(self, query: str, claim_type: str = "", top_k: int = 4) -> list[dict]:
        res = self.collection.query(query_texts=[query or claim_type or "policy"],
                                    n_results=min(top_k, len(self.clauses) or 1))
        out = []
        for cid, distance in zip(res["ids"][0], res["distances"][0]):
            clause = self.clauses.get(cid)
            if not clause:
                continue
            score = 1.0 - float(distance)
            if claim_type and claim_type in clause.get("claim_types", []):
                score += 1.0
            out.append(dict(clause, _score=round(score, 4)))
        out.sort(key=lambda c: c["_score"], reverse=True)
        return out


def build_retriever(clauses: list[dict], collection_name: str = "policy"):
    if settings.retriever == "chroma":
        try:
            return ChromaRetriever(clauses, collection_name)
        except Exception:
            pass  # chroma unavailable: lexical retrieval is the documented default
    return LexicalRetriever(clauses)


def retrieve_clauses(pack: dict, query: str, claim_type: str = "",
                     top_k: int = 4) -> list[dict]:
    retriever = build_retriever(pack.get("clauses", []),
                                f"{pack.get('store_id', 'store')}_{pack.get('version', 'v')}")
    return retriever.search(query, claim_type, top_k)
