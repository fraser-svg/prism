import type Database from "better-sqlite3";
import { ContextRepository } from "./context-repository";
import type { ContextItemRow } from "./context-repository";
import { EventLog } from "./event-log";

const MAX_CONCURRENT = 3;
const MAX_CONTENT_BYTES = 100 * 1024; // 100KB before truncation
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const HAIKU_TIMEOUT_MS = 30_000;

// ─── Transcript Detection ───

const SPEAKER_PATTERN = /^[\[\(]?\d{0,2}:?\d{0,2}:?\d{0,2}[\]\)]?\s*[\w\s]{1,30}:/;

export function isTranscript(content: string): boolean {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 10 || content.length < 500) return false;
  const speakerLines = lines.filter((l) => SPEAKER_PATTERN.test(l.trim()));
  return speakerLines.length / lines.length > 0.15;
}

// ─── Extraction Pipeline ───

interface QueueEntry {
  itemId: string;
}

export class ExtractionPipeline {
  private repo: ContextRepository;
  private eventLog: EventLog;
  private queue: QueueEntry[] = [];
  private activeCount = 0;
  private getApiKey: () => string | null;

  constructor(db: Database.Database, getApiKey: () => string | null) {
    this.repo = new ContextRepository(db);
    this.eventLog = new EventLog(db);
    this.getApiKey = getApiKey;

    // Startup reconciliation: reset stranded items
    const resetCount = this.repo.resetStrandedItems();
    if (resetCount > 0) {
      this.eventLog.append({
        eventType: "context:reconciliation",
        summary: `Reset ${resetCount} stranded extraction(s) on startup`,
        metadata: { resetCount },
      });
    }

    // Re-queue items that are in 'queued' status
    const stranded = this.repo.getStrandedItems();
    for (const item of stranded) {
      this.enqueue(item.id);
    }
  }

  enqueue(itemId: string): void {
    // Don't double-queue
    if (this.queue.some((e) => e.itemId === itemId)) return;

    this.queue.push({ itemId });
    this.drain();
  }

  get queueSize(): number {
    return this.queue.length;
  }

  get activeExtractions(): number {
    return this.activeCount;
  }

  private drain(): void {
    while (this.activeCount < MAX_CONCURRENT && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      this.activeCount++;
      this.processItem(entry.itemId).finally(() => {
        this.activeCount--;
        this.drain();
      });
    }
  }

  private async processItem(itemId: string): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      // No API key available, leave item as 'stored'
      this.repo.updateExtractionStatus(itemId, "stored");
      return;
    }

    const item = this.repo.getItem(itemId);
    if (!item) return;

    this.repo.updateExtractionStatus(itemId, "extracting");

    const startMs = Date.now();

    try {
      const content = item.content ?? "";
      if (!content.trim()) {
        this.repo.updateExtractionStatus(itemId, "stored");
        return;
      }

      const truncated = content.length > MAX_CONTENT_BYTES;
      const extractionContent = truncated
        ? content.slice(0, MAX_CONTENT_BYTES)
        : content;

      if (truncated) {
        this.eventLog.append({
          eventType: "context:content-truncated",
          summary: `Content truncated from ${content.length} to ${MAX_CONTENT_BYTES} bytes for extraction`,
          metadata: { itemId, originalSize: content.length },
        });
      }

      const transcript = isTranscript(extractionContent);
      const prompt = buildPrompt(extractionContent, transcript);

      const responseJson = await this.callHaiku(apiKey, prompt);
      const entries = parseExtractionResponse(responseJson).slice(0, 200);

      if (entries.length === 0) {
        this.repo.updateExtractionStatus(itemId, "stored");
      } else {
        this.repo.insertKnowledge(itemId, entries);
        this.repo.updateExtractionStatus(itemId, "extracted");

        // Regenerate summary for the parent entity
        const scope = item.clientAccountId
          ? { entityType: "client" as const, entityId: item.clientAccountId }
          : { entityType: "project" as const, entityId: item.projectId! };

        const summaryType = scope.entityType === "client" ? "client_profile" : "project_brief";
        const knowledge = this.repo.getKnowledge(scope);
        const summaryContent = buildSummary(knowledge, summaryType);
        const brandColors = extractBrandColors(knowledge);
        this.repo.upsertSummary(scope, summaryType, summaryContent, brandColors.length > 0 ? brandColors : undefined);
      }

      // Telemetry (E8)
      const elapsedMs = Date.now() - startMs;
      const confidences = entries.map((e) => e.confidence);
      this.eventLog.append({
        eventType: "context:extraction-complete",
        summary: `Extracted ${entries.length} facts from "${item.title}"`,
        metadata: {
          itemId,
          inputSizeBytes: extractionContent.length,
          inputTokensEstimate: Math.ceil(extractionContent.length / 4),
          extractionTimeMs: elapsedMs,
          knowledgeCount: entries.length,
          confidenceDistribution: {
            high: confidences.filter((c) => c >= 0.8).length,
            medium: confidences.filter((c) => c >= 0.6 && c < 0.8).length,
            low: confidences.filter((c) => c < 0.6).length,
          },
          model: HAIKU_MODEL,
          isTranscript: transcript,
          truncated,
        },
      });
    } catch (err) {
      this.repo.updateExtractionStatus(itemId, "failed");
      this.eventLog.append({
        eventType: "context:extraction-failed",
        summary: `Extraction failed for "${item.title}": ${err instanceof Error ? err.message : String(err)}`,
        metadata: { itemId, error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  private async callHaiku(apiKey: string, prompt: string, retryCount = 0): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        // Rate limited — backoff and retry once
        if (retryCount < 1) {
          const retryAfter = Math.max(1, Math.min(60, parseFloat(res.headers.get("retry-after") ?? "5") || 5));
          await sleep(retryAfter * 1000);
          return this.callHaiku(apiKey, prompt, retryCount + 1);
        }
        throw new Error("Rate limited after retry");
      }

      if (res.status >= 500) {
        // Server error — retry once
        if (retryCount < 1) {
          await sleep(5000);
          return this.callHaiku(apiKey, prompt, retryCount + 1);
        }
        throw new Error(`Haiku API error: ${res.status}`);
      }

      if (!res.ok) {
        throw new Error(`Haiku API error: ${res.status} ${res.statusText}`);
      }

      const body = (await res.json()) as { content?: Array<{ text?: string }> };
      const text = body?.content?.[0]?.text;
      if (!text) throw new Error("Empty response from Haiku");

      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON array in Haiku response");

      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Timeout — retry once
        if (retryCount < 1) {
          return this.callHaiku(apiKey, prompt, retryCount + 1);
        }
        throw new Error("Haiku API timeout after retry");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ─── Prompt Building ───

function buildPrompt(content: string, isTranscriptContent: boolean): string {
  const baseInstruction = `Extract structured knowledge from the following content. Return a JSON array of objects with these fields:
- "category": one of "business", "technical", "design", "history"
- "key": a short snake_case label (e.g. "pain_points", "tech_stack", "brand_colors")
- "value": the extracted fact as a clear sentence
- "confidence": a number from 0.5 to 1.0 calibrated as:
  - 0.9-1.0: explicit, unambiguous statement
  - 0.7-0.8: clear implication from context
  - 0.5-0.6: reasonable inference
  Do NOT return entries below 0.5 confidence.

Return ONLY the JSON array, no other text.`;

  const transcriptAddendum = isTranscriptContent
    ? `\n\nThis is a meeting transcript. Pay special attention to:
- Client pain points and frustrations expressed
- Technical requirements and constraints mentioned
- Budget, timeline, and stakeholder information
- Previous attempts or failed approaches discussed
- Design preferences and brand references
- Action items and decisions made`
    : "";

  return `${baseInstruction}${transcriptAddendum}

---
${content}`;
}

// ─── Response Parsing ───

interface ExtractedEntry {
  category: string;
  key: string;
  value: string;
  confidence: number;
}

const VALID_CATEGORIES = new Set(["business", "technical", "design", "history"]);

function parseExtractionResponse(json: unknown): ExtractedEntry[] {
  if (!Array.isArray(json)) return [];

  return json.filter((entry): entry is ExtractedEntry => {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.category === "string" &&
      VALID_CATEGORIES.has(e.category) &&
      typeof e.key === "string" &&
      e.key.length > 0 &&
      typeof e.value === "string" &&
      e.value.length > 0 &&
      typeof e.confidence === "number" &&
      e.confidence >= 0.5 &&
      e.confidence <= 1.0
    );
  });
}

// ─── Summary Building ───

function buildSummary(
  knowledge: Array<{ category: string; key: string; value: string; confidence: number; flagged: boolean }>,
  summaryType: string,
): string {
  const unflagged = knowledge.filter((k) => !k.flagged);
  if (unflagged.length === 0) return "No knowledge extracted yet.";

  const byCategory: Record<string, string[]> = {};
  for (const k of unflagged) {
    if (!byCategory[k.category]) byCategory[k.category] = [];
    byCategory[k.category].push(`- ${k.value} (${Math.round(k.confidence * 100)}%)`);
  }

  const sections = Object.entries(byCategory)
    .map(([cat, items]) => `### ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n${items.join("\n")}`)
    .join("\n\n");

  const title = summaryType === "client_profile" ? "Client Profile" : "Project Brief";
  return `# ${title}\n\n${sections}`;
}

function extractBrandColors(
  knowledge: Array<{ category: string; key: string; value: string }>,
): string[] {
  const colorEntries = knowledge.filter(
    (k) => k.category === "design" && k.key === "brand_colors",
  );
  const hexPattern = /#[0-9a-fA-F]{6}/g;
  const colors: string[] = [];
  for (const entry of colorEntries) {
    const matches = entry.value.match(hexPattern);
    if (matches) colors.push(...matches);
  }
  return [...new Set(colors)];
}

// ─── Utility ───

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
