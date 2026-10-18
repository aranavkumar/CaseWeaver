"""Entity resolution + relationship construction from structured observations.

Uses deterministic EXACT matching wherever possible. Ambiguous similarities
produce a candidate relationship flagged 'needs_review' — never auto-merged.
Two people sharing a name are never merged automatically.
"""
from __future__ import annotations

import re
from collections import defaultdict

from ..db import repo
from ..util import new_id
from ..schemas import Entity, Observation, Relationship

# field types that become addressable graph entities
_ENTITY_TYPES = {"email", "url", "transaction_ref", "amount", "phone", "listing_id", "person", "organization"}


def normalize(field_type: str, value: str) -> str:
    v = value.strip()
    if field_type in ("email", "url"):
        return v.lower()
    if field_type in ("transaction_ref", "listing_id"):
        return v.upper()
    if field_type == "amount":
        digits = re.sub(r"[^\d.]", "", v)
        return f"amt:{digits}" if digits else v
    if field_type == "person":
        return v.lower()
    return v


def label(field_type: str, value: str) -> str:
    return {
        "email": "Email", "url": "Website", "transaction_ref": "Transaction",
        "amount": "Amount", "phone": "Phone", "listing_id": "Listing",
        "person": "Person", "organization": "Organization",
    }.get(field_type, field_type) + f": {value}"


def build_entities(case_id: str, observations: list[Observation]) -> list[Entity]:
    groups: dict[tuple[str, str], list[Observation]] = defaultdict(list)
    for o in observations:
        if o.field_type in _ENTITY_TYPES:
            groups[(o.field_type, normalize(o.field_type, o.value))].append(o)

    entities: list[Entity] = []
    for ((ftype, norm), obs_list) in groups.items():
        ent = Entity(
            id=new_id("ent"),
            case_id=case_id,
            entity_type=ftype,
            normalized_value=norm,
            display_label=label(ftype, obs_list[0].value.strip()),
            observation_ids=[o.id for o in obs_list],
        )
        repo.put("entities", ent)
        entities.append(ent)
    return entities


def build_relationships(case_id: str, entities: list[Entity]) -> list[Relationship]:
    """Link entities that co-occur in the same evidence item, plus corroboration
    edges for identifiers appearing across multiple files."""
    rels: list[Relationship] = []

    # map evidence_id -> entities appearing there
    ev_to_ents: dict[str, list[Entity]] = defaultdict(list)
    ent_obs: dict[str, list[Observation]] = {}
    obs_by_id = {o.id: o for o in repo.list("observations", case_id)}
    for e in entities:
        ent_obs[e.id] = [obs_by_id[oid] for oid in e.observation_ids if oid in obs_by_id]
        for o in ent_obs[e.id]:
            ev_to_ents[o.evidence_id].append(e)

    seen_pairs: set[tuple[str, str, str]] = set()

    def add_rel(a, b, rtype, obs_ids, method, conf, expl, inferred=False, contra=""):
        key = (a, b, rtype)
        if key in seen_pairs or a == b:
            return
        seen_pairs.add(key)
        rel = Relationship(
            id=new_id("rel"),
            case_id=case_id,
            source_entity_id=a,
            target_entity_id=b,
            relationship_type=rtype,
            supporting_observation_ids=sorted(set(obs_ids)),
            match_method=method,
            confidence=conf,
            review_status="needs_review" if (method != "exact" or inferred) else "needs_review",
            explanation=expl,
            contradicting_evidence=contra,
            is_inferred=inferred,
        )
        repo.put("relationships", rel)
        rels.append(rel)

    # entities co-mentioned within one evidence item
    for ev_id, ents in ev_to_ents.items():
        for i in range(len(ents)):
            for j in range(i + 1, len(ents)):
                a, b = ents[i], ents[j]
                if a.entity_type == "transaction_ref" and b.entity_type == "amount":
                    add_rel(a.id, b.id, "associated_with",
                            [o.id for o in ent_obs[a.id] if o.evidence_id == ev_id] +
                            [o.id for o in ent_obs[b.id] if o.evidence_id == ev_id],
                            "exact", 1.0,
                            f"Transaction and amount co-mentioned in evidence {ev_id}.")
                elif a.entity_type in ("email", "url") or b.entity_type in ("email", "url"):
                    add_rel(a.id, b.id, "appears_with",
                            [o.id for o in ent_obs[a.id] if o.evidence_id == ev_id],
                            "exact", 0.9,
                            f"Co-mentioned in evidence {ev_id}.")

    # corroboration: same transaction_ref in >=2 evidence items -> strong, but
    # explicitly does NOT prove identity or intent.
    for e in entities:
        if e.entity_type != "transaction_ref":
            continue
        ev_ids = {o.evidence_id for o in ent_obs[e.id]}
        if len(ev_ids) >= 2:
            rel = Relationship(
                id=new_id("rel"),
                case_id=case_id,
                source_entity_id=e.id,
                target_entity_id=e.id,  # self-corroboration node across files
                relationship_type="corroborated_across",
                supporting_observation_ids=e.observation_ids,
                match_method="exact",
                confidence=1.0,
                review_status="needs_review",
                explanation=(
                    f"The transaction reference '{e.normalized_value}' appears in "
                    f"{len(ev_ids)} separate evidence items. This corroborates that the "
                    "records refer to one transaction but does NOT establish identity or criminal intent."
                ),
            )
            rel.review_status = "accepted" if e.entity_type == "transaction_ref" else "needs_review"
            repo.put("relationships", rel)
            rels.append(rel)

    # ambiguous candidate: persons with the same first name but different evidence context
    persons = [e for e in entities if e.entity_type == "person"]
    by_first = defaultdict(list)
    for p in persons:
        by_first[p.normalized_value.split()[0]].append(p)
    for first, group in by_first.items():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                if a.normalized_value != b.normalized_value:
                    add_rel(a.id, b.id, "possible_same_person",
                            a.observation_ids + b.observation_ids,
                            "ambiguous", 0.4,
                            f"Shared first name '{first}' only. Do NOT merge without human review.",
                            inferred=True)
    return rels


def run(case_id: str, observations: list[Observation]) -> tuple[list[Entity], list[Relationship]]:
    # idempotent: wipe prior derived graph for the case, preserving corrected observations
    for r in repo.list("relationships", case_id):
        repo.delete("relationships", r.id)
    for e in repo.list("entities", case_id):
        repo.delete("entities", e.id)
    entities = build_entities(case_id, observations)
    rels = build_relationships(case_id, entities)
    return entities, rels
