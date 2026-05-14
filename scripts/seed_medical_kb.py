"""
Seed the Pinecone medical knowledge base with extended content using BioBERT embeddings.

Run once after configuring Pinecone:
  cd backend && python ../scripts/seed_medical_kb.py

The script uses upsert_batch() so all documents are embedded in a single
BioBERT forward pass — much faster than one-by-one upsert_knowledge() calls.

NOTE: The Pinecone index must be dimension=768 (BioBERT hidden size).
      If you previously had a 1536-dim index, delete it in the Pinecone
      console before running this script.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from app.vector_store.pinecone_store import medical_vector_store

# Additional clinical knowledge beyond the baseline seeded by seed_medical_knowledge()
EXTENDED_KNOWLEDGE = [
    {
        "id":   "copd-001",
        "text": (
            "Chronic obstructive pulmonary disease (COPD): progressive airflow limitation "
            "caused by emphysema and/or chronic bronchitis, primarily from smoking. "
            "Symptoms: chronic productive cough, progressive dyspnoea, wheeze. "
            "Management: smoking cessation (most effective intervention), inhaled "
            "bronchodilators (LABA, LAMA), pulmonary rehabilitation. Acute exacerbation "
            "signs (increased dyspnoea, purulent sputum, reduced exercise tolerance) "
            "require urgent medical assessment. Severe exacerbation → hospitalisation."
        ),
        "metadata": {"category": "copd", "severity": "chronic-severe", "icd10": "J44.1"},
    },
    {
        "id":   "dehydration-001",
        "text": (
            "Dehydration: inadequate body fluid levels. Clinical signs: dark amber urine, "
            "reduced urine output, dry mucous membranes, tachycardia, dizziness, fatigue. "
            "Management: oral rehydration solution (ORS) containing electrolytes — sip "
            "frequently rather than large volumes at once. Avoid caffeinated beverages. "
            "Moderate dehydration (no urine >6 hrs, sunken eyes, lethargy): seek medical "
            "review. Severe dehydration (altered consciousness, rapid weak pulse, "
            "no urine >8 hrs): EMERGENCY — IV fluid resuscitation required."
        ),
        "metadata": {"category": "dehydration", "severity": "mild-critical", "icd10": "E86.0"},
    },
    {
        "id":   "anaphylaxis-001",
        "text": (
            "Anaphylaxis: severe, rapid-onset systemic allergic reaction. Triggers: "
            "food (nuts, shellfish), insect stings, medications (penicillin, NSAIDs), "
            "latex. Presentation: urticaria, angioedema, bronchospasm, hypotension, "
            "stridor. EMERGENCY TREATMENT: intramuscular adrenaline (epinephrine) "
            "0.5 mg (1:1000) into lateral thigh — this is the first-line intervention. "
            "Call emergency services immediately. Lay patient flat with legs elevated "
            "unless respiratory distress. Do NOT give oral medications."
        ),
        "metadata": {"category": "anaphylaxis", "severity": "critical",
                     "emergency": True, "icd10": "T78.2"},
    },
    {
        "id":   "insomnia-001",
        "text": (
            "Insomnia: difficulty initiating or maintaining sleep, or non-restorative "
            "sleep, for ≥3 nights per week over ≥3 months. Cognitive behavioural therapy "
            "for insomnia (CBT-I) is the first-line treatment. Sleep hygiene: consistent "
            "sleep/wake times, avoid screens 1 hr before bed, dark cool bedroom, limit "
            "caffeine after noon, avoid alcohol as a sleep aid (disrupts REM sleep). "
            "Short-term pharmacotherapy may be considered by a physician if CBT-I "
            "is unavailable; avoid long-term sedative-hypnotic use."
        ),
        "metadata": {"category": "insomnia", "severity": "mild-moderate", "icd10": "G47.0"},
    },
    {
        "id":   "thyroid-hyperthyroid-001",
        "text": (
            "Hyperthyroidism (overactive thyroid): excess thyroid hormone production. "
            "Common causes: Graves disease, toxic multinodular goitre, thyroiditis. "
            "Symptoms: unexplained weight loss, heat intolerance, palpitations, tremor, "
            "anxiety, diarrhoea, exophthalmos (Graves). Diagnosis: TSH, free T4, free T3. "
            "Treatment: antithyroid drugs (carbimazole, propylthiouracil), radioiodine, "
            "or surgery — requires physician management. Thyroid storm (extreme "
            "hyperthyroidism with fever, tachycardia, altered consciousness) is a "
            "medical emergency."
        ),
        "metadata": {"category": "hyperthyroidism", "severity": "chronic-critical",
                     "icd10": "E05.9"},
    },
    {
        "id":   "stroke-tia-001",
        "text": (
            "Stroke (cerebrovascular accident) and TIA (transient ischaemic attack). "
            "USE FAST ACRONYM: Face drooping, Arm weakness, Speech difficulty, Time to "
            "call emergency services. Other signs: sudden severe headache, vision changes, "
            "loss of balance. STROKE IS A MEDICAL EMERGENCY — time-to-treatment is "
            "critical. Thrombolysis is effective within 4.5 hours of ischaemic stroke onset. "
            "Do NOT give the patient anything to eat or drink. Call emergency services "
            "immediately. Note exact time symptoms started."
        ),
        "metadata": {"category": "stroke", "severity": "critical",
                     "emergency": True, "icd10": "I63.9"},
    },
    {
        "id":   "skin-rash-001",
        "text": (
            "Skin rash (exanthem): diverse causes including contact dermatitis, urticaria, "
            "eczema (atopic dermatitis), psoriasis, drug reaction, or infectious illness. "
            "General care: avoid identified triggers, moisturise regularly for eczema, "
            "cool compresses for urticaria. URGENT evaluation needed for: purpuric "
            "non-blanching rash (possible meningococcal disease), rapidly spreading rash "
            "with fever, rash with mucosal involvement (Stevens-Johnson syndrome), or "
            "rash following new medication. Do NOT self-treat drug rashes."
        ),
        "metadata": {"category": "skin_rash", "severity": "mild-critical", "icd10": "R21"},
    },
    {
        "id":   "joint-pain-arthritis-001",
        "text": (
            "Arthralgia (joint pain) and arthritis: osteoarthritis is the most common — "
            "cartilage degeneration in weight-bearing joints, worsened by activity. "
            "Rheumatoid arthritis: autoimmune symmetrical small joint involvement, "
            "morning stiffness >1 hour. Gout: acute monoarthritis, often 1st metatarsal, "
            "uric acid crystals. General: RICE (rest, ice, compression, elevation) for "
            "acute flares, weight reduction for osteoarthritis, physiotherapy. "
            "Disease-modifying antirheumatic drugs (DMARDs) for RA require specialist "
            "prescription. Septic arthritis (hot, swollen, extremely painful joint with "
            "fever) is an emergency — requires joint aspiration and IV antibiotics."
        ),
        "metadata": {"category": "arthritis", "severity": "mild-critical", "icd10": "M79.3"},
    },
]


if __name__ == "__main__":
    print("=" * 60)
    print("HealthcareAI — BioBERT Medical Knowledge Base Seeder")
    print("=" * 60)
    print(f"\nEmbedding model : {os.getenv('BIOBERT_MODEL', 'dmis-lab/biobert-base-cased-v1.2')}")
    print(f"Vector dimension: 768 (BioBERT hidden size)")
    print()

    print("Step 1/3 — Connecting to Pinecone …")
    medical_vector_store.initialize()

    print("Step 2/3 — Seeding baseline clinical knowledge (12 topics) …")
    medical_vector_store.seed_medical_knowledge()

    print(f"Step 3/3 — Seeding {len(EXTENDED_KNOWLEDGE)} additional documents …")
    medical_vector_store.upsert_batch(EXTENDED_KNOWLEDGE)

    total = 12 + len(EXTENDED_KNOWLEDGE)
    print(f"\n✅  Done! {total} BioBERT-embedded medical documents indexed in Pinecone.")
    print("    The knowledge base is ready for RAG queries via Agent 1.\n")
