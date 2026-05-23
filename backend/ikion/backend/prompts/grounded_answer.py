from __future__ import annotations


SYSTEM_PROMPT = """You are Ikion Core's grounded answering engine.

Answer only from the EVIDENCE section.
Use GUIDANCE only to shape tone, structure, and emphasis.
Use STUDENT_EXAM_CONTEXT only to personalize coaching level, focus areas, and exam structure.
Use EXAM_CHAT_SUBAGENT_CONTEXT to decide whether this turn needs exam-question generation, uploaded-past-paper selection, or inspired-variant generation.
Use CONVERSATION_CONTEXT only to resolve follow-up references, pronouns, and continuity from the active chat.
If the evidence does not support the answer, refuse instead of guessing.

Quality rules:
- Rephrase evidence instead of copying long passages.
- Preserve thread continuity when the user is clearly asking a follow-up, but never invent facts that are not supported by the evidence.
- Be pedagogically effective for learners.
- Match the requested depth:
  - if the user asks for a brief answer, keep it short
  - if the user asks for detail, depth, a walkthrough, or step-by-step help, expand accordingly
  - if the user asks for exam practice, respond in an exam-appropriate structure
- For exam-question requests:
  - start by presenting one recommended question
  - label whether it is from an uploaded past paper or an inspired variant
  - include supporting lecture evidence and how to use it in the answer
  - keep any adaptation faithful to workspace materials
- Prefer the most natural structure for the task instead of forcing one template.
- Keep the answer practical and grounded.
- Remove lecture labels, page numbers, and transcript timestamps unless explicitly requested.
- Use LaTeX delimiters for mathematical notation when formulas appear:
  - inline: $...$
  - block: $$...$$

Formatting requirements:
- Use markdown, but only add headings when they genuinely improve clarity.
- You may answer with:
  - short paragraphs
  - bullets
  - numbered steps
  - a small set of headings
  - an exam-style question and marking guidance when appropriate
- When EXAM_CHAT_SUBAGENT_CONTEXT.exam_related is true, default to this exam format unless the user asked otherwise:
  1. Recommended Exam Question
  2. Marking Guidance
  3. Lecture Evidence To Use (with citations)
  4. Answer Structure / Step-by-step plan
  5. Next Practice Step
- For exam walkthrough requests, ground the walkthrough in retrieved lecture/transcript evidence (not only exam-paper text).
- Do not force "Key Idea", "How It Works", "Example", "Rule of Thumb", or "Quick Check" unless they clearly fit the user's request.
- When the user asks for more detail, expand with explanation, reasoning, and examples.
- When the user asks for a direct answer, do not pad it with unnecessary sections.
- Use fenced code blocks only when the user explicitly asks for code.

Return a JSON object with:
- status: answered | partial | refused
- answer: markdown answer with section headings and inline citations like [1]
- citation_numbers: array of integers matching the provided evidence blocks
- reflection: object with
  - checks: array of strings describing what you verified
  - follow_up_handling: short sentence on how conversation continuity was handled
"""


def render_grounded_answer_prompt(
    query: str,
    resolved_query: str,
    guidance_texts: list[str],
    evidence_blocks: list[dict],
    conversation_context: list[dict] | None = None,
    exam_context: dict | None = None,
    exam_subagent_context: dict | None = None,
    turn_context: dict | None = None,
) -> str:
    guidance = "\n".join(f"- {text}" for text in guidance_texts) if guidance_texts else "- No active guidance pack."
    exam_lines = []
    if exam_context:
        exam_lines = [
            f"readiness_score={exam_context.get('readiness_score', 0)}",
            f"proficiency_band={exam_context.get('proficiency_band') or 'building'}",
            f"exam_attempt_readiness={exam_context.get('exam_attempt_readiness_score', 0)}",
            f"chat_readiness={exam_context.get('chat_readiness_score', 0)}",
            f"focus_topics={', '.join(exam_context.get('focus_topics') or []) or 'n/a'}",
            f"recommended_question={exam_context.get('recommended_question_title') or exam_context.get('recommended_question_text') or 'n/a'}",
            f"recommended_answer_framework={'; '.join(exam_context.get('recommended_answer_framework') or []) or 'n/a'}",
            f"why_now={'; '.join(exam_context.get('recommended_why_now') or []) or 'n/a'}",
        ]
    exam_subagent_lines = []
    if exam_subagent_context:
        exam_subagent_lines = [
            f"exam_related={exam_subagent_context.get('exam_related')}",
            f"intent={exam_subagent_context.get('intent') or 'none'}",
            f"source_preference={exam_subagent_context.get('source_preference') or 'auto'}",
            f"requires_deep_thinking={exam_subagent_context.get('requires_deep_thinking')}",
            f"requested_topics={', '.join(exam_subagent_context.get('requested_topics') or []) or 'n/a'}",
            f"selected_question_origin={exam_subagent_context.get('selected_question_origin') or 'n/a'}",
            f"selected_question_label={exam_subagent_context.get('selected_question_label') or 'n/a'}",
            f"selected_question_marks={exam_subagent_context.get('selected_question_marks') if exam_subagent_context.get('selected_question_marks') is not None else 'n/a'}",
            f"selected_question_topic={exam_subagent_context.get('selected_question_topic') or 'n/a'}",
            f"selected_question_number={exam_subagent_context.get('selected_question_number') or 'n/a'}",
            f"selected_question_text={exam_subagent_context.get('selected_question_text') or 'n/a'}",
            f"selected_question_guidance={exam_subagent_context.get('selected_question_guidance') or 'n/a'}",
            f"selected_question_aliases={'; '.join(exam_subagent_context.get('selected_question_aliases') or []) or 'n/a'}",
            f"selected_answer_framework={'; '.join(exam_subagent_context.get('selected_answer_framework') or []) or 'n/a'}",
            f"instructions={'; '.join(exam_subagent_context.get('instructions') or []) or 'n/a'}",
            f"retrieval_query_hint={exam_subagent_context.get('retrieval_query_hint') or 'n/a'}",
        ]
    conversation_lines = []
    for index, item in enumerate(conversation_context or [], start=1):
        role = str(item.get("role") or "unknown").strip()
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        conversation_lines.append(f"{index}. {role}: {content}")
    turn_lines = []
    if turn_context:
        turn_lines = [
            f"turn_type={turn_context.get('turn_type') or 'new_query'}",
            f"standalone_query={turn_context.get('standalone_query') or resolved_query}",
            f"uses_history={turn_context.get('uses_history')}",
            f"referenced_points={'; '.join(turn_context.get('referenced_points') or []) or 'n/a'}",
            f"response_strategy={'; '.join(turn_context.get('response_strategy') or []) or 'n/a'}",
            f"history_summary={turn_context.get('history_summary') or 'n/a'}",
            f"planner_confidence={turn_context.get('confidence')}",
            f"planner_reason={turn_context.get('reason') or 'n/a'}",
        ]
    evidence_lines = []
    for block in evidence_blocks:
        qb = block.get("question_bank") or []
        salient = block.get("salient_terms") or []
        chunk_text = block.get("chunk_text") or block.get("quote")
        evidence_lines.append(
            (
                f"[{block['index']}] {block['asset_title']} | {block.get('locator') or 'no locator'}\n"
                f"document_category={block.get('document_category') or 'general'}\n"
                f"score={block.get('score', 0):.4f} semantic={block.get('semantic_score', 0):.4f} lexical={block.get('lexical_score', 0):.4f}\n"
                f"salient_terms={', '.join(salient[:6]) if salient else 'n/a'}\n"
                f"question_bank={'; '.join(qb[:3]) if qb else 'n/a'}\n"
                f"question_guidance={block.get('default_question_guidance') or 'n/a'}\n"
                f"chunk_excerpt:\n{chunk_text}"
            )
        )
    evidence = "\n\n".join(evidence_lines) if evidence_lines else "No evidence blocks were supplied."
    return f"""USER QUERY
{query}

STANDALONE_RETRIEVAL_QUERY
{resolved_query}

TURN_CONTEXT
{chr(10).join(turn_lines) if turn_lines else 'No turn-level conversation analysis available.'}

STUDENT_EXAM_CONTEXT
{chr(10).join(exam_lines) if exam_lines else 'No exam-specific personalization available.'}

EXAM_CHAT_SUBAGENT_CONTEXT
{chr(10).join(exam_subagent_lines) if exam_subagent_lines else 'No exam subagent directives available.'}

CONVERSATION_CONTEXT
{chr(10).join(conversation_lines) if conversation_lines else 'No recent conversation context available.'}

GUIDANCE
{guidance}

EVIDENCE
{evidence}
"""
