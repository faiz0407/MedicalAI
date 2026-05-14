"""
Agent 1 — Medical Guidance Tools.
These are LangChain-compatible tool functions that the LLM invokes.
No direct DB access — all DB operations go through crud.py.
"""
from typing import List, Dict, Optional
from langchain_core.tools import tool
from pydantic import BaseModel, Field


EMERGENCY_KEYWORDS = {
    "chest pain", "heart attack", "stroke", "difficulty breathing",
    "shortness of breath", "unconscious", "seizure", "severe bleeding",
    "anaphylaxis", "allergic reaction", "loss of consciousness",
    "cannot breathe", "choking",
}

CONSULT_KEYWORDS = {
    "high fever", "persistent pain", "blood in urine", "blood in stool",
    "sudden vision loss", "severe headache", "vomiting blood",
}


class SymptomInput(BaseModel):
    symptoms: List[str] = Field(description="List of symptoms reported by the user")


class RAGQueryInput(BaseModel):
    symptoms_text: str = Field(description="Symptom text to query the medical knowledge base")


@tool("check_emergency", args_schema=SymptomInput)
def check_emergency(symptoms: List[str]) -> Dict:
    """
    Checks if any reported symptoms are emergencies.
    Returns is_emergency flag and matched keywords.
    """
    lowered = {s.lower() for s in symptoms}
    matched = []
    for kw in EMERGENCY_KEYWORDS:
        if any(kw in s for s in lowered):
            matched.append(kw)
    return {
        "is_emergency": len(matched) > 0,
        "matched_emergency_keywords": matched,
        "advisory": (
            "⚠️ EMERGENCY ALERT: One or more of your symptoms may indicate "
            "a life-threatening condition. Please call emergency services (911/112) "
            "immediately or go to the nearest emergency room. Do NOT wait."
        ) if matched else None,
    }


@tool("query_medical_knowledge", args_schema=RAGQueryInput)
def query_medical_knowledge(symptoms_text: str) -> Dict:
    """
    Queries the medical-rag Pinecone index (483k PubMed research articles) using
    BioBERT embeddings + cross-encoder reranking.
    Retrieves top-20 candidates, reranks them, and keeps only those with a
    cross-encoder similarity ≥ 90% (sigmoid-normalized score).
    When no_relevant_chunks is True, the LLM must answer from its own knowledge.
    """
    from app.vector_store.pinecone_store import medical_vector_store
    results = medical_vector_store.query_with_rerank(
        symptoms_text,
        top_k_retrieve=20,
        top_k_rerank=5,
    )
    # Format for easy citation in the LLM prompt
    formatted = []
    for r in results:
        citation_parts = []
        if r.get("doi"):
            citation_parts.append(f"DOI: {r['doi']}")
        if r.get("pmc_id"):
            citation_parts.append(f"PMCID: {r['pmc_id']}")
        citation = " | ".join(citation_parts) if citation_parts else "Source: PubMed"
        formatted.append({
            "text":        r["text"],
            "citation":    citation,
            "score":       round(r.get("score", 0), 4),
            "cross_score": round(r.get("cross_score", 0), 4),
        })

    return {
        "knowledge_chunks": formatted,
        "total_retrieved":  len(formatted),
        "instruction": (
            "Use these PubMed research chunks as supplementary evidence alongside your "
            "own medical knowledge. For each claim, if a chunk supports it, add an inline "
            "citation using its citation field. For aspects not covered by any chunk, draw "
            "on your own general medical training and note it as general medical knowledge."
        ) if formatted else (
            "No PubMed chunks were retrieved for this query. "
            "Answer entirely from your own medical training knowledge and state clearly that "
            "this is based on general medical knowledge, not specific research citations."
        ),
    }


@tool("generate_home_remedies")
def generate_home_remedies(symptoms_text: str) -> Dict:
    """
    Returns general home remedy suggestions for common, non-emergency symptoms.
    """
    remedies_map = {
        "fever": [
            "Stay well hydrated (8-10 glasses of water/day)",
            "Rest in a cool, comfortable room",
            "Apply a cool damp cloth to the forehead",
            "Light, easy-to-digest meals",
        ],
        "cold": [
            "Warm honey-lemon tea with ginger",
            "Steam inhalation 2-3 times daily",
            "Saline nasal rinse",
            "Adequate sleep and rest",
        ],
        "headache": [
            "Rest in a dark, quiet room",
            "Stay hydrated",
            "Cold or warm compress on forehead/neck",
            "Gentle neck stretches",
        ],
        "sore throat": [
            "Warm saltwater gargle (1/4 tsp salt in 8 oz warm water)",
            "Honey in warm tea",
            "Cold fluids or ice chips for comfort",
            "Avoid irritants like smoke",
        ],
        "stomach ache": [
            "Ginger tea or peppermint tea",
            "Eat small, bland meals (BRAT diet: bananas, rice, applesauce, toast)",
            "Avoid fatty or spicy foods",
            "Warm compress on abdomen",
        ],
        "default": [
            "Rest and avoid strenuous activity",
            "Stay well hydrated",
            "Monitor symptoms closely",
            "Seek medical attention if symptoms worsen",
        ],
    }
    text_lower = symptoms_text.lower()
    matched = []
    for key, rem in remedies_map.items():
        if key in text_lower:
            matched.extend(rem)
    if not matched:
        matched = remedies_map["default"]
    return {
        "remedies": list(dict.fromkeys(matched))[:6],  # dedupe, max 6
        "note": "These are general suggestions only. Consult a doctor for proper treatment.",
    }


@tool("suggest_videos")
def suggest_videos(symptoms_text: str) -> Dict:
    """
    Suggests mock educational video links related to the reported symptoms.
    """
    base = "https://healthvideos.example.com"
    videos = [
        {
            "title": "Understanding Common Symptoms & When to See a Doctor",
            "url": f"{base}/common-symptoms-guide",
            "duration": "8:32",
        },
        {
            "title": "Home Remedies That Actually Work — Medical Expert Explains",
            "url": f"{base}/home-remedies-explained",
            "duration": "12:15",
        },
        {
            "title": "Warning Signs: When Symptoms Become Emergencies",
            "url": f"{base}/emergency-warning-signs",
            "duration": "6:44",
        },
    ]
    text_lower = symptoms_text.lower()
    if "fever" in text_lower:
        videos.append({
            "title": "Managing Fever at Home — Step by Step",
            "url": f"{base}/fever-management",
            "duration": "5:20",
        })
    if "chest" in text_lower or "heart" in text_lower:
        videos.insert(0, {
            "title": "⚠️ Chest Pain: Do NOT ignore these signs",
            "url": f"{base}/chest-pain-emergency",
            "duration": "4:18",
        })
    return {"suggested_videos": videos[:4]}


@tool("get_doctor_consultation_triggers")
def get_doctor_consultation_triggers(symptoms_text: str) -> Dict:
    """
    Identifies whether symptoms warrant immediate doctor consultation.
    """
    text_lower = symptoms_text.lower()
    triggers = []
    for kw in CONSULT_KEYWORDS:
        if kw in text_lower:
            triggers.append(kw)
    return {
        "should_consult": len(triggers) > 0,
        "triggered_by": triggers,
        "message": (
            "Based on your symptoms, we strongly recommend consulting a doctor. "
            "Would you like to book an appointment?"
        ) if triggers else None,
    }
